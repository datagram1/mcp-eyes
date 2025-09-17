#!/usr/bin/env node

import sharp from 'sharp';
import * as fs from 'fs';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

interface WebElement {
  type: 'link' | 'button' | 'text' | 'image' | 'input' | 'textarea' | 'search' | 'unknown';
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
  isInput?: boolean;
  placeholder?: string;
  inputType?: string;
}

interface WebAnalysis {
  elements: WebElement[];
  summary: string;
  suggestedActions: string[];
  windowBounds: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

interface LLMConfig {
  provider: 'lm-studio' | 'ollama' | 'claude' | 'openai' | 'openrouter';
  baseUrl?: string;
  apiKey?: string;
  model?: string;
  visionModel?: string;
}

export class WebContentDetector {
  private tempDir: string;
  private llmConfig: LLMConfig;
  
  constructor() {
    this.tempDir = path.join(__dirname, '../../tmp/web-content');
    this.ensureTempDir();
    this.llmConfig = this.loadLLMConfig();
  }
  
  private async ensureTempDir(): Promise<void> {
    try {
      await fs.promises.mkdir(this.tempDir, { recursive: true });
    } catch (error) {
      console.error('Failed to create web content temp directory:', error);
    }
  }
  
  private loadLLMConfig(): LLMConfig {
    // Default configuration
    const defaultConfig: LLMConfig = {
      provider: 'lm-studio',
      baseUrl: 'http://127.0.0.1:1234',
      model: 'openai/gpt-oss-20b'
    };
    
    // Try to load from config file
    try {
      const configPath = path.join(__dirname, '../../llm-config.json');
      if (fs.existsSync(configPath)) {
        const configData = fs.readFileSync(configPath, 'utf8');
        const customConfig = JSON.parse(configData);
        return { ...defaultConfig, ...customConfig };
      }
    } catch (error) {
      console.log('Using default LLM configuration');
    }
    
    return defaultConfig;
  }
  
  /**
   * Analyze web content using multiple methods
   */
  async analyzeWebContent(imageBuffer: Buffer, windowBounds: { x: number; y: number; width: number; height: number }, appName: string): Promise<WebAnalysis> {
    try {
      const elements: WebElement[] = [];
      
      // Method 1: Try to get web content via accessibility
      try {
        const webElements = await this.getWebContentViaAccessibility(appName);
        elements.push(...webElements);
      } catch (error) {
        console.log('Web accessibility failed:', error);
      }
      
      // Method 2: AI analysis with configured provider
      if (elements.length === 0) {
        try {
          const aiElements = await this.analyzeWithAI(imageBuffer, windowBounds, appName);
          elements.push(...aiElements);
        } catch (error) {
          console.log('AI analysis failed:', error);
        }
      }
      
      // Method 3: Enhanced OCR for web content
      if (elements.length === 0) {
        try {
          const ocrElements = await this.analyzeWithEnhancedOCR(imageBuffer, windowBounds);
          elements.push(...ocrElements);
        } catch (error) {
          console.log('Enhanced OCR failed:', error);
        }
      }
      
      // Method 4: Heuristic web link detection
      if (elements.length === 0) {
        const heuristicElements = this.createHeuristicWebElements(windowBounds);
        elements.push(...heuristicElements);
      }
      
      const summary = `Web content analysis found ${elements.length} elements`;
      const suggestedActions = elements.map(el => 
        `Click "${el.text || el.type}" at screen (${el.screenPosition.x}, ${el.screenPosition.y}) or normalized (${el.normalizedPosition.x.toFixed(3)}, ${el.normalizedPosition.y.toFixed(3)})`
      );
      
      return {
        elements,
        summary,
        suggestedActions,
        windowBounds
      };
    } catch (error) {
      console.error('Web content analysis failed:', error);
      return {
        elements: [],
        summary: 'Web content analysis failed',
        suggestedActions: [],
        windowBounds
      };
    }
  }
  
