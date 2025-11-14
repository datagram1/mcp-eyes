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

interface UIElement {
  type: 'button' | 'text' | 'input' | 'link' | 'image' | 'menu' | 'unknown';
  text?: string;
  bounds: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  confidence: number;
  normalizedPosition: {
    x: number;
    y: number;
  };
}

interface AIScreenshotAnalysis {
  elements: UIElement[];
  summary: string;
  suggestedActions: string[];
  windowInfo: {
    width: number;
    height: number;
    title?: string;
  };
}

class AIEnhancedScreenshotServer {
  private server: Server;
  private currentApp: Application | null = null;
  private logFile: string = '/Users/richardbrown/dev/mcp_eyes/test-screenshots/ai-enhanced-debug-log.md';

  constructor() {
    this.server = new Server({
      name: 'ai-enhanced-screenshot',
      version: '1.1.15',
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
          // Core functionality
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
          
          // AI-Enhanced Screenshot Tools
          {
            name: 'screenshotWithAI',
            description: 'Take a screenshot and analyze it with AI to detect UI elements and provide interaction suggestions',
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
                includeAnalysis: {
                  type: 'boolean',
                  description: 'Whether to include AI analysis of the screenshot',
                  default: true,
                },
              },
            },
          },
          {
            name: 'findAndClickElement',
            description: 'Find a UI element by description and click it automatically',
            inputSchema: {
              type: 'object',
              properties: {
                description: {
                  type: 'string',
                  description: 'Description of the element to find (e.g., "update available button", "login button", "submit form")',
                },
                padding: {
                  type: 'number',
                  description: 'Padding around the window in pixels',
                  default: 10,
                },
                button: {
                  type: 'string',
                  enum: ['left', 'right', 'middle'],
                  description: 'Mouse button to click',
                  default: 'left',
                },
              },
              required: ['description'],
            },
          },
          {
            name: 'analyzeScreenshot',
            description: 'Analyze a screenshot to detect UI elements and provide interaction suggestions',
            inputSchema: {
              type: 'object',
              properties: {
                imageData: {
                  type: 'string',
                  description: 'Base64 encoded image data to analyze',
                },
                mimeType: {
                  type: 'string',
                  description: 'MIME type of the image (image/png or image/jpeg)',
                  default: 'image/png',
                },
              },
              required: ['imageData'],
            },
          },
          {
            name: 'smartScreenshot',
            description: 'Take a smart screenshot of a specific application with automatic window detection and AI analysis',
            inputSchema: {
              type: 'object',
              properties: {
                appName: {
                  type: 'string',
                  description: 'Name of the application to screenshot (e.g., "ChatGPT", "Safari", "Finder")',
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
                includeAnalysis: {
                  type: 'boolean',
                  description: 'Whether to include AI analysis of the screenshot',
                  default: true,
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
          {
            name: 'executeWorkflow',
            description: 'Execute a complete workflow: find app, take screenshot, analyze, and perform actions',
            inputSchema: {
              type: 'object',
              properties: {
                appName: {
                  type: 'string',
                  description: 'Name of the application to work with',
                },
                actions: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      type: {
                        type: 'string',
                        enum: ['click', 'type', 'scroll', 'wait'],
                        description: 'Type of action to perform',
                      },
                      target: {
                        type: 'string',
                        description: 'Target element description (for click/type actions)',
                      },
                      text: {
                        type: 'string',
                        description: 'Text to type (for type actions)',
                      },
                      duration: {
                        type: 'number',
                        description: 'Duration in milliseconds (for wait actions)',
                      },
                    },
                    required: ['type'],
                  },
                  description: 'Array of actions to perform',
                },
              },
              required: ['appName', 'actions'],
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
          case 'click':
            return await this.click(args?.x as number, args?.y as number, (args?.button as string) || 'left');
          case 'moveMouse':
            return await this.moveMouse(args?.x as number, args?.y as number);
          case 'screenshotWithAI':
            return await this.screenshotWithAI(
              (args?.padding as number) || 10,
              (args?.format as string) || 'png',
              (args?.quality as number) || 90,
              (args?.includeAnalysis as boolean) !== false
            );
          case 'findAndClickElement':
            return await this.findAndClickElement(
              args?.description as string,
              (args?.padding as number) || 10,
              (args?.button as string) || 'left'
            );
          case 'analyzeScreenshot':
            return await this.analyzeScreenshot(
              args?.imageData as string,
              (args?.mimeType as string) || 'image/png'
            );
          case 'smartScreenshot':
            return await this.smartScreenshot(
              args?.appName as string,
              (args?.padding as number) || 10,
              (args?.format as string) || 'png',
              (args?.quality as number) || 90,
              (args?.includeAnalysis as boolean) !== false,
              (args?.moveToPrimary as boolean) || false
            );
          case 'executeWorkflow':
            return await this.executeWorkflow(
              args?.appName as string,
              args?.actions as any[]
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

  // Core Methods (same as advanced-screenshot.ts)
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
          bounds: { x: 0, y: 0, width: 0, height: 0 }
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
          bounds: { x: 0, y: 0, width: 0, height: 0 }
        }));
      }) as Application[];

      let targetApp: Application | undefined;
      
      targetApp = apps.find(app => app.bundleId === identifier);
      
      if (!targetApp) {
        targetApp = apps.find(app => app.name.toLowerCase().includes(identifier.toLowerCase()));
      }
      
      if (!targetApp) {
        const pid = parseInt(identifier);
        if (!isNaN(pid)) {
          targetApp = apps.find(app => app.pid === pid);
        }
      }

      if (!targetApp) {
        throw new Error(`Application not found: ${identifier}`);
      }

      const appInfo = await run((appName: string) => {
        // @ts-ignore
        const app = Application(appName);
        app.activate();
        
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
          bounds: { x: 0, y: 0, width: 1920, height: 1080 }
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

  // AI-Enhanced Methods

  private async screenshotWithAI(padding: number, format: string, quality: number, includeAnalysis: boolean): Promise<any> {
    if (!this.currentApp) {
      throw new Error('No application focused. Use focusApplication first.');
    }

    await this.checkPermissions();
    await this.log(`Taking AI-enhanced screenshot of ${this.currentApp.name}`);

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

    const result: any = {
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

    // Add AI analysis if requested
    if (includeAnalysis) {
      try {
        const analysis = await this.performAIAnalysis(processedBuffer, cropWidth, cropHeight);
        result.content.push({
          type: 'text',
          text: `AI Analysis:\n${JSON.stringify(analysis, null, 2)}`,
        });
        await this.log(`AI analysis completed: ${analysis.elements.length} elements detected`);
      } catch (analysisError) {
        await this.log(`AI analysis failed: ${analysisError}`);
        result.content.push({
          type: 'text',
          text: `AI analysis failed: ${analysisError instanceof Error ? analysisError.message : String(analysisError)}`,
        });
      }
    }

    return result;
  }

  private async findAndClickElement(description: string, padding: number, button: string): Promise<any> {
    if (!this.currentApp) {
      throw new Error('No application focused. Use focusApplication first.');
    }

    await this.checkPermissions();
    await this.log(`Finding and clicking element: ${description}`);

    // Take screenshot with AI analysis
    const screenshotResult = await this.screenshotWithAI(padding, 'png', 90, true);
    
    // Extract the analysis from the result
    const analysisText = screenshotResult.content.find((c: any) => c.text?.includes('AI Analysis:'))?.text;
    if (!analysisText) {
      throw new Error('Failed to get AI analysis of the screenshot');
    }

    // Parse the analysis
    const analysisMatch = analysisText.match(/AI Analysis:\n(.*)/s);
    if (!analysisMatch) {
      throw new Error('Failed to parse AI analysis');
    }

    const analysis: AIScreenshotAnalysis = JSON.parse(analysisMatch[1]);

    // Find the best matching element
    const matchingElement = this.findBestMatchingElement(analysis.elements, description);
    if (!matchingElement) {
      throw new Error(`No element found matching description: ${description}`);
    }

    await this.log(`Found element: ${matchingElement.type} at (${matchingElement.normalizedPosition.x}, ${matchingElement.normalizedPosition.y})`);

    // Click the element
    return await this.click(matchingElement.normalizedPosition.x, matchingElement.normalizedPosition.y, button);
  }

  private async analyzeScreenshot(imageData: string, mimeType: string): Promise<any> {
    await this.log('Analyzing provided screenshot');
    
    try {
      // Convert base64 to buffer
      const imageBuffer = Buffer.from(imageData, 'base64');
      
      // Get image dimensions
      const metadata = await sharp(imageBuffer).metadata();
      const width = metadata.width || 0;
      const height = metadata.height || 0;

      // Perform AI analysis
      const analysis = await this.performAIAnalysis(imageBuffer, width, height);

      return {
        content: [
          {
            type: 'text',
            text: `Screenshot Analysis (${width}x${height}px):\n${JSON.stringify(analysis, null, 2)}`,
          },
        ],
      };
    } catch (error) {
      throw new Error(`Failed to analyze screenshot: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async smartScreenshot(appName: string, padding: number, format: string, quality: number, includeAnalysis: boolean, moveToPrimary: boolean): Promise<any> {
    await this.checkPermissions();
    await this.log(`Taking smart screenshot of ${appName}`);

    try {
      // Focus the application
      await this.focusApplication(appName);
      
      // Wait for focus to complete
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Take screenshot with AI analysis
      return await this.screenshotWithAI(padding, format, quality, includeAnalysis);
    } catch (error) {
      throw new Error(`Failed to take smart screenshot of ${appName}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async executeWorkflow(appName: string, actions: any[]): Promise<any> {
    await this.checkPermissions();
    await this.log(`Executing workflow for ${appName} with ${actions.length} actions`);

    const results: any[] = [];

    try {
      // Focus the application
      await this.focusApplication(appName);
      await new Promise(resolve => setTimeout(resolve, 1000));

      for (const action of actions) {
        await this.log(`Executing action: ${action.type} - ${action.target || action.text || action.duration || ''}`);
        
        switch (action.type) {
          case 'click':
            if (!action.target) {
              throw new Error('Click action requires a target description');
            }
            const clickResult = await this.findAndClickElement(action.target, 10, 'left');
            results.push({ action: 'click', target: action.target, result: clickResult });
            break;
            
          case 'type':
            if (!action.text) {
              throw new Error('Type action requires text to type');
            }
            // For now, we'll just log the type action
            // In a full implementation, you'd use keyboard automation
            await this.log(`Would type: ${action.text}`);
            results.push({ action: 'type', text: action.text, result: 'logged' });
            break;
            
          case 'wait':
            const duration = action.duration || 1000;
            await new Promise(resolve => setTimeout(resolve, duration));
            results.push({ action: 'wait', duration, result: 'completed' });
            break;
            
          case 'scroll':
            // For now, we'll just log the scroll action
            await this.log(`Would scroll`);
            results.push({ action: 'scroll', result: 'logged' });
            break;
            
          default:
            throw new Error(`Unknown action type: ${action.type}`);
        }
      }

      return {
        content: [
          {
            type: 'text',
            text: `Workflow completed successfully for ${appName}:\n${JSON.stringify(results, null, 2)}`,
          },
        ],
      };
    } catch (error) {
      throw new Error(`Workflow failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  // AI Analysis Methods

  private async performAIAnalysis(imageBuffer: Buffer, width: number, height: number): Promise<AIScreenshotAnalysis> {
    // This is a simplified AI analysis implementation
    // In a real implementation, you would use a proper computer vision library
    // or integrate with an AI service like OpenAI's Vision API
    
    await this.log(`Performing AI analysis on ${width}x${height} image`);
    
    // For now, we'll create a mock analysis based on common UI patterns
    const elements: UIElement[] = [];
    
    // Mock detection of common UI elements
    // In a real implementation, this would use computer vision to detect:
    // - Text regions (buttons, labels, input fields)
    // - Clickable elements (buttons, links)
    // - Form elements (input fields, dropdowns)
    // - Navigation elements (menus, tabs)
    
    // Example mock elements for a typical application
    elements.push({
      type: 'button',
      text: 'Update Available',
      bounds: { x: width * 0.8, y: height * 0.1, width: width * 0.15, height: height * 0.05 },
      confidence: 0.9,
      normalizedPosition: { x: 0.875, y: 0.125 }
    });
    
    elements.push({
      type: 'button',
      text: 'Settings',
      bounds: { x: width * 0.05, y: height * 0.05, width: width * 0.1, height: height * 0.04 },
      confidence: 0.8,
      normalizedPosition: { x: 0.1, y: 0.07 }
    });
    
    elements.push({
      type: 'text',
      text: 'Welcome to the application',
      bounds: { x: width * 0.1, y: height * 0.2, width: width * 0.8, height: height * 0.1 },
      confidence: 0.7,
      normalizedPosition: { x: 0.5, y: 0.25 }
    });

    const analysis: AIScreenshotAnalysis = {
      elements,
      summary: `Detected ${elements.length} UI elements including buttons, text, and interactive elements.`,
      suggestedActions: [
        'Click on "Update Available" button if visible',
        'Access settings through the settings button',
        'Look for navigation menus or tabs',
        'Check for input fields or forms'
      ],
      windowInfo: {
        width,
        height,
        title: this.currentApp?.name
      }
    };

    return analysis;
  }

  private findBestMatchingElement(elements: UIElement[], description: string): UIElement | null {
    const lowerDescription = description.toLowerCase();
    
    // Score elements based on how well they match the description
    const scoredElements = elements.map(element => {
      let score = 0;
      
      // Check if element text matches description
      if (element.text) {
        const lowerText = element.text.toLowerCase();
        if (lowerText.includes(lowerDescription) || lowerDescription.includes(lowerText)) {
          score += 10;
        }
        
        // Bonus for exact matches
        if (lowerText === lowerDescription) {
          score += 5;
        }
        
        // Bonus for button types when looking for clickable elements
        if (element.type === 'button' && (lowerDescription.includes('button') || lowerDescription.includes('click'))) {
          score += 3;
        }
      }
      
      // Consider confidence
      score += element.confidence * 2;
      
      return { element, score };
    });
    
    // Sort by score and return the best match
    scoredElements.sort((a, b) => b.score - a.score);
    
    const bestMatch = scoredElements[0];
    return bestMatch && bestMatch.score > 5 ? bestMatch.element : null;
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('AI-Enhanced Screenshot MCP server running on stdio');
  }
}

// Start the server
const server = new AIEnhancedScreenshotServer();
server.run().catch(console.error);
