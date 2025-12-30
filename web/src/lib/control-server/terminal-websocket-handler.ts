/**
 * Terminal WebSocket Handler
 *
 * Handles WebSocket connections from terminal viewers.
 */

import { WebSocket, RawData } from 'ws';
import { IncomingMessage } from 'http';
import { terminalSessionManager } from './terminal-session-manager';

interface TerminalMessage {
  type: 'terminal_start' | 'terminal_input' | 'terminal_resize' | 'ping';
  sessionToken?: string;
  data?: string;
  cols?: number;
  rows?: number;
}

/**
 * Handle a terminal viewer WebSocket connection
 */
export function handleTerminalConnection(
  socket: WebSocket,
  req: IncomingMessage
): void {
  const remoteAddress = getClientIP(req);
  console.log(`[TerminalWS] New connection from ${remoteAddress}`);

  let sessionCreated = false;

  // Handle incoming messages
  socket.on('message', async (data: RawData) => {
    try {
      const msg: TerminalMessage = JSON.parse(data.toString());

      switch (msg.type) {
        case 'terminal_start':
          if (!msg.sessionToken) {
            socket.send(JSON.stringify({
              type: 'error',
              error: 'Session token required',
            }));
            socket.close(4001, 'Session token required');
            return;
          }

          const result = await terminalSessionManager.createSession(
            socket,
            msg.sessionToken,
            remoteAddress
          );

          if ('error' in result) {
            socket.send(JSON.stringify({
              type: 'error',
              error: result.error,
            }));
            socket.close(4002, result.error);
            return;
          }

          sessionCreated = true;
          socket.send(JSON.stringify({
            type: 'terminal_started',
            sessionId: result.session.id,
          }));
          break;

        case 'terminal_input':
          if (!sessionCreated) {
            socket.send(JSON.stringify({
              type: 'error',
              error: 'Session not started',
            }));
            return;
          }

          if (msg.data) {
            await terminalSessionManager.handleViewerInput(socket, msg.data);
          }
          break;

        case 'terminal_resize':
          if (!sessionCreated) return;

          if (msg.cols && msg.rows) {
            await terminalSessionManager.handleResize(socket, msg.cols, msg.rows);
          }
          break;

        case 'ping':
          socket.send(JSON.stringify({ type: 'pong' }));
          break;

        default:
          console.warn(`[TerminalWS] Unknown message type: ${msg.type}`);
      }
    } catch (e) {
      console.error('[TerminalWS] Message parse error:', e);
      socket.send(JSON.stringify({
        type: 'error',
        error: 'Invalid message format',
      }));
    }
  });

  // Handle disconnect
  socket.on('close', (code, reason) => {
    terminalSessionManager.handleViewerDisconnect(socket);
    console.log(`[TerminalWS] Connection closed: ${code} ${reason.toString()}`);
  });

  // Handle errors
  socket.on('error', (err) => {
    console.error('[TerminalWS] Socket error:', err);
  });
}

/**
 * Get client IP from request
 */
function getClientIP(req: IncomingMessage): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    const first = Array.isArray(forwarded) ? forwarded[0] : forwarded.split(',')[0];
    return first.trim();
  }
  return req.socket.remoteAddress || 'unknown';
}
