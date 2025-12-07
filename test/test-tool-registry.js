#!/usr/bin/env node

/**
 * Tool Registry Test Suite
 *
 * Tests tool registration, profile management, and configuration.
 */

const { ToolRegistry } = require('../dist/tool-registry');
const fs = require('fs');
const path = require('path');
const os = require('os');

// Create isolated test config path
const TEST_CONFIG_PATH = path.join(os.tmpdir(), `mcp-eyes-test-registry-${Date.now()}.json`);

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
 * Cleanup test config
 */
function cleanup() {
  try {
    fs.unlinkSync(TEST_CONFIG_PATH);
  } catch (e) {
    // Ignore
  }
}

/**
 * Create sample tool definitions for testing
 */
function createSampleTools() {
  return [
    {
      id: 'fs_read',
      name: 'fs_read',
      description: 'Read file contents',
      category: 'filesystem',
      inputSchema: { type: 'object', properties: { path: { type: 'string' } } },
      enabled: true
    },
    {
      id: 'fs_write',
      name: 'fs_write',
      description: 'Write file contents',
      category: 'filesystem',
      inputSchema: { type: 'object', properties: { path: { type: 'string' }, content: { type: 'string' } } },
      enabled: true
    },
    {
      id: 'shell_exec',
      name: 'shell_exec',
      description: 'Execute shell command',
      category: 'shell',
      inputSchema: { type: 'object', properties: { command: { type: 'string' } } },
      enabled: true
    },
    {
      id: 'browser_click',
      name: 'browser_click',
      description: 'Click element in browser',
      category: 'browser',
      inputSchema: { type: 'object', properties: { selector: { type: 'string' } } },
      enabled: false // Disabled by default
    }
  ];
}

/**
 * Test: Constructor and initialization
 */
async function testConstructor() {
  console.log('\n[constructor] Initialization');

  try {
    const registry = new ToolRegistry(TEST_CONFIG_PATH);
    const config = registry.getConfig();

    if (!config) {
      throw new Error('Config should not be null');
    }
    if (config.version !== 1) {
      throw new Error(`Expected version 1, got ${config.version}`);
    }
    if (config.activeProfile !== 'default') {
      throw new Error(`Expected activeProfile "default", got ${config.activeProfile}`);
    }
    if (!Array.isArray(config.profiles)) {
      throw new Error('profiles should be an array');
    }
    pass('Creates default config');
  } catch (e) {
    fail('Creates default config', e);
  }

  // Verify file was created
  try {
    if (!fs.existsSync(TEST_CONFIG_PATH)) {
      throw new Error('Config file should be created');
    }
    const content = JSON.parse(fs.readFileSync(TEST_CONFIG_PATH, 'utf-8'));
    if (!content.version) {
      throw new Error('Config file should have version');
    }
    pass('Persists config to file');
  } catch (e) {
    fail('Persists config to file', e);
  }

  cleanup();
}

/**
 * Test: Tool registration
 */
async function testRegisterTool() {
  console.log('\n[registerTool] Tool registration');

  cleanup();
  const registry = new ToolRegistry(TEST_CONFIG_PATH);
  const tools = createSampleTools();

  try {
    // Register first tool
    registry.registerTool(tools[0]);

    const config = registry.getConfig();
    const defaultProfile = config.profiles.find(p => p.id === 'default');

    if (!defaultProfile) {
      throw new Error('Default profile should exist');
    }

    const fsCategory = defaultProfile.categories.find(c => c.id === 'filesystem');
    if (!fsCategory) {
      throw new Error('Filesystem category should be created');
    }

    const fsTool = fsCategory.tools.find(t => t.id === 'fs_read');
    if (!fsTool) {
      throw new Error('Tool should be added to category');
    }
    pass('Registers tool and creates category');
  } catch (e) {
    fail('Registers tool and creates category', e);
  }

  try {
    // Register multiple tools
    tools.forEach(t => registry.registerTool(t));

    const config = registry.getConfig();
    const defaultProfile = config.profiles.find(p => p.id === 'default');

    // Check categories
    const categories = defaultProfile.categories.map(c => c.id);
    if (!categories.includes('filesystem')) {
      throw new Error('Should have filesystem category');
    }
    if (!categories.includes('shell')) {
      throw new Error('Should have shell category');
    }
    if (!categories.includes('browser')) {
      throw new Error('Should have browser category');
    }
    pass('Creates multiple categories');
  } catch (e) {
    fail('Creates multiple categories', e);
  }

  try {
    // Register same tool twice (should update, not duplicate)
    const toolCount = registry.getConfig().profiles[0].categories
      .flatMap(c => c.tools).length;

    registry.registerTool(tools[0]);

    const newToolCount = registry.getConfig().profiles[0].categories
      .flatMap(c => c.tools).length;

    if (newToolCount !== toolCount) {
      throw new Error('Should not duplicate tool');
    }
    pass('Does not duplicate tools');
  } catch (e) {
    fail('Does not duplicate tools', e);
  }

  cleanup();
}

/**
 * Test: getEnabledTools
 */
