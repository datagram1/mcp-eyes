#!/usr/bin/env node

/**
 * MCP Eyes - Comprehensive Test Suite
 *
 * Runs all tool tests automatically and reports results.
 * Exit code 0 = all tests passed, 1 = some tests failed
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const TEST_DIR = __dirname;
const ROOT_DIR = path.join(__dirname, '..');

// ANSI color codes
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

function log(message, color = '') {
  console.log(`${color}${message}${colors.reset}`);
}

function header(message) {
  const line = '═'.repeat(60);
  log(`\n${line}`, colors.cyan);
  log(`  ${message}`, colors.bright + colors.cyan);
  log(`${line}\n`, colors.cyan);
}

function subHeader(message) {
  log(`\n▸ ${message}`, colors.yellow);
}

/**
 * Run a test file and capture results
 */
function runTest(testFile, description) {
  return new Promise((resolve) => {
    const startTime = Date.now();
    const testPath = path.join(TEST_DIR, testFile);

    if (!fs.existsSync(testPath)) {
      resolve({
        name: description,
        file: testFile,
        passed: false,
        duration: 0,
        error: `Test file not found: ${testPath}`
      });
      return;
    }

    const child = spawn('node', [testPath], {
      cwd: ROOT_DIR,
      stdio: ['ignore', 'pipe', 'pipe']
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    child.on('close', (code) => {
      const duration = Date.now() - startTime;
      resolve({
        name: description,
        file: testFile,
        passed: code === 0,
        duration,
        stdout,
        stderr,
        exitCode: code
      });
    });

    child.on('error', (error) => {
      const duration = Date.now() - startTime;
      resolve({
        name: description,
        file: testFile,
        passed: false,
        duration,
        error: error.message
      });
    });
  });
}

/**
 * Print test result summary
 */
function printResult(result, verbose = false) {
  const status = result.passed
    ? `${colors.green}✓ PASS${colors.reset}`
    : `${colors.red}✗ FAIL${colors.reset}`;
  const duration = `${colors.blue}(${result.duration}ms)${colors.reset}`;

  log(`  ${status} ${result.name} ${duration}`);

  if (!result.passed || verbose) {
    if (result.error) {
      log(`    Error: ${result.error}`, colors.red);
    }
    if (result.stderr && result.stderr.trim()) {
      log(`    Stderr: ${result.stderr.trim().split('\n')[0]}...`, colors.yellow);
    }
    if (!result.passed && result.stdout) {
      // Show last few lines of stdout for failed tests
      const lines = result.stdout.trim().split('\n');
      const lastLines = lines.slice(-5).join('\n    ');
      log(`    Output:\n    ${lastLines}`, colors.yellow);
    }
  }
}

/**
 * Main test runner
 */
async function main() {
  const startTime = Date.now();
  const verbose = process.argv.includes('--verbose') || process.argv.includes('-v');

  header('MCP Eyes Test Suite');

  log(`Test directory: ${TEST_DIR}`);
  log(`Verbose mode: ${verbose}`);
  log(`Node version: ${process.version}`);
  log(`Platform: ${process.platform}`);

  // Check for integration test flag
  const runIntegration = process.argv.includes('--integration') || process.argv.includes('-i');

  // Define test suites
  const testSuites = [
    {
      name: 'Unit Tests',
      tests: [
        { file: 'test-filesystem-tools.js', description: 'Filesystem Tools' },
        { file: 'test-shell-tools.js', description: 'Shell Tools' },
        { file: 'test-tool-registry.js', description: 'Tool Registry' },
      ]
    }
  ];

  // Add integration tests if flag is set
  if (runIntegration) {
    testSuites.push({
      name: 'Integration Tests (requires running server)',
      tests: [
        { file: 'test-mcp-tools.js', description: 'MCP Tool Definitions' },
        { file: 'test-proxy-tools.js', description: 'Proxy Server Tools' },
      ]
    });
  } else {
    log('\nSkipping integration tests (use --integration to run)', colors.yellow);
  }

  const allResults = [];

  for (const suite of testSuites) {
    subHeader(suite.name);

    for (const test of suite.tests) {
      const result = await runTest(test.file, test.description);
      allResults.push(result);
      printResult(result, verbose);
    }
  }

  // Print summary
  const totalDuration = Date.now() - startTime;
  const passed = allResults.filter(r => r.passed).length;
  const failed = allResults.filter(r => !r.passed).length;
  const total = allResults.length;

  header('Test Summary');

  log(`Total tests: ${total}`);
  log(`Passed: ${passed}`, colors.green);
  if (failed > 0) {
    log(`Failed: ${failed}`, colors.red);
  }
  log(`Duration: ${totalDuration}ms`);

  // List failed tests
  if (failed > 0) {
    subHeader('Failed Tests');
    allResults.filter(r => !r.passed).forEach(r => {
      log(`  • ${r.name} (${r.file})`, colors.red);
    });
  }

  // Final status
  log('');
  if (failed === 0) {
    log('═══════════════════════════════════════════════════════════', colors.green);
    log('  ✅ ALL TESTS PASSED', colors.bright + colors.green);
    log('═══════════════════════════════════════════════════════════', colors.green);
    process.exit(0);
  } else {
    log('═══════════════════════════════════════════════════════════', colors.red);
    log(`  ❌ ${failed} TEST(S) FAILED`, colors.bright + colors.red);
    log('═══════════════════════════════════════════════════════════', colors.red);
    process.exit(1);
  }
}

main().catch(error => {
  log(`\nFatal error: ${error.message}`, colors.red);
  process.exit(1);
});
