#!/usr/bin/env node
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
export declare class WebContentDetector {
    private tempDir;
    private llmConfig;
    constructor();
    private ensureTempDir;
    private loadLLMConfig;
    /**
     * Analyze web content using multiple methods
     */
    analyzeWebContent(imageBuffer: Buffer, windowBounds: {
        x: number;
        y: number;
        width: number;
        height: number;
    }, appName: string): Promise<WebAnalysis>;
    /**
     * Try to get web content via accessibility (Chrome-specific)
     */
    private getWebContentViaAccessibility;
    /**
     * AI analysis with configured provider
     */
    private analyzeWithAI;
    /**
     * Get provider base URL
     */
    private getProviderBaseUrl;
    /**
     * Get provider API key
     */
    private getProviderApiKey;
    /**
     * Get provider model
     */
    private getProviderModel;
    /**
     * Test vision capability for the configured provider
     */
    private testVisionCapability;
    /**
     * Build analysis prompt based on capabilities
     */
    private buildAnalysisPrompt;
    /**
     * Build request body for the provider
     */
    private buildRequestBody;
    /**
     * Parse AI response into WebElement array
     */
    private parseAIResponse;
    /**
     * Enhanced OCR for web content
     */
    private analyzeWithEnhancedOCR;
    /**
     * Create heuristic web elements
     */
    private createHeuristicWebElements;
    /**
     * Find elements by text content
     */
    findElementsByText(elements: WebElement[], searchText: string): Promise<WebElement[]>;
    /**
     * Get clickable elements only
     */
    getClickableElements(elements: WebElement[]): Promise<WebElement[]>;
    /**
     * Get input elements (search boxes, text fields)
     */
    getInputElements(elements: WebElement[]): Promise<WebElement[]>;
    /**
     * Get elements by type
     */
    getElementsByType(elements: WebElement[], type: string): Promise<WebElement[]>;
    /**
     * Find element by text content
     */
    findElementByText(elements: WebElement[], searchText: string): Promise<WebElement | null>;
    /**
     * Find search box element
     */
    findSearchBox(elements: WebElement[]): Promise<WebElement | null>;
    /**
     * Find button by text
     */
    findButtonByText(elements: WebElement[], buttonText: string): Promise<WebElement | null>;
    /**
     * Analyze image - wrapper for analyzeWebContent that accepts base64 image
     * This is the interface expected by the MCP server
     */
    analyzeImage(base64Image: string): Promise<WebElement[]>;
    /**
     * Get available LLM providers and their status
     */
    getAvailableProviders(): Promise<{
        name: string;
        status: string;
    }[]>;
}
export default WebContentDetector;
//# sourceMappingURL=web-content-detector.d.ts.map