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

interface Display {
  id: string;
  name: string;
}

class AdvancedScreenshotMacOSGUIControlServer {
  private server: Server;
  private currentApp: Application | null = null;

  constructor() {
    this.server = new Server({
      name: 'advanced-screenshot-macos-gui-control',
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
          screen: displayId
        });
      } else {
        result = await screenshot({ 
          format: format as 'png' | 'jpg',
          screen: displayId
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

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('Advanced Screenshot macOS GUI Control MCP server running on stdio');
  }
}

// Start the server
const server = new AdvancedScreenshotMacOSGUIControlServer();
server.run().catch(console.error);
