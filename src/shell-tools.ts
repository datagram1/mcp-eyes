#!/usr/bin/env node

/**
 * Shell Tools
 * 
 * Implements shell primitives for MCP agent:
 * - shell_exec: Run a command and return output when it finishes
 * - shell_start_session: Start an interactive or long-running command session
 * - shell_send_input: Send input to a running shell session
 * - shell_stop_session: Stop/terminate a running session
 * 
 * Supports SSE event streaming for session output.
 */

import { spawn, exec, ChildProcess } from 'child_process';
import { EventEmitter } from 'events';
import { promisify } from 'util';
import * as os from 'os';
import * as path from 'path';

const execAsync = promisify(exec);

interface ShellSession {
  sessionId: string;
  process: ChildProcess;
  command: string;
  cwd?: string;
  startedAt: Date;
  pid: number;
  captureStderr: boolean;
  timeout?: NodeJS.Timeout;
}

export class ShellTools extends EventEmitter {
  private sessions: Map<string, ShellSession> = new Map();
  private maxConcurrentSessions = 10;
  private sessionTimeout = 3600000; // 1 hour in milliseconds

  constructor() {
    super();
    this.startSessionCleanup();
  }

  /**
   * shell_exec: Run a command and return output when it finishes
   */
  async executeCommand(params: {
    command: string;
    cwd?: string | null;
    timeout_seconds?: number;
    capture_stderr?: boolean;
  }): Promise<{
    exit_code: number;
    stdout: string;
    stderr: string;
    truncated?: boolean;
  }> {
    const command = params.command;
    const cwd = params.cwd || process.cwd();
    const timeoutSeconds = params.timeout_seconds ?? 600;
    const captureStderr = params.capture_stderr ?? true;

    // Determine shell based on platform
    const shell = os.platform() === 'win32' ? 'cmd.exe' : 'sh';
    const shellArgs = os.platform() === 'win32' ? ['/c', command] : ['-c', command];

    return new Promise((resolve, reject) => {
      const process = spawn(shell, shellArgs, {
        cwd: cwd || undefined,
        stdio: ['ignore', 'pipe', captureStderr ? 'pipe' : 'ignore'],
      });

      let stdout = '';
      let stderr = '';
      let truncated = false;
      const maxOutputSize = 10 * 1024 * 1024; // 10MB limit

      process.stdout?.on('data', (data: Buffer) => {
        const chunk = data.toString();
        if (stdout.length + chunk.length > maxOutputSize) {
          truncated = true;
          return;
        }
        stdout += chunk;
      });

      if (captureStderr) {
        process.stderr?.on('data', (data: Buffer) => {
          const chunk = data.toString();
          if (stderr.length + chunk.length > maxOutputSize) {
            truncated = true;
            return;
          }
          stderr += chunk;
        });
      }

      const timeout = setTimeout(() => {
        process.kill('SIGTERM');
        reject(new Error(`Command timeout after ${timeoutSeconds} seconds`));
      }, timeoutSeconds * 1000);

      process.on('close', (code) => {
        clearTimeout(timeout);
        resolve({
          exit_code: code || 0,
          stdout,
          stderr,
          truncated,
        });
      });

      process.on('error', (error) => {
        clearTimeout(timeout);
        reject(error);
      });
    });
  }

