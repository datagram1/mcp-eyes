#!/usr/bin/env node

/**
 * Browser Bridge Server for MCP-Eyes
 *
 * This server handles communication between the MCP proxy and browser extensions.
 * It supports multiple browsers: Firefox, Chrome, Safari, Edge.
 *
 * Each browser extension connects via WebSocket and identifies itself.
 * The MCP proxy can target specific browsers or use the default (last focused).
 */

import http from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { URL } from 'url';

const PORT = parseInt(process.env.BROWSER_BRIDGE_PORT || '3457', 10);

// Supported browser types
type BrowserType = 'firefox' | 'chrome' | 'safari' | 'edge' | 'unknown';

interface BrowserConnection {
  socket: WebSocket;
  browserType: BrowserType;
  browserName: string;
  connectedAt: Date;
  lastActivity: Date;
}

interface PendingCommand {
  id: string;
  action: string;
  payload: any;
  resolve: (result: any) => void;
  reject: (error: Error) => void;
  timeout: NodeJS.Timeout;
}

class BrowserBridgeServer {
  private httpServer: http.Server;
  private wss: WebSocketServer;

  // Map of browser type to connection
  private browserConnections: Map<BrowserType, BrowserConnection> = new Map();

  // Track which browser was most recently active (for default targeting)
  private defaultBrowser: BrowserType | null = null;

  private pendingCommands: Map<string, PendingCommand> = new Map();
  private commandIdCounter = 0;

  constructor() {
    this.httpServer = http.createServer(this.handleHttpRequest.bind(this));
    this.wss = new WebSocketServer({ server: this.httpServer });
    this.setupWebSocket();
  }

  private setupWebSocket(): void {
    this.wss.on('connection', (ws, req) => {
      console.log('[Browser Bridge] New connection from:', req.socket.remoteAddress);

      // Temporary connection until browser identifies itself
      let browserType: BrowserType = 'unknown';
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
            if (existing && existing.socket.readyState === WebSocket.OPEN) {
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
        } catch (err) {
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

  private detectBrowserType(identifier: string): BrowserType {
    const lower = identifier.toLowerCase();
    if (lower.includes('firefox')) return 'firefox';
    if (lower.includes('chrome') && !lower.includes('edge')) return 'chrome';
    if (lower.includes('safari') && !lower.includes('chrome')) return 'safari';
    if (lower.includes('edge') || lower.includes('edg/')) return 'edge';
    return 'unknown';
  }

  private getConnectedBrowsers(): { type: BrowserType; name: string; connected: boolean }[] {
    const browsers: { type: BrowserType; name: string; connected: boolean }[] = [];
    for (const [type, conn] of this.browserConnections.entries()) {
      browsers.push({
        type,
        name: conn.browserName,
        connected: conn.socket.readyState === WebSocket.OPEN,
      });
    }
    return browsers;
  }

  private handleExtensionMessage(message: any, browserType: BrowserType): void {
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
    } else {
      pending.resolve(response);
    }
  }

  private async sendToExtension(action: string, payload: any = {}, targetBrowser?: string): Promise<any> {
    // Determine which browser to use
    let browserType: BrowserType | null = null;

    if (targetBrowser) {
      // Use specified browser
      browserType = targetBrowser.toLowerCase() as BrowserType;
      if (!this.browserConnections.has(browserType)) {
        const connected = this.getConnectedBrowsers();
        throw new Error(
          `Browser "${targetBrowser}" not connected. ` +
          `Connected browsers: ${connected.length > 0 ? connected.map(b => b.type).join(', ') : 'none'}`
        );
      }
    } else {
      // Use default browser (most recently connected/active)
      browserType = this.defaultBrowser;
    }

    if (!browserType) {
      throw new Error('No browser extension connected. Start a browser with the MCP-Eyes extension installed.');
    }

    const conn = this.browserConnections.get(browserType);
    if (!conn || conn.socket.readyState !== WebSocket.OPEN) {
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

  private async handleHttpRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    // Enable CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
      res.writeHead(200);
      res.end();
      return;
    }

    const url = new URL(req.url || '/', `http://localhost:${PORT}`);
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
        const chunks: Buffer[] = [];
        for await (const chunk of req) {
          chunks.push(chunk);
        }
        const { browser } = JSON.parse(Buffer.concat(chunks).toString());
        const browserType = browser?.toLowerCase() as BrowserType;

        if (!this.browserConnections.has(browserType)) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: `Browser "${browser}" not connected` }));
          return;
        }

        this.defaultBrowser = browserType;
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, defaultBrowser: browserType }));
        return;
      } catch (err: any) {
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
    let body: any = {};
    if (req.method === 'POST') {
      try {
        const chunks: Buffer[] = [];
        for await (const chunk of req) {
          chunks.push(chunk);
        }
        const rawBody = Buffer.concat(chunks).toString();
        if (rawBody) {
          body = JSON.parse(rawBody);
        }
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid JSON body' }));
        return;
      }
    }

    try {
      const result = await this.handleBrowserCommand(path, body);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result));
    } catch (err: any) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
  }

  private async handleBrowserCommand(path: string, body: any): Promise<any> {
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

      default:
        throw new Error(`Unknown browser action: ${action}`);
    }
  }

  start(): void {
    this.httpServer.listen(PORT, '127.0.0.1', () => {
      console.log(`[Browser Bridge] Server running on http://127.0.0.1:${PORT}`);
      console.log('[Browser Bridge] Waiting for browser extension to connect via WebSocket...');
    });
  }
}

// Run the server
const server = new BrowserBridgeServer();
server.start();
