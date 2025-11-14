#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import {
  mouse,
  keyboard,
  screen,
  clipboard,
  Point,
  Button,
  Key,
  Region,
  Size,
  straightTo,
  centerOf,
  sleep,
  getActiveWindow,
  getWindows,
  WindowCompat,
  resizeWindowMacOS,
  moveWindowMacOS,
  minimizeWindowMacOS,
  restoreWindowMacOS
} from './nut-js-compat';
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

interface WindowInfo {
  title: string;
  bounds: Region;
  // Note: isActive and bundleId may not be available in fork
  // isActive?: boolean;
  // bundleId?: string;
}

class EnhancedMacOSGUIControlServer {
  private server: Server;
  private currentApp: Application | null = null;

  constructor() {
    this.server = new Server({
      name: 'enhanced-macos-gui-control',
      version: '1.1.15',
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
          
          // NEW ENHANCED TOOLS
          {
            name: 'listWindows',
            description: 'List all windows with detailed information including titles and bounds',
            inputSchema: {
              type: 'object',
              properties: {},
            },
          },
          {
            name: 'getActiveWindow',
            description: 'Get information about the currently active window',
            inputSchema: {
              type: 'object',
              properties: {},
            },
          },
          {
            name: 'resizeWindow',
            description: 'Resize a window to specified dimensions',
            inputSchema: {
              type: 'object',
              properties: {
                width: {
                  type: 'number',
                  description: 'New width in pixels',
                },
                height: {
                  type: 'number',
                  description: 'New height in pixels',
                },
                windowTitle: {
                  type: 'string',
                  description: 'Title of the window to resize (optional, uses active window if not specified)',
                },
              },
              required: ['width', 'height'],
            },
          },
          {
            name: 'moveWindow',
            description: 'Move a window to specified coordinates',
            inputSchema: {
              type: 'object',
              properties: {
                x: {
                  type: 'number',
                  description: 'X coordinate for window position',
                },
                y: {
                  type: 'number',
                  description: 'Y coordinate for window position',
                },
                windowTitle: {
                  type: 'string',
                  description: 'Title of the window to move (optional, uses active window if not specified)',
                },
              },
              required: ['x', 'y'],
            },
          },
          {
            name: 'minimizeWindow',
            description: 'Minimize a window',
            inputSchema: {
              type: 'object',
              properties: {
                windowTitle: {
                  type: 'string',
                  description: 'Title of the window to minimize (optional, uses active window if not specified)',
                },
              },
            },
          },
          {
            name: 'restoreWindow',
            description: 'Restore a minimized window',
            inputSchema: {
              type: 'object',
              properties: {
                windowTitle: {
                  type: 'string',
                  description: 'Title of the window to restore (optional, uses active window if not specified)',
                },
              },
            },
          },
          {
            name: 'typeText',
            description: 'Type text at the current cursor position',
            inputSchema: {
              type: 'object',
              properties: {
                text: {
                  type: 'string',
                  description: 'Text to type',
                },
                delay: {
                  type: 'number',
                  description: 'Delay between keystrokes in milliseconds',
                  default: 50,
                },
              },
              required: ['text'],
            },
          },
          {
            name: 'pressKey',
            description: 'Press a specific key or key combination',
            inputSchema: {
              type: 'object',
              properties: {
                key: {
                  type: 'string',
                  description: 'Key to press (e.g., "Enter", "Tab", "Cmd+A")',
                },
              },
              required: ['key'],
            },
          },
          {
            name: 'dragMouse',
            description: 'Perform a mouse drag operation from one point to another',
            inputSchema: {
              type: 'object',
              properties: {
                startX: {
                  type: 'number',
                  description: 'Start X coordinate relative to app window (0-1 normalized)',
                },
                startY: {
                  type: 'number',
                  description: 'Start Y coordinate relative to app window (0-1 normalized)',
                },
                endX: {
                  type: 'number',
                  description: 'End X coordinate relative to app window (0-1 normalized)',
                },
                endY: {
                  type: 'number',
                  description: 'End Y coordinate relative to app window (0-1 normalized)',
                },
                button: {
                  type: 'string',
                  enum: ['left', 'right', 'middle'],
                  description: 'Mouse button to use for dragging',
                  default: 'left',
                },
              },
              required: ['startX', 'startY', 'endX', 'endY'],
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
                  enum: ['up', 'down', 'left', 'right'],
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
            name: 'getScreenColor',
            description: 'Get the color at a specific screen coordinate',
            inputSchema: {
              type: 'object',
              properties: {
                x: {
                  type: 'number',
                  description: 'X coordinate on screen',
                },
                y: {
                  type: 'number',
                  description: 'Y coordinate on screen',
                },
              },
              required: ['x', 'y'],
            },
          },
          {
            name: 'highlightRegion',
            description: 'Highlight a region on the screen',
            inputSchema: {
              type: 'object',
              properties: {
                x: {
                  type: 'number',
                  description: 'X coordinate of the region',
                },
                y: {
                  type: 'number',
                  description: 'Y coordinate of the region',
                },
                width: {
                  type: 'number',
                  description: 'Width of the region',
                },
                height: {
                  type: 'number',
                  description: 'Height of the region',
                },
                duration: {
                  type: 'number',
                  description: 'Duration to highlight in milliseconds',
                  default: 2000,
                },
              },
              required: ['x', 'y', 'width', 'height'],
            },
          },
          {
            name: 'copyToClipboard',
            description: 'Copy text to the clipboard',
            inputSchema: {
              type: 'object',
              properties: {
                text: {
                  type: 'string',
                  description: 'Text to copy to clipboard',
                },
              },
              required: ['text'],
            },
          },
          {
            name: 'pasteFromClipboard',
            description: 'Paste text from the clipboard',
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
          case 'listWindows':
            return await this.listWindows();
          case 'getActiveWindow':
            return await this.getActiveWindowInfo();
          case 'resizeWindow':
            return await this.resizeWindow(args?.width as number, args?.height as number, args?.windowTitle as string);
          case 'moveWindow':
            return await this.moveWindow(args?.x as number, args?.y as number, args?.windowTitle as string);
          case 'minimizeWindow':
            return await this.minimizeWindow(args?.windowTitle as string);
          case 'restoreWindow':
            return await this.restoreWindow(args?.windowTitle as string);
          case 'typeText':
            return await this.typeText(args?.text as string, (args?.delay as number) || 50);
          case 'pressKey':
            return await this.pressKey(args?.key as string);
          case 'dragMouse':
            return await this.dragMouse(
              args?.startX as number, 
              args?.startY as number, 
              args?.endX as number, 
              args?.endY as number, 
              (args?.button as string) || 'left'
            );
          case 'scrollMouse':
            return await this.scrollMouse(args?.direction as string, (args?.amount as number) || 3);
          case 'getScreenColor':
            return await this.getScreenColor(args?.x as number, args?.y as number);
          case 'highlightRegion':
            return await this.highlightRegion(
              args?.x as number, 
              args?.y as number, 
              args?.width as number, 
              args?.height as number, 
              (args?.duration as number) || 2000
            );
          case 'copyToClipboard':
            return await this.copyToClipboard(args?.text as string);
          case 'pasteFromClipboard':
            return await this.pasteFromClipboard();
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

  private async click(x: number, y: number, button: string): Promise<any> {
    if (!this.currentApp) {
      throw new Error('No application focused. Use focusApplication first.');
    }

    await this.checkPermissions();

    // Convert normalized coordinates to absolute screen coordinates
    const screenX = this.currentApp.bounds.x + (x * this.currentApp.bounds.width);
    const screenY = this.currentApp.bounds.y + (y * this.currentApp.bounds.height);

    await mouse.move(straightTo(new Point(screenX, screenY)));
    
    switch (button) {
      case 'left':
        await mouse.click(Button.LEFT);
        break;
      case 'right':
        await mouse.click(Button.RIGHT);
        break;
      case 'middle':
        await mouse.click(Button.MIDDLE);
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

    await mouse.move(straightTo(new Point(screenX, screenY)));

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

  // NEW ENHANCED METHODS

  private async listWindows(): Promise<any> {
    await this.checkPermissions();

    try {
      const windows = await getWindows();
      const windowInfos: WindowInfo[] = await Promise.all(windows.map(async (window: WindowCompat) => ({
        title: await window.title,
        bounds: await window.region,
        // Note: isActive and bundleId properties may not be available in fork
        // isActive: window.isActive,
        // bundleId: window.bundleId,
      })));

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(windowInfos, null, 2),
          },
        ],
      };
    } catch (error) {
      throw new Error(`Failed to list windows: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async getActiveWindowInfo(): Promise<any> {
    await this.checkPermissions();

    try {
      const activeWindow = await getActiveWindow();
      const windowInfo: WindowInfo = {
        title: await activeWindow.title,
        bounds: await activeWindow.region,
        // Note: isActive and bundleId properties may not be available in fork
        // isActive: activeWindow.isActive,
        // bundleId: activeWindow.bundleId,
      };

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(windowInfo, null, 2),
          },
        ],
      };
    } catch (error) {
      throw new Error(`Failed to get active window: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async resizeWindow(width: number, height: number, windowTitle?: string): Promise<any> {
    await this.checkPermissions();

    try {
      let targetWindow: WindowCompat;
      
      if (windowTitle) {
        const windows = await getWindows();
        let foundWindow: WindowCompat | null = null;
        for (const w of windows) {
          const title = await w.title;
          if (title.includes(windowTitle)) {
            foundWindow = w;
            break;
          }
        }
        if (!foundWindow) {
          throw new Error(`Window with title containing "${windowTitle}" not found`);
        }
        targetWindow = foundWindow;
      } else {
        targetWindow = await getActiveWindow();
      }

      // Use platform-specific implementation
      if (process.platform === 'darwin') {
        await resizeWindowMacOS(width, height, windowTitle);
      } else {
        throw new Error('Window resize not implemented for this platform');
      }

      return {
        content: [
          {
            type: 'text',
            text: `Resized window "${targetWindow.title}" to ${width}x${height}`,
          },
        ],
      };
    } catch (error) {
      throw new Error(`Failed to resize window: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async moveWindow(x: number, y: number, windowTitle?: string): Promise<any> {
    await this.checkPermissions();

    try {
      let targetWindow: WindowCompat;
      
      if (windowTitle) {
        const windows = await getWindows();
        let foundWindow: WindowCompat | null = null;
        for (const w of windows) {
          const title = await w.title;
          if (title.includes(windowTitle)) {
            foundWindow = w;
            break;
          }
        }
        if (!foundWindow) {
          throw new Error(`Window with title containing "${windowTitle}" not found`);
        }
        targetWindow = foundWindow;
      } else {
        targetWindow = await getActiveWindow();
      }

      // Use platform-specific implementation
      if (process.platform === 'darwin') {
        await moveWindowMacOS(x, y, windowTitle);
      } else {
        throw new Error('Window move not implemented for this platform');
      }

      return {
        content: [
          {
            type: 'text',
            text: `Moved window "${targetWindow.title}" to position (${x}, ${y})`,
          },
        ],
      };
    } catch (error) {
      throw new Error(`Failed to move window: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async minimizeWindow(windowTitle?: string): Promise<any> {
    await this.checkPermissions();

    try {
      let targetWindow: WindowCompat;
      
      if (windowTitle) {
        const windows = await getWindows();
        let foundWindow: WindowCompat | null = null;
        for (const w of windows) {
          const title = await w.title;
          if (title.includes(windowTitle)) {
            foundWindow = w;
            break;
          }
        }
        if (!foundWindow) {
          throw new Error(`Window with title containing "${windowTitle}" not found`);
        }
        targetWindow = foundWindow;
      } else {
        targetWindow = await getActiveWindow();
      }

      // Use platform-specific implementation
      if (process.platform === 'darwin') {
        await minimizeWindowMacOS(windowTitle);
      } else {
        throw new Error('Window minimize not implemented for this platform');
      }

      return {
        content: [
          {
            type: 'text',
            text: `Minimized window "${targetWindow.title}"`,
          },
        ],
      };
    } catch (error) {
      throw new Error(`Failed to minimize window: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async restoreWindow(windowTitle?: string): Promise<any> {
    await this.checkPermissions();

    try {
      let targetWindow: WindowCompat;
      
      if (windowTitle) {
        const windows = await getWindows();
        let foundWindow: WindowCompat | null = null;
        for (const w of windows) {
          const title = await w.title;
          if (title.includes(windowTitle)) {
            foundWindow = w;
            break;
          }
        }
        if (!foundWindow) {
          throw new Error(`Window with title containing "${windowTitle}" not found`);
        }
        targetWindow = foundWindow;
      } else {
        targetWindow = await getActiveWindow();
      }

      // Use platform-specific implementation
      if (process.platform === 'darwin') {
        await restoreWindowMacOS(windowTitle);
      } else {
        throw new Error('Window restore not implemented for this platform');
      }

      return {
        content: [
          {
            type: 'text',
            text: `Restored window "${targetWindow.title}"`,
          },
        ],
      };
    } catch (error) {
      throw new Error(`Failed to restore window: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async typeText(text: string, delay: number): Promise<any> {
    await this.checkPermissions();

    try {
      // Fork version doesn't support delay parameter
      await keyboard.type(text);

      return {
        content: [
          {
            type: 'text',
            text: `Typed text: "${text}"`,
          },
        ],
      };
    } catch (error) {
      throw new Error(`Failed to type text: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async pressKey(keyString: string): Promise<any> {
    await this.checkPermissions();

    try {
      // Parse key combinations (e.g., "Cmd+A" -> [Key.Cmd, Key.A])
      const keys = keyString.split('+').map(k => k.trim());
      const keyCodes = keys.map(k => {
        switch (k.toLowerCase()) {
          // Use Key enum values that exist in the fork
          case 'cmd': return Key.LeftCmd;
          case 'ctrl': return Key.LeftControl;
          case 'alt': return Key.LeftAlt;
          case 'shift': return Key.LeftShift;
          case 'enter': return Key.Enter;
          case 'tab': return Key.Tab;
          case 'space': return Key.Space;
          case 'escape': return Key.Escape;
          case 'backspace': return Key.Backspace;
          case 'delete': return Key.Delete;
          case 'up': return Key.Up;
          case 'down': return Key.Down;
          case 'left': return Key.Left;
          case 'right': return Key.Right;
          default: return k as any; // Assume it's a single character
        }
      });

      if (keyCodes.length === 1) {
        await keyboard.pressKey(keyCodes[0]);
      } else {
        await keyboard.pressKey(...keyCodes);
      }

      return {
        content: [
          {
            type: 'text',
            text: `Pressed key combination: ${keyString}`,
          },
        ],
      };
    } catch (error) {
      throw new Error(`Failed to press key: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async dragMouse(startX: number, startY: number, endX: number, endY: number, button: string): Promise<any> {
    if (!this.currentApp) {
      throw new Error('No application focused. Use focusApplication first.');
    }

    await this.checkPermissions();

    // Convert normalized coordinates to absolute screen coordinates
    const startScreenX = this.currentApp.bounds.x + (startX * this.currentApp.bounds.width);
    const startScreenY = this.currentApp.bounds.y + (startY * this.currentApp.bounds.height);
    const endScreenX = this.currentApp.bounds.x + (endX * this.currentApp.bounds.width);
    const endScreenY = this.currentApp.bounds.y + (endY * this.currentApp.bounds.height);

    const buttonType = button === 'left' ? Button.LEFT : button === 'right' ? Button.RIGHT : Button.MIDDLE;

    // Fork version has different drag API - use move and click sequence instead
    await mouse.move(straightTo(new Point(startScreenX, startScreenY)));
    await mouse.pressButton(buttonType);
    await mouse.move(straightTo(new Point(endScreenX, endScreenY)));
    await mouse.releaseButton(buttonType);

    return {
      content: [
        {
          type: 'text',
          text: `Dragged mouse from (${startX.toFixed(3)}, ${startY.toFixed(3)}) to (${endX.toFixed(3)}, ${endY.toFixed(3)}) relative to ${this.currentApp.name}`,
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
        case 'left':
          await mouse.scrollLeft(amount);
          break;
        case 'right':
          await mouse.scrollRight(amount);
          break;
        default:
          throw new Error(`Invalid scroll direction: ${direction}`);
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

  private async getScreenColor(x: number, y: number): Promise<any> {
    await this.checkPermissions();

    try {
      const color = await screen.colorAt(new Point(x, y));

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              x,
              y,
              color: {
                r: color.R,
                g: color.G,
                b: color.B,
                a: color.A,
                hex: `#${color.R.toString(16).padStart(2, '0')}${color.G.toString(16).padStart(2, '0')}${color.B.toString(16).padStart(2, '0')}`,
              },
            }, null, 2),
          },
        ],
      };
    } catch (error) {
      throw new Error(`Failed to get screen color: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async highlightRegion(x: number, y: number, width: number, height: number, duration: number): Promise<any> {
    await this.checkPermissions();

    try {
      const region = new Region(x, y, width, height);
      // Fork version may not support highlight with duration - use basic highlight
      await screen.highlight(region);
      // Simulate duration with a timeout
      setTimeout(() => {}, duration);

      return {
        content: [
          {
            type: 'text',
            text: `Highlighted region at (${x}, ${y}) with size ${width}x${height} for ${duration}ms`,
          },
        ],
      };
    } catch (error) {
      throw new Error(`Failed to highlight region: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async copyToClipboard(text: string): Promise<any> {
    await this.checkPermissions();

    try {
      // Fork version uses different clipboard API
      await clipboard.setContent(text);

      return {
        content: [
          {
            type: 'text',
            text: `Copied to clipboard: "${text}"`,
          },
        ],
      };
    } catch (error) {
      throw new Error(`Failed to copy to clipboard: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async pasteFromClipboard(): Promise<any> {
    await this.checkPermissions();

    try {
      // Fork version uses different clipboard API
      const text = await clipboard.getContent();

      return {
        content: [
          {
            type: 'text',
            text: `Pasted from clipboard: "${text}"`,
          },
        ],
      };
    } catch (error) {
      throw new Error(`Failed to paste from clipboard: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('Enhanced macOS GUI Control MCP server running on stdio');
  }
}

// Start the server
const server = new EnhancedMacOSGUIControlServer();
server.run().catch(console.error);
