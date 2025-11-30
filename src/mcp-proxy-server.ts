#!/usr/bin/env node

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

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import http from 'http';
import fs from 'fs';
import path from 'path';

const TOKEN_FILE = path.join(process.env.HOME || '/tmp', '.mcp-eyes-token');
const BROWSER_BRIDGE_PORT = parseInt(process.env.BROWSER_BRIDGE_PORT || '3457', 10);

interface TokenConfig {
  apiKey: string;
  port: number;
  host: string;
  createdAt: string;
}

function loadTokenConfig(): TokenConfig | null {
  try {
    const content = fs.readFileSync(TOKEN_FILE, 'utf-8');
    return JSON.parse(content);
  } catch (err) {
    console.error('Failed to load token file:', err);
    return null;
  }
}

async function httpRequest(
  config: TokenConfig,
  method: 'GET' | 'POST',
  endpoint: string,
  body?: any
): Promise<any> {
  return new Promise((resolve, reject) => {
    const bodyStr = body ? JSON.stringify(body) : undefined;
    const options: any = {
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

    const req = http.request(options, (res) => {
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
        } catch (e) {
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
  private server: Server;
  private config: TokenConfig | null = null;

  constructor() {
    this.server = new Server({
      name: 'mcp-eyes-proxy',
      version: '1.1.15',
    });

    this.setupToolHandlers();
    this.setupErrorHandling();
  }

  private setupErrorHandling(): void {
    this.server.onerror = (error) => {
      console.error('[MCP Proxy Error]', error);
    };

    process.on('SIGINT', async () => {
      await this.server.close();
      process.exit(0);
    });
  }

  private getConfig(forceReload: boolean = false): TokenConfig {
    if (!this.config || forceReload) {
      this.config = loadTokenConfig();
    }
    if (!this.config) {
      throw new Error(
        'MCP-Eyes HTTP server not running. Start it with: node dist/http-server.js\n' +
        'Or install as service: ./scripts/install-service.sh'
      );
    }
    return this.config;
  }

  private async proxyCall(endpoint: string, method: 'GET' | 'POST' = 'GET', body?: any): Promise<any> {
    const config = this.getConfig();
    try {
      return await httpRequest(config, method, endpoint, body);
    } catch (err: any) {
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
  private async browserProxyCall(endpoint: string, method: 'GET' | 'POST' = 'GET', body?: any): Promise<any> {
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

      const req = http.request(options, (res) => {
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
          } catch (e) {
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
  private async getConnectedBrowsers(): Promise<{ browsers: any[]; defaultBrowser: string | null } | null> {
    try {
      const result = await this.browserProxyCall('/browsers');
      return result;
    } catch {
      // Browser bridge not running or no browsers connected
      return null;
    }
  }

  private setupToolHandlers(): void {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      // Check if any browser extensions are connected
      const browserStatus = await this.getConnectedBrowsers();
      const hasBrowserExtensions = browserStatus && browserStatus.browsers && browserStatus.browsers.length > 0;

      // Build connected browsers description
      const connectedBrowsersDesc = hasBrowserExtensions
        ? ` Connected: ${browserStatus.browsers.map((b: any) => b.type).join(', ')}.`
        : '';

      // Base native macOS tools
      const nativeTools = [
          // ========== Native macOS Tools ==========
          {
            name: 'listApplications',
            description: '🎯 MCP-EYES: List all running applications with their window bounds and identifiers.',
            inputSchema: { type: 'object', properties: {} },
          },
          {
            name: 'focusApplication',
            description: '🎯 MCP-EYES: Focus on a specific application by bundle ID or name.',
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
            description: '🎯 MCP-EYES: Take a screenshot of the focused application.',
            inputSchema: {
              type: 'object',
              properties: {
                padding: {
                  type: 'number',
                  description: 'Padding around the window in pixels (default: 10)',
                },
              },
            },
          },
          {
            name: 'click',
            description: '🎯 MCP-EYES: Click at a position relative to the focused app window.',
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
            name: 'moveMouse',
            description: '🎯 MCP-EYES: Move mouse to a position relative to the focused app window (without clicking).',
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
            description: '🎯 MCP-EYES: Scroll the mouse wheel. Positive deltaY scrolls up, negative scrolls down.',
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
            description: '🎯 MCP-EYES: Drag from one position to another (click and hold, move, release).',
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
            description: '🎯 MCP-EYES: Get all clickable UI elements in the focused application.',
            inputSchema: { type: 'object', properties: {} },
          },
          {
            name: 'typeText',
            description: '🎯 MCP-EYES: Type text into the focused application.',
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
            description: '🎯 MCP-EYES: Press a keyboard key (supports modifiers like Command+L).',
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
            description: '🎯 MCP-EYES: Analyze the current screen using OCR.',
            inputSchema: { type: 'object', properties: {} },
          },
          {
            name: 'checkPermissions',
            description: '🎯 MCP-EYES: Check if accessibility permissions are granted.',
            inputSchema: { type: 'object', properties: {} },
          },
      ];

      // Browser Extension Tools - only included when extensions are connected
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
            description: '🌐 MCP-EYES BROWSER: Get all interactive DOM elements (buttons, links, inputs, etc.).',
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
            description: '🌐 MCP-EYES BROWSER: Get combined page info and interactive elements.',
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
            description: '🌐 MCP-EYES BROWSER: Click a DOM element by CSS selector.',
            inputSchema: {
              type: 'object',
              properties: {
                selector: {
                  type: 'string',
                  description: 'CSS selector for the element to click (e.g., "#submit-btn", ".login-button")',
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
            description: '🌐 MCP-EYES BROWSER: Fill a form field by CSS selector.',
            inputSchema: {
              type: 'object',
              properties: {
                selector: {
                  type: 'string',
                  description: 'CSS selector for the input element (e.g., "#username", "input[name=email]")',
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
            description: '🌐 MCP-EYES BROWSER: Execute JavaScript in the page context.',
            inputSchema: {
              type: 'object',
              properties: {
                script: {
                  type: 'string',
                  description: 'JavaScript code to execute',
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
            description: '🌐 MCP-EYES BROWSER: Get all visible text content from the page. Returns full text including content that requires scrolling.',
            inputSchema: {
              type: 'object',
              properties: {
                maxLength: {
                  type: 'number',
                  description: 'Maximum text length to return (default: 100000)',
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
            name: 'browser_waitForSelector',
            description: '🌐 MCP-EYES BROWSER: Wait for an element to appear in the DOM. Use after clicking or navigating.',
            inputSchema: {
              type: 'object',
              properties: {
                selector: {
                  type: 'string',
                  description: 'CSS selector to wait for',
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
            description: '🌐 MCP-EYES BROWSER: Wait for the page to fully load. Use after navigation or clicking links.',
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
            description: '🌐 MCP-EYES BROWSER: Select an option in a dropdown/select element.',
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
            description: '🌐 MCP-EYES BROWSER: Check if an element exists and is visible.',
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
      ];

      // Return native tools, plus browser tools only if extensions are connected
      return {
        tools: hasBrowserExtensions ? [...nativeTools, ...browserTools] : nativeTools,
      };
    });

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        let result: any;

        switch (name) {
          case 'listApplications':
            result = await this.proxyCall('/listApplications');
            // Handle both formats: {applications: [...]} or [...]
            const apps = result.applications || result;
            return {
              content: [{
                type: 'text',
                text: `Found ${apps.length} applications:\n\n` +
                  apps.map((app: any) =>
                    `• ${app.name} (${app.bundleId})\n  PID: ${app.pid}\n  Bounds: ${app.bounds.width}x${app.bounds.height} at (${app.bounds.x}, ${app.bounds.y})`
                  ).join('\n\n')
              }],
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
            return {
              content: [{
                type: 'text',
                text: `Found ${elements.length} clickable elements:\n\n` +
                  elements.map((el: any, i: number) =>
                    `${i}. [${el.type}] ${el.text || '(no text)'} at (${el.normalizedPosition?.x?.toFixed(3)}, ${el.normalizedPosition?.y?.toFixed(3)})`
                  ).join('\n'),
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

          case 'analyzeWithOCR':
            result = await this.proxyCall('/analyzeWithOCR');
            return {
              content: [{
                type: 'text',
                text: JSON.stringify(result, null, 2),
              }],
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
                    ? result.browsers.map((b: any) =>
                        `• ${b.name} (${b.type})${b.type === result.defaultBrowser ? ' [DEFAULT]' : ''}`
                      ).join('\n')
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
                  result.map((tab: any) =>
                    `• [${tab.id}] ${tab.title || '(no title)'}\n  URL: ${tab.url}\n  Active: ${tab.active ? 'Yes' : 'No'}`
                  ).join('\n\n'),
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
                  interactiveElements.slice(0, 50).map((el: any, i: number) =>
                    `${i}. [${el.tagName || el.type}] ${el.text || el.placeholder || el.name || el.id || '(no text)'}\n   Selector: ${el.selector || 'N/A'}`
                  ).join('\n\n') +
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
                  (result.elements || []).slice(0, 30).map((el: any, i: number) =>
                    `  ${i}. [${el.tagName || el.type}] ${el.text || el.placeholder || '(no text)'}`
                  ).join('\n'),
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
            if (result.error) {
              return {
                content: [{ type: 'text', text: `Script error: ${result.error}` }],
                isError: true,
              };
            }
            return {
              content: [{
                type: 'text',
                text: `Script result:\n${JSON.stringify(result.result, null, 2)}`,
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
                  (result.forms || []).map((form: any, i: number) =>
                    `Form ${i}: ${form.id || form.name || '(unnamed)'}\n  Action: ${form.action || 'N/A'}\n  Method: ${form.method}\n  Fields: ${form.inputCount}`
                  ).join('\n\n'),
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

          case 'browser_getVisibleText':
            result = await this.browserProxyCall('/browser/getVisibleText', 'POST', {
              maxLength: args?.maxLength,
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
                text: `Page: ${result.title}\nURL: ${result.url}\nLength: ${result.length} chars${result.truncated ? ' (truncated)' : ''}\n\n${result.text}`,
              }],
            };

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
                ? `\nAvailable options:\n${result.availableOptions.map((o: any) => `  - "${o.value}" (${o.text})`).join('\n')}`
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
                  result.logs.slice(0, 100).map((log: any) =>
                    `[${log.type.toUpperCase()}] ${new Date(log.timestamp).toISOString()}\n  ${log.message.substring(0, 500)}`
                  ).join('\n\n'),
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
                  result.requests.slice(0, 50).map((req: any) =>
                    `[${req.type.toUpperCase()}] ${req.method} ${req.url.substring(0, 100)}\n  Status: ${req.status || 'pending'} (${req.duration || 0}ms)${req.error ? `\n  Error: ${req.error}` : ''}`
                  ).join('\n\n'),
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
                  Object.entries(result.items).map(([key, value]) =>
                    `${key}: ${JSON.stringify(value).substring(0, 200)}`
                  ).join('\n'),
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
                  Object.entries(result.cookies).map(([name, value]) =>
                    `${name}: ${String(value).substring(0, 100)}`
                  ).join('\n'),
              }],
            };

          default:
            throw new Error(`Unknown tool: ${name}`);
        }
      } catch (error: any) {
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

  async run(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('MCP-Eyes Proxy Server running...');
  }
}

const proxyServer = new MCPProxyServer();
proxyServer.run().catch(console.error);
