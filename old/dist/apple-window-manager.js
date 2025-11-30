#!/usr/bin/env node
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AppleWindowManager = void 0;
const jxa_runner_js_1 = require("./jxa-runner.js");
class AppleWindowManager {
    /**
     * Analyze a window using Apple's accessibility system to find all clickable elements
     */
    async analyzeWindow(appName) {
        try {
            const result = await (0, jxa_runner_js_1.run)((appName) => {
                // @ts-ignore
                const systemEvents = Application("System Events");
                const process = systemEvents.processes.byName(appName);
                if (!process) {
                    return null;
                }
                const windows = process.windows();
                if (!windows || windows.length === 0) {
                    return null;
                }
                const mainWindow = windows[0];
                const windowPosition = mainWindow.position();
                const windowSize = mainWindow.size();
                const windowBounds = {
                    x: windowPosition[0],
                    y: windowPosition[1],
                    width: windowSize[0],
                    height: windowSize[1]
                };
                // Get all UI elements in the window
                const elements = [];
                try {
                    // Get all UI elements using accessibility
                    const uiElements = mainWindow.UIElements();
                    if (uiElements && uiElements.length > 0) {
                        for (let i = 0; i < uiElements.length; i++) {
                            const element = uiElements[i];
                            try {
                                const elementPosition = element.position();
                                const elementSize = element.size();
                                const elementText = element.title ? element.title() : (element.value ? element.value() : '');
                                const elementRole = element.role ? element.role() : '';
                                const elementSubrole = element.subrole ? element.subrole() : '';
                                const isEnabled = element.enabled !== undefined ? element.enabled() : true;
                                // Determine element type based on role and subrole
                                let elementType = 'unknown';
                                let isClickable = false;
                                if (elementRole === 'button' || elementSubrole === 'button') {
                                    elementType = 'button';
                                    isClickable = true;
                                }
                                else if (elementRole === 'textField' || elementSubrole === 'textField') {
                                    elementType = 'input';
                                    isClickable = true;
                                }
                                else if (elementRole === 'staticText' || elementSubrole === 'staticText') {
                                    elementType = 'text';
                                    isClickable = false;
                                }
                                else if (elementRole === 'link' || elementSubrole === 'link') {
                                    elementType = 'link';
                                    isClickable = true;
                                }
                                else if (elementRole === 'image' || elementSubrole === 'image') {
                                    elementType = 'image';
                                    isClickable = true;
                                }
                                else if (elementRole === 'menu' || elementSubrole === 'menu') {
                                    elementType = 'menu';
                                    isClickable = true;
                                }
                                else if (elementRole === 'checkBox' || elementSubrole === 'checkBox') {
                                    elementType = 'checkbox';
                                    isClickable = true;
                                }
                                else if (elementRole === 'radioButton' || elementSubrole === 'radioButton') {
                                    elementType = 'radio';
                                    isClickable = true;
                                }
                                else if (elementRole === 'slider' || elementSubrole === 'slider') {
                                    elementType = 'slider';
                                    isClickable = true;
                                }
                                // Calculate normalized position relative to window
                                const normalizedX = (elementPosition[0] - windowBounds.x) / windowBounds.width;
                                const normalizedY = (elementPosition[1] - windowBounds.y) / windowBounds.height;
                                elements.push({
                                    type: elementType,
                                    text: elementText,
                                    bounds: {
                                        x: elementPosition[0],
                                        y: elementPosition[1],
                                        width: elementSize[0],
                                        height: elementSize[1]
                                    },
                                    normalizedPosition: {
                                        x: normalizedX,
                                        y: normalizedY
                                    },
                                    isClickable: isClickable,
                                    isEnabled: isEnabled,
                                    accessibilityDescription: element.description ? element.description() : '',
                                    role: elementRole,
                                    subrole: elementSubrole
                                });
                            }
                            catch (elementError) {
                                // Skip elements that can't be analyzed
                                continue;
                            }
                        }
                    }
                }
                catch (uiError) {
                    // If UI elements can't be accessed, try alternative method
                    console.log('UI elements not accessible, trying alternative method');
                }
                // Filter interactive elements
                const interactiveElements = elements.filter(el => el.isClickable && el.isEnabled);
                // Generate summary
                const summary = `Found ${elements.length} UI elements (${interactiveElements.length} interactive) in ${appName} window`;
                // Generate suggested actions
                const suggestedActions = [];
                interactiveElements.forEach(element => {
                    if (element.text) {
                        suggestedActions.push(`Click "${element.text}" button at (${element.normalizedPosition.x.toFixed(3)}, ${element.normalizedPosition.y.toFixed(3)})`);
                    }
                    else if (element.type === 'button') {
                        suggestedActions.push(`Click ${element.type} at (${element.normalizedPosition.x.toFixed(3)}, ${element.normalizedPosition.y.toFixed(3)})`);
                    }
                });
                return {
                    elements,
                    windowBounds,
                    summary,
                    interactiveElements,
                    suggestedActions
                };
            }, appName);
            return result;
        }
        catch (error) {
            console.error(`Failed to analyze window for ${appName}:`, error);
            return null;
        }
    }
    /**
     * Get clickable elements for a specific application
     */
    async getClickableElements(appName) {
        const analysis = await this.analyzeWindow(appName);
        return analysis ? analysis.interactiveElements : [];
    }
    /**
     * Find elements by text content
     */
    async findElementsByText(appName, searchText) {
        const analysis = await this.analyzeWindow(appName);
        if (!analysis)
            return [];
        const lowerSearchText = searchText.toLowerCase();
        return analysis.elements.filter(element => element.text && element.text.toLowerCase().includes(lowerSearchText));
    }
    /**
     * Find elements by type
     */
    async findElementsByType(appName, elementType) {
        const analysis = await this.analyzeWindow(appName);
        if (!analysis)
            return [];
        return analysis.elements.filter(element => element.type === elementType);
    }
    /**
     * Get element at specific coordinates
     */
    async getElementAtCoordinates(appName, x, y) {
        const analysis = await this.analyzeWindow(appName);
        if (!analysis)
            return null;
        // Convert normalized coordinates to absolute coordinates
        const absX = analysis.windowBounds.x + (x * analysis.windowBounds.width);
        const absY = analysis.windowBounds.y + (y * analysis.windowBounds.height);
        // Find element that contains these coordinates
        return analysis.elements.find(element => absX >= element.bounds.x &&
            absX <= element.bounds.x + element.bounds.width &&
            absY >= element.bounds.y &&
            absY <= element.bounds.y + element.bounds.height) || null;
    }
    /**
     * Get detailed window information including all UI elements
     */
    async getWindowDetails(appName) {
        const analysis = await this.analyzeWindow(appName);
        if (!analysis)
            return null;
        return {
            appName,
            windowBounds: analysis.windowBounds,
            totalElements: analysis.elements.length,
            interactiveElementCount: analysis.interactiveElements.length,
            elements: analysis.elements,
            interactiveElements: analysis.interactiveElements,
            summary: analysis.summary,
            suggestedActions: analysis.suggestedActions,
            elementTypes: this.getElementTypeCounts(analysis.elements)
        };
    }
    /**
     * Get counts of different element types
     */
    getElementTypeCounts(elements) {
        const counts = {};
        elements.forEach(element => {
            counts[element.type] = (counts[element.type] || 0) + 1;
        });
        return counts;
    }
    /**
     * Validate that an element is actually clickable
     */
    async validateElementClickability(appName, element) {
        try {
            const result = await (0, jxa_runner_js_1.run)((appName, elementBounds) => {
                // @ts-ignore
                const systemEvents = Application("System Events");
                const process = systemEvents.processes.byName(appName);
                if (!process)
                    return false;
                const windows = process.windows();
                if (!windows || windows.length === 0)
                    return false;
                const mainWindow = windows[0];
                // Try to find the element at the specified bounds
                const uiElements = mainWindow.UIElements();
                if (!uiElements)
                    return false;
                for (let i = 0; i < uiElements.length; i++) {
                    const uiElement = uiElements[i];
                    try {
                        const position = uiElement.position();
                        const size = uiElement.size();
                        // Check if this element matches our bounds
                        if (Math.abs(position[0] - elementBounds.x) < 5 &&
                            Math.abs(position[1] - elementBounds.y) < 5 &&
                            Math.abs(size[0] - elementBounds.width) < 5 &&
                            Math.abs(size[1] - elementBounds.height) < 5) {
                            // Check if element is enabled and clickable
                            const enabled = uiElement.enabled !== undefined ? uiElement.enabled() : true;
                            const role = uiElement.role ? uiElement.role() : '';
                            const subrole = uiElement.subrole ? uiElement.subrole() : '';
                            return enabled && (role === 'button' || subrole === 'button' || role === 'link' || subrole === 'link');
                        }
                    }
                    catch (e) {
                        continue;
                    }
                }
                return false;
            }, appName, element.bounds);
            return result;
        }
        catch (error) {
            console.error('Failed to validate element clickability:', error);
            return false;
        }
    }
}
exports.AppleWindowManager = AppleWindowManager;
exports.default = AppleWindowManager;
//# sourceMappingURL=apple-window-manager.js.map