#!/usr/bin/env node

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export enum LogLevel {
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

export class Logger {
  private static instance: Logger;
  private logFile: string;
  private sessionId: string;
  private logLevel: LogLevel;
  private isInitialized: boolean = false;

  private constructor() {
    this.sessionId = this.generateSessionId();
    this.logLevel = LogLevel.INFO;
    
    // Create log file in user's home directory to avoid permission issues
    const homeDir = os.homedir();
    const logDir = path.join(homeDir, '.mcp-eyes');
    
    // Ensure log directory exists
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
    
    this.logFile = path.join(logDir, 'mcp_eyes.log');
    this.initializeLogFile();
  }

  public static getInstance(): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger();
    }
    return Logger.instance;
  }

  private generateSessionId(): string {
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private initializeLogFile(): void {
    try {
      // Write session start marker
      const sessionStart = {
        timestamp: new Date().toISOString(),
        level: 'SESSION_START',
        message: `MCP Eyes session started`,
        sessionId: this.sessionId,
        pid: process.pid,
        hostname: os.hostname(),
        nodeVersion: process.version,
        platform: process.platform,
        arch: process.arch,
        memoryUsage: process.memoryUsage(),
        cwd: process.cwd(),
        argv: process.argv
      };

      fs.appendFileSync(this.logFile, JSON.stringify(sessionStart) + '\n');
      this.isInitialized = true;
      
      // Also log to console for immediate feedback
      console.error(`[MCP-EYES] Session started: ${this.sessionId}`);
      console.error(`[MCP-EYES] Log file: ${this.logFile}`);
    } catch (error) {
      console.error('[MCP-EYES] Failed to initialize log file:', error);
      // Fallback to console logging
      this.isInitialized = false;
    }
  }

  private writeLog(entry: LogEntry): void {
    try {
      if (this.isInitialized) {
        fs.appendFileSync(this.logFile, JSON.stringify(entry) + '\n');
      }
      
      // Also log to stderr for immediate visibility
      const levelName = LogLevel[entry.level];
      const contextStr = entry.context ? ` | Context: ${JSON.stringify(entry.context)}` : '';
      const stackStr = entry.stack ? `\nStack: ${entry.stack}` : '';
      
      console.error(`[MCP-EYES ${levelName}] ${entry.message}${contextStr}${stackStr}`);
    } catch (error) {
      // Fallback to console if file writing fails
      console.error('[MCP-EYES] Log write failed:', error);
      console.error(`[MCP-EYES ${LogLevel[entry.level]}] ${entry.message}`);
    }
  }

  private createLogEntry(level: LogLevel, message: string, context?: any, error?: Error): LogEntry {
    return {
      timestamp: new Date().toISOString(),
      level,
      message,
      context,
      stack: error?.stack,
      pid: process.pid,
      hostname: os.hostname(),
      sessionId: this.sessionId
    };
  }

  public debug(message: string, context?: any): void {
    if (this.logLevel <= LogLevel.DEBUG) {
      this.writeLog(this.createLogEntry(LogLevel.DEBUG, message, context));
    }
  }

  public info(message: string, context?: any): void {
    if (this.logLevel <= LogLevel.INFO) {
      this.writeLog(this.createLogEntry(LogLevel.INFO, message, context));
    }
  }

  public warn(message: string, context?: any): void {
    if (this.logLevel <= LogLevel.WARN) {
      this.writeLog(this.createLogEntry(LogLevel.WARN, message, context));
    }
  }

  public error(message: string, context?: any, error?: Error): void {
    if (this.logLevel <= LogLevel.ERROR) {
      this.writeLog(this.createLogEntry(LogLevel.ERROR, message, context, error));
    }
  }

  public fatal(message: string, context?: any, error?: Error): void {
    this.writeLog(this.createLogEntry(LogLevel.FATAL, message, context, error));
  }

  public setLogLevel(level: LogLevel): void {
    this.logLevel = level;
    this.info(`Log level changed to ${LogLevel[level]}`);
  }

  public getLogFile(): string {
    return this.logFile;
  }

  public getSessionId(): string {
    return this.sessionId;
  }

  // Method to log tool execution
  public logToolExecution(toolName: string, args: any, result?: any, error?: Error): void {
    const context = {
      tool: toolName,
      args: args,
      result: result,
      error: error?.message
    };

    if (error) {
      this.error(`Tool execution failed: ${toolName}`, context, error);
    } else {
      this.info(`Tool executed successfully: ${toolName}`, context);
    }
  }

  // Method to log server events
  public logServerEvent(event: string, details?: any): void {
    this.info(`Server event: ${event}`, details);
  }

  // Method to log permission checks
  public logPermissionCheck(permission: string, status: string): void {
    this.info(`Permission check: ${permission} = ${status}`);
  }

  // Method to log application interactions
  public logAppInteraction(action: string, appInfo?: any, details?: any): void {
    const context = {
      action,
      app: appInfo,
      details
    };
    this.info(`App interaction: ${action}`, context);
  }

  // Method to log crashes with full context
  public logCrash(error: Error, context?: any): void {
    const crashContext = {
      ...context,
      memoryUsage: process.memoryUsage(),
      uptime: process.uptime(),
      nodeVersion: process.version,
      platform: process.platform,
      arch: process.arch
    };

    this.fatal('CRASH DETECTED', crashContext, error);
  }

  // Method to log session end
  public logSessionEnd(): void {
    const sessionEnd = {
      timestamp: new Date().toISOString(),
      level: 'SESSION_END',
      message: `MCP Eyes session ended`,
      sessionId: this.sessionId,
      pid: process.pid,
      uptime: process.uptime(),
      memoryUsage: process.memoryUsage()
    };

    try {
      if (this.isInitialized) {
        fs.appendFileSync(this.logFile, JSON.stringify(sessionEnd) + '\n');
      }
      console.error(`[MCP-EYES] Session ended: ${this.sessionId}`);
    } catch (error) {
      console.error('[MCP-EYES] Failed to log session end:', error);
    }
  }
}

// Global error handlers
export function setupGlobalErrorHandlers(logger: Logger): void {
  // Handle uncaught exceptions
  process.on('uncaughtException', (error: Error) => {
    logger.logCrash(error, { type: 'uncaughtException' });
    
    // Give a moment for the log to be written
    setTimeout(() => {
      process.exit(1);
    }, 1000);
  });

  // Handle unhandled promise rejections
  process.on('unhandledRejection', (reason: any, promise: Promise<any>) => {
    const error = reason instanceof Error ? reason : new Error(String(reason));
    logger.logCrash(error, { 
      type: 'unhandledRejection',
      promise: promise.toString()
    });
    
    // Give a moment for the log to be written
    setTimeout(() => {
      process.exit(1);
    }, 1000);
  });

  // Handle process warnings
  process.on('warning', (warning: Error) => {
    logger.warn(`Process warning: ${warning.name}`, {
      message: warning.message,
      stack: warning.stack
    });
  });

  // Handle SIGINT (Ctrl+C)
  process.on('SIGINT', () => {
    logger.info('Received SIGINT, shutting down gracefully');
    logger.logSessionEnd();
    process.exit(0);
  });

  // Handle SIGTERM
  process.on('SIGTERM', () => {
    logger.info('Received SIGTERM, shutting down gracefully');
    logger.logSessionEnd();
    process.exit(0);
  });

  // Handle exit
  process.on('exit', (code: number) => {
    logger.info(`Process exiting with code: ${code}`);
  });

  logger.info('Global error handlers initialized');
}

// Export singleton instance
export const logger = Logger.getInstance();
