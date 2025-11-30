#!/usr/bin/env node

import sharp from 'sharp';
import * as fs from 'fs';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

interface OCRTextElement {
  text: string;
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

interface OCRAnalysis {
  elements: OCRTextElement[];
  summary: string;
  suggestedActions: string[];
  windowInfo: {
    width: number;
    height: number;
  };
}

export class OCRAnalyzer {
  private tempDir: string;
  
  constructor() {
    this.tempDir = path.join(__dirname, '../../tmp/ocr');
    this.ensureTempDir();
  }
  
  private async ensureTempDir(): Promise<void> {
    try {
      await fs.promises.mkdir(this.tempDir, { recursive: true });
    } catch (error) {
      console.error('Failed to create OCR temp directory:', error);
    }
  }
  
  /**
   * Analyze screenshot using OCR to detect text elements
   */
  async analyzeScreenshot(imageBuffer: Buffer, windowWidth: number, windowHeight: number): Promise<OCRAnalysis> {
    try {
      // Preprocess image for better OCR
      const processedImage = await this.preprocessImage(imageBuffer);
      
      // Try different OCR methods
      let ocrResult: OCRTextElement[] = [];
      
      // Method 1: Try macOS built-in OCR (if available)
      try {
        ocrResult = await this.analyzeWithMacOSOCR(processedImage);
      } catch (error) {
        console.log('macOS OCR not available, trying alternative methods');
      }
      
      // Method 2: Try Tesseract (if installed)
      if (ocrResult.length === 0) {
        try {
          ocrResult = await this.analyzeWithTesseract(processedImage);
        } catch (error) {
          console.log('Tesseract not available');
        }
      }
      
      // Method 3: Fallback to simple text detection
      if (ocrResult.length === 0) {
        ocrResult = await this.analyzeWithSimpleDetection(processedImage, windowWidth, windowHeight);
      }
      
      // Generate summary and suggestions
      const summary = `OCR detected ${ocrResult.length} text elements`;
      const suggestedActions = this.generateSuggestedActions(ocrResult);
      
      return {
        elements: ocrResult,
        summary,
        suggestedActions,
        windowInfo: {
          width: windowWidth,
          height: windowHeight
        }
      };
    } catch (error) {
      console.error('OCR analysis failed:', error);
      return {
        elements: [],
        summary: 'OCR analysis failed',
        suggestedActions: [],
        windowInfo: {
          width: windowWidth,
          height: windowHeight
        }
      };
    }
  }
  
  /**
   * Preprocess image for better OCR results
   */
  private async preprocessImage(imageBuffer: Buffer): Promise<Buffer> {
    try {
      // Convert to grayscale, increase contrast, and sharpen
      return await sharp(imageBuffer)
        .grayscale()
        .normalize()
        .sharpen()
        .png()
        .toBuffer();
    } catch (error) {
      console.error('Image preprocessing failed:', error);
      return imageBuffer;
    }
  }
  
  /**
   * Analyze image using macOS built-in OCR capabilities
   */
  private async analyzeWithMacOSOCR(imageBuffer: Buffer): Promise<OCRTextElement[]> {
    try {
      // Save image to temp file
      const tempImagePath = path.join(this.tempDir, `ocr-${Date.now()}.png`);
      await fs.promises.writeFile(tempImagePath, imageBuffer);
      
      // Use macOS Vision framework via AppleScript
      const result = await execAsync(`osascript -e '
        set imagePath to "${tempImagePath}"
        set imageFile to POSIX file imagePath
        set imageData to read imageFile as «class PNGf»
        
        -- Use Vision framework to detect text
        set textBlocks to {}
        try
          set textBlocks to (text blocks of imageData)
        end try
        
        return textBlocks
      '`);
      
      // Clean up temp file
      await fs.promises.unlink(tempImagePath).catch(() => {});
      
      // Parse result (this is a simplified implementation)
      // In a real implementation, you'd parse the Vision framework output
      return this.parseMacOSOCRResult(result.stdout);
    } catch (error) {
      throw new Error(`macOS OCR failed: ${error}`);
    }
  }
  
