#!/usr/bin/env node

/**
 * Shell Tools Test Suite
 *
 * Tests shell command execution and session management.
 */

const { ShellTools } = require('../dist/shell-tools');
const os = require('os');

const shellTools = new ShellTools();

// Test state
let passed = 0;
let failed = 0;
const errors = [];

function pass(testName) {
  passed++;
  console.log(`  ✓ ${testName}`);
}

function fail(testName, error) {
  failed++;
  errors.push({ test: testName, error: error.message || error });
  console.log(`  ✗ ${testName}: ${error.message || error}`);
}

/**
 * Wait helper
 */
function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Test: shell_exec - Execute simple commands
 */
async function testShellExec() {
  console.log('\n[shell_exec] Execute commands');

  // Test simple echo command
  try {
    const result = await shellTools.executeCommand({
      command: 'echo "Hello World"'
    });
    if (result.exit_code !== 0) {
      throw new Error(`Expected exit code 0, got ${result.exit_code}`);
    }
    if (!result.stdout.includes('Hello World')) {
      throw new Error(`Expected output to include "Hello World", got "${result.stdout}"`);
    }
    pass('Simple echo command');
  } catch (e) {
    fail('Simple echo command', e);
  }

  // Test command with multiple outputs
  try {
    const result = await shellTools.executeCommand({
      command: 'echo "line1" && echo "line2"'
    });
    if (!result.stdout.includes('line1') || !result.stdout.includes('line2')) {
      throw new Error('Expected both lines in output');
    }
    pass('Multiple output lines');
  } catch (e) {
    fail('Multiple output lines', e);
  }

  // Test command with stderr
  try {
    const result = await shellTools.executeCommand({
      command: 'echo "error message" >&2',
      capture_stderr: true
    });
    if (!result.stderr.includes('error message')) {
      throw new Error('Expected stderr to be captured');
    }
    pass('Captures stderr');
  } catch (e) {
    fail('Captures stderr', e);
  }

  // Test command that fails
  try {
    const result = await shellTools.executeCommand({
      command: 'exit 42'
    });
    if (result.exit_code !== 42) {
      throw new Error(`Expected exit code 42, got ${result.exit_code}`);
    }
    pass('Returns correct exit code');
  } catch (e) {
    fail('Returns correct exit code', e);
  }

  // Test working directory
  try {
    const tmpDir = os.tmpdir();
    const result = await shellTools.executeCommand({
      command: 'pwd',
      cwd: tmpDir
    });
    // Resolve symlinks for comparison (macOS /tmp -> /private/tmp)
    const expected = require('fs').realpathSync(tmpDir);
    const actual = result.stdout.trim();
    if (!actual.includes(expected) && !expected.includes(actual)) {
      throw new Error(`Expected "${expected}", got "${actual}"`);
    }
    pass('Respects working directory');
  } catch (e) {
    fail('Respects working directory', e);
  }

  // Test timeout (short)
  try {
    const result = await shellTools.executeCommand({
      command: 'sleep 0.1 && echo "done"',
      timeout_seconds: 5
    });
    if (!result.stdout.includes('done')) {
      throw new Error('Command should complete before timeout');
    }
    pass('Completes before timeout');
  } catch (e) {
    fail('Completes before timeout', e);
  }
}

/**
 * Test: shell_exec with environment and special characters
 */
async function testShellExecAdvanced() {
  console.log('\n[shell_exec] Advanced execution');

  // Test command with environment variable
  try {
    const result = await shellTools.executeCommand({
      command: 'echo $HOME'
    });
    if (!result.stdout.trim() || result.stdout.trim() === '$HOME') {
      throw new Error('Environment variable not expanded');
    }
    pass('Expands environment variables');
  } catch (e) {
    fail('Expands environment variables', e);
  }

  // Test pipe command
  try {
    const result = await shellTools.executeCommand({
      command: 'echo "hello world" | tr "a-z" "A-Z"'
    });
    if (!result.stdout.includes('HELLO WORLD')) {
      throw new Error('Pipe command failed');
    }
    pass('Handles pipe commands');
  } catch (e) {
    fail('Handles pipe commands', e);
  }

  // Test command with quotes
  try {
    const result = await shellTools.executeCommand({
      command: 'echo "quoted \\"nested\\" string"'
    });
    if (!result.stdout.includes('nested')) {
      throw new Error('Nested quotes not handled');
    }
    pass('Handles nested quotes');
  } catch (e) {
    fail('Handles nested quotes', e);
  }

  // Test command with special characters
  try {
    const result = await shellTools.executeCommand({
      command: 'echo "special: $PATH | & ; < >"'
    });
    if (result.exit_code !== 0) {
      throw new Error('Failed with special characters');
    }
    pass('Handles special characters in quotes');
  } catch (e) {
    fail('Handles special characters in quotes', e);
  }
}

