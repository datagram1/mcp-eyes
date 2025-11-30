#!/usr/bin/env node

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

import http from 'http';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { URL } from 'url';
// @ts-ignore
import screenshotDesktop from 'screenshot-desktop';
import { mouse, Button, keyboard, Key } from '@nut-tree-fork/nut-js';
import { run, checkAccessibilityPermissions, runAppleScript } from './jxa-runner.js';
import sharp from 'sharp';
import { AppleWindowManager } from './apple-window-manager.js';
import { OCRAnalyzer } from './ocr-analyzer.js';
import { LocalLLMAnalyzer } from './local-llm-analyzer.js';

declare const Application: any;

interface AppInfo {
  name: string;
  bundleId: string;
  pid: number;
  bounds: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

const PORT = parseInt(process.env.MCP_EYES_PORT || '3456');
const HOST = process.env.MCP_EYES_HOST || '127.0.0.1'; // localhost only by default
const TOKEN_FILE = path.join(process.env.HOME || '/tmp', '.mcp-eyes-token');

// Generate or load API key
function getOrCreateApiKey(): string {
  // If provided via environment, use that
  if (process.env.MCP_EYES_API_KEY) {
    return process.env.MCP_EYES_API_KEY;
  }

  // Try to load existing key from token file
  try {
    if (fs.existsSync(TOKEN_FILE)) {
      const content = fs.readFileSync(TOKEN_FILE, 'utf-8');
      const existing = JSON.parse(content);
      if (existing.apiKey && existing.port === PORT && existing.host === HOST) {
        // Reuse existing key if port/host match
        console.log('📌 Reusing existing API key from token file');
        return existing.apiKey;
      }
    }
  } catch (err) {
    // Token file doesn't exist or is invalid, generate new key
  }

  // Generate a new random key
  const apiKey = crypto.randomBytes(32).toString('hex');

  // Save to token file for MCP client to read
  try {
    fs.writeFileSync(TOKEN_FILE, JSON.stringify({
      apiKey,
      port: PORT,
      host: HOST,
      createdAt: new Date().toISOString()
    }), { mode: 0o600 }); // Only owner can read
  } catch (err) {
    console.error('Warning: Could not save token file:', err);
  }

  return apiKey;
}

class MCPEyesHTTPServer {
  private appleWindowManager: AppleWindowManager;
  private ocrAnalyzer: OCRAnalyzer;
  private localLLMAnalyzer: LocalLLMAnalyzer;
  private currentApp: AppInfo | null = null;
  private apiKey: string;

  constructor() {
    this.appleWindowManager = new AppleWindowManager();
    this.ocrAnalyzer = new OCRAnalyzer();
    this.localLLMAnalyzer = new LocalLLMAnalyzer();
    this.apiKey = getOrCreateApiKey();
  }

  async listApplications(): Promise<AppInfo[]> {
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

    const result = await runAppleScript(script);
    const apps: AppInfo[] = [];

    for (const line of result.split('\n')) {
      if (!line.trim()) continue;
      const [name, bundleId, pidStr, boundsStr] = line.split('|');
      if (!name || !bundleId) continue;

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

  async focusApplication(identifier: string): Promise<boolean> {
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

    const result = await runAppleScript(script);
    if (result === 'success') {
      // Update currentApp
      const apps = await this.listApplications();
      this.currentApp = apps.find(a => a.bundleId === identifier || a.name === identifier) || null;
      return true;
    }
    return false;
  }

  async screenshot(options: { fullPage?: boolean; padding?: number } = {}): Promise<string> {
    const padding = options.padding || 10;

    // Take screenshot
    const screenshotBuffer = await screenshotDesktop({ format: 'png' });

    // If we have a focused app, crop to its window
    if (this.currentApp && this.currentApp.bounds.width > 0) {
      const { x, y, width, height } = this.currentApp.bounds;
      const cropped = await sharp(screenshotBuffer)
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

  async click(x: number, y: number, button: 'left' | 'right' = 'left'): Promise<boolean> {
    if (!this.currentApp) {
      throw new Error('No application focused. Call focusApplication first.');
    }

    const { bounds } = this.currentApp;
    const absX = bounds.x + (x * bounds.width);
    const absY = bounds.y + (y * bounds.height);

    await mouse.setPosition({ x: Math.round(absX), y: Math.round(absY) });
    await mouse.click(button === 'right' ? Button.RIGHT : Button.LEFT);
    return true;
  }

  async getClickableElements(): Promise<any[]> {
    if (!this.currentApp) {
      return [];
    }
    return await this.appleWindowManager.getClickableElements(this.currentApp.name);
  }

  async typeText(text: string): Promise<boolean> {
    await keyboard.type(text);
    return true;
  }

  async pressKey(key: string): Promise<boolean> {
    const keyMap: Record<string, Key> = {
      'Enter': Key.Enter,
      'Tab': Key.Tab,
      'Escape': Key.Escape,
      'Backspace': Key.Backspace,
      'Delete': Key.Delete,
      'ArrowUp': Key.Up,
      'ArrowDown': Key.Down,
      'ArrowLeft': Key.Left,
      'ArrowRight': Key.Right,
      'Space': Key.Space,
    };

    const nutKey = keyMap[key];
    if (nutKey) {
      await keyboard.pressKey(nutKey);
      await keyboard.releaseKey(nutKey);
    }
    return true;
  }

  async analyzeWithOCR(): Promise<any> {
    const screenshotBuffer = await screenshotDesktop({ format: 'png' });
    return await this.ocrAnalyzer.analyzeImage(screenshotBuffer);
  }

  async checkPermissions(): Promise<{ hasPermission: boolean; error?: string }> {
    return await checkAccessibilityPermissions();
  }

  createServer(): http.Server {
    return http.createServer(async (req, res) => {
      const url = new URL(req.url || '/', `http://localhost:${PORT}`);
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

        let result: any;

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
      } catch (error: any) {
        console.error(`Error handling ${reqPath}:`, error);
        res.writeHead(500);
        res.end(JSON.stringify({ error: error.message }));
      }
    });
  }

  async start(): Promise<void> {
    // Check permissions first
    console.log('🎯 MCP-Eyes HTTP Server');
    console.log('=======================');
    console.log('');

    const permissions = await this.checkPermissions();
    if (permissions.hasPermission) {
      console.log('✅ Accessibility permissions: OK');
    } else {
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
