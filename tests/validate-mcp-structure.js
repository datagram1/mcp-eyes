#!/usr/bin/env node

/**
 * MCP Server Structure Validator
 *
 * This script validates that both MCP servers (basic and advanced) have:
 * - Correct tool definitions
 * - Proper handler implementations
 * - Valid MCP protocol compliance
 * - Feature parity where expected
 */

const fs = require('fs');
const path = require('path');

let hasErrors = false;

function error(message) {
  console.error(`❌ ERROR: ${message}`);
  hasErrors = true;
}

function success(message) {
  console.log(`✓ ${message}`);
}

function validateFileExists(filePath, description) {
  if (!fs.existsSync(filePath)) {
    error(`${description} not found: ${filePath}`);
    return false;
  }
  success(`${description} exists`);
  return true;
}

function validateServerFile(serverPath, serverName, requiredTools) {
  console.log(`\n📋 Validating ${serverName}...`);

  if (!validateFileExists(serverPath, serverName)) {
    return;
  }

  const content = fs.readFileSync(serverPath, 'utf8');

  // Check for MCP SDK imports
  if (!content.includes('@modelcontextprotocol/sdk')) {
    error(`${serverName}: Missing MCP SDK imports`);
  } else {
    success(`${serverName}: Has MCP SDK imports`);
  }

  // Check for Server class
  if (!content.includes('new Server(')) {
    error(`${serverName}: Missing Server initialization`);
  } else {
    success(`${serverName}: Has Server initialization`);
  }

  // Check for StdioServerTransport
  if (!content.includes('StdioServerTransport')) {
    error(`${serverName}: Missing StdioServerTransport`);
  } else {
    success(`${serverName}: Has StdioServerTransport`);
  }

  // Check for required tools
  console.log(`\n  Checking required tools in ${serverName}:`);
  requiredTools.forEach(tool => {
    const toolDefRegex = new RegExp(`name:\\s*['"\`]${tool}['"\`]`, 'm');
    const handlerRegex = new RegExp(`case\\s+['"\`]${tool}['"\`]:`, 'm');

    if (!toolDefRegex.test(content)) {
      error(`  ${serverName}: Missing tool definition for '${tool}'`);
    } else if (!handlerRegex.test(content)) {
      error(`  ${serverName}: Missing handler case for '${tool}'`);
    } else {
      success(`  ${tool}`);
    }
  });

  // Check for error handling
  if (!content.includes('try') || !content.includes('catch')) {
    error(`${serverName}: Missing try-catch error handling`);
  } else {
    success(`${serverName}: Has error handling`);
  }

  // Check for proper response format
  if (!content.includes('content:') || !content.includes('type:')) {
    error(`${serverName}: Missing proper response format`);
  } else {
    success(`${serverName}: Has proper response format`);
  }
}

console.log('🔍 Validating MCP Server Structure\n');
console.log('='.repeat(50));

// Validate source files exist
const srcBasic = path.join(__dirname, '..', 'src', 'basic-server.ts');
const srcAdvanced = path.join(__dirname, '..', 'src', 'advanced-server-simple.ts');
const distBasic = path.join(__dirname, '..', 'dist', 'basic-server.js');
const distAdvanced = path.join(__dirname, '..', 'dist', 'advanced-server-simple.js');

// Define required tools for each server
const basicTools = [
  'listApplications',
  'focusApplication',
  'closeApp',
  'click',
  'moveMouse',
  'screenshot',
  'getClickableElements',
  'clickElement'
];

const advancedTools = [
  ...basicTools,
  'typeText',
  'pressKey',
  'doubleClick',
  'scrollMouse',
  'getMousePosition',
  'wait'
];

// Validate source files
validateServerFile(srcBasic, 'Basic Server (src)', basicTools);
validateServerFile(srcAdvanced, 'Advanced Server (src)', advancedTools);

// Validate dist files exist
console.log('\n📦 Validating Build Output...');
validateFileExists(distBasic, 'Basic Server dist');
validateFileExists(distAdvanced, 'Advanced Server dist');

// Validate executable permissions on Unix systems
if (process.platform !== 'win32') {
  console.log('\n🔐 Validating Executable Permissions...');
  try {
    fs.accessSync(distBasic, fs.constants.X_OK);
    success('Basic Server is executable');
  } catch (e) {
    error('Basic Server is not executable');
  }

  try {
    fs.accessSync(distAdvanced, fs.constants.X_OK);
    success('Advanced Server is executable');
  } catch (e) {
    error('Advanced Server is not executable');
  }
}

// Validate package.json
console.log('\n📄 Validating package.json...');
const packagePath = path.join(__dirname, '..', 'package.json');
if (validateFileExists(packagePath, 'package.json')) {
  const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf8'));

  if (!pkg.bin || !pkg.bin['mcp-eyes'] || !pkg.bin['mcp-eyes-basic']) {
    error('package.json: Missing or incomplete bin configuration');
  } else {
    success('package.json: Has correct bin configuration');
  }

  if (!pkg.main) {
    error('package.json: Missing main field');
  } else {
    success('package.json: Has main field');
  }

  const requiredDeps = [
    '@modelcontextprotocol/sdk',
    '@nut-tree-fork/nut-js',
    '@jxa/run',
    'screenshot-desktop',
    'sharp'
  ];

  requiredDeps.forEach(dep => {
    if (!pkg.dependencies || !pkg.dependencies[dep]) {
      error(`package.json: Missing dependency '${dep}'`);
    } else {
      success(`package.json: Has dependency '${dep}'`);
    }
  });
}

// Check for version consistency
console.log('\n🔢 Validating Version Consistency...');
const versionPath = path.join(__dirname, '..', 'version.json');
if (validateFileExists(versionPath, 'version.json')) {
  const versionData = JSON.parse(fs.readFileSync(versionPath, 'utf8'));
  const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf8'));

  if (versionData.version !== pkg.version) {
    error(`Version mismatch: version.json (${versionData.version}) != package.json (${pkg.version})`);
  } else {
    success(`Version consistent: ${pkg.version}`);
  }
}

// Final result
console.log('\n' + '='.repeat(50));
if (hasErrors) {
  console.error('\n❌ VALIDATION FAILED - Please fix the errors above\n');
  process.exit(1);
} else {
  console.log('\n✅ ALL VALIDATIONS PASSED\n');
  process.exit(0);
}
