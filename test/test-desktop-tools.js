#!/usr/bin/env node

/**
 * Test Desktop Control Tools via MCP server
 * Tests all desktop_ tools through the local MCP protocol
 */

const http = require('http');
const path = require('path');

const PORT = 3456;
const HOST = 'localhost';

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
          resolve({ raw: data, statusCode: res.statusCode });
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

async function testTool(name, args, validateResult = null) {
  try {
    console.log(`\n🔧 Testing ${name}...`);
    console.log(`   Args: ${JSON.stringify(args)}`);

    const response = await makeRequest('POST', '/', {
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
    } else if (response.result && response.result.error) {
      console.log(`   ✗ Tool Error: ${response.result.error}`);
      return false;
    } else {
      console.log(`   ✓ Success`);
      if (response.result) {
        const resultStr = JSON.stringify(response.result, null, 2);
        if (resultStr.length > 500) {
          console.log(`   Result (truncated):`, resultStr.substring(0, 500) + '...');
        } else {
          console.log(`   Result:`, resultStr);
        }

        // Custom validation
        if (validateResult && !validateResult(response.result)) {
          console.log(`   ⚠ Validation failed`);
          return false;
        }
      }
      return true;
    }
  } catch (error) {
    console.log(`   ✗ Failed: ${error.message}`);
    return false;
  }
}

async function runTests() {
  console.log('🧪 Testing Desktop Control Tools via MCP Server\n');
  console.log(`Server: http://${HOST}:${PORT}`);
  console.log(`Using API Key: ${API_KEY}\n`);

  let passed = 0;
  let failed = 0;
  let skipped = 0;

  // Test 1: desktop_list_applications
  console.log('\n========== Testing desktop_list_applications ==========');
  if (await testTool('desktop_list_applications', {}, (result) => {
    return result.applications && Array.isArray(result.applications);
  })) {
    passed++;
  } else {
    failed++;
  }

  // Test 2: desktop_screenshot
  console.log('\n========== Testing desktop_screenshot ==========');
  if (await testTool('desktop_screenshot', {}, (result) => {
    return result.image && result.format === 'png';
  })) {
    passed++;
  } else {
    failed++;
  }

  // Test 3: desktop_press_key (safe key: escape)
  console.log('\n========== Testing desktop_press_key ==========');
  if (await testTool('desktop_press_key', { key: 'escape' }, (result) => {
    return result.success === true;
  })) {
    passed++;
  } else {
    failed++;
  }

  // Test 4: desktop_type (small test string)
  console.log('\n========== Testing desktop_type ==========');
  console.log('   ⚠ This will type text at the current cursor position!');
  console.log('   Skipping for safety - would type: "MCP Test"');
  console.log('   ⊘ Skipped');
  skipped++;

  // Test 5: desktop_click (test query for element, but don't actually click)
  console.log('\n========== Testing desktop_click ==========');
  console.log('   ⚠ This would click on screen!');
  console.log('   Skipping for safety');
  console.log('   ⊘ Skipped');
  skipped++;

  // Test 6: desktop_focus_application (test with system app)
  console.log('\n========== Testing desktop_focus_application ==========');
  console.log('   ⚠ This would change application focus!');
  console.log('   Skipping for safety');
  console.log('   ⊘ Skipped');
  skipped++;

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log(`Results: ${passed} passed, ${failed} failed, ${skipped} skipped`);
  console.log('='.repeat(60));

  if (failed > 0) {
    console.log('\n❌ Some tests failed');
    process.exit(1);
  } else if (passed === 0) {
    console.log('\n⚠️  No tests were run successfully');
    process.exit(1);
  } else {
    console.log('\n✅ All executable tests passed!');
    console.log(`   (${skipped} tests skipped for safety)`);
    process.exit(0);
  }
}

runTests().catch(error => {
  console.error('Test runner error:', error);
  process.exit(1);
});
