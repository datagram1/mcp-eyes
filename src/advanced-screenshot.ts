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

interface WindowInfo {
  displayId: number;
  bounds: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  wasOffScreen: boolean;
}

interface Display {
  id: string;
  name: string;
}

class AdvancedScreenshotMacOSGUIControlServer {
  private server: Server;
  private currentApp: Application | null = null;
  private logFile: string = '/Users/richardbrown/dev/mcp_eyes/test-screenshots/mcp-eyes-debug-log.md';

  constructor() {
    this.server = new Server({
      name: 'advanced-screenshot-macos-gui-control',
      version: '1.1.12',
    });

    this.setupToolHandlers();
  }

  private async log(message: string): Promise<void> {
    try {
      const timestamp = new Date().toISOString();
      const logEntry = `- ${timestamp}: ${message}\n`;
      await fs.promises.appendFile(this.logFile, logEntry);
    } catch (error) {
      console.error('Failed to write to log file:', error);
    }
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
          
          // ADVANCED SCREENSHOT TOOLS
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
          {
            name: 'screenshotFullScreen',
            description: 'Take a screenshot of the entire screen',
            inputSchema: {
              type: 'object',
              properties: {
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
                saveToFile: {
                  type: 'string',
                  description: 'Optional: Save to file path instead of returning base64',
                },
              },
            },
          },
          {
            name: 'screenshotDisplay',
            description: 'Take a screenshot of a specific display',
            inputSchema: {
              type: 'object',
              properties: {
                displayId: {
                  type: 'string',
                  description: 'Display ID (use listDisplays to see available displays)',
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
                saveToFile: {
                  type: 'string',
                  description: 'Optional: Save to file path instead of returning base64',
                },
              },
              required: ['displayId'],
            },
          },
          {
            name: 'screenshotAllDisplays',
            description: 'Take screenshots of all displays simultaneously',
            inputSchema: {
              type: 'object',
              properties: {
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
                saveToFiles: {
                  type: 'string',
                  description: 'Optional: Directory to save files (will generate timestamped names)',
                },
              },
            },
          },
          {
            name: 'listDisplays',
            description: 'List all available displays',
            inputSchema: {
              type: 'object',
              properties: {},
            },
          },
          {
            name: 'screenshotRegion',
            description: 'Take a screenshot of a specific screen region',
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
                saveToFile: {
                  type: 'string',
                  description: 'Optional: Save to file path instead of returning base64',
                },
              },
              required: ['x', 'y', 'width', 'height'],
            },
          },
          {
            name: 'screenshotWithTimestamp',
            description: 'Take a screenshot and save it with a timestamped filename',
            inputSchema: {
              type: 'object',
              properties: {
                directory: {
                  type: 'string',
                  description: 'Directory to save the screenshot',
                  default: './screenshots',
                },
                prefix: {
                  type: 'string',
                  description: 'Filename prefix',
                  default: 'screenshot',
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
                padding: {
                  type: 'number',
                  description: 'Padding around the focused app window (if no app focused, takes full screen)',
                  default: 10,
                },
              },
            },
          },
          {
            name: 'focusApplicationDirect',
            description: 'Directly focus on an application by name (simpler, more reliable method)',
            inputSchema: {
              type: 'object',
              properties: {
                appName: {
                  type: 'string',
                  description: 'Name of the application to focus (e.g., "Claude", "Safari", "Finder")',
                },
              },
              required: ['appName'],
            },
          },
          {
            name: 'screenshotApplication',
            description: 'Smart screenshot of a specific application - automatically finds the app across all displays and takes a targeted screenshot',
            inputSchema: {
              type: 'object',
              properties: {
                appName: {
                  type: 'string',
                  description: 'Name of the application to screenshot (e.g., "Claude", "Safari", "Finder")',
                },
                padding: {
                  type: 'number',
                  description: 'Padding around the application window in pixels',
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
                saveToFile: {
                  type: 'string',
                  description: 'Optional: Save to file path instead of returning base64',
                },
                moveToPrimary: {
                  type: 'boolean',
                  description: 'Optional: Move the app window to primary display before screenshot',
                  default: false,
                },
              },
              required: ['appName'],
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
          
          // Advanced screenshot tools
          case 'screenshot':
            return await this.screenshot(
              (args?.padding as number) || 10,
              (args?.format as string) || 'png',
              (args?.quality as number) || 90
            );
          case 'screenshotFullScreen':
            return await this.screenshotFullScreen(
              (args?.format as string) || 'png',
              (args?.quality as number) || 90,
              args?.saveToFile as string
            );
          case 'screenshotDisplay':
            return await this.screenshotDisplay(
              args?.displayId as string,
              (args?.format as string) || 'png',
              (args?.quality as number) || 90,
              args?.saveToFile as string
            );
          case 'screenshotAllDisplays':
            return await this.screenshotAllDisplays(
              (args?.format as string) || 'png',
              (args?.quality as number) || 90,
              args?.saveToFiles as string
            );
          case 'listDisplays':
            return await this.listDisplays();
          case 'screenshotRegion':
            return await this.screenshotRegion(
              args?.x as number,
              args?.y as number,
              args?.width as number,
              args?.height as number,
              (args?.format as string) || 'png',
              (args?.quality as number) || 90,
              args?.saveToFile as string
            );
          case 'screenshotWithTimestamp':
            return await this.screenshotWithTimestamp(
              (args?.directory as string) || './screenshots',
              (args?.prefix as string) || 'screenshot',
              (args?.format as string) || 'png',
              (args?.quality as number) || 90,
              (args?.padding as number) || 10
            );
          case 'focusApplicationDirect':
            return await this.focusApplicationDirect(args?.appName as string);
          case 'screenshotApplication':
            return await this.screenshotApplication(
              args?.appName as string,
              (args?.padding as number) || 10,
              (args?.format as string) || 'png',
              (args?.quality as number) || 90,
              args?.saveToFile as string,
              (args?.moveToPrimary as boolean) || false
            );
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

    try {
      const apps = await run(() => {
        // @ts-ignore
        const systemEvents = Application("System Events");
        const processes = systemEvents.applicationProcesses();
        return processes.map((process: any) => ({
          name: process.name(),
          bundleId: process.bundleIdentifier ? process.bundleIdentifier() : null,
          pid: process.unixId(),
          bounds: { x: 0, y: 0, width: 0, height: 0 } // We'll get bounds from window info
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
    } catch (error) {
      // Fallback: return a simple list of common applications
      const commonApps = [
        { name: "Claude", bundleId: "com.anthropic.claude-desktop", pid: 0, bounds: { x: 0, y: 0, width: 0, height: 0 } },
        { name: "Cursor", bundleId: "com.todesktop.230313mzl4w4u92", pid: 0, bounds: { x: 0, y: 0, width: 0, height: 0 } },
        { name: "Safari", bundleId: "com.apple.Safari", pid: 0, bounds: { x: 0, y: 0, width: 0, height: 0 } },
        { name: "Finder", bundleId: "com.apple.finder", pid: 0, bounds: { x: 0, y: 0, width: 0, height: 0 } }
      ];
      
      return {
        content: [
          {
            type: 'text',
            text: `Error listing applications: ${error instanceof Error ? error.message : String(error)}\n\nFallback list of common applications:\n${JSON.stringify(commonApps, null, 2)}`,
          },
        ],
      };
    }
  }

  private async focusApplication(identifier: string): Promise<any> {
    await this.checkPermissions();

    try {
      const apps = await run(() => {
        // @ts-ignore
        const systemEvents = Application("System Events");
        const processes = systemEvents.applicationProcesses();
        return processes.map((process: any) => ({
          name: process.name(),
          bundleId: process.bundleIdentifier ? process.bundleIdentifier() : null,
          pid: process.unixId(),
          bounds: { x: 0, y: 0, width: 0, height: 0 } // We'll get bounds from window info
        }));
      }) as Application[];

      let targetApp: Application | undefined;
      
      // Try to find by bundle ID first
      targetApp = apps.find(app => app.bundleId === identifier);
      
      // If not found, try by name
      if (!targetApp) {
        targetApp = apps.find(app => app.name.toLowerCase().includes(identifier.toLowerCase()));
      }
      
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

      // Focus the application and get window bounds
      const appInfo = await run((appName: string) => {
        // @ts-ignore
        const app = Application(appName);
        app.activate();
        
        // Try to get window bounds
        try {
          const windows = app.windows();
          if (windows && windows.length > 0) {
            const mainWindow = windows[0];
            const bounds = mainWindow.bounds();
            return {
              name: appName,
              bounds: {
                x: bounds.x(),
                y: bounds.y(),
                width: bounds.width(),
                height: bounds.height()
              }
            };
          }
        } catch (e) {
          // If we can't get window bounds, use default
        }
        
        return {
          name: appName,
          bounds: { x: 0, y: 0, width: 1920, height: 1080 } // Default bounds
        };
      }, targetApp.name) as { name: string; bounds: { x: number; y: number; width: number; height: number } };

      this.currentApp = {
        ...targetApp,
        bounds: appInfo.bounds
      };

      return {
        content: [
          {
            type: 'text',
            text: `Focused on application: ${targetApp.name} (${targetApp.bundleId}) with bounds: ${JSON.stringify(appInfo.bounds)}`,
          },
        ],
      };
    } catch (error) {
      // Fallback: try to focus by name directly
      try {
        await run((appName: string) => {
          // @ts-ignore
          const app = Application(appName);
          app.activate();
        }, identifier);

        this.currentApp = {
          name: identifier,
          bundleId: identifier,
          pid: 0,
          bounds: { x: 0, y: 0, width: 1920, height: 1080 }
        };

        return {
          content: [
            {
              type: 'text',
              text: `Focused on application: ${identifier} (fallback mode - using default bounds)`,
            },
          ],
        };
      } catch (fallbackError) {
        throw new Error(`Failed to focus application ${identifier}: ${error instanceof Error ? error.message : String(error)}`);
      }
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

  // ADVANCED SCREENSHOT METHODS

  private async screenshot(padding: number, format: string, quality: number): Promise<any> {
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

    // Process the image with format and quality options
    let processedBuffer: Buffer;
    if (format === 'jpg') {
      processedBuffer = await sharp(fullScreenshot)
        .extract({
          left: cropX,
          top: cropY,
          width: cropWidth,
          height: cropHeight,
        })
        .jpeg({ quality })
        .toBuffer();
    } else {
      processedBuffer = await sharp(fullScreenshot)
        .extract({
          left: cropX,
          top: cropY,
          width: cropWidth,
          height: cropHeight,
        })
        .png()
        .toBuffer();
    }

    // Convert to base64
    const base64Image = processedBuffer.toString('base64');

    return {
      content: [
        {
          type: 'text',
          text: `Screenshot of ${this.currentApp.name} window (${cropWidth}x${cropHeight}px with ${padding}px padding) in ${format.toUpperCase()} format`,
        },
        {
          type: 'image',
          data: base64Image,
          mimeType: format === 'jpg' ? 'image/jpeg' : 'image/png',
        },
      ],
    };
  }

  private async screenshotFullScreen(format: string, quality: number, saveToFile?: string): Promise<any> {
    await this.checkPermissions();

    try {
      let result: Buffer | string;
      
      if (saveToFile) {
        // Save directly to file
        result = await screenshot({ 
          filename: saveToFile,
          format: format as 'png' | 'jpg'
        });
      } else {
        // Return as buffer
        result = await screenshot({ format: format as 'png' | 'jpg' });
        
        // Process with quality if JPG
        if (format === 'jpg') {
          result = await sharp(result as Buffer)
            .jpeg({ quality })
            .toBuffer();
        }
      }

      if (saveToFile) {
        return {
          content: [
            {
              type: 'text',
              text: `Screenshot saved to: ${result}`,
            },
          ],
        };
      } else {
        const base64Image = (result as Buffer).toString('base64');
        return {
          content: [
            {
              type: 'text',
              text: `Full screen screenshot in ${format.toUpperCase()} format`,
            },
            {
              type: 'image',
              data: base64Image,
              mimeType: format === 'jpg' ? 'image/jpeg' : 'image/png',
            },
          ],
        };
      }
    } catch (error) {
      throw new Error(`Failed to take full screen screenshot: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async screenshotDisplay(displayId: string, format: string, quality: number, saveToFile?: string): Promise<any> {
    await this.checkPermissions();

    try {
      let result: Buffer | string;
      
      if (saveToFile) {
        result = await screenshot({ 
          filename: saveToFile,
          format: format as 'png' | 'jpg',
          screen: parseInt(displayId)
        });
      } else {
        result = await screenshot({ 
          format: format as 'png' | 'jpg',
          screen: parseInt(displayId)
        });
        
        // Process with quality if JPG
        if (format === 'jpg') {
          result = await sharp(result as Buffer)
            .jpeg({ quality })
            .toBuffer();
        }
      }

      if (saveToFile) {
        return {
          content: [
            {
              type: 'text',
              text: `Screenshot of display ${displayId} saved to: ${result}`,
            },
          ],
        };
      } else {
        const base64Image = (result as Buffer).toString('base64');
        return {
          content: [
            {
              type: 'text',
              text: `Screenshot of display ${displayId} in ${format.toUpperCase()} format`,
            },
            {
              type: 'image',
              data: base64Image,
              mimeType: format === 'jpg' ? 'image/jpeg' : 'image/png',
            },
          ],
        };
      }
    } catch (error) {
      throw new Error(`Failed to take screenshot of display ${displayId}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async screenshotAllDisplays(format: string, quality: number, saveToFiles?: string): Promise<any> {
    await this.checkPermissions();

    try {
      const screenshots = await screenshot.all();
      const results: any[] = [];

      for (let i = 0; i < screenshots.length; i++) {
        const screenshotBuffer = screenshots[i];
        
        if (saveToFiles) {
          // Save to files with timestamp
          const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
          const filename = path.join(saveToFiles, `display-${i}-${timestamp}.${format}`);
          
          // Ensure directory exists
          await fs.promises.mkdir(saveToFiles, { recursive: true });
          
          let processedBuffer: Buffer;
          if (format === 'jpg') {
            processedBuffer = await sharp(screenshotBuffer)
              .jpeg({ quality })
              .toBuffer();
          } else {
            processedBuffer = screenshotBuffer;
          }
          
          await fs.promises.writeFile(filename, processedBuffer);
          results.push({ display: i, filename });
        } else {
          // Return as base64
          let processedBuffer: Buffer;
          if (format === 'jpg') {
            processedBuffer = await sharp(screenshotBuffer)
              .jpeg({ quality })
              .toBuffer();
          } else {
            processedBuffer = screenshotBuffer;
          }
          
          results.push({
            display: i,
            image: processedBuffer.toString('base64'),
            mimeType: format === 'jpg' ? 'image/jpeg' : 'image/png'
          });
        }
      }

      return {
        content: [
          {
            type: 'text',
            text: `Screenshots of ${screenshots.length} displays in ${format.toUpperCase()} format`,
          },
          ...results.map((result, index) => ({
            type: 'text',
            text: `Display ${index}: ${saveToFiles ? result.filename : 'Base64 image data'}`,
          })),
          ...(saveToFiles ? [] : results.map(result => ({
            type: 'image',
            data: result.image,
            mimeType: result.mimeType,
          }))),
        ],
      };
    } catch (error) {
      throw new Error(`Failed to take screenshots of all displays: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async listDisplays(): Promise<any> {
    await this.checkPermissions();

    try {
      const displays = await screenshot.listDisplays();
      
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(displays, null, 2),
          },
        ],
      };
    } catch (error) {
      throw new Error(`Failed to list displays: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async screenshotRegion(x: number, y: number, width: number, height: number, format: string, quality: number, saveToFile?: string): Promise<any> {
    await this.checkPermissions();

    try {
      // Take full screen screenshot first
      const fullScreenshot = await screenshot();
      
      // Crop to the specified region
      let processedBuffer: Buffer;
      if (format === 'jpg') {
        processedBuffer = await sharp(fullScreenshot)
          .extract({
            left: x,
            top: y,
            width: width,
            height: height,
          })
          .jpeg({ quality })
          .toBuffer();
      } else {
        processedBuffer = await sharp(fullScreenshot)
          .extract({
            left: x,
            top: y,
            width: width,
            height: height,
          })
          .png()
          .toBuffer();
      }

      if (saveToFile) {
        await fs.promises.writeFile(saveToFile, processedBuffer);
        return {
          content: [
            {
              type: 'text',
              text: `Screenshot of region (${x}, ${y}, ${width}, ${height}) saved to: ${saveToFile}`,
            },
          ],
        };
      } else {
        const base64Image = processedBuffer.toString('base64');
        return {
          content: [
            {
              type: 'text',
              text: `Screenshot of region (${x}, ${y}, ${width}, ${height}) in ${format.toUpperCase()} format`,
            },
            {
              type: 'image',
              data: base64Image,
              mimeType: format === 'jpg' ? 'image/jpeg' : 'image/png',
            },
          ],
        };
      }
    } catch (error) {
      throw new Error(`Failed to take screenshot of region: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async screenshotWithTimestamp(directory: string, prefix: string, format: string, quality: number, padding: number): Promise<any> {
    await this.checkPermissions();

    try {
      // Ensure directory exists
      await fs.promises.mkdir(directory, { recursive: true });
      
      // Generate timestamped filename
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = path.join(directory, `${prefix}-${timestamp}.${format}`);
      
      let result: Buffer | string;
      
      if (this.currentApp) {
        // Screenshot focused app window
        const fullScreenshot = await screenshot();
        
        // Calculate crop area with padding
        const cropX = Math.max(0, this.currentApp.bounds.x - padding);
        const cropY = Math.max(0, this.currentApp.bounds.y - padding);
        const cropWidth = this.currentApp.bounds.width + (padding * 2);
        const cropHeight = this.currentApp.bounds.height + (padding * 2);

        // Process and save
        if (format === 'jpg') {
          await sharp(fullScreenshot)
            .extract({
              left: cropX,
              top: cropY,
              width: cropWidth,
              height: cropHeight,
            })
            .jpeg({ quality })
            .toFile(filename);
          result = filename;
        } else {
          await sharp(fullScreenshot)
            .extract({
              left: cropX,
              top: cropY,
              width: cropWidth,
              height: cropHeight,
            })
            .png()
            .toFile(filename);
          result = filename;
        }
      } else {
        // Screenshot full screen
        result = await screenshot({ 
          filename: filename,
          format: format as 'png' | 'jpg'
        });
      }

      return {
        content: [
          {
            type: 'text',
            text: `Screenshot saved to: ${filename}`,
          },
        ],
      };
    } catch (error) {
      throw new Error(`Failed to take timestamped screenshot: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async focusApplicationDirect(appName: string): Promise<any> {
    await this.checkPermissions();

    try {
      // Direct focus using the working JXA approach
      await run((appName: string) => {
        // @ts-ignore
        const app = Application(appName);
        app.activate();
      }, appName);

      this.currentApp = {
        name: appName,
        bundleId: appName,
        pid: 0,
        bounds: { x: 0, y: 0, width: 1920, height: 1080 } // Default bounds
      };

      return {
        content: [
          {
            type: 'text',
            text: `Successfully focused on application: ${appName}`,
          },
        ],
      };
    } catch (error) {
      throw new Error(`Failed to focus application ${appName}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async findApplicationWindow(appName: string): Promise<WindowInfo | null> {
    await this.checkPermissions();

    try {
      // First activate the app and bring it to front
      await run((appName: string) => {
        // @ts-ignore
        const app = Application(appName);
        app.activate();
        
        // Also use System Events to ensure it's frontmost
        // @ts-ignore
        const systemEvents = Application("System Events");
        const process = systemEvents.processes.byName(appName);
        if (process) {
          process.frontmost = true;
        }
      }, appName);
      
      // Wait for activation and bring to front
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      // Use System Events to get precise window bounds and detect display
      const windowInfo = await run((appName: string) => {
        // @ts-ignore
        const systemEvents = Application("System Events");
        const process = systemEvents.processes.byName(appName);
        
        if (!process) {
          return null;
        }
        
        const windows = process.windows();
        if (!windows || windows.length === 0) {
          return null;
        }
        
        const window = windows[0];
        const position = window.position();
        const size = window.size();
        
        const x = position[0];
        const y = position[1];
        const width = size[0];
        const height = size[1];
        
        // Determine which display the window is on
        // For now, we'll use a simple heuristic based on coordinates
        let displayId = 0; // Default to primary display
        
        // If window is at coordinates that suggest it's on a secondary display
        if (x > 1920 || y > 1080) {
          // Likely on a 4K display (secondary)
          displayId = 1;
        } else if (x < 0 || y < 0) {
          // Off-screen, move to primary display
          window.position = [100, 100];
          return {
            x: 100,
            y: 100,
            width: width,
            height: height,
            displayId: 0,
            wasOffScreen: true
          };
        }
        
        return {
          x: x,
          y: y,
          width: width,
          height: height,
          displayId: displayId,
          wasOffScreen: false
        };
      }, appName);

      if (!windowInfo) {
        return null;
      }

      // Return window info with detected display ID
      return {
        displayId: (windowInfo as any).displayId || 0,
        bounds: {
          x: (windowInfo as any).x,
          y: (windowInfo as any).y,
          width: (windowInfo as any).width,
          height: (windowInfo as any).height
        },
        wasOffScreen: (windowInfo as any).wasOffScreen || false
      };
    } catch (error) {
      throw new Error(`Failed to find window for application ${appName}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async screenshotApplication(appName: string, padding: number, format: string, quality: number, saveToFile?: string, moveToPrimary: boolean = false): Promise<any> {
    await this.checkPermissions();
    await this.log(`Starting screenshotApplication for ${appName} (moveToPrimary: ${moveToPrimary})`);

    try {
      // Find the application window and detect display
      const windowInfo = await this.findApplicationWindow(appName);
      
      if (!windowInfo) {
        await this.log(`ERROR: ${appName} not found or has no visible windows`);
        throw new Error(`Application "${appName}" not found or has no visible windows. Make sure the application is running and has at least one window open.`);
      }

      // Log the detected display
      await this.log(`Detected ${appName} on display ${windowInfo.displayId} at (${windowInfo.bounds.x}, ${windowInfo.bounds.y}) size ${windowInfo.bounds.width}x${windowInfo.bounds.height}`);
      console.log(`Detected ${appName} on display ${windowInfo.displayId} at (${windowInfo.bounds.x}, ${windowInfo.bounds.y})`);

      // Move to primary display if requested
      if (moveToPrimary && windowInfo.displayId !== 0) {
        await this.log(`Moving ${appName} from display ${windowInfo.displayId} to primary display`);
        console.log(`Moving ${appName} to primary display...`);
        await run((appName: string) => {
          // @ts-ignore
          const systemEvents = Application("System Events");
          const process = systemEvents.processes.byName(appName);
          
          if (process && process.windows().length > 0) {
            const window = process.windows()[0];
            // Move to primary display coordinates
            window.position = [100, 100];
          }
        }, appName);
        
        // Wait for movement to complete
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Update window info for primary display
        windowInfo.displayId = 0;
        windowInfo.bounds.x = 100;
        windowInfo.bounds.y = 100;
        await this.log(`Successfully moved ${appName} to primary display at (100, 100)`);
        console.log(`Moved ${appName} to primary display at (100, 100)`);
      }

      // Calculate region coordinates with padding
      const regionX = Math.max(0, windowInfo.bounds.x - padding);
      const regionY = Math.max(0, windowInfo.bounds.y - padding);
      const regionWidth = windowInfo.bounds.width + (padding * 2);
      const regionHeight = windowInfo.bounds.height + (padding * 2);

      await this.log(`Taking region screenshot: ${regionWidth}x${regionHeight} at (${regionX}, ${regionY})`);

      // Take region-based screenshot directly (more efficient and cleaner)
      let processedBuffer: Buffer;
      try {
        // Use screenshotRegion for direct region capture
        const regionScreenshot = await screenshot({
          format: format as 'png' | 'jpg',
          x: regionX,
          y: regionY,
          width: regionWidth,
          height: regionHeight
        });
        
        await this.log(`Successfully captured region screenshot`);
        
        // Process with quality settings if needed
        if (format === 'jpg') {
          processedBuffer = await sharp(regionScreenshot)
            .jpeg({ quality })
            .toBuffer();
        } else {
          processedBuffer = regionScreenshot; // PNG doesn't need quality processing
        }
        
      } catch (regionError) {
        // Fallback to full display screenshot with cropping if region fails
        await this.log(`Region screenshot failed, using display fallback: ${regionError}`);
        
        let fullScreenshot: Buffer;
        try {
          fullScreenshot = await screenshot({ 
            format: format as 'png' | 'jpg',
            screen: windowInfo.displayId
          });
        } catch (displayError) {
          fullScreenshot = await screenshot();
        }
        
        // Crop the full screenshot to the region
        if (format === 'jpg') {
          processedBuffer = await sharp(fullScreenshot)
            .extract({
              left: regionX,
              top: regionY,
              width: regionWidth,
              height: regionHeight,
            })
            .jpeg({ quality })
            .toBuffer();
        } else {
          processedBuffer = await sharp(fullScreenshot)
            .extract({
              left: regionX,
              top: regionY,
              width: regionWidth,
              height: regionHeight,
            })
            .png()
            .toBuffer();
        }
      }

      if (saveToFile) {
        await fs.promises.writeFile(saveToFile, processedBuffer);
        await this.log(`Screenshot saved to file: ${saveToFile} (${regionWidth}x${regionHeight}px)`);
        return {
          content: [
            {
              type: 'text',
              text: `Screenshot of ${appName} (display ${windowInfo.displayId}) saved to: ${saveToFile}`,
            },
          ],
        };
      } else {
        // Convert to base64
        const base64Image = processedBuffer.toString('base64');
        await this.log(`Screenshot completed successfully (${regionWidth}x${regionHeight}px, base64 output)`);
        return {
          content: [
            {
              type: 'text',
              text: `Smart screenshot of ${appName} window (display ${windowInfo.displayId}, ${regionWidth}x${regionHeight}px with ${padding}px padding) in ${format.toUpperCase()} format`,
            },
            {
              type: 'image',
              data: base64Image,
              mimeType: format === 'jpg' ? 'image/jpeg' : 'image/png',
            },
          ],
        };
      }
    } catch (error) {
      throw new Error(`Failed to take screenshot of application ${appName}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('Advanced Screenshot macOS GUI Control MCP server running on stdio');
  }
}

// Start the server
const server = new AdvancedScreenshotMacOSGUIControlServer();
server.run().catch(console.error);
