#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { mouse, Point } from '@nut-tree-fork/nut-js';
// @ts-ignore
import screenshot from 'screenshot-desktop';
// @ts-ignore
import * as permissions from 'node-mac-permissions';
import { run } from '@jxa/run';
import sharp from 'sharp';
import * as fs from 'fs';
import * as path from 'path';
import { getWindowBoundsAppleScript } from './window-bounds-helper';

interface Application {
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

interface WindowBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

class MacOSGUIControlServer {
  private server: Server;
  private currentApp: Application | null = null;

  constructor() {
    this.server = new Server({
      name: 'macos-gui-control',
      version: '1.1.12',
    });

    this.setupToolHandlers();
  }

  private setupToolHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          {
            name: 'listApplications',
            description: 'List all running applications with their window bounds',
            inputSchema: {
              type: 'object',
              properties: {},
            },
          },
          {
            name: 'focusApplication',
            description: 'Focus on a specific application by bundle ID or PID',
            inputSchema: {
              type: 'object',
              properties: {
                identifier: {
                  type: 'string',
                  description: 'Bundle ID or PID of the application to focus',
                },
              },
              required: ['identifier'],
            },
          },
          {
            name: 'closeApp',
            description: 'Close/quit a specific application by bundle ID, name, or PID.',
            inputSchema: {
              type: 'object',
              properties: {
                identifier: {
                  type: 'string',
                  description: 'Bundle ID (e.g., com.apple.Safari), app name (e.g., Safari), or PID of the application to close',
                },
                force: {
                  type: 'boolean',
                  description: 'Force close the application if graceful quit fails (default: false)',
                  default: false,
                },
              },
              required: ['identifier'],
            },
          },
          {
            name: 'click',
            description: 'Perform a mouse click at specified coordinates relative to the focused app window',
            inputSchema: {
              type: 'object',
              properties: {
                x: {
                  type: 'number',
                  description: 'X coordinate relative to the app window (0-1 normalized)',
                },
                y: {
                  type: 'number',
                  description: 'Y coordinate relative to the app window (0-1 normalized)',
                },
                button: {
                  type: 'string',
                  enum: ['left', 'right', 'middle'],
                  description: 'Mouse button to click',
                  default: 'left',
                },
              },
              required: ['x', 'y'],
            },
          },
          {
            name: 'moveMouse',
            description: 'Move mouse to specified coordinates relative to the focused app window',
            inputSchema: {
              type: 'object',
              properties: {
                x: {
                  type: 'number',
                  description: 'X coordinate relative to the app window (0-1 normalized)',
                },
                y: {
                  type: 'number',
                  description: 'Y coordinate relative to the app window (0-1 normalized)',
                },
              },
              required: ['x', 'y'],
            },
          },
          {
            name: 'screenshot',
            description: 'Take a screenshot of the focused application window',
            inputSchema: {
              type: 'object',
              properties: {
                padding: {
                  type: 'number',
                  description: 'Padding around the window in pixels',
                  default: 10,
                },
              },
            },
          },
        ],
      };
    });

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        switch (name) {
          case 'listApplications':
            return await this.listApplications();
          case 'focusApplication':
            return await this.focusApplication(args?.identifier as string);
          case 'closeApp':
            return await this.closeApp(args?.identifier as string, (args?.force as boolean) || false);
          case 'click':
            return await this.click(args?.x as number, args?.y as number, (args?.button as string) || 'left');
          case 'moveMouse':
            return await this.moveMouse(args?.x as number, args?.y as number);
          case 'screenshot':
            return await this.screenshot((args?.padding as number) || 10);
          default:
            throw new Error(`Unknown tool: ${name}`);
        }
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `Error: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          isError: true,
        };
      }
    });
  }

  private async checkPermissions(): Promise<void> {
    const screenRecording = permissions.getAuthStatus('screen');
    const accessibility = permissions.getAuthStatus('accessibility');

    if (screenRecording !== 'authorized') {
      throw new Error(
        'Screen Recording permission is required. Please grant permission in System Preferences > Security & Privacy > Privacy > Screen Recording.'
      );
    }

    if (accessibility !== 'authorized') {
      throw new Error(
        'Accessibility permission is required. Please grant permission in System Preferences > Security & Privacy > Privacy > Accessibility.'
      );
    }
  }

  private async listApplications(): Promise<any> {
    await this.checkPermissions();

    const apps = await run(() => {
      // @ts-ignore
      const apps = Application.runningApplications();
      return apps.map((app: any) => ({
        name: app.name(),
        bundleId: app.bundleIdentifier(),
        pid: app.processIdentifier(),
        bounds: { x: 0, y: 0, width: 0, height: 0 } // Will be populated with actual bounds
      }));
    });

    // Get actual window bounds for each application
    for (const app of apps as any[]) {
      const bounds = await getWindowBoundsAppleScript(app.name, app.pid);
      if (bounds) {
        app.bounds = bounds;
      }
    }

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(apps, null, 2),
        },
      ],
    };
  }

  private async focusApplication(identifier: string): Promise<any> {
    await this.checkPermissions();

    const apps = await run(() => {
      // @ts-ignore
      const apps = Application.runningApplications();
      return apps.map((app: any) => ({
        name: app.name(),
        bundleId: app.bundleIdentifier(),
        pid: app.processIdentifier(),
        bounds: app.bounds()
      }));
    }) as Application[];

    let targetApp: Application | undefined;
    
    // Try to find by bundle ID first
    targetApp = apps.find(app => app.bundleId === identifier);
    
    // If not found, try by PID
    if (!targetApp) {
      const pid = parseInt(identifier);
      if (!isNaN(pid)) {
        targetApp = apps.find(app => app.pid === pid);
      }
    }

    if (!targetApp) {
      throw new Error(`Application not found: ${identifier}`);
    }

    // Focus the application
    await run((bundleId: string) => {
      // @ts-ignore
      const app = Application(bundleId);
      app.activate();
    }, targetApp.bundleId);

    // Get actual window bounds after focusing
    const bounds = await getWindowBoundsAppleScript(targetApp.name, targetApp.pid);
    if (bounds) {
      targetApp.bounds = bounds;
    }

    this.currentApp = targetApp;

    return {
      content: [
        {
          type: 'text',
          text: `Focused on application: ${targetApp.name} (${targetApp.bundleId})`,
        },
      ],
    };
  }

  private async closeApp(identifier: string, force: boolean = false): Promise<any> {
    try {
      const result = await run((identifier, force) => {
        const app = Application.currentApplication();
        app.includeStandardAdditions = true;

        // Try to find app by bundle ID first, then by name, then by PID
        const runningApps = Application('System Events').applicationProcesses();
        let targetApp = null;
        let appInfo = null;

        // First, try to find by bundle ID or name
        for (let i = 0; i < runningApps.length; i++) {
          const appBundleId = runningApps[i].bundleIdentifier();
          const appName = runningApps[i].name();
          
          if (appBundleId === identifier || appName === identifier) {
            targetApp = runningApps[i];
            appInfo = {
              name: appName,
              bundleId: appBundleId,
              pid: runningApps[i].unixId()
            };
            break;
          }
        }

        // If not found by name/bundle, try by PID
        if (!targetApp && !isNaN(parseInt(identifier))) {
          const pid = parseInt(identifier);
          for (let i = 0; i < runningApps.length; i++) {
            if (runningApps[i].unixId() === pid) {
              targetApp = runningApps[i];
              appInfo = {
                name: runningApps[i].name(),
                bundleId: runningApps[i].bundleIdentifier(),
                pid: pid
              };
              break;
            }
          }
        }

        if (!targetApp) {
          throw new Error(`Application not found: ${identifier}`);
        }

        // Try graceful quit first
        try {
          targetApp.quit();
          return {
            success: true,
            method: 'graceful',
            appInfo: appInfo!,
            message: `Successfully closed ${appInfo!.name} gracefully`
          };
        } catch (quitError) {
          if (force) {
            // Force kill the process
            const killResult = app.doShellScript(`kill -9 ${appInfo!.pid}`);
            return {
              success: true,
              method: 'force',
              appInfo: appInfo!,
              message: `Force closed ${appInfo!.name} (PID: ${appInfo!.pid})`
            };
          } else {
            throw new Error(`Failed to quit ${appInfo!.name} gracefully. Use force: true to force close.`);
          }
        }
      }, identifier, force);

      const typedResult = result as {
        success: boolean;
        method: string;
        appInfo: { name: string; bundleId: string; pid: number };
        message: string;
      };

      // Clear current app if it was the one being closed
      if (this.currentApp && 
          (this.currentApp.bundleId === typedResult.appInfo.bundleId || 
           this.currentApp.pid === typedResult.appInfo.pid)) {
        this.currentApp = null;
      }

      return {
        content: [
          {
            type: 'text',
            text: `${typedResult.message}\nMethod: ${typedResult.method}\nApp: ${typedResult.appInfo.name} (${typedResult.appInfo.bundleId})\nPID: ${typedResult.appInfo.pid}`,
          },
        ],
      };
    } catch (error) {
      throw new Error(`Failed to close application: ${error}`);
    }
  }

  private async click(x: number, y: number, button: string): Promise<any> {
    if (!this.currentApp) {
      throw new Error('No application focused. Use focusApplication first.');
    }

    await this.checkPermissions();

    // Convert normalized coordinates to absolute screen coordinates
    const screenX = this.currentApp.bounds.x + (x * this.currentApp.bounds.width);
    const screenY = this.currentApp.bounds.y + (y * this.currentApp.bounds.height);

    await mouse.move([new Point(screenX, screenY)]);
    
    switch (button) {
      case 'left':
        await mouse.leftClick();
        break;
      case 'right':
        await mouse.rightClick();
        break;
      case 'middle':
        await mouse.scrollDown(0);
        break;
      default:
        throw new Error(`Invalid button: ${button}`);
    }

    return {
      content: [
        {
          type: 'text',
          text: `Clicked ${button} button at (${x.toFixed(3)}, ${y.toFixed(3)}) relative to ${this.currentApp.name}`,
        },
      ],
    };
  }

  private async moveMouse(x: number, y: number): Promise<any> {
    if (!this.currentApp) {
      throw new Error('No application focused. Use focusApplication first.');
    }

    await this.checkPermissions();

    // Convert normalized coordinates to absolute screen coordinates
    const screenX = this.currentApp.bounds.x + (x * this.currentApp.bounds.width);
    const screenY = this.currentApp.bounds.y + (y * this.currentApp.bounds.height);

    await mouse.move([new Point(screenX, screenY)]);

    return {
      content: [
        {
          type: 'text',
          text: `Moved mouse to (${x.toFixed(3)}, ${y.toFixed(3)}) relative to ${this.currentApp.name}`,
        },
      ],
    };
  }

  private async screenshot(padding: number): Promise<any> {
    if (!this.currentApp) {
      throw new Error('No application focused. Use focusApplication first.');
    }

    await this.checkPermissions();

    // Take a full screen screenshot
    const fullScreenshot = await screenshot();

    // Calculate crop area with padding
    const cropX = Math.max(0, this.currentApp.bounds.x - padding);
    const cropY = Math.max(0, this.currentApp.bounds.y - padding);
    const cropWidth = this.currentApp.bounds.width + (padding * 2);
    const cropHeight = this.currentApp.bounds.height + (padding * 2);

    // Crop the screenshot using sharp
    const croppedBuffer = await sharp(fullScreenshot)
      .extract({
        left: cropX,
        top: cropY,
        width: cropWidth,
        height: cropHeight,
      })
      .png()
      .toBuffer();

    // Convert to base64
    const base64Image = croppedBuffer.toString('base64');

    return {
      content: [
        {
          type: 'text',
          text: `Screenshot of ${this.currentApp.name} window (${cropWidth}x${cropHeight}px with ${padding}px padding)`,
        },
        {
          type: 'image',
          data: base64Image,
          mimeType: 'image/png',
        },
      ],
    };
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('macOS GUI Control MCP server running on stdio');
  }
}

// Start the server
const server = new MacOSGUIControlServer();
server.run().catch(console.error);
