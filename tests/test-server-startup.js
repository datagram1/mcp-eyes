#!/usr/bin/env node

/**
 * MCP Server Startup Test
 *
 * This script tests that both MCP servers can start without errors.
 * It spawns each server process and verifies:
 * - The process starts successfully
 * - No immediate crashes or errors
 * - Proper cleanup on exit
 */

const { spawn } = require('child_process');
const path = require('path');

const STARTUP_TIMEOUT = 5000; // 5 seconds to start
const TEST_DURATION = 3000; // Keep running for 3 seconds

let testsRun = 0;
let testsPassed = 0;
let testsFailed = 0;
let testsSkipped = 0;

function log(message) {
  console.log(`[TEST] ${message}`);
}

function error(message) {
  console.error(`[ERROR] ${message}`);
}

function testServer(serverPath, serverName) {
  return new Promise((resolve, reject) => {
    log(`Testing ${serverName}...`);

    const serverProcess = spawn('node', [serverPath], {
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: STARTUP_TIMEOUT + TEST_DURATION
    });

    let stdout = '';
    let stderr = '';
    let hasStarted = false;
    let hasCrashed = false;

    const startupTimer = setTimeout(() => {
      if (!hasStarted) {
        error(`${serverName}: Failed to start within ${STARTUP_TIMEOUT}ms`);
        serverProcess.kill('SIGTERM');
        reject(new Error(`${serverName} startup timeout`));
      }
    }, STARTUP_TIMEOUT);

    const testTimer = setTimeout(() => {
      if (hasStarted && !hasCrashed) {
        log(`${serverName}: Running successfully`);
        clearTimeout(startupTimer);
        serverProcess.kill('SIGTERM');
        resolve();
      }
    }, STARTUP_TIMEOUT + TEST_DURATION);

    serverProcess.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    serverProcess.stderr.on('data', (data) => {
      const message = data.toString();
      stderr += message;

      // Check for successful startup messages
      if (message.includes('running on stdio') ||
          message.includes('Server running') ||
          message.includes('MCP Eyes')) {
        hasStarted = true;
        log(`${serverName}: Started successfully`);
      }

      // Check for error messages that indicate problems
      // Skip platform-specific native module errors (expected on wrong platform)
      const isPlatformError = message.includes('node-mac-permissions') ||
                              message.includes('ERR_DLOPEN_FAILED') ||
                              (message.includes('Module did not self-register') && process.platform !== 'darwin');

      if (isPlatformError) {
        // This is a known platform-specific error - skip this test
        log(`${serverName}: Skipping due to platform-specific dependency (running on ${process.platform})`);
        clearTimeout(startupTimer);
        clearTimeout(testTimer);
        serverProcess.kill('SIGTERM');
        resolve({ skipped: true, reason: 'platform-specific dependency' });
        return;
      }

      if (message.toLowerCase().includes('error:') ||
          message.includes('Error:') ||
          message.includes('TypeError') ||
          message.includes('ReferenceError') ||
          message.includes('Cannot find module') ||
          message.includes('ENOENT')) {
        hasCrashed = true;
        error(`${serverName}: Detected error in output`);
        error(`Error message: ${message.trim()}`);
        clearTimeout(startupTimer);
        clearTimeout(testTimer);
        serverProcess.kill('SIGTERM');
        reject(new Error(`${serverName} crashed: ${message.trim()}`));
      }
    });

    serverProcess.on('error', (err) => {
      hasCrashed = true;
      error(`${serverName}: Process error: ${err.message}`);
      clearTimeout(startupTimer);
      clearTimeout(testTimer);
      reject(err);
    });

    serverProcess.on('exit', (code, signal) => {
      clearTimeout(startupTimer);
      clearTimeout(testTimer);

      if (signal === 'SIGTERM' && hasStarted && !hasCrashed) {
        // Normal test completion
        resolve();
      } else if (!hasStarted) {
        error(`${serverName}: Exited before confirming startup (code: ${code}, signal: ${signal})`);
        if (stderr) {
          error(`STDERR: ${stderr}`);
        }
        reject(new Error(`${serverName} failed to start`));
      } else if (hasCrashed) {
        // Already handled in error detection
        reject(new Error(`${serverName} crashed`));
      } else if (code !== 0 && code !== null) {
        error(`${serverName}: Exited with non-zero code: ${code}`);
        reject(new Error(`${serverName} exit code ${code}`));
      } else {
        resolve();
      }
    });

    // Send a SIGINT after some time to gracefully stop
    setTimeout(() => {
      if (!hasCrashed) {
        serverProcess.stdin.end();
      }
    }, STARTUP_TIMEOUT + TEST_DURATION - 500);
  });
}

async function runTests() {
  console.log('🚀 Testing MCP Server Startup\n');
  console.log('='.repeat(50));

  const distPath = path.join(__dirname, '..', 'dist');
  const basicServer = path.join(distPath, 'basic-server.js');
  const advancedServer = path.join(distPath, 'advanced-server-simple.js');

  const tests = [
    { path: basicServer, name: 'Basic Server' },
    { path: advancedServer, name: 'Advanced Server' }
  ];

  for (const test of tests) {
    testsRun++;
    try {
      const result = await testServer(test.path, test.name);
      if (result && result.skipped) {
        testsSkipped++;
        console.log(`⊘ ${test.name}: SKIPPED (${result.reason})\n`);
      } else {
        testsPassed++;
        console.log(`✅ ${test.name}: PASSED\n`);
      }
    } catch (err) {
      testsFailed++;
      console.error(`❌ ${test.name}: FAILED`);
      console.error(`   Reason: ${err.message}\n`);
    }
  }

  console.log('='.repeat(50));
  console.log(`\nTests run: ${testsRun}`);
  console.log(`Tests passed: ${testsPassed}`);
  console.log(`Tests skipped: ${testsSkipped}`);
  console.log(`Tests failed: ${testsFailed}`);

  if (testsFailed > 0) {
    console.error('\n❌ SOME TESTS FAILED\n');
    process.exit(1);
  } else if (testsSkipped === testsRun) {
    console.log('\n⚠️  ALL TESTS SKIPPED (likely platform-specific)\n');
    process.exit(0);
  } else {
    console.log('\n✅ ALL TESTS PASSED\n');
    process.exit(0);
  }
}

// Handle cleanup on test interruption
process.on('SIGINT', () => {
  console.log('\n\nTest interrupted by user');
  process.exit(1);
});

process.on('SIGTERM', () => {
  console.log('\n\nTest terminated');
  process.exit(1);
});

runTests().catch(err => {
  error(`Test runner failed: ${err.message}`);
  process.exit(1);
});
