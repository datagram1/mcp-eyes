#!/usr/bin/env node
"use strict";
/**
 * Browser Bridge Server for MCP-Eyes
 *
 * This server handles communication between the MCP proxy and browser extensions.
 * It supports multiple browsers: Firefox, Chrome, Safari, Edge.
 *
 * Each browser extension connects via WebSocket and identifies itself.
 * The MCP proxy can target specific browsers or use the default (last focused).
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const http_1 = __importDefault(require("http"));
const ws_1 = require("ws");
const url_1 = require("url");
const PORT = parseInt(process.env.BROWSER_BRIDGE_PORT || '3457', 10);
class BrowserBridgeServer {
    httpServer;
    wss;
    // Map of browser type to connection
    browserConnections = new Map();
    // Track which browser was most recently active (for default targeting)
    defaultBrowser = null;
    pendingCommands = new Map();
    commandIdCounter = 0;
    constructor() {
        this.httpServer = http_1.default.createServer(this.handleHttpRequest.bind(this));
        this.wss = new ws_1.WebSocketServer({ server: this.httpServer });
        this.setupWebSocket();
    }
    setupWebSocket() {
        this.wss.on('connection', (ws, req) => {
            console.log('[Browser Bridge] New connection from:', req.socket.remoteAddress);
            // Temporary connection until browser identifies itself
            let browserType = 'unknown';
            let browserName = 'Unknown Browser';
            ws.on('message', (data) => {
                try {
                    const message = JSON.parse(data.toString());
                    // Handle browser identification
                    if (message.action === 'identify') {
                        browserType = this.detectBrowserType(message.browser || message.userAgent || '');
                        browserName = message.browserName || message.browser || browserType;
                        // Close existing connection for this browser type if any
                        const existing = this.browserConnections.get(browserType);
                        if (existing && existing.socket.readyState === ws_1.WebSocket.OPEN) {
                            console.log(`[Browser Bridge] Closing existing ${browserType} connection`);
                            existing.socket.close();
                        }
                        // Register this connection
                        this.browserConnections.set(browserType, {
                            socket: ws,
                            browserType,
                            browserName,
                            connectedAt: new Date(),
                            lastActivity: new Date(),
                        });
                        // Set as default browser
                        this.defaultBrowser = browserType;
                        console.log(`[Browser Bridge] ${browserName} (${browserType}) registered`);
                        ws.send(JSON.stringify({ id: message.id, response: { status: 'ok', registered: true } }));
                        return;
                    }
                    // Update last activity
                    const conn = this.browserConnections.get(browserType);
                    if (conn) {
                        conn.lastActivity = new Date();
                    }
                    this.handleExtensionMessage(message, browserType);
                }
                catch (err) {
                    console.error('[Browser Bridge] Invalid message from extension:', err);
                }
            });
            ws.on('close', () => {
                // Find and remove this connection
                for (const [type, conn] of this.browserConnections.entries()) {
                    if (conn.socket === ws) {
                        console.log(`[Browser Bridge] ${conn.browserName} (${type}) disconnected`);
                        this.browserConnections.delete(type);
                        // Update default browser if this was the default
                        if (this.defaultBrowser === type) {
                            const firstKey = this.browserConnections.keys().next();
                            this.defaultBrowser = firstKey.done ? null : firstKey.value;
                        }
                        break;
                    }
                }
            });
            ws.on('error', (err) => {
                console.error('[Browser Bridge] WebSocket error:', err);
            });
            // Ask browser to identify itself
            ws.send(JSON.stringify({ action: 'identify', id: 'init' }));
        });
    }
    detectBrowserType(identifier) {
        const lower = identifier.toLowerCase();
        if (lower.includes('firefox'))
            return 'firefox';
        if (lower.includes('chrome') && !lower.includes('edge'))
            return 'chrome';
        if (lower.includes('safari') && !lower.includes('chrome'))
            return 'safari';
        if (lower.includes('edge') || lower.includes('edg/'))
            return 'edge';
        return 'unknown';
    }
    getConnectedBrowsers() {
        const browsers = [];
        for (const [type, conn] of this.browserConnections.entries()) {
            browsers.push({
                type,
                name: conn.browserName,
                connected: conn.socket.readyState === ws_1.WebSocket.OPEN,
            });
        }
        return browsers;
    }
    handleExtensionMessage(message, browserType) {
        const { id, response, error } = message;
        if (!id) {
            console.log(`[Browser Bridge] Event from ${browserType}:`, message.event || message.action);
            return;
        }
        const pending = this.pendingCommands.get(id);
        if (!pending) {
            console.log(`[Browser Bridge] No pending command for id: ${id}`);
            return;
        }
        clearTimeout(pending.timeout);
        this.pendingCommands.delete(id);
        if (error) {
            pending.reject(new Error(error));
        }
        else {
            pending.resolve(response);
        }
    }
    async sendToExtension(action, payload = {}, targetBrowser) {
        // Determine which browser to use
        let browserType = null;
        if (targetBrowser) {
            // Use specified browser
            browserType = targetBrowser.toLowerCase();
            if (!this.browserConnections.has(browserType)) {
                const connected = this.getConnectedBrowsers();
                throw new Error(`Browser "${targetBrowser}" not connected. ` +
                    `Connected browsers: ${connected.length > 0 ? connected.map(b => b.type).join(', ') : 'none'}`);
            }
        }
        else {
            // Use default browser (most recently connected/active)
            browserType = this.defaultBrowser;
        }
        if (!browserType) {
            throw new Error('No browser extension connected. Start a browser with the MCP-Eyes extension installed.');
        }
        const conn = this.browserConnections.get(browserType);
        if (!conn || conn.socket.readyState !== ws_1.WebSocket.OPEN) {
            throw new Error(`Browser "${browserType}" is not connected.`);
        }
        return new Promise((resolve, reject) => {
            const id = `cmd_${++this.commandIdCounter}`;
            const timeout = setTimeout(() => {
                this.pendingCommands.delete(id);
                reject(new Error(`Command timeout - ${browserType} did not respond`));
            }, 30000);
            this.pendingCommands.set(id, { id, action, payload, resolve, reject, timeout });
            conn.socket.send(JSON.stringify({
                id,
                action,
                payload,
            }));
        });
    }
    async handleHttpRequest(req, res) {
        // Enable CORS
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
        if (req.method === 'OPTIONS') {
            res.writeHead(200);
            res.end();
            return;
        }
        const url = new url_1.URL(req.url || '/', `http://localhost:${PORT}`);
        const path = url.pathname;
        // Health check
        if (path === '/health') {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                status: 'ok',
                connectedBrowsers: this.getConnectedBrowsers(),
                defaultBrowser: this.defaultBrowser,
            }));
            return;
        }
        // List connected browsers
        if (path === '/browsers') {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                browsers: this.getConnectedBrowsers(),
                defaultBrowser: this.defaultBrowser,
            }));
            return;
        }
        // Set default browser
        if (path === '/browser/setDefault' && req.method === 'POST') {
            try {
                const chunks = [];
                for await (const chunk of req) {
                    chunks.push(chunk);
                }
                const { browser } = JSON.parse(Buffer.concat(chunks).toString());
                const browserType = browser?.toLowerCase();
                if (!this.browserConnections.has(browserType)) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: `Browser "${browser}" not connected` }));
                    return;
                }
                this.defaultBrowser = browserType;
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true, defaultBrowser: browserType }));
                return;
            }
            catch (err) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: err.message }));
                return;
            }
        }
        // All browser endpoints require POST with JSON body
        if (!path.startsWith('/browser/')) {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Not found' }));
            return;
        }
        // Parse request body
        let body = {};
        if (req.method === 'POST') {
            try {
                const chunks = [];
                for await (const chunk of req) {
                    chunks.push(chunk);
                }
                const rawBody = Buffer.concat(chunks).toString();
                if (rawBody) {
                    body = JSON.parse(rawBody);
                }
            }
            catch (err) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Invalid JSON body' }));
                return;
            }
        }
        try {
            const result = await this.handleBrowserCommand(path, body);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(result));
        }
        catch (err) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: err.message }));
        }
    }
    async handleBrowserCommand(path, body) {
        const action = path.replace('/browser/', '');
        const targetBrowser = body.browser; // Optional: specify which browser to target
        switch (action) {
            case 'getTabs':
                return await this.sendToExtension('getTabs', {}, targetBrowser);
            case 'getActiveTab':
                return await this.sendToExtension('getActiveTab', {}, targetBrowser);
            case 'focusTab':
                return await this.sendToExtension('focusTab', { tabId: body.tabId }, targetBrowser);
            case 'createTab':
                return await this.sendToExtension('createTab', { url: body.url }, targetBrowser);
            case 'closeTab':
                return await this.sendToExtension('closeTab', { tabId: body.tabId }, targetBrowser);
            case 'getPageInfo':
                return await this.sendToExtension('getPageInfo', { tabId: body.tabId }, targetBrowser);
            case 'getInteractiveElements':
                return await this.sendToExtension('getInteractiveElements', { tabId: body.tabId }, targetBrowser);
            case 'getPageContext':
                return await this.sendToExtension('getPageContext', { tabId: body.tabId }, targetBrowser);
            case 'clickElement':
                return await this.sendToExtension('clickElement', {
                    selector: body.selector,
                    tabId: body.tabId,
                }, targetBrowser);
            case 'fillElement':
                return await this.sendToExtension('fillElement', {
                    selector: body.selector,
                    value: body.value,
                    tabId: body.tabId,
                    simulateTyping: body.simulateTyping !== false,
                    clearFirst: body.clearFirst !== false,
                }, targetBrowser);
            case 'getElementForNativeInput':
                return await this.sendToExtension('getElementForNativeInput', {
                    selector: body.selector,
                    tabId: body.tabId,
                }, targetBrowser);
            case 'scrollTo':
                return await this.sendToExtension('scrollTo', {
                    selector: body.selector,
                    x: body.x,
                    y: body.y,
                    tabId: body.tabId,
                }, targetBrowser);
            case 'executeScript':
                return await this.sendToExtension('executeScript', {
                    script: body.script,
                    tabId: body.tabId,
                }, targetBrowser);
            case 'getFormData':
                return await this.sendToExtension('getFormData', { tabId: body.tabId }, targetBrowser);
            case 'setWatchMode':
                return await this.sendToExtension('setWatchMode', {
                    enabled: body.enabled,
                    tabId: body.tabId,
                }, targetBrowser);
            // ========== NEW TOOL ROUTES ==========
            case 'getVisibleText':
                return await this.sendToExtension('getVisibleText', {
                    maxLength: body.maxLength,
                    tabId: body.tabId,
                }, targetBrowser);
            case 'waitForSelector':
                return await this.sendToExtension('waitForSelector', {
                    selector: body.selector,
                    timeout: body.timeout,
                    tabId: body.tabId,
                }, targetBrowser);
            case 'waitForPageLoad':
                return await this.sendToExtension('waitForPageLoad', {
                    timeout: body.timeout,
                    tabId: body.tabId,
                }, targetBrowser);
            case 'selectOption':
                return await this.sendToExtension('selectOption', {
                    selector: body.selector,
                    value: body.value,
                    tabId: body.tabId,
                }, targetBrowser);
            case 'isElementVisible':
                return await this.sendToExtension('isElementVisible', {
                    selector: body.selector,
                    tabId: body.tabId,
                }, targetBrowser);
            case 'getConsoleLogs':
                return await this.sendToExtension('getConsoleLogs', {
                    filter: body.filter,
                    clear: body.clear,
                    tabId: body.tabId,
                }, targetBrowser);
            case 'getNetworkRequests':
                return await this.sendToExtension('getNetworkRequests', {
                    filter: body.filter,
                    clear: body.clear,
                    tabId: body.tabId,
                }, targetBrowser);
            case 'getLocalStorage':
                return await this.sendToExtension('getLocalStorage', {
                    tabId: body.tabId,
                }, targetBrowser);
            case 'getCookies':
                return await this.sendToExtension('getCookies', {
                    tabId: body.tabId,
                }, targetBrowser);
            // ========== ENHANCED TOOLS ==========
            case 'inspectCurrentPage':
                return await this.sendToExtension('inspectCurrentPage', {
                    tabId: body.tabId,
                    includeScreenshot: body.includeScreenshot !== false, // default true
                    includeOCR: body.includeOCR || false, // default false
                }, targetBrowser);
            case 'getUIElements':
                return await this.sendToExtension('getUIElements', {
                    tabId: body.tabId,
                }, targetBrowser);
            case 'fillFormField':
                return await this.sendToExtension('fillFormField', {
                    label: body.label,
                    value: body.value,
                    tabId: body.tabId,
                }, targetBrowser);
            // ========== NEW ENHANCED TOOLS ==========
            case 'findTabByUrl':
                return await this.sendToExtension('findTabByUrl', {
                    urlPattern: body.urlPattern,
                }, targetBrowser);
            case 'clickByText':
                return await this.sendToExtension('clickByText', {
                    text: body.text,
                    index: body.index || 0,
                    elementType: body.elementType || 'any',
                    waitForNavigation: body.waitForNavigation || false,
                    tabId: body.tabId,
                }, targetBrowser);
            case 'clickMultiple':
                return await this.sendToExtension('clickMultiple', {
                    selectors: body.selectors,
                    delayMs: body.delayMs || 100,
                    tabId: body.tabId,
                }, targetBrowser);
            case 'getFormStructure':
                return await this.sendToExtension('getFormStructure', {
                    tabId: body.tabId,
                }, targetBrowser);
            case 'answerQuestions':
                return await this.sendToExtension('answerQuestions', {
                    answers: body.answers,
                    defaultAnswer: body.defaultAnswer,
                    tabId: body.tabId,
                }, targetBrowser);
            // ========== LLM INTROSPECTION TOOLS ==========
            case 'listInteractiveElements':
                return await this.sendToExtension('listInteractiveElements', {
                    tabId: body.tabId,
                    includeHidden: body.includeHidden || false,
                    maxElements: body.maxElements || 200,
                    filterType: body.filterType || null,
                    searchText: body.searchText || null,
                    includeShadowDOM: body.includeShadowDOM !== false, // default true
                    includeIframes: body.includeIframes !== false, // default true
                }, targetBrowser);
            case 'clickElementWithDebug':
                return await this.sendToExtension('clickElementWithDebug', {
                    selector: body.selector,
                    tabId: body.tabId,
                }, targetBrowser);
            case 'findElementWithDebug':
                return await this.sendToExtension('findElementWithDebug', {
                    selector: body.selector,
                    tabId: body.tabId,
                }, targetBrowser);
            // ========== COMBO-BOX TOOLS ==========
            case 'getDropdownOptions':
                return await this.sendToExtension('getDropdownOptions', {
                    selector: body.selector,
                    waitMs: body.waitMs,
                    closeAfter: body.closeAfter,
                    tabId: body.tabId,
                }, targetBrowser);
            // ========== BROWSER AUTOMATION TOOLS (Playwright-style) ==========
            case 'navigate':
                return await this.sendToExtension('navigate', {
                    url: body.url,
                    tabId: body.tabId,
                    waitUntil: body.waitUntil,
                    timeout: body.timeout,
                }, targetBrowser);
            case 'screenshot':
                return await this.sendToExtension('screenshot', {
                    selector: body.selector,
                    fullPage: body.fullPage,
                    tabId: body.tabId,
                }, targetBrowser);
            case 'goBack':
                return await this.sendToExtension('goBack', {
                    tabId: body.tabId,
                }, targetBrowser);
            case 'goForward':
                return await this.sendToExtension('goForward', {
                    tabId: body.tabId,
                }, targetBrowser);
            case 'getVisibleHtml':
                return await this.sendToExtension('getVisibleHtml', {
                    selector: body.selector,
                    removeScripts: body.removeScripts,
                    removeStyles: body.removeStyles,
                    cleanHtml: body.cleanHtml,
                    maxLength: body.maxLength,
                    tabId: body.tabId,
                }, targetBrowser);
            case 'hover':
                return await this.sendToExtension('hover', {
                    selector: body.selector,
                    tabId: body.tabId,
                }, targetBrowser);
            case 'drag':
                return await this.sendToExtension('drag', {
                    sourceSelector: body.sourceSelector,
                    targetSelector: body.targetSelector,
                    tabId: body.tabId,
                }, targetBrowser);
            case 'pressKey':
                return await this.sendToExtension('pressKey', {
                    key: body.key,
                    selector: body.selector,
                    tabId: body.tabId,
                }, targetBrowser);
            case 'uploadFile':
                return await this.sendToExtension('uploadFile', {
                    selector: body.selector,
                    filePath: body.filePath,
                    tabId: body.tabId,
                }, targetBrowser);
            case 'saveAsPdf':
                return await this.sendToExtension('saveAsPdf', {
                    outputPath: body.outputPath,
                    filename: body.filename,
                    format: body.format,
                    printBackground: body.printBackground,
                    tabId: body.tabId,
                }, targetBrowser);
            default:
                throw new Error(`Unknown browser action: ${action}`);
        }
    }
    start() {
        this.httpServer.listen(PORT, '127.0.0.1', () => {
            console.log(`[Browser Bridge] Server running on http://127.0.0.1:${PORT}`);
            console.log('[Browser Bridge] Waiting for browser extension to connect via WebSocket...');
        });
    }
}
// Run the server
const server = new BrowserBridgeServer();
server.start();
//# sourceMappingURL=browser-bridge-server.js.map