/**
 * Agent Registry
 *
 * Manages connected agents in memory with database persistence.
 * This is the "local" implementation - for horizontal scaling,
 * a Redis-based implementation would replace this.
 */

import { WebSocket } from 'ws';
import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';
import {
  ConnectedAgent,
  AgentMessage,
  CommandMessage,
  IAgentRegistry,
  OSType,
} from './types';
import { NetworkUtils } from './network';
import {
  findOrCreateAgent,
  markAgentOnline,
  markAgentOffline,
  updateAgentHeartbeat,
  logCommand,
  updateCommandLog,
} from './db-service';

class LocalAgentRegistry implements IAgentRegistry {
  private agents = new Map<string, ConnectedAgent>();
  private agentsByMachineId = new Map<string, string>(); // machineId -> agentId
  private agentsByDbId = new Map<string, string>(); // dbId -> connectionId
  private sessionIds = new Map<string, string>(); // connectionId -> sessionId

  /**
   * Register a new agent connection
   */
  async register(
    socket: WebSocket,
    msg: AgentMessage,
    remoteAddress: string
  ): Promise<ConnectedAgent | null> {
    // Validate required fields
    if (!msg.machineId) {
      console.error('[Registry] Registration failed: missing machineId');
      return null;
    }

    const isInternal = NetworkUtils.isInternalIP(remoteAddress);
    const connectionId = uuidv4();

    // Check for existing connection from same machine
    const existingConnectionId = this.agentsByMachineId.get(msg.machineId);
    if (existingConnectionId) {
      const existingAgent = this.agents.get(existingConnectionId);
      if (existingAgent) {
        console.log(`[Registry] Existing connection for machine ${msg.machineId}, closing old connection`);
        existingAgent.socket.close(1000, 'New connection from same machine');
        await this.unregister(existingConnectionId);
      }
    }

    // Parse OS type
    let osType: OSType = 'MACOS';
    if (msg.osType) {
      const osLower = msg.osType.toLowerCase();
      if (osLower.includes('windows') || osLower === 'win32') {
        osType = 'WINDOWS';
      } else if (osLower.includes('linux')) {
        osType = 'LINUX';
      }
    }

    // Database: Find or create agent record
    let dbResult: {
      agentDbId: string;
      licenseStatus: 'active' | 'pending' | 'expired' | 'blocked';
      licenseUuid: string | null;
      isNew: boolean;
    };

    try {
      dbResult = await findOrCreateAgent(msg, remoteAddress);
    } catch (err) {
      console.error('[Registry] Database error during registration:', err);
      // Continue without DB persistence for now
      dbResult = {
        agentDbId: connectionId,
        licenseStatus: 'pending',
        licenseUuid: null,
        isNew: true,
      };
    }

    // Map license status to agent state
    const state = this.mapLicenseStatusToState(dbResult.licenseStatus);

    const agent: ConnectedAgent = {
      id: connectionId,
      dbId: dbResult.agentDbId,
      socket,
      remoteAddress,
      isInternal,

      customerId: msg.customerId,
      licenseUuid: dbResult.licenseUuid || msg.licenseUuid,
      machineId: msg.machineId,
      machineName: msg.machineName || msg.fingerprint?.hostname,

      osType,
      osVersion: msg.osVersion,
      arch: msg.arch,
      agentVersion: msg.agentVersion,

      fingerprint: msg.fingerprint ? this.computeFingerprint(msg.fingerprint) : undefined,
      fingerprintRaw: msg.fingerprint,

      state,
      licenseStatus: dbResult.licenseStatus,
      powerState: 'PASSIVE',
      isScreenLocked: false,

      connectedAt: new Date(),
      lastPing: new Date(),
      lastActivity: new Date(),

      pendingRequests: new Map(),
    };

    // Store in memory indexes
    this.agents.set(connectionId, agent);
    if (msg.machineId) {
      this.agentsByMachineId.set(msg.machineId, connectionId);
    }
    this.agentsByDbId.set(dbResult.agentDbId, connectionId);

    // Database: Mark agent online and create session
    try {
      const sessionId = await markAgentOnline(dbResult.agentDbId, {
        ipAddress: remoteAddress,
        powerState: 'PASSIVE',
      });
      this.sessionIds.set(connectionId, sessionId);
    } catch (err) {
      console.error('[Registry] Failed to create session:', err);
    }

    console.log(
      `[Registry] Agent registered: ${agent.machineName || agent.machineId} ` +
      `(${agent.osType}) from ${remoteAddress} ` +
      `[${isInternal ? 'INTERNAL' : 'EXTERNAL'}] ` +
      `[${agent.state}] [${dbResult.isNew ? 'NEW' : 'EXISTING'}]`
    );

    return agent;
  }