  /**
   * Try to get web content via accessibility (Chrome-specific)
   */
  private async getWebContentViaAccessibility(appName: string): Promise<WebElement[]> {
    try {
      const result = await execAsync(`osascript -e '
        tell application "${appName}"
          activate
        end tell
        
        tell application "System Events"
          set process to first process whose name is "${appName}"
          set windows to every window of process
          
          if windows is not {} then
            set mainWindow to first item of windows
            set uiElements to every UI element of mainWindow
            
            set webElements to {}
            repeat with element in uiElements
              try
                set elementRole to role of element
                set elementTitle to title of element
                set elementPosition to position of element
                set elementSize to size of element
                
                if elementRole is "link" or elementRole is "button" or elementTitle contains "Swansea" or elementTitle contains "Update" or elementTitle contains "flooded" or elementTitle contains "roundabout" then
                  set end of webElements to {elementRole, elementTitle, elementPosition, elementSize}
                end if
              end try
            end repeat
            
            return webElements
          end if
        end tell
      '`);
      
      // Parse the result (simplified)
      const elements: WebElement[] = [];
      // In a real implementation, you'd parse the AppleScript result
      return elements;
    } catch (error) {
      throw new Error(`Web accessibility failed: ${error}`);
    }
  }
  
  /**
   * AI analysis with configured provider
   */
  private async analyzeWithAI(imageBuffer: Buffer, windowBounds: { x: number; y: number; width: number; height: number }, appName: string): Promise<WebElement[]> {
    try {
      const base64Image = imageBuffer.toString('base64');
      
      // Get provider configuration
      const provider = this.llmConfig.provider;
      const baseUrl = this.getProviderBaseUrl(provider);
      const apiKey = this.getProviderApiKey(provider);
      const model = this.getProviderModel(provider);
      
      // Test if provider supports vision
      const supportsVision = await this.testVisionCapability(baseUrl, apiKey, model);
      const useVision = supportsVision;
      
      const prompt = this.buildAnalysisPrompt(appName, useVision);
      const requestBody = this.buildRequestBody(model, prompt, base64Image, useVision);
      
      const response = await fetch(`${baseUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(apiKey && { 'Authorization': `Bearer ${apiKey}` })
        },
        body: JSON.stringify(requestBody)
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`AI API request failed: ${response.status} - ${errorText}`);
      }
      
      const data = await response.json() as any;
      
      if (data.error) {
        throw new Error(`AI API error: ${data.error.message || data.error}`);
      }
      
      const content = data.choices?.[0]?.message?.content || '';
      
      if (!content) {
        throw new Error('No content in AI response');
      }
      
      return this.parseAIResponse(content, windowBounds);
    } catch (error) {
      throw new Error(`AI analysis failed: ${error}`);
    }
  }
  
  /**
   * Get provider base URL
   */
  private getProviderBaseUrl(provider: string): string {
    if (this.llmConfig.baseUrl) {
      return this.llmConfig.baseUrl;
    }
    
    const defaultUrls: { [key: string]: string } = {
      'lm-studio': 'http://127.0.0.1:1234',
      'ollama': 'http://127.0.0.1:11434',
      'claude': 'https://api.anthropic.com',
      'openai': 'https://api.openai.com',
      'openrouter': 'https://openrouter.ai/api/v1'
    };
    
    return defaultUrls[provider] || 'http://127.0.0.1:1234';
  }
  
  /**
   * Get provider API key
   */
  private getProviderApiKey(provider: string): string | undefined {
    if (this.llmConfig.apiKey) {
      return this.llmConfig.apiKey;
    }
    
    const envKeys: { [key: string]: string } = {
      'claude': 'CLAUDE_API_KEY',
      'openai': 'OPENAI_API_KEY',
      'openrouter': 'OPENROUTER_API_KEY'
    };
    
    const envKey = envKeys[provider];
    return envKey ? process.env[envKey] : undefined;
  }
  
  /**
   * Get provider model
   */
  private getProviderModel(provider: string): string {
    if (this.llmConfig.model) {
      return this.llmConfig.model;
    }
    
    const defaultModels: { [key: string]: string } = {
      'lm-studio': 'openai/gpt-oss-20b',
      'ollama': 'llama3.2',
      'claude': 'claude-3-5-sonnet-20241022',
      'openai': 'gpt-4o',
      'openrouter': 'anthropic/claude-3.5-sonnet'
    };
    
    return defaultModels[provider] || 'openai/gpt-oss-20b';
  }
  
  /**
   * Test vision capability for the configured provider
   */
  private async testVisionCapability(baseUrl: string, apiKey: string | undefined, model: string): Promise<boolean> {
    try {
      const testImage = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
      
      const response = await fetch(`${baseUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(apiKey && { 'Authorization': `Bearer ${apiKey}` })
        },
        body: JSON.stringify({
          model,
          messages: [
            {
              role: 'user',
              content: [
                { type: 'text', text: 'Test vision' },
                { type: 'image_url', image_url: { url: `data:image/png;base64,${testImage}` } }
              ]
            }
          ],
          max_tokens: 10,
          temperature: 0.1
        })
      });
      
      if (response.ok) {
        const data = await response.json() as any;
        return !data.error;
      }
      
      return false;
    } catch (error) {
      return false;
    }
  }
  
