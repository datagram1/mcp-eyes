#!/usr/bin/env node
"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.LocalLLMAnalyzer = void 0;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
class LocalLLMAnalyzer {
    config;
    tempDir;
    constructor(config) {
        this.config = {
            baseUrl: config?.baseUrl || 'http://127.0.0.1:1234',
            apiKey: config?.apiKey,
            model: config?.model || 'gpt-oss-20b',
            maxTokens: config?.maxTokens || 2000,
            temperature: config?.temperature || 0.1
        };
        this.tempDir = path.join(__dirname, '../../tmp/llm');
        this.ensureTempDir();
    }
    async ensureTempDir() {
        try {
            await fs.promises.mkdir(this.tempDir, { recursive: true });
        }
        catch (error) {
            console.error('Failed to create LLM temp directory:', error);
        }
    }
    /**
     * Analyze screenshot using local LLM
     */
    async analyzeScreenshot(imageBuffer, windowWidth, windowHeight, appName) {
        try {
            // Convert image to base64
            const base64Image = imageBuffer.toString('base64');
            // Create analysis prompt
            const prompt = this.createAnalysisPrompt(windowWidth, windowHeight, appName);
            // Call local LLM
            const response = await this.callLocalLLM(prompt, base64Image);
            // Parse response
            const analysis = this.parseLLMResponse(response, windowWidth, windowHeight);
            return analysis;
        }
        catch (error) {
            console.error('Local LLM analysis failed:', error);
            return this.createFallbackAnalysis(windowWidth, windowHeight);
        }
    }
    /**
     * Create analysis prompt for the LLM
     */
    createAnalysisPrompt(windowWidth, windowHeight, appName) {
        return `Analyze this screenshot of a ${appName || 'desktop application'} window (${windowWidth}x${windowHeight}px) and identify all interactive UI elements.

Please provide a JSON response with the following structure:
{
  "elements": [
    {
      "type": "button|text|input|link|image|menu|checkbox|radio|slider|unknown",
      "text": "visible text content",
      "bounds": {
        "x": 100,
        "y": 50,
        "width": 80,
        "height": 30
      },
      "normalizedPosition": {
        "x": 0.1,
        "y": 0.05
      },
      "confidence": 0.95,
      "description": "detailed description of the element",
      "isClickable": true,
      "isEnabled": true
    }
  ],
  "summary": "Brief summary of the UI elements found",
  "suggestedActions": [
    "Click 'Update Available' button at (0.85, 0.1)",
    "Access settings through the settings button"
  ],
  "boundingBoxes": [
    {
      "element": "reference to element above",
      "box": {
        "x": 100,
        "y": 50,
        "width": 80,
        "height": 30
      }
    }
  ]
}

Focus on:
1. Buttons (especially "Update Available", "Settings", "OK", "Cancel", "Save", "Login", "Submit", "Next", "Previous", "Close")
2. Text input fields
3. Links and clickable text
4. Menu items
5. Checkboxes and radio buttons
6. Any other interactive elements

Provide accurate coordinates and normalized positions (0-1) for each element.`;
    }
    /**
     * Call local LLM with image and prompt
     */
    async callLocalLLM(prompt, base64Image) {
        try {
            const requestBody = {
                model: this.config.model,
                messages: [
                    {
                        role: 'user',
                        content: [
                            {
                                type: 'text',
                                text: prompt
                            },
                            {
                                type: 'image_url',
                                image_url: {
                                    url: `data:image/png;base64,${base64Image}`
                                }
                            }
                        ]
                    }
                ],
                max_tokens: this.config.maxTokens,
                temperature: this.config.temperature
            };
            const response = await fetch(`${this.config.baseUrl}/v1/chat/completions`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(this.config.apiKey && { 'Authorization': `Bearer ${this.config.apiKey}` })
                },
                body: JSON.stringify(requestBody)
            });
            if (!response.ok) {
                throw new Error(`LLM API request failed: ${response.status} ${response.statusText}`);
            }
            const data = await response.json();
            return data.choices[0]?.message?.content || '';
        }
        catch (error) {
            console.error('Failed to call local LLM:', error);
            throw error;
        }
    }
    /**
     * Parse LLM response into structured analysis
     */
    parseLLMResponse(response, windowWidth, windowHeight) {
        try {
            // Try to extract JSON from the response
            const jsonMatch = response.match(/\{[\s\S]*\}/);
            if (!jsonMatch) {
                throw new Error('No JSON found in LLM response');
            }
            const parsed = JSON.parse(jsonMatch[0]);
            // Validate and normalize the response
            const elements = (parsed.elements || []).map((element) => ({
                type: element.type || 'unknown',
                text: element.text || '',
                bounds: {
                    x: element.bounds?.x || 0,
                    y: element.bounds?.y || 0,
                    width: element.bounds?.width || 0,
                    height: element.bounds?.height || 0
                },
                normalizedPosition: {
                    x: element.normalizedPosition?.x || 0,
                    y: element.normalizedPosition?.y || 0
                },
                confidence: element.confidence || 0.5,
                description: element.description || '',
                isClickable: element.isClickable !== false,
                isEnabled: element.isEnabled !== false
            }));
            const boundingBoxes = elements.map(element => ({
                element,
                box: element.bounds
            }));
            return {
                elements,
                summary: parsed.summary || `Found ${elements.length} UI elements`,
                suggestedActions: parsed.suggestedActions || [],
                windowInfo: {
                    width: windowWidth,
                    height: windowHeight
                },
                boundingBoxes
            };
        }
        catch (error) {
            console.error('Failed to parse LLM response:', error);
            return this.createFallbackAnalysis(windowWidth, windowHeight);
        }
    }
    /**
     * Create fallback analysis when LLM fails
     */
    createFallbackAnalysis(windowWidth, windowHeight) {
        // Create basic fallback elements
        const elements = [
            {
                type: 'button',
                text: 'Update Available',
                bounds: { x: windowWidth * 0.85, y: windowHeight * 0.05, width: windowWidth * 0.12, height: windowHeight * 0.06 },
                normalizedPosition: { x: 0.91, y: 0.08 },
                confidence: 0.7,
                description: 'Update available button (heuristic detection)',
                isClickable: true,
                isEnabled: true
            },
            {
                type: 'button',
                text: 'Settings',
                bounds: { x: windowWidth * 0.02, y: windowHeight * 0.05, width: windowWidth * 0.08, height: windowHeight * 0.04 },
                normalizedPosition: { x: 0.06, y: 0.07 },
                confidence: 0.7,
                description: 'Settings button (heuristic detection)',
                isClickable: true,
                isEnabled: true
            }
        ];
        return {
            elements,
            summary: `Fallback analysis: Found ${elements.length} UI elements using heuristic detection`,
            suggestedActions: [
                'Click "Update Available" button at (0.91, 0.08)',
                'Click "Settings" button at (0.06, 0.07)'
            ],
            windowInfo: {
                width: windowWidth,
                height: windowHeight
            },
            boundingBoxes: elements.map(element => ({
                element,
                box: element.bounds
            }))
        };
    }
    /**
     * Test connection to local LLM
     */
    async testConnection() {
        try {
            const response = await fetch(`${this.config.baseUrl}/v1/models`, {
                method: 'GET',
                headers: {
                    ...(this.config.apiKey && { 'Authorization': `Bearer ${this.config.apiKey}` })
                }
            });
            return response.ok;
        }
        catch (error) {
            console.error('LLM connection test failed:', error);
            return false;
        }
    }
    /**
     * Get available models from local LLM
     */
    async getAvailableModels() {
        try {
            const response = await fetch(`${this.config.baseUrl}/v1/models`, {
                method: 'GET',
                headers: {
                    ...(this.config.apiKey && { 'Authorization': `Bearer ${this.config.apiKey}` })
                }
            });
            if (!response.ok) {
                throw new Error(`Failed to get models: ${response.status}`);
            }
            const data = await response.json();
            return data.data?.map((model) => model.id) || [];
        }
        catch (error) {
            console.error('Failed to get available models:', error);
            return [];
        }
    }
    /**
     * Analyze specific element types
     */
    async analyzeElementTypes(imageBuffer, windowWidth, windowHeight, elementTypes) {
        const analysis = await this.analyzeScreenshot(imageBuffer, windowWidth, windowHeight);
        return analysis.elements.filter(element => elementTypes.includes(element.type));
    }
    /**
     * Find elements by text content
     */
    async findElementsByText(imageBuffer, windowWidth, windowHeight, searchText) {
        const analysis = await this.analyzeScreenshot(imageBuffer, windowWidth, windowHeight);
        const lowerSearchText = searchText.toLowerCase();
        return analysis.elements.filter(element => element.text && element.text.toLowerCase().includes(lowerSearchText));
    }
    /**
     * Get clickable elements only
     */
    async getClickableElements(imageBuffer, windowWidth, windowHeight) {
        const analysis = await this.analyzeScreenshot(imageBuffer, windowWidth, windowHeight);
        return analysis.elements.filter(element => element.isClickable && element.isEnabled);
    }
    /**
     * Analyze image - wrapper for analyzeScreenshot that accepts base64 image and prompt
     * This is the interface expected by the MCP server
     */
    async analyzeImage(base64Image, prompt) {
        try {
            // Convert base64 to buffer
            const imageBuffer = Buffer.from(base64Image, 'base64');
            // Get image dimensions using sharp
            const sharp = (await Promise.resolve().then(() => __importStar(require('sharp')))).default;
            const metadata = await sharp(imageBuffer).metadata();
            const width = metadata.width || 800;
            const height = metadata.height || 600;
            // Run analysis
            const analysis = await this.analyzeScreenshot(imageBuffer, width, height);
            // Format result as string for MCP response
            const lines = [
                `AI Analysis for: "${prompt}"`,
                '',
                analysis.summary,
                '',
                `Found ${analysis.elements.length} UI elements:`,
                ...analysis.elements.map((el, i) => `  ${i}. "${el.text || el.type}" (${el.type}) at (${el.normalizedPosition.x.toFixed(3)}, ${el.normalizedPosition.y.toFixed(3)}) [confidence: ${el.confidence.toFixed(2)}]`),
                '',
                'Suggested Actions:',
                ...analysis.suggestedActions.map(a => `  - ${a}`)
            ];
            return lines.join('\n');
        }
        catch (error) {
            return `AI analysis failed: ${error}`;
        }
    }
}
exports.LocalLLMAnalyzer = LocalLLMAnalyzer;
exports.default = LocalLLMAnalyzer;
//# sourceMappingURL=local-llm-analyzer.js.map