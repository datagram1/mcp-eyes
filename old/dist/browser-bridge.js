"use strict";
/**
 * MCP Eyes Browser Bridge
 *
 * Provides tools for the MCP server to interact with browsers via:
 * 1. Native messaging (Chrome/Firefox extension)
 * 2. AppleScript (Safari on macOS)
 *
 * The bridge can operate in two modes:
 * - Natural mode: Returns screen coordinates for mouse/keyboard control
 * - Silent mode: Directly injects clicks/fills via JavaScript
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.SafariBridge = exports.BrowserBridge = void 0;
exports.createBrowserBridge = createBrowserBridge;
exports.getGlobalBrowserBridge = getGlobalBrowserBridge;
exports.startGlobalBrowserBridge = startGlobalBrowserBridge;
const net = __importStar(require("net"));
const fs = __importStar(require("fs"));
const run_1 = require("@jxa/run");
const events_1 = require("events");
/**
 * Browser Bridge - connects to browser extensions via Unix socket or queue file
 */
class BrowserBridge extends events_1.EventEmitter {
    socketPath;
    timeout;
    socket = null;
    server = null;
    connected = false;
    pendingRequests = new Map();
    requestIdCounter = 0;
    buffer = '';
    serverRunning = false;
    constructor(config = {}) {
        super();
        this.socketPath = config.socketPath || '/tmp/mcp-eyes.sock';
        this.timeout = config.timeout || 10000;
    }
    /**
     * Start the socket server that the native messaging host connects to
     */
    async startServer() {
        if (this.serverRunning) {
            console.error('[BrowserBridge] Server already running');
            return;
        }
        return new Promise((resolve, reject) => {
            // Remove existing socket file if present
            try {
                if (fs.existsSync(this.socketPath)) {
                    fs.unlinkSync(this.socketPath);
                }
            }
            catch (e) {
                // Ignore
            }
            this.server = net.createServer((socket) => {
                console.error('[BrowserBridge] Client connected');
                this.socket = socket;
                this.connected = true;
                this.emit('clientConnected');
                socket.on('data', (data) => {
                    this.handleData(data);
                });
                socket.on('close', () => {
                    console.error('[BrowserBridge] Client disconnected');
                    this.connected = false;
                    this.socket = null;
                    this.emit('clientDisconnected');
                });
                socket.on('error', (error) => {
                    console.error('[BrowserBridge] Socket error:', error);
                });
            });
            this.server.listen(this.socketPath, () => {
                this.serverRunning = true;
                console.error(`[BrowserBridge] Server listening on ${this.socketPath}`);
                // Make socket accessible
                try {
                    fs.chmodSync(this.socketPath, 0o777);
                }
                catch (e) {
                    // Ignore
                }
                resolve();
            });
            this.server.on('error', (err) => {
                console.error('[BrowserBridge] Server error:', err);
                reject(err);
            });
        });
    }
    /**
     * Stop the socket server
     */
    async stopServer() {
        if (this.socket) {
            this.socket.destroy();
            this.socket = null;
        }
        if (this.server) {
            return new Promise((resolve) => {
                this.server.close(() => {
                    this.serverRunning = false;
                    console.error('[BrowserBridge] Server stopped');
                    resolve();
                });
            });
        }
    }
    handleData(data) {
        this.buffer += data.toString();
        let newlineIndex;
        while ((newlineIndex = this.buffer.indexOf('\n')) !== -1) {
            const line = this.buffer.substring(0, newlineIndex);
            this.buffer = this.buffer.substring(newlineIndex + 1);
            if (line.trim()) {
                try {
                    const message = JSON.parse(line);
                    this.handleMessage(message);
                }
                catch (error) {
                    console.error('[BrowserBridge] Failed to parse message:', error);
                }
            }
        }
    }
    handleMessage(message) {
        // If this is a response to a request we sent
        if (message.requestId) {
            const pending = this.pendingRequests.get(message.requestId);
            if (pending) {
                clearTimeout(pending.timeout);
                this.pendingRequests.delete(message.requestId);
                if (message.error) {
                    pending.reject(new Error(message.error));
                }
                else {
                    pending.resolve(message.response || message);
                }
                return;
            }
        }
        // If this is an event from the browser (pageLoaded, domChanged, etc.)
        if (message.event) {
            const event = {
                event: message.event,
                tabId: message.tabId,
                url: message.url,
                title: message.title,
                payload: message.payload,
                timestamp: Date.now(),
            };
            console.error(`[BrowserBridge] Browser event: ${message.event}`);
            this.emit('browserEvent', event);
            return;
        }
        // Unknown message
        console.error('[BrowserBridge] Unknown message type:', message);
    }
    /**
     * Send a command to the browser extension
     */
    async send(action, payload = {}, tabId) {
        // Try socket connection first
        if (this.connected && this.socket) {
            return this.sendViaSocket(action, payload, tabId);
        }
        // Fall back to queue file for Chrome/Firefox
        return this.sendViaQueue(action, payload, tabId);
    }
    async sendViaSocket(action, payload, tabId) {
        return new Promise((resolve, reject) => {
            const requestId = ++this.requestIdCounter;
            const timeout = setTimeout(() => {
                this.pendingRequests.delete(requestId);
                reject(new Error(`Request timeout: ${action}`));
            }, this.timeout);
            this.pendingRequests.set(requestId, { resolve, reject, timeout });
            const message = JSON.stringify({
                action,
                payload,
                tabId,
                requestId
            }) + '\n';
            this.socket.write(message);
        });
    }
    async sendViaQueue(action, payload, tabId) {
        // Queue-based fallback - write request to file and poll for response
        const requestId = ++this.requestIdCounter;
        const requestFile = '/tmp/mcp-eyes-request.json';
        const responseFile = '/tmp/mcp-eyes-response.json';
        const request = {
            action,
            payload,
            tabId,
            requestId,
            timestamp: Date.now()
        };
        fs.writeFileSync(requestFile, JSON.stringify(request));
        // Poll for response
        return new Promise((resolve, reject) => {
            const startTime = Date.now();
            const poll = () => {
                if (Date.now() - startTime > this.timeout) {
                    reject(new Error(`Request timeout: ${action}`));
                    return;
                }
                if (fs.existsSync(responseFile)) {
                    try {
                        const response = JSON.parse(fs.readFileSync(responseFile, 'utf-8'));
                        if (response.requestId === requestId) {
                            fs.unlinkSync(responseFile);
                            if (response.error) {
                                reject(new Error(response.error));
                            }
                            else {
                                resolve(response.response || response);
                            }
                            return;
                        }
                    }
                    catch (e) {
                        // Response file not ready yet
                    }
                }
                setTimeout(poll, 100);
            };
            poll();
        });
    }
    /**
     * Get all interactive elements on the current page
     */
    async getInteractiveElements(tabId) {
        return this.send('getInteractiveElements', {}, tabId);
    }
    /**
     * Get page information
     */
    async getPageInfo(tabId) {
        return this.send('getPageInfo', {}, tabId);
    }
    /**
     * Get combined page context (elements + page info)
     */
    async getPageContext(tabId) {
        return this.send('getPageContext', {}, tabId);
    }
    /**
     * Click an element by selector (silent mode)
     */
    async clickElement(selector, tabId) {
        return this.send('clickElement', { selector }, tabId);
    }
    /**
     * Fill an input element (silent mode)
     */
    async fillElement(selector, value, tabId) {
        return this.send('fillElement', { selector, value }, tabId);
    }
    /**
     * Scroll to an element or direction
     */
    async scrollTo(target, tabId) {
        return this.send('scrollTo', { target }, tabId);
    }
    /**
     * Execute JavaScript in the page context
     */
    async executeScript(code, tabId) {
        return this.send('executeScript', { code }, tabId);
    }
    /**
     * Get element at screen coordinates
     */
    async getElementAtPoint(x, y, tabId) {
        return this.send('getElementAtPoint', { x, y }, tabId);
    }
    /**
     * Get all forms on the page
     */
    async getFormData(tabId) {
        return this.send('getFormData', {}, tabId);
    }
    /**
     * Get all open browser tabs
     */
    async getTabs() {
        return this.send('getTabs');
    }
    /**
     * Get the active tab
     */
    async getActiveTab() {
        return this.send('getActiveTab');
    }
    /**
     * Focus a specific tab
     */
    async focusTab(tabId) {
        return this.send('focusTab', { tabId });
    }
    /**
     * Check if the extension is connected
     */
    async ping() {
        return this.send('ping');
    }
    /**
     * Disconnect from the browser
     */
    disconnect() {
        if (this.socket) {
            this.socket.destroy();
            this.socket = null;
            this.connected = false;
        }
    }
    /**
     * Check if connected to a browser
     */
    isConnected() {
        return this.connected;
    }
}
exports.BrowserBridge = BrowserBridge;
/**
 * Safari Bridge - uses AppleScript for Safari automation (macOS only)
 */
