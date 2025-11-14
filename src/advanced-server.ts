#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { screenshotDesktop } from 'screenshot-desktop';
import { mouse, Button, keyboard, Key } from '@nut-tree-fork/nut-js';
import { run } from '@jxa/run';
import sharp from 'sharp';
import { checkPermissions } from 'node-mac-permissions';
import { AppleWindowManager } from './apple-window-manager.js';
import { OCRAnalyzer } from './ocr-analyzer.js';
import { LocalLLMAnalyzer } from './local-llm-analyzer.js';
import { WebContentDetector } from './web-content-detector.js';
import { getWindowBoundsAppleScript } from './window-bounds-helper.js';

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

class AdvancedServer {
  private server: Server;
  private currentApp: AppInfo | null = null;
  private appleWindowManager: AppleWindowManager;
  private ocrAnalyzer: OCRAnalyzer;
  private localLLMAnalyzer: LocalLLMAnalyzer;
  private webContentDetector: WebContentDetector;

  constructor() {
    this.server = new Server(
      {
        name: 'mcp-eyes-advanced',
        version: '1.1.15',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.appleWindowManager = new AppleWindowManager();
    this.ocrAnalyzer = new OCRAnalyzer();
    this.localLLMAnalyzer = new LocalLLMAnalyzer();
    this.webContentDetector = new WebContentDetector();

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
                  description: 'Bundle ID (e.g., com.apple.Music) or PID of the application to focus',
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
          // AI Analysis Tools
          {
            name: 'analyzeImageWithAI',
            description: 'Analyze a screenshot using AI to find UI elements and their locations.',
            inputSchema: {
              type: 'object',
              properties: {
                prompt: {
                  type: 'string',
                  description: 'What to look for in the image (e.g., "Find the Update Available button")',
                },
                padding: {
                  type: 'number',
                  description: 'Padding around the window in pixels',
                  default: 10,
                },
              },
              required: ['prompt'],
            },
          },
          {
            name: 'findAndClickElement',
            description: 'Find and click an element using AI analysis with fallback methods.',
            inputSchema: {
              type: 'object',
              properties: {
                elementDescription: {
                  type: 'string',
                  description: 'Description of the element to find and click',
                },
                padding: {
                  type: 'number',
                  description: 'Padding around the window in pixels',
                  default: 10,
                },
              },
              required: ['elementDescription'],
            },
          },
          // OCR Tools
          {
            name: 'analyzeImageWithOCR',
            description: 'Analyze a screenshot using OCR to find text and buttons.',
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
          // Web Content Tools
          {
            name: 'getWebElements',
            description: 'Get web elements (links, buttons, inputs) from the focused browser.',
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
            name: 'clickWebElement',
            description: 'Click a web element by index from getWebElements.',
            inputSchema: {
              type: 'object',
              properties: {
                elementIndex: {
                  type: 'number',
                  description: 'Index of the web element to click',
                },
              },
              required: ['elementIndex'],
            },
          },
          {
            name: 'findAndClickWebElement',
            description: 'Find and click a web element by text or description.',
            inputSchema: {
              type: 'object',
              properties: {
                elementDescription: {
                  type: 'string',
                  description: 'Text or description of the web element to find',
                },
                padding: {
                  type: 'number',
                  description: 'Padding around the window in pixels',
                  default: 10,
                },
              },
              required: ['elementDescription'],
            },
          },
          // Text Input Tools
          {
            name: 'typeText',
            description: 'Type text into a focused input field.',
            inputSchema: {
              type: 'object',
              properties: {
                appName: {
                  type: 'string',
                  description: 'Name of the application to type into',
                },
                elementIndex: {
                  type: 'number',
                  description: 'Index of the input element (from getWebElements)',
                },
                text: {
                  type: 'string',
                  description: 'Text to type',
                },
                clearFirst: {
                  type: 'boolean',
                  description: 'Clear existing text before typing',
                  default: true,
                },
              },
              required: ['appName', 'elementIndex', 'text'],
            },
          },
          {
            name: 'googleSearch',
            description: 'Perform a complete Google search workflow.',
            inputSchema: {
              type: 'object',
              properties: {
                appName: {
                  type: 'string',
                  description: 'Name of the browser application',
                  default: 'Google Chrome',
                },
                searchQuery: {
                  type: 'string',
                  description: 'Search query to type',
                },
                searchButtonText: {
                  type: 'string',
                  description: 'Text of the search button to click',
                  default: 'Google Search',
                },
              },
              required: ['searchQuery'],
            },
          },
          // Utility Tools
          {
            name: 'testAnalysisMethods',
            description: 'Test all analysis methods (Accessibility, AI, OCR) on the current screen.',
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
            name: 'getAvailableLLMProviders',
            description: 'Get list of available LLM providers and their status.',
            inputSchema: {
              type: 'object',
              properties: {},
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
            return await this.focusApplication(args.identifier);

          case 'closeApp':
            return await this.closeApp(args.identifier, args.force || false);

          case 'click':
            return await this.click(args.x, args.y, args.button || 'left');

          case 'moveMouse':
            return await this.moveMouse(args.x, args.y);

          case 'screenshot':
            return await this.screenshot(args.padding || 10, args.format || 'png', args.quality || 90);

          // Apple Accessibility Tools
          case 'getClickableElements':
            return await this.getClickableElements();

          case 'clickElement':
            return await this.clickElement(args.elementIndex);

          // AI Analysis Tools
          case 'analyzeImageWithAI':
            return await this.analyzeImageWithAI(args.prompt, args.padding || 10);

          case 'findAndClickElement':
            return await this.findAndClickElement(args.elementDescription, args.padding || 10);

          // OCR Tools
          case 'analyzeImageWithOCR':
            return await this.analyzeImageWithOCR(args.padding || 10);

          // Web Content Tools
          case 'getWebElements':
            return await this.getWebElements(args.padding || 10);

          case 'clickWebElement':
            return await this.clickWebElement(args.elementIndex);

          case 'findAndClickWebElement':
            return await this.findAndClickWebElement(args.elementDescription, args.padding || 10);

          // Text Input Tools
          case 'typeText':
            return await this.typeText(args.appName, args.elementIndex, args.text, args.clearFirst !== false);

          case 'googleSearch':
            return await this.googleSearch(args.appName || 'Google Chrome', args.searchQuery, args.searchButtonText || 'Google Search');

          // Utility Tools
          case 'testAnalysisMethods':
            return await this.testAnalysisMethods(args.padding || 10);

          case 'getAvailableLLMProviders':
            return await this.getAvailableLLMProviders();

          case 'findAndCloseApp':
            return await this.findAndCloseApp(args.appName, args.force || false);

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

  // Basic Tools Implementation
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

  // Apple Accessibility Tools Implementation
  private async getClickableElements(): Promise<any> {
    if (!this.currentApp) {
      throw new Error('No application focused. Use focusApplication first.');
    }

    try {
      const elements = await this.appleWindowManager.getClickableElements(this.currentApp.name);
      
      return {
        content: [
          {
            type: 'text',
            text: `Found ${elements.length} clickable elements in ${this.currentApp.name}:\n\n${elements
              .map(
                (element: any, index: number) =>
                  `${index}. "${element.text}" (${element.type})\n   Screen: (${element.screenPosition.x}, ${element.screenPosition.y})\n   Normalized: (${element.normalizedPosition.x.toFixed(3)}, ${element.normalizedPosition.y.toFixed(3)})`
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
      const elements = await this.appleWindowManager.getClickableElements(this.currentApp.name);
      
      if (elementIndex < 0 || elementIndex >= elements.length) {
        throw new Error(`Element index ${elementIndex} is out of range. Available elements: 0-${elements.length - 1}`);
      }

      const element = elements[elementIndex];
      const normalizedX = element.normalizedPosition.x;
      const normalizedY = element.normalizedPosition.y;

      // Use the existing click method
      return await this.click(normalizedX, normalizedY, 'left');
    } catch (error) {
      throw new Error(`Failed to click element: ${error}`);
    }
  }

  // AI Analysis Tools Implementation
  private async analyzeImageWithAI(prompt: string, padding: number): Promise<any> {
    if (!this.currentApp) {
      throw new Error('No application focused. Use focusApplication first.');
    }

    try {
      // Take screenshot first
      const screenshotResult = await this.screenshot(padding, 'png', 90);
      const imageData = screenshotResult.content[1].data;

      // Analyze with AI
      const analysis = await this.localLLMAnalyzer.analyzeImage(imageData, prompt);

      return {
        content: [
          {
            type: 'text',
            text: `AI Analysis Results:\n\n${analysis}`,
          },
        ],
      };
    } catch (error) {
      throw new Error(`Failed to analyze image with AI: ${error}`);
    }
  }

  private async findAndClickElement(elementDescription: string, padding: number): Promise<any> {
    if (!this.currentApp) {
      throw new Error('No application focused. Use focusApplication first.');
    }

    try {
      // Try Apple Accessibility first
      try {
        const elements = await this.appleWindowManager.getClickableElements(this.currentApp.name);
        const matchingElement = elements.find((element: any) => 
          element.text.toLowerCase().includes(elementDescription.toLowerCase())
        );

        if (matchingElement) {
          const normalizedX = matchingElement.normalizedPosition.x;
          const normalizedY = matchingElement.normalizedPosition.y;
          await this.click(normalizedX, normalizedY, 'left');
          
          return {
            content: [
              {
                type: 'text',
                text: `Found and clicked "${matchingElement.text}" using Apple Accessibility at normalized (${normalizedX.toFixed(3)}, ${normalizedY.toFixed(3)})`,
              },
            ],
          };
        }
      } catch (accessibilityError) {
        console.log('Apple Accessibility failed, trying AI analysis...');
      }

      // Fallback to AI analysis
      const analysis = await this.analyzeImageWithAI(`Find and click the "${elementDescription}" element`, padding);
      
      return {
        content: [
          {
            type: 'text',
            text: `AI Analysis completed. Please review the results and use click() with the provided coordinates.`,
          },
        ],
      };
    } catch (error) {
      throw new Error(`Failed to find and click element: ${error}`);
    }
  }

  // OCR Tools Implementation
  private async analyzeImageWithOCR(padding: number): Promise<any> {
    if (!this.currentApp) {
      throw new Error('No application focused. Use focusApplication first.');
    }

    try {
      // Take screenshot first
      const screenshotResult = await this.screenshot(padding, 'png', 90);
      const imageData = screenshotResult.content[1].data;

      // Analyze with OCR
      const analysis = await this.ocrAnalyzer.analyzeImage(imageData);

      return {
        content: [
          {
            type: 'text',
            text: `OCR Analysis Results:\n\n${analysis}`,
          },
        ],
      };
    } catch (error) {
      throw new Error(`Failed to analyze image with OCR: ${error}`);
    }
  }

  // Web Content Tools Implementation
  private async getWebElements(padding: number): Promise<any> {
    if (!this.currentApp) {
      throw new Error('No application focused. Use focusApplication first.');
    }

    try {
      // Take screenshot first
      const screenshotResult = await this.screenshot(padding, 'png', 90);
      const imageData = screenshotResult.content[1].data;

      // Analyze web content
      const elements = await this.webContentDetector.analyzeImage(imageData);

      return {
        content: [
          {
            type: 'text',
            text: `Web Elements for ${this.currentApp.name}:\n\nWindow bounds: ${this.currentApp.bounds.width}x${this.currentApp.bounds.height} at (${this.currentApp.bounds.x}, ${this.currentApp.bounds.y})\n\nFound ${elements.length} web elements:\n\n${elements
              .map(
                (element: any, index: number) =>
                  `${index}. "${element.text}" (${element.type}) - Screen: (${element.screenPosition.x}, ${element.screenPosition.y}) | Normalized: (${element.normalizedPosition.x.toFixed(3)}, ${element.normalizedPosition.y.toFixed(3)}) | Confidence: ${element.confidence} | Method: ${element.detectionMethod}`
              )
              .join('\n')}`,
          },
        ],
      };
    } catch (error) {
      throw new Error(`Failed to get web elements: ${error}`);
    }
  }

  private async clickWebElement(elementIndex: number): Promise<any> {
    if (!this.currentApp) {
      throw new Error('No application focused. Use focusApplication first.');
    }

    try {
      // Get web elements
      const screenshotResult = await this.screenshot(10, 'png', 90);
      const imageData = screenshotResult.content[1].data;
      const elements = await this.webContentDetector.analyzeImage(imageData);

      if (elementIndex < 0 || elementIndex >= elements.length) {
        throw new Error(`Element index ${elementIndex} is out of range. Available elements: 0-${elements.length - 1}`);
      }

      const element = elements[elementIndex];
      const normalizedX = element.normalizedPosition.x;
      const normalizedY = element.normalizedPosition.y;

      // Use the existing click method
      return await this.click(normalizedX, normalizedY, 'left');
    } catch (error) {
      throw new Error(`Failed to click web element: ${error}`);
    }
  }

  private async findAndClickWebElement(elementDescription: string, padding: number): Promise<any> {
    if (!this.currentApp) {
      throw new Error('No application focused. Use focusApplication first.');
    }

    try {
      // Get web elements
      const screenshotResult = await this.screenshot(padding, 'png', 90);
      const imageData = screenshotResult.content[1].data;
      const elements = await this.webContentDetector.analyzeImage(imageData);

      // Find matching element
      const matchingElement = elements.find((element: any) => 
        element.text.toLowerCase().includes(elementDescription.toLowerCase())
      );

      if (!matchingElement) {
        throw new Error(`Web element "${elementDescription}" not found`);
      }

      const normalizedX = matchingElement.normalizedPosition.x;
      const normalizedY = matchingElement.normalizedPosition.y;
      await this.click(normalizedX, normalizedY, 'left');

      return {
        content: [
          {
            type: 'text',
            text: `Found and clicked web element "${matchingElement.text}" at normalized (${normalizedX.toFixed(3)}, ${normalizedY.toFixed(3)})`,
          },
        ],
      };
    } catch (error) {
      throw new Error(`Failed to find and click web element: ${error}`);
    }
  }

  // Text Input Tools Implementation
  private async typeText(appName: string, elementIndex: number, text: string, clearFirst: boolean): Promise<any> {
    try {
      // Focus the application first
      await this.focusApplication(appName);

      // Get web elements to find the input field
      const screenshotResult = await this.screenshot(10, 'png', 90);
      const imageData = screenshotResult.content[1].data;
      const elements = await this.webContentDetector.analyzeImage(imageData);

      if (elementIndex < 0 || elementIndex >= elements.length) {
        throw new Error(`Element index ${elementIndex} is out of range. Available elements: 0-${elements.length - 1}`);
      }

      const element = elements[elementIndex];
      const normalizedX = element.normalizedPosition.x;
      const normalizedY = element.normalizedPosition.y;

      // Convert to screen coordinates
      const screenX = this.currentApp!.bounds.x + (normalizedX * this.currentApp!.bounds.width);
      const screenY = this.currentApp!.bounds.y + (normalizedY * this.currentApp!.bounds.height);

      // Move mouse and click to focus the input field
      await mouse.setPosition({ x: screenX, y: screenY });
      await mouse.click(Button.LEFT);

      // Clear existing text if requested
      if (clearFirst) {
        await keyboard.pressKey(Key.LeftCmd, Key.A);
        await keyboard.pressKey(Key.Delete);
      }

      // Type the text
      await keyboard.type(text);

      return {
        content: [
          {
            type: 'text',
            text: `Typed "${text}" into element ${elementIndex} ("${element.text}") at normalized (${normalizedX.toFixed(3)}, ${normalizedY.toFixed(3)})`,
          },
        ],
      };
    } catch (error) {
      throw new Error(`Failed to type text: ${error}`);
    }
  }

  private async googleSearch(appName: string, searchQuery: string, searchButtonText: string): Promise<any> {
    try {
      // Focus the browser
      await this.focusApplication(appName);

      // Get web elements
      const screenshotResult = await this.screenshot(10, 'png', 90);
      const imageData = screenshotResult.content[1].data;
      const elements = await this.webContentDetector.analyzeImage(imageData);

      // Find search box
      const searchBox = elements.find((element: any) => 
        element.isInput && (element.text.toLowerCase().includes('search') || element.placeholder?.toLowerCase().includes('search'))
      );

      if (!searchBox) {
        throw new Error('Search box not found');
      }

      // Find search button
      const searchButton = elements.find((element: any) => 
        element.text.toLowerCase().includes(searchButtonText.toLowerCase())
      );

      if (!searchButton) {
        throw new Error(`Search button "${searchButtonText}" not found`);
      }

      // Type in search box
      const searchBoxIndex = elements.indexOf(searchBox);
      await this.typeText(appName, searchBoxIndex, searchQuery, true);

      // Click search button
      const searchButtonIndex = elements.indexOf(searchButton);
      await this.clickWebElement(searchButtonIndex);

      return {
        content: [
          {
            type: 'text',
            text: `Successfully performed Google search for "${searchQuery}" using "${searchButtonText}" button`,
          },
        ],
      };
    } catch (error) {
      throw new Error(`Failed to perform Google search: ${error}`);
    }
  }

  // Utility Tools Implementation
  private async testAnalysisMethods(padding: number): Promise<any> {
    if (!this.currentApp) {
      throw new Error('No application focused. Use focusApplication first.');
    }

    try {
      const results = [];

      // Test Apple Accessibility
      try {
        const accessibilityElements = await this.appleWindowManager.getClickableElements(this.currentApp.name);
        results.push(`✅ Apple Accessibility: Found ${accessibilityElements.length} elements`);
      } catch (error) {
        results.push(`❌ Apple Accessibility: Failed - ${error}`);
      }

      // Test AI Analysis
      try {
        const screenshotResult = await this.screenshot(padding, 'png', 90);
        const imageData = screenshotResult.content[1].data;
        await this.localLLMAnalyzer.analyzeImage(imageData, 'Test analysis');
        results.push(`✅ AI Analysis: Working`);
      } catch (error) {
        results.push(`❌ AI Analysis: Failed - ${error}`);
      }

      // Test OCR
      try {
        const screenshotResult = await this.screenshot(padding, 'png', 90);
        const imageData = screenshotResult.content[1].data;
        await this.ocrAnalyzer.analyzeImage(imageData);
        results.push(`✅ OCR Analysis: Working`);
      } catch (error) {
        results.push(`❌ OCR Analysis: Failed - ${error}`);
      }

      // Test Web Content Detection
      try {
        const screenshotResult = await this.screenshot(padding, 'png', 90);
        const imageData = screenshotResult.content[1].data;
        const webElements = await this.webContentDetector.analyzeImage(imageData);
        results.push(`✅ Web Content Detection: Found ${webElements.length} elements`);
      } catch (error) {
        results.push(`❌ Web Content Detection: Failed - ${error}`);
      }

      return {
        content: [
          {
            type: 'text',
            text: `Analysis Methods Test Results for ${this.currentApp.name}:\n\n${results.join('\n')}`,
          },
        ],
      };
    } catch (error) {
      throw new Error(`Failed to test analysis methods: ${error}`);
    }
  }

  private async getAvailableLLMProviders(): Promise<any> {
    try {
      const providers = await this.webContentDetector.getAvailableProviders();
      
      return {
        content: [
          {
            type: 'text',
            text: `Available LLM Providers:\n\n${providers
              .map((provider: any) => `• ${provider.name}: ${provider.status}`)
              .join('\n')}`,
          },
        ],
      };
    } catch (error) {
      throw new Error(`Failed to get LLM providers: ${error}`);
    }
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

  async run(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('MCP Eyes Advanced Server running on stdio');
  }
}

const server = new AdvancedServer();
server.run().catch(console.error);
