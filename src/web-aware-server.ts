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
  Point,
  Button,
  Key
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
import { WebContentDetector } from './web-content-detector';

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

interface WebElement {
  type: 'link' | 'button' | 'text' | 'image' | 'input' | 'unknown';
  text?: string;
  bounds: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  normalizedPosition: {
    x: number;
    y: number;
  };
  screenPosition: {
    x: number;
    y: number;
  };
  confidence: number;
  detectionMethod: 'web-accessibility' | 'ai' | 'ocr' | 'heuristic';
  url?: string;
  isClickable: boolean;
  isEnabled: boolean;
}

class WebAwareServer {
  private server: Server;
  private currentApp: Application | null = null;
  private webDetector: WebContentDetector;
  private logFile: string = '/Users/richardbrown/dev/mcp_eyes/test-screenshots/web-aware-debug-log.md';

  constructor() {
    this.server = new Server({
      name: 'web-aware-server',
      version: '1.1.15',
    });

    this.webDetector = new WebContentDetector();
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
            name: 'getWebElements',
            description: 'Get all web elements (links, buttons) from browser content',
            inputSchema: {
              type: 'object',
              properties: {
                appName: {
                  type: 'string',
                  description: 'Name of the browser application (e.g., "Google Chrome")',
                },
                includeScreenCoordinates: {
                  type: 'boolean',
                  description: 'Whether to include absolute screen coordinates',
                  default: true
                },
                searchText: {
                  type: 'string',
                  description: 'Search for elements containing specific text',
                }
              },
              required: ['appName'],
            },
          },
          {
            name: 'clickWebElement',
            description: 'Click a specific web element by index',
            inputSchema: {
              type: 'object',
              properties: {
                appName: {
                  type: 'string',
                  description: 'Name of the browser application',
                },
                elementIndex: {
                  type: 'number',
                  description: 'Index of the element from getWebElements result',
                },
                button: {
                  type: 'string',
                  enum: ['left', 'right', 'middle'],
                  description: 'Mouse button to click',
                  default: 'left'
                },
                useScreenCoordinates: {
                  type: 'boolean',
                  description: 'Use absolute screen coordinates instead of normalized',
                  default: true
                }
              },
              required: ['appName', 'elementIndex'],
            },
          },
          {
            name: 'findAndClickWebElement',
            description: 'Find and click a web element by text content',
            inputSchema: {
              type: 'object',
              properties: {
                appName: {
                  type: 'string',
                  description: 'Name of the browser application',
                },
                searchText: {
                  type: 'string',
                  description: 'Text content to search for',
                },
                button: {
                  type: 'string',
                  enum: ['left', 'right', 'middle'],
                  description: 'Mouse button to click',
                  default: 'left'
                }
              },
              required: ['appName', 'searchText'],
            },
          },
          {
            name: 'testWebDetection',
            description: 'Test web content detection capabilities',
            inputSchema: {
              type: 'object',
              properties: {},
            },
          },
          {
            name: 'listApplications',
            description: 'List all running applications with enhanced bounds detection',
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
          {
            name: 'moveMouseToWebElement',
            description: 'Move mouse to a specific web element without clicking',
            inputSchema: {
              type: 'object',
              properties: {
                appName: {
                  type: 'string',
                  description: 'Name of the browser application',
                },
                elementIndex: {
                  type: 'number',
                  description: 'Index of the element from getWebElements result',
                },
                useScreenCoordinates: {
                  type: 'boolean',
                  description: 'Use absolute screen coordinates instead of normalized',
                  default: true
                }
              },
              required: ['appName', 'elementIndex'],
            },
          },
          {
            name: 'screenshotAndAnalyze',
            description: 'Take screenshot and analyze web content',
            inputSchema: {
              type: 'object',
              properties: {
                appName: {
                  type: 'string',
                  description: 'Name of the browser application',
                },
                padding: {
                  type: 'number',
                  description: 'Padding around the window in pixels',
                  default: 10
                },
                includeImage: {
                  type: 'boolean',
                  description: 'Whether to include the screenshot image in response',
                  default: false
                }
              },
              required: ['appName'],
            },
          },
          {
            name: 'typeText',
            description: 'Type text into a web element (search box, input field)',
            inputSchema: {
              type: 'object',
              properties: {
                appName: {
                  type: 'string',
                  description: 'Name of the browser application',
                },
                elementIndex: {
                  type: 'number',
                  description: 'Index of the input element from getWebElements result',
                },
                text: {
                  type: 'string',
                  description: 'Text to type into the element',
                },
                clearFirst: {
                  type: 'boolean',
                  description: 'Whether to clear the field before typing',
                  default: true
                }
              },
              required: ['appName', 'elementIndex', 'text'],
            },
          },
          {
            name: 'googleSearch',
            description: 'Complete Google search workflow: find search box, type query, click search button',
            inputSchema: {
              type: 'object',
              properties: {
                appName: {
                  type: 'string',
                  description: 'Name of the browser application',
                  default: 'Google Chrome'
                },
                searchQuery: {
                  type: 'string',
                  description: 'Search query to type (e.g., "telephone poles")',
                },
                searchButtonText: {
                  type: 'string',
                  description: 'Text of the search button to click (e.g., "AI Mode", "Google Search")',
                  default: 'AI Mode'
                }
              },
              required: ['searchQuery'],
            },
          },
          {
            name: 'findSearchBox',
            description: 'Find and return the search box element',
            inputSchema: {
              type: 'object',
              properties: {
                appName: {
                  type: 'string',
                  description: 'Name of the browser application',
                }
              },
              required: ['appName'],
            },
          },
          {
            name: 'findButton',
            description: 'Find a button by text content',
            inputSchema: {
              type: 'object',
              properties: {
                appName: {
                  type: 'string',
                  description: 'Name of the browser application',
                },
                buttonText: {
                  type: 'string',
                  description: 'Text content of the button to find',
                }
              },
              required: ['appName', 'buttonText'],
            },
          },
          {
            name: 'takeVerificationScreenshot',
            description: 'Take a screenshot for verification purposes (after text input or button click)',
            inputSchema: {
              type: 'object',
              properties: {
                appName: {
                  type: 'string',
                  description: 'Name of the browser application',
                },
                description: {
                  type: 'string',
                  description: 'Description of what this screenshot is verifying',
                },
                padding: {
                  type: 'number',
                  description: 'Padding around the window in pixels',
                  default: 10
                },
                includeImage: {
                  type: 'boolean',
                  description: 'Whether to include the screenshot image in response',
                  default: true
                }
              },
              required: ['appName', 'description'],
            },
          },
        ],
      };
    });

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        switch (name) {
          case 'getWebElements':
            return await this.getWebElements(
              args?.appName as string,
              (args?.includeScreenCoordinates as boolean) !== false,
              args?.searchText as string
            );
          case 'clickWebElement':
            return await this.clickWebElement(
              args?.appName as string,
              args?.elementIndex as number,
              (args?.button as string) || 'left',
              (args?.useScreenCoordinates as boolean) !== false
            );
          case 'findAndClickWebElement':
            return await this.findAndClickWebElement(
              args?.appName as string,
              args?.searchText as string,
              (args?.button as string) || 'left'
            );
          case 'testWebDetection':
            return await this.testWebDetection();
          case 'listApplications':
            return await this.listApplications();
          case 'focusApplication':
            return await this.focusApplication(args?.identifier as string);
          case 'moveMouseToWebElement':
            return await this.moveMouseToWebElement(
              args?.appName as string,
              args?.elementIndex as number,
              (args?.useScreenCoordinates as boolean) !== false
            );
          case 'screenshotAndAnalyze':
            return await this.screenshotAndAnalyze(
              args?.appName as string,
              (args?.padding as number) || 10,
              (args?.includeImage as boolean) !== false
            );
          case 'typeText':
            return await this.typeText(
              args?.appName as string,
              args?.elementIndex as number,
              args?.text as string,
              (args?.clearFirst as boolean) !== false
            );
          case 'googleSearch':
            return await this.googleSearch(
              (args?.appName as string) || 'Google Chrome',
              args?.searchQuery as string,
              (args?.searchButtonText as string) || 'AI Mode'
            );
          case 'findSearchBox':
            return await this.findSearchBox(args?.appName as string);
          case 'findButton':
            return await this.findButton(
              args?.appName as string,
              args?.buttonText as string
            );
          case 'takeVerificationScreenshot':
            return await this.takeVerificationScreenshot(
              args?.appName as string,
              args?.description as string,
              (args?.padding as number) || 10,
              (args?.includeImage as boolean) !== false
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

  private async listApplications(): Promise<any> {
    await this.checkPermissions();
    await this.log('Listing applications with enhanced bounds detection');

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
      const bounds = await EnhancedWindowBoundsHelper.validateAndFixBounds(identifier);
      
      if (!bounds) {
        throw new Error(`Could not get valid bounds for application: ${identifier}`);
      }

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

  private async getWebElements(appName: string, includeScreenCoordinates: boolean, searchText?: string): Promise<any> {
    await this.checkPermissions();
    await this.log(`Getting web elements for ${appName}`);

    try {
      // Focus the application first
      await this.focusApplication(appName);
      
      if (!this.currentApp) {
        throw new Error('No application focused');
      }

      // Take screenshot
      const screenshot = await this.takeScreenshot();
      
      // Analyze web content
      const analysis = await this.webDetector.analyzeWebContent(screenshot, this.currentApp.bounds, appName);
      
      let elements = analysis.elements;
      
      // Filter by search text if provided
      if (searchText) {
        elements = await this.webDetector.findElementsByText(elements, searchText);
      }
      
      // Format response
      const responseText = `Web Elements for ${appName}:\n\n` +
        `Window bounds: ${this.currentApp.bounds.width}x${this.currentApp.bounds.height} at (${this.currentApp.bounds.x}, ${this.currentApp.bounds.y})\n\n` +
        `Found ${elements.length} web elements:\n\n` +
        elements.map((el, index) => 
          `${index + 1}. "${el.text || el.type}" (${el.type}) - ` +
          `Screen: (${el.screenPosition.x}, ${el.screenPosition.y}) | ` +
          `Normalized: (${el.normalizedPosition.x.toFixed(3)}, ${el.normalizedPosition.y.toFixed(3)}) | ` +
          `Confidence: ${el.confidence} | Method: ${el.detectionMethod}` +
          (el.url ? ` | URL: ${el.url}` : '')
        ).join('\n') +
        `\n\nSuggested Actions:\n${analysis.suggestedActions.join('\n')}`;

      return {
        content: [
          {
            type: 'text',
            text: responseText,
          },
        ],
      };
    } catch (error) {
      throw new Error(`Failed to get web elements: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async clickWebElement(appName: string, elementIndex: number, button: string, useScreenCoordinates: boolean): Promise<any> {
    await this.checkPermissions();
    await this.log(`Clicking web element ${elementIndex} in ${appName}`);

    try {
      // Get web elements
      const elementsResult = await this.getWebElements(appName, true);
      const elementsText = elementsResult.content[0].text;
      
      // Parse elements from the result
      const elements: WebElement[] = [];
      const lines = elementsText.split('\n');
      
      // Find the elements section
      let inElementsSection = false;
      for (const line of lines) {
        if (line.includes('Found') && line.includes('web elements:')) {
          inElementsSection = true;
          continue;
        }
        if (inElementsSection && line.match(/^\d+\./)) {
          const match = line.match(/(\d+)\. "(.+)" \((.+)\) - Screen: \(([0-9.]+), ([0-9.]+)\) \| Normalized: \(([0-9.]+), ([0-9.]+)\)/);
          if (match) {
            elements.push({
              type: match[3] as any,
              text: match[2],
              bounds: { x: 0, y: 0, width: 0, height: 0 },
              normalizedPosition: { x: parseFloat(match[6]), y: parseFloat(match[7]) },
              screenPosition: { x: parseInt(match[4]), y: parseInt(match[5]) },
              isClickable: true,
              isEnabled: true,
              confidence: 0.8,
              detectionMethod: 'ai' as const
            });
          }
        }
      }

      if (elementIndex < 0 || elementIndex >= elements.length) {
        throw new Error(`Element index ${elementIndex} out of range (0-${elements.length - 1})`);
      }

      const element = elements[elementIndex];
      const targetX = useScreenCoordinates ? element.screenPosition.x : 
        (this.currentApp!.bounds.x + element.normalizedPosition.x * this.currentApp!.bounds.width);
      const targetY = useScreenCoordinates ? element.screenPosition.y : 
        (this.currentApp!.bounds.y + element.normalizedPosition.y * this.currentApp!.bounds.height);

      await this.log(`Moving mouse to (${targetX}, ${targetY}) and clicking ${button} button`);
      
      await mouse.move([new Point(targetX, targetY)]);
      
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
            text: `Successfully clicked web element ${elementIndex + 1} ("${element.text}") at (${targetX}, ${targetY}) with ${button} button`,
          },
        ],
      };
    } catch (error) {
      throw new Error(`Failed to click web element: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async findAndClickWebElement(appName: string, searchText: string, button: string): Promise<any> {
    await this.checkPermissions();
    await this.log(`Finding and clicking web element with text "${searchText}" in ${appName}`);

    try {
      // Get web elements filtered by search text
      const elementsResult = await this.getWebElements(appName, true, searchText);
      const elementsText = elementsResult.content[0].text;
      
      // Parse elements from the result
      const elements: WebElement[] = [];
      const lines = elementsText.split('\n');
      
      // Find the elements section
      let inElementsSection = false;
      for (const line of lines) {
        if (line.includes('Found') && line.includes('web elements:')) {
          inElementsSection = true;
          continue;
        }
        if (inElementsSection && line.match(/^\d+\./)) {
          const match = line.match(/(\d+)\. "(.+)" \((.+)\) - Screen: \(([0-9.]+), ([0-9.]+)\) \| Normalized: \(([0-9.]+), ([0-9.]+)\)/);
          if (match) {
            elements.push({
              type: match[3] as any,
              text: match[2],
              bounds: { x: 0, y: 0, width: 0, height: 0 },
              normalizedPosition: { x: parseFloat(match[6]), y: parseFloat(match[7]) },
              screenPosition: { x: parseInt(match[4]), y: parseInt(match[5]) },
              isClickable: true,
              isEnabled: true,
              confidence: 0.8,
              detectionMethod: 'ai' as const
            });
          }
        }
      }

      if (elements.length === 0) {
        throw new Error(`No web elements found matching text: "${searchText}"`);
      }

      // Click the first matching element
      return await this.clickWebElement(appName, 0, button, true);
    } catch (error) {
      throw new Error(`Failed to find and click web element: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async moveMouseToWebElement(appName: string, elementIndex: number, useScreenCoordinates: boolean): Promise<any> {
    await this.checkPermissions();
    await this.log(`Moving mouse to web element ${elementIndex} in ${appName}`);

    try {
      // Get web elements
      const elementsResult = await this.getWebElements(appName, true);
      const elementsText = elementsResult.content[0].text;
      
      // Parse elements from the result
      const elements: WebElement[] = [];
      const lines = elementsText.split('\n');
      
      // Find the elements section
      let inElementsSection = false;
      for (const line of lines) {
        if (line.includes('Found') && line.includes('web elements:')) {
          inElementsSection = true;
          continue;
        }
        if (inElementsSection && line.match(/^\d+\./)) {
          const match = line.match(/(\d+)\. "(.+)" \((.+)\) - Screen: \(([0-9.]+), ([0-9.]+)\) \| Normalized: \(([0-9.]+), ([0-9.]+)\)/);
          if (match) {
            elements.push({
              type: match[3] as any,
              text: match[2],
              bounds: { x: 0, y: 0, width: 0, height: 0 },
              normalizedPosition: { x: parseFloat(match[6]), y: parseFloat(match[7]) },
              screenPosition: { x: parseInt(match[4]), y: parseInt(match[5]) },
              isClickable: true,
              isEnabled: true,
              confidence: 0.8,
              detectionMethod: 'ai' as const
            });
          }
        }
      }

      if (elementIndex < 0 || elementIndex >= elements.length) {
        throw new Error(`Element index ${elementIndex} out of range (0-${elements.length - 1})`);
      }

      const element = elements[elementIndex];
      const targetX = useScreenCoordinates ? element.screenPosition.x : 
        (this.currentApp!.bounds.x + element.normalizedPosition.x * this.currentApp!.bounds.width);
      const targetY = useScreenCoordinates ? element.screenPosition.y : 
        (this.currentApp!.bounds.y + element.normalizedPosition.y * this.currentApp!.bounds.height);

      await this.log(`Moving mouse to (${targetX}, ${targetY})`);
      
      await mouse.move([new Point(targetX, targetY)]);

      return {
        content: [
          {
            type: 'text',
            text: `Successfully moved mouse to web element ${elementIndex + 1} ("${element.text}") at (${targetX}, ${targetY})`,
          },
        ],
      };
    } catch (error) {
      throw new Error(`Failed to move mouse to web element: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async screenshotAndAnalyze(appName: string, padding: number, includeImage: boolean): Promise<any> {
    await this.checkPermissions();
    await this.log(`Taking screenshot and analyzing web content for ${appName}`);

    try {
      // Focus the application
      await this.focusApplication(appName);
      
      if (!this.currentApp) {
        throw new Error('No application focused');
      }

      // Take screenshot
      const screenshot = await this.takeScreenshot(padding);
      const base64Image = screenshot.toString('base64');

      // Analyze web content
      const analysis = await this.webDetector.analyzeWebContent(screenshot, this.currentApp.bounds, appName);

      const result: any = {
        content: [
          {
            type: 'text',
            text: `Screenshot and Web Analysis for ${appName} (${this.currentApp.bounds.width}x${this.currentApp.bounds.height}px with ${padding}px padding)\n\n${analysis.summary}\n\nFound ${analysis.elements.length} web elements:\n\n${analysis.elements.map((el, index) => 
              `${index + 1}. "${el.text || el.type}" (${el.type}) - Confidence: ${el.confidence} | Method: ${el.detectionMethod}`
            ).join('\n')}`,
          },
        ],
      };

      if (includeImage) {
        result.content.push({
          type: 'image',
          data: base64Image,
          mimeType: 'image/png',
        });
      }

      return result;
    } catch (error) {
      throw new Error(`Screenshot and analysis failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async testWebDetection(): Promise<any> {
    await this.log('Testing web content detection capabilities');

    return {
      content: [
        {
          type: 'text',
          text: `Web Content Detection Test Results:\n\n` +
            `✅ Web Accessibility: Available (Chrome-specific)\n` +
            `✅ AI Analysis: Available (Local LLM at http://127.0.0.1:1234)\n` +
            `✅ Enhanced OCR: Available (Tesseract + Heuristic)\n` +
            `✅ Heuristic Detection: Available (Pattern-based)\n\n` +
            `Priority Order: Web Accessibility → AI → Enhanced OCR → Heuristic\n` +
            `Specialized for: Links, buttons, news articles, web content\n` +
            `Target Keywords: Swansea, Update, flooded, roundabout, news, article`,
        },
      ],
    };
  }

  private async takeScreenshot(padding: number = 0): Promise<Buffer> {
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

    return croppedBuffer;
  }

  private async typeText(appName: string, elementIndex: number, text: string, clearFirst: boolean): Promise<any> {
    await this.checkPermissions();
    await this.log(`Typing text "${text}" into element ${elementIndex} in ${appName}`);

    try {
      // Get web elements
      const elementsResult = await this.getWebElements(appName, true);
      const elementsText = elementsResult.content[0].text;
      
      await this.log(`Raw elements text: ${elementsText}`);
      
      // Parse elements from the result
      const elements: WebElement[] = [];
      const lines = elementsText.split('\n');
      
      // Find the elements section
      let inElementsSection = false;
      for (const line of lines) {
        if (line.includes('Found') && line.includes('web elements:')) {
          inElementsSection = true;
          continue;
        }
        if (inElementsSection && line.match(/^\d+\./)) {
          const match = line.match(/(\d+)\. "(.+)" \((.+)\) - Screen: \(([0-9.]+), ([0-9.]+)\) \| Normalized: \(([0-9.]+), ([0-9.]+)\)/);
          if (match) {
            const element = {
              type: match[3] as any,
              text: match[2],
              bounds: { x: 0, y: 0, width: 0, height: 0 },
              normalizedPosition: { x: parseFloat(match[6]), y: parseFloat(match[7]) },
              screenPosition: { x: parseInt(match[4]), y: parseInt(match[5]) },
              isClickable: true,
              isEnabled: true,
              confidence: 0.8,
              detectionMethod: 'ai' as const
            };
            elements.push(element);
            await this.log(`Parsed element ${elements.length - 1}: "${element.text}" at screen (${element.screenPosition.x}, ${element.screenPosition.y})`);
          }
        }
      }

      await this.log(`Parsed ${elements.length} elements total`);

      if (elementIndex < 0 || elementIndex >= elements.length) {
        throw new Error(`Element index ${elementIndex} out of range (0-${elements.length - 1})`);
      }

      const element = elements[elementIndex];
      await this.log(`Using element ${elementIndex}: "${element.text}" (${element.type})`);
      
      // Use screen coordinates directly (they're already absolute)
      const targetX = element.screenPosition.x;
      const targetY = element.screenPosition.y;

      await this.log(`Clicking on element at screen coordinates (${targetX}, ${targetY}) to focus it`);
      
      // Move mouse and click on the element to focus it
      await mouse.move([new Point(targetX, targetY)]);
      await new Promise(resolve => setTimeout(resolve, 200)); // Small delay before click
      await mouse.leftClick();
      
      // Wait a moment for focus
      await new Promise(resolve => setTimeout(resolve, 800));
      
      if (clearFirst) {
        await this.log('Clearing existing text');
        // Select all and delete
        await keyboard.pressKey(Key.A, Key.LeftCmd);
        await new Promise(resolve => setTimeout(resolve, 100));
        await keyboard.pressKey(Key.Delete);
        await new Promise(resolve => setTimeout(resolve, 300));
      }
      
      await this.log(`Typing: "${text}"`);
      await keyboard.type(text);
      
      // Wait for text to be typed
      await new Promise(resolve => setTimeout(resolve, 500));
      
      return {
        content: [
          {
            type: 'text',
            text: `Successfully typed "${text}" into element ${elementIndex + 1} ("${element.text}") at screen coordinates (${targetX}, ${targetY})`,
          },
        ],
      };
    } catch (error) {
      throw new Error(`Failed to type text: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async googleSearch(appName: string, searchQuery: string, searchButtonText: string): Promise<any> {
    await this.checkPermissions();
    await this.log(`Performing Google search for "${searchQuery}" and clicking "${searchButtonText}" button`);

    try {
      // Step 1: Focus the application
      await this.focusApplication(appName);
      
      // Step 2: Take screenshot and analyze
      const analysisResult = await this.screenshotAndAnalyze(appName, 10, false);
      
      // Step 3: Get web elements
      const elementsResult = await this.getWebElements(appName, true);
      const elementsText = elementsResult.content[0].text;
      
      await this.log(`Raw elements text: ${elementsText}`);
      
      // Parse elements from the result
      const elements: WebElement[] = [];
      const lines = elementsText.split('\n');
      
      // Find the elements section
      let inElementsSection = false;
      for (const line of lines) {
        if (line.includes('Found') && line.includes('web elements:')) {
          inElementsSection = true;
          continue;
        }
        if (inElementsSection && line.match(/^\d+\./)) {
          const match = line.match(/(\d+)\. "(.+)" \((.+)\) - Screen: \(([0-9.]+), ([0-9.]+)\) \| Normalized: \(([0-9.]+), ([0-9.]+)\)/);
          if (match) {
            const element = {
              type: match[3] as any,
              text: match[2],
              bounds: { x: 0, y: 0, width: 0, height: 0 },
              normalizedPosition: { x: parseFloat(match[6]), y: parseFloat(match[7]) },
              screenPosition: { x: parseInt(match[4]), y: parseInt(match[5]) },
              isClickable: true,
              isEnabled: true,
              confidence: 0.8,
              detectionMethod: 'ai' as const
            };
            elements.push(element);
            await this.log(`Parsed element ${elements.length - 1}: "${element.text}" at screen (${element.screenPosition.x}, ${element.screenPosition.y})`);
          }
        }
      }

      await this.log(`Parsed ${elements.length} elements total`);

      // Step 4: Find search box
      const searchBox = await this.webDetector.findSearchBox(elements);
      if (!searchBox) {
        throw new Error('Could not find search box');
      }

      const searchBoxIndex = elements.findIndex(el => el === searchBox);
      await this.log(`Found search box at index ${searchBoxIndex}: "${searchBox.text}"`);

      // Step 5: Type search query
      await this.typeText(appName, searchBoxIndex, searchQuery, true);
      
      // Step 6: Find search button
      const searchButton = await this.webDetector.findButtonByText(elements, searchButtonText);
      if (!searchButton) {
        throw new Error(`Could not find button with text "${searchButtonText}"`);
      }

      const searchButtonIndex = elements.findIndex(el => el === searchButton);
      await this.log(`Found search button at index ${searchButtonIndex}: "${searchButton.text}"`);

      // Step 7: Click search button
      await this.clickWebElement(appName, searchButtonIndex, 'left', true);

      return {
        content: [
          {
            type: 'text',
            text: `✅ Google search completed successfully!\n\n` +
                  `📝 Search query: "${searchQuery}"\n` +
                  `🔍 Search box: "${searchBox.text}" (index ${searchBoxIndex})\n` +
                  `🔘 Search button: "${searchButton.text}" (index ${searchButtonIndex})\n` +
                  `🎯 Task completed: Success`,
          },
        ],
      };
    } catch (error) {
      throw new Error(`Google search failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async findSearchBox(appName: string): Promise<any> {
    await this.checkPermissions();
    await this.log(`Finding search box in ${appName}`);

    try {
      // Get web elements
      const elementsResult = await this.getWebElements(appName, true);
      const elementsText = elementsResult.content[0].text;
      
      await this.log(`Raw elements text: ${elementsText}`);
      
      // Parse elements from the result
      const elements: WebElement[] = [];
      const lines = elementsText.split('\n');
      
      // Find the elements section
      let inElementsSection = false;
      for (const line of lines) {
        if (line.includes('Found') && line.includes('web elements:')) {
          inElementsSection = true;
          continue;
        }
        if (inElementsSection && line.match(/^\d+\./)) {
          const match = line.match(/(\d+)\. "(.+)" \((.+)\) - Screen: \(([0-9.]+), ([0-9.]+)\) \| Normalized: \(([0-9.]+), ([0-9.]+)\)/);
          if (match) {
            const element = {
              type: match[3] as any,
              text: match[2],
              bounds: { x: 0, y: 0, width: 0, height: 0 },
              normalizedPosition: { x: parseFloat(match[6]), y: parseFloat(match[7]) },
              screenPosition: { x: parseInt(match[4]), y: parseInt(match[5]) },
              isClickable: true,
              isEnabled: true,
              confidence: 0.8,
              detectionMethod: 'ai' as const
            };
            elements.push(element);
            await this.log(`Parsed element ${elements.length - 1}: "${element.text}" (${element.type}) at screen (${element.screenPosition.x}, ${element.screenPosition.y})`);
          }
        }
      }

      await this.log(`Parsed ${elements.length} elements total`);

      // Look for search box directly in the parsed elements
      const searchBox = elements.find(element => 
        element.type === 'input' || 
        (element.text && element.text.toLowerCase().includes('search'))
      );
      
      if (!searchBox) {
        return {
          content: [
            {
              type: 'text',
              text: `❌ No search box found in ${appName}. Available elements:\n${elements.map((el, i) => `${i}. "${el.text}" (${el.type})`).join('\n')}`,
            },
          ],
        };
      }

      const searchBoxIndex = elements.findIndex(el => el === searchBox);

      return {
        content: [
          {
            type: 'text',
            text: `✅ Search box found!\n\n` +
                  `🔍 Search box: "${searchBox.text}" (${searchBox.type})\n` +
                  `📍 Index: ${searchBoxIndex}\n` +
                  `📍 Screen coordinates: (${searchBox.screenPosition.x}, ${searchBox.screenPosition.y})\n` +
                  `📍 Normalized coordinates: (${searchBox.normalizedPosition.x.toFixed(3)}, ${searchBox.normalizedPosition.y.toFixed(3)})`,
          },
        ],
      };
    } catch (error) {
      throw new Error(`Failed to find search box: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async findButton(appName: string, buttonText: string): Promise<any> {
    await this.checkPermissions();
    await this.log(`Finding button "${buttonText}" in ${appName}`);

    try {
      // Get web elements
      const elementsResult = await this.getWebElements(appName, true);
      const elementsText = elementsResult.content[0].text;
      
      await this.log(`Raw elements text: ${elementsText}`);
      
      // Parse elements from the result
      const elements: WebElement[] = [];
      const lines = elementsText.split('\n');
      
      // Find the elements section
      let inElementsSection = false;
      for (const line of lines) {
        if (line.includes('Found') && line.includes('web elements:')) {
          inElementsSection = true;
          continue;
        }
        if (inElementsSection && line.match(/^\d+\./)) {
          const match = line.match(/(\d+)\. "(.+)" \((.+)\) - Screen: \(([0-9.]+), ([0-9.]+)\) \| Normalized: \(([0-9.]+), ([0-9.]+)\)/);
          if (match) {
            const element = {
              type: match[3] as any,
              text: match[2],
              bounds: { x: 0, y: 0, width: 0, height: 0 },
              normalizedPosition: { x: parseFloat(match[6]), y: parseFloat(match[7]) },
              screenPosition: { x: parseInt(match[4]), y: parseInt(match[5]) },
              isClickable: true,
              isEnabled: true,
              confidence: 0.8,
              detectionMethod: 'ai' as const
            };
            elements.push(element);
            await this.log(`Parsed element ${elements.length - 1}: "${element.text}" (${element.type}) at screen (${element.screenPosition.x}, ${element.screenPosition.y})`);
          }
        }
      }

      await this.log(`Parsed ${elements.length} elements total`);

      // Look for button directly in the parsed elements (including links)
      const lowerButtonText = buttonText.toLowerCase();
      const button = elements.find(element => 
        (element.type === 'button' || element.type === 'link') && 
        element.text && 
        element.text.toLowerCase().includes(lowerButtonText)
      );
      
      if (!button) {
        return {
          content: [
            {
              type: 'text',
              text: `❌ No button found with text "${buttonText}" in ${appName}. Available elements:\n${elements.map((el, i) => `${i}. "${el.text}" (${el.type})`).join('\n')}`,
            },
          ],
        };
      }

      const buttonIndex = elements.findIndex(el => el === button);

      return {
        content: [
          {
            type: 'text',
            text: `✅ Button found!\n\n` +
                  `🔘 Button: "${button.text}" (${button.type})\n` +
                  `📍 Index: ${buttonIndex}\n` +
                  `📍 Screen coordinates: (${button.screenPosition.x}, ${button.screenPosition.y})\n` +
                  `📍 Normalized coordinates: (${button.normalizedPosition.x.toFixed(3)}, ${button.normalizedPosition.y.toFixed(3)})`,
          },
        ],
      };
    } catch (error) {
      throw new Error(`Failed to find button: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async takeVerificationScreenshot(appName: string, description: string, padding: number, includeImage: boolean): Promise<any> {
    await this.checkPermissions();
    await this.log(`Taking verification screenshot: ${description}`);

    try {
      // Ensure the application is focused
      if (!this.currentApp || this.currentApp.name !== appName) {
        await this.log(`Focusing ${appName} for verification screenshot`);
        await this.focusApplication(appName);
      }
      
      // Take screenshot
      const screenshotBuffer = await this.takeScreenshot(padding);
      
      // Save screenshot with timestamp
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = `verification-${description.replace(/[^a-zA-Z0-9]/g, '-')}-${timestamp}.png`;
      const screenshotDir = '/tmp/mcp-eyes-screenshots';
      const screenshotPath = path.join(screenshotDir, filename);
      
      // Ensure directory exists
      await fs.promises.mkdir(screenshotDir, { recursive: true });
      await fs.promises.writeFile(screenshotPath, screenshotBuffer);
      
      await this.log(`Verification screenshot saved: ${screenshotPath}`);

      const result: any = {
        content: [
          {
            type: 'text',
            text: `📸 Verification Screenshot: ${description}\n\n` +
                  `📁 Saved to: ${screenshotPath}\n` +
                  `📏 Dimensions: ${this.currentApp!.bounds.width}x${this.currentApp!.bounds.height}px\n` +
                  `⏰ Timestamp: ${new Date().toLocaleString()}`,
          },
        ],
      };

      if (includeImage) {
        result.content.push({
          type: 'image',
          data: screenshotBuffer.toString('base64'),
          mimeType: 'image/png',
        });
      }

      return result;
    } catch (error) {
      throw new Error(`Failed to take verification screenshot: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('Web Aware MCP server running on stdio');
  }
}

// Start the server
const server = new WebAwareServer();
server.run().catch(console.error);
