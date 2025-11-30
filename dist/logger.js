#!/usr/bin/env node
"use strict";
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
exports.logger = exports.Logger = exports.LogLevel = void 0;
exports.setupGlobalErrorHandlers = setupGlobalErrorHandlers;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const os = __importStar(require("os"));
var LogLevel;
(function (LogLevel) {
    LogLevel[LogLevel["DEBUG"] = 0] = "DEBUG";
    LogLevel[LogLevel["INFO"] = 1] = "INFO";
    LogLevel[LogLevel["WARN"] = 2] = "WARN";
    LogLevel[LogLevel["ERROR"] = 3] = "ERROR";
    LogLevel[LogLevel["FATAL"] = 4] = "FATAL";
})(LogLevel || (exports.LogLevel = LogLevel = {}));
class Logger {
    static instance;
    logFile;
    sessionId;
    logLevel;
    isInitialized = false;
    constructor() {
        this.sessionId = this.generateSessionId();
        this.logLevel = LogLevel.INFO;
        this.logFile = this.resolveLogFilePath();
        this.initializeLogFile();
    }
    resolveLogFilePath() {
        const candidates = [];
        const envOverride = process.env.MCP_EYES_LOG_DIR;
        if (envOverride && envOverride.trim().length > 0) {
            candidates.push(envOverride);
        }
        const homeDir = os.homedir();
        if (homeDir && homeDir.trim().length > 0) {
            candidates.push(path.join(homeDir, '.mcp-eyes'));
        }
        candidates.push(path.join(process.cwd(), 'tmp', '.mcp-eyes'));
        candidates.push(path.join(os.tmpdir(), 'mcp-eyes'));
        for (const dir of candidates) {
            try {
                fs.mkdirSync(dir, { recursive: true });
                fs.accessSync(dir, fs.constants.W_OK);
                return path.join(dir, 'mcp_eyes.log');
            }
            catch {
                continue;
            }
        }
        return path.join(process.cwd(), 'mcp_eyes.log');
    }
    static getInstance() {
        if (!Logger.instance) {
            Logger.instance = new Logger();
        }
        return Logger.instance;
    }
    generateSessionId() {
        return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
    initializeLogFile() {
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
        }
        catch (error) {
            console.error('[MCP-EYES] Failed to initialize log file:', error);
            // Fallback to console logging
            this.isInitialized = false;
        }
    }
    writeLog(entry) {
        try {
            if (this.isInitialized) {
                fs.appendFileSync(this.logFile, JSON.stringify(entry) + '\n');
            }
            // Also log to stderr for immediate visibility
            const levelName = LogLevel[entry.level];
            const contextStr = entry.context ? ` | Context: ${JSON.stringify(entry.context)}` : '';
            const stackStr = entry.stack ? `\nStack: ${entry.stack}` : '';
            console.error(`[MCP-EYES ${levelName}] ${entry.message}${contextStr}${stackStr}`);
        }
        catch (error) {
            // Fallback to console if file writing fails
            console.error('[MCP-EYES] Log write failed:', error);
            console.error(`[MCP-EYES ${LogLevel[entry.level]}] ${entry.message}`);
        }
    }
    createLogEntry(level, message, context, error) {
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
    debug(message, context) {
        if (this.logLevel <= LogLevel.DEBUG) {
            this.writeLog(this.createLogEntry(LogLevel.DEBUG, message, context));
        }
    }
    info(message, context) {
        if (this.logLevel <= LogLevel.INFO) {
            this.writeLog(this.createLogEntry(LogLevel.INFO, message, context));
        }
    }
    warn(message, context) {
        if (this.logLevel <= LogLevel.WARN) {
            this.writeLog(this.createLogEntry(LogLevel.WARN, message, context));
        }
    }
    error(message, context, error) {
        if (this.logLevel <= LogLevel.ERROR) {
            this.writeLog(this.createLogEntry(LogLevel.ERROR, message, context, error));
        }
    }
    fatal(message, context, error) {
        this.writeLog(this.createLogEntry(LogLevel.FATAL, message, context, error));
    }
    setLogLevel(level) {
        this.logLevel = level;
        this.info(`Log level changed to ${LogLevel[level]}`);
    }
    getLogFile() {
        return this.logFile;
    }
    getSessionId() {
        return this.sessionId;
    }
    // Method to log tool execution
    logToolExecution(toolName, args, result, error) {
        const context = {
            tool: toolName,
            args: args,
            result: result,
            error: error?.message
        };
        if (error) {
            this.error(`Tool execution failed: ${toolName}`, context, error);
        }
        else {
            this.info(`Tool executed successfully: ${toolName}`, context);
        }
    }
    // Method to log server events
    logServerEvent(event, details) {
        this.info(`Server event: ${event}`, details);
    }
    // Method to log permission checks
    logPermissionCheck(permission, status) {
        this.info(`Permission check: ${permission} = ${status}`);
    }
    // Method to log application interactions
    logAppInteraction(action, appInfo, details) {
        const context = {
            action,
            app: appInfo,
            details
        };
        this.info(`App interaction: ${action}`, context);
    }
    // Method to log crashes with full context
    logCrash(error, context) {
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
    logSessionEnd() {
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
        }
        catch (error) {
            console.error('[MCP-EYES] Failed to log session end:', error);
        }
    }
}
exports.Logger = Logger;
// Global error handlers
function setupGlobalErrorHandlers(logger) {
    // Handle uncaught exceptions
    process.on('uncaughtException', (error) => {
        logger.logCrash(error, { type: 'uncaughtException' });
        // Give a moment for the log to be written
        setTimeout(() => {
            process.exit(1);
        }, 1000);
    });
    // Handle unhandled promise rejections
    process.on('unhandledRejection', (reason, promise) => {
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
    process.on('warning', (warning) => {
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
    process.on('exit', (code) => {
        logger.info(`Process exiting with code: ${code}`);
    });
    logger.info('Global error handlers initialized');
}
// Export singleton instance
exports.logger = Logger.getInstance();
//# sourceMappingURL=logger.js.map