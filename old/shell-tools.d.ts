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
import { ChildProcess } from 'child_process';
import { EventEmitter } from 'events';
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
export declare class ShellTools extends EventEmitter {
    private sessions;
    private maxConcurrentSessions;
    private sessionTimeout;
    constructor();
    /**
     * shell_exec: Run a command and return output when it finishes
     */
    executeCommand(params: {
        command: string;
        cwd?: string | null;
        timeout_seconds?: number;
        capture_stderr?: boolean;
    }): Promise<{
        exit_code: number;
        stdout: string;
        stderr: string;
        truncated?: boolean;
    }>;
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
    };
    /**
     * shell_send_input: Send input to a running shell session
     */
    sendInput(sessionId: string, input: string): {
        session_id: string;
        bytes_written: number;
    };
    /**
     * shell_stop_session: Stop/terminate a running session
     */
    stopSession(sessionId: string, signal?: string): {
        session_id: string;
        stopped: boolean;
    };
    /**
     * Clean up a session
     */
    private cleanupSession;
    /**
     * Clean up all sessions (called on client disconnect)
     */
    cleanupAllSessions(): void;
    /**
     * Start periodic cleanup of timed-out sessions
     */
    private startSessionCleanup;
    /**
     * Get session info (for debugging)
     */
    getSession(sessionId: string): ShellSession | undefined;
    /**
     * Get all active sessions (for debugging)
     */
    getAllSessions(): Array<{
        session_id: string;
        command: string;
        pid: number;
        startedAt: Date;
    }>;
}
export {};
//# sourceMappingURL=shell-tools.d.ts.map