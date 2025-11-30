#!/usr/bin/env node

/**
 * MCP-Eyes SSE Server
 *
 * Provides Server-Sent Events (SSE) transport for MCP protocol.
 * Compatible with Open WebUI and other HTTP-based MCP clients.
 *
 * Supports:
 * - Direct connections from Open WebUI
 * - Proxied connections via Control Server
 * - API key authentication
 * - CORS for cross-origin requests
 *
 * Architecture:
 *
 * Simple (Direct):
 *   Open WebUI ──SSE──► MCP-Eyes Agent
 *
 * Complex (Via Control Server):
 *   Open WebUI ──SSE──► Control Server ──SSE──► MCP-Eyes Agent
 */

import http from 'http';
import { URL } from 'url';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { EventEmitter } from 'events';

// Configuration
const PORT = parseInt(process.env.MCP_SSE_PORT || '3458', 10);
const HOST = process.env.MCP_SSE_HOST || '0.0.0.0'; // LAN accessible by default
const API_KEY = process.env.MCP_API_KEY || generateApiKey();
const AGENT_NAME = process.env.MCP_AGENT_NAME || `mcp-eyes-${require('os').hostname()}`;

// Token file for local discovery
const TOKEN_FILE = path.join(process.env.HOME || '/tmp', '.mcp-eyes-sse-token');

interface SSEClient {
  id: string;
  res: http.ServerResponse;
  connectedAt: Date;
  lastPing: Date;
  origin: 'direct' | 'control-server';
  forwardedFor?: string;
}

interface MCPMessage {
  jsonrpc: '2.0';
  id?: string | number;
  method?: string;
  params?: any;
  result?: any;
  error?: { code: number; message: string; data?: any };
}

interface PendingRequest {
  clientId: string;
  resolve: (result: any) => void;
  reject: (error: Error) => void;
  timeout: NodeJS.Timeout;
}

function generateApiKey(): string {
  return 'mcp_' + crypto.randomBytes(24).toString('hex');
}

class MCPSSEServer extends EventEmitter {
  private httpServer: http.Server;
  private clients: Map<string, SSEClient> = new Map();
  private pendingRequests: Map<string | number, PendingRequest> = new Map();
  private messageIdCounter = 0;

  // Tool implementations (same as other servers)
  private tools = this.getToolDefinitions();

  constructor() {
    super();
    this.httpServer = http.createServer(this.handleRequest.bind(this));
    this.startPingInterval();
    this.saveTokenFile();
  }

  private saveTokenFile(): void {
    const config = {
      apiKey: API_KEY,
      port: PORT,
      host: HOST,
      agentName: AGENT_NAME,
      sseEndpoint: `http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}/mcp/sse`,
      messagesEndpoint: `http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}/mcp/messages`,
      createdAt: new Date().toISOString(),
    };
    try {
      fs.writeFileSync(TOKEN_FILE, JSON.stringify(config, null, 2));
      console.log(`[SSE Server] Token saved to ${TOKEN_FILE}`);
    } catch (err) {
      console.error('[SSE Server] Failed to save token file:', err);
    }
  }

  private startPingInterval(): void {
    // Send ping every 30 seconds to keep connections alive
    setInterval(() => {
      const now = new Date();
      for (const [id, client] of this.clients.entries()) {
        try {
          this.sendSSE(client, { type: 'ping', timestamp: now.toISOString() });
          client.lastPing = now;
        } catch (err) {
          console.log(`[SSE Server] Client ${id} disconnected (ping failed)`);
          this.clients.delete(id);
        }
      }
    }, 30000);
  }

  private async handleRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    // CORS headers for Open WebUI
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-API-Key, X-Forwarded-For, X-Client-Id');
    res.setHeader('Access-Control-Expose-Headers', 'X-Client-Id');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    const url = new URL(req.url || '/', `http://localhost:${PORT}`);
    const pathname = url.pathname;

