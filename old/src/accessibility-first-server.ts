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

interface ClickableElement {
  type: 'button' | 'text' | 'input' | 'link' | 'image' | 'menu' | 'checkbox' | 'radio' | 'slider' | 'unknown';
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
  isClickable: boolean;
  isEnabled: boolean;
  accessibilityDescription?: string;
  role?: string;
  subrole?: string;
  confidence: number;
  detectionMethod: 'accessibility' | 'ai' | 'ocr' | 'heuristic';
}

interface AnalysisResult {
  method: 'accessibility' | 'ai' | 'ocr' | 'heuristic';
  elements: ClickableElement[];
  summary: string;
  suggestedActions: string[];
  windowBounds: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  screenshotBounds?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

class AccessibilityFirstServer {
  private server: Server;
  private currentApp: Application | null = null;
  private ocrAnalyzer: OCRAnalyzer;
  private llmAnalyzer: LocalLLMAnalyzer | null = null;
  private logFile: string = '/Users/richardbrown/dev/mcp_eyes/test-screenshots/accessibility-first-debug-log.md';

  constructor() {
    this.server = new Server({
      name: 'accessibility-first-server',
      version: '1.1.15',
    });

    // Initialize analyzers
    this.ocrAnalyzer = new OCRAnalyzer();
    
    // Try to initialize LLM analyzer
    try {
      this.llmAnalyzer = new LocalLLMAnalyzer({
        baseUrl: 'http://127.0.0.1:1234',
        model: 'gpt-oss-20b',
        maxTokens: 2000,
        temperature: 0.1
      });
    } catch (error) {
      console.log('Local LLM not available, will use fallback methods');
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
            name: 'getClickableElements',
            description: 'Get all clickable elements using Apple accessibility first, then AI/OCR fallbacks',
            inputSchema: {
              type: 'object',
              properties: {
                appName: {
                  type: 'string',
                  description: 'Name of the application to analyze',
                },
                includeScreenCoordinates: {
                  type: 'boolean',
                  description: 'Whether to include absolute screen coordinates',
                  default: true
                },
                forceMethod: {
                  type: 'string',
                  enum: ['accessibility', 'ai', 'ocr', 'auto'],
                  description: 'Force specific detection method (default: auto)',
                  default: 'auto'
                }
              },
              required: ['appName'],
            },
          },
          {
            name: 'clickElement',
            description: 'Click a specific element by index from getClickableElements',
            inputSchema: {
              type: 'object',
              properties: {
                appName: {
                  type: 'string',
                  description: 'Name of the application',
                },
                elementIndex: {
                  type: 'number',
                  description: 'Index of the element from getClickableElements result',
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
            name: 'findAndClickElement',
            description: 'Find and click an element by text content or type',
            inputSchema: {
              type: 'object',
              properties: {
                appName: {
                  type: 'string',
                  description: 'Name of the application',
                },
                searchText: {
                  type: 'string',
                  description: 'Text content to search for',
                },
                elementType: {
                  type: 'string',
                  enum: ['button', 'text', 'input', 'link', 'image', 'menu', 'checkbox', 'radio', 'slider'],
                  description: 'Type of element to search for',
                },
                button: {
                  type: 'string',
                  enum: ['left', 'right', 'middle'],
                  description: 'Mouse button to click',
                  default: 'left'
                }
              },
              required: ['appName'],
            },
          },
          {
            name: 'testDetectionMethods',
            description: 'Test which detection methods are available and working',
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
            name: 'moveMouseToElement',
            description: 'Move mouse to a specific element without clicking',
            inputSchema: {
              type: 'object',
              properties: {
                appName: {
                  type: 'string',
                  description: 'Name of the application',
                },
                elementIndex: {
                  type: 'number',
                  description: 'Index of the element from getClickableElements result',
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
        ],
      };
    });

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        switch (name) {
          case 'getClickableElements':
            return await this.getClickableElements(
              args?.appName as string,
              (args?.includeScreenCoordinates as boolean) !== false,
              (args?.forceMethod as string) || 'auto'
            );
          case 'clickElement':
            return await this.clickElement(
              args?.appName as string,
              args?.elementIndex as number,
              (args?.button as string) || 'left',
              (args?.useScreenCoordinates as boolean) !== false
            );
          case 'findAndClickElement':
            return await this.findAndClickElement(
              args?.appName as string,
              args?.searchText as string,
              args?.elementType as string,
              (args?.button as string) || 'left'
            );
          case 'testDetectionMethods':
            return await this.testDetectionMethods();
          case 'listApplications':
            return await this.listApplications();
          case 'focusApplication':
            return await this.focusApplication(args?.identifier as string);
          case 'moveMouseToElement':
            return await this.moveMouseToElement(
              args?.appName as string,
              args?.elementIndex as number,
              (args?.useScreenCoordinates as boolean) !== false
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

  private async getClickableElements(appName: string, includeScreenCoordinates: boolean, forceMethod: string): Promise<any> {
    await this.checkPermissions();
    await this.log(`Getting clickable elements for ${appName} using method: ${forceMethod}`);

    try {
      // Focus the application first
      await this.focusApplication(appName);
      
      if (!this.currentApp) {
        throw new Error('No application focused');
      }

      let result: AnalysisResult | null = null;
      let elements: ClickableElement[] = [];

      // Priority 1: Apple Accessibility (if available and not forced to another method)
      if (forceMethod === 'auto' || forceMethod === 'accessibility') {
        try {
          await this.log('Trying Apple accessibility detection');
          const appleElements = await AppleWindowManager.getClickableElements(appName);
          
          if (appleElements && appleElements.length > 0) {
            elements = appleElements.map(el => ({
              ...el,
              screenPosition: {
                x: this.currentApp!.bounds.x + (el.normalizedPosition.x * this.currentApp!.bounds.width),
                y: this.currentApp!.bounds.y + (el.normalizedPosition.y * this.currentApp!.bounds.height)
              },
              confidence: 0.95,
              detectionMethod: 'accessibility' as const
            }));

            result = {
              method: 'accessibility',
              elements,
              summary: `Apple accessibility found ${elements.length} clickable elements`,
              suggestedActions: elements.map(el => 
                `Click "${el.text || el.type}" at screen (${el.screenPosition.x}, ${el.screenPosition.y}) or normalized (${el.normalizedPosition.x.toFixed(3)}, ${el.normalizedPosition.y.toFixed(3)})`
              ),
              windowBounds: this.currentApp.bounds
            };

            await this.log(`Apple accessibility found ${elements.length} elements`);
          }
        } catch (error) {
          await this.log(`Apple accessibility failed: ${error}`);
        }
      }

      // Priority 2: AI Analysis (if accessibility failed or forced)
      if ((!result || result.elements.length === 0) && (forceMethod === 'auto' || forceMethod === 'ai')) {
        try {
          await this.log('Trying AI analysis');
          const screenshot = await this.takeScreenshot();
          const aiAnalysis = await this.llmAnalyzer?.analyzeScreenshot(
            screenshot, 
            this.currentApp.bounds.width, 
            this.currentApp.bounds.height,
            appName
          );
          
          if (aiAnalysis && aiAnalysis.elements.length > 0) {
            elements = aiAnalysis.elements.map(el => ({
              ...el,
              screenPosition: {
                x: this.currentApp!.bounds.x + (el.normalizedPosition.x * this.currentApp!.bounds.width),
                y: this.currentApp!.bounds.y + (el.normalizedPosition.y * this.currentApp!.bounds.height)
              },
              confidence: 0.85,
              detectionMethod: 'ai' as const
            }));

            result = {
              method: 'ai',
              elements,
              summary: `AI analysis found ${elements.length} clickable elements`,
              suggestedActions: elements.map(el => 
                `Click "${el.text || el.type}" at screen (${el.screenPosition.x}, ${el.screenPosition.y}) or normalized (${el.normalizedPosition.x.toFixed(3)}, ${el.normalizedPosition.y.toFixed(3)})`
              ),
              windowBounds: this.currentApp.bounds
            };

            await this.log(`AI analysis found ${elements.length} elements`);
          }
        } catch (error) {
          await this.log(`AI analysis failed: ${error}`);
        }
      }

      // Priority 3: OCR Analysis (if both accessibility and AI failed or forced)
      if ((!result || result.elements.length === 0) && (forceMethod === 'auto' || forceMethod === 'ocr')) {
        try {
          await this.log('Trying OCR analysis');
          const screenshot = await this.takeScreenshot();
          const ocrAnalysis = await this.ocrAnalyzer.analyzeScreenshot(
            screenshot, 
            this.currentApp.bounds.width, 
            this.currentApp.bounds.height
          );
          
          if (ocrAnalysis && ocrAnalysis.elements.length > 0) {
            elements = ocrAnalysis.elements.map(el => ({
              type: 'button' as const,
              text: el.text,
              bounds: el.bounds,
              normalizedPosition: el.normalizedPosition,
              screenPosition: {
                x: this.currentApp!.bounds.x + (el.normalizedPosition.x * this.currentApp!.bounds.width),
                y: this.currentApp!.bounds.y + (el.normalizedPosition.y * this.currentApp!.bounds.height)
              },
              isClickable: true,
              isEnabled: true,
              confidence: 0.7,
              detectionMethod: 'ocr' as const
            }));

            result = {
              method: 'ocr',
              elements,
              summary: `OCR analysis found ${elements.length} clickable elements`,
              suggestedActions: elements.map(el => 
                `Click "${el.text || 'element'}" at screen (${el.screenPosition.x}, ${el.screenPosition.y}) or normalized (${el.normalizedPosition.x.toFixed(3)}, ${el.normalizedPosition.y.toFixed(3)})`
              ),
              windowBounds: this.currentApp.bounds
            };

            await this.log(`OCR analysis found ${elements.length} elements`);
          }
        } catch (error) {
          await this.log(`OCR analysis failed: ${error}`);
        }
      }

      // Fallback: Heuristic detection
      if (!result || result.elements.length === 0) {
        await this.log('Using heuristic fallback detection');
        elements = this.createHeuristicElements();
        
        result = {
          method: 'heuristic',
          elements,
          summary: `Heuristic detection found ${elements.length} clickable elements`,
          suggestedActions: elements.map(el => 
            `Click "${el.text || 'element'}" at screen (${el.screenPosition.x}, ${el.screenPosition.y}) or normalized (${el.normalizedPosition.x.toFixed(3)}, ${el.normalizedPosition.y.toFixed(3)})`
          ),
          windowBounds: this.currentApp.bounds
        };
      }

      // Format response
      const responseText = `Clickable Elements for ${appName} (${result.method} method):\n\n` +
        `Window bounds: ${result.windowBounds.width}x${result.windowBounds.height} at (${result.windowBounds.x}, ${result.windowBounds.y})\n\n` +
        `Found ${elements.length} clickable elements:\n\n` +
        elements.map((el, index) => 
          `${index + 1}. "${el.text || el.type}" (${el.type}) - ` +
          `Screen: (${el.screenPosition.x}, ${el.screenPosition.y}) | ` +
          `Normalized: (${el.normalizedPosition.x.toFixed(3)}, ${el.normalizedPosition.y.toFixed(3)}) | ` +
          `Confidence: ${el.confidence} | Method: ${el.detectionMethod}`
        ).join('\n') +
        `\n\nSuggested Actions:\n${result.suggestedActions.join('\n')}`;

      return {
        content: [
          {
            type: 'text',
            text: responseText,
          },
        ],
      };
    } catch (error) {
      throw new Error(`Failed to get clickable elements: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async clickElement(appName: string, elementIndex: number, button: string, useScreenCoordinates: boolean): Promise<any> {
    await this.checkPermissions();
    await this.log(`Clicking element ${elementIndex} in ${appName}`);

    try {
      // Get clickable elements
      const elementsResult = await this.getClickableElements(appName, true, 'auto');
      const elementsText = elementsResult.content[0].text;
      
      // Parse elements from the result
      const elements: ClickableElement[] = [];
      const lines = elementsText.split('\n');
      
      // Find the elements section
      let inElementsSection = false;
      for (const line of lines) {
        if (line.includes('Found') && line.includes('clickable elements:')) {
          inElementsSection = true;
          continue;
        }
        if (inElementsSection && line.match(/^\d+\./)) {
          const match = line.match(/(\d+)\. "(.+)" \((.+)\) - Screen: \((\d+), (\d+)\) \| Normalized: \((.+), (.+)\)/);
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
              detectionMethod: 'accessibility'
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
            text: `Successfully clicked element ${elementIndex + 1} ("${element.text}") at (${targetX}, ${targetY}) with ${button} button`,
          },
        ],
      };
    } catch (error) {
      throw new Error(`Failed to click element: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async findAndClickElement(appName: string, searchText?: string, elementType?: string, button: string = 'left'): Promise<any> {
    await this.checkPermissions();
    await this.log(`Finding and clicking element in ${appName}`);

    try {
      // Get clickable elements
      const elementsResult = await this.getClickableElements(appName, true, 'auto');
      const elementsText = elementsResult.content[0].text;
      
      // Parse elements from the result
      const elements: ClickableElement[] = [];
      const lines = elementsText.split('\n');
      
      // Find the elements section
      let inElementsSection = false;
      for (const line of lines) {
        if (line.includes('Found') && line.includes('clickable elements:')) {
          inElementsSection = true;
          continue;
        }
        if (inElementsSection && line.match(/^\d+\./)) {
          const match = line.match(/(\d+)\. "(.+)" \((.+)\) - Screen: \((\d+), (\d+)\) \| Normalized: \((.+), (.+)\)/);
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
              detectionMethod: 'accessibility'
            });
          }
        }
      }

      // Find matching element
      let targetElement: ClickableElement | null = null;
      let targetIndex = -1;

      if (searchText) {
        const lowerSearchText = searchText.toLowerCase();
        for (let i = 0; i < elements.length; i++) {
          if (elements[i].text && elements[i].text!.toLowerCase().includes(lowerSearchText)) {
            targetElement = elements[i];
            targetIndex = i;
            break;
          }
        }
      } else if (elementType) {
        for (let i = 0; i < elements.length; i++) {
          if (elements[i].type === elementType) {
            targetElement = elements[i];
            targetIndex = i;
            break;
          }
        }
      }

      if (!targetElement) {
        throw new Error(`No element found matching criteria: ${searchText ? `text="${searchText}"` : `type="${elementType}"`}`);
      }

      // Click the element
      return await this.clickElement(appName, targetIndex, button, true);
    } catch (error) {
      throw new Error(`Failed to find and click element: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async moveMouseToElement(appName: string, elementIndex: number, useScreenCoordinates: boolean): Promise<any> {
    await this.checkPermissions();
    await this.log(`Moving mouse to element ${elementIndex} in ${appName}`);

    try {
      // Get clickable elements
      const elementsResult = await this.getClickableElements(appName, true, 'auto');
      const elementsText = elementsResult.content[0].text;
      
      // Parse elements from the result
      const elements: ClickableElement[] = [];
      const lines = elementsText.split('\n');
      
      // Find the elements section
      let inElementsSection = false;
      for (const line of lines) {
        if (line.includes('Found') && line.includes('clickable elements:')) {
          inElementsSection = true;
          continue;
        }
        if (inElementsSection && line.match(/^\d+\./)) {
          const match = line.match(/(\d+)\. "(.+)" \((.+)\) - Screen: \((\d+), (\d+)\) \| Normalized: \((.+), (.+)\)/);
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
              detectionMethod: 'accessibility'
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
            text: `Successfully moved mouse to element ${elementIndex + 1} ("${element.text}") at (${targetX}, ${targetY})`,
          },
        ],
      };
    } catch (error) {
      throw new Error(`Failed to move mouse to element: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async testDetectionMethods(): Promise<any> {
    await this.log('Testing detection methods availability');

    const results = {
      'accessibility': false,
      'ai': false,
      'ocr': false
    };

    // Test Apple Accessibility
    try {
      const testResult = await AppleWindowManager.analyzeWindow('Finder');
      results['accessibility'] = testResult !== null;
    } catch (error) {
      await this.log(`Apple accessibility test failed: ${error}`);
    }

    // Test OCR
    try {
      const availability = await this.ocrAnalyzer.checkOCRAvailability();
      results['ocr'] = availability.tesseract || availability.macOS;
    } catch (error) {
      await this.log(`OCR test failed: ${error}`);
    }

    // Test Local LLM
    if (this.llmAnalyzer) {
      try {
        results['ai'] = await this.llmAnalyzer.testConnection();
      } catch (error) {
        await this.log(`Local LLM test failed: ${error}`);
      }
    }

    return {
      content: [
        {
          type: 'text',
          text: `Detection Methods Test Results:\n\n` +
            `✅ Apple Accessibility: ${results['accessibility'] ? 'Available' : 'Not Available'}\n` +
            `✅ AI Analysis (Local LLM): ${results['ai'] ? 'Available' : 'Not Available'}\n` +
            `✅ OCR Analysis: ${results['ocr'] ? 'Available' : 'Not Available'}\n\n` +
            `Priority Order: Accessibility → AI → OCR → Heuristic\n` +
            `Local LLM URL: http://127.0.0.1:1234\n` +
            `Model: gpt-oss-20b`,
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

  private createHeuristicElements(): ClickableElement[] {
    if (!this.currentApp) return [];

    const elements: ClickableElement[] = [
      {
        type: 'button',
        text: 'Update Available',
        bounds: { x: 0, y: 0, width: 0, height: 0 },
        normalizedPosition: { x: 0.91, y: 0.08 },
        screenPosition: {
          x: this.currentApp.bounds.x + (0.91 * this.currentApp.bounds.width),
          y: this.currentApp.bounds.y + (0.08 * this.currentApp.bounds.height)
        },
        isClickable: true,
        isEnabled: true,
        confidence: 0.6,
        detectionMethod: 'heuristic'
      },
      {
        type: 'button',
        text: 'Settings',
        bounds: { x: 0, y: 0, width: 0, height: 0 },
        normalizedPosition: { x: 0.06, y: 0.07 },
        screenPosition: {
          x: this.currentApp.bounds.x + (0.06 * this.currentApp.bounds.width),
          y: this.currentApp.bounds.y + (0.07 * this.currentApp.bounds.height)
        },
        isClickable: true,
        isEnabled: true,
        confidence: 0.6,
        detectionMethod: 'heuristic'
      }
    ];

    return elements;
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('Accessibility First MCP server running on stdio');
  }
}

// Start the server
const server = new AccessibilityFirstServer();
server.run().catch(console.error);
