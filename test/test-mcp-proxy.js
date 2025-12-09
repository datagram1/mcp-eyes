#!/usr/bin/env node
/**
 * Test MCP Proxy HTTP Connection
 * Tests if MCP proxy can connect to agent's HTTP server with correct authentication
 */

const fs = require('fs');
const path = require('path');
const http = require('http');

const TOKEN_FILE = path.join(process.env.HOME, '.screencontrol-token');

function loadTokenConfig() {
  try {
    const content = fs.readFileSync(TOKEN_FILE, 'utf-8');
    return JSON.parse(content);
  } catch (err) {
    console.error('Failed to load token file:', err);
    return null;
  }
}

async function testHTTPRequest(config, toolName, args = {}) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ name: toolName, arguments: args });
    const options = {
      hostname: config.host,
      port: config.port,
      path: '/tools/call',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`,
        'Content-Length': Buffer.byteLength(body),
      },
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        console.log(`Status: ${res.statusCode}`);
        if (res.statusCode === 401) {
          console.log('❌ Unauthorized - API key mismatch');
          reject(new Error('Unauthorized'));
          return;
        }
        if (res.statusCode !== 200) {
          console.log(`❌ HTTP ${res.statusCode}: ${data}`);
          reject(new Error(`HTTP ${res.statusCode}`));
          return;
        }
        try {
          const result = JSON.parse(data);
          console.log('✅ Success:', JSON.stringify(result, null, 2));
          resolve(result);
        } catch (e) {
          console.log('✅ Success (non-JSON):', data);
          resolve(data);
        }
      });
    });

    req.on('error', (e) => {
      console.log(`❌ Connection failed: ${e.message}`);
      reject(e);
    });

    req.write(body);
    req.end();
  });
}

async function main() {
  console.log('🧪 Testing MCP Proxy HTTP Connection\n');

  const config = loadTokenConfig();
  if (!config) {
    console.error('Failed to load token config');
    process.exit(1);
  }

  console.log(`Token file: ${TOKEN_FILE}`);
  console.log(`API Key: ${config.apiKey.substring(0, 16)}...`);
  console.log(`Server: ${config.host}:${config.port}\n`);

  try {
    console.log('Test 1: checkPermissions');
    await testHTTPRequest(config, 'checkPermissions');
    console.log('');

    console.log('Test 2: listApplications');
    await testHTTPRequest(config, 'listApplications');
    console.log('');

    console.log('✅ All tests passed!');
    process.exit(0);
  } catch (err) {
    console.log('\n❌ Tests failed');
    process.exit(1);
  }
}

main();
