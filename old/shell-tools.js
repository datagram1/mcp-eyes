#!/usr/bin/env node
"use strict";
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
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.ShellTools = void 0;
const child_process_1 = require("child_process");
const events_1 = require("events");
const util_1 = require("util");
const os = __importStar(require("os"));
const execAsync = (0, util_1.promisify)(child_process_1.exec);
class ShellTools extends events_1.EventEmitter {
    sessions = new Map();
    maxConcurrentSessions = 10;
    sessionTimeout = 3600000; // 1 hour in milliseconds
    constructor() {
        super();
        this.startSessionCleanup();
    }
    /**
     * shell_exec: Run a command and return output when it finishes
     */
    async executeCommand(params) {
        const command = params.command;
        const cwd = params.cwd || process.cwd();
        const timeoutSeconds = params.timeout_seconds ?? 600;
        const captureStderr = params.capture_stderr ?? true;
        // Determine shell based on platform
        const shell = os.platform() === 'win32' ? 'cmd.exe' : 'sh';
        const shellArgs = os.platform() === 'win32' ? ['/c', command] : ['-c', command];
        return new Promise((resolve, reject) => {
            const process = (0, child_process_1.spawn)(shell, shellArgs, {
                cwd: cwd || undefined,
                stdio: ['ignore', 'pipe', captureStderr ? 'pipe' : 'ignore'],
            });
            let stdout = '';
            let stderr = '';
            let truncated = false;
            const maxOutputSize = 10 * 1024 * 1024; // 10MB limit
            process.stdout?.on('data', (data) => {
                const chunk = data.toString();
                if (stdout.length + chunk.length > maxOutputSize) {
                    truncated = true;
                    return;
                }
                stdout += chunk;
            });
            if (captureStderr) {
                process.stderr?.on('data', (data) => {
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
    startSession(params) {
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
        const childProcess = (0, child_process_1.spawn)(shell, shellArgs, {
            cwd: workingDir || undefined,
            env: envVars,
            stdio: ['pipe', 'pipe', captureStderr ? 'pipe' : 'ignore'],
        });
        const session = {
            sessionId,
            process: childProcess,
            command,
            cwd: workingDir || undefined,
            startedAt: new Date(),
            pid: childProcess.pid,
            captureStderr,
        };
        // Set up stdout listener
        childProcess.stdout?.on('data', (data) => {
            const chunk = data.toString();
            this.emit('shell_session_output', {
                session_id: sessionId,
                stream: 'stdout',
                chunk,
            });
        });
        // Set up stderr listener
        if (captureStderr && childProcess.stderr) {
            childProcess.stderr.on('data', (data) => {
                const chunk = data.toString();
                this.emit('shell_session_output', {
                    session_id: sessionId,
                    stream: 'stderr',
                    chunk,
                });
            });
        }
        // Set up exit listener
        childProcess.on('close', (code) => {
            this.emit('shell_session_exit', {
                session_id: sessionId,
                exit_code: code || 0,
            });
            this.cleanupSession(sessionId);
        });
        childProcess.on('error', (error) => {
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
    sendInput(sessionId, input) {
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
    stopSession(sessionId, signal = 'TERM') {
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
            }
            else {
                session.process.kill(signal);
            }
        }
        catch (error) {
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
    cleanupSession(sessionId) {
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
    cleanupAllSessions() {
        for (const sessionId of this.sessions.keys()) {
            this.stopSession(sessionId, 'TERM');
        }
    }
    /**
     * Start periodic cleanup of timed-out sessions
     */
    startSessionCleanup() {
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
    getSession(sessionId) {
        return this.sessions.get(sessionId);
    }
    /**
     * Get all active sessions (for debugging)
     */
    getAllSessions() {
        return Array.from(this.sessions.values()).map((session) => ({
            session_id: session.sessionId,
            command: session.command,
            pid: session.pid,
            startedAt: session.startedAt,
        }));
    }
}
exports.ShellTools = ShellTools;
//# sourceMappingURL=shell-tools.js.map