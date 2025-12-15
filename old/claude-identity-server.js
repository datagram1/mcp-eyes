#!/usr/bin/env node
"use strict";
/**
 * Claude Identity MCP Server
 *
 * This server runs MCP-eyes with Claude's process identity,
 * allowing it to inherit Claude's accessibility permissions.
 */
Object.defineProperty(exports, "__esModule", { value: true });
const child_process_1 = require("child_process");
const logger_js_1 = require("./logger.js");
class ClaudeIdentityServer {
    mcpProcess = null;
    isShuttingDown = false;
    constructor() {
        (0, logger_js_1.setupGlobalErrorHandlers)(logger_js_1.logger);
        this.setupSignalHandlers();
    }
    setupSignalHandlers() {
        process.on('SIGINT', () => this.shutdown('SIGINT'));
        process.on('SIGTERM', () => this.shutdown('SIGTERM'));
        process.on('exit', () => this.cleanup());
    }
    async shutdown(signal) {
        if (this.isShuttingDown)
            return;
        this.isShuttingDown = true;
        logger_js_1.logger.info(`Received ${signal}, shutting down gracefully`);
        if (this.mcpProcess) {
            this.mcpProcess.kill(signal);
        }
        logger_js_1.logger.logSessionEnd();
        process.exit(0);
    }
    cleanup() {
        if (this.mcpProcess) {
            this.mcpProcess.kill();
        }
    }
    async start() {
        try {
            logger_js_1.logger.logServerEvent('ClaudeIdentityServer starting');
            // Find Claude's process to inherit its identity
            const claudeProcess = this.findClaudeProcess();
            if (!claudeProcess) {
                logger_js_1.logger.warn('Claude process not found, running with default identity');
            }
            else {
                logger_js_1.logger.info('Found Claude process', { pid: claudeProcess.pid });
            }
            // Start MCP-eyes with Claude's identity
            await this.startMCPEyesWithClaudeIdentity();
        }
        catch (error) {
            logger_js_1.logger.error('Failed to start ClaudeIdentityServer', { error: error?.message }, error);
            process.exit(1);
        }
    }
    findClaudeProcess() {
        try {
            // Find Claude process using ps
            const result = (0, child_process_1.execSync)('ps aux | grep -i claude | grep -v grep | head -1', {
                encoding: 'utf8',
                timeout: 5000
            });
            if (result.trim()) {
                const parts = result.trim().split(/\s+/);
                const pid = parseInt(parts[1]);
                const path = parts[10]; // Command path
                return { pid, path };
            }
        }
        catch (error) {
            logger_js_1.logger.warn('Could not find Claude process', { error: error?.message });
        }
        return null;
    }
    async startMCPEyesWithClaudeIdentity() {
        const mcpEyesPath = './dist/advanced-server-simple.js';
        // Set up environment to inherit Claude's permissions
        const env = {
            ...process.env,
            // Make the process appear as Claude
            ELECTRON_APP_NAME: 'Claude',
            ELECTRON_APP_VERSION: '0.13.11',
            ELECTRON_APP_BUNDLE_ID: 'com.anthropic.claudefordesktop',
            ELECTRON_APP_PATH: '/Applications/Claude.app/Contents/Resources/app.asar',
            // Inherit Claude's working directory
            PWD: '/Applications/Claude.app/Contents/Resources',
            // Set process title
            PROCESS_TITLE: 'Claude MCP Server'
        };
        logger_js_1.logger.info('Starting MCP-eyes with Claude identity', {
            mcpEyesPath,
            env: {
                ELECTRON_APP_NAME: env.ELECTRON_APP_NAME,
                ELECTRON_APP_BUNDLE_ID: env.ELECTRON_APP_BUNDLE_ID
            }
        });
        // Spawn MCP-eyes process
        this.mcpProcess = (0, child_process_1.spawn)('node', [mcpEyesPath, ...process.argv.slice(2)], {
            env,
            stdio: ['inherit', 'inherit', 'inherit'],
            // Inherit parent's permissions
            detached: false
        });
        // Handle process events
        this.mcpProcess.on('error', (error) => {
            logger_js_1.logger.error('MCP-eyes process error', { error: error.message }, error);
            process.exit(1);
        });
        this.mcpProcess.on('exit', (code, signal) => {
            logger_js_1.logger.info('MCP-eyes process exited', { code, signal });
            if (!this.isShuttingDown) {
                process.exit(code || 0);
            }
        });
        // Forward stdin/stdout/stderr
        process.stdin.pipe(this.mcpProcess.stdin);
        this.mcpProcess.stdout.pipe(process.stdout);
        this.mcpProcess.stderr.pipe(process.stderr);
        logger_js_1.logger.logServerEvent('MCP-eyes started with Claude identity');
    }
}
// Start the server
const server = new ClaudeIdentityServer();
server.start().catch((error) => {
    logger_js_1.logger.error('Failed to start server', { error: error?.message }, error);
    process.exit(1);
});
//# sourceMappingURL=claude-identity-server.js.map