    // Health check (no auth required)
    if (pathname === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        status: 'ok',
        agent: AGENT_NAME,
        clients: this.clients.size,
        uptime: process.uptime(),
      }));
      return;
    }

    // Agent info (no auth required - for discovery)
    if (pathname === '/info') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        name: AGENT_NAME,
        version: '1.1.15',
        capabilities: ['screenshot', 'click', 'type', 'ocr', 'browser'],
        sseEndpoint: '/mcp/sse',
        messagesEndpoint: '/mcp/messages',
      }));
      return;
    }

    // All other endpoints require API key
    if (!this.verifyApiKey(req)) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Unauthorized', message: 'Invalid or missing API key' }));
      return;
    }

    // Detect if request is proxied through control server
    const forwardedFor = req.headers['x-forwarded-for'] as string | undefined;
    const origin: 'direct' | 'control-server' = forwardedFor ? 'control-server' : 'direct';

    // SSE endpoint
    if (pathname === '/mcp/sse') {
      this.handleSSEConnection(req, res, origin, forwardedFor);
      return;
    }

    // Messages endpoint
    if (pathname === '/mcp/messages' && req.method === 'POST') {
      await this.handleMessage(req, res, origin);
      return;
    }

    // List tools (convenience endpoint)
    if (pathname === '/mcp/tools') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ tools: this.tools }));
      return;
    }

    // Not found
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
  }

  private verifyApiKey(req: http.IncomingMessage): boolean {
    // Check Authorization header
    const authHeader = req.headers['authorization'];
    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.slice(7);
      if (token === API_KEY) return true;
    }

    // Check X-API-Key header
    const apiKeyHeader = req.headers['x-api-key'];
    if (apiKeyHeader === API_KEY) return true;

    // Check query parameter (for SSE connections where headers are tricky)
    const url = new URL(req.url || '/', `http://localhost:${PORT}`);
    const queryKey = url.searchParams.get('api_key');
    if (queryKey === API_KEY) return true;

    return false;
  }

  private handleSSEConnection(
    req: http.IncomingMessage,
    res: http.ServerResponse,
    origin: 'direct' | 'control-server',
    forwardedFor?: string
  ): void {
    const clientId = crypto.randomBytes(16).toString('hex');

    // SSE headers
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Client-Id': clientId,
    });

    const client: SSEClient = {
      id: clientId,
      res,
      connectedAt: new Date(),
      lastPing: new Date(),
      origin,
      forwardedFor,
    };

    this.clients.set(clientId, client);
    console.log(`[SSE Server] Client ${clientId} connected (${origin}${forwardedFor ? ` via ${forwardedFor}` : ''})`);

    // Send initial connection event with session info
    this.sendSSE(client, {
      type: 'connection',
      clientId,
      agent: AGENT_NAME,
      capabilities: this.tools.map(t => t.name),
    });

    // Send server capabilities (MCP initialize response)
    this.sendMCPMessage(client, {
      jsonrpc: '2.0',
      id: 0,
      result: {
        protocolVersion: '2024-11-05',
        capabilities: {
          tools: {},
        },
        serverInfo: {
          name: AGENT_NAME,
          version: '1.1.15',
        },
      },
    });

    // Handle disconnect
    req.on('close', () => {
      console.log(`[SSE Server] Client ${clientId} disconnected`);
      this.clients.delete(clientId);
    });

    req.on('error', (err) => {
      console.error(`[SSE Server] Client ${clientId} error:`, err);
      this.clients.delete(clientId);
    });
  }

  private sendSSE(client: SSEClient, data: any): void {
    const message = `data: ${JSON.stringify(data)}\n\n`;
    client.res.write(message);
  }

  private sendMCPMessage(client: SSEClient, message: MCPMessage): void {
    this.sendSSE(client, { type: 'message', message });
  }

  private async handleMessage(
    req: http.IncomingMessage,
    res: http.ServerResponse,
    origin: 'direct' | 'control-server'
  ): Promise<void> {
    try {
      const chunks: Buffer[] = [];
      for await (const chunk of req) {
        chunks.push(chunk);
      }
      const body = JSON.parse(Buffer.concat(chunks).toString());

      // Get client ID from header or body
      const clientId = req.headers['x-client-id'] as string || body.clientId;

      // Handle MCP message
      const response = await this.processMCPMessage(body, clientId);

      // Send response
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(response));

      // Also send via SSE if client is connected
      if (clientId && this.clients.has(clientId)) {
        const client = this.clients.get(clientId)!;
        this.sendMCPMessage(client, response);
      }
    } catch (err: any) {
      console.error('[SSE Server] Message handling error:', err);
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        jsonrpc: '2.0',
        error: { code: -32700, message: 'Parse error', data: err.message },
      }));
    }
  }

  private async processMCPMessage(message: MCPMessage, clientId?: string): Promise<MCPMessage> {
    const { method, params, id } = message;

    try {
      switch (method) {
        case 'initialize':
          return {
            jsonrpc: '2.0',
            id,
            result: {
              protocolVersion: '2024-11-05',
              capabilities: { tools: {} },
              serverInfo: { name: AGENT_NAME, version: '1.1.15' },
            },
          };

        case 'tools/list':
          return {
            jsonrpc: '2.0',
            id,
            result: { tools: this.tools },
          };

        case 'tools/call':
          const toolResult = await this.callTool(params.name, params.arguments || {});
          return {
            jsonrpc: '2.0',
            id,
            result: toolResult,
          };

        case 'ping':
          return {
            jsonrpc: '2.0',
            id,
            result: { pong: true, timestamp: new Date().toISOString() },
          };

        default:
          return {
            jsonrpc: '2.0',
            id,
            error: { code: -32601, message: `Method not found: ${method}` },
          };
      }
    } catch (err: any) {
      return {
        jsonrpc: '2.0',
        id,
        error: { code: -32603, message: err.message },
      };
    }
  }

  private async callTool(name: string, args: any): Promise<any> {
    // Import tool implementations from existing servers
    // For now, proxy to the HTTP backend if available, or implement directly

    console.log(`[SSE Server] Calling tool: ${name}`, args);

    switch (name) {
      case 'listApplications':
        return await this.proxyToHttpBackend('/listApplications');

      case 'focusApplication':
        return await this.proxyToHttpBackend('/focusApplication', 'POST', args);

      case 'screenshot':
        return await this.proxyToHttpBackend('/screenshot', 'POST', args);

      case 'click':
        return await this.proxyToHttpBackend('/click', 'POST', args);

      case 'getClickableElements':
        return await this.proxyToHttpBackend('/getClickableElements');

      case 'typeText':
        return await this.proxyToHttpBackend('/typeText', 'POST', args);

      case 'pressKey':
        return await this.proxyToHttpBackend('/pressKey', 'POST', args);

      case 'analyzeWithOCR':
        return await this.proxyToHttpBackend('/analyzeWithOCR');

      case 'checkPermissions':
        return await this.proxyToHttpBackend('/permissions');

      // Browser tools - proxy to browser bridge
      case 'browser_listConnected':
        return await this.proxyToBrowserBridge('/browsers');

      case 'browser_getTabs':
        return await this.proxyToBrowserBridge('/browser/getTabs', 'POST', args);

      case 'browser_getActiveTab':
        return await this.proxyToBrowserBridge('/browser/getActiveTab', 'POST', args);

      case 'browser_getPageInfo':
        return await this.proxyToBrowserBridge('/browser/getPageInfo', 'POST', args);

      case 'browser_getInteractiveElements':
        return await this.proxyToBrowserBridge('/browser/getInteractiveElements', 'POST', args);

      case 'browser_clickElement':
        return await this.proxyToBrowserBridge('/browser/clickElement', 'POST', args);

      case 'browser_fillElement':
        return await this.proxyToBrowserBridge('/browser/fillElement', 'POST', args);

      case 'browser_executeScript':
        return await this.proxyToBrowserBridge('/browser/executeScript', 'POST', args);

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  }

  private async proxyToHttpBackend(endpoint: string, method: string = 'GET', body?: any): Promise<any> {
    // Read HTTP backend config
    const httpTokenFile = path.join(process.env.HOME || '/tmp', '.mcp-eyes-token');
    let config: { port: number; host: string; apiKey: string };

    try {
      config = JSON.parse(fs.readFileSync(httpTokenFile, 'utf-8'));
    } catch {
      // Fallback to default
      config = { port: 3456, host: '127.0.0.1', apiKey: '' };
    }

    return this.httpRequest(config.host, config.port, endpoint, method, body, config.apiKey);
  }

  private async proxyToBrowserBridge(endpoint: string, method: string = 'GET', body?: any): Promise<any> {
    const port = parseInt(process.env.BROWSER_BRIDGE_PORT || '3457', 10);
    return this.httpRequest('127.0.0.1', port, endpoint, method, body);
  }

  private httpRequest(
    host: string,
    port: number,
    endpoint: string,
    method: string,
    body?: any,
    apiKey?: string
  ): Promise<any> {
    return new Promise((resolve, reject) => {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (apiKey) {
        headers['Authorization'] = `Bearer ${apiKey}`;
      }

      const options = {
        hostname: host,
        port,
        path: endpoint,
        method,
        headers,
        timeout: 30000,
      };

      const req = http.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          try {
            resolve(JSON.parse(data));
          } catch {
            resolve({ raw: data });
          }
        });
      });

      req.on('error', (e) => reject(new Error(`Backend request failed: ${e.message}`)));
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Backend request timeout'));
      });

      if (body) {
        req.write(JSON.stringify(body));
      }
      req.end();
    });
  }

  private getToolDefinitions(): any[] {
    return [
      // Native tools
      {
        name: 'listApplications',
        description: 'List all running applications with their window bounds and identifiers.',
        inputSchema: { type: 'object', properties: {} },
      },
      {
        name: 'focusApplication',
        description: 'Focus on a specific application by bundle ID or name.',
        inputSchema: {
          type: 'object',
          properties: {
            identifier: { type: 'string', description: 'Bundle ID or app name' },
          },
          required: ['identifier'],
        },
      },
      {
        name: 'screenshot',
        description: 'Take a screenshot of the focused application.',
        inputSchema: {
          type: 'object',
          properties: {
            padding: { type: 'number', description: 'Padding around window in pixels' },
          },
        },
      },
      {
        name: 'click',
        description: 'Click at normalized coordinates (0-1) relative to focused window.',
        inputSchema: {
          type: 'object',
          properties: {
            x: { type: 'number', description: 'X coordinate (0-1)' },
            y: { type: 'number', description: 'Y coordinate (0-1)' },
            button: { type: 'string', enum: ['left', 'right'], description: 'Mouse button' },
          },
          required: ['x', 'y'],
        },
      },
      {
        name: 'getClickableElements',
        description: 'Get all clickable UI elements via Accessibility API.',
        inputSchema: { type: 'object', properties: {} },
      },
      {
        name: 'typeText',
        description: 'Type text into the focused application.',
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
        description: 'Press keyboard key with optional modifiers.',
        inputSchema: {
          type: 'object',
          properties: {
            key: { type: 'string', description: 'Key to press (e.g., Enter, Command+L)' },
          },
          required: ['key'],
        },
      },
      {
        name: 'analyzeWithOCR',
        description: 'Analyze current screen using OCR.',
        inputSchema: { type: 'object', properties: {} },
      },
      {
        name: 'checkPermissions',
        description: 'Check accessibility permission status.',
        inputSchema: { type: 'object', properties: {} },
      },
      // Browser tools
      {
        name: 'browser_listConnected',
        description: 'List connected browser extensions.',
        inputSchema: { type: 'object', properties: {} },
      },
      {
        name: 'browser_getTabs',
        description: 'List all open browser tabs.',
        inputSchema: {
          type: 'object',
          properties: {
            browser: { type: 'string', enum: ['firefox', 'chrome', 'safari', 'edge'] },
          },
        },
      },
      {
        name: 'browser_getActiveTab',
        description: 'Get info about the currently active browser tab.',
        inputSchema: {
          type: 'object',
          properties: {
            browser: { type: 'string', enum: ['firefox', 'chrome', 'safari', 'edge'] },
          },
        },
      },
      {
        name: 'browser_getPageInfo',
        description: 'Get current page URL, title, and metadata.',
        inputSchema: {
          type: 'object',
          properties: {
            tabId: { type: 'number' },
            browser: { type: 'string', enum: ['firefox', 'chrome', 'safari', 'edge'] },
          },
        },
      },
      {
        name: 'browser_getInteractiveElements',
        description: 'Get all interactive DOM elements (buttons, links, inputs).',
        inputSchema: {
          type: 'object',
          properties: {
            tabId: { type: 'number' },
            browser: { type: 'string', enum: ['firefox', 'chrome', 'safari', 'edge'] },
          },
        },
      },
      {
        name: 'browser_clickElement',
        description: 'Click a DOM element by CSS selector.',
        inputSchema: {
          type: 'object',
          properties: {
            selector: { type: 'string', description: 'CSS selector' },
            tabId: { type: 'number' },
            browser: { type: 'string', enum: ['firefox', 'chrome', 'safari', 'edge'] },
          },
          required: ['selector'],
        },
      },
      {
        name: 'browser_fillElement',
        description: 'Fill a form field by CSS selector.',
        inputSchema: {
          type: 'object',
          properties: {
            selector: { type: 'string', description: 'CSS selector' },
            value: { type: 'string', description: 'Value to fill' },
            tabId: { type: 'number' },
            browser: { type: 'string', enum: ['firefox', 'chrome', 'safari', 'edge'] },
          },
          required: ['selector', 'value'],
        },
      },
      {
        name: 'browser_executeScript',
        description: 'Execute JavaScript in page context.',
        inputSchema: {
          type: 'object',
          properties: {
            script: { type: 'string', description: 'JavaScript code' },
            tabId: { type: 'number' },
            browser: { type: 'string', enum: ['firefox', 'chrome', 'safari', 'edge'] },
          },
          required: ['script'],
        },
      },
    ];
  }

  start(): void {
    this.httpServer.listen(PORT, HOST, () => {
      console.log(`[SSE Server] MCP-Eyes SSE Server running on http://${HOST}:${PORT}`);
      console.log(`[SSE Server] Agent: ${AGENT_NAME}`);
      console.log(`[SSE Server] API Key: ${API_KEY.slice(0, 10)}...`);
      console.log('');
      console.log('[SSE Server] Endpoints:');
      console.log(`  SSE:      GET  http://${HOST}:${PORT}/mcp/sse`);
      console.log(`  Messages: POST http://${HOST}:${PORT}/mcp/messages`);
      console.log(`  Tools:    GET  http://${HOST}:${PORT}/mcp/tools`);
      console.log(`  Health:   GET  http://${HOST}:${PORT}/health`);
      console.log(`  Info:     GET  http://${HOST}:${PORT}/info`);
      console.log('');
      console.log('[SSE Server] For Open WebUI, configure MCP server with:');
      console.log(`  URL: http://<this-machine-ip>:${PORT}/mcp/sse`);
      console.log(`  API Key: ${API_KEY}`);
    });
  }
}

// Run the server
const server = new MCPSSEServer();
server.start();