async function testGetEnabledTools() {
  console.log('\n[getEnabledTools] Getting enabled tools');

  cleanup();
  const registry = new ToolRegistry(TEST_CONFIG_PATH);
  const tools = createSampleTools();

  // Register all tools
  tools.forEach(t => registry.registerTool(t));

  try {
    const enabledTools = registry.getEnabledTools();

    if (!Array.isArray(enabledTools)) {
      throw new Error('Should return an array');
    }

    // Should have 3 enabled tools (fs_read, fs_write, shell_exec)
    // browser_click is disabled
    const enabledIds = enabledTools.map(t => t.id);

    if (!enabledIds.includes('fs_read')) {
      throw new Error('fs_read should be enabled');
    }
    if (!enabledIds.includes('shell_exec')) {
      throw new Error('shell_exec should be enabled');
    }
    if (enabledIds.includes('browser_click')) {
      throw new Error('browser_click should be disabled');
    }
    pass('Returns only enabled tools');
  } catch (e) {
    fail('Returns only enabled tools', e);
  }

  cleanup();
}

/**
 * Test: isToolEnabled
 */
async function testIsToolEnabled() {
  console.log('\n[isToolEnabled] Check tool enabled status');

  cleanup();
  const registry = new ToolRegistry(TEST_CONFIG_PATH);
  const tools = createSampleTools();
  tools.forEach(t => registry.registerTool(t));

  try {
    if (!registry.isToolEnabled('fs_read')) {
      throw new Error('fs_read should be enabled');
    }
    if (!registry.isToolEnabled('shell_exec')) {
      throw new Error('shell_exec should be enabled');
    }
    pass('Returns true for enabled tools');
  } catch (e) {
    fail('Returns true for enabled tools', e);
  }

  try {
    if (registry.isToolEnabled('browser_click')) {
      throw new Error('browser_click should be disabled');
    }
    if (registry.isToolEnabled('nonexistent_tool')) {
      throw new Error('nonexistent tool should be disabled');
    }
    pass('Returns false for disabled/missing tools');
  } catch (e) {
    fail('Returns false for disabled/missing tools', e);
  }

  cleanup();
}

/**
 * Test: getTool
 */
async function testGetTool() {
  console.log('\n[getTool] Get tool definition');

  cleanup();
  const registry = new ToolRegistry(TEST_CONFIG_PATH);
  const tools = createSampleTools();
  tools.forEach(t => registry.registerTool(t));

  try {
    const tool = registry.getTool('fs_read');
    if (!tool) {
      throw new Error('Should find tool by id');
    }
    if (tool.description !== 'Read file contents') {
      throw new Error('Should return correct tool definition');
    }
    pass('Finds tool by id');
  } catch (e) {
    fail('Finds tool by id', e);
  }

  try {
    const tool = registry.getTool('nonexistent');
    if (tool !== undefined) {
      throw new Error('Should return undefined for missing tool');
    }
    pass('Returns undefined for missing tool');
  } catch (e) {
    fail('Returns undefined for missing tool', e);
  }

  cleanup();
}

/**
 * Test: getMCPToolDefinitions
 */
async function testGetMCPToolDefinitions() {
  console.log('\n[getMCPToolDefinitions] MCP format export');

  cleanup();
  const registry = new ToolRegistry(TEST_CONFIG_PATH);
  const tools = createSampleTools();
  tools.forEach(t => registry.registerTool(t));

  try {
    const mcpTools = registry.getMCPToolDefinitions();

    if (!Array.isArray(mcpTools)) {
      throw new Error('Should return array');
    }

    const firstTool = mcpTools[0];
    if (!firstTool.name) {
      throw new Error('Should have name property');
    }
    if (!firstTool.description) {
      throw new Error('Should have description property');
    }
    if (!firstTool.inputSchema) {
      throw new Error('Should have inputSchema property');
    }

    // Should not have internal properties
    if (firstTool.id || firstTool.category || firstTool.enabled !== undefined) {
      throw new Error('Should not expose internal properties');
    }
    pass('Returns MCP-formatted tool definitions');
  } catch (e) {
    fail('Returns MCP-formatted tool definitions', e);
  }

  cleanup();
}

/**
 * Test: updateConfig
 */
async function testUpdateConfig() {
  console.log('\n[updateConfig] Config updates');

  cleanup();
  const registry = new ToolRegistry(TEST_CONFIG_PATH);
  const tools = createSampleTools();
  tools.forEach(t => registry.registerTool(t));

  try {
    const config = registry.getConfig();

    // Disable a tool
    const fsCategory = config.profiles[0].categories.find(c => c.id === 'filesystem');
    const fsReadTool = fsCategory.tools.find(t => t.id === 'fs_read');
    fsReadTool.enabled = false;

    registry.updateConfig(config);

    // Verify change persisted
    if (registry.isToolEnabled('fs_read')) {
      throw new Error('fs_read should now be disabled');
    }
    pass('Updates tool enabled state');
  } catch (e) {
    fail('Updates tool enabled state', e);
  }

  try {
    // Verify persisted to file
    const fileContent = JSON.parse(fs.readFileSync(TEST_CONFIG_PATH, 'utf-8'));
    const fsCategory = fileContent.profiles[0].categories.find(c => c.id === 'filesystem');
    const fsReadTool = fsCategory.tools.find(t => t.id === 'fs_read');

    if (fsReadTool.enabled !== false) {
      throw new Error('Change should be persisted to file');
    }
    pass('Persists changes to file');
  } catch (e) {
    fail('Persists changes to file', e);
  }

  cleanup();
}

