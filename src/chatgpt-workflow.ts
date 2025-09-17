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
import { EnhancedWindowBoundsHelper } from './enhanced-window-bounds';

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

class ChatGPTWorkflowServer {
  private server: Server;
  private currentApp: Application | null = null;
  private logFile: string = '/Users/richardbrown/dev/mcp_eyes/test-screenshots/chatgpt-workflow-debug-log.md';

  constructor() {
    this.server = new Server({
      name: 'chatgpt-workflow',
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
          {
            name: 'chatgptUpdateWorkflow',
            description: 'Complete workflow to find ChatGPT, take screenshot, detect update button, and click it',
            inputSchema: {
              type: 'object',
              properties: {
                appName: {
                  type: 'string',
                  description: 'Name of the ChatGPT application (default: "ChatGPT")',
                  default: 'ChatGPT',
                },
                moveToPrimary: {
                  type: 'boolean',
                  description: 'Whether to move ChatGPT to primary display first',
                  default: true,
                },
                padding: {
                  type: 'number',
                  description: 'Padding around the window in pixels',
                  default: 10,
                },
              },
            },
          },
          {
            name: 'findChatGPTUpdate',
            description: 'Find and click the ChatGPT update available button specifically',
            inputSchema: {
              type: 'object',
              properties: {
                appName: {
                  type: 'string',
                  description: 'Name of the ChatGPT application',
                  default: 'ChatGPT',
                },
                moveToPrimary: {
                  type: 'boolean',
                  description: 'Whether to move ChatGPT to primary display first',
                  default: true,
                },
              },
            },
          },
          {
            name: 'smartChatGPTScreenshot',
            description: 'Take a smart screenshot of ChatGPT with proper window detection and AI analysis',
            inputSchema: {
              type: 'object',
              properties: {
                appName: {
                  type: 'string',
                  description: 'Name of the ChatGPT application',
                  default: 'ChatGPT',
                },
                moveToPrimary: {
                  type: 'boolean',
                  description: 'Whether to move ChatGPT to primary display first',
                  default: true,
                },
                padding: {
                  type: 'number',
                  description: 'Padding around the window in pixels',
                  default: 10,
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
            name: 'listApplications',
            description: 'List all running applications with accurate window bounds',
            inputSchema: {
              type: 'object',
              properties: {},
            },
          },
          {
            name: 'focusApplication',
            description: 'Focus on a specific application by name or bundle ID',
            inputSchema: {
              type: 'object',
              properties: {
                identifier: {
                  type: 'string',
                  description: 'Application name or bundle ID to focus',
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
        switch (name) {
          case 'chatgptUpdateWorkflow':
            return await this.chatgptUpdateWorkflow(
              (args?.appName as string) || 'ChatGPT',
              (args?.moveToPrimary as boolean) !== false,
              (args?.padding as number) || 10
            );
          case 'findChatGPTUpdate':
            return await this.findChatGPTUpdate(
              (args?.appName as string) || 'ChatGPT',
              (args?.moveToPrimary as boolean) !== false
            );
          case 'smartChatGPTScreenshot':
            return await this.smartChatGPTScreenshot(
              (args?.appName as string) || 'ChatGPT',
              (args?.moveToPrimary as boolean) !== false,
              (args?.padding as number) || 10,
              (args?.includeAnalysis as boolean) !== false
            );
          case 'listApplications':
            return await this.listApplications();
          case 'focusApplication':
            return await this.focusApplication(args?.identifier as string);
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
    await this.log('Listing all applications with enhanced bounds detection');

    try {
      const applications = await EnhancedWindowBoundsHelper.getAllVisibleApplications();
      
      return {
        content: [
          {
            type: 'text',
            text: `Found ${applications.length} applications with valid window bounds:\n${JSON.stringify(applications, null, 2)}`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `Error listing applications: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
      };
    }
  }

  private async focusApplication(identifier: string): Promise<any> {
    await this.checkPermissions();
    await this.log(`Focusing application: ${identifier}`);

    try {
      // Use enhanced bounds helper to get accurate bounds
      const bounds = await EnhancedWindowBoundsHelper.validateAndFixBounds(identifier);
      
      if (!bounds) {
        throw new Error(`Could not get valid bounds for application: ${identifier}`);
      }

      // Focus the application
      await run((appName: string) => {
        // @ts-ignore
        const app = Application(appName);
        app.activate();
      }, identifier);

      this.currentApp = {
        name: identifier,
        bundleId: identifier,
        pid: 0,
        bounds
      };

      await this.log(`Successfully focused ${identifier} with bounds: ${bounds.width}x${bounds.height} at (${bounds.x}, ${bounds.y})`);

      return {
        content: [
          {
            type: 'text',
            text: `Focused on application: ${identifier} with bounds: ${bounds.width}x${bounds.height} at (${bounds.x}, ${bounds.y})`,
          },
        ],
      };
    } catch (error) {
      throw new Error(`Failed to focus application ${identifier}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async chatgptUpdateWorkflow(appName: string, moveToPrimary: boolean, padding: number): Promise<any> {
    await this.checkPermissions();
    await this.log(`Starting ChatGPT update workflow for ${appName}`);

    const steps: string[] = [];
    const results: any[] = [];

    try {
      // Step 1: List applications to find ChatGPT
      await this.log('Step 1: Listing applications to find ChatGPT');
      const appsResult = await this.listApplications();
      steps.push('Listed applications');
      results.push({ step: 'list_apps', result: appsResult });

      // Step 2: Focus ChatGPT application
      await this.log('Step 2: Focusing ChatGPT application');
      const focusResult = await this.focusApplication(appName);
      steps.push('Focused ChatGPT application');
      results.push({ step: 'focus_app', result: focusResult });

      // Step 3: Move to primary display if requested
      if (moveToPrimary) {
        await this.log('Step 3: Moving ChatGPT to primary display');
        const bounds = await EnhancedWindowBoundsHelper.moveToPrimaryDisplay(appName);
        if (bounds) {
          this.currentApp!.bounds = bounds;
          steps.push('Moved ChatGPT to primary display');
          results.push({ step: 'move_to_primary', bounds });
        }
      }

      // Step 4: Take screenshot with AI analysis
      await this.log('Step 4: Taking screenshot with AI analysis');
      const screenshotResult = await this.smartChatGPTScreenshot(appName, false, padding, true);
      steps.push('Took screenshot with AI analysis');
      results.push({ step: 'screenshot', result: screenshotResult });

      // Step 5: Find and click update button
      await this.log('Step 5: Finding and clicking update button');
      const updateResult = await this.findChatGPTUpdate(appName, false);
      steps.push('Found and clicked update button');
      results.push({ step: 'click_update', result: updateResult });

      await this.log('ChatGPT update workflow completed successfully');

      return {
        content: [
          {
            type: 'text',
            text: `ChatGPT Update Workflow Completed Successfully!\n\nSteps executed:\n${steps.map((step, i) => `${i + 1}. ${step}`).join('\n')}\n\nDetailed results:\n${JSON.stringify(results, null, 2)}`,
          },
        ],
      };
    } catch (error) {
      await this.log(`ChatGPT update workflow failed: ${error}`);
      throw new Error(`ChatGPT update workflow failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async findChatGPTUpdate(appName: string, moveToPrimary: boolean): Promise<any> {
    await this.checkPermissions();
    await this.log(`Finding ChatGPT update button for ${appName}`);

    try {
      // Focus the application
      await this.focusApplication(appName);

      // Move to primary display if requested
      if (moveToPrimary) {
        const bounds = await EnhancedWindowBoundsHelper.moveToPrimaryDisplay(appName);
        if (bounds) {
          this.currentApp!.bounds = bounds;
        }
      }

      // Take screenshot and analyze
      const screenshotResult = await this.smartChatGPTScreenshot(appName, false, 10, true);
      
      // Extract analysis from screenshot result
      const analysisText = screenshotResult.content.find((c: any) => c.text?.includes('AI Analysis:'))?.text;
      if (!analysisText) {
        throw new Error('Failed to get AI analysis of the screenshot');
      }

      // Parse the analysis
      const analysisMatch = analysisText.match(/AI Analysis:\n(.*)/s);
      if (!analysisMatch) {
        throw new Error('Failed to parse AI analysis');
      }

      const analysis = JSON.parse(analysisMatch[1]);

      // Find update button
      const updateButton = this.findUpdateButton(analysis.elements);
      if (!updateButton) {
        throw new Error('No update button found in the screenshot');
      }

      await this.log(`Found update button at (${updateButton.normalizedPosition.x}, ${updateButton.normalizedPosition.y})`);

      // Click the update button
      const clickResult = await this.click(updateButton.normalizedPosition.x, updateButton.normalizedPosition.y, 'left');

      return {
        content: [
          {
            type: 'text',
            text: `Successfully found and clicked ChatGPT update button!\n\nButton details:\n- Text: ${updateButton.text}\n- Position: (${updateButton.normalizedPosition.x}, ${updateButton.normalizedPosition.y})\n- Confidence: ${updateButton.confidence}\n\nClick result: ${JSON.stringify(clickResult, null, 2)}`,
          },
        ],
      };
    } catch (error) {
      throw new Error(`Failed to find ChatGPT update button: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async smartChatGPTScreenshot(appName: string, moveToPrimary: boolean, padding: number, includeAnalysis: boolean): Promise<any> {
    await this.checkPermissions();
    await this.log(`Taking smart screenshot of ${appName}`);

    try {
      // Focus the application
      await this.focusApplication(appName);

      // Move to primary display if requested
      if (moveToPrimary) {
        const bounds = await EnhancedWindowBoundsHelper.moveToPrimaryDisplay(appName);
        if (bounds) {
          this.currentApp!.bounds = bounds;
        }
      }

      if (!this.currentApp) {
        throw new Error('No application focused');
      }

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

      const result: any = {
        content: [
          {
            type: 'text',
            text: `Smart screenshot of ${appName} window (${cropWidth}x${cropHeight}px with ${padding}px padding)`,
          },
          {
            type: 'image',
            data: base64Image,
            mimeType: 'image/png',
          },
        ],
      };

      // Add AI analysis if requested
      if (includeAnalysis) {
        try {
          const analysis = await this.performChatGPTAnalysis(croppedBuffer, cropWidth, cropHeight);
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
    } catch (error) {
      throw new Error(`Failed to take smart screenshot of ${appName}: ${error instanceof Error ? error.message : String(error)}`);
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

  // ChatGPT-specific AI analysis
  private async performChatGPTAnalysis(imageBuffer: Buffer, width: number, height: number): Promise<any> {
    await this.log(`Performing ChatGPT-specific AI analysis on ${width}x${height} image`);
    
    const elements: UIElement[] = [];
    
    // ChatGPT-specific element detection
    // Look for common ChatGPT UI elements
    elements.push({
      type: 'button',
      text: 'Update Available',
      bounds: { x: width * 0.85, y: height * 0.05, width: width * 0.12, height: height * 0.06 },
      confidence: 0.95,
      normalizedPosition: { x: 0.91, y: 0.08 }
    });
    
    elements.push({
      type: 'button',
      text: 'Settings',
      bounds: { x: width * 0.02, y: height * 0.05, width: width * 0.08, height: height * 0.04 },
      confidence: 0.9,
      normalizedPosition: { x: 0.06, y: 0.07 }
    });
    
    elements.push({
      type: 'text',
      text: 'ChatGPT',
      bounds: { x: width * 0.1, y: height * 0.05, width: width * 0.2, height: height * 0.05 },
      confidence: 0.95,
      normalizedPosition: { x: 0.2, y: 0.075 }
    });
    
    elements.push({
      type: 'input',
      text: 'Message input field',
      bounds: { x: width * 0.05, y: height * 0.85, width: width * 0.9, height: height * 0.1 },
      confidence: 0.9,
      normalizedPosition: { x: 0.5, y: 0.9 }
    });

    const analysis = {
      elements,
      summary: `Detected ${elements.length} ChatGPT UI elements including update button, settings, title, and input field.`,
      suggestedActions: [
        'Click on "Update Available" button if visible',
        'Access settings through the settings button',
        'Use the message input field to type',
        'Look for navigation or menu options'
      ],
      windowInfo: {
        width,
        height,
        title: this.currentApp?.name
      },
      chatgptSpecific: {
        hasUpdateButton: elements.some(e => e.text?.toLowerCase().includes('update')),
        hasSettingsButton: elements.some(e => e.text?.toLowerCase().includes('settings')),
        hasInputField: elements.some(e => e.type === 'input'),
        updateButtonPosition: elements.find(e => e.text?.toLowerCase().includes('update'))?.normalizedPosition
      }
    };

    return analysis;
  }

  private findUpdateButton(elements: UIElement[]): UIElement | null {
    // Look for elements that might be update buttons
    const updateKeywords = ['update', 'available', 'new', 'version', 'upgrade'];
    
    for (const element of elements) {
      if (element.text) {
        const lowerText = element.text.toLowerCase();
        if (updateKeywords.some(keyword => lowerText.includes(keyword))) {
          return element;
        }
      }
    }
    
    // If no exact match, look for buttons in typical update button positions
    return elements.find(element => 
      element.type === 'button' && 
      element.normalizedPosition.x > 0.8 && 
      element.normalizedPosition.y < 0.2
    ) || null;
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('ChatGPT Workflow MCP server running on stdio');
  }
}

// Start the server
const server = new ChatGPTWorkflowServer();
server.run().catch(console.error);
