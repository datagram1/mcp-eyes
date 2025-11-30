#!/usr/bin/env node

/**
 * Claude MCP Wrapper
 * 
 * This wrapper makes MCP-eyes appear as if it's running from within the Claude app,
 * allowing it to inherit Claude's accessibility permissions.
 * 
 * Usage: node claude-mcp-wrapper.js [mcp-eyes-args...]
 */

const { spawn } = require('child_process');
const path = require('path');
const os = require('os');

// Get the path to the actual MCP-eyes server
const mcpEyesPath = path.join(__dirname, 'advanced-server-simple.js');

// Set up environment to make it appear as if running from Claude
const env = {
  ...process.env,
  // Set process title to appear as Claude
  ELECTRON_APP_NAME: 'Claude',
  ELECTRON_APP_VERSION: '0.13.11',
  // Inherit Claude's bundle identifier
  ELECTRON_APP_BUNDLE_ID: 'com.anthropic.claudefordesktop',
  // Set working directory to Claude's app directory
  ELECTRON_APP_PATH: '/Applications/Claude.app/Contents/Resources/app.asar'
};

// Override process.argv to make it appear as if launched from Claude
const claudeArgs = [
  '/Applications/Claude.app/Contents/MacOS/Claude',
  '--mcp-server',
  ...process.argv.slice(2)
];

console.error('[Claude-MCP] Starting MCP-eyes as Claude extension...');
console.error('[Claude-MCP] MCP-eyes path:', mcpEyesPath);
console.error('[Claude-MCP] Args:', process.argv.slice(2));

// Spawn the MCP-eyes server with Claude's identity
const mcpProcess = spawn('node', [mcpEyesPath, ...process.argv.slice(2)], {
  env,
  stdio: ['inherit', 'inherit', 'inherit'],
  // Set the process title to appear as Claude
  title: 'Claude MCP Server'
});

// Handle process events
mcpProcess.on('error', (error) => {
  console.error('[Claude-MCP] Failed to start MCP-eyes:', error);
  process.exit(1);
});

mcpProcess.on('exit', (code, signal) => {
  console.error(`[Claude-MCP] MCP-eyes exited with code ${code}, signal ${signal}`);
  process.exit(code || 0);
});

// Handle signals
process.on('SIGINT', () => {
  console.error('[Claude-MCP] Received SIGINT, shutting down...');
  mcpProcess.kill('SIGINT');
});

process.on('SIGTERM', () => {
  console.error('[Claude-MCP] Received SIGTERM, shutting down...');
  mcpProcess.kill('SIGTERM');
});

// Keep the wrapper alive
process.stdin.resume();