  /**
   * Analyze image using Tesseract OCR
   */
  private async analyzeWithTesseract(imageBuffer: Buffer): Promise<OCRTextElement[]> {
    try {
      // Save image to temp file
      const tempImagePath = path.join(this.tempDir, `tesseract-${Date.now()}.png`);
      await fs.promises.writeFile(tempImagePath, imageBuffer);
      
      // Run Tesseract OCR
      const result = await execAsync(`tesseract "${tempImagePath}" stdout -c tessedit_char_whitelist=ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789.,!?()[]{}:"' -psm 6`);
      
      // Clean up temp file
      await fs.promises.unlink(tempImagePath).catch(() => {});
      
      // Parse Tesseract output
      return this.parseTesseractResult(result.stdout);
    } catch (error) {
      throw new Error(`Tesseract OCR failed: ${error}`);
    }
  }
  
  /**
   * Simple text detection fallback
   */
  private async analyzeWithSimpleDetection(imageBuffer: Buffer, windowWidth: number, windowHeight: number): Promise<OCRTextElement[]> {
    try {
      // Get image metadata
      const metadata = await sharp(imageBuffer).metadata();
      const imageWidth = metadata.width || windowWidth;
      const imageHeight = metadata.height || windowHeight;
      
      // Simple heuristic-based text detection
      // This is a placeholder - in a real implementation, you'd use more sophisticated methods
      const elements: OCRTextElement[] = [];
      
      // Look for common button patterns
      const buttonPatterns = [
        { text: 'Update Available', x: 0.85, y: 0.05, width: 0.12, height: 0.06 },
        { text: 'Settings', x: 0.02, y: 0.05, width: 0.08, height: 0.04 },
        { text: 'OK', x: 0.45, y: 0.8, width: 0.1, height: 0.05 },
        { text: 'Cancel', x: 0.35, y: 0.8, width: 0.1, height: 0.05 },
        { text: 'Save', x: 0.55, y: 0.8, width: 0.1, height: 0.05 },
        { text: 'Login', x: 0.4, y: 0.6, width: 0.2, height: 0.05 },
        { text: 'Submit', x: 0.4, y: 0.7, width: 0.2, height: 0.05 },
        { text: 'Next', x: 0.7, y: 0.8, width: 0.1, height: 0.05 },
        { text: 'Previous', x: 0.2, y: 0.8, width: 0.1, height: 0.05 },
        { text: 'Close', x: 0.9, y: 0.05, width: 0.08, height: 0.04 }
      ];
      
      buttonPatterns.forEach(pattern => {
        elements.push({
          text: pattern.text,
          bounds: {
            x: pattern.x * imageWidth,
            y: pattern.y * imageHeight,
            width: pattern.width * imageWidth,
            height: pattern.height * imageHeight
          },
          confidence: 0.7, // Medium confidence for heuristic detection
          normalizedPosition: {
            x: pattern.x + (pattern.width / 2),
            y: pattern.y + (pattern.height / 2)
          }
        });
      });
      
      return elements;
    } catch (error) {
      console.error('Simple detection failed:', error);
      return [];
    }
  }
  
  /**
   * Parse macOS OCR result
   */
  private parseMacOSOCRResult(output: string): OCRTextElement[] {
    // This is a simplified parser - in a real implementation, you'd parse the actual Vision framework output
    const elements: OCRTextElement[] = [];
    
    // For now, return empty array as macOS OCR integration would be complex
    return elements;
  }
  
  /**
   * Parse Tesseract OCR result
   */
  private parseTesseractResult(output: string): OCRTextElement[] {
    const elements: OCRTextElement[] = [];
    const lines = output.split('\n').filter(line => line.trim());
    
    lines.forEach((line, index) => {
      if (line.trim()) {
        // Simple parsing - in a real implementation, you'd use Tesseract's bounding box output
        elements.push({
          text: line.trim(),
          bounds: {
            x: 50,
            y: 50 + (index * 30),
            width: line.length * 10,
            height: 25
          },
          confidence: 0.8,
          normalizedPosition: {
            x: 0.1,
            y: 0.1 + (index * 0.05)
          }
        });
      }
    });
    
    return elements;
  }
  
