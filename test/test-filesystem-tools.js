#!/usr/bin/env node

/**
 * Filesystem Tools Test Suite
 *
 * Tests all filesystem tools with isolated test directory.
 * Creates test fixtures, runs tests, and cleans up.
 */

const { FilesystemTools } = require('../dist/filesystem-tools');
const fs = require('fs');
const path = require('path');
const os = require('os');

// Create isolated test directory
const TEST_DIR = path.join(os.tmpdir(), `mcp-eyes-test-${Date.now()}`);
const fsTools = new FilesystemTools();

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
 * Setup test fixtures
 */
async function setup() {
  console.log('Setting up test fixtures...');

  // Create test directory
  fs.mkdirSync(TEST_DIR, { recursive: true });

  // Create test files
  fs.writeFileSync(path.join(TEST_DIR, 'test1.txt'), 'Hello World');
  fs.writeFileSync(path.join(TEST_DIR, 'test2.txt'), 'This is more test content');
  fs.writeFileSync(
    path.join(TEST_DIR, 'multiline.txt'),
    'Line 1\nLine 2\nLine 3\nLine 4\nLine 5'
  );
  fs.writeFileSync(
    path.join(TEST_DIR, 'test.json'),
    JSON.stringify({ key: 'value', number: 42 }, null, 2)
  );

  // Create subdirectory with files
  const subDir = path.join(TEST_DIR, 'subdir');
  fs.mkdirSync(subDir, { recursive: true });
  fs.writeFileSync(path.join(subDir, 'nested.txt'), 'Nested file content');

  console.log(`Test directory: ${TEST_DIR}\n`);
}

/**
 * Cleanup test fixtures
 */
function cleanup() {
  try {
    fs.rmSync(TEST_DIR, { recursive: true, force: true });
  } catch (e) {
    // Ignore cleanup errors
  }
}

/**
 * Test: fs_list - List directory contents
 */
async function testFsList() {
  console.log('\n[fs_list] List directory contents');

  try {
    const result = await fsTools.listDirectory({ path: TEST_DIR });
    if (!result.entries || !Array.isArray(result.entries)) {
      throw new Error('Expected entries array');
    }
    if (result.entries.length < 4) {
      throw new Error(`Expected at least 4 entries, got ${result.entries.length}`);
    }
    // Check entry structure
    const hasFiles = result.entries.some(e => e.type === 'file');
    const hasDirs = result.entries.some(e => e.type === 'directory');
    if (!hasFiles) throw new Error('No files found');
    if (!hasDirs) throw new Error('No directories found');
    pass('Lists files and directories');
  } catch (e) {
    fail('Lists files and directories', e);
  }

  try {
    const result = await fsTools.listDirectory({
      path: TEST_DIR,
      recursive: true,
      max_depth: 2
    });
    const nestedFile = result.entries.find(e => e.path.includes('nested.txt'));
    if (!nestedFile) {
      throw new Error('Nested file not found in recursive listing');
    }
    pass('Recursive listing works');
  } catch (e) {
    fail('Recursive listing works', e);
  }
}

/**
 * Test: fs_read - Read file contents
 */
async function testFsRead() {
  console.log('\n[fs_read] Read file contents');

  try {
    const result = await fsTools.readFile({ path: path.join(TEST_DIR, 'test1.txt') });
    if (result.content !== 'Hello World') {
      throw new Error(`Expected 'Hello World', got '${result.content}'`);
    }
    if (typeof result.size !== 'number') {
      throw new Error('Expected size to be a number');
    }
    pass('Reads file content correctly');
  } catch (e) {
    fail('Reads file content correctly', e);
  }

  try {
    const result = await fsTools.readFile({
      path: path.join(TEST_DIR, 'multiline.txt'),
      max_bytes: 10
    });
    if (result.content.length > 10) {
      throw new Error('Content should be truncated');
    }
    if (!result.truncated) {
      throw new Error('truncated flag should be true');
    }
    pass('Respects max_bytes limit');
  } catch (e) {
    fail('Respects max_bytes limit', e);
  }

  try {
    await fsTools.readFile({ path: path.join(TEST_DIR, 'nonexistent.txt') });
    fail('Throws on missing file', new Error('Should have thrown'));
  } catch (e) {
    if (e.code === 'ENOENT') {
      pass('Throws on missing file');
    } else {
      fail('Throws on missing file', e);
    }
  }
}

/**
 * Test: fs_read_range - Read file by line range
 */
