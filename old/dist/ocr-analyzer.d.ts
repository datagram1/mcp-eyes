#!/usr/bin/env node
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
export declare class OCRAnalyzer {
    private tempDir;
    constructor();
    private ensureTempDir;
    /**
     * Analyze screenshot using OCR to detect text elements
     */
    analyzeScreenshot(imageBuffer: Buffer, windowWidth: number, windowHeight: number): Promise<OCRAnalysis>;
    /**
     * Preprocess image for better OCR results
     */
    private preprocessImage;
    /**
     * Analyze image using macOS built-in OCR capabilities
     */
    private analyzeWithMacOSOCR;
    /**
     * Analyze image using Tesseract OCR
     */
    private analyzeWithTesseract;
    /**
     * Simple text detection fallback
     */
    private analyzeWithSimpleDetection;
    /**
     * Parse macOS OCR result
     */
    private parseMacOSOCRResult;
    /**
     * Parse Tesseract OCR result
     */
    private parseTesseractResult;
    /**
     * Generate suggested actions based on detected text
     */
    private generateSuggestedActions;
    /**
     * Check if OCR tools are available
     */
    checkOCRAvailability(): Promise<{
        tesseract: boolean;
        macOS: boolean;
    }>;
    /**
     * Install Tesseract OCR (macOS)
     */
    installTesseract(): Promise<boolean>;
    /**
     * Analyze image - wrapper for analyzeScreenshot that accepts base64 image
     * This is the interface expected by the MCP server
     */
    analyzeImage(base64Image: string): Promise<string>;
}
export default OCRAnalyzer;
//# sourceMappingURL=ocr-analyzer.d.ts.map