/**
 * Test: shell_start_session - Start interactive sessions
 */
async function testShellStartSession() {
  console.log('\n[shell_start_session] Interactive sessions');

  let sessionId = null;

  // Test starting a session
  try {
    const result = shellTools.startSession({
      command: 'cat' // Simple command that reads stdin
    });
    if (!result.session_id) {
      throw new Error('No session_id returned');
    }
    if (typeof result.pid !== 'number') {
      throw new Error('No pid returned');
    }
    sessionId = result.session_id;
    pass('Starts session and returns ID');
  } catch (e) {
    fail('Starts session and returns ID', e);
  }

  // Cleanup
  if (sessionId) {
    try {
      shellTools.stopSession(sessionId);
    } catch (e) {}
  }

  // Test getAllSessions
  try {
    const result = shellTools.startSession({
      command: 'sleep 60'
    });
    sessionId = result.session_id;

    const sessions = shellTools.getAllSessions();
    if (!Array.isArray(sessions)) {
      throw new Error('getAllSessions should return array');
    }
    const found = sessions.find(s => s.session_id === sessionId);
    if (!found) {
      throw new Error('Session not found in getAllSessions');
    }
    pass('getAllSessions lists active sessions');

    // Cleanup
    shellTools.stopSession(sessionId);
  } catch (e) {
    fail('getAllSessions lists active sessions', e);
    if (sessionId) {
      try { shellTools.stopSession(sessionId); } catch (e) {}
    }
  }
}

/**
 * Test: shell_send_input - Send input to sessions
 */
async function testShellSendInput() {
  console.log('\n[shell_send_input] Send input to sessions');

  let sessionId = null;
  let outputReceived = false;

  try {
    // Start a cat session that echoes input
    const startResult = shellTools.startSession({
      command: 'cat'
    });
    sessionId = startResult.session_id;

    // Listen for output
    const outputPromise = new Promise((resolve) => {
      const handler = (data) => {
        if (data.session_id === sessionId && data.stream === 'stdout') {
          if (data.chunk.includes('test input')) {
            outputReceived = true;
            shellTools.removeListener('shell_session_output', handler);
            resolve();
          }
        }
      };
      shellTools.on('shell_session_output', handler);
      // Timeout after 2 seconds
      setTimeout(() => {
        shellTools.removeListener('shell_session_output', handler);
        resolve();
      }, 2000);
    });

    // Send input
    const sendResult = shellTools.sendInput(sessionId, 'test input\n');
    if (!sendResult.bytes_written || sendResult.bytes_written < 5) {
      throw new Error('bytes_written should be > 0');
    }
    pass('sendInput returns bytes written');

    // Wait for output
    await outputPromise;
    if (outputReceived) {
      pass('Session echoes input');
    } else {
      fail('Session echoes input', new Error('No output received'));
    }

  } catch (e) {
    fail('sendInput works', e);
  } finally {
    if (sessionId) {
      try { shellTools.stopSession(sessionId); } catch (e) {}
    }
  }

  // Test sending to non-existent session
  try {
    shellTools.sendInput('nonexistent_session', 'test');
    fail('Throws on invalid session', new Error('Should have thrown'));
  } catch (e) {
    if (e.message.includes('not found')) {
      pass('Throws on invalid session');
    } else {
      fail('Throws on invalid session', e);
    }
  }
}

/**
 * Test: shell_stop_session - Stop sessions
 */
