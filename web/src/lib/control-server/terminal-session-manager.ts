/**
 * Terminal Session Manager
 *
 * Manages terminal sessions for headless agents.
 * Each session maintains a WebSocket connection to the viewer
 * and routes input/output to/from the agent's shell.
 */

import { WebSocket } from 'ws';
import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';
import { agentRegistry } from './agent-registry';

interface TerminalSession {
  id: string;
  agentId: string;
  agentConnectionId: string;
  agentSessionId: string;  // The shell session ID on the agent
  viewerSocket: WebSocket;
  viewerAddress: string;
  userId: string;
  createdAt: Date;
  lastActivity: Date;
  pollTimer?: NodeJS.Timeout;  // Timer for polling output
}

interface SessionToken {
  token: string;
  agentId: string;
  userId: string;
  remoteAddress: string;
  createdAt: Date;
  expiresAt: Date;
}

class TerminalSessionManager {
  private sessions = new Map<string, TerminalSession>();
  private sessionsByViewer = new Map<WebSocket, string>(); // viewer socket -> session id
  private sessionTokens = new Map<string, SessionToken>();

  /**
   * Create a session token for a terminal connection
   */
  createSessionToken(params: {
    agentId: string;
    userId: string;
    remoteAddress: string;
  }): { token: string; expiresAt: Date } | { error: string } {
    // Check if agent is connected
    const connectedAgent = agentRegistry.getAgentByDbId(params.agentId);
    if (!connectedAgent) {
      return { error: 'Agent is not connected' };
    }

    // Generate secure token
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minute expiry

    this.sessionTokens.set(token, {
      token,
      agentId: params.agentId,
      userId: params.userId,
      remoteAddress: params.remoteAddress,
      createdAt: new Date(),
      expiresAt,
    });

    // Clean up expired tokens periodically
    this.cleanupExpiredTokens();

    return { token, expiresAt };
  }

  /**
   * Validate session token and create terminal session
   */
  async createSession(
    viewerSocket: WebSocket,
    token: string,
    viewerAddress: string
  ): Promise<{ session: TerminalSession } | { error: string }> {
    // Validate token
    const tokenData = this.sessionTokens.get(token);
    if (!tokenData) {
      return { error: 'Invalid token' };
    }

    // Check expiry
    if (new Date() > tokenData.expiresAt) {
      this.sessionTokens.delete(token);
      return { error: 'Token expired' };
    }

    // Remove used token (one-time use)
    this.sessionTokens.delete(token);

    // Get agent connection
    const connectedAgent = agentRegistry.getAgentByDbId(tokenData.agentId);
    if (!connectedAgent) {
      return { error: 'Agent is not connected' };
    }

    // Start shell session on agent first
    let agentSessionId: string;
    try {
      const result = await agentRegistry.sendCommand(connectedAgent.id, 'terminal_start', {
        shell: '/bin/bash', // Default to bash
        cwd: '',
      }) as { success: boolean; sessionId?: string; error?: string };

      if (!result.success || !result.sessionId) {
        return { error: `Failed to start terminal on agent: ${result.error || 'No session ID returned'}` };
      }
      agentSessionId = result.sessionId;
    } catch (err) {
      return { error: `Failed to start terminal on agent: ${err}` };
    }

    // Create session
    const sessionId = uuidv4();
    const session: TerminalSession = {
      id: sessionId,
      agentId: tokenData.agentId,
      agentConnectionId: connectedAgent.id,
      agentSessionId,
      viewerSocket,
      viewerAddress,
      userId: tokenData.userId,
      createdAt: new Date(),
      lastActivity: new Date(),
    };

    this.sessions.set(sessionId, session);
    this.sessionsByViewer.set(viewerSocket, sessionId);

    // Start polling for output
    this.startOutputPolling(session);

    console.log(
      `[TerminalSession] Created session ${sessionId} (agent session: ${agentSessionId}) for agent ${connectedAgent.machineName || connectedAgent.machineId}`
    );

    return { session };
  }

  /**
   * Start polling for output from the agent's shell session
   */
  private startOutputPolling(session: TerminalSession): void {
    // Poll every 100ms for output
    const pollInterval = 100;

    const poll = async () => {
      // Check if session still exists
      if (!this.sessions.has(session.id)) {
        return;
      }

      try {
        const result = await agentRegistry.sendCommand(session.agentConnectionId, 'terminal_output', {
          sessionId: session.agentSessionId,
        }) as { success: boolean; data?: string; error?: string };

        if (result.success && result.data && result.data.length > 0) {
          // Send output to viewer
          if (session.viewerSocket.readyState === WebSocket.OPEN) {
            session.viewerSocket.send(JSON.stringify({
              type: 'terminal_output',
              sessionId: session.id,
              data: result.data,
            }));
          }
        }
      } catch (err) {
        // Session may have ended, ignore errors
      }

      // Schedule next poll if session still exists
      if (this.sessions.has(session.id)) {
        session.pollTimer = setTimeout(poll, pollInterval);
      }
    };

    // Start polling
    session.pollTimer = setTimeout(poll, pollInterval);
  }

