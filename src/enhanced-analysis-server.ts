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
import { AppleWindowManager } from './apple-window-manager';
import { OCRAnalyzer } from './ocr-analyzer';
import { LocalLLMAnalyzer } from './local-llm-analyzer';

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

interface AnalysisConfig {
  useAppleWindowManager: boolean;
  useOCR: boolean;
  useLocalLLM: boolean;
  localLLMConfig?: {
    baseUrl: string;
    apiKey?: string;
    model?: string;
    maxTokens?: number;
    temperature?: number;
  };
}

interface AnalysisResult {
  method: 'apple-window-manager' | 'ocr' | 'local-llm' | 'fallback';
  elements: any[];
  summary: string;
  suggestedActions: string[];
  boundingBoxes: any[];
  confidence: number;
}

class EnhancedAnalysisServer {
  private server: Server;
  private currentApp: Application | null = null;
  private config: AnalysisConfig;
  private ocrAnalyzer: OCRAnalyzer;
  private llmAnalyzer: LocalLLMAnalyzer | null = null;
  private logFile: string = '/Users/richardbrown/dev/mcp_eyes/test-screenshots/enhanced-analysis-debug-log.md';

  constructor(config: AnalysisConfig) {
    this.config = config;
    this.server = new Server({
      name: 'enhanced-analysis-server',
      version: '1.1.12',
    });

    // Initialize analyzers
    this.ocrAnalyzer = new OCRAnalyzer();
    
    if (config.useLocalLLM && config.localLLMConfig) {
      this.llmAnalyzer = new LocalLLMAnalyzer(config.localLLMConfig);
    }

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
            name: 'analyzeWindow',
            description: 'Comprehensive window analysis using Apple Window Manager, OCR, and/or Local LLM',
            inputSchema: {
              type: 'object',
              properties: {
                appName: {
                  type: 'string',
                  description: 'Name of the application to analyze',
                },
                methods: {
                  type: 'array',
                  items: {
                    type: 'string',
                    enum: ['apple-window-manager', 'ocr', 'local-llm', 'all']
                  },
                  description: 'Analysis methods to use (default: all)',
                  default: ['all']
                },
                includeBoundingBoxes: {
                  type: 'boolean',
                  description: 'Whether to include bounding box information',
                  default: true
                }
              },
              required: ['appName'],
            },
          },
          {
            name: 'findClickableElements',
            description: 'Find all clickable elements in a window with detailed analysis',
            inputSchema: {
              type: 'object',
              properties: {
                appName: {
                  type: 'string',
                  description: 'Name of the application to analyze',
                },
                elementTypes: {
                  type: 'array',
                  items: {
                    type: 'string',
                    enum: ['button', 'text', 'input', 'link', 'image', 'menu', 'checkbox', 'radio', 'slider']
                  },
                  description: 'Types of elements to find (default: all)',
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
            name: 'getElementChoices',
            description: 'Get a list of clickable elements with coordinates for user selection',
            inputSchema: {
              type: 'object',
              properties: {
                appName: {
                  type: 'string',
                  description: 'Name of the application to analyze',
                },
                filterByText: {
                  type: 'string',
                  description: 'Filter elements by text content',
                },
                filterByType: {
                  type: 'string',
                  description: 'Filter elements by type',
                }
              },
              required: ['appName'],
            },
          },
          {
            name: 'clickElementByChoice',
            description: 'Click an element from the choices provided by getElementChoices',
            inputSchema: {
              type: 'object',
              properties: {
                appName: {
                  type: 'string',
                  description: 'Name of the application',
                },
                elementIndex: {
                  type: 'number',
                  description: 'Index of the element from getElementChoices result',
                },
                button: {
                  type: 'string',
                  enum: ['left', 'right', 'middle'],
                  description: 'Mouse button to click',
                  default: 'left'
                }
              },
              required: ['appName', 'elementIndex'],
            },
          },
          {
            name: 'screenshotWithAnalysis',
            description: 'Take screenshot and analyze it with all available methods',
            inputSchema: {
              type: 'object',
              properties: {
                appName: {
                  type: 'string',
                  description: 'Name of the application to screenshot',
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
                },
                analysisMethods: {
                  type: 'array',
                  items: {
                    type: 'string',
                    enum: ['apple-window-manager', 'ocr', 'local-llm', 'all']
                  },
                  description: 'Analysis methods to use',
                  default: ['all']
                }
              },
              required: ['appName'],
            },
          },
          {
            name: 'testAnalysisMethods',
            description: 'Test which analysis methods are available and working',
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
        ],
      };
    });

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        switch (name) {
          case 'analyzeWindow':
            return await this.analyzeWindow(
              args?.appName as string,
              args?.methods as string[] || ['all'],
              (args?.includeBoundingBoxes as boolean) !== false
            );
          case 'findClickableElements':
            return await this.findClickableElements(
              args?.appName as string,
              args?.elementTypes as string[],
              args?.searchText as string
            );
          case 'getElementChoices':
            return await this.getElementChoices(
              args?.appName as string,
              args?.filterByText as string,
              args?.filterByType as string
            );
          case 'clickElementByChoice':
            return await this.clickElementByChoice(
              args?.appName as string,
              args?.elementIndex as number,
              (args?.button as string) || 'left'
            );
          case 'screenshotWithAnalysis':
            return await this.screenshotWithAnalysis(
              args?.appName as string,
              (args?.padding as number) || 10,
              (args?.includeImage as boolean) !== false,
              args?.analysisMethods as string[] || ['all']
            );
          case 'testAnalysisMethods':
            return await this.testAnalysisMethods();
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

  private async analyzeWindow(appName: string, methods: string[], includeBoundingBoxes: boolean): Promise<any> {
    await this.checkPermissions();
    await this.log(`Analyzing window for ${appName} using methods: ${methods.join(', ')}`);

    try {
      // Focus the application first
      await this.focusApplication(appName);
      
      if (!this.currentApp) {
        throw new Error('No application focused');
      }

      const results: AnalysisResult[] = [];
      
      // Use Apple Window Manager if requested
      if (methods.includes('all') || methods.includes('apple-window-manager')) {
        if (this.config.useAppleWindowManager) {
          try {
            const appleAnalysis = await AppleWindowManager.analyzeWindow(appName);
            if (appleAnalysis) {
              results.push({
                method: 'apple-window-manager',
                elements: appleAnalysis.elements,
                summary: appleAnalysis.summary,
                suggestedActions: appleAnalysis.suggestedActions,
                boundingBoxes: includeBoundingBoxes ? appleAnalysis.elements.map(el => ({
                  element: el,
                  box: el.bounds
                })) : [],
                confidence: 0.95
              });
            }
          } catch (error) {
            await this.log(`Apple Window Manager analysis failed: ${error}`);
          }
        }
      }

      // Use OCR if requested
      if (methods.includes('all') || methods.includes('ocr')) {
        if (this.config.useOCR) {
          try {
            const screenshot = await this.takeScreenshot();
            const ocrAnalysis = await this.ocrAnalyzer.analyzeScreenshot(
              screenshot, 
              this.currentApp.bounds.width, 
              this.currentApp.bounds.height
            );
            
            results.push({
              method: 'ocr',
              elements: ocrAnalysis.elements,
              summary: ocrAnalysis.summary,
              suggestedActions: ocrAnalysis.suggestedActions,
              boundingBoxes: includeBoundingBoxes ? ocrAnalysis.elements.map(el => ({
                element: el,
                box: el.bounds
              })) : [],
              confidence: 0.8
            });
          } catch (error) {
            await this.log(`OCR analysis failed: ${error}`);
          }
        }
      }

      // Use Local LLM if requested
      if (methods.includes('all') || methods.includes('local-llm')) {
        if (this.config.useLocalLLM && this.llmAnalyzer) {
          try {
            const screenshot = await this.takeScreenshot();
            const llmAnalysis = await this.llmAnalyzer.analyzeScreenshot(
              screenshot, 
              this.currentApp.bounds.width, 
              this.currentApp.bounds.height,
              appName
            );
            
            results.push({
              method: 'local-llm',
              elements: llmAnalysis.elements,
              summary: llmAnalysis.summary,
              suggestedActions: llmAnalysis.suggestedActions,
              boundingBoxes: includeBoundingBoxes ? llmAnalysis.boundingBoxes : [],
              confidence: 0.9
            });
          } catch (error) {
            await this.log(`Local LLM analysis failed: ${error}`);
          }
        }
      }

      // Combine results
      const combinedElements = this.combineAnalysisResults(results);
      const combinedActions = this.combineSuggestedActions(results);

      return {
        content: [
          {
            type: 'text',
            text: `Window Analysis Results for ${appName}:\n\nMethods Used: ${results.map(r => r.method).join(', ')}\n\nCombined Summary:\n${combinedActions.join('\n')}\n\nDetailed Results:\n${JSON.stringify(results, null, 2)}`,
          },
        ],
      };
    } catch (error) {
      throw new Error(`Window analysis failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async findClickableElements(appName: string, elementTypes?: string[], searchText?: string): Promise<any> {
    await this.checkPermissions();
    await this.log(`Finding clickable elements in ${appName}`);

    try {
      const analysis = await this.analyzeWindow(appName, ['all'], true);
      const analysisText = analysis.content[0].text;
      
      // Parse the analysis results
      const resultsMatch = analysisText.match(/Detailed Results:\n(.*)/s);
      if (!resultsMatch) {
        throw new Error('Failed to parse analysis results');
      }
      
      const results = JSON.parse(resultsMatch[1]);
      let elements: any[] = [];
      
      // Combine elements from all methods
      results.forEach((result: AnalysisResult) => {
        elements = elements.concat(result.elements);
      });
      
      // Filter by type if specified
      if (elementTypes && elementTypes.length > 0) {
        elements = elements.filter((el: any) => elementTypes.includes(el.type));
      }
      
      // Filter by text if specified
      if (searchText) {
        const lowerSearchText = searchText.toLowerCase();
        elements = elements.filter((el: any) => 
          el.text && el.text.toLowerCase().includes(lowerSearchText)
        );
      }
      
      // Filter to only clickable elements
      elements = elements.filter((el: any) => el.isClickable !== false);
      
      return {
        content: [
          {
            type: 'text',
            text: `Found ${elements.length} clickable elements in ${appName}:\n\n${elements.map((el: any, index: number) => 
              `${index + 1}. ${el.text || el.type} (${el.type}) at (${el.normalizedPosition?.x?.toFixed(3) || 0}, ${el.normalizedPosition?.y?.toFixed(3) || 0})`
            ).join('\n')}`,
          },
        ],
      };
    } catch (error) {
      throw new Error(`Failed to find clickable elements: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async getElementChoices(appName: string, filterByText?: string, filterByType?: string): Promise<any> {
    await this.checkPermissions();
    await this.log(`Getting element choices for ${appName}`);

    try {
      const elementsResult = await this.findClickableElements(appName, filterByType ? [filterByType] : undefined, filterByText);
      const elementsText = elementsResult.content[0].text;
      
      // Parse elements from the result
      const elements: any[] = [];
      const lines = elementsText.split('\n').slice(1); // Skip the first line
      
      lines.forEach((line: string, index: number) => {
        if (line.trim()) {
          const match = line.match(/(\d+)\. (.+) \((.+)\) at \((.+), (.+)\)/);
          if (match) {
            elements.push({
              index: parseInt(match[1]) - 1,
              text: match[2],
              type: match[3],
              x: parseFloat(match[4]),
              y: parseFloat(match[5])
            });
          }
        }
      });
      
      return {
        content: [
          {
            type: 'text',
            text: `Element Choices for ${appName}:\n\n${elements.map(el => 
              `${el.index + 1}. "${el.text}" (${el.type}) - Click at (${el.x}, ${el.y})`
            ).join('\n')}\n\nUse clickElementByChoice with the element index to click an element.`,
          },
        ],
      };
    } catch (error) {
      throw new Error(`Failed to get element choices: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async clickElementByChoice(appName: string, elementIndex: number, button: string): Promise<any> {
    await this.checkPermissions();
    await this.log(`Clicking element ${elementIndex} in ${appName}`);

    try {
      // Get element choices to find the coordinates
      const choicesResult = await this.getElementChoices(appName);
      const choicesText = choicesResult.content[0].text;
      
      // Parse the element at the specified index
      const lines = choicesText.split('\n').slice(1); // Skip the first line
      const targetLine = lines[elementIndex];
      
      if (!targetLine) {
        throw new Error(`Element index ${elementIndex} not found`);
      }
      
      const match = targetLine.match(/(\d+)\. ".+" \((.+)\) - Click at \((.+), (.+)\)/);
      if (!match) {
        throw new Error(`Failed to parse element coordinates`);
      }
      
      const x = parseFloat(match[3]);
      const y = parseFloat(match[4]);
      
      // Focus the application
      await this.focusApplication(appName);
      
      if (!this.currentApp) {
        throw new Error('No application focused');
      }

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
            text: `Successfully clicked element ${elementIndex} ("${match[2]}") at (${x.toFixed(3)}, ${y.toFixed(3)}) with ${button} button`,
          },
        ],
      };
    } catch (error) {
      throw new Error(`Failed to click element: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async screenshotWithAnalysis(appName: string, padding: number, includeImage: boolean, analysisMethods: string[]): Promise<any> {
    await this.checkPermissions();
    await this.log(`Taking screenshot with analysis for ${appName}`);

    try {
      // Focus the application
      await this.focusApplication(appName);
      
      if (!this.currentApp) {
        throw new Error('No application focused');
      }

      // Take screenshot
      const screenshot = await this.takeScreenshot(padding);
      const base64Image = screenshot.toString('base64');

      // Perform analysis
      const analysis = await this.analyzeWindow(appName, analysisMethods, true);

      const result: any = {
        content: [
          {
            type: 'text',
            text: `Screenshot with analysis for ${appName} (${this.currentApp.bounds.width}x${this.currentApp.bounds.height}px with ${padding}px padding)`,
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

      result.content.push({
        type: 'text',
        text: `\nAnalysis Results:\n${analysis.content[0].text}`,
      });

      return result;
    } catch (error) {
      throw new Error(`Screenshot with analysis failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async testAnalysisMethods(): Promise<any> {
    await this.log('Testing analysis methods availability');

    const results = {
      'apple-window-manager': false,
      'ocr': false,
      'local-llm': false
    };

    // Test Apple Window Manager
    if (this.config.useAppleWindowManager) {
      try {
        const testResult = await AppleWindowManager.analyzeWindow('Finder');
        results['apple-window-manager'] = testResult !== null;
      } catch (error) {
        await this.log(`Apple Window Manager test failed: ${error}`);
      }
    }

    // Test OCR
    if (this.config.useOCR) {
      try {
        const availability = await this.ocrAnalyzer.checkOCRAvailability();
        results['ocr'] = availability.tesseract || availability.macOS;
      } catch (error) {
        await this.log(`OCR test failed: ${error}`);
      }
    }

    // Test Local LLM
    if (this.config.useLocalLLM && this.llmAnalyzer) {
      try {
        results['local-llm'] = await this.llmAnalyzer.testConnection();
      } catch (error) {
        await this.log(`Local LLM test failed: ${error}`);
      }
    }

    return {
      content: [
        {
          type: 'text',
          text: `Analysis Methods Test Results:\n\n${Object.entries(results).map(([method, available]) => 
            `${method}: ${available ? '✅ Available' : '❌ Not Available'}`
          ).join('\n')}\n\nConfiguration:\n${JSON.stringify(this.config, null, 2)}`,
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

  private combineAnalysisResults(results: AnalysisResult[]): any[] {
    const combinedElements: any[] = [];
    const seenElements = new Set<string>();

    results.forEach(result => {
      result.elements.forEach((element: any) => {
        const key = `${element.type}-${element.text}-${element.normalizedPosition?.x}-${element.normalizedPosition?.y}`;
        if (!seenElements.has(key)) {
          seenElements.add(key);
          combinedElements.push(element);
        }
      });
    });

    return combinedElements;
  }

  private combineSuggestedActions(results: AnalysisResult[]): string[] {
    const combinedActions: string[] = [];
    const seenActions = new Set<string>();

    results.forEach(result => {
      result.suggestedActions.forEach(action => {
        if (!seenActions.has(action)) {
          seenActions.add(action);
          combinedActions.push(action);
        }
      });
    });

    return combinedActions;
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('Enhanced Analysis MCP server running on stdio');
  }
}

// Start the server with default configuration
const defaultConfig: AnalysisConfig = {
  useAppleWindowManager: true,
  useOCR: true,
  useLocalLLM: true,
  localLLMConfig: {
    baseUrl: 'http://127.0.0.1:1234',
    model: 'gpt-oss-20b',
    maxTokens: 2000,
    temperature: 0.1
  }
};

const server = new EnhancedAnalysisServer(defaultConfig);
server.run().catch(console.error);