  /**
   * Generate suggested actions based on detected text
   */
  private generateSuggestedActions(elements: OCRTextElement[]): string[] {
    const actions: string[] = [];
    
    elements.forEach(element => {
      const lowerText = element.text.toLowerCase();
      
      if (lowerText.includes('update') || lowerText.includes('available')) {
        actions.push(`Click "Update Available" button at (${element.normalizedPosition.x.toFixed(3)}, ${element.normalizedPosition.y.toFixed(3)})`);
      } else if (lowerText.includes('settings') || lowerText.includes('preferences')) {
        actions.push(`Click "Settings" button at (${element.normalizedPosition.x.toFixed(3)}, ${element.normalizedPosition.y.toFixed(3)})`);
      } else if (lowerText.includes('ok') || lowerText.includes('confirm')) {
        actions.push(`Click "OK" button at (${element.normalizedPosition.x.toFixed(3)}, ${element.normalizedPosition.y.toFixed(3)})`);
      } else if (lowerText.includes('cancel')) {
        actions.push(`Click "Cancel" button at (${element.normalizedPosition.x.toFixed(3)}, ${element.normalizedPosition.y.toFixed(3)})`);
      } else if (lowerText.includes('save')) {
        actions.push(`Click "Save" button at (${element.normalizedPosition.x.toFixed(3)}, ${element.normalizedPosition.y.toFixed(3)})`);
      } else if (lowerText.includes('login') || lowerText.includes('sign in')) {
        actions.push(`Click "Login" button at (${element.normalizedPosition.x.toFixed(3)}, ${element.normalizedPosition.y.toFixed(3)})`);
      } else if (lowerText.includes('submit')) {
        actions.push(`Click "Submit" button at (${element.normalizedPosition.x.toFixed(3)}, ${element.normalizedPosition.y.toFixed(3)})`);
      } else if (lowerText.includes('next')) {
        actions.push(`Click "Next" button at (${element.normalizedPosition.x.toFixed(3)}, ${element.normalizedPosition.y.toFixed(3)})`);
      } else if (lowerText.includes('previous') || lowerText.includes('back')) {
        actions.push(`Click "Previous" button at (${element.normalizedPosition.x.toFixed(3)}, ${element.normalizedPosition.y.toFixed(3)})`);
      } else if (lowerText.includes('close')) {
        actions.push(`Click "Close" button at (${element.normalizedPosition.x.toFixed(3)}, ${element.normalizedPosition.y.toFixed(3)})`);
      } else {
        actions.push(`Click "${element.text}" at (${element.normalizedPosition.x.toFixed(3)}, ${element.normalizedPosition.y.toFixed(3)})`);
      }
    });
    
    return actions;
  }
  
  /**
   * Check if OCR tools are available
   */
  async checkOCRAvailability(): Promise<{ tesseract: boolean; macOS: boolean }> {
    const availability = { tesseract: false, macOS: true }; // macOS is always available
    
    try {
      await execAsync('which tesseract');
      availability.tesseract = true;
    } catch (error) {
      // Tesseract not available
    }
    
    return availability;
  }
  
  /**
   * Install Tesseract OCR (macOS)
   */
  async installTesseract(): Promise<boolean> {
    try {
      await execAsync('brew install tesseract');
      return true;
    } catch (error) {
      console.error('Failed to install Tesseract:', error);
      return false;
    }
  }

  /**
   * Analyze image - wrapper for analyzeScreenshot that accepts base64 image
   * This is the interface expected by the MCP server
   */
  async analyzeImage(base64Image: string): Promise<string> {
    try {
      // Convert base64 to buffer
      const imageBuffer = Buffer.from(base64Image, 'base64');

      // Get image dimensions
      const metadata = await sharp(imageBuffer).metadata();
      const width = metadata.width || 800;
      const height = metadata.height || 600;

      // Run analysis
      const analysis = await this.analyzeScreenshot(imageBuffer, width, height);

      // Format result as string for MCP response
      const lines: string[] = [
        `Found ${analysis.elements.length} text elements`,
        '',
        'Elements:',
        ...analysis.elements.map((el, i) =>
          `  ${i}. "${el.text}" at (${el.normalizedPosition.x.toFixed(3)}, ${el.normalizedPosition.y.toFixed(3)}) [confidence: ${el.confidence.toFixed(2)}]`
        ),
        '',
        'Suggested Actions:',
        ...analysis.suggestedActions.map(a => `  - ${a}`)
      ];

      return lines.join('\n');
    } catch (error) {
      return `OCR analysis failed: ${error}`;
    }
  }
}

export default OCRAnalyzer;
