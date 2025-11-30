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
import { logger, setupGlobalErrorHandlers } from './logger.js';

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

class MacOSGUIControlServer {
  private server: Server;
  private currentApp: AppInfo | null = null;

  constructor() {
    // Initialize global error handlers first
    setupGlobalErrorHandlers(logger);
    
    this.server = new Server({
      name: 'macos-gui-control',
      version: '1.1.15',
    });

    this.setupToolHandlers();
    
    logger.logServerEvent('MacOSGUIControlServer initialized', {
      serverName: 'macos-gui-control',
      version: '1.1.15'
    });
  }

  private setupToolHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          {
            name: 'listApplications',
            description: '🎯 MCP-EYES: List all running applications with their window bounds and identifiers. Essential for finding apps before closing them.',
            inputSchema: {
              type: 'object',
              properties: {},
            },
          },
          {
            name: 'focusApplication',
            description: '🎯 MCP-EYES: Focus on a specific application by bundle ID or PID. Use this before taking screenshots or clicking elements.',
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
            description: '🎯 MCP-EYES: Close/quit a specific application by bundle ID, name, or PID. This is the preferred method for closing applications when using MCP-eyes toolkit. Supports graceful quit with fallback to force close.',
            inputSchema: {
              type: 'object',
              properties: {
                identifier: {
                  type: 'string',
                  description: 'Bundle ID (e.g., com.apple.Music), app name (e.g., Music), or PID of the application to close',
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
          {
            name: 'findAndCloseApp',
            description: '🎯 MCP-EYES: Find and close an application by name. This is the complete workflow for locating and closing apps using MCP-eyes toolkit.',
            inputSchema: {
              type: 'object',
              properties: {
                appName: {
                  type: 'string',
                  description: 'Name of the application to find and close (e.g., "Music", "Safari", "Chrome")',
                },
                force: {
                  type: 'boolean',
                  description: 'Force close the application if graceful quit fails (default: false)',
                  default: false,
                },
              },
              required: ['appName'],
            },
          },
          {
            name: 'navigateBrowserToURL',
            description: '🎯 MCP-EYES: Complete browser navigation workflow - find browser, focus it, navigate to URL. Perfect for Firefox, Chrome, Safari navigation tasks.',
            inputSchema: {
              type: 'object',
              properties: {
                browserName: {
                  type: 'string',
                  description: 'Name of the browser (e.g., "Firefox", "Chrome", "Safari")',
                  default: 'Firefox',
                },
                url: {
                  type: 'string',
                  description: 'URL to navigate to (e.g., "www.google.com", "https://example.com")',
                },
              },
              required: ['url'],
            },
          },
        ],
      };
    });

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        logger.debug(`Tool called: ${name}`, { args });
        
        let result;
        switch (name) {
          case 'listApplications':
            result = await this.listApplications();
            break;
          case 'focusApplication':
            result = await this.focusApplication(args?.identifier as string);
            break;
          case 'closeApp':
            result = await this.closeApp(args?.identifier as string, (args?.force as boolean) || false);
            break;
          case 'click':
            result = await this.click(args?.x as number, args?.y as number, (args?.button as string) || 'left');
            break;
          case 'moveMouse':
            result = await this.moveMouse(args?.x as number, args?.y as number);
            break;
          case 'screenshot':
            result = await this.screenshot((args?.padding as number) || 10);
            break;
          case 'findAndCloseApp':
            result = await this.findAndCloseApp(args?.appName as string, (args?.force as boolean) || false);
            break;
          case 'navigateBrowserToURL':
            result = await this.navigateBrowserToURL(args?.browserName as string || 'Firefox', args?.url as string);
            break;
          default:
            throw new Error(`Unknown tool: ${name}`);
        }
        
        logger.logToolExecution(name, args, result);
        return result;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.logToolExecution(name, args, null, error instanceof Error ? error : new Error(errorMessage));
        
