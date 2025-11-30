#!/usr/bin/env node
interface LLMConfig {
    baseUrl: string;
    apiKey?: string;
    model?: string;
    maxTokens?: number;
    temperature?: number;
}
interface LLMElement {
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
    confidence: number;
    description?: string;
    isClickable: boolean;
    isEnabled: boolean;
}
interface LLMAnalysis {
    elements: LLMElement[];
    summary: string;
    suggestedActions: string[];
    windowInfo: {
        width: number;
        height: number;
        title?: string;
    };
    boundingBoxes: {
        element: LLMElement;
        box: {
            x: number;
            y: number;
            width: number;
            height: number;
        };
    }[];
}
export declare class LocalLLMAnalyzer {
    private config;
    private tempDir;
    constructor(config?: Partial<LLMConfig>);
    private ensureTempDir;
    /**
     * Analyze screenshot using local LLM
     */
    analyzeScreenshot(imageBuffer: Buffer, windowWidth: number, windowHeight: number, appName?: string): Promise<LLMAnalysis>;
    /**
     * Create analysis prompt for the LLM
     */
    private createAnalysisPrompt;
    /**
     * Call local LLM with image and prompt
     */
    private callLocalLLM;
    /**
     * Parse LLM response into structured analysis
     */
    private parseLLMResponse;
    /**
     * Create fallback analysis when LLM fails
     */
    private createFallbackAnalysis;
    /**
     * Test connection to local LLM
     */
    testConnection(): Promise<boolean>;
    /**
     * Get available models from local LLM
     */
    getAvailableModels(): Promise<string[]>;
    /**
     * Analyze specific element types
     */
    analyzeElementTypes(imageBuffer: Buffer, windowWidth: number, windowHeight: number, elementTypes: string[]): Promise<LLMElement[]>;
    /**
     * Find elements by text content
     */
    findElementsByText(imageBuffer: Buffer, windowWidth: number, windowHeight: number, searchText: string): Promise<LLMElement[]>;
    /**
     * Get clickable elements only
     */
    getClickableElements(imageBuffer: Buffer, windowWidth: number, windowHeight: number): Promise<LLMElement[]>;
    /**
     * Analyze image - wrapper for analyzeScreenshot that accepts base64 image and prompt
     * This is the interface expected by the MCP server
     */
    analyzeImage(base64Image: string, prompt: string): Promise<string>;
}
export default LocalLLMAnalyzer;
//# sourceMappingURL=local-llm-analyzer.d.ts.map