#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
// @ts-ignore
import { screenshotDesktop } from 'screenshot-desktop';
import { mouse, Button, keyboard, Key } from '@nut-tree-fork/nut-js';
import { run } from '@jxa/run';
import sharp from 'sharp';
// @ts-ignore
import { checkPermissions } from 'node-mac-permissions';

// Type declarations for modules without types
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

interface WindowBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

class AdvancedServerSimple {
  private server: Server;
  private currentApp: AppInfo | null = null;

  constructor() {
    this.server = new Server({
      name: 'mcp-eyes-advanced',
      version: '1.1.12',
    });

    this.setupToolHandlers();
    this.setupErrorHandling();
  }

  private setupErrorHandling(): void {
    this.server.onerror = (error) => {
      console.error('[MCP Error]', error);
    };

    process.on('SIGINT', async () => {
      await this.server.close();
      process.exit(0);
    });
  }

  private setupToolHandlers(): void {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          // Basic Tools
          {
            name: 'listApplications',
            description: 'List all running applications with their window bounds and identifiers.',
            inputSchema: {
              type: 'object',
              properties: {},
            },
          },
          {
            name: 'focusApplication',
            description: 'Focus on a specific application by bundle ID or PID.',
            inputSchema: {
              type: 'object',
              properties: {
                identifier: {
                  type: 'string',
                  description: 'Bundle ID (e.g., com.apple.Safari) or PID of the application to focus',
                },
              },
              required: ['identifier'],
            },
          },
          {
            name: 'click',
            description: 'Perform a mouse click at specified coordinates relative to the focused app window.',
            inputSchema: {
              type: 'object',
              properties: {
                x: {
                  type: 'number',
                  description: 'X coordinate relative to the app window (0-1 normalized)',
                  minimum: 0,
                  maximum: 1,
                },
                y: {
                  type: 'number',
                  description: 'Y coordinate relative to the app window (0-1 normalized)',
                  minimum: 0,
                  maximum: 1,
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
            description: 'Move mouse to specified coordinates relative to the focused app window.',
            inputSchema: {
              type: 'object',
              properties: {
                x: {
                  type: 'number',
                  description: 'X coordinate relative to the app window (0-1 normalized)',
                  minimum: 0,
                  maximum: 1,
                },
                y: {
                  type: 'number',
                  description: 'Y coordinate relative to the app window (0-1 normalized)',
                  minimum: 0,
                  maximum: 1,
                },
              },
              required: ['x', 'y'],
            },
          },
          {
            name: 'screenshot',
            description: 'Take a screenshot of the focused application window.',
            inputSchema: {
              type: 'object',
              properties: {
                padding: {
                  type: 'number',
                  description: 'Padding around the window in pixels',
                  default: 10,
                },
                format: {
                  type: 'string',
                  enum: ['png', 'jpg'],
                  description: 'Image format (png or jpg)',
                  default: 'png',
                },
                quality: {
                  type: 'number',
                  description: 'JPEG quality (1-100, only applies to JPG format)',
                  default: 90,
                },
              },
            },
          },
          // Apple Accessibility Tools
          {
            name: 'getClickableElements',
            description: 'Get all clickable elements in the focused application using Apple Accessibility.',
            inputSchema: {
              type: 'object',
              properties: {},
            },
          },
          {
            name: 'clickElement',
            description: 'Click a specific element by index from getClickableElements.',
            inputSchema: {
              type: 'object',
              properties: {
                elementIndex: {
                  type: 'number',
                  description: 'Index of the element to click (from getClickableElements)',
                },
              },
              required: ['elementIndex'],
            },
          },
          // Advanced Tools
          {
            name: 'typeText',
            description: 'Type text at the current cursor position.',
            inputSchema: {
              type: 'object',
              properties: {
                text: {
                  type: 'string',
                  description: 'Text to type',
                },
                clearFirst: {
                  type: 'boolean',
                  description: 'Clear existing text before typing',
                  default: false,
                },
              },
              required: ['text'],
            },
          },
          {
            name: 'pressKey',
            description: 'Press key combinations.',
            inputSchema: {
              type: 'object',
              properties: {
                key: {
                  type: 'string',
                  description: 'Key combination (e.g., "Cmd+A", "Enter", "Tab")',
                },
              },
              required: ['key'],
            },
          },
          {
            name: 'doubleClick',
            description: 'Perform a double-click at specified coordinates.',
            inputSchema: {
              type: 'object',
              properties: {
                x: {
                  type: 'number',
                  description: 'X coordinate relative to the app window (0-1 normalized)',
                  minimum: 0,
                  maximum: 1,
                },
                y: {
                  type: 'number',
                  description: 'Y coordinate relative to the app window (0-1 normalized)',
                  minimum: 0,
                  maximum: 1,
                },
              },
              required: ['x', 'y'],
            },
          },
          {
            name: 'scrollMouse',
            description: 'Scroll the mouse wheel.',
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
                  description: 'Scroll amount (positive for up, negative for down)',
                  default: 3,
                },
              },
              required: ['direction'],
            },
          },
          {
            name: 'getMousePosition',
            description: 'Get the current mouse position.',
            inputSchema: {
              type: 'object',
              properties: {},
            },
          },
          {
            name: 'wait',
            description: 'Wait for a specified amount of time.',
            inputSchema: {
              type: 'object',
              properties: {
                milliseconds: {
                  type: 'number',
                  description: 'Time to wait in milliseconds',
                  default: 1000,
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
          // Basic Tools
          case 'listApplications':
            return await this.listApplications();

          case 'focusApplication':
            return await this.focusApplication(args?.identifier as string);

          case 'click':
            return await this.click(args?.x as number, args?.y as number, (args?.button as string) || 'left');

          case 'moveMouse':
            return await this.moveMouse(args?.x as number, args?.y as number);

          case 'screenshot':
            return await this.screenshot((args?.padding as number) || 10, (args?.format as string) || 'png', (args?.quality as number) || 90);

          // Apple Accessibility Tools
          case 'getClickableElements':
            return await this.getClickableElements();

          case 'clickElement':
            return await this.clickElement(args?.elementIndex as number);

          // Advanced Tools
          case 'typeText':
            return await this.typeText(args?.text as string, (args?.clearFirst as boolean) || false);

          case 'pressKey':
            return await this.pressKey(args?.key as string);

          case 'doubleClick':
            return await this.doubleClick(args?.x as number, args?.y as number);

          case 'scrollMouse':
            return await this.scrollMouse(args?.direction as string, (args?.amount as number) || 3);

          case 'getMousePosition':
            return await this.getMousePosition();

          case 'wait':
            return await this.wait((args?.milliseconds as number) || 1000);

          default:
            throw new Error(`Unknown tool: ${name}`);
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        return {
          content: [
            {
              type: 'text',
              text: `Error: ${errorMessage}`,
            },
          ],
        };
      }
    });
  }

  // Basic Tools Implementation (same as basic server)
  private async listApplications(): Promise<any> {
    try {
      const apps = await run(() => {
        const app = Application.currentApplication();
        app.includeStandardAdditions = true;

        const runningApps = Application('System Events').applicationProcesses();
        const appList = [];

        for (let i = 0; i < runningApps.length; i++) {
          const appName = runningApps[i].name();
          const appBundleId = runningApps[i].bundleIdentifier();
          const appPid = runningApps[i].unixId();

          // Get window bounds
          const windows = runningApps[i].windows();
          let bounds = { x: 0, y: 0, width: 0, height: 0 };

          if (windows.length > 0) {
            const window = windows[0];
            bounds = {
              x: window.position()[0],
              y: window.position()[1],
              width: window.size()[0],
              height: window.size()[1],
            };
          }

          appList.push({
            name: appName,
            bundleId: appBundleId,
            pid: appPid,
            bounds: bounds,
          });
        }

        return appList;
      });

      return {
        content: [
          {
            type: 'text',
            text: `Found ${(apps as any[]).length} running applications:\n\n${(apps as any[])
              .map(
                (app: AppInfo) =>
                  `• ${app.name} (${app.bundleId})\n  PID: ${app.pid}\n  Bounds: ${app.bounds.width}x${app.bounds.height} at (${app.bounds.x}, ${app.bounds.y})`
              )
              .join('\n\n')}`,
          },
        ],
      };
    } catch (error) {
      throw new Error(`Failed to list applications: ${error}`);
    }
  }

  private async focusApplication(identifier: string): Promise<any> {
    try {
      const appInfo = await run((identifier) => {
        const app = Application.currentApplication();
        app.includeStandardAdditions = true;

        // Try to find app by bundle ID first, then by name
        const runningApps = Application('System Events').applicationProcesses();
        let targetApp = null;

        for (let i = 0; i < runningApps.length; i++) {
          const appBundleId = runningApps[i].bundleIdentifier();
          const appName = runningApps[i].name();
          
          if (appBundleId === identifier || appName === identifier) {
            targetApp = runningApps[i];
            break;
          }
        }

        if (!targetApp) {
          throw new Error(`Application not found: ${identifier}`);
        }

        // Activate the application
        targetApp.activate();

        // Get updated bounds after activation
        const windows = targetApp.windows();
        let bounds = { x: 0, y: 0, width: 0, height: 0 };

        if (windows.length > 0) {
          const window = windows[0];
          bounds = {
            x: window.position()[0],
            y: window.position()[1],
            width: window.size()[0],
            height: window.size()[1],
          };
        }

        return {
          name: targetApp.name(),
          bundleId: targetApp.bundleIdentifier(),
          pid: targetApp.unixId(),
          bounds: bounds,
        };
      }, identifier);

      this.currentApp = appInfo as AppInfo;

      return {
        content: [
          {
            type: 'text',
            text: `Focused on ${(appInfo as any).name} (${(appInfo as any).bundleId})\nPID: ${(appInfo as any).pid}\nBounds: ${(appInfo as any).bounds.width}x${(appInfo as any).bounds.height} at (${(appInfo as any).bounds.x}, ${(appInfo as any).bounds.y})`,
          },
        ],
      };
    } catch (error) {
      throw new Error(`Failed to focus application: ${error}`);
    }
  }

  private async click(x: number, y: number, button: string): Promise<any> {
    if (!this.currentApp) {
      throw new Error('No application focused. Use focusApplication first.');
    }

    try {
      // Convert normalized coordinates to absolute screen coordinates
      const screenX = this.currentApp.bounds.x + (x * this.currentApp.bounds.width);
      const screenY = this.currentApp.bounds.y + (y * this.currentApp.bounds.height);

      // Map button string to nut-js Button enum
      const buttonMap: { [key: string]: Button } = {
        left: Button.LEFT,
        right: Button.RIGHT,
        middle: Button.MIDDLE,
      };

      await mouse.setPosition({ x: screenX, y: screenY });
      await mouse.click(buttonMap[button]);

      return {
        content: [
          {
            type: 'text',
            text: `Clicked ${button} button at normalized (${x}, ${y}) -> screen (${Math.round(screenX)}, ${Math.round(screenY)})`,
          },
        ],
      };
    } catch (error) {
      throw new Error(`Failed to click: ${error}`);
    }
  }

  private async moveMouse(x: number, y: number): Promise<any> {
    if (!this.currentApp) {
      throw new Error('No application focused. Use focusApplication first.');
    }

    try {
      // Convert normalized coordinates to absolute screen coordinates
      const screenX = this.currentApp.bounds.x + (x * this.currentApp.bounds.width);
      const screenY = this.currentApp.bounds.y + (y * this.currentApp.bounds.height);

      await mouse.setPosition({ x: screenX, y: screenY });

      return {
        content: [
          {
            type: 'text',
            text: `Moved mouse to normalized (${x}, ${y}) -> screen (${Math.round(screenX)}, ${Math.round(screenY)})`,
          },
        ],
      };
    } catch (error) {
      throw new Error(`Failed to move mouse: ${error}`);
    }
  }

  private async screenshot(padding: number, format: string, quality: number): Promise<any> {
    if (!this.currentApp) {
      throw new Error('No application focused. Use focusApplication first.');
    }

    try {
      // Check permissions
      const screenRecordingStatus = await checkPermissions('screen');
      if (screenRecordingStatus !== 'authorized') {
        throw new Error('Screen Recording permission is required. Please grant permission in System Preferences > Security & Privacy > Privacy > Screen Recording.');
      }

      // Take full screen screenshot
      const fullScreenImage = await screenshotDesktop();

      // Calculate crop area with padding
      const cropX = Math.max(0, this.currentApp.bounds.x - padding);
      const cropY = Math.max(0, this.currentApp.bounds.y - padding);
      const cropWidth = Math.min(
        fullScreenImage.width - cropX,
        this.currentApp.bounds.width + (padding * 2)
      );
      const cropHeight = Math.min(
        fullScreenImage.height - cropY,
        this.currentApp.bounds.height + (padding * 2)
      );

      // Crop the image
      const croppedImage = await sharp(fullScreenImage)
        .extract({
          left: cropX,
          top: cropY,
          width: cropWidth,
          height: cropHeight,
        })
        .toFormat(format as any, { quality })
        .toBuffer();

      const base64Image = croppedImage.toString('base64');
      const mimeType = format === 'jpg' ? 'image/jpeg' : 'image/png';

      return {
        content: [
          {
            type: 'text',
            text: `Screenshot taken of ${this.currentApp.name} (${cropWidth}x${cropHeight}px)`,
          },
          {
            type: 'image',
            data: base64Image,
            mimeType: mimeType,
          },
        ],
      };
    } catch (error) {
      throw new Error(`Failed to take screenshot: ${error}`);
    }
  }

  // Apple Accessibility Tools Implementation (same as basic server)
  private async getClickableElements(): Promise<any> {
    if (!this.currentApp) {
      throw new Error('No application focused. Use focusApplication first.');
    }

    try {
      const elements = await run(() => {
        const app = Application.currentApplication();
        app.includeStandardAdditions = true;

        const runningApps = Application('System Events').applicationProcesses();
        let targetApp = null;

        // Find the current app
        for (let i = 0; i < runningApps.length; i++) {
          if (runningApps[i].bundleIdentifier() === this.currentApp!.bundleId) {
            targetApp = runningApps[i];
            break;
          }
        }

        if (!targetApp) {
          throw new Error('Target application not found');
        }

        const elements = [];
        const windows = targetApp.windows();

        if (windows.length > 0) {
          const window = windows[0];
          const uiElements = window.UIElements();

          for (let i = 0; i < uiElements.length; i++) {
            const element = uiElements[i];
            const elementType = element.class();
            const elementText = element.value() || element.title() || '';
            const elementBounds = element.bounds();
            const isClickable = element.clickable();
            const isEnabled = element.enabled();

            if (isClickable && isEnabled) {
              elements.push({
                index: elements.length,
                type: elementType,
                text: elementText,
                bounds: {
                  x: elementBounds[0],
                  y: elementBounds[1],
                  width: elementBounds[2] - elementBounds[0],
                  height: elementBounds[3] - elementBounds[1],
                },
                normalizedPosition: {
                  x: (elementBounds[0] - this.currentApp!.bounds.x) / this.currentApp!.bounds.width,
                  y: (elementBounds[1] - this.currentApp!.bounds.y) / this.currentApp!.bounds.height,
                },
                screenPosition: {
                  x: elementBounds[0],
                  y: elementBounds[1],
                },
                isClickable: isClickable,
                isEnabled: isEnabled,
              });
            }
          }
        }

        return elements;
      });

      return {
        content: [
          {
            type: 'text',
            text: `Found ${(elements as any[]).length} clickable elements in ${this.currentApp!.name}:\n\n${(elements as any[])
              .map(
                (element: any) =>
                  `${element.index}. "${element.text}" (${element.type})\n   Screen: (${element.screenPosition.x}, ${element.screenPosition.y})\n   Normalized: (${element.normalizedPosition.x.toFixed(3)}, ${element.normalizedPosition.y.toFixed(3)})`
              )
              .join('\n\n')}`,
          },
        ],
      };
    } catch (error) {
      throw new Error(`Failed to get clickable elements: ${error}`);
    }
  }

  private async clickElement(elementIndex: number): Promise<any> {
    if (!this.currentApp) {
      throw new Error('No application focused. Use focusApplication first.');
    }

    try {
      const elements = await run(() => {
        const app = Application.currentApplication();
        app.includeStandardAdditions = true;

        const runningApps = Application('System Events').applicationProcesses();
        let targetApp = null;

        // Find the current app
        for (let i = 0; i < runningApps.length; i++) {
          if (runningApps[i].bundleIdentifier() === this.currentApp!.bundleId) {
            targetApp = runningApps[i];
            break;
          }
        }

        if (!targetApp) {
          throw new Error('Target application not found');
        }

        const elements = [];
        const windows = targetApp.windows();

        if (windows.length > 0) {
          const window = windows[0];
          const uiElements = window.UIElements();

          for (let i = 0; i < uiElements.length; i++) {
            const element = uiElements[i];
            const elementType = element.class();
            const elementText = element.value() || element.title() || '';
            const elementBounds = element.bounds();
            const isClickable = element.clickable();
            const isEnabled = element.enabled();

            if (isClickable && isEnabled) {
              elements.push({
                index: elements.length,
                type: elementType,
                text: elementText,
                bounds: {
                  x: elementBounds[0],
                  y: elementBounds[1],
                  width: elementBounds[2] - elementBounds[0],
                  height: elementBounds[3] - elementBounds[1],
                },
                normalizedPosition: {
                  x: (elementBounds[0] - this.currentApp!.bounds.x) / this.currentApp!.bounds.width,
                  y: (elementBounds[1] - this.currentApp!.bounds.y) / this.currentApp!.bounds.height,
                },
                screenPosition: {
                  x: elementBounds[0],
                  y: elementBounds[1],
                },
                isClickable: isClickable,
                isEnabled: isEnabled,
              });
            }
          }
        }

        return elements;
      });

      if (elementIndex < 0 || elementIndex >= (elements as any[]).length) {
        throw new Error(`Element index ${elementIndex} is out of range. Available elements: 0-${(elements as any[]).length - 1}`);
      }

      const element = (elements as any[])[elementIndex];
      const normalizedX = element.normalizedPosition.x;
      const normalizedY = element.normalizedPosition.y;

      // Use the existing click method
      return await this.click(normalizedX, normalizedY, 'left');
    } catch (error) {
      throw new Error(`Failed to click element: ${error}`);
    }
  }

  // Advanced Tools Implementation
  private async typeText(text: string, clearFirst: boolean): Promise<any> {
    try {
      if (clearFirst) {
        await keyboard.pressKey(Key.LeftCmd, Key.A);
        await keyboard.pressKey(Key.Delete);
      }

      await keyboard.type(text);

      return {
        content: [
          {
            type: 'text',
            text: `Typed "${text}"${clearFirst ? ' (cleared existing text first)' : ''}`,
          },
        ],
      };
    } catch (error) {
      throw new Error(`Failed to type text: ${error}`);
    }
  }

  private async pressKey(key: string): Promise<any> {
    try {
      // Map common key combinations
      const keyMap: { [key: string]: Key[] } = {
        'Cmd+A': [Key.LeftCmd, Key.A],
        'Cmd+C': [Key.LeftCmd, Key.C],
        'Cmd+V': [Key.LeftCmd, Key.V],
        'Cmd+Z': [Key.LeftCmd, Key.Z],
        'Enter': [Key.Enter],
        'Tab': [Key.Tab],
        'Escape': [Key.Escape],
        'Space': [Key.Space],
      };

      const keys = keyMap[key];
      if (!keys) {
        throw new Error(`Unknown key combination: ${key}`);
      }

      await keyboard.pressKey(...keys);

      return {
        content: [
          {
            type: 'text',
            text: `Pressed key combination: ${key}`,
          },
        ],
      };
    } catch (error) {
      throw new Error(`Failed to press key: ${error}`);
    }
  }

  private async doubleClick(x: number, y: number): Promise<any> {
    if (!this.currentApp) {
      throw new Error('No application focused. Use focusApplication first.');
    }

    try {
      // Convert normalized coordinates to absolute screen coordinates
      const screenX = this.currentApp.bounds.x + (x * this.currentApp.bounds.width);
      const screenY = this.currentApp.bounds.y + (y * this.currentApp.bounds.height);

      await mouse.setPosition({ x: screenX, y: screenY });
      await mouse.doubleClick(Button.LEFT);

      return {
        content: [
          {
            type: 'text',
            text: `Double-clicked at normalized (${x}, ${y}) -> screen (${Math.round(screenX)}, ${Math.round(screenY)})`,
          },
        ],
      };
    } catch (error) {
      throw new Error(`Failed to double-click: ${error}`);
    }
  }

  private async scrollMouse(direction: string, amount: number): Promise<any> {
    try {
      const scrollAmount = direction === 'up' ? amount : -amount;
      await mouse.scrollUp(scrollAmount);

      return {
        content: [
          {
            type: 'text',
            text: `Scrolled mouse ${direction} by ${amount} units`,
          },
        ],
      };
    } catch (error) {
      throw new Error(`Failed to scroll mouse: ${error}`);
    }
  }

  private async getMousePosition(): Promise<any> {
    try {
      const position = await mouse.getPosition();

      return {
        content: [
          {
            type: 'text',
            text: `Current mouse position: (${position.x}, ${position.y})`,
          },
        ],
      };
    } catch (error) {
      throw new Error(`Failed to get mouse position: ${error}`);
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

  async run(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('MCP Eyes Advanced Server running on stdio');
  }
}

const server = new AdvancedServerSimple();
server.run().catch(console.error);
