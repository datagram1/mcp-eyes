#!/usr/bin/env node
"use strict";
/**
 * MCP Proxy Server for MCP-Eyes
 *
 * This is a lightweight MCP server that proxies requests to the HTTP server.
 * The HTTP server runs with proper accessibility permissions (macOS app or LaunchAgent).
 * This proxy reads the API token from ~/.mcp-eyes-token and forwards requests.
 *
 * ARCHITECTURE:
 *   Cursor/Claude Desktop (stdio) → mcp-proxy-server (stdio) → macOS App HTTP Server (port 3456)
 *
 * CONFIGURATION OPTIONS:
 *
 * 1. NPX (Recommended - auto-updates):
 *    {
 *      "mcpServers": {
 *        "mcp-eyes": {
 *          "command": "npx",
 *          "args": ["-y", "mcp-eyes@latest", "mcp-proxy-server"]
 *        }
 *      }
 *    }
 *
 * 2. Local File Installation (for Cursor):
 *    {
 *      "mcpServers": {
 *        "mcp-eyes": {
 *          "command": "node",
 *          "args": ["/absolute/path/to/mcp-eyes/dist/mcp-proxy-server.js"]
 *        }
 *      }
 *    }
 *
 * 3. Claude Desktop (local file):
 *    {
 *      "mcpServers": {
 *        "mcp-eyes": {
 *          "command": "node",
 *          "args": ["/path/to/mcp-eyes/dist/mcp-proxy-server.js"]
 *        }
 *      }
 *    }
 *
 * PREREQUISITES:
 * - macOS App (MCPEyes.app) must be running and serving HTTP on port 3456
 * - OR Node.js HTTP server must be running (via LaunchAgent or manually)
 * - Token file ~/.mcp-eyes-token must exist (created by the HTTP server)
 *
 * The proxy automatically reads the token file to authenticate with the HTTP backend.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const index_js_1 = require("@modelcontextprotocol/sdk/server/index.js");
const stdio_js_1 = require("@modelcontextprotocol/sdk/server/stdio.js");
const types_js_1 = require("@modelcontextprotocol/sdk/types.js");
const http_1 = __importDefault(require("http"));
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const child_process_1 = require("child_process");
const util_1 = require("util");
const tool_registry_1 = require("./tool-registry");
// NOTE: FilesystemTools and ShellTools are no longer imported here.
// The proxy now relays these to the MCPEyes.app HTTP server which has native implementations.
const execAsync = (0, util_1.promisify)(child_process_1.exec);
const TOKEN_FILE = path_1.default.join(process.env.HOME || '/tmp', '.mcp-eyes-token');
const BROWSER_BRIDGE_PORT = parseInt(process.env.BROWSER_BRIDGE_PORT || '3457', 10);
function loadTokenConfig() {
    try {
        const content = fs_1.default.readFileSync(TOKEN_FILE, 'utf-8');
        return JSON.parse(content);
    }
    catch (err) {
        console.error('Failed to load token file:', err);
        return null;
    }
}
async function httpRequest(config, method, endpoint, body) {
    return new Promise((resolve, reject) => {
        const bodyStr = body ? JSON.stringify(body) : undefined;
        const options = {
            hostname: config.host,
            port: config.port,
            path: endpoint,
            method,
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${config.apiKey}`,
            },
        };
        if (bodyStr) {
            options.headers['Content-Length'] = Buffer.byteLength(bodyStr);
        }
        const req = http_1.default.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => (data += chunk));
            res.on('end', () => {
                try {
                    if (res.statusCode === 401) {
                        reject(new Error('Unauthorized: API key may have changed. Restart MCP-Eyes HTTP server.'));
                        return;
                    }
                    if (res.statusCode !== 200) {
                        reject(new Error(`HTTP ${res.statusCode}: ${data}`));
                        return;
                    }
                    resolve(JSON.parse(data));
                }
                catch (e) {
                    resolve(data);
                }
            });
        });
        req.on('error', (e) => {
            reject(new Error(`Connection failed: ${e.message}. Is MCP-Eyes HTTP server running?`));
        });
        if (bodyStr) {
            req.write(bodyStr);
        }
        req.end();
    });
}
class MCPProxyServer {
    server;
    config = null;
    toolRegistry;
    // NOTE: filesystemTools and shellTools removed - now proxied to MCPEyes.app HTTP server
    constructor() {
        this.server = new index_js_1.Server({
            name: 'mcp-eyes-proxy',
            version: '1.1.15',
        });
        // Initialize tool registry (tools are now proxied to MCPEyes.app)
        this.toolRegistry = new tool_registry_1.ToolRegistry();
        // Register all tools
        this.registerAllTools();
        this.setupToolHandlers();
        this.setupErrorHandling();
    }
    setupErrorHandling() {
        this.server.onerror = (error) => {
            console.error('[MCP Proxy Error]', error);
        };
        process.on('SIGINT', async () => {
            await this.server.close();
            process.exit(0);
        });
    }
    getConfig(forceReload = false) {
        if (!this.config || forceReload) {
            this.config = loadTokenConfig();
        }
        if (!this.config) {
            throw new Error('MCP-Eyes HTTP server not running. Start it with: node dist/http-server.js\n' +
                'Or install as service: ./scripts/install-service.sh');
        }
        return this.config;
    }
    async proxyCall(endpoint, method = 'GET', body) {
        const config = this.getConfig();
        try {
            return await httpRequest(config, method, endpoint, body);
        }
        catch (err) {
            // On 401, reload config in case API key changed and retry once
            if (err.message?.includes('Unauthorized')) {
                const newConfig = this.getConfig(true);
                return await httpRequest(newConfig, method, endpoint, body);
            }
            throw err;
        }
    }
    /**
     * Make HTTP request to Browser Bridge Server (for browser extension commands)
     */
    async browserProxyCall(endpoint, method = 'GET', body) {
        return new Promise((resolve, reject) => {
            const options = {
                hostname: '127.0.0.1',
                port: BROWSER_BRIDGE_PORT,
                path: endpoint,
                method,
                headers: {
                    'Content-Type': 'application/json',
                },
            };
            const req = http_1.default.request(options, (res) => {
                let data = '';
                res.on('data', (chunk) => (data += chunk));
                res.on('end', () => {
                    try {
                        if (res.statusCode !== 200) {
                            const parsed = JSON.parse(data);
                            reject(new Error(parsed.error || `HTTP ${res.statusCode}`));
                            return;
                        }
                        resolve(JSON.parse(data));
                    }
                    catch (e) {
                        resolve(data);
                    }
                });
            });
            req.on('error', (e) => {
                reject(new Error(`Browser bridge not running: ${e.message}. Start it with: node dist/browser-bridge-server.js`));
            });
            req.setTimeout(35000, () => {
                req.destroy();
                reject(new Error('Browser bridge request timeout'));
            });
            if (body) {
                req.write(JSON.stringify(body));
            }
            req.end();
        });
    }
    /**
     * Check if browser bridge is running and has connected extensions
     */
    async getConnectedBrowsers() {
        try {
            const result = await this.browserProxyCall('/browsers');
            return result;
        }
        catch {
            // Browser bridge not running or no browsers connected
            return null;
        }
    }
    /**
     * Get window information for an application using AppleScript (fallback)
     */
    async getWindowsViaAppleScript(bundleId, appName) {
        try {
            const escapedBundleId = (bundleId || '').replace(/"/g, '\\"');
            const escapedAppName = (appName || '').replace(/"/g, '\\"');
            // Prefer bundle identifier for targeting, fall back to application name if needed
            const scriptFile = path_1.default.join(process.env.TMPDIR || '/tmp', `mcp-eyes-windows-${Date.now()}.scpt`);
            const fullScript = `tell application "System Events"
  set targetProc to missing value
  if "${escapedBundleId}" is not "" then
    try
      set targetProc to first process whose bundle identifier is "${escapedBundleId}"
    end try
  end if
  if targetProc is missing value then
    try
      set targetProc to first process whose name is "${escapedAppName}"
    end try
  end if
  if targetProc is missing value then return ""

  set winCount to count of windows of targetProc
  if winCount = 0 then return ""

  set outputList to {}

  repeat with i from 1 to winCount
    set winRef to window i of targetProc
    try
      set winTitle to ""
      try
        set winTitle to title of winRef
      end try

      set winPos to {0, 0}
      set winSize to {0, 0}
      try
        set winPos to position of winRef
        set winSize to size of winRef
      end try

      set posX to item 1 of winPos as string
      set posY to item 2 of winPos as string
      set sizeW to item 1 of winSize as string
      set sizeH to item 2 of winSize as string

      set winMinimized to "false"
      try
        set winMinimized to minimized of winRef as string
      end try

      set end of outputList to winTitle & "|" & posX & "," & posY & "," & sizeW & "," & sizeH & "," & winMinimized
    end try
  end repeat

  if (count of outputList) = 0 then
    return ""
  else
    set AppleScript's text item delimiters to ASCII character 10
    return outputList as text
  end if
end tell`;
            fs_1.default.writeFileSync(scriptFile, fullScript);
            let stdout = '';
            try {
                const execResult = await execAsync(`osascript "${scriptFile}"`);
                stdout = execResult.stdout;
            }
            finally {
                try {
                    fs_1.default.unlinkSync(scriptFile);
                }
                catch {
                    // Ignore cleanup errors
                }
            }
            const windows = [];
            // Parse the output - it may be newline-separated or space-separated
            const lines = stdout.trim().split(/\r?\n/).filter(line => line.trim());
            for (const line of lines) {
                if (!line.trim())
                    continue;
                const parts = line.split('|');
                if (parts.length >= 2) {
                    const coordParts = parts[1].split(',');
                    const x = parseInt(coordParts[0], 10) || 0;
                    const y = parseInt(coordParts[1], 10) || 0;
                    const width = parseInt(coordParts[2], 10) || 0;
                    const height = parseInt(coordParts[3], 10) || 0;
                    const minimizedValue = coordParts[4] ? coordParts[4].toString().trim().toLowerCase() : 'false';
                    const isMinimized = minimizedValue === 'true';
                    windows.push({
                        title: parts[0] || 'Untitled',
                        bounds: { x, y, width, height },
                        isMinimized,
                    });
                }
            }
            return windows;
        }
        catch (error) {
            // AppleScript failed, return empty array
            return [];
        }
    }
    /**
     * Register all tools with the Tool Registry
     * This includes filesystem, shell, browser, and GUI tools
     */
    registerAllTools() {
        // Register filesystem tools (same as in mcp-sse-server.ts)
        this.toolRegistry.registerTool({
            id: 'fs_list',
            name: 'fs_list',
            description: 'List files and directories at or under a given path.',
            category: 'filesystem',
            enabled: true,
            inputSchema: {
                type: 'object',
                properties: {
                    path: { type: 'string', description: 'Path to list' },
                    recursive: { type: 'boolean', description: 'Recursive listing', default: false },
                    max_depth: { type: 'number', description: 'Maximum depth for recursive listing', default: 3 }
                },
                required: ['path']
            }
        });
        this.toolRegistry.registerTool({
            id: 'fs_read',
            name: 'fs_read',
            description: 'Read the contents of a file (with size limit).',
            category: 'filesystem',
            enabled: true,
            inputSchema: {
                type: 'object',
                properties: {
                    path: { type: 'string', description: 'Path to file' },
                    max_bytes: { type: 'number', description: 'Maximum bytes to read', default: 131072 }
                },
                required: ['path']
            }
        });
        this.toolRegistry.registerTool({
            id: 'fs_read_range',
            name: 'fs_read_range',
            description: 'Read a file segment by line range (1-based, inclusive).',
            category: 'filesystem',
            enabled: true,
            inputSchema: {
                type: 'object',
                properties: {
                    path: { type: 'string', description: 'Path to file' },
                    start_line: { type: 'number', description: 'Start line (1-based)' },
                    end_line: { type: 'number', description: 'End line (1-based, inclusive)' }
                },
                required: ['path', 'start_line', 'end_line']
            }
        });
        this.toolRegistry.registerTool({
            id: 'fs_write',
            name: 'fs_write',
            description: 'Create or overwrite a file.',
            category: 'filesystem',
            enabled: true,
            inputSchema: {
                type: 'object',
                properties: {
                    path: { type: 'string', description: 'Path to file' },
                    content: { type: 'string', description: 'File content' },
                    create_dirs: { type: 'boolean', description: 'Create parent directories', default: true },
                    mode: { type: 'string', enum: ['overwrite', 'append', 'create_if_missing'], description: 'Write mode', default: 'overwrite' }
                },
                required: ['path', 'content']
            }
        });
        this.toolRegistry.registerTool({
            id: 'fs_delete',
            name: 'fs_delete',
            description: 'Delete a file or directory.',
            category: 'filesystem',
            enabled: true,
            inputSchema: {
                type: 'object',
                properties: {
                    path: { type: 'string', description: 'Path to delete' },
                    recursive: { type: 'boolean', description: 'Recursive deletion', default: false }
                },
                required: ['path']
            }
        });
        this.toolRegistry.registerTool({
            id: 'fs_move',
            name: 'fs_move',
            description: 'Move or rename a file or directory.',
            category: 'filesystem',
            enabled: true,
            inputSchema: {
                type: 'object',
                properties: {
                    from: { type: 'string', description: 'Source path' },
                    to: { type: 'string', description: 'Destination path' }
                },
                required: ['from', 'to']
            }
        });
        this.toolRegistry.registerTool({
            id: 'fs_search',
            name: 'fs_search',
            description: 'Find files by pattern (glob).',
            category: 'filesystem',
            enabled: true,
            inputSchema: {
                type: 'object',
                properties: {
                    base: { type: 'string', description: 'Base directory' },
                    glob: { type: 'string', description: 'Glob pattern (e.g., "**/*.ts")' },
                    max_results: { type: 'number', description: 'Maximum results', default: 200 }
                },
                required: ['base']
            }
        });
        this.toolRegistry.registerTool({
            id: 'fs_grep',
            name: 'fs_grep',
            description: 'Search within files (ripgrep wrapper).',
            category: 'filesystem',
            enabled: true,
            inputSchema: {
                type: 'object',
                properties: {
                    base: { type: 'string', description: 'Directory to search' },
                    pattern: { type: 'string', description: 'Search pattern' },
                    glob: { type: 'string', description: 'Glob pattern for file filtering' },
                    max_matches: { type: 'number', description: 'Maximum matches', default: 200 }
                },
                required: ['base', 'pattern']
            }
        });
        this.toolRegistry.registerTool({
            id: 'fs_patch',
            name: 'fs_patch',
            description: 'Apply focused transformations to a file.',
            category: 'filesystem',
            enabled: true,
            inputSchema: {
                type: 'object',
                properties: {
                    path: { type: 'string', description: 'Path to file' },
                    operations: {
                        type: 'array',
                        description: 'Patch operations',
                        items: {
                            type: 'object',
                            properties: {
                                type: { type: 'string', enum: ['replace_first', 'replace_all', 'insert_after', 'insert_before'] },
                                pattern: { type: 'string', description: 'Pattern for replace operations' },
                                match: { type: 'string', description: 'Match for insert operations' },
                                replacement: { type: 'string', description: 'Replacement text' },
                                insert: { type: 'string', description: 'Text to insert' }
                            }
                        }
                    },
                    dry_run: { type: 'boolean', description: 'Preview changes without applying', default: false }
                },
                required: ['path', 'operations']
            }
        });
        // Register shell tools
        this.toolRegistry.registerTool({
            id: 'shell_exec',
            name: 'shell_exec',
            description: 'Run a command and return output when it finishes.',
            category: 'shell',
            enabled: true,
            inputSchema: {
                type: 'object',
                properties: {
                    command: { type: 'string', description: 'Command to execute' },
                    cwd: { type: 'string', description: 'Working directory' },
                    timeout_seconds: { type: 'number', description: 'Timeout in seconds', default: 600 },
                    capture_stderr: { type: 'boolean', description: 'Capture stderr', default: true }
                },
                required: ['command']
            }
        });
        this.toolRegistry.registerTool({
            id: 'shell_start_session',
            name: 'shell_start_session',
            description: 'Start an interactive or long-running command session.',
            category: 'shell',
            enabled: true,
            inputSchema: {
                type: 'object',
                properties: {
                    command: { type: 'string', description: 'Command to execute' },
                    cwd: { type: 'string', description: 'Working directory' },
                    env: { type: 'object', description: 'Additional environment variables' },
                    capture_stderr: { type: 'boolean', description: 'Capture stderr', default: true }
                },
                required: ['command']
            }
        });
        this.toolRegistry.registerTool({
            id: 'shell_send_input',
            name: 'shell_send_input',
            description: 'Send input to a running shell session.',
            category: 'shell',
            enabled: true,
            inputSchema: {
                type: 'object',
                properties: {
                    session_id: { type: 'string', description: 'Session ID' },
                    input: { type: 'string', description: 'Input to send' }
                },
                required: ['session_id', 'input']
            }
        });
        this.toolRegistry.registerTool({
            id: 'shell_stop_session',
            name: 'shell_stop_session',
            description: 'Stop/terminate a running shell session.',
            category: 'shell',
            enabled: true,
            inputSchema: {
                type: 'object',
                properties: {
                    session_id: { type: 'string', description: 'Session ID' },
                    signal: { type: 'string', description: 'Signal to send (default: TERM)', default: 'TERM' }
                },
                required: ['session_id']
            }
        });
        // Register GUI tools
        this.toolRegistry.registerTool({
            id: 'listApplications',
            name: 'listApplications',
            description: 'List all running applications with their window bounds and identifiers.',
            category: 'gui',
            enabled: true,
            inputSchema: { type: 'object', properties: {} }
        });
        this.toolRegistry.registerTool({
            id: 'focusApplication',
            name: 'focusApplication',
            description: 'Focus on a specific application by bundle ID or name.',
            category: 'gui',
            enabled: true,
            inputSchema: {
                type: 'object',
                properties: {
                    identifier: { type: 'string', description: 'Bundle ID or app name' },
                },
                required: ['identifier'],
            }
        });
        this.toolRegistry.registerTool({
            id: 'screenshot',
            name: 'screenshot',
            description: 'Take a screenshot of the focused application.',
            category: 'gui',
            enabled: true,
            inputSchema: {
                type: 'object',
                properties: {
                    padding: { type: 'number', description: 'Padding around window in pixels' },
                },
            }
        });
        this.toolRegistry.registerTool({
            id: 'click',
            name: 'click',
            description: 'Click at normalized coordinates (0-1) relative to focused window.',
            category: 'gui',
            enabled: true,
            inputSchema: {
                type: 'object',
                properties: {
                    x: { type: 'number', description: 'X coordinate (0-1)' },
                    y: { type: 'number', description: 'Y coordinate (0-1)' },
                    button: { type: 'string', enum: ['left', 'right'], description: 'Mouse button' },
                },
                required: ['x', 'y'],
            }
        });
        this.toolRegistry.registerTool({
            id: 'getClickableElements',
            name: 'getClickableElements',
            description: 'Get all clickable UI elements via Accessibility API.',
            category: 'gui',
            enabled: true,
            inputSchema: { type: 'object', properties: {} }
        });
        this.toolRegistry.registerTool({
            id: 'typeText',
            name: 'typeText',
            description: 'Type text into the focused application.',
            category: 'gui',
            enabled: true,
            inputSchema: {
                type: 'object',
                properties: {
                    text: { type: 'string', description: 'Text to type' },
                },
                required: ['text'],
            }
        });
        this.toolRegistry.registerTool({
            id: 'pressKey',
            name: 'pressKey',
            description: 'Press keyboard key with optional modifiers.',
            category: 'gui',
            enabled: true,
            inputSchema: {
                type: 'object',
                properties: {
                    key: { type: 'string', description: 'Key to press (e.g., Enter, Command+L)' },
                },
                required: ['key'],
            }
        });
        this.toolRegistry.registerTool({
            id: 'analyzeWithOCR',
            name: 'analyzeWithOCR',
            description: 'Analyze current screen using OCR.',
            category: 'gui',
            enabled: true,
            inputSchema: { type: 'object', properties: {} }
        });
        this.toolRegistry.registerTool({
            id: 'checkPermissions',
            name: 'checkPermissions',
            description: 'Check accessibility permission status.',
            category: 'gui',
            enabled: true,
            inputSchema: { type: 'object', properties: {} }
        });
        this.toolRegistry.registerTool({
            id: 'doubleClick',
            name: 'doubleClick',
            description: 'Perform a double-click at specified coordinates relative to the focused app window.',
            category: 'gui',
            enabled: true,
            inputSchema: {
                type: 'object',
                properties: {
                    x: { type: 'number', description: 'X coordinate relative to the app window (0-1 normalized)', minimum: 0, maximum: 1 },
                    y: { type: 'number', description: 'Y coordinate relative to the app window (0-1 normalized)', minimum: 0, maximum: 1 },
                },
                required: ['x', 'y'],
            }
        });
        this.toolRegistry.registerTool({
            id: 'clickElement',
            name: 'clickElement',
            description: 'Click a specific element by index from getClickableElements.',
            category: 'gui',
            enabled: true,
            inputSchema: {
                type: 'object',
                properties: {
                    elementIndex: { type: 'number', description: 'Index of the element to click (from getClickableElements)' },
                },
                required: ['elementIndex'],
            }
        });
        this.toolRegistry.registerTool({
            id: 'scrollMouse',
            name: 'scrollMouse',
            description: 'Scroll the mouse wheel up or down.',
            category: 'gui',
            enabled: true,
            inputSchema: {
                type: 'object',
                properties: {
                    direction: { type: 'string', enum: ['up', 'down'], description: 'Scroll direction' },
                    amount: { type: 'number', description: 'Scroll amount (default: 3)', default: 3 },
                },
                required: ['direction'],
            }
        });
        this.toolRegistry.registerTool({
            id: 'getMousePosition',
            name: 'getMousePosition',
            description: 'Get the current mouse position.',
            category: 'gui',
            enabled: true,
            inputSchema: { type: 'object', properties: {} }
        });
        this.toolRegistry.registerTool({
            id: 'wait',
            name: 'wait',
            description: 'Wait for a specified amount of time.',
            category: 'gui',
            enabled: true,
            inputSchema: {
                type: 'object',
                properties: {
                    milliseconds: { type: 'number', description: 'Time to wait in milliseconds', default: 1000 },
                },
            }
        });
        this.toolRegistry.registerTool({
            id: 'closeApp',
            name: 'closeApp',
            description: 'Close a specific application by bundle ID, name, or PID.',
            category: 'gui',
            enabled: true,
            inputSchema: {
                type: 'object',
                properties: {
                    identifier: { type: 'string', description: 'Bundle ID (e.g., com.apple.Music), application name, or PID' },
                    force: { type: 'boolean', description: 'Force close the application (kill process)', default: false },
                },
                required: ['identifier'],
            }
        });
        // Additional GUI tools
        this.toolRegistry.registerTool({
            id: 'launchApplication',
            name: 'launchApplication',
            description: 'Launch an application by bundle ID or name. If already running, focuses it.',
            category: 'gui',
            enabled: true,
            inputSchema: {
                type: 'object',
                properties: {
                    identifier: { type: 'string', description: 'Bundle ID (e.g., com.apple.Safari) or app name (e.g., Safari, Calculator)' },
                },
                required: ['identifier'],
            }
        });
        this.toolRegistry.registerTool({
            id: 'screenshot_app',
            name: 'screenshot_app',
            description: 'Take a screenshot of the focused application or a specific app by identifier.',
            category: 'gui',
            enabled: true,
            inputSchema: {
                type: 'object',
                properties: {
                    identifier: { type: 'string', description: 'Optional: Bundle ID or app name. If not provided, uses the currently focused app.' },
                },
            }
        });
        this.toolRegistry.registerTool({
            id: 'click_absolute',
            name: 'click_absolute',
            description: 'Click anywhere on the desktop using absolute screen coordinates (in pixels).',
            category: 'gui',
            enabled: true,
            inputSchema: {
                type: 'object',
                properties: {
                    x: { type: 'number', description: 'Absolute screen X coordinate in pixels' },
                    y: { type: 'number', description: 'Absolute screen Y coordinate in pixels' },
                    button: { type: 'string', enum: ['left', 'right'], description: 'Mouse button (default: left)' },
                },
                required: ['x', 'y'],
            }
        });
        this.toolRegistry.registerTool({
            id: 'moveMouse',
            name: 'moveMouse',
            description: 'Move mouse to a position relative to the focused app window (without clicking).',
            category: 'gui',
            enabled: true,
            inputSchema: {
                type: 'object',
                properties: {
                    x: { type: 'number', description: 'X coordinate (0-1 normalized)' },
                    y: { type: 'number', description: 'Y coordinate (0-1 normalized)' },
                },
                required: ['x', 'y'],
            }
        });
        this.toolRegistry.registerTool({
            id: 'scroll',
            name: 'scroll',
            description: 'Scroll the mouse wheel. Positive deltaY scrolls up, negative scrolls down.',
            category: 'gui',
            enabled: true,
            inputSchema: {
                type: 'object',
                properties: {
                    deltaY: { type: 'number', description: 'Vertical scroll amount (positive=up, negative=down)' },
                    deltaX: { type: 'number', description: 'Horizontal scroll amount (positive=right, negative=left)' },
                    x: { type: 'number', description: 'Optional X coordinate to scroll at (0-1 normalized)' },
                    y: { type: 'number', description: 'Optional Y coordinate to scroll at (0-1 normalized)' },
                },
            }
        });
        this.toolRegistry.registerTool({
            id: 'drag',
            name: 'drag',
            description: 'Drag from one position to another (click and hold, move, release).',
            category: 'gui',
            enabled: true,
            inputSchema: {
                type: 'object',
                properties: {
                    startX: { type: 'number', description: 'Start X coordinate (0-1 normalized)' },
                    startY: { type: 'number', description: 'Start Y coordinate (0-1 normalized)' },
                    endX: { type: 'number', description: 'End X coordinate (0-1 normalized)' },
                    endY: { type: 'number', description: 'End Y coordinate (0-1 normalized)' },
                },
                required: ['startX', 'startY', 'endX', 'endY'],
            }
        });
        this.toolRegistry.registerTool({
            id: 'getUIElements',
            name: 'getUIElements',
            description: 'Accessibility tree dump for the focused application. Returns clickable controls and non-clickable UI elements with coordinates.',
            category: 'gui',
            enabled: true,
            inputSchema: { type: 'object', properties: {} }
        });
        this.toolRegistry.registerTool({
            id: 'currentApp',
            name: 'currentApp',
            description: 'Get information about the currently focused application including bundle ID and window bounds.',
            category: 'gui',
            enabled: true,
            inputSchema: { type: 'object', properties: {} }
        });
        // Register browser tools
        this.toolRegistry.registerTool({
            id: 'browser_listConnected',
            name: 'browser_listConnected',
            description: 'List connected browser extensions.',
            category: 'browser',
            enabled: true,
            inputSchema: { type: 'object', properties: {} }
        });
        this.toolRegistry.registerTool({
            id: 'browser_getTabs',
            name: 'browser_getTabs',
            description: 'List all open browser tabs.',
            category: 'browser',
            enabled: true,
            inputSchema: {
                type: 'object',
                properties: {
                    browser: { type: 'string', enum: ['firefox', 'chrome', 'safari', 'edge'] },
                },
            }
        });
        this.toolRegistry.registerTool({
            id: 'browser_getActiveTab',
            name: 'browser_getActiveTab',
            description: 'Get info about the currently active browser tab.',
            category: 'browser',
            enabled: true,
            inputSchema: {
                type: 'object',
                properties: {
                    browser: { type: 'string', enum: ['firefox', 'chrome', 'safari', 'edge'] },
                },
            }
        });
        this.toolRegistry.registerTool({
            id: 'browser_getPageInfo',
            name: 'browser_getPageInfo',
            description: 'Get current page URL, title, and metadata.',
            category: 'browser',
            enabled: true,
            inputSchema: {
                type: 'object',
                properties: {
                    tabId: { type: 'number' },
                    browser: { type: 'string', enum: ['firefox', 'chrome', 'safari', 'edge'] },
                },
            }
        });
        this.toolRegistry.registerTool({
            id: 'browser_getInteractiveElements',
            name: 'browser_getInteractiveElements',
            description: 'Get all interactive DOM elements (buttons, links, inputs).',
            category: 'browser',
            enabled: true,
            inputSchema: {
                type: 'object',
                properties: {
                    tabId: { type: 'number' },
                    browser: { type: 'string', enum: ['firefox', 'chrome', 'safari', 'edge'] },
                },
            }
        });
        this.toolRegistry.registerTool({
            id: 'browser_clickElement',
            name: 'browser_clickElement',
            description: 'Click a DOM element by CSS selector.',
            category: 'browser',
            enabled: true,
            inputSchema: {
                type: 'object',
                properties: {
                    selector: { type: 'string', description: 'CSS selector' },
                    tabId: { type: 'number' },
                    browser: { type: 'string', enum: ['firefox', 'chrome', 'safari', 'edge'] },
                },
                required: ['selector'],
            }
        });
        this.toolRegistry.registerTool({
            id: 'browser_fillElement',
            name: 'browser_fillElement',
            description: 'Fill a form field by CSS selector. Uses enhanced event simulation that dispatches keydown/keypress/input/keyup events character-by-character for better React/Vue/Angular compatibility. If form still rejects the input, use browser_getElementForNativeInput to get coordinates, then use native click() + typeText() as fallback.',
            category: 'browser',
            enabled: true,
            inputSchema: {
                type: 'object',
                properties: {
                    selector: { type: 'string', description: 'CSS selector' },
                    value: { type: 'string', description: 'Value to fill' },
                    tabId: { type: 'number' },
                    browser: { type: 'string', enum: ['firefox', 'chrome', 'safari', 'edge'] },
                    simulateTyping: { type: 'boolean', description: 'Simulate character-by-character typing with keyboard events (default: true). Set to false for simple value assignment.', default: true },
                    clearFirst: { type: 'boolean', description: 'Clear existing value before filling (default: true)', default: true },
                },
                required: ['selector', 'value'],
            }
        });
        this.toolRegistry.registerTool({
            id: 'browser_getElementForNativeInput',
            name: 'browser_getElementForNativeInput',
            description: 'FALLBACK for stubborn forms that reject browser_fillElement. Returns element coordinates (both absolute and normalized 0-1) for use with native macOS input. Use when forms check for "trusted" keyboard events that cannot be simulated via JavaScript. Workflow: (1) Call this tool to get coordinates, (2) focusApplication("Firefox"), (3) click(normalized.centerX, normalized.centerY), (4) typeText(value). This bypasses ALL form validation by using real keyboard input.',
            category: 'browser',
            enabled: true,
            inputSchema: {
                type: 'object',
                properties: {
                    selector: { type: 'string', description: 'CSS selector for the input element' },
                    tabId: { type: 'number' },
                    browser: { type: 'string', enum: ['firefox', 'chrome', 'safari', 'edge'] },
                },
                required: ['selector'],
            }
        });
        this.toolRegistry.registerTool({
            id: 'browser_executeScript',
            name: 'browser_executeScript',
            description: 'Execute JavaScript in page context.',
            category: 'browser',
            enabled: true,
            inputSchema: {
                type: 'object',
                properties: {
                    script: { type: 'string', description: 'JavaScript code' },
                    tabId: { type: 'number' },
                    browser: { type: 'string', enum: ['firefox', 'chrome', 'safari', 'edge'] },
                },
                required: ['script'],
            }
        });
        // Enhanced browser tools
        this.toolRegistry.registerTool({
            id: 'browser_inspectCurrentPage',
            name: 'browser_inspectCurrentPage',
            description: 'START HERE for any new page. Single call that gives you EVERYTHING: page info + all form fields with labels + coordinates. Returns: (1) Page URL/title, (2) All interactive elements with specific types (email-input, password-input, dropdown, checkbox, radio, submit-button), extracted labels from <label> tags or aria-label, current values, and BOTH absolute pixels AND normalized 0-1 coordinates, (3) Radio button groups, (4) Summary stats. Use browser_fillFormField with the returned labels to fill forms easily. Replaces multiple calls to browser_getPageInfo + browser_getInteractiveElements.',
            category: 'browser',
            enabled: true,
            inputSchema: {
                type: 'object',
                properties: {
                    tabId: { type: 'number', description: 'Optional tab ID (defaults to active tab)' },
                    browser: { type: 'string', enum: ['firefox', 'chrome', 'safari', 'edge'] },
                    includeScreenshot: { type: 'boolean', description: 'Include screenshot in response (default: true)', default: true },
                    includeOCR: { type: 'boolean', description: 'Include OCR text extraction (default: false)', default: false },
                },
            }
        });
        this.toolRegistry.registerTool({
            id: 'browser_getUIElements',
            name: 'browser_getUIElements',
            description: 'Enhanced form field detection - same elements data as browser_inspectCurrentPage but WITHOUT page info. Only use if you need to refresh element data. Returns: 14 specific element types (email-input, password-input, text-input, number-input, tel-input, url-input, date-input, file-input, dropdown, textarea, checkbox, radio, button, submit-button), labels extracted from multiple sources, current values, BOTH absolute pixels AND normalized 0-1 coordinates, grouped radio buttons by name. Prefer browser_inspectCurrentPage which gives you this PLUS page info.',
            category: 'browser',
            enabled: true,
            inputSchema: {
                type: 'object',
                properties: {
                    tabId: { type: 'number', description: 'Optional tab ID (defaults to active tab)' },
                    browser: { type: 'string', enum: ['firefox', 'chrome', 'safari', 'edge'] },
                },
            }
        });
        this.toolRegistry.registerTool({
            id: 'browser_fillFormField',
            name: 'browser_fillFormField',
            description: 'The EASIEST way to fill forms. Finds field by label → clicks → fills in ONE atomic operation. Smart fuzzy matching: (1) Exact match (100%), (2) Contains match (50%), (3) Placeholder match (30%), (4) Name/ID match (20%). Handles all field types: text inputs set value, dropdowns select option, checkboxes/radios set checked state. Returns success with actual element used, or error with availableFields list to help debug. Use this for ALL form filling - much simpler than find → click → fill. Example: browser_fillFormField("Email", "user@example.com") matches "Email Address", "Email:", "Enter your email", etc.',
            category: 'browser',
            enabled: true,
            inputSchema: {
                type: 'object',
                properties: {
                    label: { type: 'string', description: 'Label text of the form field (e.g., "Email", "Password", "First Name"). Fuzzy matching supported - partial labels work!' },
                    value: { type: 'string', description: 'Value to fill in the field. For dropdowns: option value or text. For checkboxes/radios: "true"/"yes"/"1" to check.' },
                    tabId: { type: 'number', description: 'Optional tab ID (defaults to active tab)' },
                    browser: { type: 'string', enum: ['firefox', 'chrome', 'safari', 'edge'] },
                },
                required: ['label', 'value'],
            }
        });
        this.toolRegistry.registerTool({
            id: 'browser_fillWithFallback',
            name: 'browser_fillWithFallback',
            description: '🎯 RECOMMENDED: Smart form filling with automatic bot-detection bypass. First tries enhanced JS simulation (keydown/keypress/input events). If value doesn\'t persist (bot detection), automatically falls back to NATIVE mouse/keyboard control which bypasses ALL detection. Use this instead of browser_fillElement for guaranteed form filling. One tool handles everything - no manual fallback needed.',
            category: 'browser',
            enabled: true,
            inputSchema: {
                type: 'object',
                properties: {
                    selector: { type: 'string', description: 'CSS selector for the input element' },
                    value: { type: 'string', description: 'Value to fill' },
                    tabId: { type: 'number', description: 'Optional tab ID (defaults to active tab)' },
                    browser: { type: 'string', enum: ['firefox', 'chrome', 'safari', 'edge'] },
                },
                required: ['selector', 'value'],
            }
        });
        this.toolRegistry.registerTool({
            id: 'browser_fillFormNative',
            name: 'browser_fillFormNative',
            description: '🚀 ATOMIC FORM FILLING: Fill multiple form fields and click buttons in one operation using native keyboard/mouse. Uses Tab navigation between fields (no coordinate drift issues). Fills ALL text fields first, THEN clicks buttons (Yes/No), then optionally submits. Perfect for forms with bot detection like Ashby. Fields are filled in order using Tab key, avoiding layout shift problems.',
            category: 'browser',
            enabled: true,
            inputSchema: {
                type: 'object',
                properties: {
                    fields: {
                        type: 'array',
                        description: 'Array of fields to fill in order. Use Tab navigation between them.',
                        items: {
                            type: 'object',
                            properties: {
                                label: { type: 'string', description: 'Field label to find (fuzzy match)' },
                                selector: { type: 'string', description: 'Optional CSS selector (if label not provided)' },
                                value: { type: 'string', description: 'Value to fill' },
                            },
                            required: ['value'],
                        },
                    },
                    buttons: {
                        type: 'array',
                        description: 'Array of buttons to click after filling fields (e.g., Yes/No buttons)',
                        items: {
                            type: 'object',
                            properties: {
                                label: { type: 'string', description: 'Button text to click (partial match)' },
                                selector: { type: 'string', description: 'Optional CSS selector' },
                            },
                        },
                    },
                    submit: { type: 'boolean', description: 'Click submit button after filling. Default: false' },
                    submitSelector: { type: 'string', description: 'Custom submit button selector. Default: finds submit button automatically' },
                    tabId: { type: 'number', description: 'Optional tab ID (defaults to active tab)' },
                    browser: { type: 'string', enum: ['firefox', 'chrome', 'safari', 'edge'] },
                },
                required: ['fields'],
            }
        });
        // ========== NEW ENHANCED BROWSER TOOLS ==========
        this.toolRegistry.registerTool({
            id: 'browser_findTabByUrl',
            name: 'browser_findTabByUrl',
            description: 'Find a browser tab by URL pattern. Returns the first matching tab. Supports partial matching - just provide part of the URL.',
            category: 'browser',
            enabled: true,
            inputSchema: {
                type: 'object',
                properties: {
                    urlPattern: { type: 'string', description: 'URL pattern to search for (partial match supported)' },
                    browser: { type: 'string', enum: ['firefox', 'chrome', 'safari', 'edge'] },
                },
                required: ['urlPattern'],
            }
        });
        this.toolRegistry.registerTool({
            id: 'browser_clickByText',
            name: 'browser_clickByText',
            description: 'Click an element by its visible text. Faster than getInteractiveElements + clickElement. Supports partial text matching and index for multiple matches.',
            category: 'browser',
            enabled: true,
            inputSchema: {
                type: 'object',
                properties: {
                    text: { type: 'string', description: 'Text to search for (partial match supported)' },
                    index: { type: 'number', description: 'If multiple matches, click the nth one (0-based). Default: 0' },
                    elementType: { type: 'string', enum: ['button', 'link', 'any'], description: 'Filter by element type. Default: any' },
                    waitForNavigation: { type: 'boolean', description: 'Wait for page navigation after click. Default: false' },
                    tabId: { type: 'number' },
                    browser: { type: 'string', enum: ['firefox', 'chrome', 'safari', 'edge'] },
                },
                required: ['text'],
            }
        });
        this.toolRegistry.registerTool({
            id: 'browser_clickMultiple',
            name: 'browser_clickMultiple',
            description: 'Click multiple elements in sequence. Useful for selecting multiple Yes/No answers or checkboxes at once.',
            category: 'browser',
            enabled: true,
            inputSchema: {
                type: 'object',
                properties: {
                    selectors: {
                        type: 'array',
                        items: { type: 'string' },
                        description: 'Array of CSS selectors to click in order'
                    },
                    delayMs: { type: 'number', description: 'Delay between clicks in milliseconds. Default: 100' },
                    tabId: { type: 'number' },
                    browser: { type: 'string', enum: ['firefox', 'chrome', 'safari', 'edge'] },
                },
                required: ['selectors'],
            }
        });
        this.toolRegistry.registerTool({
            id: 'browser_getFormStructure',
            name: 'browser_getFormStructure',
            description: 'Get structured form data with questions grouped. Ideal for screening questionnaires - returns Yes/No pairs grouped with their question text.',
            category: 'browser',
            enabled: true,
            inputSchema: {
                type: 'object',
                properties: {
                    tabId: { type: 'number' },
                    browser: { type: 'string', enum: ['firefox', 'chrome', 'safari', 'edge'] },
                },
            }
        });
        this.toolRegistry.registerTool({
            id: 'browser_answerQuestions',
            name: 'browser_answerQuestions',
            description: 'Answer Yes/No screening questions by providing a mapping of question text to answers. Automatically finds and clicks the correct buttons.',
            category: 'browser',
            enabled: true,
            inputSchema: {
                type: 'object',
                properties: {
                    answers: {
                        type: 'object',
                        description: 'Object mapping question text (partial match) to answer ("yes" or "no"). Example: {"5+ years": "yes", "right to work": "yes"}'
                    },
                    defaultAnswer: { type: 'string', enum: ['yes', 'no'], description: 'Default answer for unmatched questions' },
                    tabId: { type: 'number' },
                    browser: { type: 'string', enum: ['firefox', 'chrome', 'safari', 'edge'] },
                },
                required: ['answers'],
            }
        });
        // ========== LLM INTROSPECTION TOOLS ==========
        this.toolRegistry.registerTool({
            id: 'browser_listInteractiveElements',
            name: 'browser_listInteractiveElements',
            description: `🔍 LLM INTROSPECTION: Comprehensive list of ALL interactive elements on the page with detailed metadata.

USE THIS WHEN:
• You need to understand what's on the page before taking action
• Previous clicks/fills failed and you need to debug
• Forms have dynamic or complex structure (React, Vue, Angular)

RETURNS FOR EACH ELEMENT:
• Multiple selector alternatives (data-testid, ID, name, aria-label, hierarchical)
• Element type (email-input, password-input, button, dropdown, etc.)
• Extracted labels from <label> tags, aria-label, placeholder
• Current value, disabled/readonly state
• Normalized coordinates (0-1) for native input fallback
• Context: nearest heading, form parent, shadow DOM host

OPTIONS:
• filterType: "input" | "button" | "link" | "dropdown" - narrow results
• searchText: fuzzy search for labels/text containing this string
• includeShadowDOM: search inside shadow roots (default: true)
• includeIframes: search same-origin iframes (default: true)`,
            category: 'browser',
            enabled: true,
            inputSchema: {
                type: 'object',
                properties: {
                    tabId: { type: 'number' },
                    browser: { type: 'string', enum: ['firefox', 'chrome', 'safari', 'edge'] },
                    filterType: { type: 'string', enum: ['input', 'button', 'link', 'dropdown'], description: 'Filter by element type' },
                    searchText: { type: 'string', description: 'Fuzzy search for elements with matching label/text' },
                    includeHidden: { type: 'boolean', description: 'Include hidden elements (default: false)' },
                    maxElements: { type: 'number', description: 'Maximum elements to return (default: 200)' },
                    includeShadowDOM: { type: 'boolean', description: 'Search inside shadow DOM (default: true)' },
                    includeIframes: { type: 'boolean', description: 'Search same-origin iframes (default: true)' },
                },
            }
        });
        this.toolRegistry.registerTool({
            id: 'browser_clickElementWithDebug',
            name: 'browser_clickElementWithDebug',
            description: `🔧 DEBUG CLICK: Click with detailed error feedback when selector fails.

RETURNS ON SUCCESS:
• clicked: true
• element details (tagName, text, rect)

RETURNS ON FAILURE:
• clicked: false
• error: "no_match" | "multiple_matches" | "not_visible" | "not_interactive"
• matchCount: how many elements matched
• candidates: array of partial matches with their selectors
• suggestions: alternative selectors to try
• nearbyElements: what's around the failed selector

USE THIS INSTEAD OF browser_clickElement when you need to diagnose why clicks fail.`,
            category: 'browser',
            enabled: true,
            inputSchema: {
                type: 'object',
                properties: {
                    selector: { type: 'string', description: 'CSS selector for the element to click' },
                    tabId: { type: 'number' },
                    browser: { type: 'string', enum: ['firefox', 'chrome', 'safari', 'edge'] },
                },
                required: ['selector'],
            }
        });
        this.toolRegistry.registerTool({
            id: 'browser_findElementWithDebug',
            name: 'browser_findElementWithDebug',
            description: `🔍 DEBUG FIND: Check if a selector matches without clicking. Use to validate selectors before action.

RETURNS:
• found: boolean
• matchCount: number of matches
• error: null | "no_match" | "multiple_matches"
• candidates: if multiple matches, shows all with details
• suggestions: alternative selectors to try
• nearbyElements: context around failed selectors

USE CASE: Before calling clickElement or fillElement, verify your selector is correct.`,
            category: 'browser',
            enabled: true,
            inputSchema: {
                type: 'object',
                properties: {
                    selector: { type: 'string', description: 'CSS selector to test' },
                    tabId: { type: 'number' },
                    browser: { type: 'string', enum: ['firefox', 'chrome', 'safari', 'edge'] },
                },
                required: ['selector'],
            }
        });
        // ========== COMBO-BOX TOOLS ==========
        this.toolRegistry.registerTool({
            id: 'browser_getDropdownOptions',
            name: 'browser_getDropdownOptions',
            description: `📋 COMBO-BOX PRIMITIVE: Open a combo-box/dropdown and return available options with selectors and coordinates.

USE THIS FOR:
• React-Select, Material-UI Select, Ant Design Select, Vue-Select, Choices.js
• Any custom dropdown that's not a native <select>
• When you need to see what options are available before selecting

HOW IT WORKS:
1. Provide selector for the combo-box input element
2. Tool clicks to open the dropdown (if not already open)
3. Returns all visible options with:
   • text: Option display text
   • selector: CSS selector to click this option
   • value: data-value attribute if present
   • screenCoordinates: normalized (0-1) coordinates for native click fallback

WORKFLOW:
1. Call browser_getDropdownOptions with input selector
2. Find the option you want in the returned list
3. Either: clickElement(option.selector) OR use screenCoordinates for native click

FALLBACK (if JS click fails):
Use the screenCoordinates.normalized.centerX/centerY with native click() tool.`,
            category: 'browser',
            enabled: true,
            inputSchema: {
                type: 'object',
                properties: {
                    selector: { type: 'string', description: 'CSS selector for the combo-box input element' },
                    waitMs: { type: 'number', description: 'Time to wait for dropdown to open (default: 300ms)' },
                    closeAfter: { type: 'boolean', description: 'Close dropdown after getting options (default: false)' },
                    tabId: { type: 'number' },
                    browser: { type: 'string', enum: ['firefox', 'chrome', 'safari', 'edge'] },
                },
                required: ['selector'],
            }
        });
        this.toolRegistry.registerTool({
            id: 'browser_openDropdownNative',
            name: 'browser_openDropdownNative',
            description: `🎯 NATIVE DROPDOWN OPENER: Opens stubborn dropdowns (React-Select, etc.) using native macOS input.

USE THIS WHEN:
• browser_getDropdownOptions fails to open the dropdown
• JavaScript clicks don't trigger React's event handlers
• The dropdown requires "trusted" user events

HOW IT WORKS (atomic operation):
1. Gets element coordinates via browser extension
2. Focuses browser window via native macOS
3. Clicks at coordinates using native mouse
4. Types search text using native keyboard (triggers autocomplete)
5. Waits for dropdown to appear
6. Returns available options with selectors and coordinates

RETURNS:
• List of dropdown options with text, selector, and normalized coordinates
• Each option can be selected via browser_clickElement(selector) or native click()

EXAMPLE:
browser_openDropdownNative({
  selector: "#country-select",
  searchText: "United",  // Type to filter options
  browser: "firefox"
})`,
            category: 'browser',
            enabled: true,
            inputSchema: {
                type: 'object',
                properties: {
                    selector: { type: 'string', description: 'CSS selector for the combo-box input element' },
                    searchText: { type: 'string', description: 'Text to type to trigger autocomplete/filter options (optional)' },
                    waitMs: { type: 'number', description: 'Time to wait for dropdown to open (default: 500ms)' },
                    tabId: { type: 'number' },
                    browser: { type: 'string', enum: ['firefox', 'chrome', 'safari', 'edge'] },
                },
                required: ['selector'],
            }
        });
        // Additional browser tools
        this.toolRegistry.registerTool({
            id: 'browser_setDefaultBrowser',
            name: 'browser_setDefaultBrowser',
            description: 'Set the default browser for commands when no browser is specified.',
            category: 'browser',
            enabled: true,
            inputSchema: {
                type: 'object',
                properties: {
                    browser: { type: 'string', enum: ['firefox', 'chrome', 'safari', 'edge'], description: 'Browser to set as default' },
                },
                required: ['browser'],
            }
        });
        this.toolRegistry.registerTool({
            id: 'browser_focusTab',
            name: 'browser_focusTab',
            description: 'Focus a specific browser tab by ID.',
            category: 'browser',
            enabled: true,
            inputSchema: {
                type: 'object',
                properties: {
                    tabId: { type: 'number', description: 'The tab ID to focus (from browser_getTabs)' },
                    browser: { type: 'string', enum: ['firefox', 'chrome', 'safari', 'edge'], description: 'Target browser (optional)' },
                },
                required: ['tabId'],
            }
        });
        this.toolRegistry.registerTool({
            id: 'browser_createTab',
            name: 'browser_createTab',
            description: 'Create a new browser tab and navigate to a URL.',
            category: 'browser',
            enabled: true,
            inputSchema: {
                type: 'object',
                properties: {
                    url: { type: 'string', description: 'URL to navigate to in the new tab' },
                    browser: { type: 'string', enum: ['firefox', 'chrome', 'safari', 'edge'], description: 'Target browser (optional)' },
                },
                required: ['url'],
            }
        });
        this.toolRegistry.registerTool({
            id: 'browser_closeTab',
            name: 'browser_closeTab',
            description: 'Close a browser tab by ID.',
            category: 'browser',
            enabled: true,
            inputSchema: {
                type: 'object',
                properties: {
                    tabId: { type: 'number', description: 'The tab ID to close (from browser_getTabs)' },
                    browser: { type: 'string', enum: ['firefox', 'chrome', 'safari', 'edge'], description: 'Target browser (optional)' },
                },
                required: ['tabId'],
            }
        });
        this.toolRegistry.registerTool({
            id: 'browser_getPageContext',
            name: 'browser_getPageContext',
            description: 'Get combined snapshot of current page including visible text and interactive elements.',
            category: 'browser',
            enabled: true,
            inputSchema: {
                type: 'object',
                properties: {
                    tabId: { type: 'number', description: 'Optional tab ID (defaults to active tab)' },
                    browser: { type: 'string', enum: ['firefox', 'chrome', 'safari', 'edge'], description: 'Target browser (optional)' },
                },
            }
        });
        this.toolRegistry.registerTool({
            id: 'browser_scrollTo',
            name: 'browser_scrollTo',
            description: 'Scroll to a position or element.',
            category: 'browser',
            enabled: true,
            inputSchema: {
                type: 'object',
                properties: {
                    selector: { type: 'string', description: 'CSS selector to scroll to (optional)' },
                    x: { type: 'number', description: 'X position to scroll to (optional)' },
                    y: { type: 'number', description: 'Y position to scroll to (optional)' },
                    tabId: { type: 'number', description: 'Optional tab ID (defaults to active tab)' },
                    browser: { type: 'string', enum: ['firefox', 'chrome', 'safari', 'edge'], description: 'Target browser (optional)' },
                },
            }
        });
        this.toolRegistry.registerTool({
            id: 'browser_getFormData',
            name: 'browser_getFormData',
            description: 'Get all form data from the current page.',
            category: 'browser',
            enabled: true,
            inputSchema: {
                type: 'object',
                properties: {
                    tabId: { type: 'number', description: 'Optional tab ID (defaults to active tab)' },
                    browser: { type: 'string', enum: ['firefox', 'chrome', 'safari', 'edge'], description: 'Target browser (optional)' },
                },
            }
        });
        this.toolRegistry.registerTool({
            id: 'browser_setWatchMode',
            name: 'browser_setWatchMode',
            description: 'Enable/disable DOM change watching.',
            category: 'browser',
            enabled: true,
            inputSchema: {
                type: 'object',
                properties: {
                    enabled: { type: 'boolean', description: 'Whether to enable watch mode' },
                    tabId: { type: 'number', description: 'Optional tab ID (defaults to active tab)' },
                    browser: { type: 'string', enum: ['firefox', 'chrome', 'safari', 'edge'], description: 'Target browser (optional)' },
                },
                required: ['enabled'],
            }
        });
        this.toolRegistry.registerTool({
            id: 'browser_getVisibleText',
            name: 'browser_getVisibleText',
            description: 'Read the visible text content of the current page as plain text. Supports pagination for long pages.',
            category: 'browser',
            enabled: true,
            inputSchema: {
                type: 'object',
                properties: {
                    slice: { type: 'number', description: 'Which slice to return (0-indexed, default: 0). Use this to get additional content from long pages.' },
                    sliceSize: { type: 'number', description: 'Characters per slice (default: 15000)' },
                    tabId: { type: 'number', description: 'Optional tab ID (defaults to active tab)' },
                    browser: { type: 'string', enum: ['firefox', 'chrome', 'safari', 'edge'], description: 'Target browser (optional)' },
                },
            }
        });
        this.toolRegistry.registerTool({
            id: 'browser_searchVisibleText',
            name: 'browser_searchVisibleText',
            description: 'Search for keywords in the visible text of the current page. Returns matching snippets with context.',
            category: 'browser',
            enabled: true,
            inputSchema: {
                type: 'object',
                properties: {
                    query: { type: 'string', description: 'Search query (case-insensitive). Can be a word, phrase, or simple pattern.' },
                    contextChars: { type: 'number', description: 'Characters of context around each match (default: 100)' },
                    maxMatches: { type: 'number', description: 'Maximum matches to return (default: 10)' },
                    tabId: { type: 'number', description: 'Optional tab ID (defaults to active tab)' },
                    browser: { type: 'string', enum: ['firefox', 'chrome', 'safari', 'edge'], description: 'Target browser (optional)' },
                },
                required: ['query'],
            }
        });
        this.toolRegistry.registerTool({
            id: 'browser_waitForSelector',
            name: 'browser_waitForSelector',
            description: 'Wait until a specific element appears using its selector.',
            category: 'browser',
            enabled: true,
            inputSchema: {
                type: 'object',
                properties: {
                    selector: { type: 'string', description: 'CSS selector to wait for' },
                    timeout: { type: 'number', description: 'Timeout in milliseconds (default: 10000)' },
                    tabId: { type: 'number', description: 'Optional tab ID (defaults to active tab)' },
                    browser: { type: 'string', enum: ['firefox', 'chrome', 'safari', 'edge'], description: 'Target browser (optional)' },
                },
                required: ['selector'],
            }
        });
        this.toolRegistry.registerTool({
            id: 'browser_waitForPageLoad',
            name: 'browser_waitForPageLoad',
            description: 'Wait until the current page finishes loading after navigation.',
            category: 'browser',
            enabled: true,
            inputSchema: {
                type: 'object',
                properties: {
                    timeout: { type: 'number', description: 'Timeout in milliseconds (default: 30000)' },
                    tabId: { type: 'number', description: 'Optional tab ID (defaults to active tab)' },
                    browser: { type: 'string', enum: ['firefox', 'chrome', 'safari', 'edge'], description: 'Target browser (optional)' },
                },
            }
        });
        this.toolRegistry.registerTool({
            id: 'browser_selectOption',
            name: 'browser_selectOption',
            description: 'Select an option in a dropdown/select element.',
            category: 'browser',
            enabled: true,
            inputSchema: {
                type: 'object',
                properties: {
                    selector: { type: 'string', description: 'CSS selector for the select element' },
                    value: { type: 'string', description: 'Option value or text to select' },
                    tabId: { type: 'number', description: 'Optional tab ID (defaults to active tab)' },
                    browser: { type: 'string', enum: ['firefox', 'chrome', 'safari', 'edge'], description: 'Target browser (optional)' },
                },
                required: ['selector', 'value'],
            }
        });
        this.toolRegistry.registerTool({
            id: 'browser_isElementVisible',
            name: 'browser_isElementVisible',
            description: 'Check if an element exists and is visible.',
            category: 'browser',
            enabled: true,
            inputSchema: {
                type: 'object',
                properties: {
                    selector: { type: 'string', description: 'CSS selector to check' },
                    tabId: { type: 'number', description: 'Optional tab ID (defaults to active tab)' },
                    browser: { type: 'string', enum: ['firefox', 'chrome', 'safari', 'edge'], description: 'Target browser (optional)' },
                },
                required: ['selector'],
            }
        });
        this.toolRegistry.registerTool({
            id: 'browser_getConsoleLogs',
            name: 'browser_getConsoleLogs',
            description: 'Get captured console logs. Useful for debugging.',
            category: 'browser',
            enabled: true,
            inputSchema: {
                type: 'object',
                properties: {
                    filter: { type: 'string', enum: ['all', 'log', 'error', 'warn', 'info', 'debug'], description: 'Filter by log type (default: all)' },
                    clear: { type: 'boolean', description: 'Clear logs after retrieval (default: false)' },
                    tabId: { type: 'number', description: 'Optional tab ID (defaults to active tab)' },
                    browser: { type: 'string', enum: ['firefox', 'chrome', 'safari', 'edge'], description: 'Target browser (optional)' },
                },
            }
        });
        this.toolRegistry.registerTool({
            id: 'browser_getNetworkRequests',
            name: 'browser_getNetworkRequests',
            description: 'Get captured network requests (fetch/XHR). Useful for discovering APIs.',
            category: 'browser',
            enabled: true,
            inputSchema: {
                type: 'object',
                properties: {
                    filter: { type: 'string', enum: ['all', 'fetch', 'xhr'], description: 'Filter by request type (default: all)' },
                    clear: { type: 'boolean', description: 'Clear requests after retrieval (default: false)' },
                    tabId: { type: 'number', description: 'Optional tab ID (defaults to active tab)' },
                    browser: { type: 'string', enum: ['firefox', 'chrome', 'safari', 'edge'], description: 'Target browser (optional)' },
                },
            }
        });
        this.toolRegistry.registerTool({
            id: 'browser_getLocalStorage',
            name: 'browser_getLocalStorage',
            description: 'Get localStorage contents for the current domain.',
            category: 'browser',
            enabled: true,
            inputSchema: {
                type: 'object',
                properties: {
                    tabId: { type: 'number', description: 'Optional tab ID (defaults to active tab)' },
                    browser: { type: 'string', enum: ['firefox', 'chrome', 'safari', 'edge'], description: 'Target browser (optional)' },
                },
            }
        });
        this.toolRegistry.registerTool({
            id: 'browser_getCookies',
            name: 'browser_getCookies',
            description: 'Get cookies for the current domain.',
            category: 'browser',
            enabled: true,
            inputSchema: {
                type: 'object',
                properties: {
                    tabId: { type: 'number', description: 'Optional tab ID (defaults to active tab)' },
                    browser: { type: 'string', enum: ['firefox', 'chrome', 'safari', 'edge'], description: 'Target browser (optional)' },
                },
            }
        });
        // ========== BROWSER AUTOMATION TOOLS (Playwright-style) ==========
        this.toolRegistry.registerTool({
            id: 'browser_navigate',
            name: 'browser_navigate',
            description: 'Navigate to a URL in the browser. Set includeVisibleText: true to get page content summary (recommended for understanding pages).',
            category: 'browser',
            enabled: true,
            inputSchema: {
                type: 'object',
                properties: {
                    url: { type: 'string', description: 'URL to navigate to' },
                    includeVisibleText: { type: 'boolean', description: 'Return visible text content after navigation (default: true for better LLM understanding)' },
                    maxTextLength: { type: 'number', description: 'Max chars of visible text to return (default: 8000)' },
                    tabId: { type: 'number', description: 'Optional tab ID (defaults to active tab)' },
                    browser: { type: 'string', enum: ['firefox', 'chrome', 'safari', 'edge'], description: 'Target browser (optional)' },
                    waitUntil: { type: 'string', enum: ['load', 'domcontentloaded', 'networkidle'], description: 'Wait condition (optional)' },
                    timeout: { type: 'number', description: 'Navigation timeout in milliseconds (optional)' },
                },
                required: ['url'],
            }
        });
        this.toolRegistry.registerTool({
            id: 'browser_screenshot',
            name: 'browser_screenshot',
            description: 'Take a screenshot of the current page or a specific element in the browser.',
            category: 'browser',
            enabled: true,
            inputSchema: {
                type: 'object',
                properties: {
                    selector: { type: 'string', description: 'CSS selector for element to screenshot (optional, screenshots full page if not provided)' },
                    fullPage: { type: 'boolean', description: 'Whether to capture the full scrollable page (default: false)' },
                    tabId: { type: 'number', description: 'Optional tab ID (defaults to active tab)' },
                    browser: { type: 'string', enum: ['firefox', 'chrome', 'safari', 'edge'], description: 'Target browser (optional)' },
                },
            }
        });
        this.toolRegistry.registerTool({
            id: 'browser_go_back',
            name: 'browser_go_back',
            description: 'Navigate back in browser history.',
            category: 'browser',
            enabled: true,
            inputSchema: {
                type: 'object',
                properties: {
                    tabId: { type: 'number', description: 'Optional tab ID (defaults to active tab)' },
                    browser: { type: 'string', enum: ['firefox', 'chrome', 'safari', 'edge'], description: 'Target browser (optional)' },
                },
            }
        });
        this.toolRegistry.registerTool({
            id: 'browser_go_forward',
            name: 'browser_go_forward',
            description: 'Navigate forward in browser history.',
            category: 'browser',
            enabled: true,
            inputSchema: {
                type: 'object',
                properties: {
                    tabId: { type: 'number', description: 'Optional tab ID (defaults to active tab)' },
                    browser: { type: 'string', enum: ['firefox', 'chrome', 'safari', 'edge'], description: 'Target browser (optional)' },
                },
            }
        });
        this.toolRegistry.registerTool({
            id: 'browser_get_visible_html',
            name: 'browser_get_visible_html',
            description: 'Get the HTML content of the current page. Supports pagination for long pages.',
            category: 'browser',
            enabled: true,
            inputSchema: {
                type: 'object',
                properties: {
                    selector: { type: 'string', description: 'CSS selector to limit HTML to a specific container (optional)' },
                    removeScripts: { type: 'boolean', description: 'Remove all script tags (default: true)' },
                    removeStyles: { type: 'boolean', description: 'Remove all style tags (default: false)' },
                    cleanHtml: { type: 'boolean', description: 'Perform comprehensive HTML cleaning (default: true)' },
                    slice: { type: 'number', description: 'Which slice to return (0-indexed, default: 0). Use this to get additional content from long pages.' },
                    sliceSize: { type: 'number', description: 'Characters per slice (default: 15000)' },
                    tabId: { type: 'number', description: 'Optional tab ID (defaults to active tab)' },
                    browser: { type: 'string', enum: ['firefox', 'chrome', 'safari', 'edge'], description: 'Target browser (optional)' },
                },
            }
        });
        this.toolRegistry.registerTool({
            id: 'browser_hover',
            name: 'browser_hover',
            description: 'Hover over an element on the page.',
            category: 'browser',
            enabled: true,
            inputSchema: {
                type: 'object',
                properties: {
                    selector: { type: 'string', description: 'CSS selector for element to hover' },
                    tabId: { type: 'number', description: 'Optional tab ID (defaults to active tab)' },
                    browser: { type: 'string', enum: ['firefox', 'chrome', 'safari', 'edge'], description: 'Target browser (optional)' },
                },
                required: ['selector'],
            }
        });
        this.toolRegistry.registerTool({
            id: 'browser_drag',
            name: 'browser_drag',
            description: 'Drag an element to a target location.',
            category: 'browser',
            enabled: true,
            inputSchema: {
                type: 'object',
                properties: {
                    sourceSelector: { type: 'string', description: 'CSS selector for the element to drag' },
                    targetSelector: { type: 'string', description: 'CSS selector for the target location' },
                    tabId: { type: 'number', description: 'Optional tab ID (defaults to active tab)' },
                    browser: { type: 'string', enum: ['firefox', 'chrome', 'safari', 'edge'], description: 'Target browser (optional)' },
                },
                required: ['sourceSelector', 'targetSelector'],
            }
        });
        this.toolRegistry.registerTool({
            id: 'browser_press_key',
            name: 'browser_press_key',
            description: 'Press a keyboard key in the browser.',
            category: 'browser',
            enabled: true,
            inputSchema: {
                type: 'object',
                properties: {
                    key: { type: 'string', description: 'Key to press (e.g., "Enter", "Tab", "ArrowDown", "a", "Ctrl+c")' },
                    selector: { type: 'string', description: 'Optional CSS selector to focus before pressing key' },
                    tabId: { type: 'number', description: 'Optional tab ID (defaults to active tab)' },
                    browser: { type: 'string', enum: ['firefox', 'chrome', 'safari', 'edge'], description: 'Target browser (optional)' },
                },
                required: ['key'],
            }
        });
        this.toolRegistry.registerTool({
            id: 'browser_upload_file',
            name: 'browser_upload_file',
            description: 'Upload a file to a file input element.',
            category: 'browser',
            enabled: true,
            inputSchema: {
                type: 'object',
                properties: {
                    selector: { type: 'string', description: 'CSS selector for the file input element' },
                    filePath: { type: 'string', description: 'Absolute path to the file to upload' },
                    tabId: { type: 'number', description: 'Optional tab ID (defaults to active tab)' },
                    browser: { type: 'string', enum: ['firefox', 'chrome', 'safari', 'edge'], description: 'Target browser (optional)' },
                },
                required: ['selector', 'filePath'],
            }
        });
        this.toolRegistry.registerTool({
            id: 'browser_save_as_pdf',
            name: 'browser_save_as_pdf',
            description: 'Save the current page as a PDF file.',
            category: 'browser',
            enabled: true,
            inputSchema: {
                type: 'object',
                properties: {
                    outputPath: { type: 'string', description: 'Directory path where PDF will be saved' },
                    filename: { type: 'string', description: 'Name of the PDF file (default: page.pdf)' },
                    format: { type: 'string', enum: ['A4', 'Letter', 'Legal', 'Tabloid'], description: 'Page format (default: A4)' },
                    printBackground: { type: 'boolean', description: 'Whether to print background graphics (default: true)' },
                    tabId: { type: 'number', description: 'Optional tab ID (defaults to active tab)' },
                    browser: { type: 'string', enum: ['firefox', 'chrome', 'safari', 'edge'], description: 'Target browser (optional)' },
                },
                required: ['outputPath'],
            }
        });
    }
    setupToolHandlers() {
        this.server.setRequestHandler(types_js_1.ListToolsRequestSchema, async () => {
            // Check if any browser extensions are connected
            const browserStatus = await this.getConnectedBrowsers();
            const hasBrowserExtensions = browserStatus && browserStatus.browsers && browserStatus.browsers.length > 0;
            // Build connected browsers description
            const connectedBrowsersDesc = hasBrowserExtensions
                ? ` Connected: ${browserStatus.browsers.map((b) => b.type).join(', ')}.`
                : '';
            // Base native macOS tools
            const nativeTools = [
                // ========== Native macOS Tools ==========
                {
                    name: 'listApplications',
                    description: `🎯 MCP-EYES: List all running applications with their window bounds and identifiers.

MULTI-SCREEN STRATEGY:
• Run this whenever you need to know which apps/windows exist (Firefox, Finder, file pickers, etc.)
• The response includes absolute screen bounds for each window so you can plan mouse clicks on any monitor
• Use it to locate Finder windows or system dialogs (e.g., the macOS file picker) before calling getClickableElements + click
• Each application now includes a windows[] array (title + bounds) so you can target individual Finder windows or dialogs

IMPORTANT - WINDOW COUNTING:
• The windows[] array may not always be populated correctly, especially for Finder which can have multiple windows
• If you see "No windows detected" but know windows exist, use getUIElements in conjunction with this tool
• Workflow: 1) Call listApplications to find the app, 2) Focus the application, 3) Call getUIElements to see all windows and their titles (e.g., "Desktop — Local", "tmp")
• getUIElements returns window titles and UI elements that help identify and count multiple windows accurately`,
                    inputSchema: { type: 'object', properties: {} },
                },
                {
                    name: 'focusApplication',
                    description: `🎯 MCP-EYES: Focus on a specific application by bundle ID or name.

TIP:
• Use listApplications to find the exact name/bundle of Finder, Firefox, file pickers, etc.
• FocusFinder (or the “Open” dialog) before calling getClickableElements to interact with file pickers on any monitor.`,
                    inputSchema: {
                        type: 'object',
                        properties: {
                            identifier: {
                                type: 'string',
                                description: 'Bundle ID (e.g., com.apple.Music) or app name',
                            },
                        },
                        required: ['identifier'],
                    },
                },
                {
                    name: 'launchApplication',
                    description: '🎯 MCP-EYES: Launch an application by bundle ID or name. If already running, focuses it.',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            identifier: {
                                type: 'string',
                                description: 'Bundle ID (e.g., com.apple.Safari) or app name (e.g., Safari, Calculator)',
                            },
                        },
                        required: ['identifier'],
                    },
                },
                {
                    name: 'screenshot',
                    description: `🎯 MCP-EYES: Take a full-screen screenshot.

FALLBACK FOR BROWSER AUTOMATION:
• When browser automation hits limitations (reCAPTCHA, blocked interactions, etc.), use this to see the current state
• Combine with getClickableElements to find button locations, then use click to interact directly
• This gives you full visual control - you can see and interact with anything on screen, just like a human user
• Works perfectly for bypassing automation detection - you're controlling the mouse and keyboard directly`,
                    inputSchema: {
                        type: 'object',
                        properties: {
                            padding: {
                                type: 'number',
                                description: 'Padding around the window in pixels (default: 10) - ignored for full-screen',
                            },
                        },
                    },
                },
                {
                    name: 'screenshot_app',
                    description: `🎯 MCP-EYES: Take a screenshot of the focused application or a specific app by identifier.

FALLBACK FOR BROWSER AUTOMATION:
• When browser automation is blocked, use this to capture the browser window and see what's on screen
• Essential for visual debugging when browser tools can't interact with elements
• Combine with getClickableElements to find button locations, then use click to interact directly
• Perfect for handling reCAPTCHA, file uploads, and other automation blockers - you control the mouse/keyboard like a human`,
                    inputSchema: {
                        type: 'object',
                        properties: {
                            identifier: {
                                type: 'string',
                                description: 'Optional: Bundle ID (e.g., com.apple.Safari) or app name (e.g., Safari, Firefox). If not provided, uses the currently focused app.',
                            },
                        },
                    },
                },
                {
                    name: 'click',
                    description: `🎯 MCP-EYES: Click at a position relative to the focused app window.

FALLBACK FOR BROWSER AUTOMATION:
• When browser_clickElement fails or is blocked (reCAPTCHA, security restrictions), use this instead
• Get button locations from getClickableElements (returns screen coordinates)
• Use normalized coordinates (0-1) relative to the focused window
• This works exactly like a human clicking - bypasses all automation detection
• Perfect for clicking reCAPTCHA checkboxes, file upload buttons, or any element that blocks browser automation`,
                    inputSchema: {
                        type: 'object',
                        properties: {
                            x: {
                                type: 'number',
                                description: 'X coordinate (0-1 normalized)',
                            },
                            y: {
                                type: 'number',
                                description: 'Y coordinate (0-1 normalized)',
                            },
                            button: {
                                type: 'string',
                                enum: ['left', 'right'],
                                description: 'Mouse button (default: left)',
                            },
                        },
                        required: ['x', 'y'],
                    },
                },
                {
                    name: 'click_absolute',
                    description: `🎯 MCP-EYES: Click anywhere on the desktop using absolute screen coordinates (in pixels).

Use this when you need to focus or interact with a window that is not the currently focused app (e.g., multiple Finder windows on different monitors).
Workflow:
1. Call listApplications to get window bounds (per-app windows array).
2. Pick the window you need (Finder Desktop vs tmp, macOS file picker, etc.).
3. Compute the pixel coordinate you need (e.g., window.x + window.width * 0.5).
4. Call click_absolute with that X/Y to focus or click exactly there.

Great for: multi-window Finder workflows, dragging between monitors, clicking "Open" buttons in modals, or bringing hidden dialogs to the front.`,
                    inputSchema: {
                        type: 'object',
                        properties: {
                            x: {
                                type: 'number',
                                description: 'Absolute screen X coordinate in pixels',
                            },
                            y: {
                                type: 'number',
                                description: 'Absolute screen Y coordinate in pixels',
                            },
                            button: {
                                type: 'string',
                                enum: ['left', 'right'],
                                description: 'Mouse button (default: left)',
                            },
                        },
                        required: ['x', 'y'],
                    },
                },
                {
                    name: 'moveMouse',
                    description: `🎯 MCP-EYES: Move mouse to a position relative to the focused app window (without clicking).

FALLBACK FOR BROWSER AUTOMATION:
• Hover menus, reveal tooltips, or prepare inputs even when browser automation is blocked
• Use screenshot_app + getClickableElements to confirm coordinates, then moveMouse before clicking or typing
• Perfect for "hover to reveal" buttons, reCAPTCHA puzzles, file upload popovers, or anything that requires precise cursor placement
• Combine with click or typeText for full mouse+keyboard control that mimics a human user`,
                    inputSchema: {
                        type: 'object',
                        properties: {
                            x: {
                                type: 'number',
                                description: 'X coordinate (0-1 normalized)',
                            },
                            y: {
                                type: 'number',
                                description: 'Y coordinate (0-1 normalized)',
                            },
                        },
                        required: ['x', 'y'],
                    },
                },
                {
                    name: 'scroll',
                    description: `🎯 MCP-EYES: Scroll the mouse wheel. Positive deltaY scrolls up, negative scrolls down.

FALLBACK FOR BROWSER AUTOMATION:
• When pages block programmatic scroll or infinite feeds need "real" scrolling, use this to move the viewport like a human
• Combine with screenshot/screenshot_app to see what is currently visible, then scroll and rediscover elements
• Works with getClickableElements + click to reach off-screen controls that browser tools have trouble with
• Essential for scrolling through reCAPTCHA challenges, file dialogs, or any UI that insists on genuine mouse wheel input`,
                    inputSchema: {
                        type: 'object',
                        properties: {
                            deltaY: {
                                type: 'number',
                                description: 'Vertical scroll amount (positive=up, negative=down)',
                            },
                            deltaX: {
                                type: 'number',
                                description: 'Horizontal scroll amount (positive=right, negative=left)',
                            },
                            x: {
                                type: 'number',
                                description: 'Optional X coordinate to scroll at (0-1 normalized)',
                            },
                            y: {
                                type: 'number',
                                description: 'Optional Y coordinate to scroll at (0-1 normalized)',
                            },
                        },
                    },
                },
                {
                    name: 'drag',
                    description: `🎯 MCP-EYES: Drag from one position to another (click and hold, move, release).

FALLBACK FOR BROWSER AUTOMATION:
• Move sliders, reorder items, drag-and-drop files, or complete puzzle CAPTCHAs exactly like a human
• Determine start/end coordinates using screenshot_app + getClickableElements, then drag to perform precise mouse gestures
• Perfect when a site requires "real" drag gestures that browser automation can't simulate`,
                    inputSchema: {
                        type: 'object',
                        properties: {
                            startX: {
                                type: 'number',
                                description: 'Start X coordinate (0-1 normalized)',
                            },
                            startY: {
                                type: 'number',
                                description: 'Start Y coordinate (0-1 normalized)',
                            },
                            endX: {
                                type: 'number',
                                description: 'End X coordinate (0-1 normalized)',
                            },
                            endY: {
                                type: 'number',
                                description: 'End Y coordinate (0-1 normalized)',
                            },
                        },
                        required: ['startX', 'startY', 'endX', 'endY'],
                    },
                },
                {
                    name: 'getClickableElements',
                    description: `🎯 MCP-EYES: Get all clickable UI elements in the focused application.

FALLBACK FOR BROWSER AUTOMATION:
• When browser_getInteractiveElements can't find elements or automation is blocked, use this
• Returns clickable elements with screen coordinates (centerX, centerY) for direct clicking
• Works on ANY application, including browsers - perfect for finding buttons when browser tools fail
• Combine with screenshot_app to see the visual state, then getClickableElements to find button locations
• Use the returned coordinates with the click tool to interact directly - bypasses all automation detection
• Essential for handling reCAPTCHA, file uploads, and other blockers - you can find and click anything on screen
• Pair with listApplications to confirm which window (and which display) you are targeting before clicking`,
                    inputSchema: { type: 'object', properties: {} },
                },
                {
                    name: 'getUIElements',
                    description: `🎯 MCP-EYES: Accessibility tree dump for the focused application. Returns clickable controls *and* non-clickable UI elements (rows, cells, static text, file icons, etc.) with absolute + normalized coordinates.

Use this when you need to understand Finder contents, identify file picker rows, or inspect custom UIs that aren't exposed through browser tools.

Workflow:
1. Focus the window you care about (Finder Desktop, Finder tmp, macOS dialog).
2. Call getUIElements to receive a JSON payload of every interesting element, including text labels and bounds.
3. Use click / click_absolute / drag with the provided coordinates.
4. Combine with screenshot_app to visually confirm what you're selecting.

This is the go-to fallback when the DOM/browser layer is unavailable. It uses Apple Accessibility directly, so every window on any monitor becomes discoverable.`,
                    inputSchema: { type: 'object', properties: {} },
                },
                {
                    name: 'currentApp',
                    description: `🎯 MCP-EYES: Get information about the currently focused application.

Returns the bundle ID and window bounds of the app that was last focused via focusApplication.
Useful for checking what app is currently in focus before performing automation actions.`,
                    inputSchema: { type: 'object', properties: {} },
                },
                {
                    name: 'typeText',
                    description: `🎯 MCP-EYES: Type text into the focused application.

FALLBACK FOR BROWSER AUTOMATION:
• When browser_fillElement fails or is blocked, use this instead
• First click on the input field (using click tool), then type the text
• This works exactly like a human typing - bypasses all automation detection
• Perfect for filling forms when browser automation is blocked
• Can also type file paths for file uploads (after clicking the file input button)
• Works great with reCAPTCHA and other security measures - you're typing like a real user`,
                    inputSchema: {
                        type: 'object',
                        properties: {
                            text: { type: 'string', description: 'Text to type' },
                        },
                        required: ['text'],
                    },
                },
                {
                    name: 'pressKey',
                    description: `🎯 MCP-EYES: Press a keyboard key (supports modifiers like Command+L).

FALLBACK FOR BROWSER AUTOMATION:
• Send Enter, Tab, Escape, Command+L, Ctrl+Shift+S, etc. exactly like a real user
• Use after click/typeText to submit forms, confirm dialogs, focus the address bar, or progress through reCAPTCHA steps
• Combine with screenshot_app to confirm the UI state, then press the needed keys to keep automation moving even when browser APIs block actions`,
                    inputSchema: {
                        type: 'object',
                        properties: {
                            key: {
                                type: 'string',
                                description: 'Key to press (Enter, Tab, Escape, Command+L, Ctrl+Shift+S, etc.)',
                            },
                        },
                        required: ['key'],
                    },
                },
                {
                    name: 'analyzeWithOCR',
                    description: `🎯 MCP-EYES: Analyze the current screen using OCR.

FALLBACK FOR BROWSER AUTOMATION:
• When stuck, take screenshot/screenshot_app and run OCR to read the page, discover instructions, or capture text hidden from DOM
• Great for extracting reCAPTCHA prompts, file upload hints, or confirmation messages that browser tools cannot access
• Returns text plus absolute pixel bounds (x/y/width/height) relative to the screenshot, so you can click the matching coordinates afterward`,
                    inputSchema: { type: 'object', properties: {} },
                },
                {
                    name: 'checkPermissions',
                    description: '🎯 MCP-EYES: Check if accessibility permissions are granted.',
                    inputSchema: { type: 'object', properties: {} },
                },
            ];
            // Browser Extension Tools - only included when extensions are connected
            // IMPORTANT: When browser automation hits limitations (reCAPTCHA, file uploads, security restrictions),
            // you have FULL CONTROL via native macOS tools: screenshot, click, typeText, getClickableElements.
            // You can take screenshots to see the page, get button locations, and click/type directly - just like a human user.
            // This means reCAPTCHA, file uploads, and other "automation blockers" are NOT limitations - use native tools!
            // WORKFLOW TIP: If browser_clickElement on a custom control (e.g., stylized radio/checkbox) fails,
            // run browser_executeScript using the selector returned by browser_getInteractiveElements to click the real input inside.
            // Only fall back to screenshot/getClickableElements/click when DOM + script attempts still fail.
            const browserTools = [
                {
                    name: 'browser_listConnected',
                    description: `🌐 MCP-EYES BROWSER: List all connected browser extensions.${connectedBrowsersDesc}`,
                    inputSchema: { type: 'object', properties: {} },
                },
                {
                    name: 'browser_setDefaultBrowser',
                    description: '🌐 MCP-EYES BROWSER: Set the default browser for commands when no browser is specified.',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            browser: {
                                type: 'string',
                                enum: ['firefox', 'chrome', 'safari', 'edge'],
                                description: 'Browser to set as default',
                            },
                        },
                        required: ['browser'],
                    },
                },
                {
                    name: 'browser_getTabs',
                    description: '🌐 MCP-EYES BROWSER: List all open browser tabs.',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            browser: {
                                type: 'string',
                                enum: ['firefox', 'chrome', 'safari', 'edge'],
                                description: 'Target browser (optional, uses default if not specified)',
                            },
                        },
                    },
                },
                {
                    name: 'browser_getActiveTab',
                    description: '🌐 MCP-EYES BROWSER: Get info about the currently active browser tab.',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            browser: {
                                type: 'string',
                                enum: ['firefox', 'chrome', 'safari', 'edge'],
                                description: 'Target browser (optional, uses default if not specified)',
                            },
                        },
                    },
                },
                {
                    name: 'browser_focusTab',
                    description: '🌐 MCP-EYES BROWSER: Focus a specific browser tab by ID.',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            tabId: {
                                type: 'number',
                                description: 'The tab ID to focus (from browser_getTabs)',
                            },
                            browser: {
                                type: 'string',
                                enum: ['firefox', 'chrome', 'safari', 'edge'],
                                description: 'Target browser (optional, uses default if not specified)',
                            },
                        },
                        required: ['tabId'],
                    },
                },
                {
                    name: 'browser_createTab',
                    description: '🌐 MCP-EYES BROWSER: Create a new browser tab and navigate to a URL.',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            url: {
                                type: 'string',
                                description: 'URL to navigate to in the new tab',
                            },
                            browser: {
                                type: 'string',
                                enum: ['firefox', 'chrome', 'safari', 'edge'],
                                description: 'Target browser (optional, uses default if not specified)',
                            },
                        },
                        required: ['url'],
                    },
                },
                {
                    name: 'browser_closeTab',
                    description: '🌐 MCP-EYES BROWSER: Close a browser tab by ID.',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            tabId: {
                                type: 'number',
                                description: 'The tab ID to close (from browser_getTabs)',
                            },
                            browser: {
                                type: 'string',
                                enum: ['firefox', 'chrome', 'safari', 'edge'],
                                description: 'Target browser (optional, uses default if not specified)',
                            },
                        },
                        required: ['tabId'],
                    },
                },
                {
                    name: 'browser_getPageInfo',
                    description: '🌐 MCP-EYES BROWSER: Get current page URL, title, and metadata.',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            tabId: {
                                type: 'number',
                                description: 'Optional tab ID (defaults to active tab)',
                            },
                            browser: {
                                type: 'string',
                                enum: ['firefox', 'chrome', 'safari', 'edge'],
                                description: 'Target browser (optional, uses default if not specified)',
                            },
                        },
                    },
                },
                {
                    name: 'browser_getInteractiveElements',
                    description: `🌐 MCP-EYES BROWSER: Primary tool for discovering clickable and interactive elements on the current page.

Returns a numbered list of interactive elements (buttons, links, inputs, selects, etc.) with:
• A stable CSS selector for each element
• Element type (e.g. button, link, input, select)
• Visible text/label (if any)

When to use:
• As the first step on a new page to see what you can click or interact with
• Whenever the page changes after a click or navigation and you need an updated map of interactive elements

Typical workflow:
1. Call browser_getInteractiveElements to list all clickable/interactive elements.
2. Select the element you need by its number, text, or description.
3. Copy its selector into other tools like browser_clickElement or browser_fillElement.

FALLBACK FOR LIMITATIONS:
• If browser automation is blocked or selectors don't work, use native getClickableElements instead
• Native getClickableElements returns screen coordinates that work with the click tool
• This bypasses all automation detection - you're clicking at actual screen positions like a human

Important:
• Do not invent or guess selectors. Always use selectors returned by this tool (or browser_getPageContext).
• For reading general page text, use browser_getVisibleText instead.
• When automation is blocked, fall back to native tools (screenshot + getClickableElements + click).`,
                    inputSchema: {
                        type: 'object',
                        properties: {
                            tabId: {
                                type: 'number',
                                description: 'Optional tab ID (defaults to active tab)',
                            },
                            browser: {
                                type: 'string',
                                enum: ['firefox', 'chrome', 'safari', 'edge'],
                                description: 'Target browser (optional, uses default if not specified)',
                            },
                        },
                    },
                },
                {
                    name: 'browser_getPageContext',
                    description: `🌐 MCP-EYES BROWSER: Convenience tool that returns a combined snapshot of the current page, typically including:
• Visible text (similar to browser_getVisibleText)
• Key interactive elements with selectors (similar to browser_getInteractiveElements)

When to use:
• When you first arrive on a page and want both the main content and the interactive elements in a single call.
• When you want to reduce the number of separate tool calls for efficiency.

Typical workflow:
• Call browser_getPageContext to understand both content and available actions.
• Pick relevant interactive elements and copy their selectors for use with browser_clickElement or browser_fillElement.
• For more detailed or filtered interactive-element discovery, follow up with browser_getInteractiveElements.

Typical next tools: browser_clickElement, browser_fillElement, or browser_getVisibleText for more detail.

Important:
• This is a convenience tool, not a replacement for specialized tools.
• For precise interactions or targeted discovery, still rely on browser_getInteractiveElements.`,
                    inputSchema: {
                        type: 'object',
                        properties: {
                            tabId: {
                                type: 'number',
                                description: 'Optional tab ID (defaults to active tab)',
                            },
                            browser: {
                                type: 'string',
                                enum: ['firefox', 'chrome', 'safari', 'edge'],
                                description: 'Target browser (optional, uses default if not specified)',
                            },
                        },
                    },
                },
                {
                    name: 'browser_clickElement',
                    description: `🌐 MCP-EYES BROWSER: Click a specific interactive element (button, link, etc.) using its selector.

When to use:
• To press a button, follow a link, toggle a checkbox, open a dropdown, etc.

Required input:
• A valid selector (usually obtained from browser_getInteractiveElements or browser_getPageContext).

Typical workflow:
1. Call browser_getInteractiveElements to discover elements.
2. Identify the desired element by its text/description and copy its selector.
3. Call browser_clickElement with that selector.
4. After clicking, do one of the following:
   • If you expect navigation: call browser_waitForPageLoad, then rediscover elements.
   • If you expect dynamic content to appear/change: call browser_waitForSelector for a specific new element, then rediscover with browser_getInteractiveElements or read with browser_getVisibleText.

Typical next tools: browser_waitForPageLoad or browser_waitForSelector, then browser_getInteractiveElements / browser_getVisibleText.

FALLBACK FOR LIMITATIONS:
• If browser automation is blocked (reCAPTCHA, security restrictions, etc.), you have FULL CONTROL via native tools:
  1. Use screenshot_app to capture the browser window
  2. Use getClickableElements to find button locations with screen coordinates
  3. Use click with normalized coordinates (0-1) to click directly - this works like a human user and bypasses automation detection
  4. Use typeText to type directly into fields - this also bypasses automation detection
• reCAPTCHA and other "automation blockers" are NOT limitations - you can interact with them using native mouse/keyboard control!

Important:
• Do not guess selectors; always get them from discovery tools.
• If nothing obvious happens after a click, wait (browser_waitForPageLoad or browser_waitForSelector) and then rediscover.
• When automation is blocked, don't give up - use native tools (screenshot + click/typeText) to continue.`,
                    inputSchema: {
                        type: 'object',
                        properties: {
                            selector: {
                                type: 'string',
                                description: 'CSS selector from browser_getInteractiveElements (e.g., "#submit-btn", "a[href=\'/login\']")',
                            },
                            tabId: {
                                type: 'number',
                                description: 'Optional tab ID (defaults to active tab)',
                            },
                            browser: {
                                type: 'string',
                                enum: ['firefox', 'chrome', 'safari', 'edge'],
                                description: 'Target browser (optional, uses default if not specified)',
                            },
                        },
                        required: ['selector'],
                    },
                },
                {
                    name: 'browser_fillElement',
                    description: `🌐 MCP-EYES BROWSER: Fill text inputs, textareas, or other form fields using their selector and the desired value.

When to use:
• To type into login forms, search boxes, registration fields, or any editable field.

Typical form workflow:
1. Call browser_getInteractiveElements to discover inputs and their selectors.
2. Identify the correct field by its label/placeholder/nearby text.
3. Call browser_fillElement with:
   • The field's selector
   • The value to type into the field
4. Repeat for all required fields.
5. Use browser_clickElement on the form's submit button.
6. After submitting, call browser_waitForPageLoad or browser_waitForSelector for the result area, then rediscover/read content.

Typical next tools: browser_clickElement (on submit button), then browser_waitForPageLoad or browser_waitForSelector.

FALLBACK FOR LIMITATIONS:
• If browser automation is blocked or file uploads fail, you have FULL CONTROL via native tools:
  1. Use screenshot_app to capture the browser window and see the current state
  2. Use getClickableElements to find input fields and buttons with screen coordinates
  3. Use click to click on input fields (focus them)
  4. Use typeText to type directly - this works like a human user and bypasses automation detection
  5. For file uploads: click the file input button, then use typeText to type the file path (or use native file dialogs)
• Browser security restrictions on file uploads are NOT limitations - you can click and type just like a human!

Important:
• For select/dropdown elements, you may need to click to open them first, then fill or choose options depending on your implementation.
• Do not guess selectors; always obtain them from discovery tools.
• When automation is blocked or file uploads fail, don't give up - use native tools (screenshot + click/typeText) to continue.`,
                    inputSchema: {
                        type: 'object',
                        properties: {
                            selector: {
                                type: 'string',
                                description: 'CSS selector from browser_getInteractiveElements (e.g., "#username", "input[name=email]")',
                            },
                            value: {
                                type: 'string',
                                description: 'Value to fill in the field',
                            },
                            tabId: {
                                type: 'number',
                                description: 'Optional tab ID (defaults to active tab)',
                            },
                            browser: {
                                type: 'string',
                                enum: ['firefox', 'chrome', 'safari', 'edge'],
                                description: 'Target browser (optional, uses default if not specified)',
                            },
                        },
                        required: ['selector', 'value'],
                    },
                },
                {
                    name: 'browser_scrollTo',
                    description: '🌐 MCP-EYES BROWSER: Scroll to a position or element.',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            selector: {
                                type: 'string',
                                description: 'CSS selector to scroll to (optional)',
                            },
                            x: {
                                type: 'number',
                                description: 'X position to scroll to (optional)',
                            },
                            y: {
                                type: 'number',
                                description: 'Y position to scroll to (optional)',
                            },
                            tabId: {
                                type: 'number',
                                description: 'Optional tab ID (defaults to active tab)',
                            },
                            browser: {
                                type: 'string',
                                enum: ['firefox', 'chrome', 'safari', 'edge'],
                                description: 'Target browser (optional, uses default if not specified)',
                            },
                        },
                    },
                },
                {
                    name: 'browser_executeScript',
                    description: `🌐 MCP-EYES BROWSER: Execute a custom script (e.g. JavaScript) in the page context to extract or compute values, usually when built-in tools are not enough.

Primary use for automation:
• Extract href URLs or other attributes without clicking links.

Typical link-extraction pattern:
1. Use browser_getInteractiveElements to find the link by its text/description.
2. Take its selector from the results.
3. Call browser_executeScript with a script like:
   – For a single link: return document.querySelector('<SELECTOR>').href;
   – For multiple links: return Array.from(document.querySelectorAll('<SELECTOR>')).map(a => a.href);
4. Use the extracted URL for navigation or reporting instead of clicking.

Other uses:
• Read or compute advanced page state that is not exposed by other tools.

Important:
• Always base selectors on results from browser_getInteractiveElements or browser_getPageContext, not guesses.
• Keep scripts simple, deterministic, and read-only (no complex DOM modifications).
• Script MUST include an explicit 'return' statement. Result is returned directly (not nested).`,
                    inputSchema: {
                        type: 'object',
                        properties: {
                            script: {
                                type: 'string',
                                description: 'JavaScript code with explicit return. Example: "return document.querySelector(\'#link\').href;"',
                            },
                            tabId: {
                                type: 'number',
                                description: 'Optional tab ID (defaults to active tab)',
                            },
                            browser: {
                                type: 'string',
                                enum: ['firefox', 'chrome', 'safari', 'edge'],
                                description: 'Target browser (optional, uses default if not specified)',
                            },
                        },
                        required: ['script'],
                    },
                },
                {
                    name: 'browser_getFormData',
                    description: '🌐 MCP-EYES BROWSER: Get all form data from the current page.',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            tabId: {
                                type: 'number',
                                description: 'Optional tab ID (defaults to active tab)',
                            },
                            browser: {
                                type: 'string',
                                enum: ['firefox', 'chrome', 'safari', 'edge'],
                                description: 'Target browser (optional, uses default if not specified)',
                            },
                        },
                    },
                },
                {
                    name: 'browser_setWatchMode',
                    description: '🌐 MCP-EYES BROWSER: Enable/disable DOM change watching.',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            enabled: {
                                type: 'boolean',
                                description: 'Whether to enable watch mode',
                            },
                            tabId: {
                                type: 'number',
                                description: 'Optional tab ID (defaults to active tab)',
                            },
                            browser: {
                                type: 'string',
                                enum: ['firefox', 'chrome', 'safari', 'edge'],
                                description: 'Target browser (optional, uses default if not specified)',
                            },
                        },
                        required: ['enabled'],
                    },
                },
                // ========== NEW BROWSER TOOLS ==========
                {
                    name: 'browser_getVisibleText',
                    description: `🌐 MCP-EYES BROWSER: Read the visible text content of the current page as plain text with PAGINATION support for long pages.

**Pagination:** For long pages, content is split into slices (default 15,000 chars each). The response tells you:
- Current slice number and total slices available
- Whether more content is available (hasMore: true)
- To get more content, call again with slice: 1, slice: 2, etc.

**Example for long page:**
First call: browser_getVisibleText() → "Slice 1 of 3 (hasMore: true)..."
Second call: browser_getVisibleText({slice: 1}) → "Slice 2 of 3 (hasMore: true)..."
Third call: browser_getVisibleText({slice: 2}) → "Slice 3 of 3 (hasMore: false)..."

When to use:
• To understand page content and structure
• To locate specific sections, headings, or labels
• To extract data, descriptions, or instructions
• To search through long pages slice by slice

Typical next tools: browser_getInteractiveElements (to find clickable elements near the text you read).

Important:
• This returns plain text only. It does not tell you what is clickable.
• For discovering clickable elements (buttons, links, inputs), use browser_getInteractiveElements instead.`,
                    inputSchema: {
                        type: 'object',
                        properties: {
                            slice: {
                                type: 'number',
                                description: 'Which slice to return (0-indexed, default: 0). Use this to get additional content from long pages.',
                            },
                            sliceSize: {
                                type: 'number',
                                description: 'Characters per slice (default: 15000). Increase for more content per request.',
                            },
                            tabId: {
                                type: 'number',
                                description: 'Optional tab ID (defaults to active tab)',
                            },
                            browser: {
                                type: 'string',
                                enum: ['firefox', 'chrome', 'safari', 'edge'],
                                description: 'Target browser (optional, uses default if not specified)',
                            },
                        },
                    },
                },
                {
                    name: 'browser_searchVisibleText',
                    description: `🌐 MCP-EYES BROWSER: Search for keywords in the visible text AND identify what UI control contains each match (button, link, input, dropdown, etc.).

**Much faster than reading slices** when you're looking for specific content on a long page.

**Example:**
browser_searchVisibleText({query: "apply"})
→ Returns matches with context AND tells you what control type contains each match:

1. [pos 12,450] ...ready to [Apply] for this position?...
   🎯 Control: BUTTON | selector: button.apply-btn

2. [pos 28,100] ...please [Apply] the changes below...
   📄 Plain text (not in interactive control)

🎮 Interactive elements matching "apply":
  1. [BUTTON] "Apply Now" → selector: button.apply-btn
  2. [LINK] "Apply Here" → selector: a.apply-link

**Control types detected:**
• BUTTON, LINK, SUBMIT BUTTON
• TEXT INPUT, EMAIL INPUT, PASSWORD INPUT
• CHECKBOX, RADIO BUTTON
• DROPDOWN/SELECT, TEXT AREA
• HEADING, PARAGRAPH, LABEL, LIST ITEM
• And more...

**Use cases:**
• Find buttons/links by their text
• Locate form fields by label
• Search for specific controls to interact with
• Know immediately if text is clickable or just content

**Workflow:**
1. browser_navigate(url) → See first 8K chars
2. browser_searchVisibleText({query: "submit"}) → Find the submit button with its selector
3. browser_clickElement(selector) → Click it directly!`,
                    inputSchema: {
                        type: 'object',
                        properties: {
                            query: {
                                type: 'string',
                                description: 'Search query (case-insensitive). Can be a word, phrase, or simple pattern.',
                            },
                            contextChars: {
                                type: 'number',
                                description: 'Characters of context around each match (default: 100)',
                            },
                            maxMatches: {
                                type: 'number',
                                description: 'Maximum matches to return (default: 10)',
                            },
                            tabId: {
                                type: 'number',
                                description: 'Optional tab ID (defaults to active tab)',
                            },
                            browser: {
                                type: 'string',
                                enum: ['firefox', 'chrome', 'safari', 'edge'],
                                description: 'Target browser (optional, uses default if not specified)',
                            },
                        },
                        required: ['query'],
                    },
                },
                {
                    name: 'browser_waitForSelector',
                    description: `🌐 MCP-EYES BROWSER: Wait until a specific element appears, becomes visible, or is ready on the current page, using its selector.

When to use:
• After clicking a button that reveals/hides dynamic content without a full page navigation
• When expecting a modal, dropdown, or result list to appear

Typical workflow:
1. Use browser_clickElement on a button or link.
2. Call browser_waitForSelector with the selector of the element you expect to appear (e.g. result container, modal).
3. Once it resolves, call:
   • browser_getVisibleText to read the new content, and/or
   • browser_getInteractiveElements to discover new clickable elements.

Difference from browser_waitForPageLoad:
• browser_waitForSelector is for dynamic changes on the same page (no navigation).
• browser_waitForPageLoad is for full page navigations.

Typical next tools: browser_getInteractiveElements or browser_getVisibleText.

Important:
• The selector should come from prior discovery or known UI patterns; do not invent random selectors.
• If selectors fail due to blocking/obfuscation, use native screenshot_app + getClickableElements + click/typeText to keep interacting with the UI like a human.`,
                    inputSchema: {
                        type: 'object',
                        properties: {
                            selector: {
                                type: 'string',
                                description: 'CSS selector to wait for (from browser_getInteractiveElements)',
                            },
                            timeout: {
                                type: 'number',
                                description: 'Timeout in milliseconds (default: 10000)',
                            },
                            tabId: {
                                type: 'number',
                                description: 'Optional tab ID (defaults to active tab)',
                            },
                            browser: {
                                type: 'string',
                                enum: ['firefox', 'chrome', 'safari', 'edge'],
                                description: 'Target browser (optional, uses default if not specified)',
                            },
                        },
                        required: ['selector'],
                    },
                },
                {
                    name: 'browser_waitForPageLoad',
                    description: `🌐 MCP-EYES BROWSER: Wait until the current page finishes loading after navigation.

When to use:
• After clicking a link or submit button that navigates to a new page
• After initiating a redirect or manual navigation

Typical workflow:
1. Use browser_clickElement (or your navigation method).
2. Call browser_waitForPageLoad to wait for the new page to fully load.
3. Then call browser_getInteractiveElements and/or browser_getVisibleText to understand and interact with the new page.

Difference from browser_waitForSelector:
• Use this when the URL or page changes.
• For changes within the same page (modals, accordions, etc.), use browser_waitForSelector instead.

Typical next tools: browser_getInteractiveElements and/or browser_getVisibleText.

Important:
• Do not call this repeatedly in a tight loop; wait for page changes before rediscovering.
• If a navigation gets stuck behind a CAPTCHA or interstitial, use screenshot_app + native click/typeText to complete it just like a human, then continue with browser tools.`,
                    inputSchema: {
                        type: 'object',
                        properties: {
                            timeout: {
                                type: 'number',
                                description: 'Timeout in milliseconds (default: 30000)',
                            },
                            tabId: {
                                type: 'number',
                                description: 'Optional tab ID (defaults to active tab)',
                            },
                            browser: {
                                type: 'string',
                                enum: ['firefox', 'chrome', 'safari', 'edge'],
                                description: 'Target browser (optional, uses default if not specified)',
                            },
                        },
                    },
                },
                {
                    name: 'browser_selectOption',
                    description: `🌐 MCP-EYES BROWSER: Select an option in a dropdown/select element.

FALLBACK:
• If the select element is protected or custom (no standard selectors), click it via native tools and use typeText/pressKey to pick the option, just like a human.`,
                    inputSchema: {
                        type: 'object',
                        properties: {
                            selector: {
                                type: 'string',
                                description: 'CSS selector for the select element',
                            },
                            value: {
                                type: 'string',
                                description: 'Option value or text to select',
                            },
                            tabId: {
                                type: 'number',
                                description: 'Optional tab ID (defaults to active tab)',
                            },
                            browser: {
                                type: 'string',
                                enum: ['firefox', 'chrome', 'safari', 'edge'],
                                description: 'Target browser (optional, uses default if not specified)',
                            },
                        },
                        required: ['selector', 'value'],
                    },
                },
                {
                    name: 'browser_isElementVisible',
                    description: `🌐 MCP-EYES BROWSER: Check if an element exists and is visible.

If visibility checks fail due to heavy anti-bot measures, remember you can always fall back to screenshot_app + getClickableElements + click/typeText for direct human-like control.`,
                    inputSchema: {
                        type: 'object',
                        properties: {
                            selector: {
                                type: 'string',
                                description: 'CSS selector to check',
                            },
                            tabId: {
                                type: 'number',
                                description: 'Optional tab ID (defaults to active tab)',
                            },
                            browser: {
                                type: 'string',
                                enum: ['firefox', 'chrome', 'safari', 'edge'],
                                description: 'Target browser (optional, uses default if not specified)',
                            },
                        },
                        required: ['selector'],
                    },
                },
                {
                    name: 'browser_getConsoleLogs',
                    description: '🌐 MCP-EYES BROWSER: Get captured console logs. Useful for debugging.',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            filter: {
                                type: 'string',
                                enum: ['all', 'log', 'error', 'warn', 'info', 'debug'],
                                description: 'Filter by log type (default: all)',
                            },
                            clear: {
                                type: 'boolean',
                                description: 'Clear logs after retrieval (default: false)',
                            },
                            tabId: {
                                type: 'number',
                                description: 'Optional tab ID (defaults to active tab)',
                            },
                            browser: {
                                type: 'string',
                                enum: ['firefox', 'chrome', 'safari', 'edge'],
                                description: 'Target browser (optional, uses default if not specified)',
                            },
                        },
                    },
                },
                {
                    name: 'browser_getNetworkRequests',
                    description: '🌐 MCP-EYES BROWSER: Get captured network requests (fetch/XHR). Useful for discovering APIs.',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            filter: {
                                type: 'string',
                                enum: ['all', 'fetch', 'xhr'],
                                description: 'Filter by request type (default: all)',
                            },
                            clear: {
                                type: 'boolean',
                                description: 'Clear requests after retrieval (default: false)',
                            },
                            tabId: {
                                type: 'number',
                                description: 'Optional tab ID (defaults to active tab)',
                            },
                            browser: {
                                type: 'string',
                                enum: ['firefox', 'chrome', 'safari', 'edge'],
                                description: 'Target browser (optional, uses default if not specified)',
                            },
                        },
                    },
                },
                {
                    name: 'browser_getLocalStorage',
                    description: '🌐 MCP-EYES BROWSER: Get localStorage contents for the current domain.',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            tabId: {
                                type: 'number',
                                description: 'Optional tab ID (defaults to active tab)',
                            },
                            browser: {
                                type: 'string',
                                enum: ['firefox', 'chrome', 'safari', 'edge'],
                                description: 'Target browser (optional, uses default if not specified)',
                            },
                        },
                    },
                },
                {
                    name: 'browser_getCookies',
                    description: '🌐 MCP-EYES BROWSER: Get cookies for the current domain.',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            tabId: {
                                type: 'number',
                                description: 'Optional tab ID (defaults to active tab)',
                            },
                            browser: {
                                type: 'string',
                                enum: ['firefox', 'chrome', 'safari', 'edge'],
                                description: 'Target browser (optional, uses default if not specified)',
                            },
                        },
                    },
                },
                // ========== ENHANCED BROWSER TOOLS ==========
                {
                    name: 'browser_inspectCurrentPage',
                    description: `🌐 MCP-EYES BROWSER: **START HERE for any new page.** Single call that gives you EVERYTHING: page info + all form fields with labels + coordinates.

**What you get in ONE call:**
{
  pageInfo: {
    url: "https://example.com/apply",
    title: "Job Application",
    domain: "example.com",
    viewport: { width: 1280, height: 720 }
  },
  elements: {
    elements: [
      {
        type: "email-input",           // Specific types: email-input, password-input, text-input, tel-input, number-input, etc.
        label: "Email Address",        // Extracted from <label>, aria-label, or placeholder
        currentValue: "",              // See what's already filled
        selector: "#email",            // Use with browser_clickElement or browser_fillElement
        placeholder: "your@email.com",
        required: true,
        disabled: false,
        coordinates: {
          absolute: { x: 120, y: 250, centerX: 220, centerY: 270 },     // Pixels from top-left
          normalized: { x: 0.15, y: 0.25, centerX: 0.275, centerY: 0.27 } // 0-1 range (use with native click)
        }
      },
      {
        type: "dropdown",
        label: "Country",
        currentValue: { value: "US", text: "United States" },
        selector: "select#country",
        coordinates: { ... }
      },
      {
        type: "submit-button",
        label: "Continue",
        selector: "button[type='submit']",
        coordinates: { ... }
      }
    ],
    radioGroups: {
      "employment_status": [/* radio buttons for this group */]
    },
    summary: { total: 15, inputs: 8, dropdowns: 2, checkboxes: 1, buttons: 3 }
  }
}

**When to use:**
✅ **FIRST call on any new page** - replaces browser_getPageInfo + browser_getInteractiveElements
✅ Before filling a form - see all fields with their labels in one shot
✅ When you need coordinates for fallback to native clicking
✅ To understand page structure quickly

**COMPLETE workflow for job application:**
1. browser_inspectCurrentPage()
   → You now have ALL fields with labels, types, and coordinates

2. Fill fields using labels (EASIEST):
   browser_fillFormField("Email", "user@example.com")
   browser_fillFormField("First Name", "John")
   browser_fillFormField("Last Name", "Doe")
   browser_fillFormField("Phone", "555-1234")

3. Find submit button in the elements array:
   Look for type: "submit-button" with label "Continue" or "Submit"

4. Click submit:
   browser_clickElement(submitButtonSelector)

**Alternative workflow if browser_fillFormField fails:**
1. browser_inspectCurrentPage()
2. For each field, use the returned selector:
   browser_clickElement(selector)
   browser_fillElement(selector, value)
3. Click submit button

**FALLBACK if browser automation blocked:**
The normalized coordinates (0-1) work perfectly with native tools:
1. browser_inspectCurrentPage() → get coordinates
2. For each field:
   - click(normalizedX, normalizedY) → focus field
   - typeText(value) → type value
3. Find submit button coordinates, click it

**Pro tips:**
• elements.summary gives quick stats: how many inputs, dropdowns, buttons
• radioGroups shows radio buttons grouped by name (e.g., "gender", "subscription_type")
• Check currentValue to see pre-filled fields
• type field is specific: "email-input", "password-input", "tel-input", not just "input"
• Submit buttons have type: "submit-button" for easy finding`,
                    inputSchema: {
                        type: 'object',
                        properties: {
                            tabId: {
                                type: 'number',
                                description: 'Optional tab ID (defaults to active tab)',
                            },
                            browser: {
                                type: 'string',
                                enum: ['firefox', 'chrome', 'safari', 'edge'],
                                description: 'Target browser (optional, uses default if not specified)',
                            },
                            includeScreenshot: {
                                type: 'boolean',
                                description: 'Include screenshot in response (default: true)',
                                default: true,
                            },
                            includeOCR: {
                                type: 'boolean',
                                description: 'Include OCR text extraction (default: false)',
                                default: false,
                            },
                        },
                    },
                },
                {
                    name: 'browser_getUIElements',
                    description: `🌐 MCP-EYES BROWSER: Enhanced form field detection. **Use browser_inspectCurrentPage instead** - it returns the same data plus page info.

This tool returns the same elements data as browser_inspectCurrentPage but WITHOUT page info. Only use if you specifically need to refresh element data without getting page info again.

**What you get:**
{
  elements: [
    {
      type: "email-input",              // 14 specific types: email-input, password-input, text-input, number-input, tel-input, url-input, date-input, file-input, dropdown, textarea, checkbox, radio, button, submit-button
      label: "Email Address",           // From <label for="...">, parent <label>, aria-label, or placeholder
      currentValue: "",                 // Current field value (or checked state for checkbox/radio)
      selector: "#email",               // CSS selector for browser_clickElement/fillElement
      placeholder: "your@email.com",
      name: "email",
      id: "email",
      required: true,
      disabled: false,
      checked: null,                    // For checkboxes/radios only
      coordinates: {
        absolute: {                     // Pixels from viewport top-left
          x: 120, y: 250,
          width: 200, height: 40,
          centerX: 220, centerY: 270
        },
        normalized: {                   // 0-1 range (perfect for native click tool)
          x: 0.15, y: 0.25,
          width: 0.25, height: 0.04,
          centerX: 0.275, centerY: 0.27
        }
      }
    }
  ],
  radioGroups: {
    "gender": [
      { label: "Male", value: "M", selector: "#male", checked: false },
      { label: "Female", value: "F", selector: "#female", checked: true }
    ],
    "subscription_type": [...]
  },
  summary: {
    total: 15,                          // Total interactive elements
    inputs: 8,                          // Text-like inputs
    dropdowns: 2,
    checkboxes: 1,
    radioButtons: 4,
    radioGroups: 2,                     // Number of radio groups
    buttons: 3,
    links: 5
  }
}

**14 specific element types detected:**
1. email-input, password-input, text-input, number-input, tel-input, url-input, date-input
2. file-input (for file uploads)
3. dropdown (select elements)
4. textarea
5. checkbox, radio
6. button, submit-button

**When to use:**
⚠️ **Prefer browser_inspectCurrentPage** - it gives you this PLUS page info
✅ When you need to refresh element data after page change (without getting page info again)
✅ When you specifically want element coordinates for fallback to native clicking
✅ When you need to see radio button groups

**Typical workflow:**
1. browser_inspectCurrentPage() first (gets this data + page info)
2. Fill form using browser_fillFormField
3. If page updates dynamically, call browser_getUIElements to refresh element data

**How to use the data:**
• **For label-based filling:** browser_fillFormField("Email", "user@example.com")
• **For selector-based filling:** browser_fillElement(element.selector, value)
• **For native clicking:** click(element.coordinates.normalized.centerX, element.coordinates.normalized.centerY)
• **For radio groups:** Pick from radioGroups["group_name"], then click the selector

**Pro tips:**
• radioGroups makes it easy to see all options in a radio group
• currentValue shows pre-filled values - check before filling
• normalized coordinates (0-1) work with native click tool if browser automation fails
• summary.total tells you if form is large (many fields) or simple`,
                    inputSchema: {
                        type: 'object',
                        properties: {
                            tabId: {
                                type: 'number',
                                description: 'Optional tab ID (defaults to active tab)',
                            },
                            browser: {
                                type: 'string',
                                enum: ['firefox', 'chrome', 'safari', 'edge'],
                                description: 'Target browser (optional, uses default if not specified)',
                            },
                        },
                    },
                },
                {
                    name: 'browser_fillFormField',
                    description: `🌐 MCP-EYES BROWSER: **The easiest way to fill forms.** Finds field by label → clicks → fills in ONE atomic operation.

**What it does automatically:**
1. Searches ALL form fields (input, select, textarea) for a matching label
2. Focuses the field (scrolls into view if needed)
3. Clicks the field (handles custom controls)
4. Fills the value based on field type:
   - Text inputs: Sets value + dispatches input/change events
   - Dropdowns: Selects matching option
   - Checkboxes/radios: Sets checked state
5. Returns success confirmation with actual element used

**Label matching (smart fuzzy matching):**
Priority order:
1. **Exact match (100%)**: Label exactly matches (case-insensitive)
2. **Contains match (50%)**: Label contains your search term or vice versa
3. **Placeholder match (30%)**: Placeholder text contains search term
4. **Name/ID match (20%)**: name or id attribute contains search term

**Examples:**
✅ browser_fillFormField("Email", "user@example.com")
   → Matches: "Email Address", "Email:", "Enter your email", placeholder "Email"

✅ browser_fillFormField("First Name", "John")
   → Matches: "First Name", "First name:", "Your first name", placeholder "First Name"

✅ browser_fillFormField("Phone", "555-1234")
   → Matches: "Phone Number", "Phone:", "Telephone", placeholder "Phone"

✅ browser_fillFormField("Country", "United States")
   → Finds dropdown, selects "United States" option

✅ browser_fillFormField("Accept Terms", "true")
   → Finds checkbox, checks it

**Complete job application workflow:**
// 1. See what fields exist
const page = await browser_inspectCurrentPage();

// 2. Fill all fields by label (NO selectors needed!)
await browser_fillFormField("Email", "john@example.com");
await browser_fillFormField("First Name", "John");
await browser_fillFormField("Last Name", "Doe");
await browser_fillFormField("Phone", "555-1234");
await browser_fillFormField("Country", "United States");
await browser_fillFormField("Years of Experience", "5");
await browser_fillFormField("Resume", "/path/to/resume.pdf");  // For file inputs
await browser_fillFormField("Accept Terms", "true");

// 3. Find submit button (type: "submit-button" in page.elements)
await browser_clickElement(submitButtonSelector);

**What you get back on success:**
{
  success: true,
  label: "Email",                        // Your search term
  elementLabel: "Email Address",         // Actual label found
  selector: "#email",                    // Element's selector
  value: "user@example.com"              // Value filled (or checked: true for checkbox)
}

**What you get if field not found:**
{
  success: false,
  error: "No form field found matching label: 'Emial'",
  availableFields: [                     // First 20 fields to help you fix typo
    { label: "Email Address", type: "email", name: "email", id: "email" },
    { label: "First Name", type: "text", name: "firstName", id: "firstName" },
    { label: "Last Name", type: "text", name: "lastName", id: "lastName" }
  ]
}

**When to use:**
✅ **ALWAYS use this for form filling** - it's simpler than find → click → fill
✅ When you know field labels from browser_inspectCurrentPage
✅ For quick job applications, registration forms, login forms
✅ When labels are in English and descriptive

**When NOT to use:**
❌ When field has no label (use browser_fillElement with selector instead)
❌ When you need very precise selector control
❌ For complex custom controls that don't behave like standard inputs

**Handles all field types:**
• Text inputs → Sets value
• Email/password/tel/number/url/date inputs → Sets value
• Textareas → Sets value
• Dropdowns → Selects option by value or text
• Checkboxes → Checks if value is true/yes/1, unchecks otherwise
• Radios → Checks if value is true/yes/1
• File inputs → Sets file path (may not work in all browsers due to security)

**Pro tips:**
• Use partial labels: "Email" matches "Email Address", "Your Email", etc.
• Check availableFields in error response to see what labels are actually on the page
• For dropdowns, you can use either the option value or the visible text
• For checkboxes/radios, use "true", "yes", "1" to check, anything else to uncheck

**FALLBACK if this fails:**
1. Look at availableFields in error response
2. Try the exact label text from there
3. If still failing, use browser_clickElement(selector) + browser_fillElement(selector, value)
4. If browser automation blocked, use native click + typeText`,
                    inputSchema: {
                        type: 'object',
                        properties: {
                            label: {
                                type: 'string',
                                description: 'Label text of the form field (e.g., "Email", "Password", "First Name")',
                            },
                            value: {
                                type: 'string',
                                description: 'Value to fill in the field',
                            },
                            tabId: {
                                type: 'number',
                                description: 'Optional tab ID (defaults to active tab)',
                            },
                            browser: {
                                type: 'string',
                                enum: ['firefox', 'chrome', 'safari', 'edge'],
                                description: 'Target browser (optional, uses default if not specified)',
                            },
                        },
                        required: ['label', 'value'],
                    },
                },
                // ========== BROWSER AUTOMATION TOOLS (Playwright-style) ==========
                {
                    name: 'browser_navigate',
                    description: `🌐 MCP-EYES BROWSER: Navigate to a URL in the browser.

Opens the specified URL in the active tab or a specified tab. Optionally waits for page load conditions.

**Examples:**
browser_navigate({ url: "https://example.com" })
browser_navigate({ url: "https://google.com", waitUntil: "networkidle" })

**Parameters:**
• url (required): URL to navigate to
• tabId: Optional tab ID (defaults to active tab)
• browser: Target browser (firefox, chrome, safari, edge)
• waitUntil: Wait condition - "load", "domcontentloaded", or "networkidle"
• timeout: Navigation timeout in milliseconds`,
                    inputSchema: {
                        type: 'object',
                        properties: {
                            url: { type: 'string', description: 'URL to navigate to' },
                            tabId: { type: 'number', description: 'Optional tab ID (defaults to active tab)' },
                            browser: { type: 'string', enum: ['firefox', 'chrome', 'safari', 'edge'], description: 'Target browser (optional)' },
                            waitUntil: { type: 'string', enum: ['load', 'domcontentloaded', 'networkidle'], description: 'Wait condition (optional)' },
                            timeout: { type: 'number', description: 'Navigation timeout in milliseconds (optional)' },
                        },
                        required: ['url'],
                    },
                },
                {
                    name: 'browser_screenshot',
                    description: `🌐 MCP-EYES BROWSER: Take a screenshot of the current page or a specific element.

Returns a screenshot as a base64-encoded PNG image.

**Examples:**
browser_screenshot() - Full viewport screenshot
browser_screenshot({ fullPage: true }) - Full scrollable page
browser_screenshot({ selector: "#main-content" }) - Specific element

**Parameters:**
• selector: CSS selector to screenshot specific element (optional)
• fullPage: Capture full scrollable page (default: false)
• tabId: Optional tab ID
• browser: Target browser`,
                    inputSchema: {
                        type: 'object',
                        properties: {
                            selector: { type: 'string', description: 'CSS selector for element to screenshot (optional)' },
                            fullPage: { type: 'boolean', description: 'Capture full scrollable page (default: false)' },
                            tabId: { type: 'number', description: 'Optional tab ID (defaults to active tab)' },
                            browser: { type: 'string', enum: ['firefox', 'chrome', 'safari', 'edge'], description: 'Target browser (optional)' },
                        },
                    },
                },
                {
                    name: 'browser_go_back',
                    description: `🌐 MCP-EYES BROWSER: Navigate back in browser history.

Equivalent to clicking the browser's back button.

**Example:**
browser_go_back()`,
                    inputSchema: {
                        type: 'object',
                        properties: {
                            tabId: { type: 'number', description: 'Optional tab ID (defaults to active tab)' },
                            browser: { type: 'string', enum: ['firefox', 'chrome', 'safari', 'edge'], description: 'Target browser (optional)' },
                        },
                    },
                },
                {
                    name: 'browser_go_forward',
                    description: `🌐 MCP-EYES BROWSER: Navigate forward in browser history.

Equivalent to clicking the browser's forward button.

**Example:**
browser_go_forward()`,
                    inputSchema: {
                        type: 'object',
                        properties: {
                            tabId: { type: 'number', description: 'Optional tab ID (defaults to active tab)' },
                            browser: { type: 'string', enum: ['firefox', 'chrome', 'safari', 'edge'], description: 'Target browser (optional)' },
                        },
                    },
                },
                {
                    name: 'browser_get_visible_html',
                    description: `🌐 MCP-EYES BROWSER: Get the HTML content of the current page.

Returns the page HTML, optionally cleaned and truncated.

**Examples:**
browser_get_visible_html() - Full page HTML (scripts removed)
browser_get_visible_html({ selector: "#content" }) - Specific container
browser_get_visible_html({ cleanHtml: true, maxLength: 10000 }) - Cleaned and limited

**Parameters:**
• selector: CSS selector to limit HTML to specific container
• removeScripts: Remove script tags (default: true)
• removeStyles: Remove style tags (default: false)
• cleanHtml: Comprehensive HTML cleaning (default: false)
• maxLength: Max characters to return (default: 50000)`,
                    inputSchema: {
                        type: 'object',
                        properties: {
                            selector: { type: 'string', description: 'CSS selector to limit HTML to a specific container (optional)' },
                            removeScripts: { type: 'boolean', description: 'Remove all script tags (default: true)' },
                            removeStyles: { type: 'boolean', description: 'Remove all style tags (default: false)' },
                            cleanHtml: { type: 'boolean', description: 'Perform comprehensive HTML cleaning (default: false)' },
                            maxLength: { type: 'number', description: 'Maximum characters to return (default: 50000)' },
                            tabId: { type: 'number', description: 'Optional tab ID (defaults to active tab)' },
                            browser: { type: 'string', enum: ['firefox', 'chrome', 'safari', 'edge'], description: 'Target browser (optional)' },
                        },
                    },
                },
                {
                    name: 'browser_hover',
                    description: `🌐 MCP-EYES BROWSER: Hover over an element on the page.

Useful for triggering hover states, tooltips, dropdown menus.

**Example:**
browser_hover({ selector: ".dropdown-trigger" })`,
                    inputSchema: {
                        type: 'object',
                        properties: {
                            selector: { type: 'string', description: 'CSS selector for element to hover' },
                            tabId: { type: 'number', description: 'Optional tab ID (defaults to active tab)' },
                            browser: { type: 'string', enum: ['firefox', 'chrome', 'safari', 'edge'], description: 'Target browser (optional)' },
                        },
                        required: ['selector'],
                    },
                },
                {
                    name: 'browser_drag',
                    description: `🌐 MCP-EYES BROWSER: Drag an element to a target location.

Performs drag-and-drop operation from source to target element.

**Example:**
browser_drag({ sourceSelector: ".draggable", targetSelector: ".drop-zone" })`,
                    inputSchema: {
                        type: 'object',
                        properties: {
                            sourceSelector: { type: 'string', description: 'CSS selector for element to drag' },
                            targetSelector: { type: 'string', description: 'CSS selector for target location' },
                            tabId: { type: 'number', description: 'Optional tab ID (defaults to active tab)' },
                            browser: { type: 'string', enum: ['firefox', 'chrome', 'safari', 'edge'], description: 'Target browser (optional)' },
                        },
                        required: ['sourceSelector', 'targetSelector'],
                    },
                },
                {
                    name: 'browser_press_key',
                    description: `🌐 MCP-EYES BROWSER: Press a keyboard key in the browser.

Supports single keys, modifiers, and combinations.

**Examples:**
browser_press_key({ key: "Enter" })
browser_press_key({ key: "Tab" })
browser_press_key({ key: "Ctrl+a" }) - Select all
browser_press_key({ key: "ArrowDown", selector: "#dropdown" }) - Key on specific element`,
                    inputSchema: {
                        type: 'object',
                        properties: {
                            key: { type: 'string', description: 'Key to press (e.g., "Enter", "Tab", "ArrowDown", "Ctrl+c")' },
                            selector: { type: 'string', description: 'Optional CSS selector to focus before pressing key' },
                            tabId: { type: 'number', description: 'Optional tab ID (defaults to active tab)' },
                            browser: { type: 'string', enum: ['firefox', 'chrome', 'safari', 'edge'], description: 'Target browser (optional)' },
                        },
                        required: ['key'],
                    },
                },
                {
                    name: 'browser_upload_file',
                    description: `🌐 MCP-EYES BROWSER: Upload a file to a file input element.

Sets the file path on an input[type="file"] element.

**Example:**
browser_upload_file({ selector: "input[type='file']", filePath: "/path/to/document.pdf" })

**Note:** Due to browser security, this may require the browser extension to support file uploads.
If browser automation fails, use native macOS file picker interaction instead.`,
                    inputSchema: {
                        type: 'object',
                        properties: {
                            selector: { type: 'string', description: 'CSS selector for the file input element' },
                            filePath: { type: 'string', description: 'Absolute path to the file to upload' },
                            tabId: { type: 'number', description: 'Optional tab ID (defaults to active tab)' },
                            browser: { type: 'string', enum: ['firefox', 'chrome', 'safari', 'edge'], description: 'Target browser (optional)' },
                        },
                        required: ['selector', 'filePath'],
                    },
                },
                {
                    name: 'browser_save_as_pdf',
                    description: `🌐 MCP-EYES BROWSER: Save the current page as a PDF file.

Exports the current page to a PDF file.

**Example:**
browser_save_as_pdf({ outputPath: "/Users/me/Downloads" })
browser_save_as_pdf({ outputPath: "/tmp", filename: "report.pdf", format: "A4" })

**Parameters:**
• outputPath (required): Directory where PDF will be saved
• filename: PDF filename (default: page.pdf)
• format: Page format - A4, Letter, Legal, Tabloid (default: A4)
• printBackground: Include background graphics (default: true)`,
                    inputSchema: {
                        type: 'object',
                        properties: {
                            outputPath: { type: 'string', description: 'Directory path where PDF will be saved' },
                            filename: { type: 'string', description: 'Name of the PDF file (default: page.pdf)' },
                            format: { type: 'string', enum: ['A4', 'Letter', 'Legal', 'Tabloid'], description: 'Page format (default: A4)' },
                            printBackground: { type: 'boolean', description: 'Whether to print background graphics (default: true)' },
                            tabId: { type: 'number', description: 'Optional tab ID (defaults to active tab)' },
                            browser: { type: 'string', enum: ['firefox', 'chrome', 'safari', 'edge'], description: 'Target browser (optional)' },
                        },
                        required: ['outputPath'],
                    },
                },
            ];
            // Get all tool categories from registry
            const filesystemTools = this.toolRegistry.getEnabledTools()
                .filter(tool => tool.category === 'filesystem')
                .map(tool => ({
                name: tool.name,
                description: tool.description,
                inputSchema: tool.inputSchema,
            }));
            const shellTools = this.toolRegistry.getEnabledTools()
                .filter(tool => tool.category === 'shell')
                .map(tool => ({
                name: tool.name,
                description: tool.description,
                inputSchema: tool.inputSchema,
            }));
            const guiTools = this.toolRegistry.getEnabledTools()
                .filter(tool => tool.category === 'gui')
                .map(tool => ({
                name: tool.name,
                description: tool.description,
                inputSchema: tool.inputSchema,
            }));
            const browserToolsFromRegistry = this.toolRegistry.getEnabledTools()
                .filter(tool => tool.category === 'browser')
                .map(tool => ({
                name: tool.name,
                description: tool.description,
                inputSchema: tool.inputSchema,
            }));
            // Return enabled tools from registry (browser tools only shown if extensions connected)
            const allTools = [
                ...guiTools,
                ...filesystemTools,
                ...shellTools,
                ...(hasBrowserExtensions ? browserToolsFromRegistry : []),
            ];
            return {
                tools: allTools,
            };
        });
        this.server.setRequestHandler(types_js_1.CallToolRequestSchema, async (request) => {
            const { name, arguments: args } = request.params;
            // Check if tool is enabled in registry
            if (!this.toolRegistry.isToolEnabled(name)) {
                return {
                    content: [{ type: 'text', text: `Tool ${name} is disabled` }],
                    isError: true,
                };
            }
            try {
                let result;
                switch (name) {
                    case 'listApplications':
                        result = await this.proxyCall('/listApplications');
                        // Handle both formats: {applications: [...]} or [...]
                        const apps = result.applications || result;
                        // Process each app and enhance with window information
                        const normalizedApps = await Promise.all(apps.map(async (app, index) => {
                            const bounds = app.bounds || {};
                            let windows = Array.isArray(app.windows) ? app.windows : [];
                            // If no windows detected, try AppleScript fallback
                            const bundleId = app.bundleId || app.bundle_id;
                            if (windows.length === 0 && bundleId && app.name) {
                                const fallbackWindows = await this.getWindowsViaAppleScript(bundleId, app.name);
                                if (fallbackWindows.length > 0) {
                                    windows = fallbackWindows.map((win, winIndex) => ({
                                        title: win.title,
                                        bounds: win.bounds,
                                        is_minimized: win.isMinimized,
                                        is_main: winIndex === 0,
                                    }));
                                }
                            }
                            const normalizedWindows = windows.map((win, winIndex) => ({
                                index: winIndex,
                                title: win.title || `Window ${winIndex + 1}`,
                                bounds: win.bounds || { x: 0, y: 0, width: 0, height: 0 },
                                isMain: win.is_main ?? win.isMain ?? false,
                                isMinimized: win.is_minimized ?? win.isMinimized ?? false,
                            }));
                            const windowTitles = normalizedWindows.map((w) => w.title);
                            const windowCount = normalizedWindows.length;
                            return {
                                index,
                                name: app.name,
                                bundleId: app.bundleId || app.bundle_id,
                                pid: app.pid,
                                bounds: {
                                    x: bounds.x ?? 0,
                                    y: bounds.y ?? 0,
                                    width: bounds.width ?? 0,
                                    height: bounds.height ?? 0,
                                },
                                windowCount,
                                windowTitles,
                                windows: normalizedWindows,
                            };
                        }));
                        // Calculate summary statistics
                        const totalApps = normalizedApps.length;
                        const appsWithWindows = normalizedApps.filter((app) => app.windowCount > 0).length;
                        const totalWindows = normalizedApps.reduce((sum, app) => sum + app.windowCount, 0);
                        return {
                            content: [
                                {
                                    type: 'text',
                                    text: `Found ${totalApps} applications (${appsWithWindows} with windows, ${totalWindows} total windows):\n\n` +
                                        normalizedApps.map((app) => {
                                            const windowCountText = app.windowCount > 0
                                                ? `${app.windowCount} window${app.windowCount !== 1 ? 's' : ''}: ${app.windowTitles.join(', ')}`
                                                : 'No windows detected';
                                            const windowLines = app.windowCount > 0
                                                ? app.windows.map((win) => `    • [${win.index}] "${win.title}"${win.isMain ? ' (main)' : ''}${win.isMinimized ? ' (minimized)' : ''}\n` +
                                                    `      Location: (${win.bounds.x}, ${win.bounds.y}) | Size: ${win.bounds.width}x${win.bounds.height}`).join('\n')
                                                : '    ⚠️  Note: If windows exist but aren\'t listed, use getUIElements after focusing this app to see all windows and their titles';
                                            return `• ${app.name} (${app.bundleId || 'unknown bundle'})\n  PID: ${app.pid}\n  App Bounds: ${app.bounds.width}x${app.bounds.height} at (${app.bounds.x}, ${app.bounds.y})\n  Windows: ${windowCountText}\n${windowLines}`;
                                        }).join('\n\n'),
                                },
                            ],
                        };
                    case 'focusApplication':
                        result = await this.proxyCall('/focusApplication', 'POST', { identifier: args?.identifier });
                        return {
                            content: [{
                                    type: 'text',
                                    text: result ? `Focused on ${args?.identifier}` : `Failed to focus ${args?.identifier}`,
                                }],
                        };
                    case 'launchApplication':
                        result = await this.proxyCall('/launchApplication', 'POST', { identifier: args?.identifier });
                        if (result.error) {
                            return {
                                content: [{ type: 'text', text: `Failed to launch ${args?.identifier}: ${result.error}` }],
                                isError: true,
                            };
                        }
                        return {
                            content: [{
                                    type: 'text',
                                    text: result.alreadyRunning
                                        ? `${result.name} was already running - focused it`
                                        : `Launched ${result.name}${result.bundleId ? ` (${result.bundleId})` : ''}${result.pid ? `, PID: ${result.pid}` : ''}`,
                                }],
                        };
                    case 'screenshot':
                        result = await this.proxyCall('/screenshot', 'POST', { padding: args?.padding });
                        return {
                            content: [{
                                    type: 'image',
                                    data: result.image,
                                    mimeType: 'image/png',
                                }],
                        };
                    case 'screenshot_app':
                        result = await this.proxyCall('/screenshot_app', 'POST', { identifier: args?.identifier });
                        if (result.error) {
                            return {
                                content: [{ type: 'text', text: `Error: ${result.error}` }],
                                isError: true,
                            };
                        }
                        return {
                            content: [{
                                    type: 'image',
                                    data: result.image,
                                    mimeType: 'image/png',
                                }],
                        };
                    case 'click':
                        result = await this.proxyCall('/click', 'POST', {
                            x: args?.x,
                            y: args?.y,
                            button: args?.button,
                        });
                        return {
                            content: [{
                                    type: 'text',
                                    text: `Clicked at (${args?.x}, ${args?.y})`,
                                }],
                        };
                    case 'click_absolute':
                        result = await this.proxyCall('/click_absolute', 'POST', {
                            x: args?.x,
                            y: args?.y,
                            button: args?.button,
                        });
                        return {
                            content: [{
                                    type: 'text',
                                    text: `Clicked absolute position (${args?.x}, ${args?.y})`,
                                }],
                        };
                    case 'moveMouse':
                        result = await this.proxyCall('/moveMouse', 'POST', {
                            x: args?.x,
                            y: args?.y,
                        });
                        return {
                            content: [{
                                    type: 'text',
                                    text: `Moved mouse to (${args?.x}, ${args?.y})`,
                                }],
                        };
                    case 'scroll':
                        result = await this.proxyCall('/scroll', 'POST', {
                            deltaX: args?.deltaX,
                            deltaY: args?.deltaY,
                            x: args?.x,
                            y: args?.y,
                        });
                        return {
                            content: [{
                                    type: 'text',
                                    text: `Scrolled (deltaX: ${args?.deltaX || 0}, deltaY: ${args?.deltaY || 0})`,
                                }],
                        };
                    case 'drag':
                        result = await this.proxyCall('/drag', 'POST', {
                            startX: args?.startX,
                            startY: args?.startY,
                            endX: args?.endX,
                            endY: args?.endY,
                        });
                        return {
                            content: [{
                                    type: 'text',
                                    text: `Dragged from (${args?.startX}, ${args?.startY}) to (${args?.endX}, ${args?.endY})`,
                                }],
                        };
                    case 'getClickableElements':
                        result = await this.proxyCall('/getClickableElements');
                        // Handle both formats: {elements: [...]} or [...] or error
                        const elements = result.elements || result;
                        if (!Array.isArray(elements)) {
                            return {
                                content: [{
                                        type: 'text',
                                        text: `Error getting clickable elements: ${result.error || 'Unexpected response format'}\nRaw result: ${JSON.stringify(result).substring(0, 500)}`,
                                    }],
                                isError: true,
                            };
                        }
                        const normalizedElements = elements.map((el, i) => {
                            const normalizedPosition = el.normalizedPosition || el.normalized_position || null;
                            const screenPosition = el.screenPosition || el.screen_position || (el.bounds ? { x: el.bounds.x, y: el.bounds.y } : null);
                            return {
                                index: el.index ?? i,
                                type: el.type || el.role,
                                text: el.text || el.label || '',
                                role: el.role,
                                bounds: el.bounds || null,
                                normalizedPosition: normalizedPosition
                                    ? {
                                        x: typeof normalizedPosition.x === 'number' ? normalizedPosition.x : parseFloat(normalizedPosition.x),
                                        y: typeof normalizedPosition.y === 'number' ? normalizedPosition.y : parseFloat(normalizedPosition.y),
                                    }
                                    : null,
                                screenPosition,
                                isClickable: el.is_clickable ?? el.isClickable ?? true,
                                isEnabled: el.is_enabled ?? el.isEnabled ?? true,
                            };
                        });
                        return {
                            content: [
                                {
                                    type: 'text',
                                    text: `Found ${normalizedElements.length} clickable elements:\n\n` +
                                        normalizedElements.map((el) => {
                                            const coords = el.normalizedPosition
                                                ? `(${el.normalizedPosition.x.toFixed(3)}, ${el.normalizedPosition.y.toFixed(3)})`
                                                : '(no normalized position)';
                                            return `${el.index}. [${el.type}] ${el.text || '(no text)'} at ${coords}`;
                                        }).join('\n'),
                                },
                            ],
                        };
                    case 'getUIElements':
                        result = await this.proxyCall('/getUIElements');
                        if (result.error) {
                            return {
                                content: [{
                                        type: 'text',
                                        text: `Error getting UI elements: ${result.error}`,
                                    }],
                                isError: true,
                            };
                        }
                        const clickableElements = result.clickable || [];
                        const nonClickableElements = result.nonClickable || [];
                        const allUIElements = [...clickableElements, ...nonClickableElements];
                        const richElements = allUIElements.map((el, i) => ({
                            index: el.index ?? i,
                            type: el.type,
                            role: el.role,
                            text: el.title || el.description || el.text || '',
                            value: el.value || '',
                            bounds: el.bounds,
                            normalizedPosition: el.normalized_position || el.normalizedPosition || null,
                            isClickable: clickableElements.includes(el),
                            isEnabled: el.is_enabled ?? el.isEnabled ?? true,
                        }));
                        return {
                            content: [
                                {
                                    type: 'text',
                                    text: `Found ${richElements.length} accessibility elements (${clickableElements.length} clickable, ${nonClickableElements.length} non-clickable):\n\n` +
                                        richElements.map((el) => {
                                            const coordText = el.normalizedPosition
                                                ? `(${Number(el.normalizedPosition.x).toFixed(3)}, ${Number(el.normalizedPosition.y).toFixed(3)})`
                                                : '(no normalized position)';
                                            return `${el.index}. [${el.role || el.type}] ${el.text || '(no text)'} at ${coordText}${el.isClickable ? ' [clickable]' : ''}`;
                                        }).join('\n'),
                                },
                            ],
                        };
                    case 'currentApp':
                        result = await this.proxyCall('/currentApp');
                        if (result.bundleId === null) {
                            return {
                                content: [{
                                        type: 'text',
                                        text: 'No application is currently focused. Call focusApplication first.',
                                    }],
                            };
                        }
                        return {
                            content: [{
                                    type: 'text',
                                    text: `Current app:\n  Bundle ID: ${result.bundleId}\n  Bounds: ${JSON.stringify(result.bounds)}`,
                                }],
                        };
                    case 'typeText':
                        result = await this.proxyCall('/typeText', 'POST', { text: args?.text });
                        return {
                            content: [{
                                    type: 'text',
                                    text: `Typed: ${args?.text}`,
                                }],
                        };
                    case 'pressKey':
                        result = await this.proxyCall('/pressKey', 'POST', { key: args?.key });
                        return {
                            content: [{
                                    type: 'text',
                                    text: `Pressed key: ${args?.key}`,
                                }],
                        };
                    case 'doubleClick':
                        result = await this.proxyCall('/doubleClick', 'POST', {
                            x: args?.x,
                            y: args?.y,
                        });
                        return {
                            content: [{
                                    type: 'text',
                                    text: `Double-clicked at (${args?.x}, ${args?.y})`,
                                }],
                        };
                    case 'clickElement':
                        result = await this.proxyCall('/clickElement', 'POST', {
                            elementIndex: args?.elementIndex,
                        });
                        return {
                            content: [{
                                    type: 'text',
                                    text: result.message || `Clicked element at index ${args?.elementIndex}`,
                                }],
                        };
                    case 'scrollMouse':
                        result = await this.proxyCall('/scrollMouse', 'POST', {
                            direction: args?.direction,
                            amount: args?.amount || 3,
                        });
                        return {
                            content: [{
                                    type: 'text',
                                    text: `Scrolled ${args?.direction} by ${args?.amount || 3} units`,
                                }],
                        };
                    case 'getMousePosition':
                        result = await this.proxyCall('/getMousePosition');
                        return {
                            content: [{
                                    type: 'text',
                                    text: `Mouse position: (${result.x}, ${result.y})`,
                                }],
                        };
                    case 'wait':
                        const waitMs = args?.milliseconds || 1000;
                        await new Promise(resolve => setTimeout(resolve, waitMs));
                        return {
                            content: [{
                                    type: 'text',
                                    text: `Waited for ${waitMs} milliseconds`,
                                }],
                        };
                    case 'closeApp':
                        result = await this.proxyCall('/closeApp', 'POST', {
                            identifier: args?.identifier,
                            force: args?.force || false,
                        });
                        return {
                            content: [{
                                    type: 'text',
                                    text: result.message || `Closed application: ${args?.identifier}`,
                                }],
                        };
                    case 'analyzeWithOCR':
                        result = await this.proxyCall('/analyzeWithOCR');
                        if (result.error) {
                            return {
                                content: [{ type: 'text', text: `OCR error: ${result.error}` }],
                                isError: true,
                            };
                        }
                        const ocrWidth = result.width;
                        const ocrHeight = result.height;
                        const ocrResults = Array.isArray(result.results) ? result.results : result;
                        const summary = Array.isArray(ocrResults)
                            ? `Detected ${ocrResults.length} text regions using OCR:\n\n` +
                                ocrResults.map((entry, idx) => {
                                    const bounds = entry.bounds || {};
                                    return `${idx}. "${entry.text}" (confidence ${(entry.confidence ?? 0).toFixed?.(2) ?? entry.confidence}) at (${bounds.x}, ${bounds.y}) size ${bounds.width}x${bounds.height}`;
                                }).join('\n')
                            : 'OCR returned unexpected result.';
                        return {
                            content: [
                                {
                                    type: 'text',
                                    text: summary,
                                },
                                {
                                    type: 'json',
                                    data: {
                                        width: ocrWidth,
                                        height: ocrHeight,
                                        results: ocrResults,
                                    },
                                },
                            ],
                        };
                    case 'checkPermissions':
                        result = await this.proxyCall('/permissions');
                        return {
                            content: [{
                                    type: 'text',
                                    text: result.hasPermission
                                        ? '✅ Accessibility permissions are granted'
                                        : `❌ Accessibility permissions missing: ${result.error}`,
                                }],
                        };
                    // ========== Browser Extension Tools ==========
                    case 'browser_listConnected':
                        result = await this.browserProxyCall('/browsers');
                        return {
                            content: [{
                                    type: 'text',
                                    text: `Connected Browsers:\n\n` +
                                        (result.browsers?.length > 0
                                            ? result.browsers.map((b) => `• ${b.name} (${b.type})${b.type === result.defaultBrowser ? ' [DEFAULT]' : ''}`).join('\n')
                                            : 'No browsers connected') +
                                        `\n\nDefault browser: ${result.defaultBrowser || 'none'}`,
                                }],
                        };
                    case 'browser_setDefaultBrowser':
                        result = await this.browserProxyCall('/browser/setDefault', 'POST', { browser: args?.browser });
                        if (result.error) {
                            return {
                                content: [{ type: 'text', text: `Error: ${result.error}` }],
                                isError: true,
                            };
                        }
                        return {
                            content: [{
                                    type: 'text',
                                    text: `Default browser set to: ${result.defaultBrowser}`,
                                }],
                        };
                    case 'browser_getTabs':
                        result = await this.browserProxyCall('/browser/getTabs', 'POST', { browser: args?.browser });
                        if (result.error) {
                            return {
                                content: [{ type: 'text', text: `Error: ${result.error}` }],
                                isError: true,
                            };
                        }
                        return {
                            content: [{
                                    type: 'text',
                                    text: `Found ${result.length} browser tabs:\n\n` +
                                        result.map((tab) => `• [${tab.id}] ${tab.title || '(no title)'}\n  URL: ${tab.url}\n  Active: ${tab.active ? 'Yes' : 'No'}`).join('\n\n'),
                                }],
                        };
                    case 'browser_getActiveTab':
                        result = await this.browserProxyCall('/browser/getActiveTab', 'POST', { browser: args?.browser });
                        if (result.error) {
                            return {
                                content: [{ type: 'text', text: `Error: ${result.error}` }],
                                isError: true,
                            };
                        }
                        return {
                            content: [{
                                    type: 'text',
                                    text: `Active tab:\n  ID: ${result.id}\n  Title: ${result.title}\n  URL: ${result.url}`,
                                }],
                        };
                    case 'browser_focusTab':
                        result = await this.browserProxyCall('/browser/focusTab', 'POST', { tabId: args?.tabId, browser: args?.browser });
                        return {
                            content: [{
                                    type: 'text',
                                    text: result.success ? `Focused tab ${args?.tabId}` : `Failed to focus tab: ${result.error}`,
                                }],
                        };
                    case 'browser_createTab':
                        result = await this.browserProxyCall('/browser/createTab', 'POST', { url: args?.url, browser: args?.browser });
                        if (result.error) {
                            return {
                                content: [{ type: 'text', text: `Error: ${result.error}` }],
                                isError: true,
                            };
                        }
                        return {
                            content: [{
                                    type: 'text',
                                    text: result.success
                                        ? `Created new tab: ${result.url}\n  Tab ID: ${result.tabId}\n  Title: ${result.title || 'Loading...'}`
                                        : `Failed to create tab: ${result.error || 'Unknown error'}`,
                                }],
                        };
                    case 'browser_closeTab':
                        result = await this.browserProxyCall('/browser/closeTab', 'POST', { tabId: args?.tabId, browser: args?.browser });
                        if (result.error) {
                            return {
                                content: [{ type: 'text', text: `Error: ${result.error}` }],
                                isError: true,
                            };
                        }
                        return {
                            content: [{
                                    type: 'text',
                                    text: result.success
                                        ? `Closed tab ${args?.tabId}`
                                        : `Failed to close tab: ${result.error || 'Unknown error'}`,
                                }],
                        };
                    case 'browser_getPageInfo':
                        result = await this.browserProxyCall('/browser/getPageInfo', 'POST', { tabId: args?.tabId, browser: args?.browser });
                        if (result.error) {
                            return {
                                content: [{ type: 'text', text: `Error: ${result.error}` }],
                                isError: true,
                            };
                        }
                        return {
                            content: [{
                                    type: 'text',
                                    text: `Page Info:\n  URL: ${result.url}\n  Title: ${result.title}\n  Domain: ${result.domain || 'N/A'}`,
                                }],
                        };
                    case 'browser_getInteractiveElements':
                        result = await this.browserProxyCall('/browser/getInteractiveElements', 'POST', { tabId: args?.tabId, browser: args?.browser });
                        if (result.error) {
                            return {
                                content: [{ type: 'text', text: `Error: ${result.error}` }],
                                isError: true,
                            };
                        }
                        const interactiveElements = result.elements || result;
                        return {
                            content: [{
                                    type: 'text',
                                    text: `Found ${interactiveElements.length} interactive elements:\n\n` +
                                        interactiveElements.slice(0, 50).map((el, i) => `${i}. [${el.tagName || el.type}] ${el.text || el.placeholder || el.name || el.id || '(no text)'}\n   Selector: ${el.selector || 'N/A'}`).join('\n\n') +
                                        (interactiveElements.length > 50 ? `\n\n... and ${interactiveElements.length - 50} more elements` : ''),
                                }],
                        };
                    case 'browser_getPageContext':
                        result = await this.browserProxyCall('/browser/getPageContext', 'POST', { tabId: args?.tabId, browser: args?.browser });
                        if (result.error) {
                            return {
                                content: [{ type: 'text', text: `Error: ${result.error}` }],
                                isError: true,
                            };
                        }
                        return {
                            content: [{
                                    type: 'text',
                                    text: `Page Context:\n\nPage Info:\n  URL: ${result.pageInfo?.url}\n  Title: ${result.pageInfo?.title}\n\nInteractive Elements (${result.elements?.length || 0}):\n` +
                                        (result.elements || []).slice(0, 30).map((el, i) => `  ${i}. [${el.tagName || el.type}] ${el.text || el.placeholder || '(no text)'}`).join('\n'),
                                }],
                        };
                    case 'browser_clickElement':
                        result = await this.browserProxyCall('/browser/clickElement', 'POST', {
                            selector: args?.selector,
                            tabId: args?.tabId,
                            browser: args?.browser,
                        });
                        return {
                            content: [{
                                    type: 'text',
                                    text: result.success ? `Clicked element: ${args?.selector}` : `Failed to click: ${result.error}`,
                                }],
                        };
                    case 'browser_fillElement':
                        result = await this.browserProxyCall('/browser/fillElement', 'POST', {
                            selector: args?.selector,
                            value: args?.value,
                            tabId: args?.tabId,
                            browser: args?.browser,
                        });
                        return {
                            content: [{
                                    type: 'text',
                                    text: result.success ? `Filled ${args?.selector} with value` : `Failed to fill: ${result.error}`,
                                }],
                        };
                    case 'browser_scrollTo':
                        result = await this.browserProxyCall('/browser/scrollTo', 'POST', {
                            selector: args?.selector,
                            x: args?.x,
                            y: args?.y,
                            tabId: args?.tabId,
                            browser: args?.browser,
                        });
                        return {
                            content: [{
                                    type: 'text',
                                    text: result.success ? `Scrolled to ${args?.selector || `(${args?.x}, ${args?.y})`}` : `Failed to scroll: ${result.error}`,
                                }],
                        };
                    case 'browser_executeScript':
                        result = await this.browserProxyCall('/browser/executeScript', 'POST', {
                            script: args?.script,
                            tabId: args?.tabId,
                            browser: args?.browser,
                        });
                        // Handle error case
                        if (result.error || (result.success === false)) {
                            return {
                                content: [{ type: 'text', text: `Script error: ${result.error || 'Unknown error'}` }],
                                isError: true,
                            };
                        }
                        // Handle success case - extract the actual result value
                        const scriptResult = result.result !== undefined ? result.result : result;
                        // Format the result in a clear way
                        let resultText;
                        if (scriptResult === null || scriptResult === undefined) {
                            resultText = 'Script executed successfully but returned no value (undefined/null).\nMake sure your script includes an explicit return statement.';
                        }
                        else if (typeof scriptResult === 'string') {
                            resultText = scriptResult;
                        }
                        else if (typeof scriptResult === 'object') {
                            resultText = JSON.stringify(scriptResult, null, 2);
                        }
                        else {
                            resultText = String(scriptResult);
                        }
                        return {
                            content: [{
                                    type: 'text',
                                    text: resultText,
                                }],
                        };
                    case 'browser_getFormData':
                        result = await this.browserProxyCall('/browser/getFormData', 'POST', { tabId: args?.tabId, browser: args?.browser });
                        if (result.error) {
                            return {
                                content: [{ type: 'text', text: `Error: ${result.error}` }],
                                isError: true,
                            };
                        }
                        return {
                            content: [{
                                    type: 'text',
                                    text: `Forms on page (${result.forms?.length || 0}):\n\n` +
                                        (result.forms || []).map((form, i) => `Form ${i}: ${form.id || form.name || '(unnamed)'}\n  Action: ${form.action || 'N/A'}\n  Method: ${form.method}\n  Fields: ${form.inputCount}`).join('\n\n'),
                                }],
                        };
                    case 'browser_setWatchMode':
                        result = await this.browserProxyCall('/browser/setWatchMode', 'POST', {
                            enabled: args?.enabled,
                            tabId: args?.tabId,
                            browser: args?.browser,
                        });
                        return {
                            content: [{
                                    type: 'text',
                                    text: `Watch mode ${args?.enabled ? 'enabled' : 'disabled'}`,
                                }],
                        };
                    // ========== NEW BROWSER TOOL HANDLERS ==========
                    case 'browser_getVisibleText': {
                        // Get ALL text from the page (request large maxLength)
                        result = await this.browserProxyCall('/browser/getVisibleText', 'POST', {
                            maxLength: 500000, // Get all text, we'll slice it locally
                            tabId: args?.tabId,
                            browser: args?.browser,
                        });
                        if (result.error) {
                            return {
                                content: [{ type: 'text', text: `Error: ${result.error}` }],
                                isError: true,
                            };
                        }
                        // Implement local pagination/slicing
                        const sliceSize = Number(args?.sliceSize) || 15000;
                        const sliceIndex = Number(args?.slice) || 0;
                        const fullText = result.text || '';
                        const totalLength = fullText.length;
                        const totalSlices = Math.ceil(totalLength / sliceSize) || 1;
                        const startIdx = sliceIndex * sliceSize;
                        const endIdx = Math.min(startIdx + sliceSize, totalLength);
                        const sliceText = fullText.slice(startIdx, endIdx);
                        const hasMore = endIdx < totalLength;
                        // Build pagination info
                        const paginationInfo = totalSlices > 1
                            ? `\n📄 Slice ${sliceIndex + 1} of ${totalSlices} (${totalLength.toLocaleString()} total chars)${hasMore ? ` | Get more: browser_getVisibleText({slice: ${sliceIndex + 1}})` : ' | End of content'}`
                            : '';
                        return {
                            content: [{
                                    type: 'text',
                                    text: `Page: ${result.title}\nURL: ${result.url}${paginationInfo}\n\n${sliceText}`,
                                }],
                        };
                    }
                    case 'browser_searchVisibleText': {
                        // Get ALL text from the page
                        result = await this.browserProxyCall('/browser/getVisibleText', 'POST', {
                            maxLength: 500000, // Get all text for searching
                            tabId: args?.tabId,
                            browser: args?.browser,
                        });
                        if (result.error) {
                            return {
                                content: [{ type: 'text', text: `Error: ${result.error}` }],
                                isError: true,
                            };
                        }
                        // Also get interactive elements to identify control types
                        let interactiveElements = [];
                        try {
                            const elementsResult = await this.browserProxyCall('/browser/getInteractiveElements', 'POST', {
                                tabId: args?.tabId,
                                browser: args?.browser,
                            });
                            interactiveElements = elementsResult.elements || elementsResult || [];
                        }
                        catch (e) {
                            // Continue without element info if this fails
                        }
                        const searchText = result.text || '';
                        const searchQuery = String(args?.query || '');
                        const contextChars = Number(args?.contextChars) || 100;
                        const maxMatches = Number(args?.maxMatches) || 10;
                        if (!searchQuery) {
                            return {
                                content: [{ type: 'text', text: 'Error: query parameter is required' }],
                                isError: true,
                            };
                        }
                        // Helper to find matching control for a search term
                        const findMatchingControl = (query) => {
                            const lowerQ = query.toLowerCase();
                            for (const el of interactiveElements) {
                                const elText = (el.text || el.label || el.placeholder || el.value || '').toLowerCase();
                                const elAriaLabel = (el.ariaLabel || el['aria-label'] || '').toLowerCase();
                                if (elText.includes(lowerQ) || elAriaLabel.includes(lowerQ)) {
                                    // Map element types to user-friendly names
                                    let controlType = el.type || el.tagName || 'element';
                                    const tagName = (el.tagName || '').toLowerCase();
                                    const inputType = (el.inputType || el.type || '').toLowerCase();
                                    // Determine control type
                                    if (tagName === 'button' || el.role === 'button')
                                        controlType = 'BUTTON';
                                    else if (tagName === 'a' || el.role === 'link')
                                        controlType = 'LINK';
                                    else if (tagName === 'input') {
                                        if (inputType === 'text')
                                            controlType = 'TEXT INPUT';
                                        else if (inputType === 'email')
                                            controlType = 'EMAIL INPUT';
                                        else if (inputType === 'password')
                                            controlType = 'PASSWORD INPUT';
                                        else if (inputType === 'checkbox')
                                            controlType = 'CHECKBOX';
                                        else if (inputType === 'radio')
                                            controlType = 'RADIO BUTTON';
                                        else if (inputType === 'submit')
                                            controlType = 'SUBMIT BUTTON';
                                        else if (inputType === 'file')
                                            controlType = 'FILE INPUT';
                                        else
                                            controlType = `INPUT (${inputType})`;
                                    }
                                    else if (tagName === 'select')
                                        controlType = 'DROPDOWN/SELECT';
                                    else if (tagName === 'textarea')
                                        controlType = 'TEXT AREA';
                                    else if (tagName === 'label')
                                        controlType = 'LABEL';
                                    else if (tagName === 'h1' || tagName === 'h2' || tagName === 'h3' || tagName === 'h4' || tagName === 'h5' || tagName === 'h6')
                                        controlType = 'HEADING';
                                    else if (tagName === 'p')
                                        controlType = 'PARAGRAPH';
                                    else if (tagName === 'span')
                                        controlType = 'SPAN TEXT';
                                    else if (tagName === 'div')
                                        controlType = 'DIV CONTAINER';
                                    else if (tagName === 'li')
                                        controlType = 'LIST ITEM';
                                    else if (el.role)
                                        controlType = el.role.toUpperCase();
                                    return {
                                        type: controlType,
                                        selector: el.selector || el.selectors?.primary || '',
                                        label: el.text || el.label || el.placeholder || '',
                                    };
                                }
                            }
                            return null;
                        };
                        // Case-insensitive search in visible text
                        const lowerText = searchText.toLowerCase();
                        const lowerQuery = searchQuery.toLowerCase();
                        const matches = [];
                        let searchPos = 0;
                        while (matches.length < maxMatches) {
                            const foundPos = lowerText.indexOf(lowerQuery, searchPos);
                            if (foundPos === -1)
                                break;
                            // Extract context around match
                            const contextStart = Math.max(0, foundPos - contextChars);
                            const contextEnd = Math.min(searchText.length, foundPos + searchQuery.length + contextChars);
                            const beforeText = searchText.slice(contextStart, foundPos);
                            const matchText = searchText.slice(foundPos, foundPos + searchQuery.length);
                            const afterText = searchText.slice(foundPos + searchQuery.length, contextEnd);
                            // Find if this match is in an interactive control
                            const control = findMatchingControl(matchText);
                            matches.push({
                                position: foundPos,
                                context: `${contextStart > 0 ? '...' : ''}${beforeText}[${matchText}]${afterText}${contextEnd < searchText.length ? '...' : ''}`,
                                control,
                            });
                            searchPos = foundPos + 1;
                        }
                        // Count total matches (beyond maxMatches limit)
                        let totalMatches = matches.length;
                        while (lowerText.indexOf(lowerQuery, searchPos) !== -1) {
                            totalMatches++;
                            searchPos = lowerText.indexOf(lowerQuery, searchPos) + 1;
                        }
                        // Format output with control info
                        const matchList = matches.map((m, i) => {
                            const controlInfo = m.control
                                ? `\n   🎯 Control: ${m.control.type}${m.control.selector ? ` | selector: ${m.control.selector}` : ''}`
                                : '\n   📄 Plain text (not in interactive control)';
                            return `${i + 1}. [pos ${m.position.toLocaleString()}] ${m.context}${controlInfo}`;
                        }).join('\n\n');
                        // Also list any interactive elements that match the query directly
                        const matchingControls = interactiveElements.filter((el) => {
                            const elText = (el.text || el.label || el.placeholder || el.value || '').toLowerCase();
                            return elText.includes(lowerQuery);
                        }).slice(0, 5);
                        const controlsSummary = matchingControls.length > 0
                            ? `\n\n🎮 Interactive elements matching "${searchQuery}":\n` + matchingControls.map((el, i) => {
                                const tagName = (el.tagName || '').toLowerCase();
                                let type = el.type || tagName || 'element';
                                if (tagName === 'button' || el.role === 'button')
                                    type = 'BUTTON';
                                else if (tagName === 'a')
                                    type = 'LINK';
                                else if (tagName === 'input')
                                    type = `INPUT (${el.inputType || 'text'})`;
                                else if (tagName === 'select')
                                    type = 'DROPDOWN';
                                return `  ${i + 1}. [${type}] "${el.text || el.label || el.placeholder || '(no text)'}" → selector: ${el.selector || el.selectors?.primary || 'N/A'}`;
                            }).join('\n')
                            : '';
                        return {
                            content: [{
                                    type: 'text',
                                    text: `🔍 Search: "${searchQuery}"
Page: ${result.title}
URL: ${result.url}
Page length: ${searchText.length.toLocaleString()} chars
Matches found: ${totalMatches}${totalMatches > maxMatches ? ` (showing first ${maxMatches})` : ''}

${matches.length > 0 ? matchList : 'No matches found.'}${controlsSummary}${totalMatches > maxMatches ? `\n\n💡 Increase maxMatches to see more results.` : ''}`,
                                }],
                        };
                    }
                    case 'browser_waitForSelector':
                        result = await this.browserProxyCall('/browser/waitForSelector', 'POST', {
                            selector: args?.selector,
                            timeout: args?.timeout,
                            tabId: args?.tabId,
                            browser: args?.browser,
                        });
                        return {
                            content: [{
                                    type: 'text',
                                    text: result.success && result.found
                                        ? `Found element: ${args?.selector}\n  Tag: ${result.element?.tagName}\n  Text: ${result.element?.text || '(none)'}\n  Visible: ${result.element?.visible}`
                                        : `Element not found: ${args?.selector}\n  ${result.error || 'Timeout'}`,
                                }],
                        };
                    case 'browser_waitForPageLoad':
                        result = await this.browserProxyCall('/browser/waitForPageLoad', 'POST', {
                            timeout: args?.timeout,
                            tabId: args?.tabId,
                            browser: args?.browser,
                        });
                        return {
                            content: [{
                                    type: 'text',
                                    text: result.success
                                        ? `Page loaded: ${result.title}\n  URL: ${result.url}\n  State: ${result.readyState}`
                                        : `Page load timeout: ${result.error}\n  State: ${result.readyState}`,
                                }],
                        };
                    case 'browser_selectOption':
                        result = await this.browserProxyCall('/browser/selectOption', 'POST', {
                            selector: args?.selector,
                            value: args?.value,
                            tabId: args?.tabId,
                            browser: args?.browser,
                        });
                        if (!result.success) {
                            const availableOpts = result.availableOptions
                                ? `\nAvailable options:\n${result.availableOptions.map((o) => `  - "${o.value}" (${o.text})`).join('\n')}`
                                : '';
                            return {
                                content: [{ type: 'text', text: `Error: ${result.error}${availableOpts}` }],
                                isError: true,
                            };
                        }
                        return {
                            content: [{
                                    type: 'text',
                                    text: `Selected "${result.selectedText}" (value: ${result.selectedValue}) in ${args?.selector}`,
                                }],
                        };
                    case 'browser_isElementVisible':
                        result = await this.browserProxyCall('/browser/isElementVisible', 'POST', {
                            selector: args?.selector,
                            tabId: args?.tabId,
                            browser: args?.browser,
                        });
                        return {
                            content: [{
                                    type: 'text',
                                    text: result.exists
                                        ? `Element ${args?.selector}:\n  Exists: true\n  Visible: ${result.visible}\n  In viewport: ${result.inViewport}\n  Tag: ${result.tagName}\n  Text: ${result.text || '(none)'}`
                                        : `Element ${args?.selector}: not found`,
                                }],
                        };
                    case 'browser_getConsoleLogs':
                        result = await this.browserProxyCall('/browser/getConsoleLogs', 'POST', {
                            filter: args?.filter,
                            clear: args?.clear,
                            tabId: args?.tabId,
                            browser: args?.browser,
                        });
                        if (result.error) {
                            return {
                                content: [{ type: 'text', text: `Error: ${result.error}` }],
                                isError: true,
                            };
                        }
                        return {
                            content: [{
                                    type: 'text',
                                    text: `Console logs (${result.count}):\nTypes: log=${result.types.log}, error=${result.types.error}, warn=${result.types.warn}, info=${result.types.info}\n\n` +
                                        result.logs.slice(0, 100).map((log) => `[${log.type.toUpperCase()}] ${new Date(log.timestamp).toISOString()}\n  ${log.message.substring(0, 500)}`).join('\n\n'),
                                }],
                        };
                    case 'browser_getNetworkRequests':
                        result = await this.browserProxyCall('/browser/getNetworkRequests', 'POST', {
                            filter: args?.filter,
                            clear: args?.clear,
                            tabId: args?.tabId,
                            browser: args?.browser,
                        });
                        if (result.error) {
                            return {
                                content: [{ type: 'text', text: `Error: ${result.error}` }],
                                isError: true,
                            };
                        }
                        return {
                            content: [{
                                    type: 'text',
                                    text: `Network requests (${result.count}):\nSummary: ${result.summary.fetch} fetch, ${result.summary.xhr} XHR, ${result.summary.successful} successful, ${result.summary.failed} failed\n\n` +
                                        result.requests.slice(0, 50).map((req) => `[${req.type.toUpperCase()}] ${req.method} ${req.url.substring(0, 100)}\n  Status: ${req.status || 'pending'} (${req.duration || 0}ms)${req.error ? `\n  Error: ${req.error}` : ''}`).join('\n\n'),
                                }],
                        };
                    case 'browser_getLocalStorage':
                        result = await this.browserProxyCall('/browser/getLocalStorage', 'POST', {
                            tabId: args?.tabId,
                            browser: args?.browser,
                        });
                        if (!result.success) {
                            return {
                                content: [{ type: 'text', text: `Error: ${result.error}` }],
                                isError: true,
                            };
                        }
                        return {
                            content: [{
                                    type: 'text',
                                    text: `localStorage for ${result.domain} (${result.count} items):\n\n` +
                                        Object.entries(result.items).map(([key, value]) => `${key}: ${JSON.stringify(value).substring(0, 200)}`).join('\n'),
                                }],
                        };
                    case 'browser_getCookies':
                        result = await this.browserProxyCall('/browser/getCookies', 'POST', {
                            tabId: args?.tabId,
                            browser: args?.browser,
                        });
                        if (!result.success) {
                            return {
                                content: [{ type: 'text', text: `Error: ${result.error}` }],
                                isError: true,
                            };
                        }
                        return {
                            content: [{
                                    type: 'text',
                                    text: `Cookies for ${result.domain} (${result.count}):\n\n` +
                                        Object.entries(result.cookies).map(([name, value]) => `${name}: ${String(value).substring(0, 100)}`).join('\n'),
                                }],
                        };
                    // ========== ENHANCED BROWSER TOOLS ==========
                    case 'browser_inspectCurrentPage': {
                        result = await this.browserProxyCall('/browser/inspectCurrentPage', 'POST', {
                            tabId: args?.tabId,
                            browser: args?.browser,
                            includeScreenshot: args?.includeScreenshot === true, // Default to false to reduce response size
                            includeOCR: args?.includeOCR || false,
                        });
                        // Format a concise, LLM-friendly summary instead of raw JSON
                        const pageInfo = result.pageInfo || {};
                        const elements = result.elements?.elements || [];
                        const summary = result.elements?.summary || {};
                        // Build concise element list (limit to 30 most relevant)
                        const maxElements = 30;
                        const relevantElements = elements.slice(0, maxElements);
                        const elementList = relevantElements.map((el, i) => {
                            const label = el.label || el.text || el.placeholder || '';
                            const selector = el.selector || el.selectors?.primary || '';
                            return `  ${i + 1}. [${el.type}] ${label ? `"${label}" ` : ''}${selector ? `selector: ${selector}` : ''}`;
                        }).join('\n');
                        const output = `Page: ${pageInfo.title || 'Untitled'}
URL: ${pageInfo.url || 'unknown'}
Viewport: ${pageInfo.viewport?.width || '?'}x${pageInfo.viewport?.height || '?'}

Summary: ${summary.total || elements.length} elements (${summary.inputs || 0} inputs, ${summary.buttons || 0} buttons, ${summary.links || 0} links)

Interactive Elements${elements.length > maxElements ? ` (showing first ${maxElements} of ${elements.length})` : ''}:
${elementList || '  (none found)'}

${args?.includeScreenshot === true && result.screenshot ? '\n[Screenshot included]' : 'Tip: Set includeScreenshot: true to see the page'}`;
                        return {
                            content: [{
                                    type: 'text',
                                    text: output,
                                }],
                        };
                    }
                    case 'browser_getUIElements':
                        result = await this.browserProxyCall('/browser/getUIElements', 'POST', {
                            tabId: args?.tabId,
                            browser: args?.browser,
                        });
                        return {
                            content: [{
                                    type: 'text',
                                    text: JSON.stringify(result, null, 2),
                                }],
                        };
                    case 'browser_fillFormField':
                        result = await this.browserProxyCall('/browser/fillFormField', 'POST', {
                            label: args?.label,
                            value: args?.value,
                            tabId: args?.tabId,
                            browser: args?.browser,
                        });
                        if (!result.success) {
                            return {
                                content: [{ type: 'text', text: `Error: ${result.error}` }],
                                isError: true,
                            };
                        }
                        return {
                            content: [{
                                    type: 'text',
                                    text: `Successfully filled field "${args?.label}" with value "${args?.value}"`,
                                }],
                        };
                    case 'browser_fillWithFallback': {
                        // Unified tool that tries JS fill first, then falls back to native input
                        // Key improvement: Always get FRESH coordinates immediately before clicking
                        const selector = args?.selector;
                        const value = args?.value;
                        const browser = (args?.browser || 'firefox');
                        const tabId = args?.tabId;
                        const maxRetries = 3;
                        // Helper function to get fresh coordinates (scrolls element into view)
                        const getFreshCoords = async () => {
                            return await this.browserProxyCall('/browser/getElementForNativeInput', 'POST', {
                                selector,
                                tabId,
                                browser,
                            });
                        };
                        // Helper function to verify value was set
                        const verifyValue = async () => {
                            const check = await getFreshCoords();
                            return check.success && check.currentValue === value;
                        };
                        // Step 1: Try browser extension fill with enhanced event simulation
                        const fillResult = await this.browserProxyCall('/browser/fillElement', 'POST', {
                            selector,
                            value,
                            tabId,
                            browser,
                            simulateTyping: true,
                            clearFirst: true,
                        });
                        // Step 2: Verify the value was actually set
                        if (fillResult.success && await verifyValue()) {
                            return {
                                content: [{
                                        type: 'text',
                                        text: `✅ Filled "${selector}" with JS simulation\nValue: "${value}"`,
                                    }],
                            };
                        }
                        // Step 3: Fall back to native input with retry logic
                        console.log(`[fillWithFallback] JS fill failed or value didn't persist, falling back to native input`);
                        let lastError = '';
                        let lastCoords = { centerX: 0, centerY: 0 };
                        for (let attempt = 1; attempt <= maxRetries; attempt++) {
                            try {
                                // Get FRESH coordinates immediately before clicking (critical!)
                                const coordResult = await getFreshCoords();
                                if (!coordResult.success) {
                                    lastError = coordResult.error || 'Failed to get element coordinates';
                                    continue;
                                }
                                const { centerX, centerY } = coordResult.coordinates.normalized;
                                lastCoords = { centerX, centerY };
                                // Focus browser application
                                const browserName = browser.charAt(0).toUpperCase() + browser.slice(1); // Capitalize
                                await this.proxyCall('/focusApplication', 'POST', { identifier: browserName });
                                await new Promise(resolve => setTimeout(resolve, 50));
                                // Click on the input field with FRESH coordinates
                                await this.proxyCall('/click', 'POST', {
                                    x: centerX,
                                    y: centerY,
                                    button: 'left',
                                });
                                await new Promise(resolve => setTimeout(resolve, 50));
                                // Clear existing value with select all + delete
                                await this.proxyCall('/pressKey', 'POST', { key: 'Command+a' });
                                await new Promise(resolve => setTimeout(resolve, 30));
                                await this.proxyCall('/pressKey', 'POST', { key: 'Delete' });
                                await new Promise(resolve => setTimeout(resolve, 30));
                                // Type the value using native keyboard
                                await this.proxyCall('/typeText', 'POST', { text: value });
                                await new Promise(resolve => setTimeout(resolve, 50));
                                // Verify the value was set
                                if (await verifyValue()) {
                                    return {
                                        content: [{
                                                type: 'text',
                                                text: `✅ Filled "${selector}" with NATIVE input\nValue: "${value}"\nMethod: native click(${centerX.toFixed(3)}, ${centerY.toFixed(3)}) → typeText\nAttempt: ${attempt}/${maxRetries}`,
                                            }],
                                    };
                                }
                                lastError = `Value verification failed - expected "${value}" but field has different value`;
                                console.log(`[fillWithFallback] Attempt ${attempt} failed verification, retrying with fresh coordinates...`);
                            }
                            catch (err) {
                                lastError = err.message || 'Unknown error';
                                console.log(`[fillWithFallback] Attempt ${attempt} error: ${lastError}`);
                            }
                        }
                        // All retries failed
                        return {
                            content: [{
                                    type: 'text',
                                    text: `❌ Failed to fill "${selector}" after ${maxRetries} attempts\nLast error: ${lastError}\nLast coords: (${lastCoords.centerX.toFixed(3)}, ${lastCoords.centerY.toFixed(3)})\n\nTip: The element may be moving or obscured. Try scrolling the page first.`,
                                }],
                            isError: true,
                        };
                    }
                    case 'browser_fillFormNative': {
                        // Atomic form filling using native keyboard/mouse with Tab navigation
                        // Key strategy: Fill ALL text fields first using Tab, THEN click buttons
                        const fields = args?.fields || [];
                        const buttons = args?.buttons || [];
                        const shouldSubmit = args?.submit === true;
                        const submitSelector = args?.submitSelector;
                        const browser = (args?.browser || 'firefox');
                        const tabId = args?.tabId;
                        if (fields.length === 0) {
                            return {
                                content: [{ type: 'text', text: '❌ No fields provided to fill' }],
                                isError: true,
                            };
                        }
                        const browserName = browser.charAt(0).toUpperCase() + browser.slice(1);
                        const filledFields = [];
                        const clickedButtons = [];
                        const errors = [];
                        try {
                            // Step 1: Get page info to understand form structure
                            const pageInfo = await this.browserProxyCall('/browser/inspectCurrentPage', 'POST', {
                                tabId,
                                browser,
                                includeScreenshot: false,
                            });
                            if (!pageInfo.elements?.elements) {
                                return {
                                    content: [{ type: 'text', text: '❌ Could not inspect page elements' }],
                                    isError: true,
                                };
                            }
                            const elements = pageInfo.elements.elements;
                            // Step 2: Find all input fields and their order
                            const inputElements = elements.filter((el) => el.type?.includes('input') || el.type === 'textarea');
                            // Step 3: Match requested fields to page elements
                            const fieldMappings = [];
                            for (const field of fields) {
                                let matchedElement = null;
                                let matchIndex = -1;
                                if (field.selector) {
                                    // Find by selector
                                    matchedElement = elements.find((el) => el.selector === field.selector);
                                    matchIndex = inputElements.findIndex((el) => el.selector === field.selector);
                                }
                                else if (field.label) {
                                    // Find by label (fuzzy match)
                                    const labelLower = field.label.toLowerCase();
                                    matchedElement = inputElements.find((el) => {
                                        const elLabel = (el.label || el.name || el.id || el.placeholder || '').toLowerCase();
                                        return elLabel.includes(labelLower) || labelLower.includes(elLabel);
                                    });
                                    if (matchedElement) {
                                        matchIndex = inputElements.indexOf(matchedElement);
                                    }
                                }
                                if (matchedElement) {
                                    fieldMappings.push({ field, element: matchedElement, index: matchIndex });
                                }
                                else {
                                    errors.push(`Field not found: ${field.label || field.selector}`);
                                }
                            }
                            if (fieldMappings.length === 0) {
                                return {
                                    content: [{ type: 'text', text: `❌ No matching fields found\nErrors: ${errors.join(', ')}` }],
                                    isError: true,
                                };
                            }
                            // Step 4: Sort fields by their position in the DOM (tab order)
                            fieldMappings.sort((a, b) => a.index - b.index);
                            // Step 5: Focus browser application
                            await this.proxyCall('/focusApplication', 'POST', { identifier: browserName });
                            await new Promise(resolve => setTimeout(resolve, 100));
                            // Step 6: Click on the FIRST field to start
                            const firstField = fieldMappings[0];
                            const firstCoords = firstField.element.coordinates.normalized;
                            await this.proxyCall('/click', 'POST', {
                                x: firstCoords.centerX,
                                y: firstCoords.centerY,
                                button: 'left',
                            });
                            await new Promise(resolve => setTimeout(resolve, 100));
                            // Step 7: Fill fields using Tab navigation
                            for (let i = 0; i < fieldMappings.length; i++) {
                                const { field, element } = fieldMappings[i];
                                // Clear existing value
                                await this.proxyCall('/pressKey', 'POST', { key: 'Command+a' });
                                await new Promise(resolve => setTimeout(resolve, 30));
                                await this.proxyCall('/pressKey', 'POST', { key: 'Delete' });
                                await new Promise(resolve => setTimeout(resolve, 30));
                                // Type the value
                                await this.proxyCall('/typeText', 'POST', { text: field.value });
                                await new Promise(resolve => setTimeout(resolve, 50));
                                filledFields.push(`${element.label || element.name || element.selector}: "${field.value}"`);
                                // Tab to next field (if not the last one)
                                if (i < fieldMappings.length - 1) {
                                    // Calculate how many tabs needed to get to next field
                                    const currentIndex = fieldMappings[i].index;
                                    const nextIndex = fieldMappings[i + 1].index;
                                    const tabsNeeded = nextIndex - currentIndex;
                                    for (let t = 0; t < tabsNeeded; t++) {
                                        await this.proxyCall('/pressKey', 'POST', { key: 'Tab' });
                                        await new Promise(resolve => setTimeout(resolve, 30));
                                    }
                                }
                            }
                            // Step 8: Press Tab to blur the last field (commits the value)
                            await this.proxyCall('/pressKey', 'POST', { key: 'Tab' });
                            await new Promise(resolve => setTimeout(resolve, 100));
                            // Step 9: Click buttons (Yes/No etc) using browser extension (no native click needed)
                            for (const button of buttons) {
                                try {
                                    if (button.selector) {
                                        await this.browserProxyCall('/browser/clickElement', 'POST', {
                                            selector: button.selector,
                                            tabId,
                                            browser,
                                        });
                                        clickedButtons.push(button.selector);
                                    }
                                    else if (button.label) {
                                        await this.browserProxyCall('/browser/clickByText', 'POST', {
                                            text: button.label,
                                            elementType: 'button',
                                            tabId,
                                            browser,
                                        });
                                        clickedButtons.push(button.label);
                                    }
                                    await new Promise(resolve => setTimeout(resolve, 100));
                                }
                                catch (err) {
                                    errors.push(`Button "${button.label || button.selector}": ${err.message}`);
                                }
                            }
                            // Step 10: Verify all field values
                            await new Promise(resolve => setTimeout(resolve, 200));
                            const verifyResult = await this.browserProxyCall('/browser/inspectCurrentPage', 'POST', {
                                tabId,
                                browser,
                                includeScreenshot: false,
                            });
                            const verifyElements = verifyResult.elements?.elements || [];
                            const verificationResults = [];
                            for (const { field, element } of fieldMappings) {
                                const currentEl = verifyElements.find((el) => el.selector === element.selector || el.id === element.id);
                                const currentValue = currentEl?.currentValue || '';
                                const expected = field.value;
                                const match = currentValue === expected;
                                verificationResults.push(`${element.label || element.selector}: ${match ? '✓' : `✗ (got "${currentValue}")`}`);
                            }
                            // Step 11: Submit if requested
                            let submitResult = '';
                            if (shouldSubmit) {
                                try {
                                    const selector = submitSelector || '.ashby-application-form-submit-button, button[type="submit"], input[type="submit"]';
                                    await this.browserProxyCall('/browser/clickElement', 'POST', {
                                        selector,
                                        tabId,
                                        browser,
                                    });
                                    submitResult = '\n✅ Form submitted';
                                }
                                catch (err) {
                                    submitResult = `\n❌ Submit failed: ${err.message}`;
                                }
                            }
                            return {
                                content: [{
                                        type: 'text',
                                        text: `🚀 Form filled using native input with Tab navigation\n\nFields filled:\n  ${filledFields.join('\n  ')}\n\nButtons clicked:\n  ${clickedButtons.length > 0 ? clickedButtons.join(', ') : 'none'}\n\nVerification:\n  ${verificationResults.join('\n  ')}${submitResult}${errors.length > 0 ? `\n\nWarnings:\n  ${errors.join('\n  ')}` : ''}`,
                                    }],
                            };
                        }
                        catch (err) {
                            return {
                                content: [{
                                        type: 'text',
                                        text: `❌ Form fill failed: ${err.message}\n\nFields filled before error:\n  ${filledFields.join('\n  ') || 'none'}`,
                                    }],
                                isError: true,
                            };
                        }
                    }
                    case 'browser_getElementForNativeInput':
                        result = await this.browserProxyCall('/browser/getElementForNativeInput', 'POST', {
                            selector: args?.selector,
                            tabId: args?.tabId,
                            browser: args?.browser,
                        });
                        if (!result.success) {
                            return {
                                content: [{ type: 'text', text: `Error: ${result.error}` }],
                                isError: true,
                            };
                        }
                        return {
                            content: [{
                                    type: 'text',
                                    text: `Element ready for native input:\n  Selector: ${result.selector}\n  Type: ${result.elementType}${result.inputType ? ` (${result.inputType})` : ''}\n  Current value: "${result.currentValue || ''}"\n  Normalized coords: (${result.coordinates.normalized.centerX.toFixed(3)}, ${result.coordinates.normalized.centerY.toFixed(3)})\n\nWorkflow:\n  1. focusApplication("Firefox")\n  2. click(${result.coordinates.normalized.centerX.toFixed(3)}, ${result.coordinates.normalized.centerY.toFixed(3)})\n  3. typeText("your value")`,
                                }],
                        };
                    // ========== NEW ENHANCED BROWSER TOOL HANDLERS ==========
                    case 'browser_findTabByUrl':
                        result = await this.browserProxyCall('/browser/findTabByUrl', 'POST', {
                            urlPattern: args?.urlPattern,
                            browser: args?.browser,
                        });
                        if (result.error || !result.tab) {
                            return {
                                content: [{ type: 'text', text: `No tab found matching "${args?.urlPattern}"${result.error ? `: ${result.error}` : ''}` }],
                                isError: !result.tab,
                            };
                        }
                        return {
                            content: [{
                                    type: 'text',
                                    text: `Found tab:\n  ID: ${result.tab.id}\n  Title: ${result.tab.title}\n  URL: ${result.tab.url}\n  Active: ${result.tab.active}`,
                                }],
                        };
                    case 'browser_clickByText':
                        result = await this.browserProxyCall('/browser/clickByText', 'POST', {
                            text: args?.text,
                            index: args?.index || 0,
                            elementType: args?.elementType || 'any',
                            waitForNavigation: args?.waitForNavigation || false,
                            tabId: args?.tabId,
                            browser: args?.browser,
                        });
                        if (!result.success) {
                            return {
                                content: [{ type: 'text', text: `Failed to click "${args?.text}": ${result.error}${result.availableTexts ? `\n\nAvailable elements:\n${result.availableTexts.slice(0, 10).map((t, i) => `  ${i}. ${t}`).join('\n')}` : ''}` }],
                                isError: true,
                            };
                        }
                        return {
                            content: [{
                                    type: 'text',
                                    text: `Clicked "${result.clickedText}" (${result.elementType})${result.navigated ? '\nPage navigated.' : ''}`,
                                }],
                        };
                    case 'browser_clickMultiple':
                        result = await this.browserProxyCall('/browser/clickMultiple', 'POST', {
                            selectors: args?.selectors,
                            delayMs: args?.delayMs || 100,
                            tabId: args?.tabId,
                            browser: args?.browser,
                        });
                        if (result.error) {
                            return {
                                content: [{ type: 'text', text: `Error: ${result.error}` }],
                                isError: true,
                            };
                        }
                        return {
                            content: [{
                                    type: 'text',
                                    text: `Clicked ${result.clickedCount}/${result.totalCount} elements:\n${result.results.map((r, i) => `  ${i + 1}. ${r.selector}: ${r.success ? 'OK' : r.error}`).join('\n')}`,
                                }],
                        };
                    case 'browser_getFormStructure':
                        result = await this.browserProxyCall('/browser/getFormStructure', 'POST', {
                            tabId: args?.tabId,
                            browser: args?.browser,
                        });
                        if (result.error) {
                            return {
                                content: [{ type: 'text', text: `Error: ${result.error}` }],
                                isError: true,
                            };
                        }
                        // Format questions nicely
                        const questionsText = (result.questions || []).map((q, i) => {
                            let questionOutput = `${i + 1}. ${q.text}`;
                            if (q.type === 'yes_no') {
                                questionOutput += `\n   Yes: ${q.yesSelector}\n   No: ${q.noSelector}`;
                            }
                            else if (q.type === 'multiple_choice') {
                                questionOutput += `\n   Options:\n${q.options.map((o) => `     - "${o.text}": ${o.selector}`).join('\n')}`;
                            }
                            else if (q.type === 'input') {
                                questionOutput += `\n   Input: ${q.selector}`;
                            }
                            return questionOutput;
                        }).join('\n\n');
                        return {
                            content: [{
                                    type: 'text',
                                    text: `Form Structure (${result.questions?.length || 0} questions):\n\n${questionsText}`,
                                }],
                        };
                    case 'browser_answerQuestions':
                        result = await this.browserProxyCall('/browser/answerQuestions', 'POST', {
                            answers: args?.answers,
                            defaultAnswer: args?.defaultAnswer,
                            tabId: args?.tabId,
                            browser: args?.browser,
                        });
                        if (result.error) {
                            return {
                                content: [{ type: 'text', text: `Error: ${result.error}` }],
                                isError: true,
                            };
                        }
                        return {
                            content: [{
                                    type: 'text',
                                    text: `Answered ${result.answeredCount}/${result.totalQuestions} questions:\n${result.results.map((r) => `  • "${r.question}": ${r.answer} ${r.success ? '✓' : '✗ ' + r.error}`).join('\n')}`,
                                }],
                        };
                    // ========== LLM INTROSPECTION TOOLS ==========
                    case 'browser_listInteractiveElements':
                        result = await this.browserProxyCall('/browser/listInteractiveElements', 'POST', {
                            tabId: args?.tabId,
                            browser: args?.browser,
                            filterType: args?.filterType,
                            searchText: args?.searchText,
                            includeHidden: args?.includeHidden,
                            maxElements: args?.maxElements,
                            includeShadowDOM: args?.includeShadowDOM,
                            includeIframes: args?.includeIframes,
                        });
                        if (result.error) {
                            return {
                                content: [{ type: 'text', text: `Error: ${result.error}` }],
                                isError: true,
                            };
                        }
                        // Format the element list in a structured way for LLM consumption
                        const interactiveEls = result.elements || result;
                        if (Array.isArray(interactiveEls)) {
                            const formatted = interactiveEls.map((el, i) => {
                                const selectors = el.alternativeSelectors || [];
                                const selectorList = selectors.slice(0, 3).map((s) => `    ${s.type}: ${s.selector}`).join('\n');
                                return `[${i}] ${el.type || el.tagName} "${el.label || el.text || ''}"\n  Primary: ${el.selector}\n${selectorList}\n  Value: ${el.value || ''}\n  Coords: (${el.normalizedX?.toFixed(3)}, ${el.normalizedY?.toFixed(3)})`;
                            }).join('\n\n');
                            return {
                                content: [{
                                        type: 'text',
                                        text: `Found ${interactiveEls.length} interactive elements:\n\n${formatted}`,
                                    }],
                            };
                        }
                        return {
                            content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
                        };
                    case 'browser_clickElementWithDebug':
                        result = await this.browserProxyCall('/browser/clickElementWithDebug', 'POST', {
                            selector: args?.selector,
                            tabId: args?.tabId,
                            browser: args?.browser,
                        });
                        if (result.clicked) {
                            return {
                                content: [{
                                        type: 'text',
                                        text: `✓ Clicked ${result.tagName || 'element'}: "${result.text || ''}"`,
                                    }],
                            };
                        }
                        // Format debug info for failed clicks
                        let debugText = `✗ Click failed: ${result.error}\n`;
                        debugText += `  Selector: ${args?.selector}\n`;
                        debugText += `  Match count: ${result.matchCount || 0}\n`;
                        if (result.candidates?.length) {
                            debugText += `  Candidates:\n${result.candidates.map((c) => `    - ${c.selector}: "${c.text}"`).join('\n')}\n`;
                        }
                        if (result.suggestions?.length) {
                            debugText += `  Suggestions:\n${result.suggestions.map((s) => `    - ${s}`).join('\n')}\n`;
                        }
                        return {
                            content: [{ type: 'text', text: debugText }],
                            isError: true,
                        };
                    case 'browser_findElementWithDebug':
                        result = await this.browserProxyCall('/browser/findElementWithDebug', 'POST', {
                            selector: args?.selector,
                            tabId: args?.tabId,
                            browser: args?.browser,
                        });
                        if (result.found) {
                            return {
                                content: [{
                                        type: 'text',
                                        text: `✓ Found element: ${result.tagName} "${result.text || ''}"\n  Selector: ${args?.selector}\n  Visible: ${result.visible}\n  Interactive: ${result.interactive}`,
                                    }],
                            };
                        }
                        // Format debug info for not found
                        let findDebugText = `✗ Element not found: ${result.error}\n`;
                        findDebugText += `  Selector: ${args?.selector}\n`;
                        findDebugText += `  Match count: ${result.matchCount || 0}\n`;
                        if (result.candidates?.length) {
                            findDebugText += `  Similar elements:\n${result.candidates.map((c) => `    - ${c.selector}: "${c.text}"`).join('\n')}\n`;
                        }
                        if (result.suggestions?.length) {
                            findDebugText += `  Try these selectors:\n${result.suggestions.map((s) => `    - ${s}`).join('\n')}\n`;
                        }
                        return {
                            content: [{ type: 'text', text: findDebugText }],
                        };
                    // ========== COMBO-BOX TOOLS ==========
                    case 'browser_getDropdownOptions':
                        result = await this.browserProxyCall('/browser/getDropdownOptions', 'POST', {
                            selector: args?.selector,
                            waitMs: args?.waitMs,
                            closeAfter: args?.closeAfter,
                            tabId: args?.tabId,
                            browser: args?.browser,
                        });
                        if (result.error) {
                            return {
                                content: [{ type: 'text', text: `Error: ${result.error}` }],
                                isError: true,
                            };
                        }
                        // Format options for LLM consumption
                        const opts = result.options || [];
                        if (opts.length === 0) {
                            return {
                                content: [{
                                        type: 'text',
                                        text: `Combo-box opened (${result.framework || 'unknown'}) but no options visible.\n` +
                                            `Input selector: ${result.inputSelector || args?.selector}\n` +
                                            `Toggle selector: ${result.toggleSelector || 'none'}\n` +
                                            `Hint: ${result.hint || 'Try typing to load options.'}`,
                                    }],
                            };
                        }
                        const optionsList = opts.map((opt, i) => {
                            const coords = opt.screenCoordinates?.normalized;
                            return `[${i}] "${opt.text}"\n` +
                                `    selector: ${opt.selector}\n` +
                                `    coords: (${coords?.centerX?.toFixed(3) || '?'}, ${coords?.centerY?.toFixed(3) || '?'})`;
                        }).join('\n');
                        return {
                            content: [{
                                    type: 'text',
                                    text: `📋 Combo-box options (${result.framework || 'custom'}):\n\n` +
                                        `${optionsList}\n\n` +
                                        `Total: ${opts.length} options\n` +
                                        `Input: ${result.inputSelector}\n` +
                                        `Toggle: ${result.toggleSelector || 'none'}\n\n` +
                                        `To select: clickElement(option.selector) or use coords with native click()`,
                                }],
                        };
                    case 'browser_openDropdownNative': {
                        // Native dropdown opener - uses macOS native input to open stubborn dropdowns
                        const selector = args?.selector;
                        const searchText = args?.searchText || '';
                        const waitMs = args?.waitMs || 500;
                        const browser = (args?.browser || 'firefox');
                        const tabId = args?.tabId;
                        try {
                            // Step 1: Get element coordinates via browser extension
                            const coordResult = await this.browserProxyCall('/browser/getElementForNativeInput', 'POST', {
                                selector,
                                tabId,
                                browser,
                            });
                            if (coordResult.error || !coordResult.coordinates) {
                                return {
                                    content: [{ type: 'text', text: `❌ Failed to get element coordinates: ${coordResult.error || 'No coordinates returned'}` }],
                                    isError: true,
                                };
                            }
                            const { centerX, centerY } = coordResult.coordinates.normalized;
                            // Step 2: Focus browser window
                            const browserName = browser.charAt(0).toUpperCase() + browser.slice(1);
                            await this.proxyCall('/focusApplication', 'POST', { identifier: browserName });
                            await new Promise(resolve => setTimeout(resolve, 100));
                            // Step 3: Click at the dropdown coordinates
                            await this.proxyCall('/click', 'POST', { x: centerX, y: centerY, button: 'left' });
                            await new Promise(resolve => setTimeout(resolve, 100));
                            // Step 4: If searchText provided, type it to trigger autocomplete
                            if (searchText) {
                                await this.proxyCall('/typeText', 'POST', { text: searchText });
                                await new Promise(resolve => setTimeout(resolve, waitMs));
                            }
                            else {
                                // Try ArrowDown to open dropdown without typing
                                await this.proxyCall('/pressKey', 'POST', { key: 'Down' });
                                await new Promise(resolve => setTimeout(resolve, waitMs));
                            }
                            // Step 5: Get dropdown options now that it should be open
                            const optionsResult = await this.browserProxyCall('/browser/getDropdownOptions', 'POST', {
                                selector,
                                tabId,
                                browser,
                                waitMs: 100, // Short wait since we already waited
                            });
                            if (optionsResult.error) {
                                return {
                                    content: [{
                                            type: 'text',
                                            text: `⚠️ Dropdown clicked but options not found: ${optionsResult.error}\n` +
                                                `Clicked at: (${centerX.toFixed(3)}, ${centerY.toFixed(3)})\n` +
                                                `Search text: "${searchText || '(none)'}"\n` +
                                                `Hint: The dropdown may require different interaction. Try increasing waitMs.`,
                                        }],
                                };
                            }
                            const nativeOpts = optionsResult.options || [];
                            if (nativeOpts.length === 0) {
                                return {
                                    content: [{
                                            type: 'text',
                                            text: `⚠️ Dropdown opened but no options visible.\n` +
                                                `Clicked at: (${centerX.toFixed(3)}, ${centerY.toFixed(3)})\n` +
                                                `Search text: "${searchText || '(none)'}"\n` +
                                                `Framework: ${optionsResult.framework || 'unknown'}\n` +
                                                `Hint: Try providing searchText to filter/load options.`,
                                        }],
                                };
                            }
                            // Format options for output
                            const nativeOptsList = nativeOpts.map((opt, i) => {
                                const coords = opt.screenCoordinates?.normalized;
                                return `[${i}] "${opt.text}"\n` +
                                    `    selector: ${opt.selector}\n` +
                                    `    coords: (${coords?.centerX?.toFixed(3) || '?'}, ${coords?.centerY?.toFixed(3) || '?'})`;
                            }).join('\n');
                            return {
                                content: [{
                                        type: 'text',
                                        text: `✅ Dropdown opened with native input!\n\n` +
                                            `📋 Options (${optionsResult.framework || 'custom'}):\n\n` +
                                            `${nativeOptsList}\n\n` +
                                            `Total: ${nativeOpts.length} options\n` +
                                            `Search: "${searchText || '(none)'}"\n` +
                                            `Clicked: (${centerX.toFixed(3)}, ${centerY.toFixed(3)})\n\n` +
                                            `To select: browser_clickElement(selector) or native click(coords)`,
                                    }],
                            };
                        }
                        catch (err) {
                            return {
                                content: [{ type: 'text', text: `❌ Native dropdown open failed: ${err.message}` }],
                                isError: true,
                            };
                        }
                    }
                    // ========== BROWSER AUTOMATION TOOLS (Playwright-style) ==========
                    case 'browser_navigate': {
                        result = await this.browserProxyCall('/browser/navigate', 'POST', {
                            url: args?.url,
                            tabId: args?.tabId,
                            browser: args?.browser,
                            waitUntil: args?.waitUntil,
                            timeout: args?.timeout,
                        });
                        if (result.error) {
                            return {
                                content: [{ type: 'text', text: `Error: ${result.error}` }],
                                isError: true,
                            };
                        }
                        // By default, include visible text for better LLM understanding
                        const includeText = args?.includeVisibleText !== false;
                        let visibleText = '';
                        if (includeText) {
                            try {
                                // Get ALL text from page, then slice locally
                                const textResult = await this.browserProxyCall('/browser/getVisibleText', 'POST', {
                                    maxLength: 500000, // Get all text
                                    tabId: args?.tabId,
                                    browser: args?.browser,
                                });
                                if (textResult.text) {
                                    const navSliceSize = Number(args?.maxTextLength) || 8000;
                                    const navFullText = textResult.text;
                                    const navTotalLength = navFullText.length;
                                    const navTotalSlices = Math.ceil(navTotalLength / navSliceSize) || 1;
                                    const navFirstSlice = navFullText.slice(0, navSliceSize);
                                    // Build pagination hint if page is long
                                    const navPaginationHint = navTotalSlices > 1
                                        ? `\n📄 Showing first ${navSliceSize.toLocaleString()} of ${navTotalLength.toLocaleString()} chars (${navTotalSlices} slices available)\n💡 Get more: browser_getVisibleText({slice: 1}) or browser_searchVisibleText({query: "keyword"})`
                                        : '';
                                    visibleText = `\n\n--- Page Content ---${navPaginationHint}\n${navFirstSlice}`;
                                }
                            }
                            catch (e) {
                                // Ignore text extraction errors, just return navigation success
                            }
                        }
                        return {
                            content: [{
                                    type: 'text',
                                    text: `✓ Navigated to ${args?.url}${result.title ? `\nPage title: "${result.title}"` : ''}${visibleText}`,
                                }],
                        };
                    }
                    case 'browser_screenshot':
                        result = await this.browserProxyCall('/browser/screenshot', 'POST', {
                            selector: args?.selector,
                            fullPage: args?.fullPage,
                            tabId: args?.tabId,
                            browser: args?.browser,
                        });
                        if (result.error) {
                            return {
                                content: [{ type: 'text', text: `Error: ${result.error}` }],
                                isError: true,
                            };
                        }
                        // Return the screenshot as base64 image
                        if (result.screenshot) {
                            return {
                                content: [{
                                        type: 'image',
                                        data: result.screenshot,
                                        mimeType: 'image/png',
                                    }],
                            };
                        }
                        return {
                            content: [{
                                    type: 'text',
                                    text: `Screenshot captured${args?.selector ? ` of element: ${args.selector}` : ''}`,
                                }],
                        };
                    case 'browser_go_back':
                        result = await this.browserProxyCall('/browser/goBack', 'POST', {
                            tabId: args?.tabId,
                            browser: args?.browser,
                        });
                        if (result.error) {
                            return {
                                content: [{ type: 'text', text: `Error: ${result.error}` }],
                                isError: true,
                            };
                        }
                        return {
                            content: [{
                                    type: 'text',
                                    text: `✓ Navigated back${result.url ? ` to ${result.url}` : ''}`,
                                }],
                        };
                    case 'browser_go_forward':
                        result = await this.browserProxyCall('/browser/goForward', 'POST', {
                            tabId: args?.tabId,
                            browser: args?.browser,
                        });
                        if (result.error) {
                            return {
                                content: [{ type: 'text', text: `Error: ${result.error}` }],
                                isError: true,
                            };
                        }
                        return {
                            content: [{
                                    type: 'text',
                                    text: `✓ Navigated forward${result.url ? ` to ${result.url}` : ''}`,
                                }],
                        };
                    case 'browser_get_visible_html': {
                        // Get ALL HTML from the page (request large maxLength)
                        result = await this.browserProxyCall('/browser/getVisibleHtml', 'POST', {
                            selector: args?.selector,
                            removeScripts: args?.removeScripts !== false,
                            removeStyles: args?.removeStyles || false,
                            cleanHtml: args?.cleanHtml !== false, // Default to clean HTML
                            maxLength: 500000, // Get all HTML, we'll slice it locally
                            tabId: args?.tabId,
                            browser: args?.browser,
                        });
                        if (result.error) {
                            return {
                                content: [{ type: 'text', text: `Error: ${result.error}` }],
                                isError: true,
                            };
                        }
                        // Implement local pagination/slicing
                        const htmlSliceSize = Number(args?.sliceSize) || 15000;
                        const htmlSliceIndex = Number(args?.slice) || 0;
                        const fullHtml = result.html || result.content || '';
                        const htmlTotalLength = fullHtml.length;
                        const htmlTotalSlices = Math.ceil(htmlTotalLength / htmlSliceSize) || 1;
                        const htmlStartIdx = htmlSliceIndex * htmlSliceSize;
                        const htmlEndIdx = Math.min(htmlStartIdx + htmlSliceSize, htmlTotalLength);
                        const htmlSliceText = fullHtml.slice(htmlStartIdx, htmlEndIdx);
                        const htmlHasMore = htmlEndIdx < htmlTotalLength;
                        // Build pagination info
                        const htmlPaginationInfo = htmlTotalSlices > 1
                            ? `<!-- 📄 Slice ${htmlSliceIndex + 1} of ${htmlTotalSlices} (${htmlTotalLength.toLocaleString()} total chars)${htmlHasMore ? ` | Get more: browser_get_visible_html({slice: ${htmlSliceIndex + 1}})` : ' | End of content'} -->\n`
                            : '';
                        return {
                            content: [{
                                    type: 'text',
                                    text: htmlPaginationInfo + htmlSliceText,
                                }],
                        };
                    }
                    case 'browser_hover':
                        result = await this.browserProxyCall('/browser/hover', 'POST', {
                            selector: args?.selector,
                            tabId: args?.tabId,
                            browser: args?.browser,
                        });
                        if (result.error) {
                            return {
                                content: [{ type: 'text', text: `Error: ${result.error}` }],
                                isError: true,
                            };
                        }
                        return {
                            content: [{
                                    type: 'text',
                                    text: `✓ Hovering over element: ${args?.selector}`,
                                }],
                        };
                    case 'browser_drag':
                        result = await this.browserProxyCall('/browser/drag', 'POST', {
                            sourceSelector: args?.sourceSelector,
                            targetSelector: args?.targetSelector,
                            tabId: args?.tabId,
                            browser: args?.browser,
                        });
                        if (result.error) {
                            return {
                                content: [{ type: 'text', text: `Error: ${result.error}` }],
                                isError: true,
                            };
                        }
                        return {
                            content: [{
                                    type: 'text',
                                    text: `✓ Dragged element from ${args?.sourceSelector} to ${args?.targetSelector}`,
                                }],
                        };
                    case 'browser_press_key':
                        result = await this.browserProxyCall('/browser/pressKey', 'POST', {
                            key: args?.key,
                            selector: args?.selector,
                            tabId: args?.tabId,
                            browser: args?.browser,
                        });
                        if (result.error) {
                            return {
                                content: [{ type: 'text', text: `Error: ${result.error}` }],
                                isError: true,
                            };
                        }
                        return {
                            content: [{
                                    type: 'text',
                                    text: `✓ Pressed key: ${args?.key}${args?.selector ? ` on element ${args.selector}` : ''}`,
                                }],
                        };
                    case 'browser_upload_file':
                        result = await this.browserProxyCall('/browser/uploadFile', 'POST', {
                            selector: args?.selector,
                            filePath: args?.filePath,
                            tabId: args?.tabId,
                            browser: args?.browser,
                        });
                        if (result.error) {
                            return {
                                content: [{ type: 'text', text: `Error: ${result.error}` }],
                                isError: true,
                            };
                        }
                        return {
                            content: [{
                                    type: 'text',
                                    text: `✓ Uploaded file ${args?.filePath} to ${args?.selector}`,
                                }],
                        };
                    case 'browser_save_as_pdf':
                        result = await this.browserProxyCall('/browser/saveAsPdf', 'POST', {
                            outputPath: args?.outputPath,
                            filename: args?.filename || 'page.pdf',
                            format: args?.format || 'A4',
                            printBackground: args?.printBackground !== false,
                            tabId: args?.tabId,
                            browser: args?.browser,
                        });
                        if (result.error) {
                            return {
                                content: [{ type: 'text', text: `Error: ${result.error}` }],
                                isError: true,
                            };
                        }
                        return {
                            content: [{
                                    type: 'text',
                                    text: `✓ Saved page as PDF: ${result.path || `${args?.outputPath}/${args?.filename || 'page.pdf'}`}`,
                                }],
                        };
                    // Filesystem tools
                    case 'fs_list':
                    case 'fs_read':
                    case 'fs_read_range':
                    case 'fs_write':
                    case 'fs_delete':
                    case 'fs_move':
                    case 'fs_search':
                    case 'fs_grep':
                    case 'fs_patch':
                        return await this.handleFilesystemTool(name, args);
                    // Shell tools
                    case 'shell_exec':
                    case 'shell_start_session':
                    case 'shell_send_input':
                    case 'shell_stop_session':
                        return await this.handleShellTool(name, args);
                    default:
                        throw new Error(`Unknown tool: ${name}`);
                }
            }
            catch (error) {
                return {
                    content: [{
                            type: 'text',
                            text: `Error: ${error.message}`,
                        }],
                    isError: true,
                };
            }
        });
    }
    /**
     * Handle filesystem tool calls - proxies to MCPEyes.app HTTP server
     */
    async handleFilesystemTool(name, args) {
        // Check if tool is enabled
        if (!this.toolRegistry.isToolEnabled(name)) {
            return {
                content: [{ type: 'text', text: `Tool ${name} is disabled` }],
                isError: true,
            };
        }
        try {
            // Map tool names to HTTP endpoints
            const endpointMap = {
                'fs_list': '/fs/list',
                'fs_read': '/fs/read',
                'fs_read_range': '/fs/read_range',
                'fs_write': '/fs/write',
                'fs_delete': '/fs/delete',
                'fs_move': '/fs/move',
                'fs_search': '/fs/search',
                'fs_grep': '/fs/grep',
                'fs_patch': '/fs/patch',
            };
            const endpoint = endpointMap[name];
            if (!endpoint) {
                throw new Error(`Unknown filesystem tool: ${name}`);
            }
            // Proxy to MCPEyes.app HTTP server
            const result = await this.proxyCall(endpoint, 'POST', args);
            if (result.error) {
                throw new Error(result.error);
            }
            // Format response based on tool type
            switch (name) {
                case 'fs_list':
                    return {
                        content: [{
                                type: 'text',
                                text: `Found ${result.entries?.length || 0} entries:\n\n` +
                                    (result.entries || []).map((entry) => `${entry.type === 'directory' ? '📁' : '📄'} ${path_1.default.basename(entry.path)}${entry.size ? ` (${entry.size} bytes)` : ''}`).join('\n'),
                            }],
                    };
                case 'fs_read':
                    return {
                        content: [{
                                type: 'text',
                                text: `File: ${path_1.default.basename(result.path)}\nSize: ${result.size} bytes${result.truncated ? ' (truncated)' : ''}\n\nContent:\n${result.content}`,
                            }],
                    };
                case 'fs_read_range':
                    return {
                        content: [{
                                type: 'text',
                                text: `File: ${path_1.default.basename(result.path)}\nLines ${result.start_line}-${result.end_line} of ${result.total_lines}:\n\n${result.content}`,
                            }],
                    };
                case 'fs_write':
                    return {
                        content: [{
                                type: 'text',
                                text: `Wrote ${result.bytes_written} bytes to ${path_1.default.basename(result.path)}`,
                            }],
                    };
                case 'fs_delete':
                    return {
                        content: [{
                                type: 'text',
                                text: result.deleted ? `Deleted ${path_1.default.basename(result.path)}` : `Failed to delete ${path_1.default.basename(result.path)}`,
                            }],
                    };
                case 'fs_move':
                    return {
                        content: [{
                                type: 'text',
                                text: result.moved ? `Moved ${path_1.default.basename(result.from)} to ${path_1.default.basename(result.to)}` : `Failed to move`,
                            }],
                    };
                case 'fs_search':
                    return {
                        content: [{
                                type: 'text',
                                text: `Found ${result.matches?.length || 0} matches:\n\n` +
                                    (result.matches || []).map((match) => `${match.type === 'directory' ? '📁' : '📄'} ${match.path}`).join('\n'),
                            }],
                    };
                case 'fs_grep':
                    return {
                        content: [{
                                type: 'text',
                                text: `Found ${result.matches?.length || 0} matches:\n\n` +
                                    (result.matches || []).map((match) => `${path_1.default.basename(match.path)}:${match.line}: ${match.text?.trim() || ''}`).join('\n'),
                            }],
                    };
                case 'fs_patch':
                    return {
                        content: [{
                                type: 'text',
                                text: `Applied ${result.operations_applied} operations to ${path_1.default.basename(result.path)}${result.preview ? '\n\nPreview:\n' + result.preview.map((p) => `${p.operation}: ${p.changed ? 'changed' : 'no change'}`).join('\n') : ''}`,
                            }],
                    };
                default:
                    return {
                        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
                    };
            }
        }
        catch (error) {
            return {
                content: [{
                        type: 'text',
                        text: `Error: ${error.message}`,
                    }],
                isError: true,
            };
        }
    }
    /**
     * Handle shell tool calls - proxies to MCPEyes.app HTTP server
     */
    async handleShellTool(name, args) {
        // Check if tool is enabled
        if (!this.toolRegistry.isToolEnabled(name)) {
            return {
                content: [{ type: 'text', text: `Tool ${name} is disabled` }],
                isError: true,
            };
        }
        try {
            // Map tool names to HTTP endpoints
            const endpointMap = {
                'shell_exec': '/shell/exec',
                'shell_start_session': '/shell/start_session',
                'shell_send_input': '/shell/send_input',
                'shell_stop_session': '/shell/stop_session',
            };
            const endpoint = endpointMap[name];
            if (!endpoint) {
                throw new Error(`Unknown shell tool: ${name}`);
            }
            // Proxy to MCPEyes.app HTTP server
            const result = await this.proxyCall(endpoint, 'POST', args);
            if (result.error) {
                throw new Error(result.error);
            }
            // Format response based on tool type
            switch (name) {
                case 'shell_exec':
                    return {
                        content: [{
                                type: 'text',
                                text: `Exit code: ${result.exit_code}${result.truncated ? ' (output truncated)' : ''}\n\nSTDOUT:\n${result.stdout || '(empty)'}\n\nSTDERR:\n${result.stderr || '(empty)'}`,
                            }],
                    };
                case 'shell_start_session':
                    return {
                        content: [{
                                type: 'text',
                                text: `Started session ${result.session_id} (PID: ${result.pid})\nNote: Output will be streamed via MCP notifications.`,
                            }],
                    };
                case 'shell_send_input':
                    return {
                        content: [{
                                type: 'text',
                                text: `Sent ${result.bytes_written} bytes to session ${result.session_id}`,
                            }],
                    };
                case 'shell_stop_session':
                    return {
                        content: [{
                                type: 'text',
                                text: result.stopped ? `Stopped session ${result.session_id}` : `Failed to stop session`,
                            }],
                    };
                default:
                    return {
                        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
                    };
            }
        }
        catch (error) {
            return {
                content: [{
                        type: 'text',
                        text: `Error: ${error.message}`,
                    }],
                isError: true,
            };
        }
    }
    async run() {
        const transport = new stdio_js_1.StdioServerTransport();
        await this.server.connect(transport);
        console.error('MCP-Eyes Proxy Server running...');
    }
}
const proxyServer = new MCPProxyServer();
proxyServer.run().catch(console.error);
//# sourceMappingURL=mcp-proxy-server.js.map