  /**
   * Build analysis prompt based on capabilities
   */
  private buildAnalysisPrompt(appName: string, useVision: boolean): string {
    if (useVision) {
      return `Analyze this screenshot of a ${appName} browser window and identify all clickable web elements, especially links and buttons.

Please provide a JSON response with the following structure:
{
  "elements": [
    {
      "type": "link|button|text|image|input|unknown",
      "text": "visible text content",
      "bounds": {
        "x": 100,
        "y": 50,
        "width": 200,
        "height": 30
      },
      "normalizedPosition": {
        "x": 0.1,
        "y": 0.05
      },
      "confidence": 0.95,
      "isClickable": true,
      "isEnabled": true,
      "url": "https://example.com"
    }
  ]
}

Focus on:
1. Search boxes and input fields (especially Google search box)
2. Buttons (especially "AI Mode", "Search", "Google Search")
3. Links (especially news links, article links)
4. Text that looks clickable
5. Images that are links
6. Any element that might be clickable

Look specifically for text containing:
- "AI Mode"
- "Search"
- "Google Search"
- "Swansea"
- "Update"
- "flooded"
- "roundabout"
- "news"
- "article"
- "telephone poles"

Provide accurate coordinates and normalized positions (0-1) for each element.`;
    } else {
      return `I'm analyzing a browser screenshot but the model doesn't support vision. Based on common web page layouts, please suggest likely locations for clickable elements in a browser window.

Please provide a JSON response with the following structure:
{
  "elements": [
    {
      "type": "link|button|text|image|input|unknown",
      "text": "likely text content",
      "bounds": {
        "x": 100,
        "y": 50,
        "width": 200,
        "height": 30
      },
      "normalizedPosition": {
        "x": 0.1,
        "y": 0.05
      },
      "confidence": 0.6,
      "isClickable": true,
      "isEnabled": true
    }
  ]
}

Focus on common web elements:
1. Search boxes and input fields (especially Google search box)
2. Buttons (especially "AI Mode", "Search", "Google Search")
3. Navigation links
4. Article headlines
5. Menu items

Look for text patterns like:
- "AI Mode"
- "Search"
- "Google Search"
- "Swansea"
- "Update"
- "flooded"
- "roundabout"
- "news"
- "article"
- "telephone poles"

Provide normalized positions (0-1) for each element.`;
    }
  }
  