  /**
   * Unregister an agent connection
   */
  async unregister(connectionId: string): Promise<void> {
    const agent = this.agents.get(connectionId);
    if (!agent) return;

    // Cancel all pending requests
    for (const [, pending] of agent.pendingRequests) {
      clearTimeout(pending.timeout);
      pending.reject(new Error('Agent disconnected'));
    }

    // Database: Mark agent offline
    if (agent.dbId) {
      try {
        const sessionId = this.sessionIds.get(connectionId);
        await markAgentOffline(agent.dbId, sessionId);
      } catch (err) {
        console.error('[Registry] Failed to mark agent offline:', err);
      }
    }

    // Remove from indexes
    if (agent.machineId) {
      this.agentsByMachineId.delete(agent.machineId);
    }
    if (agent.dbId) {
      this.agentsByDbId.delete(agent.dbId);
    }
    this.sessionIds.delete(connectionId);
    this.agents.delete(connectionId);

    console.log(`[Registry] Agent unregistered: ${agent.machineName || agent.machineId}`);
  }

  /**
   * Get an agent by connection ID
   */
  getAgent(agentId: string): ConnectedAgent | undefined {
    // Try connection ID first
    let agent = this.agents.get(agentId);
    if (agent) return agent;

    // Try database ID
    const connectionId = this.agentsByDbId.get(agentId);
    if (connectionId) {
      return this.agents.get(connectionId);
    }

    return undefined;
  }

  /**
   * Get an agent by machine ID
   */
  getAgentByMachineId(machineId: string): ConnectedAgent | undefined {
    const agentId = this.agentsByMachineId.get(machineId);
    return agentId ? this.agents.get(agentId) : undefined;
  }

  /**
   * Get all agents for a customer
   */
  getAgentsByCustomerId(customerId: string): ConnectedAgent[] {
    return Array.from(this.agents.values()).filter(
      (agent) => agent.customerId === customerId
    );
  }

  /**
   * Get all connected agents
   */
  getAllAgents(): ConnectedAgent[] {
    return Array.from(this.agents.values());
  }

  /**
   * Find agent by WebSocket
   */
  findAgentBySocket(socket: WebSocket): ConnectedAgent | undefined {
    for (const agent of this.agents.values()) {
      if (agent.socket === socket) return agent;
    }
    return undefined;
  }