/**
 * Test: loadConfig (reload from file)
 */
async function testLoadConfig() {
  console.log('\n[loadConfig] Config loading');

  cleanup();

  // Create a config file first
  const initialConfig = {
    version: 1,
    activeProfile: 'custom',
    profiles: [{
      id: 'custom',
      label: 'Custom Profile',
      enabled: true,
      categories: [{
        id: 'test',
        label: 'Test Category',
        enabled: true,
        tools: [{
          id: 'test_tool',
          name: 'test_tool',
          description: 'Test tool',
          category: 'test',
          inputSchema: {},
          enabled: true
        }]
      }]
    }]
  };

  fs.writeFileSync(TEST_CONFIG_PATH, JSON.stringify(initialConfig, null, 2));

  try {
    const registry = new ToolRegistry(TEST_CONFIG_PATH);
    const config = registry.getConfig();

    if (config.activeProfile !== 'custom') {
      throw new Error('Should load activeProfile from file');
    }

    const customProfile = config.profiles.find(p => p.id === 'custom');
    if (!customProfile) {
      throw new Error('Should load custom profile');
    }
    pass('Loads existing config from file');
  } catch (e) {
    fail('Loads existing config from file', e);
  }

  cleanup();
}

/**
 * Test: Category labels
 */
async function testCategoryLabels() {
  console.log('\n[category labels] Human-readable labels');

  cleanup();
  const registry = new ToolRegistry(TEST_CONFIG_PATH);
  const tools = createSampleTools();
  tools.forEach(t => registry.registerTool(t));

  try {
    const config = registry.getConfig();
    const defaultProfile = config.profiles.find(p => p.id === 'default');

    const fsCategory = defaultProfile.categories.find(c => c.id === 'filesystem');
    if (fsCategory.label !== 'Filesystem Tools') {
      throw new Error(`Expected "Filesystem Tools", got "${fsCategory.label}"`);
    }

    const shellCategory = defaultProfile.categories.find(c => c.id === 'shell');
    if (shellCategory.label !== 'Shell Tools') {
      throw new Error(`Expected "Shell Tools", got "${shellCategory.label}"`);
    }
    pass('Creates human-readable category labels');
  } catch (e) {
    fail('Creates human-readable category labels', e);
  }

  cleanup();
}

/**
 * Test: Profile disabled
 */
async function testProfileDisabled() {
  console.log('\n[profile disabled] Disabled profile handling');

  cleanup();
  const registry = new ToolRegistry(TEST_CONFIG_PATH);
  const tools = createSampleTools();
  tools.forEach(t => registry.registerTool(t));

  try {
    const config = registry.getConfig();
    config.profiles[0].enabled = false;
    registry.updateConfig(config);

    const enabledTools = registry.getEnabledTools();
    if (enabledTools.length !== 0) {
      throw new Error('No tools should be enabled when profile is disabled');
    }
    pass('Returns no tools when profile disabled');
  } catch (e) {
    fail('Returns no tools when profile disabled', e);
  }

  cleanup();
}

/**
 * Test: Category disabled
 */
async function testCategoryDisabled() {
  console.log('\n[category disabled] Disabled category handling');

  cleanup();
  const registry = new ToolRegistry(TEST_CONFIG_PATH);
  const tools = createSampleTools();
  tools.forEach(t => registry.registerTool(t));

  try {
    const config = registry.getConfig();
    const fsCategory = config.profiles[0].categories.find(c => c.id === 'filesystem');
    fsCategory.enabled = false;
    registry.updateConfig(config);

    const enabledTools = registry.getEnabledTools();
    const fsToolEnabled = enabledTools.some(t => t.category === 'filesystem');

    if (fsToolEnabled) {
      throw new Error('Filesystem tools should be disabled');
    }

    // Shell tools should still be enabled
    const shellToolEnabled = enabledTools.some(t => t.id === 'shell_exec');
    if (!shellToolEnabled) {
      throw new Error('Shell tools should still be enabled');
    }
    pass('Disables all tools in disabled category');
  } catch (e) {
    fail('Disables all tools in disabled category', e);
  }

  cleanup();
}

/**
 * Run all tests
 */
async function runTests() {
  console.log('Tool Registry Test Suite');
  console.log('═'.repeat(50));
  console.log(`Test config: ${TEST_CONFIG_PATH}`);

  await testConstructor();
  await testRegisterTool();
  await testGetEnabledTools();
  await testIsToolEnabled();
  await testGetTool();
  await testGetMCPToolDefinitions();
  await testUpdateConfig();
  await testLoadConfig();
  await testCategoryLabels();
  await testProfileDisabled();
  await testCategoryDisabled();

  // Final cleanup
  cleanup();

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
