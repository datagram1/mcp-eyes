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
          }
          break;

        case 'state_change':
          if (agent) {
            await registry.updateState(agent, {
              powerState: msg.powerState || agent.powerState,
              isScreenLocked: msg.isScreenLocked ?? agent.isScreenLocked,
              currentTask: msg.currentTask,
            });

            // If power state changed, send new config
            if (msg.powerState && msg.powerState !== agent.powerState) {
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
