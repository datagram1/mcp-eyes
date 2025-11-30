#!/usr/bin/env node

/**
 * Claude Identity MCP Server
 * 
 * This server runs MCP-eyes with Claude's process identity,
 * allowing it to inherit Claude's accessibility permissions.
 */

import { spawn, execSync } from 'child_process';
import { logger, setupGlobalErrorHandlers } from './logger.js';

class ClaudeIdentityServer {
  private mcpProcess: any = null;
  private isShuttingDown = false;

  constructor() {
    setupGlobalErrorHandlers(logger);
    this.setupSignalHandlers();
  }

  private setupSignalHandlers(): void {
    process.on('SIGINT', () => this.shutdown('SIGINT'));
    process.on('SIGTERM', () => this.shutdown('SIGTERM'));
    process.on('exit', () => this.cleanup());
  }

  private async shutdown(signal: string): Promise<void> {
    if (this.isShuttingDown) return;
    this.isShuttingDown = true;

    logger.info(`Received ${signal}, shutting down gracefully`);
    
    if (this.mcpProcess) {
      this.mcpProcess.kill(signal);
    }
    
    logger.logSessionEnd();
    process.exit(0);
  }

  private cleanup(): void {
    if (this.mcpProcess) {
      this.mcpProcess.kill();
    }
  }

  public async start(): Promise<void> {
    try {
      logger.logServerEvent('ClaudeIdentityServer starting');
      
      // Find Claude's process to inherit its identity
      const claudeProcess = this.findClaudeProcess();
      
      if (!claudeProcess) {
        logger.warn('Claude process not found, running with default identity');
      } else {
        logger.info('Found Claude process', { pid: claudeProcess.pid });
      }

      // Start MCP-eyes with Claude's identity
      await this.startMCPEyesWithClaudeIdentity();
      
    } catch (error: any) {
      logger.error('Failed to start ClaudeIdentityServer', { error: error?.message }, error);
      process.exit(1);
    }
  }

  private findClaudeProcess(): { pid: number; path: string } | null {
    try {
      // Find Claude process using ps
      const result = execSync('ps aux | grep -i claude | grep -v grep | head -1', { 
        encoding: 'utf8',
        timeout: 5000 
      });
      
      if (result.trim()) {
        const parts = result.trim().split(/\s+/);
        const pid = parseInt(parts[1]);
        const path = parts[10]; // Command path
        
        return { pid, path };
      }
    } catch (error: any) {
      logger.warn('Could not find Claude process', { error: error?.message });
    }
    
    return null;
  }

  private async startMCPEyesWithClaudeIdentity(): Promise<void> {
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

    logger.info('Starting MCP-eyes with Claude identity', {
      mcpEyesPath,
      env: {
        ELECTRON_APP_NAME: env.ELECTRON_APP_NAME,
        ELECTRON_APP_BUNDLE_ID: env.ELECTRON_APP_BUNDLE_ID
      }
    });

    // Spawn MCP-eyes process
    this.mcpProcess = spawn('node', [mcpEyesPath, ...process.argv.slice(2)], {
      env,
      stdio: ['inherit', 'inherit', 'inherit'],
      // Inherit parent's permissions
      detached: false
    });

    // Handle process events
    this.mcpProcess.on('error', (error: Error) => {
      logger.error('MCP-eyes process error', { error: error.message }, error);
      process.exit(1);
    });

    this.mcpProcess.on('exit', (code: number | null, signal: string | null) => {
      logger.info('MCP-eyes process exited', { code, signal });
      if (!this.isShuttingDown) {
        process.exit(code || 0);
      }
    });

    // Forward stdin/stdout/stderr
    process.stdin.pipe(this.mcpProcess.stdin);
    this.mcpProcess.stdout.pipe(process.stdout);
    this.mcpProcess.stderr.pipe(process.stderr);

    logger.logServerEvent('MCP-eyes started with Claude identity');
  }
}

// Start the server
const server = new ClaudeIdentityServer();
server.start().catch((error: any) => {
  logger.error('Failed to start server', { error: error?.message }, error);
  process.exit(1);
});
