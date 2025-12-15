#!/usr/bin/env node
export declare enum LogLevel {
    DEBUG = 0,
    INFO = 1,
    WARN = 2,
    ERROR = 3,
    FATAL = 4
}
export interface LogEntry {
    timestamp: string;
    level: LogLevel;
    message: string;
    context?: any;
    stack?: string;
    pid: number;
    hostname: string;
    sessionId: string;
}
export declare class Logger {
    private static instance;
    private logFile;
    private sessionId;
    private logLevel;
    private isInitialized;
    private constructor();
    private resolveLogFilePath;
    static getInstance(): Logger;
    private generateSessionId;
    private initializeLogFile;
    private writeLog;
    private createLogEntry;
    debug(message: string, context?: any): void;
    info(message: string, context?: any): void;
    warn(message: string, context?: any): void;
    error(message: string, context?: any, error?: Error): void;
    fatal(message: string, context?: any, error?: Error): void;
    setLogLevel(level: LogLevel): void;
    getLogFile(): string;
    getSessionId(): string;
    logToolExecution(toolName: string, args: any, result?: any, error?: Error): void;
    logServerEvent(event: string, details?: any): void;
    logPermissionCheck(permission: string, status: string): void;
    logAppInteraction(action: string, appInfo?: any, details?: any): void;
    logCrash(error: Error, context?: any): void;
    logSessionEnd(): void;
}
export declare function setupGlobalErrorHandlers(logger: Logger): void;
export declare const logger: Logger;
//# sourceMappingURL=logger.d.ts.map