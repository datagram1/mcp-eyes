#!/usr/bin/env node

/**
 * Test MCP tools via SSE server
 * Tests filesystem tools through the MCP protocol
 */

const http = require('http');
const path = require('path');

const PORT = 3458;
const HOST = 'localhost';
const testDir = path.join(__dirname, '..', 'test');

// Read API key from token file
let API_KEY = process.env.MCP_API_KEY || 'mcp_test_key';
try {
  const fs = require('fs');
  const tokenFile = path.join(process.env.HOME || '/tmp', '.mcp-eyes-sse-token');
  if (fs.existsSync(tokenFile)) {
    const config = JSON.parse(fs.readFileSync(tokenFile, 'utf-8'));
    if (config.apiKey) {
      API_KEY = config.apiKey;
      console.log(`Using API key from token file: ${API_KEY.substring(0, 15)}...`);
    }
  }
} catch (e) {
  console.log(`Warning: Could not read token file: ${e.message}`);
}

function makeRequest(method, path, body = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: HOST,
      port: PORT,
      path: path,
      method: method,
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': API_KEY,
      },
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          resolve({ raw: data });
        }
      });
    });

    req.on('error', (e) => {
      reject(e);
    });

    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

async function testTool(name, args) {
  try {
    console.log(`\n🔧 Testing ${name}...`);
    const response = await makeRequest('POST', '/mcp/messages', {
      jsonrpc: '2.0',
      id: Date.now(),
      method: 'tools/call',
      params: {
        name: name,
        arguments: args,
      },
    });

    if (response.error) {
      console.log(`   ✗ Error: ${JSON.stringify(response.error, null, 2)}`);
      return false;
    } else {
      console.log(`   ✓ Success`);
      const resultStr = JSON.stringify(response.result, null, 2);
      console.log(`   Result:`, resultStr.substring(0, 300));
      return true;
    }
  } catch (error) {
    console.log(`   ✗ Failed: ${error.message}`);
    return false;
  }
}

async function runTests() {
  console.log('🧪 Testing MCP Filesystem Tools via SSE Server\n');
  console.log(`Server: http://${HOST}:${PORT}`);
  console.log(`Test directory: ${testDir}\n`);

  // First, check if server is running
  try {
    const health = await makeRequest('GET', '/health');
    console.log('✓ Server is running');
    console.log(`  Agent: ${health.agent}`);
    console.log(`  Clients: ${health.clients}\n`);
  } catch (error) {
    console.error('✗ Server is not running. Please start it with: npm run start:sse');
    process.exit(1);
  }

  let passed = 0;
  let failed = 0;

  // Test 1: fs_list
  if (await testTool('fs_list', { path: testDir })) {
    passed++;
  } else {
    failed++;
  }

  // Test 2: fs_read
  if (await testTool('fs_read', { 
    path: path.join(testDir, 'test1.txt') 
  })) {
    passed++;
  } else {
    failed++;
  }

  // Test 3: fs_read_range
  if (await testTool('fs_read_range', {
    path: path.join(testDir, 'multiline.txt'),
    start_line: 2,
    end_line: 4
  })) {
    passed++;
  } else {
    failed++;
  }

  // Test 4: fs_write
  if (await testTool('fs_write', {
    path: path.join(testDir, 'mcp-written.txt'),
    content: 'This file was written via MCP!\nWith multiple lines.',
    mode: 'overwrite'
  })) {
    passed++;
  } else {
    failed++;
  }

  // Test 5: fs_search
  if (await testTool('fs_search', {
    base: testDir,
    glob: '*.txt',
    max_results: 10
  })) {
    passed++;
  } else {
    failed++;
  }

  // Test 6: fs_grep
  if (await testTool('fs_grep', {
    base: testDir,
    pattern: 'Test',
    max_matches: 5
  })) {
    passed++;
  } else {
    failed++;
  }

  // Summary
  console.log('\n' + '='.repeat(50));
  console.log(`Tests: ${passed} passed, ${failed} failed`);
  console.log('='.repeat(50));

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch(error => {
  console.error('Test runner error:', error);
  process.exit(1);
});

