#!/usr/bin/env node
"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AppleWindowManager = void 0;
var run_1 = require("@jxa/run");
var AppleWindowManager = /** @class */ (function () {
    function AppleWindowManager() {
    }
    /**
     * Analyze a window using Apple's accessibility system to find all clickable elements
     */
    AppleWindowManager.analyzeWindow = function (appName) {
        return __awaiter(this, void 0, void 0, function () {
            var result, error_1;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 2, , 3]);
                        return [4 /*yield*/, (0, run_1.run)(function (appName) {
                                // @ts-ignore
                                var systemEvents = Application("System Events");
                                var process = systemEvents.processes.byName(appName);
                                if (!process) {
                                    return null;
                                }
                                var windows = process.windows();
                                if (!windows || windows.length === 0) {
                                    return null;
                                }
                                var mainWindow = windows[0];
                                var windowPosition = mainWindow.position();
                                var windowSize = mainWindow.size();
                                var windowBounds = {
                                    x: windowPosition[0],
                                    y: windowPosition[1],
                                    width: windowSize[0],
                                    height: windowSize[1]
                                };
                                // Get all UI elements in the window
                                var elements = [];
                                try {
                                    // Get all UI elements using accessibility
                                    var uiElements = mainWindow.UIElements();
                                    if (uiElements && uiElements.length > 0) {
                                        for (var i = 0; i < uiElements.length; i++) {
                                            var element = uiElements[i];
                                            try {
                                                var elementPosition = element.position();
                                                var elementSize = element.size();
                                                var elementText = element.title ? element.title() : (element.value ? element.value() : '');
                                                var elementRole = element.role ? element.role() : '';
                                                var elementSubrole = element.subrole ? element.subrole() : '';
                                                var isEnabled = element.enabled !== undefined ? element.enabled() : true;
                                                // Determine element type based on role and subrole
                                                var elementType = 'unknown';
                                                var isClickable = false;
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
                                                var normalizedX = (elementPosition[0] - windowBounds.x) / windowBounds.width;
                                                var normalizedY = (elementPosition[1] - windowBounds.y) / windowBounds.height;
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
                                var interactiveElements = elements.filter(function (el) { return el.isClickable && el.isEnabled; });
                                // Generate summary
                                var summary = "Found ".concat(elements.length, " UI elements (").concat(interactiveElements.length, " interactive) in ").concat(appName, " window");
                                // Generate suggested actions
                                var suggestedActions = [];
                                interactiveElements.forEach(function (element) {
                                    if (element.text) {
                                        suggestedActions.push("Click \"".concat(element.text, "\" button at (").concat(element.normalizedPosition.x.toFixed(3), ", ").concat(element.normalizedPosition.y.toFixed(3), ")"));
                                    }
                                    else if (element.type === 'button') {
                                        suggestedActions.push("Click ".concat(element.type, " at (").concat(element.normalizedPosition.x.toFixed(3), ", ").concat(element.normalizedPosition.y.toFixed(3), ")"));
                                    }
                                });
                                return {
                                    elements: elements,
                                    windowBounds: windowBounds,
                                    summary: summary,
                                    interactiveElements: interactiveElements,
                                    suggestedActions: suggestedActions
                                };
                            }, appName)];
                    case 1:
                        result = _a.sent();
                        return [2 /*return*/, result];
                    case 2:
                        error_1 = _a.sent();
                        console.error("Failed to analyze window for ".concat(appName, ":"), error_1);
                        return [2 /*return*/, null];
                    case 3: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Get clickable elements for a specific application
     */
    AppleWindowManager.getClickableElements = function (appName) {
        return __awaiter(this, void 0, void 0, function () {
            var analysis;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.analyzeWindow(appName)];
                    case 1:
                        analysis = _a.sent();
                        return [2 /*return*/, analysis ? analysis.interactiveElements : []];
                }
            });
        });
    };
    /**
     * Find elements by text content
     */
    AppleWindowManager.findElementsByText = function (appName, searchText) {
        return __awaiter(this, void 0, void 0, function () {
            var analysis, lowerSearchText;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.analyzeWindow(appName)];
                    case 1:
                        analysis = _a.sent();
                        if (!analysis)
                            return [2 /*return*/, []];
                        lowerSearchText = searchText.toLowerCase();
                        return [2 /*return*/, analysis.elements.filter(function (element) {
                                return element.text && element.text.toLowerCase().includes(lowerSearchText);
                            })];
                }
            });
        });
    };
    /**
     * Find elements by type
     */
    AppleWindowManager.findElementsByType = function (appName, elementType) {
        return __awaiter(this, void 0, void 0, function () {
            var analysis;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.analyzeWindow(appName)];
                    case 1:
                        analysis = _a.sent();
                        if (!analysis)
                            return [2 /*return*/, []];
                        return [2 /*return*/, analysis.elements.filter(function (element) { return element.type === elementType; })];
                }
            });
        });
    };
    /**
     * Get element at specific coordinates
     */
    AppleWindowManager.getElementAtCoordinates = function (appName, x, y) {
        return __awaiter(this, void 0, void 0, function () {
            var analysis, absX, absY;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.analyzeWindow(appName)];
                    case 1:
                        analysis = _a.sent();
                        if (!analysis)
                            return [2 /*return*/, null];
                        absX = analysis.windowBounds.x + (x * analysis.windowBounds.width);
                        absY = analysis.windowBounds.y + (y * analysis.windowBounds.height);
                        // Find element that contains these coordinates
                        return [2 /*return*/, analysis.elements.find(function (element) {
                                return absX >= element.bounds.x &&
                                    absX <= element.bounds.x + element.bounds.width &&
                                    absY >= element.bounds.y &&
                                    absY <= element.bounds.y + element.bounds.height;
                            }) || null];
                }
            });
        });
    };
    /**
     * Get detailed window information including all UI elements
     */
    AppleWindowManager.getWindowDetails = function (appName) {
        return __awaiter(this, void 0, void 0, function () {
            var analysis;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.analyzeWindow(appName)];
                    case 1:
                        analysis = _a.sent();
                        if (!analysis)
                            return [2 /*return*/, null];
                        return [2 /*return*/, {
                                appName: appName,
                                windowBounds: analysis.windowBounds,
                                totalElements: analysis.elements.length,
                                interactiveElementCount: analysis.interactiveElements.length,
                                elements: analysis.elements,
                                interactiveElements: analysis.interactiveElements,
                                summary: analysis.summary,
                                suggestedActions: analysis.suggestedActions,
                                elementTypes: this.getElementTypeCounts(analysis.elements)
                            }];
                }
            });
        });
    };
    /**
     * Get counts of different element types
     */
    AppleWindowManager.getElementTypeCounts = function (elements) {
        var counts = {};
        elements.forEach(function (element) {
            counts[element.type] = (counts[element.type] || 0) + 1;
        });
        return counts;
    };
    /**
     * Validate that an element is actually clickable
     */
    AppleWindowManager.validateElementClickability = function (appName, element) {
        return __awaiter(this, void 0, void 0, function () {
            var result, error_2;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 2, , 3]);
                        return [4 /*yield*/, (0, run_1.run)(function (appName, elementBounds) {
                                // @ts-ignore
                                var systemEvents = Application("System Events");
                                var process = systemEvents.processes.byName(appName);
                                if (!process)
                                    return false;
                                var windows = process.windows();
                                if (!windows || windows.length === 0)
                                    return false;
                                var mainWindow = windows[0];
                                // Try to find the element at the specified bounds
                                var uiElements = mainWindow.UIElements();
                                if (!uiElements)
                                    return false;
                                for (var i = 0; i < uiElements.length; i++) {
                                    var uiElement = uiElements[i];
                                    try {
                                        var position = uiElement.position();
                                        var size = uiElement.size();
                                        // Check if this element matches our bounds
                                        if (Math.abs(position[0] - elementBounds.x) < 5 &&
                                            Math.abs(position[1] - elementBounds.y) < 5 &&
                                            Math.abs(size[0] - elementBounds.width) < 5 &&
                                            Math.abs(size[1] - elementBounds.height) < 5) {
                                            // Check if element is enabled and clickable
                                            var enabled = uiElement.enabled !== undefined ? uiElement.enabled() : true;
                                            var role = uiElement.role ? uiElement.role() : '';
                                            var subrole = uiElement.subrole ? uiElement.subrole() : '';
                                            return enabled && (role === 'button' || subrole === 'button' || role === 'link' || subrole === 'link');
                                        }
                                    }
                                    catch (e) {
                                        continue;
                                    }
                                }
                                return false;
                            }, appName, element.bounds)];
                    case 1:
                        result = _a.sent();
                        return [2 /*return*/, result];
                    case 2:
                        error_2 = _a.sent();
                        console.error('Failed to validate element clickability:', error_2);
                        return [2 /*return*/, false];
                    case 3: return [2 /*return*/];
                }
            });
        });
    };
    return AppleWindowManager;
}());
exports.AppleWindowManager = AppleWindowManager;
exports.default = AppleWindowManager;