async function testFsReadRange() {
  console.log('\n[fs_read_range] Read file by line range');

  try {
    const result = await fsTools.readFileRange({
      path: path.join(TEST_DIR, 'multiline.txt'),
      start_line: 2,
      end_line: 4
    });
    const lines = result.content.split('\n');
    if (lines.length !== 3) {
      throw new Error(`Expected 3 lines, got ${lines.length}`);
    }
    if (!result.content.includes('Line 2')) {
      throw new Error('Should include Line 2');
    }
    if (result.total_lines !== 5) {
      throw new Error(`Expected 5 total lines, got ${result.total_lines}`);
    }
    pass('Reads correct line range');
  } catch (e) {
    fail('Reads correct line range', e);
  }

  try {
    await fsTools.readFileRange({
      path: path.join(TEST_DIR, 'multiline.txt'),
      start_line: 10,
      end_line: 15
    });
    fail('Throws on invalid range', new Error('Should have thrown'));
  } catch (e) {
    if (e.message.includes('exceeds file length')) {
      pass('Throws on invalid range');
    } else {
      fail('Throws on invalid range', e);
    }
  }
}

/**
 * Test: fs_write - Write file contents
 */
async function testFsWrite() {
  console.log('\n[fs_write] Write file contents');

  try {
    const content = 'Written by test';
    const result = await fsTools.writeFile({
      path: path.join(TEST_DIR, 'written.txt'),
      content
    });
    if (result.bytes_written !== Buffer.byteLength(content)) {
      throw new Error('Bytes written mismatch');
    }
    const readBack = fs.readFileSync(path.join(TEST_DIR, 'written.txt'), 'utf-8');
    if (readBack !== content) {
      throw new Error('Content mismatch after write');
    }
    pass('Writes file correctly');
  } catch (e) {
    fail('Writes file correctly', e);
  }

  try {
    await fsTools.writeFile({
      path: path.join(TEST_DIR, 'written.txt'),
      content: '\nAppended!',
      mode: 'append'
    });
    const readBack = fs.readFileSync(path.join(TEST_DIR, 'written.txt'), 'utf-8');
    if (!readBack.includes('Appended!')) {
      throw new Error('Append mode failed');
    }
    pass('Append mode works');
  } catch (e) {
    fail('Append mode works', e);
  }

  try {
    await fsTools.writeFile({
      path: path.join(TEST_DIR, 'newdir', 'newfile.txt'),
      content: 'Created with dirs',
      create_dirs: true
    });
    const exists = fs.existsSync(path.join(TEST_DIR, 'newdir', 'newfile.txt'));
    if (!exists) {
      throw new Error('File not created with dirs');
    }
    pass('Creates parent directories');
  } catch (e) {
    fail('Creates parent directories', e);
  }
}

/**
 * Test: fs_delete - Delete files and directories
 */
async function testFsDelete() {
  console.log('\n[fs_delete] Delete files and directories');

  // Create a file to delete
  const fileToDelete = path.join(TEST_DIR, 'to_delete.txt');
  fs.writeFileSync(fileToDelete, 'Delete me');

  try {
    const result = await fsTools.deletePath({ path: fileToDelete });
    if (!result.deleted) {
      throw new Error('deleted should be true');
    }
    if (fs.existsSync(fileToDelete)) {
      throw new Error('File still exists');
    }
    pass('Deletes file');
  } catch (e) {
    fail('Deletes file', e);
  }

  // Create directory to delete
  const dirToDelete = path.join(TEST_DIR, 'to_delete_dir');
  fs.mkdirSync(dirToDelete);
  fs.writeFileSync(path.join(dirToDelete, 'file.txt'), 'content');

  try {
    await fsTools.deletePath({ path: dirToDelete, recursive: false });
    fail('Throws on non-empty directory without recursive', new Error('Should throw'));
  } catch (e) {
    if (e.message.includes('not empty')) {
      pass('Throws on non-empty directory without recursive');
    } else {
      fail('Throws on non-empty directory without recursive', e);
    }
  }

  try {
    await fsTools.deletePath({ path: dirToDelete, recursive: true });
    if (fs.existsSync(dirToDelete)) {
      throw new Error('Directory still exists');
    }
    pass('Recursive delete works');
  } catch (e) {
    fail('Recursive delete works', e);
  }
}

/**
 * Test: fs_move - Move/rename files
 */
async function testFsMove() {
  console.log('\n[fs_move] Move/rename files');

  const src = path.join(TEST_DIR, 'move_source.txt');
  const dst = path.join(TEST_DIR, 'move_dest.txt');
  fs.writeFileSync(src, 'Move me');

  try {
    const result = await fsTools.movePath({ from: src, to: dst });
    if (!result.moved) {
      throw new Error('moved should be true');
    }
    if (fs.existsSync(src)) {
      throw new Error('Source still exists');
    }
    if (!fs.existsSync(dst)) {
      throw new Error('Destination not created');
    }
    pass('Moves file correctly');
  } catch (e) {
    fail('Moves file correctly', e);
  }

  // Cleanup
  try { fs.unlinkSync(dst); } catch (e) {}
}