class SafariBridge {
    /**
     * Get page source from Safari
     */
    async getPageSource() {
        return (0, run_1.run)(() => {
            const safari = Application('Safari');
            const tab = safari.windows[0].currentTab;
            return tab.source();
        });
    }
    /**
     * Get current URL from Safari
     */
    async getURL() {
        return (0, run_1.run)(() => {
            const safari = Application('Safari');
            const tab = safari.windows[0].currentTab;
            return tab.url();
        });
    }
    /**
     * Get page title from Safari
     */
    async getTitle() {
        return (0, run_1.run)(() => {
            const safari = Application('Safari');
            const tab = safari.windows[0].currentTab;
            return tab.name();
        });
    }
    /**
     * Execute JavaScript in Safari
     */
    async executeScript(code) {
        return (0, run_1.run)((code) => {
            const safari = Application('Safari');
            const tab = safari.windows[0].currentTab;
            return safari.doJavaScript(code, { in: tab });
        }, code);
    }
    /**
     * Get interactive elements from Safari
     */
    async getInteractiveElements() {
        const script = `
      (function() {
        const elements = [];
        const interactiveSelectors = [
          'a[href]', 'button', 'input', 'select', 'textarea',
          '[role="button"]', '[role="link"]', '[onclick]',
          '[tabindex]:not([tabindex="-1"])'
        ];

        const allElements = document.querySelectorAll(interactiveSelectors.join(','));

        allElements.forEach((el, index) => {
          const rect = el.getBoundingClientRect();
          if (rect.width === 0 || rect.height === 0) return;
          if (rect.bottom < 0 || rect.top > window.innerHeight) return;

          const style = window.getComputedStyle(el);
          if (style.display === 'none' || style.visibility === 'hidden') return;

          let text = el.textContent?.trim().substring(0, 100) ||
                     el.getAttribute('aria-label') || '';

          elements.push({
            index,
            type: el.tagName.toLowerCase(),
            text,
            id: el.id || null,
            rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
            screenRect: {
              x: window.screenX + rect.left,
              y: window.screenY + (window.outerHeight - window.innerHeight) + rect.top,
              width: rect.width,
              height: rect.height,
              centerX: window.screenX + rect.left + rect.width / 2,
              centerY: window.screenY + (window.outerHeight - window.innerHeight) + rect.top + rect.height / 2
            }
          });
        });

        return JSON.stringify(elements);
      })()
    `;
        const result = await this.executeScript(script);
        return JSON.parse(result);
    }
    /**
     * Get page info from Safari
     */
    async getPageInfo() {
        const script = `
      JSON.stringify({
        url: window.location.href,
        title: document.title,
        domain: window.location.hostname,
        scrollPosition: { x: window.scrollX, y: window.scrollY },
        viewportSize: { width: window.innerWidth, height: window.innerHeight },
        documentSize: {
          width: document.documentElement.scrollWidth,
          height: document.documentElement.scrollHeight
        },
        browserWindow: {
          screenX: window.screenX,
          screenY: window.screenY,
          outerWidth: window.outerWidth,
          outerHeight: window.outerHeight,
          chromeHeight: window.outerHeight - window.innerHeight
        }
      })
    `;
        const result = await this.executeScript(script);
        return JSON.parse(result);
    }
    /**
     * Click an element in Safari
     */
    async clickElement(selector) {
        try {
            const script = `
        (function() {
          const el = document.querySelector('${selector.replace(/'/g, "\\'")}');
          if (!el) return JSON.stringify({ success: false, error: 'Element not found' });
          el.click();
          return JSON.stringify({ success: true });
        })()
      `;
            const result = await this.executeScript(script);
            return JSON.parse(result);
        }
        catch (error) {
            return { success: false, error: String(error) };
        }
    }
    /**
     * Fill an input in Safari
     */
    async fillElement(selector, value) {
        try {
            const escapedSelector = selector.replace(/'/g, "\\'");
            const escapedValue = value.replace(/'/g, "\\'");
            const script = `
        (function() {
          const el = document.querySelector('${escapedSelector}');
          if (!el) return JSON.stringify({ success: false, error: 'Element not found' });
          el.focus();
          el.value = '${escapedValue}';
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
          return JSON.stringify({ success: true });
        })()
      `;
            const result = await this.executeScript(script);
            return JSON.parse(result);
        }
        catch (error) {
            return { success: false, error: String(error) };
        }
    }
    /**
     * Scroll in Safari
     */
    async scrollTo(target) {
        let script;
        if (target === 'up') {
            script = 'window.scrollBy(0, -window.innerHeight * 0.8)';
        }
        else if (target === 'down') {
            script = 'window.scrollBy(0, window.innerHeight * 0.8)';
        }
        else if (target === 'top') {
            script = 'window.scrollTo(0, 0)';
        }
        else if (target === 'bottom') {
            script = 'window.scrollTo(0, document.documentElement.scrollHeight)';
        }
        else {
            script = `document.querySelector('${target.replace(/'/g, "\\'")}')?.scrollIntoView({ behavior: 'smooth', block: 'center' })`;
        }
        await this.executeScript(script);
        return { success: true };
    }
    /**
     * Navigate to a URL in Safari
     */
    async navigateTo(url) {
        await (0, run_1.run)((url) => {
            const safari = Application('Safari');
            const tab = safari.windows[0].currentTab;
            tab.url = url;
        }, url);
    }
    /**
     * Get all Safari tabs
     */
    async getTabs() {
        return (0, run_1.run)(() => {
            const safari = Application('Safari');
            const tabs = [];
            safari.windows().forEach((win, winIndex) => {
                win.tabs().forEach((tab, tabIndex) => {
                    tabs.push({
                        id: winIndex * 1000 + tabIndex,
                        url: tab.url(),
                        title: tab.name(),
                        active: tab === win.currentTab(),
                        windowId: winIndex,
                        index: tabIndex
                    });
                });
            });
            return tabs;
        });
    }
}
exports.SafariBridge = SafariBridge;
/**
 * Create a unified browser interface
 */
function createBrowserBridge(browser = 'chrome') {
    if (browser === 'safari') {
        return new SafariBridge();
    }
    return new BrowserBridge();
}
// Singleton instance for the MCP server
let globalBrowserBridge = null;
/**
 * Get the global browser bridge instance (creates one if not exists)
 */
function getGlobalBrowserBridge() {
    if (!globalBrowserBridge) {
        globalBrowserBridge = new BrowserBridge();
    }
    return globalBrowserBridge;
}
/**
 * Start the global browser bridge server
 */
async function startGlobalBrowserBridge() {
    const bridge = getGlobalBrowserBridge();
    await bridge.startServer();
    return bridge;
}
exports.default = BrowserBridge;
//# sourceMappingURL=browser-bridge.js.map