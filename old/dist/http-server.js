#!/usr/bin/env node
"use strict";
/**
 * HTTP Server wrapper for MCP-Eyes
 *
 * Run this directly from your terminal to inherit accessibility permissions.
 * Usage: npx ts-node src/http-server.ts
 * Or after build: node dist/http-server.js
 *
 * SECURITY:
 * - Requires API key authentication via MCP_EYES_API_KEY environment variable
 * - Binds to localhost only by default (set MCP_EYES_HOST=0.0.0.0 to expose)
 * - All requests must include Authorization: Bearer <api-key> header
 *
 * This server exposes MCP-Eyes functionality via HTTP endpoints,
 * bypassing the permission issues when running as an MCP subprocess.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const http_1 = __importDefault(require("http"));
const crypto_1 = __importDefault(require("crypto"));
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const url_1 = require("url");
// @ts-ignore
const screenshot_desktop_1 = __importDefault(require("screenshot-desktop"));
const nut_js_1 = require("@nut-tree-fork/nut-js");
const jxa_runner_js_1 = require("./jxa-runner.js");
const sharp_1 = __importDefault(require("sharp"));
const apple_window_manager_js_1 = require("./apple-window-manager.js");
const ocr_analyzer_js_1 = require("./ocr-analyzer.js");
const local_llm_analyzer_js_1 = require("./local-llm-analyzer.js");
const PORT = parseInt(process.env.MCP_EYES_PORT || '3456');
const HOST = process.env.MCP_EYES_HOST || '127.0.0.1'; // localhost only by default
const TOKEN_FILE = path_1.default.join(process.env.HOME || '/tmp', '.mcp-eyes-token');
// Generate or load API key
function getOrCreateApiKey() {
    // If provided via environment, use that
    if (process.env.MCP_EYES_API_KEY) {
        return process.env.MCP_EYES_API_KEY;
    }
    // Try to load existing key from token file
    try {
        if (fs_1.default.existsSync(TOKEN_FILE)) {
            const content = fs_1.default.readFileSync(TOKEN_FILE, 'utf-8');
            const existing = JSON.parse(content);
            if (existing.apiKey && existing.port === PORT && existing.host === HOST) {
                // Reuse existing key if port/host match
                console.log('📌 Reusing existing API key from token file');
                return existing.apiKey;
            }
        }
    }
    catch (err) {
        // Token file doesn't exist or is invalid, generate new key
    }
    // Generate a new random key
    const apiKey = crypto_1.default.randomBytes(32).toString('hex');
    // Save to token file for MCP client to read
    try {
        fs_1.default.writeFileSync(TOKEN_FILE, JSON.stringify({
            apiKey,
            port: PORT,
            host: HOST,
            createdAt: new Date().toISOString()
        }), { mode: 0o600 }); // Only owner can read
    }
    catch (err) {
        console.error('Warning: Could not save token file:', err);
    }
    return apiKey;
}
class MCPEyesHTTPServer {
    appleWindowManager;
    ocrAnalyzer;
    localLLMAnalyzer;
    currentApp = null;
    apiKey;
    constructor() {
        this.appleWindowManager = new apple_window_manager_js_1.AppleWindowManager();
        this.ocrAnalyzer = new ocr_analyzer_js_1.OCRAnalyzer();
        this.localLLMAnalyzer = new local_llm_analyzer_js_1.LocalLLMAnalyzer();
        this.apiKey = getOrCreateApiKey();
    }
    async listApplications() {
        // Use AppleScript which works when run from terminal
        const script = `
      tell application "System Events"
        set appList to ""
        repeat with proc in (every application process)
          set procName to name of proc
          set procBundle to bundle identifier of proc
          set procPID to unix id of proc
          set winBounds to "0,0,0,0"
          try
            set procWindows to windows of proc
            if (count of procWindows) > 0 then
              set win to item 1 of procWindows
              set winPos to position of win
              set winSize to size of win
              set winBounds to ((item 1 of winPos) as string) & "," & ((item 2 of winPos) as string) & "," & ((item 1 of winSize) as string) & "," & ((item 2 of winSize) as string)
            end if
          end try
          set appList to appList & procName & "|" & procBundle & "|" & procPID & "|" & winBounds & "\\n"
        end repeat
        return appList
      end tell
    `;
        const result = await (0, jxa_runner_js_1.runAppleScript)(script);
        const apps = [];
        for (const line of result.split('\n')) {
            if (!line.trim())
                continue;
            const [name, bundleId, pidStr, boundsStr] = line.split('|');
            if (!name || !bundleId)
                continue;
            const [x, y, width, height] = (boundsStr || '0,0,0,0').split(',').map(Number);
            apps.push({
                name: name.trim(),
                bundleId: bundleId.trim(),
                pid: parseInt(pidStr) || 0,
                bounds: { x: x || 0, y: y || 0, width: width || 0, height: height || 0 }
            });
        }
        return apps;
    }
    async focusApplication(identifier) {
        const script = `
      tell application "System Events"
        set targetProc to null
        repeat with proc in (every application process)
          if bundle identifier of proc is "${identifier}" or name of proc is "${identifier}" then
            set targetProc to proc
            exit repeat
          end if
        end repeat
        if targetProc is not null then
          set frontmost of targetProc to true
          return "success"
        else
          return "not found"
        end if
      end tell
    `;
        const result = await (0, jxa_runner_js_1.runAppleScript)(script);
        if (result === 'success') {
            // Update currentApp
            const apps = await this.listApplications();
            this.currentApp = apps.find(a => a.bundleId === identifier || a.name === identifier) || null;
            return true;
        }
        return false;
    }
    async screenshot(options = {}) {
        const padding = options.padding || 10;
        // Take screenshot
        const screenshotBuffer = await (0, screenshot_desktop_1.default)({ format: 'png' });
        // If we have a focused app, crop to its window
        if (this.currentApp && this.currentApp.bounds.width > 0) {
            const { x, y, width, height } = this.currentApp.bounds;
            const cropped = await (0, sharp_1.default)(screenshotBuffer)
                .extract({
                left: Math.max(0, x - padding),
                top: Math.max(0, y - padding),
                width: width + (padding * 2),
                height: height + (padding * 2)
            })
                .png()
                .toBuffer();
            return cropped.toString('base64');
        }
        return screenshotBuffer.toString('base64');
    }
    async click(x, y, button = 'left') {
        if (!this.currentApp) {
            throw new Error('No application focused. Call focusApplication first.');
        }
        const { bounds } = this.currentApp;
        const absX = bounds.x + (x * bounds.width);
        const absY = bounds.y + (y * bounds.height);
        await nut_js_1.mouse.setPosition({ x: Math.round(absX), y: Math.round(absY) });
        await nut_js_1.mouse.click(button === 'right' ? nut_js_1.Button.RIGHT : nut_js_1.Button.LEFT);
        return true;
    }
    async getClickableElements() {
        if (!this.currentApp) {
            return [];
        }
        return await this.appleWindowManager.getClickableElements(this.currentApp.name);
    }
    async typeText(text) {
        await nut_js_1.keyboard.type(text);
        return true;
    }
    async pressKey(key) {
        const keyMap = {
            'Enter': nut_js_1.Key.Enter,
            'Tab': nut_js_1.Key.Tab,
            'Escape': nut_js_1.Key.Escape,
            'Backspace': nut_js_1.Key.Backspace,
            'Delete': nut_js_1.Key.Delete,
            'ArrowUp': nut_js_1.Key.Up,
            'ArrowDown': nut_js_1.Key.Down,
            'ArrowLeft': nut_js_1.Key.Left,
            'ArrowRight': nut_js_1.Key.Right,
            'Space': nut_js_1.Key.Space,
        };
        const nutKey = keyMap[key];
        if (nutKey) {
            await nut_js_1.keyboard.pressKey(nutKey);
            await nut_js_1.keyboard.releaseKey(nutKey);
        }
        return true;
    }
    async analyzeWithOCR() {
        const screenshotBuffer = await (0, screenshot_desktop_1.default)({ format: 'png' });
        return await this.ocrAnalyzer.analyzeImage(screenshotBuffer);
    }
    async checkPermissions() {
        return await (0, jxa_runner_js_1.checkAccessibilityPermissions)();
    }
    createServer() {
        return http_1.default.createServer(async (req, res) => {
            const url = new url_1.URL(req.url || '/', `http://localhost:${PORT}`);
            const reqPath = url.pathname;
            // CORS headers
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
            res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
            res.setHeader('Content-Type', 'application/json');
            // Handle preflight
            if (req.method === 'OPTIONS') {
                res.writeHead(200);
                res.end();
                return;
            }
            // API key authentication (except for health check)
            if (reqPath !== '/health') {
                const authHeader = req.headers['authorization'];
                const providedKey = authHeader?.replace('Bearer ', '');
                if (!providedKey || providedKey !== this.apiKey) {
                    res.writeHead(401);
                    res.end(JSON.stringify({ error: 'Unauthorized. Include Authorization: Bearer <api-key> header.' }));
                    return;
                }
            }
            try {
                let body = '';
                if (req.method === 'POST') {
                    for await (const chunk of req) {
                        body += chunk;
                    }
                }
                const params = body ? JSON.parse(body) : {};
                let result;
                switch (reqPath) {
                    case '/health':
                        result = { status: 'ok', version: '1.1.15' };
                        break;
                    case '/permissions':
                        result = await this.checkPermissions();
                        break;
                    case '/listApplications':
                        result = await this.listApplications();
                        break;
                    case '/focusApplication':
                        if (!params.identifier) {
                            throw new Error('identifier is required');
                        }
                        result = await this.focusApplication(params.identifier);
                        break;
                    case '/screenshot':
                        const base64 = await this.screenshot(params);
                        result = { image: base64, format: 'png' };
                        break;
                    case '/click':
                        if (params.x === undefined || params.y === undefined) {
                            throw new Error('x and y coordinates are required');
                        }
                        result = await this.click(params.x, params.y, params.button);
                        break;
                    case '/getClickableElements':
                        result = await this.getClickableElements();
                        break;
                    case '/typeText':
                        if (!params.text) {
                            throw new Error('text is required');
                        }
                        result = await this.typeText(params.text);
                        break;
                    case '/pressKey':
                        if (!params.key) {
                            throw new Error('key is required');
                        }
                        result = await this.pressKey(params.key);
                        break;
                    case '/analyzeWithOCR':
                        result = await this.analyzeWithOCR();
                        break;
                    case '/currentApp':
                        result = this.currentApp;
                        break;
                    default:
                        res.writeHead(404);
                        res.end(JSON.stringify({ error: 'Not found', path: reqPath }));
                        return;
                }
                res.writeHead(200);
                res.end(JSON.stringify(result));
            }
            catch (error) {
                console.error(`Error handling ${reqPath}:`, error);
                res.writeHead(500);
                res.end(JSON.stringify({ error: error.message }));
            }
        });
    }
    async start() {
        // Check permissions first
        console.log('🎯 MCP-Eyes HTTP Server');
        console.log('=======================');
        console.log('');
        const permissions = await this.checkPermissions();
        if (permissions.hasPermission) {
            console.log('✅ Accessibility permissions: OK');
        }
        else {
            console.log('⚠️  Accessibility permissions: MISSING');
            console.log('   Grant Accessibility permission to iTerm/Terminal in System Settings');
        }
        console.log('');
        console.log('🔐 Security:');
        console.log(`   API Key: ${this.apiKey.substring(0, 8)}...${this.apiKey.substring(this.apiKey.length - 8)}`);
        console.log(`   Token file: ${TOKEN_FILE}`);
        console.log('   All requests require: Authorization: Bearer <api-key>');
        const server = this.createServer();
        server.listen(PORT, HOST, () => {
            console.log(`\n🚀 Server running at http://${HOST}:${PORT}`);
            console.log('\nEndpoints:');
            console.log('  GET  /health              - Health check (no auth required)');
            console.log('  GET  /permissions         - Check accessibility permissions');
            console.log('  GET  /listApplications    - List running apps with window bounds');
            console.log('  POST /focusApplication    - Focus an app (body: {identifier})');
            console.log('  POST /screenshot          - Take screenshot (body: {padding?})');
            console.log('  POST /click               - Click at position (body: {x, y, button?})');
            console.log('  GET  /getClickableElements - Get clickable UI elements');
            console.log('  POST /typeText            - Type text (body: {text})');
            console.log('  POST /pressKey            - Press key (body: {key})');
            console.log('  GET  /analyzeWithOCR      - Analyze screen with OCR');
            console.log('  GET  /currentApp          - Get currently focused app');
            console.log('\nPress Ctrl+C to stop');
        });
    }
}
// Start server
const server = new MCPEyesHTTPServer();
server.start().catch(console.error);
//# sourceMappingURL=http-server.js.map