/**
 * Test: fs_search - Search for files
 */
async function testFsSearch() {
  console.log('\n[fs_search] Search for files');

  try {
    const result = await fsTools.searchFiles({
      base: TEST_DIR,
      glob: '*.txt'
    });
    if (!result.matches || result.matches.length < 2) {
      throw new Error(`Expected at least 2 .txt files, got ${result.matches.length}`);
    }
    const allTxt = result.matches.every(m => m.path.endsWith('.txt'));
    if (!allTxt) {
      throw new Error('Should only find .txt files');
    }
    pass('Finds files by glob pattern');
  } catch (e) {
    fail('Finds files by glob pattern', e);
  }

  try {
    const result = await fsTools.searchFiles({
      base: TEST_DIR,
      glob: '**/*.txt'
    });
    const hasNested = result.matches.some(m => m.path.includes('nested.txt'));
    if (!hasNested) {
      throw new Error('Should find nested files with **');
    }
    pass('Recursive glob works');
  } catch (e) {
    fail('Recursive glob works', e);
  }
}

/**
 * Test: fs_grep - Search within files
 */
async function testFsGrep() {
  console.log('\n[fs_grep] Search within files');

  try {
    const result = await fsTools.grepFiles({
      base: TEST_DIR,
      pattern: 'Hello'
    });
    if (!result.matches || result.matches.length === 0) {
      throw new Error('Should find "Hello" in test1.txt');
    }
    const match = result.matches[0];
    if (!match.path || typeof match.line !== 'number' || !match.text) {
      throw new Error('Match should have path, line, and text');
    }
    pass('Finds text in files');
  } catch (e) {
    fail('Finds text in files', e);
  }

  try {
    const result = await fsTools.grepFiles({
      base: TEST_DIR,
      pattern: 'NONEXISTENT_STRING_12345'
    });
    if (result.matches.length !== 0) {
      throw new Error('Should not find nonexistent pattern');
    }
    pass('Returns empty for no matches');
  } catch (e) {
    fail('Returns empty for no matches', e);
  }
}

/**
 * Test: fs_patch - Patch file contents
 */
async function testFsPatch() {
  console.log('\n[fs_patch] Patch file contents');

  // Create a file for patching
  const patchFile = path.join(TEST_DIR, 'patch_test.txt');
  fs.writeFileSync(patchFile, 'Hello World\nThis is a test\nGoodbye World');

  try {
    const result = await fsTools.patchFile({
      path: patchFile,
      operations: [
        { type: 'replace_first', pattern: 'Hello', replacement: 'Hi' }
      ],
      dry_run: true
    });
    if (result.operations_applied !== 1) {
      throw new Error('Expected 1 operation applied');
    }
    if (!result.preview) {
      throw new Error('Expected preview in dry run');
    }
    // Verify file unchanged
    const content = fs.readFileSync(patchFile, 'utf-8');
    if (!content.includes('Hello')) {
      throw new Error('File should not be changed in dry run');
    }
    pass('Dry run works');
  } catch (e) {
    fail('Dry run works', e);
  }

  try {
    await fsTools.patchFile({
      path: patchFile,
      operations: [
        { type: 'replace_first', pattern: 'Hello', replacement: 'Hi' }
      ]
    });
    const content = fs.readFileSync(patchFile, 'utf-8');
    if (!content.includes('Hi World')) {
      throw new Error('replace_first should have worked');
    }
    pass('replace_first operation works');
  } catch (e) {
    fail('replace_first operation works', e);
  }

  try {
    await fsTools.patchFile({
      path: patchFile,
      operations: [
        { type: 'insert_after', match: 'test', insert: 'INSERTED LINE' }
      ]
    });
    const content = fs.readFileSync(patchFile, 'utf-8');
    if (!content.includes('INSERTED LINE')) {
      throw new Error('insert_after should have worked');
    }
    pass('insert_after operation works');
  } catch (e) {
    fail('insert_after operation works', e);
  }

  // Cleanup
  try { fs.unlinkSync(patchFile); } catch (e) {}
}

/**
 * Run all tests
 */
async function runTests() {
  console.log('Filesystem Tools Test Suite');
  console.log('═'.repeat(50));

  try {
    await setup();

    await testFsList();
    await testFsRead();
    await testFsReadRange();
    await testFsWrite();
    await testFsDelete();
    await testFsMove();
    await testFsSearch();
    await testFsGrep();
    await testFsPatch();

  } finally {
    cleanup();
  }

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
  cleanup();
  process.exit(1);
});