  /**
   * Send a command to an agent and wait for response
   */
  async sendCommand(
    agentId: string,
    method: string,
    params: Record<string, unknown> = {},
    context?: { aiConnectionId?: string; ipAddress?: string }
  ): Promise<unknown> {
    const agent = this.getAgent(agentId);
    if (!agent) {
      throw new Error(`Agent not found: ${agentId}`);
    }

    if (agent.socket.readyState !== WebSocket.OPEN) {
      throw new Error(`Agent not connected: ${agentId}`);
    }

    const requestId = uuidv4();
    const message: CommandMessage = {
      type: 'request',
      id: requestId,
      method,
      params,
    };

    // Database: Log the command
    let commandLogId: string | undefined;
    if (agent.dbId) {
      try {
        commandLogId = await logCommand({
          agentId: agent.dbId,
          aiConnectionId: context?.aiConnectionId,
          method,
          params,
          toolName: method === 'tools/call' ? (params.name as string) : undefined,
          ipAddress: context?.ipAddress,
        });
      } catch (err) {
        console.error('[Registry] Failed to log command:', err);
      }
    }

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(async () => {
        agent.pendingRequests.delete(requestId);

        // Database: Update command log with timeout
        if (commandLogId) {
          try {
            await updateCommandLog(commandLogId, { status: 'TIMEOUT' });
          } catch (err) {
            console.error('[Registry] Failed to update command log:', err);
          }
        }

        reject(new Error('Request timeout'));
      }, 30000);

      agent.pendingRequests.set(requestId, {
        resolve: async (result: unknown) => {
          // Database: Update command log with success
          if (commandLogId) {
            try {
              await updateCommandLog(commandLogId, {
                status: 'COMPLETED',
                result,
              });
            } catch (err) {
              console.error('[Registry] Failed to update command log:', err);
            }
          }
          resolve(result);
        },
        reject: async (error: Error) => {
          // Database: Update command log with failure
          if (commandLogId) {
            try {
              await updateCommandLog(commandLogId, {
                status: 'FAILED',
                errorMessage: error.message,
              });
            } catch (err) {
              console.error('[Registry] Failed to update command log:', err);
            }
          }
          reject(error);
        },
        timeout,
        startedAt: new Date(),
      });

      agent.socket.send(JSON.stringify(message));
    });
  }

  /**
   * Handle response from agent
   */
  handleResponse(agent: ConnectedAgent, msg: AgentMessage): void {
    if (!msg.id) return;

    const pending = agent.pendingRequests.get(msg.id);
    if (!pending) return;

    clearTimeout(pending.timeout);
    agent.pendingRequests.delete(msg.id);

    if (msg.type === 'error') {
      pending.reject(new Error(msg.error || 'Unknown error'));
    } else {
      pending.resolve(msg.result);
    }
  }

  /**
   * Update agent's last ping time
   */
  updatePing(agent: ConnectedAgent): void {
    agent.lastPing = new Date();
  }

  /**
   * Update agent state
   */
  async updateState(agent: ConnectedAgent, state: Partial<ConnectedAgent>): Promise<void> {
    Object.assign(agent, state);
    agent.lastActivity = new Date();

    // Database: Update heartbeat
    if (agent.dbId) {
      try {
        await updateAgentHeartbeat(agent.dbId, {
          powerState: state.powerState || agent.powerState,
          isScreenLocked: state.isScreenLocked ?? agent.isScreenLocked,
          currentTask: state.currentTask,
        });
      } catch (err) {
        console.error('[Registry] Failed to update agent heartbeat:', err);
      }
    }
  }

  /**
   * Cleanup all connections
   */
  async cleanup(): Promise<void> {
    const promises: Promise<void>[] = [];

    for (const [id, agent] of this.agents) {
      for (const [, pending] of agent.pendingRequests) {
        clearTimeout(pending.timeout);
        pending.reject(new Error('Server shutting down'));
      }
      agent.socket.close(1000, 'Server shutting down');

      // Mark offline in database
      if (agent.dbId) {
        const sessionId = this.sessionIds.get(id);
        promises.push(
          markAgentOffline(agent.dbId, sessionId).catch((err) =>
            console.error('[Registry] Failed to mark agent offline:', err)
          )
        );
      }

      this.agents.delete(id);
    }

    await Promise.all(promises);

    this.agentsByMachineId.clear();
    this.agentsByDbId.clear();
    this.sessionIds.clear();

    console.log('[Registry] All agents cleaned up');
  }

  /**
   * Compute fingerprint hash from raw fingerprint data
   */
  private computeFingerprint(data: ConnectedAgent['fingerprintRaw']): string {
    if (!data) return '';

    const parts = [
      data.cpuModel || '',
      data.diskSerial || '',
      data.motherboardUuid || '',
      ...(data.macAddresses || []).sort(),
    ].filter(Boolean);

    if (parts.length === 0) return '';

    return crypto
      .createHash('sha256')
      .update(parts.join('|'))
      .digest('hex');
  }

  /**
   * Map license status to agent state
   */
  private mapLicenseStatusToState(
    status: 'active' | 'pending' | 'expired' | 'blocked'
  ): ConnectedAgent['state'] {
    switch (status) {
      case 'active':
        return 'ACTIVE';
      case 'expired':
        return 'EXPIRED';
      case 'blocked':
        return 'BLOCKED';
      default:
        return 'PENDING';
    }
  }

  /**
   * Get connection statistics
   */
  getStats(): {
    totalConnected: number;
    byState: Record<string, number>;
    byPowerState: Record<string, number>;
    byOS: Record<string, number>;
  } {
    const stats = {
      totalConnected: this.agents.size,
      byState: {} as Record<string, number>,
      byPowerState: {} as Record<string, number>,
      byOS: {} as Record<string, number>,
    };

    for (const agent of this.agents.values()) {
      stats.byState[agent.state] = (stats.byState[agent.state] || 0) + 1;
      stats.byPowerState[agent.powerState] = (stats.byPowerState[agent.powerState] || 0) + 1;
      stats.byOS[agent.osType] = (stats.byOS[agent.osType] || 0) + 1;
    }

    return stats;
  }
}

// Singleton instance
export const agentRegistry = new LocalAgentRegistry();
export { LocalAgentRegistry };
