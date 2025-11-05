#!/usr/bin/env node

/**
 * Set Executable Permissions
 *
 * This script sets executable permissions on built server files.
 * It runs automatically after the build step to ensure the files
 * can be executed directly.
 */

const fs = require('fs');
const path = require('path');

// Files that need executable permissions
const executableFiles = [
  path.join(__dirname, '..', 'dist', 'basic-server.js'),
  path.join(__dirname, '..', 'dist', 'advanced-server-simple.js')
];

console.log('Setting executable permissions...');

let successCount = 0;
let errorCount = 0;

executableFiles.forEach(file => {
  try {
    if (fs.existsSync(file)) {
      // On Windows, this does nothing but doesn't fail
      // On Unix/macOS, this sets the executable bit
      fs.chmodSync(file, 0o755);
      console.log(`✓ Set executable: ${path.basename(file)}`);
      successCount++;
    } else {
      console.warn(`⚠ File not found: ${path.basename(file)}`);
      errorCount++;
    }
  } catch (error) {
    console.error(`✗ Failed to set permissions on ${path.basename(file)}: ${error.message}`);
    errorCount++;
  }
});

console.log(`\nComplete: ${successCount} succeeded, ${errorCount} failed`);

if (errorCount > 0) {
  console.error('\n⚠️  Some files failed to set executable permissions');
  console.error('This may not be critical on Windows, but is required on Unix/macOS');
  // Don't fail the build on Windows where this might not work
  if (process.platform !== 'win32') {
    process.exit(1);
  }
} else {
  console.log('✓ All executable permissions set successfully');
}