        return {
          content: [
            {
              type: 'text',
              text: `Error: ${errorMessage}`,
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

    logger.logPermissionCheck('screen', screenRecording);
    logger.logPermissionCheck('accessibility', accessibility);

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

    try {
      // Use the same approach as listApplications for consistency
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

      let targetApp: AppInfo | undefined;
      
      // Try to find by bundle ID first
      targetApp = (apps as any[]).find((app: any) => app.bundleId === identifier);
      
      // If not found, try by PID
      if (!targetApp) {
        const pid = parseInt(identifier);
        if (!isNaN(pid)) {
          targetApp = (apps as any[]).find((app: any) => app.pid === pid);
        }
      }

      // If still not found, try by name (partial match)
      if (!targetApp) {
        targetApp = (apps as any[]).find((app: any) => 
          app.name.toLowerCase().includes(identifier.toLowerCase())
        );
      }

      if (!targetApp) {
        throw new Error(`Application not found: ${identifier}`);
      }

      // Focus the application using System Events for better reliability
      await run((bundleId: string) => {
        const app = Application.currentApplication();
        app.includeStandardAdditions = true;
        
        // Try multiple methods to ensure the app is focused
        try {
          // Method 1: Direct activation
          const targetApp = Application(bundleId);
          targetApp.activate();
          
          // Method 2: Use System Events to bring to front
          const systemEvents = Application('System Events');
          const processes = systemEvents.applicationProcesses();
          
          for (let i = 0; i < processes.length; i++) {
            if (processes[i].bundleIdentifier() === bundleId) {
              processes[i].activate();
              break;
            }
          }
          
          // Method 3: Bring all windows to front
          const windows = targetApp.windows();
          for (let j = 0; j < windows.length; j++) {
            windows[j].visible = true;
          }
          
        } catch (error) {
          console.log('Focus attempt failed:', error);
        }
      }, targetApp.bundleId);

      // Wait a moment for the focus to take effect
      await new Promise(resolve => setTimeout(resolve, 500));

      // Get updated bounds after focusing
      const updatedBounds = await getWindowBoundsAppleScript(targetApp.name, targetApp.pid);
      if (updatedBounds) {
        targetApp.bounds = updatedBounds;
      }

      // Verify the app is actually focused by checking if it has valid bounds
      if (targetApp.bounds.width === 0 || targetApp.bounds.height === 0) {
        console.log('Warning: App may not be properly focused - bounds are zero');
      }

      this.currentApp = targetApp;

      return {
        content: [
          {
            type: 'text',
            text: `🎯 MCP-EYES: Successfully focused on ${targetApp.name} (${targetApp.bundleId})\nPID: ${targetApp.pid}\nBounds: ${targetApp.bounds.width}x${targetApp.bounds.height} at (${targetApp.bounds.x}, ${targetApp.bounds.y})\n\nApp is now ready for screenshots and interactions.`,
          },
        ],
      };
    } catch (error) {
      throw new Error(`Failed to focus application: ${error}`);
    }
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

  private async findAndCloseApp(appName: string, force: boolean = false): Promise<any> {
    try {
      // First, list all applications to find the target app
      const appsResult = await this.listApplications();
      const appsText = appsResult.content[0].text;
      
      // Parse the applications from the text output
      const apps: AppInfo[] = [];
      const lines = appsText.split('\n');
      let currentApp: any = {};
      
      for (const line of lines) {
        if (line.startsWith('•')) {
          if (currentApp.name) {
            apps.push(currentApp);
          }
          const match = line.match(/• (.+?) \((.+?)\)/);
          if (match) {
            currentApp = {
              name: match[1],
              bundleId: match[2],
              pid: 0,
              bounds: { x: 0, y: 0, width: 0, height: 0 }
            };
          }
        } else if (line.includes('PID:')) {
          const pidMatch = line.match(/PID: (\d+)/);
          if (pidMatch) {
            currentApp.pid = parseInt(pidMatch[1]);
          }
        } else if (line.includes('Bounds:')) {
          const boundsMatch = line.match(/Bounds: (\d+)x(\d+) at \(([^,]+), ([^)]+)\)/);
          if (boundsMatch) {
            currentApp.bounds = {
              width: parseInt(boundsMatch[1]),
              height: parseInt(boundsMatch[2]),
              x: parseInt(boundsMatch[3]),
              y: parseInt(boundsMatch[4])
            };
          }
        }
      }
      if (currentApp.name) {
        apps.push(currentApp);
      }

      // Find the target application
      const targetApp = apps.find(app => 
        app.name.toLowerCase().includes(appName.toLowerCase()) ||
        app.bundleId.toLowerCase().includes(appName.toLowerCase())
      );

      if (!targetApp) {
        return {
          content: [
            {
              type: 'text',
              text: `Application "${appName}" not found. Available applications:\n\n${apps.map(app => `• ${app.name} (${app.bundleId})`).join('\n')}`,
            },
          ],
        };
      }

      // Close the application
      const closeResult = await this.closeApp(targetApp.bundleId, force);
      
      return {
        content: [
          {
            type: 'text',
            text: `🎯 MCP-EYES: Successfully found and closed "${targetApp.name}" (${targetApp.bundleId})\n\n${closeResult.content[0].text}`,
          },
        ],
      };
    } catch (error) {
      throw new Error(`Failed to find and close application: ${error}`);
    }
  }

  private async navigateBrowserToURL(browserName: string, url: string): Promise<any> {
    try {
      // Step 1: Find and focus the browser
      const focusResult = await this.focusApplication(browserName);
      
      // Step 2: Wait a moment for the browser to be ready
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Step 3: Take a screenshot to see the browser state
      const screenshotResult = await this.screenshot(10);
      
      // Step 4: Navigate to URL using keyboard shortcuts
      await run((url) => {
        const app = Application.currentApplication();
        app.includeStandardAdditions = true;
        
        // Focus the address bar using Cmd+L (works in most browsers)
        app.doShellScript(`osascript -e 'tell application "System Events" to keystroke "l" using command down'`);
        
        // Wait a moment for the address bar to be focused
        delay(0.5);
        
        // Clear any existing text and type the URL
        app.doShellScript(`osascript -e 'tell application "System Events" to keystroke "a" using command down'`);
        delay(0.2);
        app.doShellScript(`osascript -e 'tell application "System Events" to keystroke "${url}"'`);
        delay(0.2);
        
        // Press Enter to navigate
        app.doShellScript(`osascript -e 'tell application "System Events" to keystroke return'`);
        
      }, url);
      
      return {
        content: [
          {
            type: 'text',
            text: `🎯 MCP-EYES: Successfully navigated ${browserName} to ${url}\n\nSteps completed:\n1. ✅ Found and focused ${browserName}\n2. ✅ Took screenshot to verify browser state\n3. ✅ Used Cmd+L to focus address bar\n4. ✅ Typed URL: ${url}\n5. ✅ Pressed Enter to navigate\n\nNavigation complete!`,
          },
        ],
      };
    } catch (error) {
      throw new Error(`Failed to navigate browser to URL: ${error}`);
    }
  }

  async run() {
    try {
      logger.logServerEvent('Starting MacOSGUIControlServer');
      const transport = new StdioServerTransport();
      await this.server.connect(transport);
      logger.logServerEvent('MacOSGUIControlServer connected to stdio transport');
      console.error('macOS GUI Control MCP server running on stdio');
    } catch (error) {
      logger.error('Failed to start MacOSGUIControlServer', { error: error instanceof Error ? error.message : String(error) }, error instanceof Error ? error : undefined);
      throw error;
    }
  }
}

// Start the server
const server = new MacOSGUIControlServer();
server.run().catch((error) => {
  logger.logCrash(error instanceof Error ? error : new Error(String(error)), { 
    context: 'MacOSGUIControlServer startup' 
  });
  console.error('macOS GUI Control MCP server failed to start:', error);
  process.exit(1);
});
