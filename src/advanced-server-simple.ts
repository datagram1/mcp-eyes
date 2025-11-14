#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
// @ts-ignore
import screenshotDesktop from 'screenshot-desktop';
import { mouse, Button, keyboard, Key } from '@nut-tree-fork/nut-js';
import { run } from '@jxa/run';
import sharp from 'sharp';
// @ts-ignore
import { checkPermissions } from 'node-mac-permissions';
import { logger, setupGlobalErrorHandlers } from './logger.js';
import { permissionHelper } from './permission-helper.js';

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
    // Initialize global error handlers first
    setupGlobalErrorHandlers(logger);
    
    // Check permissions and provide helpful guidance
    // this.checkPermissionsAndGuide();
    
    this.server = new Server({
      name: 'mcp-eyes-advanced',
      version: '1.1.15',
    });

    this.setupToolHandlers();
    this.setupErrorHandling();
    
    logger.logServerEvent('AdvancedServerSimple initialized', {
      serverName: 'mcp-eyes-advanced',
      version: '1.1.15'
    });
  }

  private setupErrorHandling(): void {
    this.server.onerror = (error) => {
      logger.error('MCP Server error', { error: error.message }, error);
      
      // Don't crash the server on individual tool errors
      // The error will be handled by the individual tool handlers
    };
    
    // Add additional error handling for the server
    this.server.onclose = () => {
      logger.info('MCP Server connection closed');
    };
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
          {
            name: 'closeApplication',
            description: 'Close a specific application by bundle ID, name, or PID.',
            inputSchema: {
              type: 'object',
              properties: {
                identifier: {
                  type: 'string',
                  description: 'Bundle ID (e.g., com.apple.Music), application name, or PID of the application to close',
                },
                force: {
                  type: 'boolean',
                  description: 'Force close the application (kill process)',
                  default: false,
                },
              },
              required: ['identifier'],
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
          // Basic Tools
          case 'listApplications':
            result = await this.listApplications();
            break;

          case 'focusApplication':
            result = await this.focusApplication(args?.identifier as string);
            break;

          case 'click':
            result = await this.click(args?.x as number, args?.y as number, (args?.button as string) || 'left');
            break;

          case 'moveMouse':
            result = await this.moveMouse(args?.x as number, args?.y as number);
            break;

          case 'screenshot':
            result = await this.screenshot((args?.padding as number) || 10, (args?.format as string) || 'png', (args?.quality as number) || 90);
            break;

          // Apple Accessibility Tools
          case 'getClickableElements':
            result = await this.getClickableElements();
            break;

          case 'clickElement':
            result = await this.clickElement(args?.elementIndex as number);
            break;

          // Advanced Tools
          case 'typeText':
            result = await this.typeText(args?.text as string, (args?.clearFirst as boolean) || false);
            break;

          case 'pressKey':
            result = await this.pressKey(args?.key as string);
            break;

          case 'doubleClick':
            result = await this.doubleClick(args?.x as number, args?.y as number);
            break;

          case 'scrollMouse':
            result = await this.scrollMouse(args?.direction as string, (args?.amount as number) || 3);
            break;

          case 'getMousePosition':
            result = await this.getMousePosition();
            break;

          case 'wait':
            result = await this.wait((args?.milliseconds as number) || 1000);
            break;

          case 'closeApplication':
            result = await this.closeApplication(args?.identifier as string, (args?.force as boolean) || false);
            break;

          default:
            throw new Error(`Unknown tool: ${name}`);
        }
        
        logger.logToolExecution(name, args, result);
        return result;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.logToolExecution(name, args, null, error instanceof Error ? error : new Error(errorMessage));
        
        // Provide more helpful error messages based on the tool
        let helpfulMessage = errorMessage;
        
        if (name === 'focusApplication') {
          helpfulMessage = `Failed to focus application: ${errorMessage}\n\nTry using:\n- Bundle ID (e.g., com.apple.Music)\n- Application name (e.g., Music)\n- PID number\n\nUse listApplications to see available applications.`;
        } else if (name === 'closeApplication') {
          helpfulMessage = `Failed to close application: ${errorMessage}\n\nTry using:\n- Bundle ID (e.g., com.apple.Music)\n- Application name (e.g., Music)\n- PID number\n\nUse listApplications to see available applications.\nUse force: true to kill the process if graceful close fails.`;
        } else if (name === 'screenshot') {
          helpfulMessage = `Failed to take screenshot: ${errorMessage}\n\nMake sure:\n- An application is focused (use focusApplication first)\n- Screen Recording permission is granted in System Preferences\n- The application window is visible`;
        } else if (name === 'click' || name === 'moveMouse' || name === 'doubleClick') {
          helpfulMessage = `Failed to perform mouse action: ${errorMessage}\n\nMake sure:\n- An application is focused (use focusApplication first)\n- Coordinates are between 0 and 1 (normalized)\n- The application window is visible`;
        }
        
        return {
          content: [
            {
              type: 'text',
              text: `Error: ${helpfulMessage}`,
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
      logger.debug(`Attempting to focus application: ${identifier}`);
      
      // Direct AppleScript approach without depending on listApplications
      const appInfo = await run((identifier) => {
        const app = Application.currentApplication();
        app.includeStandardAdditions = true;

        try {
          let targetApplication;
          let appName = identifier;
          let bundleId = identifier;
          
          // Try different ways to get the application
          if (identifier.includes('.')) {
            // Bundle ID
            targetApplication = Application(identifier);
            bundleId = identifier;
            appName = targetApplication.name();
          } else if (identifier.match(/^\d+$/)) {
            // PID - find by PID
            const systemEvents = Application("System Events");
            const processes = systemEvents.applicationProcesses();
            for (let i = 0; i < processes.length; i++) {
              if (processes[i].unixId().toString() === identifier) {
                const foundBundleId = processes[i].bundleIdentifier();
                if (foundBundleId) {
                  targetApplication = Application(foundBundleId);
                  bundleId = foundBundleId;
                  appName = targetApplication.name();
                  break;
                }
              }
            }
          } else {
            // Application name
            targetApplication = Application(identifier);
            appName = identifier;
            bundleId = targetApplication.bundleIdentifier ? targetApplication.bundleIdentifier() : identifier;
          }
          
          if (!targetApplication) {
            throw new Error(`Application not found: ${identifier}`);
          }
          
          // Activate the application
          targetApplication.activate();
          
          // Wait a moment for activation to complete
          Application.currentApplication().delay(0.2);
          
          // Get updated bounds after activation
          const windows = targetApplication.windows();
          let bounds = { x: 0, y: 0, width: 0, height: 0 };

          if (windows.length > 0) {
            const window = windows[0];
            try {
              const position = window.position();
              const size = window.size();
              bounds = {
                x: position[0] || 0,
                y: position[1] || 0,
                width: size[0] || 0,
                height: size[1] || 0,
              };
            } catch (boundsError) {
              // If we can't get bounds, use default
              bounds = { x: 0, y: 0, width: 1920, height: 1080 };
            }
          } else {
            // If no windows, use default bounds
            bounds = { x: 0, y: 0, width: 1920, height: 1080 };
          }

          return {
            name: appName,
            bundleId: bundleId,
            bounds: bounds
          };
        } catch (error) {
          throw new Error(`Could not activate application: ${error instanceof Error ? error.message : String(error)}`);
        }
      }, identifier) as { name: string; bundleId: string; bounds: { x: number; y: number; width: number; height: number } };

      // Update the current app
      this.currentApp = {
        name: appInfo.name,
        bundleId: appInfo.bundleId,
        pid: 0, // We don't have PID from this approach
        bounds: appInfo.bounds
      };

      return {
        content: [
          {
            type: 'text',
            text: `Focused on application: ${appInfo.name} (${appInfo.bundleId})\nBounds: ${appInfo.bounds.width}x${appInfo.bounds.height} at (${appInfo.bounds.x}, ${appInfo.bounds.y})`,
          },
        ],
      };
    } catch (error) {
      logger.error(`Failed to focus application: ${identifier}`, { error: error instanceof Error ? error.message : String(error) }, error instanceof Error ? error : undefined);
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

  private async checkPermissions(): Promise<void> {
    const permissions = await permissionHelper.checkPermissions();
    logger.logPermissionCheck('screen', permissions.screen);
    
    if (permissions.screen !== 'authorized') {
      throw new Error('Screen Recording permission is required. Please grant permission in System Preferences > Security & Privacy > Privacy > Screen Recording.');
    }
  }

  private async detectDisplays(): Promise<Array<{id: number, bounds: {x: number, y: number, width: number, height: number}}>> {
    try {
      // Use screenshot-desktop to get display information
      const displays = await screenshotDesktop.listDisplays();
      
      logger.debug(`Detected ${displays.length} display(s):`, displays);
      
      return displays.map((display: any, index: number) => ({
        id: index,
        bounds: {
          x: display.x || 0,
          y: display.y || 0,
          width: display.width || 1920,
          height: display.height || 1080
        }
      }));
    } catch (error) {
      logger.warn(`Failed to detect displays: ${error}. Using default primary display.`);
      return [{
        id: 0,
        bounds: { x: 0, y: 0, width: 1920, height: 1080 }
      }];
    }
  }

  private findDisplayForPosition(x: number, y: number, displays: Array<{id: number, bounds: {x: number, y: number, width: number, height: number}}>): {id: number, bounds: {x: number, y: number, width: number, height: number}} | null {
    for (const display of displays) {
      if (x >= display.bounds.x && x < display.bounds.x + display.bounds.width &&
          y >= display.bounds.y && y < display.bounds.y + display.bounds.height) {
        return display;
      }
    }
    return null;
  }

  private async screenshot(padding: number, format: string, quality: number): Promise<any> {
    if (!this.currentApp) {
      throw new Error('No application focused. Use focusApplication first.');
    }

    await this.checkPermissions();
    
    const appBounds = this.currentApp.bounds;
    logger.debug(`Taking screenshot of ${this.currentApp.name} at position (${appBounds.x}, ${appBounds.y})`);

    try {
      // Detect all available displays
      const displays = await this.detectDisplays();
      logger.info(`Detected ${displays.length} display(s)`, displays);
      
      // Find which display the app is on
      let appDisplay = this.findDisplayForPosition(appBounds.x, appBounds.y, displays);
      
      if (!appDisplay) {
        logger.warn(`App ${this.currentApp.name} at (${appBounds.x}, ${appBounds.y}) is not on any detected display. Using primary display.`);
        // Use primary display as fallback
        appDisplay = displays[0];
      }
      
      logger.info(`App ${this.currentApp.name} is on display ${appDisplay.id} at (${appDisplay.bounds.x}, ${appDisplay.bounds.y}) size ${appDisplay.bounds.width}x${appDisplay.bounds.height}`);
      
      // Capture screenshot from the correct display
      let screenshotBuffer: Buffer;
      
      if (displays.length === 1) {
        // Single display - use primary screenshot
        screenshotBuffer = await screenshotDesktop();
        logger.debug(`Captured single display screenshot`);
      } else {
        // Multiple displays - capture from specific display
        try {
          // Try to capture from specific display using display ID
          screenshotBuffer = await screenshotDesktop({ screen: appDisplay.id });
          logger.debug(`Captured screenshot from display ${appDisplay.id}`);
        } catch (displayError) {
          logger.warn(`Failed to capture from specific display ${appDisplay.id}: ${displayError}. Trying all displays.`);
          
          // Fallback: capture all displays and select the right one
          const allScreenshots = await screenshotDesktop.all();
          
          if (allScreenshots.length > appDisplay.id) {
            screenshotBuffer = allScreenshots[appDisplay.id];
            logger.debug(`Selected screenshot ${appDisplay.id} from ${allScreenshots.length} captured displays`);
          } else {
            screenshotBuffer = allScreenshots[0]; // Fallback to first display
            logger.warn(`Display ${appDisplay.id} not available, using first display`);
          }
        }
      }

      // Calculate crop boundaries relative to the display
      const metadata = await sharp(screenshotBuffer).metadata();
      const imageWidth = metadata.width || 0;
      const imageHeight = metadata.height || 0;
      
      logger.debug(`Screenshot dimensions: ${imageWidth}x${imageHeight}`);
      logger.debug(`App bounds: ${JSON.stringify(appBounds)}`);
      logger.debug(`Display bounds: ${JSON.stringify(appDisplay.bounds)}`);
      
      // Calculate crop area relative to the display coordinates
      const relativeX = appBounds.x - appDisplay.bounds.x;
      const relativeY = appBounds.y - appDisplay.bounds.y;
      
      const cropX = Math.max(0, relativeX - padding);
      const cropY = Math.max(0, relativeY - padding);
      const cropWidth = Math.min(
        appBounds.width + (padding * 2),
        imageWidth - cropX
      );
      const cropHeight = Math.min(
        appBounds.height + (padding * 2),
        imageHeight - cropY
      );
      
      logger.debug(`Relative position: (${relativeX}, ${relativeY})`);
      logger.debug(`Crop region: x=${cropX}, y=${cropY}, width=${cropWidth}, height=${cropHeight}`);
      
      // Ensure crop dimensions are valid
      if (cropWidth <= 0 || cropHeight <= 0) {
        throw new Error(`Invalid crop dimensions: ${cropWidth}x${cropHeight}`);
      }

      // Crop the screenshot
      const croppedBuffer = await sharp(screenshotBuffer)
        .extract({
          left: Math.floor(cropX),
          top: Math.floor(cropY),
          width: Math.floor(cropWidth),
          height: Math.floor(cropHeight),
        })
        .toFormat(format as any, { quality })
        .toBuffer();

      // Convert to base64
      const base64Image = croppedBuffer.toString('base64');

      return {
        content: [
          {
            type: 'text',
            text: `Screenshot of ${this.currentApp.name} window (${cropWidth}x${cropHeight}px with ${padding}px padding) from display ${appDisplay.id}\nApp position: (${appBounds.x}, ${appBounds.y})\nDisplay bounds: (${appDisplay.bounds.x}, ${appDisplay.bounds.y}) ${appDisplay.bounds.width}x${appDisplay.bounds.height}`,
          },
          {
            type: 'image',
            data: base64Image,
            mimeType: format === 'jpg' ? 'image/jpeg' : 'image/png',
          },
        ],
      };
      
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.error(`Screenshot failed: ${errorMsg}`, {
        appName: this.currentApp.name,
        bounds: this.currentApp.bounds
      });
      
      // Fallback: Return full screenshot if cropping fails
      try {
        const fullScreenshot = await screenshotDesktop();
        const base64Image = fullScreenshot.toString('base64');
        
        return {
          content: [
            {
              type: 'text',
              text: `Warning: Could not crop to app window (${errorMsg}). Returning full screen screenshot.\nApp: ${this.currentApp.name}\nPosition: (${this.currentApp.bounds.x}, ${this.currentApp.bounds.y})`,
            },
            {
              type: 'image',
              data: base64Image,
              mimeType: 'image/png',
            },
          ],
        };
      } catch (fallbackError) {
        throw new Error(`Complete screenshot failure: ${errorMsg}`);
      }
    }
  }

  // Apple Accessibility Tools Implementation (same as basic server)
  private async getClickableElements(): Promise<any> {
    if (!this.currentApp) {
      throw new Error('No application focused. Use focusApplication first.');
    }

    try {
      // Store currentApp in a local variable to avoid context issues
      const currentAppBundleId = this.currentApp.bundleId;
      
      const elements = await run(() => {
        const app = Application.currentApplication();
        app.includeStandardAdditions = true;

        const runningApps = Application('System Events').applicationProcesses();
        let targetApp = null;

        // Find the current app
        for (let i = 0; i < runningApps.length; i++) {
          if (runningApps[i].bundleIdentifier() === currentAppBundleId) {
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
        'Cmd+F': [Key.LeftCmd, Key.F],
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

  private async closeApplication(identifier: string, force: boolean = false): Promise<any> {
    try {
      logger.debug(`Attempting to close application: ${identifier} (force: ${force})`);
      
      // First, try to find the application using our listApplications method
      const apps = await this.listApplications();
      const appText = apps.content[0].text;
      
      // Parse the application list from the text output
      const appList = [];
      const lines = appText.split('\n');
      let currentApp = null;
      
      for (const line of lines) {
        if (line.startsWith('• ')) {
          // Save previous app if exists
          if (currentApp) {
            appList.push(currentApp);
          }
          
          // Parse new app line: "• AppName (bundle.id)"
          const match = line.match(/• (.+?) \((.+?)\)/);
          if (match) {
            currentApp = {
              name: match[1],
              bundleId: match[2],
              pid: 0,
              bounds: { x: 0, y: 0, width: 0, height: 0 }
            };
          }
        } else if (line.includes('PID:') && currentApp) {
          // Parse PID line: "  PID: 12345"
          const pidMatch = line.match(/PID: (\d+)/);
          if (pidMatch) {
            currentApp.pid = parseInt(pidMatch[1]);
          }
        } else if (line.includes('Bounds:') && currentApp) {
          // Parse bounds line: "  Bounds: 1920x1080 at (0, 0)"
          const boundsMatch = line.match(/Bounds: (\d+)x(\d+) at \((-?\d+), (-?\d+)\)/);
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
      
      // Add the last app
      if (currentApp) {
        appList.push(currentApp);
      }
      
      let targetApp = null;
      let searchMethod = '';
      
      // Try different identification methods
      if (identifier.match(/^\d+$/)) {
        // PID search
        targetApp = appList.find((app: any) => app.pid.toString() === identifier);
        searchMethod = 'PID';
      } else if (identifier.includes('.')) {
        // Bundle ID search
        targetApp = appList.find((app: any) => app.bundleId === identifier);
        searchMethod = 'Bundle ID';
      } else {
        // Name search
        targetApp = appList.find((app: any) => app.name === identifier);
        searchMethod = 'Name';
      }
      
      if (!targetApp) {
        // Try alternative search methods
        if (identifier.match(/^\d+$/)) {
          // If PID failed, try as bundle ID
          targetApp = appList.find((app: any) => app.bundleId === identifier);
          searchMethod = 'Bundle ID (fallback)';
        } else {
          // Try case-insensitive name search
          targetApp = appList.find((app: any) => 
            app.name.toLowerCase() === identifier.toLowerCase()
          );
          searchMethod = 'Name (case-insensitive)';
        }
      }
      
      if (!targetApp) {
        const availableApps = appList.slice(0, 10).map((app: any) => 
          `${app.name} (${app.bundleId}) - PID: ${app.pid}`
        ).join('\n');
        
        throw new Error(`Application not found: ${identifier}\n\nAvailable applications (first 10):\n${availableApps}`);
      }
      
      logger.debug(`Found application via ${searchMethod}:`, targetApp);
      
      if (force) {
        // Force kill the process
        const { exec } = await import('child_process');
        const { promisify } = await import('util');
        const execAsync = promisify(exec);
        
        try {
          await execAsync(`kill -9 ${targetApp.pid}`);
          logger.info(`Force killed application: ${targetApp.name} (PID: ${targetApp.pid})`);
          
          return {
            content: [
              {
                type: 'text',
                text: `Force closed ${targetApp.name} (${targetApp.bundleId}) - PID: ${targetApp.pid}`,
              },
            ],
          };
        } catch (killError) {
          throw new Error(`Failed to force kill application: ${killError}`);
        }
      } else {
        // Try to gracefully close the application using AppleScript
        const result = await run((targetApp) => {
          const app = Application.currentApplication();
          app.includeStandardAdditions = true;

          try {
            // Get the application by bundle ID
            const targetApplication = Application(targetApp.bundleId);
            
            // Try to quit the application
            targetApplication.quit();
            
            // Wait a moment for quit to complete
            Application.currentApplication().delay(0.5);
            
            return {
              success: true,
              message: `Successfully sent quit command to ${targetApp.name}`
            };
          } catch (quitError: any) {
            // If quit fails, try to close all windows
            try {
              const targetApplication = Application(targetApp.bundleId);
              const windows = targetApplication.windows();
              
              for (let i = 0; i < windows.length; i++) {
                windows[i].close();
              }
              
              return {
                success: true,
                message: `Closed all windows of ${targetApp.name} (quit command failed)`
              };
            } catch (closeError: any) {
              return {
                success: false,
                message: `Failed to quit or close ${targetApp.name}: ${quitError?.message || quitError}`
              };
            }
          }
        }, targetApp);

        if ((result as any).success) {
          logger.info(`Closed application: ${targetApp.name} (${targetApp.bundleId})`);
          
          return {
            content: [
              {
                type: 'text',
                text: `Closed ${targetApp.name} (${targetApp.bundleId}) - ${(result as any).message}`,
              },
            ],
          };
        } else {
          throw new Error((result as any).message);
        }
      }
    } catch (error) {
      logger.error(`Failed to close application: ${identifier}`, { error: error instanceof Error ? error.message : String(error) }, error instanceof Error ? error : undefined);
      throw new Error(`Failed to close application: ${error}`);
    }
  }

  async run(): Promise<void> {
    try {
      logger.logServerEvent('Starting AdvancedServerSimple');
      const transport = new StdioServerTransport();
      await this.server.connect(transport);
      logger.logServerEvent('AdvancedServerSimple connected to stdio transport');
      console.error('MCP Eyes Advanced Server running on stdio');
    } catch (error) {
      logger.error('Failed to start AdvancedServerSimple', { error: error instanceof Error ? error.message : String(error) }, error instanceof Error ? error : undefined);
      throw error;
    }
  }
}

const server = new AdvancedServerSimple();
server.run().catch((error) => {
  logger.logCrash(error instanceof Error ? error : new Error(String(error)), { 
    context: 'AdvancedServerSimple startup' 
  });
  console.error('MCP Eyes Advanced Server failed to start:', error);
  process.exit(1);
});