async function testShellStopSession() {
  console.log('\n[shell_stop_session] Stop sessions');

  let sessionId = null;

  try {
    const startResult = shellTools.startSession({
      command: 'sleep 60'
    });
    sessionId = startResult.session_id;

    const stopResult = shellTools.stopSession(sessionId);
    if (!stopResult.stopped) {
      throw new Error('stopped should be true');
    }
    pass('Stops session successfully');

    // Verify session is gone
    await wait(100);
    const sessions = shellTools.getAllSessions();
    const found = sessions.find(s => s.session_id === sessionId);
    if (found) {
      throw new Error('Session still exists after stop');
    }
    pass('Session removed after stop');
    sessionId = null;
  } catch (e) {
    fail('Stops session', e);
    if (sessionId) {
      try { shellTools.stopSession(sessionId); } catch (e) {}
    }
  }

  // Test stopping non-existent session
  try {
    shellTools.stopSession('nonexistent_session');
    fail('Throws on invalid session', new Error('Should have thrown'));
  } catch (e) {
    if (e.message.includes('not found')) {
      pass('Throws on stopping invalid session');
    } else {
      fail('Throws on stopping invalid session', e);
    }
  }
}

/**
 * Test: Session events
 */
async function testSessionEvents() {
  console.log('\n[session events] Event emission');

  let sessionId = null;
  let exitReceived = false;

  try {
    // Listen for exit event
    const exitPromise = new Promise((resolve) => {
      const handler = (data) => {
        if (data.session_id === sessionId) {
          exitReceived = true;
          shellTools.removeListener('shell_session_exit', handler);
          resolve(data);
        }
      };
      shellTools.on('shell_session_exit', handler);
      setTimeout(() => {
        shellTools.removeListener('shell_session_exit', handler);
        resolve(null);
      }, 3000);
    });

    // Start session that will exit quickly
    const startResult = shellTools.startSession({
      command: 'echo "done" && exit 0'
    });
    sessionId = startResult.session_id;

    // Wait for exit
    const exitData = await exitPromise;
    if (exitReceived && exitData) {
      if (typeof exitData.exit_code !== 'number') {
        throw new Error('exit_code should be a number');
      }
      pass('Emits shell_session_exit event');
    } else {
      fail('Emits shell_session_exit event', new Error('No exit event received'));
    }
  } catch (e) {
    fail('Session events', e);
  }
}

/**
 * Test: Cleanup
 */
async function testCleanup() {
  console.log('\n[cleanup] Session cleanup');

  try {
    // Start multiple sessions
    const s1 = shellTools.startSession({ command: 'sleep 60' });
    const s2 = shellTools.startSession({ command: 'sleep 60' });

    // Verify they exist
    let sessions = shellTools.getAllSessions();
    if (sessions.length < 2) {
      throw new Error('Should have at least 2 sessions');
    }

    // Cleanup all
    shellTools.cleanupAllSessions();

    await wait(100);

    // Verify all gone
    sessions = shellTools.getAllSessions();
    if (sessions.length !== 0) {
      throw new Error(`Expected 0 sessions, got ${sessions.length}`);
    }
    pass('cleanupAllSessions removes all sessions');
  } catch (e) {
    fail('cleanupAllSessions', e);
    shellTools.cleanupAllSessions(); // Force cleanup
  }
}

/**
 * Run all tests
 */
async function runTests() {
  console.log('Shell Tools Test Suite');
  console.log('═'.repeat(50));
  console.log(`Platform: ${os.platform()}`);

  await testShellExec();
  await testShellExecAdvanced();
  await testShellStartSession();
  await testShellSendInput();
  await testShellStopSession();
  await testSessionEvents();
  await testCleanup();

  // Final cleanup
  shellTools.cleanupAllSessions();

  // Summary
  console.log('\n' + '═'.repeat(50));
  console.log(`Results: ${passed} passed, ${failed} failed`);
  console.log('═'.repeat(50));

  if (failed > 0) {
    console.log('\nFailed tests:');
    errors.forEach(e => console.log(`  • ${e.test}: ${e.error}`));
    process.exit(1);
  }

  process.exit(0);
}

runTests().catch(error => {
  console.error('Test runner error:', error);
  shellTools.cleanupAllSessions();
  process.exit(1);
});
