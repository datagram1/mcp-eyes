#!/usr/bin/env node
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
    isClickable: boolean;
    isEnabled: boolean;
    accessibilityDescription?: string;
    role?: string;
    subrole?: string;
}
interface WindowAnalysis {
    elements: ClickableElement[];
    windowBounds: {
        x: number;
        y: number;
        width: number;
        height: number;
    };
    summary: string;
    interactiveElements: ClickableElement[];
    suggestedActions: string[];
}
export declare class AppleWindowManager {
    /**
     * Analyze a window using Apple's accessibility system to find all clickable elements
     */
    analyzeWindow(appName: string): Promise<WindowAnalysis | null>;
    /**
     * Get clickable elements for a specific application
     */
    getClickableElements(appName: string): Promise<ClickableElement[]>;
    /**
     * Find elements by text content
     */
    findElementsByText(appName: string, searchText: string): Promise<ClickableElement[]>;
    /**
     * Find elements by type
     */
    findElementsByType(appName: string, elementType: string): Promise<ClickableElement[]>;
    /**
     * Get element at specific coordinates
     */
    getElementAtCoordinates(appName: string, x: number, y: number): Promise<ClickableElement | null>;
    /**
     * Get detailed window information including all UI elements
     */
    getWindowDetails(appName: string): Promise<any>;
    /**
     * Get counts of different element types
     */
    private getElementTypeCounts;
    /**
     * Validate that an element is actually clickable
     */
    validateElementClickability(appName: string, element: ClickableElement): Promise<boolean>;
}
export default AppleWindowManager;
//# sourceMappingURL=apple-window-manager.d.ts.map