/**
 * WebSocket Handler
 *
 * Handles incoming WebSocket connections from agents.
 */

import { WebSocket } from 'ws';
import { IncomingMessage } from 'http';
import { AgentMessage, ConnectedAgent } from './types';
import { NetworkUtils } from './network';
import { LocalAgentRegistry } from './agent-registry';
import { checkLicenseStatus } from './db-service';

/**
 * Handle a new agent WebSocket connection
 */
export function handleAgentConnection(
  socket: WebSocket,
  req: IncomingMessage,
  registry: LocalAgentRegistry
): void {
  const remoteAddress = NetworkUtils.getClientIP(req);
  console.log(`[WS] New connection from ${remoteAddress}`);

  let agent: ConnectedAgent | null = null;

  // Handle incoming messages
  socket.on('message', async (data) => {
    try {
      const msg: AgentMessage = JSON.parse(data.toString());

      switch (msg.type) {
        case 'register':
          agent = await registry.register(socket, msg, remoteAddress);
          if (agent) {
            socket.send(
              JSON.stringify({
                type: 'registered',
                id: agent.id,
                agentId: agent.dbId || agent.id,
                licenseStatus: agent.licenseStatus || 'pending',
                licenseUuid: agent.licenseUuid,
                state: agent.state,
                powerState: agent.powerState,
                config: {
                  heartbeatInterval: getHeartbeatInterval(agent.powerState),
                  graceHours: 72, // 72-hour grace period for network issues
                },
              })
            );
          } else {
            socket.send(
              JSON.stringify({
                type: 'error',
                error: 'Registration failed',
              })
            );
            socket.close(4000, 'Registration failed');
          }
          break;

        case 'response':
        case 'error':
          if (agent) {
            registry.handleResponse(agent, msg);
          }
          break;

        case 'pong':
          if (agent) {
            registry.updatePing(agent);
          }
          break;

        case 'heartbeat':
          if (agent) {
            registry.updatePing(agent);
            // Update state if provided
            if (msg.powerState || msg.isScreenLocked !== undefined || msg.currentTask) {
              await registry.updateState(agent, {
                powerState: msg.powerState || agent.powerState,
                isScreenLocked: msg.isScreenLocked ?? agent.isScreenLocked,
                currentTask: msg.currentTask,
              });
            }

            // Check license status on heartbeat (1.2.4)
            if (agent.dbId) {
              try {
                const licenseCheck = await checkLicenseStatus(agent.dbId);

                // Check if there are pending commands for this agent
                const hasPendingCommands = registry.hasPendingQueuedCommands(agent.id);

                // Send heartbeat_ack with license status and pending commands flag
                socket.send(
                  JSON.stringify({
                    type: 'heartbeat_ack',
                    id: msg.id,
                    licenseStatus: licenseCheck.licenseStatus,
                    licenseChanged: licenseCheck.changed,
                    licenseMessage: licenseCheck.message,
                    pendingCommands: hasPendingCommands, // (1.2.19)
                    config: licenseCheck.changed
                      ? {
                          heartbeatInterval: getHeartbeatInterval(agent.powerState),
                          state: licenseCheck.licenseStatus === 'active' ? 'ACTIVE' : 'DEGRADED',
                        }
                      : undefined,
                  })
                );

                // Update agent's license status in memory if changed
                if (licenseCheck.changed) {
                  agent.licenseStatus = licenseCheck.licenseStatus;
                  agent.state = licenseCheck.licenseStatus === 'active' ? 'ACTIVE' :
                               licenseCheck.licenseStatus === 'expired' ? 'EXPIRED' :
                               licenseCheck.licenseStatus === 'blocked' ? 'BLOCKED' : 'PENDING';
                }
              } catch (err) {
                console.error('[WS] License check error:', err);
              }
            }
          }
          break;

        case 'state_change':
          if (agent) {
            const previousPowerState = agent.powerState;

            await registry.updateState(agent, {
              powerState: msg.powerState || agent.powerState,
              isScreenLocked: msg.isScreenLocked ?? agent.isScreenLocked,
              currentTask: msg.currentTask,
            });

            // If power state changed, send new config
            if (msg.powerState && msg.powerState !== previousPowerState) {
              socket.send(
                JSON.stringify({
                  type: 'config',
                  id: crypto.randomUUID(),
                  config: {
                    heartbeatInterval: getHeartbeatInterval(msg.powerState),
                    powerState: msg.powerState,
                  },
                })
              );

              // If agent just woke up (was SLEEP, now ACTIVE or PASSIVE), process queued commands
              if (previousPowerState === 'SLEEP' && (msg.powerState === 'ACTIVE' || msg.powerState === 'PASSIVE')) {
                console.log(`[WS] Agent ${agent.machineName || agent.machineId} woke up, checking queued commands`);
                // Process asynchronously to not block
                registry.processQueuedCommands(agent.id).catch((err) => {
                  console.error('[WS] Error processing queued commands:', err);
                });
              }
            }
          }
          break;

        default:
          console.warn(`[WS] Unknown message type: ${msg.type}`);
      }
    } catch (e) {
      console.error('[WS] Message parse error:', e);
    }
  });

  // Handle disconnect
  socket.on('close', async (code, reason) => {
    if (agent) {
      await registry.unregister(agent.id);
    }
    console.log(`[WS] Connection closed: ${code} ${reason.toString()}`);
  });

  // Handle errors
  socket.on('error', (err) => {
    console.error('[WS] Socket error:', err);
  });
}

/**
 * Get heartbeat interval based on power state
 */
function getHeartbeatInterval(powerState: ConnectedAgent['powerState']): number {
  switch (powerState) {
    case 'ACTIVE':
      return 5000; // 5 seconds
    case 'PASSIVE':
      return 30000; // 30 seconds
    case 'SLEEP':
      return 300000; // 5 minutes
    default:
      return 30000;
  }
}
