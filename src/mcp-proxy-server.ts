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
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

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

  /**
   * Get window information for an application using AppleScript (fallback)
   */
  private async getWindowsViaAppleScript(bundleId: string, appName: string): Promise<Array<{
    title: string;
    bounds: { x: number; y: number; width: number; height: number };
    isMinimized: boolean;
  }>> {
    try {
      const escapedBundleId = (bundleId || '').replace(/"/g, '\\"');
      const escapedAppName = (appName || '').replace(/"/g, '\\"');

      // Prefer bundle identifier for targeting, fall back to application name if needed
      const scriptFile = path.join(process.env.TMPDIR || '/tmp', `mcp-eyes-windows-${Date.now()}.scpt`);
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

      fs.writeFileSync(scriptFile, fullScript);
      let stdout = '';
      try {
        const execResult = await execAsync(`osascript "${scriptFile}"`);
        stdout = execResult.stdout;
      } finally {
        try {
          fs.unlinkSync(scriptFile);
        } catch {
          // Ignore cleanup errors
        }
      }
      
      const windows: Array<{ title: string; bounds: { x: number; y: number; width: number; height: number }; isMinimized: boolean }> = [];
      
      // Parse the output - it may be newline-separated or space-separated
      const lines = stdout.trim().split(/\r?\n/).filter(line => line.trim());
      for (const line of lines) {
        if (!line.trim()) continue;
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
    } catch (error) {
      // AppleScript failed, return empty array
      return [];
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
            description: `🌐 MCP-EYES BROWSER: Read the visible text content of the current page (or a specific section) as plain text.

When to use:
• To understand page content and structure
• To locate specific sections, headings, or labels before interacting with nearby elements
• To extract data, descriptions, or instructions

Typical workflow:
• Call with no selector to read the main page text, then decide what to do next.
• Or call with a selector (e.g. a container or section) to read just that part.
• Combine with browser_getInteractiveElements to:
  – Read context using browser_getVisibleText
  – Then find relevant buttons/links nearby using browser_getInteractiveElements

Typical next tools: browser_getInteractiveElements (to find clickable elements near the text you read).

Important:
• This returns plain text only. It does not tell you what is clickable.
• For discovering clickable elements (buttons, links, inputs), use browser_getInteractiveElements instead.
• If the DOM is blocked or stripped (e.g., reCAPTCHA, heavy anti-bot pages), fall back to screenshot_app + getClickableElements + click/typeText to keep going.`,
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
            
            // Process each app and enhance with window information
            const normalizedApps = await Promise.all((apps as any[]).map(async (app: any, index: number) => {
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
              
              const normalizedWindows = windows.map((win: any, winIndex: number) => ({
                index: winIndex,
                title: win.title || `Window ${winIndex + 1}`,
                bounds: win.bounds || { x: 0, y: 0, width: 0, height: 0 },
                isMain: win.is_main ?? win.isMain ?? false,
                isMinimized: win.is_minimized ?? win.isMinimized ?? false,
              }));
              
              const windowTitles = normalizedWindows.map((w: any) => w.title);
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
            const appsWithWindows = normalizedApps.filter((app: any) => app.windowCount > 0).length;
            const totalWindows = normalizedApps.reduce((sum: number, app: any) => sum + app.windowCount, 0);
            
            return {
              content: [
                {
                  type: 'text',
                  text: `Found ${totalApps} applications (${appsWithWindows} with windows, ${totalWindows} total windows):\n\n` +
                    normalizedApps.map((app: any) => {
                      const windowCountText = app.windowCount > 0 
                        ? `${app.windowCount} window${app.windowCount !== 1 ? 's' : ''}: ${app.windowTitles.join(', ')}`
                        : 'No windows detected';
                      
                      const windowLines = app.windowCount > 0
                        ? (app.windows as any[]).map((win: any) =>
                            `    • [${win.index}] "${win.title}"${win.isMain ? ' (main)' : ''}${win.isMinimized ? ' (minimized)' : ''}\n` +
                            `      Location: (${win.bounds.x}, ${win.bounds.y}) | Size: ${win.bounds.width}x${win.bounds.height}`
                          ).join('\n')
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
            const normalizedElements = elements.map((el: any, i: number) => {
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
                    normalizedElements.map((el: any) => {
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
            if (!Array.isArray(result)) {
              return {
                content: [{
                  type: 'text',
                  text: `Error getting UI elements: ${result?.error || 'Unexpected response format'}\nRaw result: ${JSON.stringify(result).substring(0, 500)}`,
                }],
                isError: true,
              };
            }
            const richElements = result.map((el: any, i: number) => ({
              index: el.index ?? i,
              type: el.type,
              role: el.role,
              text: el.text || '',
              bounds: el.bounds,
              normalizedPosition: el.normalized_position || el.normalizedPosition || null,
              isClickable: el.is_clickable ?? el.isClickable ?? false,
              isEnabled: el.is_enabled ?? el.isEnabled ?? true,
            }));
            return {
              content: [
                {
                  type: 'text',
                  text: `Found ${richElements.length} accessibility elements (clickable + context):\n\n` +
                    richElements.map((el: any) => {
                      const coordText = el.normalizedPosition
                        ? `(${Number(el.normalizedPosition.x).toFixed(3)}, ${Number(el.normalizedPosition.y).toFixed(3)})`
                        : '(no normalized position)';
                      return `${el.index}. [${el.role || el.type}] ${el.text || '(no text)'} at ${coordText}${el.isClickable ? ' [clickable]' : ''}`;
                    }).join('\n'),
                },
              ],
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
                ocrResults.map((entry: any, idx: number) => {
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
            let resultText: string;
            if (scriptResult === null || scriptResult === undefined) {
              resultText = 'Script executed successfully but returned no value (undefined/null).\nMake sure your script includes an explicit return statement.';
            } else if (typeof scriptResult === 'string') {
              resultText = scriptResult;
            } else if (typeof scriptResult === 'object') {
              resultText = JSON.stringify(scriptResult, null, 2);
            } else {
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