  /**
   * Stop polling for a session
   */
  private stopOutputPolling(session: TerminalSession): void {
    if (session.pollTimer) {
      clearTimeout(session.pollTimer);
      session.pollTimer = undefined;
    }
  }

  /**
   * Handle input from viewer
   */
  async handleViewerInput(viewerSocket: WebSocket, data: string): Promise<void> {
    const sessionId = this.sessionsByViewer.get(viewerSocket);
    if (!sessionId) return;

    const session = this.sessions.get(sessionId);
    if (!session) return;

    session.lastActivity = new Date();

    // Forward input to agent's shell session
    try {
      await agentRegistry.sendCommand(session.agentConnectionId, 'terminal_input', {
        sessionId: session.agentSessionId,
        data,
      });
    } catch (err) {
      console.error(`[TerminalSession] Failed to send input to agent:`, err);
    }
  }

  /**
   * Handle output from agent
   */
  handleAgentOutput(agentConnectionId: string, sessionId: string, data: string): void {
    const session = this.sessions.get(sessionId);
    if (!session || session.agentConnectionId !== agentConnectionId) return;

    session.lastActivity = new Date();

    // Forward output to viewer
    if (session.viewerSocket.readyState === WebSocket.OPEN) {
      session.viewerSocket.send(JSON.stringify({
        type: 'terminal_output',
        sessionId,
        data,
      }));
    }
  }

  /**
   * Handle terminal resize from viewer
   */
  async handleResize(viewerSocket: WebSocket, cols: number, rows: number): Promise<void> {
    const sessionId = this.sessionsByViewer.get(viewerSocket);
    if (!sessionId) return;

    const session = this.sessions.get(sessionId);
    if (!session) return;

    // Forward resize to agent
    try {
      await agentRegistry.sendCommand(session.agentConnectionId, 'terminal_resize', {
        sessionId,
        cols,
        rows,
      });
    } catch (err) {
      console.error(`[TerminalSession] Failed to send resize to agent:`, err);
    }
  }

  /**
   * Close session
   */
  async closeSession(sessionId: string, reason?: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    // Stop output polling
    this.stopOutputPolling(session);

    // Notify agent to stop terminal
    try {
      await agentRegistry.sendCommand(session.agentConnectionId, 'terminal_stop', {
        sessionId: session.agentSessionId,
      });
    } catch (err) {
      // Ignore errors during cleanup
    }

    // Notify viewer
    if (session.viewerSocket.readyState === WebSocket.OPEN) {
      session.viewerSocket.send(JSON.stringify({
        type: 'terminal_stopped',
        sessionId,
        reason,
      }));
    }

    // Clean up
    this.sessions.delete(sessionId);
    this.sessionsByViewer.delete(session.viewerSocket);

    console.log(`[TerminalSession] Closed session ${sessionId}: ${reason || 'normal'}`);
  }

  /**
   * Handle viewer disconnect
   */
  handleViewerDisconnect(viewerSocket: WebSocket): void {
    const sessionId = this.sessionsByViewer.get(viewerSocket);
    if (sessionId) {
      this.closeSession(sessionId, 'Viewer disconnected');
    }
  }

  /**
   * Handle agent disconnect - close all sessions for that agent
   */
  handleAgentDisconnect(agentConnectionId: string): void {
    for (const [sessionId, session] of this.sessions) {
      if (session.agentConnectionId === agentConnectionId) {
        // Stop output polling
        this.stopOutputPolling(session);

        // Notify viewer
        if (session.viewerSocket.readyState === WebSocket.OPEN) {
          session.viewerSocket.send(JSON.stringify({
            type: 'terminal_stopped',
            sessionId,
            reason: 'Agent disconnected',
          }));
        }

        this.sessions.delete(sessionId);
        this.sessionsByViewer.delete(session.viewerSocket);
      }
    }
  }

  /**
   * Get session by ID
   */
  getSession(sessionId: string): TerminalSession | undefined {
    return this.sessions.get(sessionId);
  }

  /**
   * Get session for viewer
   */
  getSessionForViewer(viewerSocket: WebSocket): TerminalSession | undefined {
    const sessionId = this.sessionsByViewer.get(viewerSocket);
    if (!sessionId) return undefined;
    return this.sessions.get(sessionId);
  }

  /**
   * Get stats
   */
  getStats(): {
    activeSessions: number;
    pendingTokens: number;
  } {
    return {
      activeSessions: this.sessions.size,
      pendingTokens: this.sessionTokens.size,
    };
  }

  /**
   * Clean up expired tokens
   */
  private cleanupExpiredTokens(): void {
    const now = new Date();
    for (const [token, data] of this.sessionTokens) {
      if (now > data.expiresAt) {
        this.sessionTokens.delete(token);
      }
    }
  }
}

// Singleton instance
export const terminalSessionManager = new TerminalSessionManager();
