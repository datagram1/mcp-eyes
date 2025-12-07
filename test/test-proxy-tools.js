#!/usr/bin/env node

/**
 * Test that MCP proxy server exposes filesystem and shell tools
 * This simulates what Codex, Claude-Code, and Gemini-CLI would see
 */

const { spawn } = require('child_process');
const path = require('path');

console.log('🧪 Testing MCP Proxy Server Tool Exposure\n');

// Start the proxy server
const proxyServer = spawn('node', [path.join(__dirname, '..', 'dist', 'mcp-proxy-server.js')], {
  stdio: ['pipe', 'pipe', 'pipe']
});

let output = '';
let errorOutput = '';

proxyServer.stdout.on('data', (data) => {
  output += data.toString();
});

proxyServer.stderr.on('data', (data) => {
  errorOutput += data.toString();
});

// Send MCP initialize request
setTimeout(() => {
  const initRequest = {
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: {
        name: 'test-client',
        version: '1.0.0'
      }
    }
  };

  proxyServer.stdin.write(JSON.stringify(initRequest) + '\n');

  // Send tools/list request
  setTimeout(() => {
    const listToolsRequest = {
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/list',
      params: {}
    };

    proxyServer.stdin.write(JSON.stringify(listToolsRequest) + '\n');

    // Wait for response and check
    setTimeout(() => {
      try {
        const lines = output.split('\n').filter(line => line.trim());
        for (const line of lines) {
          try {
            const response = JSON.parse(line);
            if (response.result && response.result.tools) {
              const tools = response.result.tools;
              const fsTools = tools.filter((t: any) => t.name && t.name.startsWith('fs_'));
              const shellTools = tools.filter((t: any) => t.name && t.name.startsWith('shell_'));

              console.log(`✅ Found ${tools.length} total tools`);
              console.log(`✅ Found ${fsTools.length} filesystem tools: ${fsTools.map((t: any) => t.name).join(', ')}`);
              console.log(`✅ Found ${shellTools.length} shell tools: ${shellTools.map((t: any) => t.name).join(', ')}`);

              if (fsTools.length === 9 && shellTools.length === 4) {
                console.log('\n✅ All filesystem and shell tools are exposed via MCP proxy!');
                console.log('✅ Codex, Claude-Code, and Gemini-CLI can now use these tools.');
                process.exit(0);
              } else {
                console.log('\n❌ Missing tools!');
                process.exit(1);
              }
            }
          } catch (e) {
            // Not JSON, skip
          }
        }
      } catch (error) {
        console.error('Error parsing output:', error);
        console.log('Output:', output);
        console.log('Error:', errorOutput);
      }

      proxyServer.kill();
      process.exit(1);
    }, 2000);
  }, 500);
}, 500);

// Timeout after 5 seconds
setTimeout(() => {
  console.error('Test timeout');
  proxyServer.kill();
  process.exit(1);
}, 5000);