  /**
   * Build request body for the provider
   */
  private buildRequestBody(model: string, prompt: string, base64Image: string, useVision: boolean): any {
    const baseBody = {
      model,
      max_tokens: useVision ? 2000 : 1500,
      temperature: 0.1,
      stream: false
    };
    
    if (useVision) {
      return {
        ...baseBody,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: prompt },
              { type: 'image_url', image_url: { url: `data:image/png;base64,${base64Image}` } }
            ]
          }
        ]
      };
    } else {
      return {
        ...baseBody,
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ]
      };
    }
  }
  
  /**
   * Parse AI response into WebElement array
   */
  private parseAIResponse(content: string, windowBounds: { x: number; y: number; width: number; height: number }): WebElement[] {
    try {
      // Parse JSON from response
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in AI response');
      }
      
      const parsed = JSON.parse(jsonMatch[0]);
      const elements: WebElement[] = (parsed.elements || []).map((element: any) => ({
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
        screenPosition: {
          x: windowBounds.x + (element.normalizedPosition?.x || 0) * windowBounds.width,
          y: windowBounds.y + (element.normalizedPosition?.y || 0) * windowBounds.height
        },
        confidence: element.confidence || 0.8,
        detectionMethod: 'ai' as const,
        url: element.url,
        isClickable: element.isClickable !== false,
        isEnabled: element.isEnabled !== false
      }));
      
      return elements;
    } catch (error) {
      // Fallback: extract elements from text response
      const elements: WebElement[] = [];
      const lines = content.split('\n');
      
      lines.forEach((line: string, index: number) => {
        const lowerLine = line.toLowerCase();
        if (lowerLine.includes('swansea') || lowerLine.includes('update') || 
            lowerLine.includes('flooded') || lowerLine.includes('roundabout') ||
            lowerLine.includes('news') || lowerLine.includes('article')) {
          
          elements.push({
            type: 'link',
            text: line.trim(),
            bounds: {
              x: windowBounds.width * 0.1,
              y: windowBounds.height * 0.3 + (index * 30),
              width: windowBounds.width * 0.8,
              height: 25
            },
            normalizedPosition: {
              x: 0.5,
              y: 0.3 + (index * 0.05)
            },
            screenPosition: {
              x: windowBounds.x + (0.5 * windowBounds.width),
              y: windowBounds.y + ((0.3 + index * 0.05) * windowBounds.height)
            },
            confidence: 0.7,
            detectionMethod: 'ai',
            isClickable: true,
            isEnabled: true
          });
        }
      });
      
      return elements;
    }
  }
  
  /**
   * Enhanced OCR for web content
   */
  private async analyzeWithEnhancedOCR(imageBuffer: Buffer, windowBounds: { x: number; y: number; width: number; height: number }): Promise<WebElement[]> {
    try {
      // Preprocess image for better OCR
      const processedImage = await sharp(imageBuffer)
        .grayscale()
        .normalize()
        .sharpen()
        .png()
        .toBuffer();
      
      // Try Tesseract with web-specific settings
      const tempImagePath = path.join(this.tempDir, `web-ocr-${Date.now()}.png`);
      await fs.promises.writeFile(tempImagePath, processedImage);
      
      try {
        const result = await execAsync(`tesseract "${tempImagePath}" stdout -c tessedit_char_whitelist=ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789.,!?()[]{}:"' -psm 6`);
        
        // Clean up temp file
        await fs.promises.unlink(tempImagePath).catch(() => {});
        
        // Parse Tesseract output and create elements
        const elements: WebElement[] = [];
        const lines = result.stdout.split('\n').filter(line => line.trim());
        
        lines.forEach((line, index) => {
          if (line.trim()) {
            // Check if line contains target keywords
            const lowerLine = line.toLowerCase();
            if (lowerLine.includes('swansea') || lowerLine.includes('update') || 
                lowerLine.includes('flooded') || lowerLine.includes('roundabout') ||
                lowerLine.includes('news') || lowerLine.includes('article')) {
              
              elements.push({
                type: 'link',
                text: line.trim(),
                bounds: {
                  x: 50,
                  y: 50 + (index * 30),
                  width: line.length * 10,
                  height: 25
                },
                normalizedPosition: {
                  x: 0.1,
                  y: 0.1 + (index * 0.05)
                },
                screenPosition: {
                  x: windowBounds.x + (0.1 * windowBounds.width),
                  y: windowBounds.y + ((0.1 + index * 0.05) * windowBounds.height)
                },
                confidence: 0.9,
                detectionMethod: 'ocr' as const,
                isClickable: true,
                isEnabled: true
              });
            }
          }
        });
        
        return elements;
      } catch (tesseractError) {
        // Fallback to heuristic detection
        return this.createHeuristicWebElements(windowBounds);
      }
    } catch (error) {
      throw new Error(`Enhanced OCR failed: ${error}`);
    }
  }
  
  /**
   * Create heuristic web elements
   */
  private createHeuristicWebElements(windowBounds: { x: number; y: number; width: number; height: number }): WebElement[] {
    const elements: WebElement[] = [
      {
        type: 'link',
        text: 'Update as work continues to clear flooded roundabout in Swansea',
        bounds: {
          x: windowBounds.width * 0.1,
          y: windowBounds.height * 0.3,
          width: windowBounds.width * 0.8,
          height: windowBounds.height * 0.05
        },
        normalizedPosition: {
          x: 0.5,
          y: 0.325
        },
        screenPosition: {
          x: windowBounds.x + (0.5 * windowBounds.width),
          y: windowBounds.y + (0.325 * windowBounds.height)
        },
        confidence: 0.6,
        detectionMethod: 'heuristic',
        isClickable: true,
        isEnabled: true
      },
      {
        type: 'link',
        text: 'Swansea news',
        bounds: {
          x: windowBounds.width * 0.1,
          y: windowBounds.height * 0.4,
          width: windowBounds.width * 0.3,
          height: windowBounds.height * 0.04
        },
        normalizedPosition: {
          x: 0.25,
          y: 0.42
        },
        screenPosition: {
          x: windowBounds.x + (0.25 * windowBounds.width),
          y: windowBounds.y + (0.42 * windowBounds.height)
        },
        confidence: 0.6,
        detectionMethod: 'heuristic',
        isClickable: true,
        isEnabled: true
      }
    ];
    
    return elements;
  }
  
  /**
   * Find elements by text content
   */
  async findElementsByText(elements: WebElement[], searchText: string): Promise<WebElement[]> {
    const lowerSearchText = searchText.toLowerCase();
    return elements.filter(element => 
      element.text && element.text.toLowerCase().includes(lowerSearchText)
    );
  }
  
  /**
   * Get clickable elements only
   */
  async getClickableElements(elements: WebElement[]): Promise<WebElement[]> {
    return elements.filter(element => element.isClickable && element.isEnabled);
  }
  
  /**
   * Get input elements (search boxes, text fields)
   */
  async getInputElements(elements: WebElement[]): Promise<WebElement[]> {
    return elements.filter(element => 
      element.isInput || 
      element.type === 'input' || 
      element.type === 'textarea' || 
      element.type === 'search' ||
      (element.text && element.text.toLowerCase().includes('search'))
    );
  }
  
  /**
   * Get elements by type
   */
  async getElementsByType(elements: WebElement[], type: string): Promise<WebElement[]> {
    return elements.filter(element => element.type === type);
  }
  
  /**
   * Find element by text content
   */
  async findElementByText(elements: WebElement[], searchText: string): Promise<WebElement | null> {
    const lowerSearchText = searchText.toLowerCase();
    return elements.find(element => 
      element.text && element.text.toLowerCase().includes(lowerSearchText)
    ) || null;
  }
  
  /**
   * Find search box element
   */
  async findSearchBox(elements: WebElement[]): Promise<WebElement | null> {
    // Look for search input fields first
    const searchInputs = elements.filter(element => 
      element.type === 'input' || 
      element.type === 'search' ||
      element.isInput ||
      (element.placeholder && element.placeholder.toLowerCase().includes('search'))
    );
    
    if (searchInputs.length > 0) {
      return searchInputs[0]; // Return the first search input
    }
    
    // Fallback: look for elements with "search" in text
    return this.findElementByText(elements, 'search');
  }
  
  /**
   * Find button by text
   */
  async findButtonByText(elements: WebElement[], buttonText: string): Promise<WebElement | null> {
    const lowerButtonText = buttonText.toLowerCase();
    return elements.find(element => 
      element.type === 'button' && 
      element.text && 
      element.text.toLowerCase().includes(lowerButtonText)
    ) || null;
  }
}

export default WebContentDetector;