  /**
   * shell_start_session: Start an interactive or long-running command session
   */
  startSession(params: {
    command: string;
    cwd?: string | null;
    env?: Record<string, string>;
    capture_stderr?: boolean;
  }): {
    session_id: string;
    pid: number;
  } {
    // Check max concurrent sessions
    if (this.sessions.size >= this.maxConcurrentSessions) {
      throw new Error(`Maximum concurrent sessions (${this.maxConcurrentSessions}) reached`);
    }

    const sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const command = params.command;
    const workingDir = params.cwd || process.cwd();
    const envVars = { ...process.env, ...params.env };
    const captureStderr = params.capture_stderr ?? true;

    // Determine shell based on platform
    const shell = os.platform() === 'win32' ? 'cmd.exe' : 'sh';
    const shellArgs = os.platform() === 'win32' ? ['/c', command] : ['-c', command];

    const childProcess = spawn(shell, shellArgs, {
      cwd: workingDir || undefined,
      env: envVars,
      stdio: ['pipe', 'pipe', captureStderr ? 'pipe' : 'ignore'],
    });

    const session: ShellSession = {
      sessionId,
      process: childProcess,
      command,
      cwd: workingDir || undefined,
      startedAt: new Date(),
      pid: childProcess.pid!,
      captureStderr,
    };

    // Set up stdout listener
    childProcess.stdout?.on('data', (data: Buffer) => {
      const chunk = data.toString();
      this.emit('shell_session_output', {
        session_id: sessionId,
        stream: 'stdout',
        chunk,
      });
    });

    // Set up stderr listener
    if (captureStderr && childProcess.stderr) {
      childProcess.stderr.on('data', (data: Buffer) => {
        const chunk = data.toString();
        this.emit('shell_session_output', {
          session_id: sessionId,
          stream: 'stderr',
          chunk,
        });
      });
    }

    // Set up exit listener
    childProcess.on('close', (code: number | null) => {
      this.emit('shell_session_exit', {
        session_id: sessionId,
        exit_code: code || 0,
      });
      this.cleanupSession(sessionId);
    });

    childProcess.on('error', (error: Error) => {
      this.emit('shell_session_exit', {
        session_id: sessionId,
        exit_code: -1,
        error: error.message,
      });
      this.cleanupSession(sessionId);
    });

    // Set session timeout
    session.timeout = setTimeout(() => {
      this.stopSession(sessionId, 'TERM');
    }, this.sessionTimeout);

    this.sessions.set(sessionId, session);

    return {
      session_id: sessionId,
      pid: session.pid,
    };
  }

  /**
   * shell_send_input: Send input to a running shell session
   */
  sendInput(sessionId: string, input: string): {
    session_id: string;
    bytes_written: number;
  } {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    if (!session.process.stdin) {
      throw new Error(`Session ${sessionId} stdin is not available`);
    }

    if (session.process.stdin.destroyed) {
      throw new Error(`Session ${sessionId} stdin is closed`);
    }

    const bytesWritten = Buffer.byteLength(input, 'utf-8');
    session.process.stdin.write(input, 'utf-8');

    return {
      session_id: sessionId,
      bytes_written: bytesWritten,
    };
  }

  /**
   * shell_stop_session: Stop/terminate a running session
   */
  stopSession(sessionId: string, signal: string = 'TERM'): {
    session_id: string;
    stopped: boolean;
  } {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    // Clear timeout
    if (session.timeout) {
      clearTimeout(session.timeout);
    }

    // Send signal to process
    try {
      if (os.platform() === 'win32') {
        // Windows doesn't support signals the same way
        session.process.kill();
      } else {
        session.process.kill(signal as NodeJS.Signals);
      }
    } catch (error: any) {
      // Process may already be dead
      console.warn(`[ShellTools] Error stopping session ${sessionId}:`, error.message);
    }

    this.cleanupSession(sessionId);

    return {
      session_id: sessionId,
      stopped: true,
    };
  }

  /**
   * Clean up a session
   */
  private cleanupSession(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      if (session.timeout) {
        clearTimeout(session.timeout);
      }
      if (session.process.stdin && !session.process.stdin.destroyed) {
        session.process.stdin.end();
      }
      this.sessions.delete(sessionId);
    }
  }

  /**
   * Clean up all sessions (called on client disconnect)
   */
  cleanupAllSessions(): void {
    for (const sessionId of this.sessions.keys()) {
      this.stopSession(sessionId, 'TERM');
    }
  }

  /**
   * Start periodic cleanup of timed-out sessions
   */
  private startSessionCleanup(): void {
    setInterval(() => {
      const now = Date.now();
      for (const [sessionId, session] of this.sessions.entries()) {
        const age = now - session.startedAt.getTime();
        if (age > this.sessionTimeout) {
          console.log(`[ShellTools] Cleaning up timed-out session ${sessionId}`);
          this.stopSession(sessionId, 'TERM');
        }
      }
    }, 60000); // Check every minute
  }

  /**
   * Get session info (for debugging)
   */
  getSession(sessionId: string): ShellSession | undefined {
    return this.sessions.get(sessionId);
  }

  /**
   * Get all active sessions (for debugging)
   */
  getAllSessions(): Array<{ session_id: string; command: string; pid: number; startedAt: Date }> {
    return Array.from(this.sessions.values()).map((session) => ({
      session_id: session.sessionId,
      command: session.command,
      pid: session.pid,
      startedAt: session.startedAt,
    }));
  }
}

