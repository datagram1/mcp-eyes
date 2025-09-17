#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { 
  mouse, 
  Point,
  Button
} from '@nut-tree-fork/nut-js';
// @ts-ignore
import screenshot from 'screenshot-desktop';
// @ts-ignore
import * as permissions from 'node-mac-permissions';
import { run } from '@jxa/run';
import sharp from 'sharp';
import * as fs from 'fs';
import * as path from 'path';

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

class SimplifiedEnhancedMacOSGUIControlServer {
  private server: Server;
  private currentApp: Application | null = null;

  constructor() {
    this.server = new Server({
      name: 'simplified-enhanced-macos-gui-control',
      version: '1.1.12',
    });

    this.setupToolHandlers();
  }

  private setupToolHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          // Existing tools
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
          
          // NEW ENHANCED TOOLS (simplified for fork compatibility)
          {
            name: 'doubleClick',
            description: 'Perform a double-click at specified coordinates relative to the focused app window',
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
                  description: 'Mouse button to double-click',
                  default: 'left',
                },
              },
              required: ['x', 'y'],
            },
          },
          {
            name: 'scrollMouse',
            description: 'Scroll the mouse wheel',
            inputSchema: {
              type: 'object',
              properties: {
                direction: {
                  type: 'string',
                  enum: ['up', 'down'],
                  description: 'Scroll direction',
                },
                amount: {
                  type: 'number',
                  description: 'Number of scroll steps',
                  default: 3,
                },
              },
              required: ['direction'],
            },
          },
          {
            name: 'getMousePosition',
            description: 'Get the current mouse position',
            inputSchema: {
              type: 'object',
              properties: {},
            },
          },
          {
            name: 'wait',
            description: 'Wait for a specified amount of time',
            inputSchema: {
              type: 'object',
              properties: {
                milliseconds: {
                  type: 'number',
                  description: 'Number of milliseconds to wait',
                },
              },
              required: ['milliseconds'],
            },
          },
          {
            name: 'getScreenSize',
            description: 'Get the screen dimensions',
            inputSchema: {
              type: 'object',
              properties: {},
            },
          },
        ],
      };
    });

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        switch (name) {
          // Existing tools
          case 'listApplications':
            return await this.listApplications();
          case 'focusApplication':
            return await this.focusApplication(args?.identifier as string);
          case 'click':
            return await this.click(args?.x as number, args?.y as number, (args?.button as string) || 'left');
          case 'moveMouse':
            return await this.moveMouse(args?.x as number, args?.y as number);
          case 'screenshot':
            return await this.screenshot((args?.padding as number) || 10);
          
          // NEW ENHANCED TOOLS
          case 'doubleClick':
            return await this.doubleClick(args?.x as number, args?.y as number, (args?.button as string) || 'left');
          case 'scrollMouse':
            return await this.scrollMouse(args?.direction as string, (args?.amount as number) || 3);
          case 'getMousePosition':
            return await this.getMousePosition();
          case 'wait':
            return await this.wait(args?.milliseconds as number);
          case 'getScreenSize':
            return await this.getScreenSize();
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

  // EXISTING METHODS (keeping the same implementation)
  private async listApplications(): Promise<any> {
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
    });

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

  // NEW ENHANCED METHODS (simplified for fork compatibility)

  private async doubleClick(x: number, y: number, button: string): Promise<any> {
    if (!this.currentApp) {
      throw new Error('No application focused. Use focusApplication first.');
    }

    await this.checkPermissions();

    // Convert normalized coordinates to absolute screen coordinates
    const screenX = this.currentApp.bounds.x + (x * this.currentApp.bounds.width);
    const screenY = this.currentApp.bounds.y + (y * this.currentApp.bounds.height);

    await mouse.move([new Point(screenX, screenY)]);
    
    // Perform double click
    switch (button) {
      case 'left':
        await mouse.leftClick();
        await mouse.leftClick();
        break;
      case 'right':
        await mouse.rightClick();
        await mouse.rightClick();
        break;
      case 'middle':
        await mouse.scrollDown(0);
        await mouse.scrollDown(0);
        break;
      default:
        throw new Error(`Invalid button: ${button}`);
    }

    return {
      content: [
        {
          type: 'text',
          text: `Double-clicked ${button} button at (${x.toFixed(3)}, ${y.toFixed(3)}) relative to ${this.currentApp.name}`,
        },
      ],
    };
  }

  private async scrollMouse(direction: string, amount: number): Promise<any> {
    await this.checkPermissions();

    try {
      switch (direction.toLowerCase()) {
        case 'up':
          await mouse.scrollUp(amount);
          break;
        case 'down':
          await mouse.scrollDown(amount);
          break;
        default:
          throw new Error(`Invalid scroll direction: ${direction}. Use 'up' or 'down'.`);
      }

      return {
        content: [
          {
            type: 'text',
            text: `Scrolled mouse ${direction} by ${amount} steps`,
          },
        ],
      };
    } catch (error) {
      throw new Error(`Failed to scroll mouse: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async getMousePosition(): Promise<any> {
    await this.checkPermissions();

    try {
      // Get current mouse position
      const position = await mouse.getPosition();
      
      // Convert to relative coordinates if we have a focused app
      let relativePosition = null;
      if (this.currentApp) {
        const relativeX = (position.x - this.currentApp.bounds.x) / this.currentApp.bounds.width;
        const relativeY = (position.y - this.currentApp.bounds.y) / this.currentApp.bounds.height;
        relativePosition = {
          x: relativeX,
          y: relativeY,
          app: this.currentApp.name
        };
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              absolute: {
                x: position.x,
                y: position.y
              },
              relative: relativePosition
            }, null, 2),
          },
        ],
      };
    } catch (error) {
      throw new Error(`Failed to get mouse position: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async wait(milliseconds: number): Promise<any> {
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve({
          content: [
            {
              type: 'text',
              text: `Waited for ${milliseconds} milliseconds`,
            },
          ],
        });
      }, milliseconds);
    });
  }

  private async getScreenSize(): Promise<any> {
    await this.checkPermissions();

    try {
      // Get screen size using screenshot-desktop
      const screenshotBuffer = await screenshot();
      const image = await sharp(screenshotBuffer);
      const metadata = await image.metadata();

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              width: metadata.width,
              height: metadata.height,
              channels: metadata.channels,
              format: metadata.format
            }, null, 2),
          },
        ],
      };
    } catch (error) {
      throw new Error(`Failed to get screen size: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('Simplified Enhanced macOS GUI Control MCP server running on stdio');
  }
}

// Start the server
const server = new SimplifiedEnhancedMacOSGUIControlServer();
server.run().catch(console.error);
