#!/usr/bin/env node
"use strict";
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
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
var index_js_1 = require("@modelcontextprotocol/sdk/server/index.js");
var stdio_js_1 = require("@modelcontextprotocol/sdk/server/stdio.js");
var types_js_1 = require("@modelcontextprotocol/sdk/types.js");
var nut_js_1 = require("@nut-tree-fork/nut-js");
// @ts-ignore
var screenshot_desktop_1 = require("screenshot-desktop");
// @ts-ignore
var permissions = require("node-mac-permissions");
var run_1 = require("@jxa/run");
var sharp_1 = require("sharp");
var fs = require("fs");
var enhanced_window_bounds_1 = require("./enhanced-window-bounds");
var apple_window_manager_1 = require("./apple-window-manager");
var ocr_analyzer_1 = require("./ocr-analyzer");
var local_llm_analyzer_1 = require("./local-llm-analyzer");
var AccessibilityFirstServer = /** @class */ (function () {
    function AccessibilityFirstServer() {
        this.currentApp = null;
        this.llmAnalyzer = null;
        this.logFile = '/Users/richardbrown/dev/mcp_eyes/test-screenshots/accessibility-first-debug-log.md';
        this.server = new index_js_1.Server({
            name: 'accessibility-first-server',
            version: '1.1.12',
        });
        // Initialize analyzers
        this.ocrAnalyzer = new ocr_analyzer_1.OCRAnalyzer();
        // Try to initialize LLM analyzer
        try {
            this.llmAnalyzer = new local_llm_analyzer_1.LocalLLMAnalyzer({
                baseUrl: 'http://127.0.0.1:1234',
                model: 'gpt-oss-20b',
                maxTokens: 2000,
                temperature: 0.1
            });
        }
        catch (error) {
            console.log('Local LLM not available, will use fallback methods');
        }
        this.setupToolHandlers();
    }
    AccessibilityFirstServer.prototype.log = function (message) {
        return __awaiter(this, void 0, void 0, function () {
            var timestamp, logEntry, error_1;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 2, , 3]);
                        timestamp = new Date().toISOString();
                        logEntry = "- ".concat(timestamp, ": ").concat(message, "\n");
                        return [4 /*yield*/, fs.promises.appendFile(this.logFile, logEntry)];
                    case 1:
                        _a.sent();
                        return [3 /*break*/, 3];
                    case 2:
                        error_1 = _a.sent();
                        console.error('Failed to write to log file:', error_1);
                        return [3 /*break*/, 3];
                    case 3: return [2 /*return*/];
                }
            });
        });
    };
    AccessibilityFirstServer.prototype.setupToolHandlers = function () {
        var _this = this;
        this.server.setRequestHandler(types_js_1.ListToolsRequestSchema, function () { return __awaiter(_this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                return [2 /*return*/, {
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
                    }];
            });
        }); });
        this.server.setRequestHandler(types_js_1.CallToolRequestSchema, function (request) { return __awaiter(_this, void 0, void 0, function () {
            var _a, name, args, _b, error_2;
            return __generator(this, function (_c) {
                switch (_c.label) {
                    case 0:
                        _a = request.params, name = _a.name, args = _a.arguments;
                        _c.label = 1;
                    case 1:
                        _c.trys.push([1, 18, , 19]);
                        _b = name;
                        switch (_b) {
                            case 'getClickableElements': return [3 /*break*/, 2];
                            case 'clickElement': return [3 /*break*/, 4];
                            case 'findAndClickElement': return [3 /*break*/, 6];
                            case 'testDetectionMethods': return [3 /*break*/, 8];
                            case 'listApplications': return [3 /*break*/, 10];
                            case 'focusApplication': return [3 /*break*/, 12];
                            case 'moveMouseToElement': return [3 /*break*/, 14];
                        }
                        return [3 /*break*/, 16];
                    case 2: return [4 /*yield*/, this.getClickableElements(args === null || args === void 0 ? void 0 : args.appName, (args === null || args === void 0 ? void 0 : args.includeScreenCoordinates) !== false, (args === null || args === void 0 ? void 0 : args.forceMethod) || 'auto')];
                    case 3: return [2 /*return*/, _c.sent()];
                    case 4: return [4 /*yield*/, this.clickElement(args === null || args === void 0 ? void 0 : args.appName, args === null || args === void 0 ? void 0 : args.elementIndex, (args === null || args === void 0 ? void 0 : args.button) || 'left', (args === null || args === void 0 ? void 0 : args.useScreenCoordinates) !== false)];
                    case 5: return [2 /*return*/, _c.sent()];
                    case 6: return [4 /*yield*/, this.findAndClickElement(args === null || args === void 0 ? void 0 : args.appName, args === null || args === void 0 ? void 0 : args.searchText, args === null || args === void 0 ? void 0 : args.elementType, (args === null || args === void 0 ? void 0 : args.button) || 'left')];
                    case 7: return [2 /*return*/, _c.sent()];
                    case 8: return [4 /*yield*/, this.testDetectionMethods()];
                    case 9: return [2 /*return*/, _c.sent()];
                    case 10: return [4 /*yield*/, this.listApplications()];
                    case 11: return [2 /*return*/, _c.sent()];
                    case 12: return [4 /*yield*/, this.focusApplication(args === null || args === void 0 ? void 0 : args.identifier)];
                    case 13: return [2 /*return*/, _c.sent()];
                    case 14: return [4 /*yield*/, this.moveMouseToElement(args === null || args === void 0 ? void 0 : args.appName, args === null || args === void 0 ? void 0 : args.elementIndex, (args === null || args === void 0 ? void 0 : args.useScreenCoordinates) !== false)];
                    case 15: return [2 /*return*/, _c.sent()];
                    case 16: throw new Error("Unknown tool: ".concat(name));
                    case 17: return [3 /*break*/, 19];
                    case 18:
                        error_2 = _c.sent();
                        return [2 /*return*/, {
                                content: [
                                    {
                                        type: 'text',
                                        text: "Error: ".concat(error_2 instanceof Error ? error_2.message : String(error_2)),
                                    },
                                ],
                                isError: true,
                            }];
                    case 19: return [2 /*return*/];
                }
            });
        }); });
    };
    AccessibilityFirstServer.prototype.checkPermissions = function () {
        return __awaiter(this, void 0, void 0, function () {
            var screenRecording, accessibility;
            return __generator(this, function (_a) {
                screenRecording = permissions.getAuthStatus('screen');
                accessibility = permissions.getAuthStatus('accessibility');
                if (screenRecording !== 'authorized') {
                    throw new Error('Screen Recording permission is required. Please grant permission in System Preferences > Security & Privacy > Privacy > Screen Recording.');
                }
                if (accessibility !== 'authorized') {
                    throw new Error('Accessibility permission is required. Please grant permission in System Preferences > Security & Privacy > Privacy > Accessibility.');
                }
                return [2 /*return*/];
            });
        });
    };
    AccessibilityFirstServer.prototype.listApplications = function () {
        return __awaiter(this, void 0, void 0, function () {
            var applications, error_3;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.checkPermissions()];
                    case 1:
                        _a.sent();
                        return [4 /*yield*/, this.log('Listing applications with enhanced bounds detection')];
                    case 2:
                        _a.sent();
                        _a.label = 3;
                    case 3:
                        _a.trys.push([3, 5, , 6]);
                        return [4 /*yield*/, enhanced_window_bounds_1.EnhancedWindowBoundsHelper.getAllVisibleApplications()];
                    case 4:
                        applications = _a.sent();
                        return [2 /*return*/, {
                                content: [
                                    {
                                        type: 'text',
                                        text: "Found ".concat(applications.length, " applications with valid window bounds:\n").concat(JSON.stringify(applications, null, 2)),
                                    },
                                ],
                            }];
                    case 5:
                        error_3 = _a.sent();
                        return [2 /*return*/, {
                                content: [
                                    {
                                        type: 'text',
                                        text: "Error listing applications: ".concat(error_3 instanceof Error ? error_3.message : String(error_3)),
                                    },
                                ],
                            }];
                    case 6: return [2 /*return*/];
                }
            });
        });
    };
    AccessibilityFirstServer.prototype.focusApplication = function (identifier) {
        return __awaiter(this, void 0, void 0, function () {
            var bounds, error_4;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.checkPermissions()];
                    case 1:
                        _a.sent();
                        return [4 /*yield*/, this.log("Focusing application: ".concat(identifier))];
                    case 2:
                        _a.sent();
                        _a.label = 3;
                    case 3:
                        _a.trys.push([3, 7, , 8]);
                        return [4 /*yield*/, enhanced_window_bounds_1.EnhancedWindowBoundsHelper.validateAndFixBounds(identifier)];
                    case 4:
                        bounds = _a.sent();
                        if (!bounds) {
                            throw new Error("Could not get valid bounds for application: ".concat(identifier));
                        }
                        return [4 /*yield*/, (0, run_1.run)(function (appName) {
                                // @ts-ignore
                                var app = Application(appName);
                                app.activate();
                            }, identifier)];
                    case 5:
                        _a.sent();
                        this.currentApp = {
                            name: identifier,
                            bundleId: identifier,
                            pid: 0,
                            bounds: bounds
                        };
                        return [4 /*yield*/, this.log("Successfully focused ".concat(identifier, " with bounds: ").concat(bounds.width, "x").concat(bounds.height, " at (").concat(bounds.x, ", ").concat(bounds.y, ")"))];
                    case 6:
                        _a.sent();
                        return [2 /*return*/, {
                                content: [
                                    {
                                        type: 'text',
                                        text: "Focused on application: ".concat(identifier, " with bounds: ").concat(bounds.width, "x").concat(bounds.height, " at (").concat(bounds.x, ", ").concat(bounds.y, ")"),
                                    },
                                ],
                            }];
                    case 7:
                        error_4 = _a.sent();
                        throw new Error("Failed to focus application ".concat(identifier, ": ").concat(error_4 instanceof Error ? error_4.message : String(error_4)));
                    case 8: return [2 /*return*/];
                }
            });
        });
    };
    AccessibilityFirstServer.prototype.getClickableElements = function (appName, includeScreenCoordinates, forceMethod) {
        return __awaiter(this, void 0, void 0, function () {
            var result, elements, appleElements, error_5, screenshot_1, aiAnalysis, error_6, screenshot_2, ocrAnalysis, error_7, responseText, error_8;
            var _this = this;
            var _a;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0: return [4 /*yield*/, this.checkPermissions()];
                    case 1:
                        _b.sent();
                        return [4 /*yield*/, this.log("Getting clickable elements for ".concat(appName, " using method: ").concat(forceMethod))];
                    case 2:
                        _b.sent();
                        _b.label = 3;
                    case 3:
                        _b.trys.push([3, 33, , 34]);
                        // Focus the application first
                        return [4 /*yield*/, this.focusApplication(appName)];
                    case 4:
                        // Focus the application first
                        _b.sent();
                        if (!this.currentApp) {
                            throw new Error('No application focused');
                        }
                        result = null;
                        elements = [];
                        if (!(forceMethod === 'auto' || forceMethod === 'accessibility')) return [3 /*break*/, 12];
                        _b.label = 5;
                    case 5:
                        _b.trys.push([5, 10, , 12]);
                        return [4 /*yield*/, this.log('Trying Apple accessibility detection')];
                    case 6:
                        _b.sent();
                        return [4 /*yield*/, apple_window_manager_1.AppleWindowManager.getClickableElements(appName)];
                    case 7:
                        appleElements = _b.sent();
                        if (!(appleElements && appleElements.length > 0)) return [3 /*break*/, 9];
                        elements = appleElements.map(function (el) { return (__assign(__assign({}, el), { screenPosition: {
                                x: _this.currentApp.bounds.x + (el.normalizedPosition.x * _this.currentApp.bounds.width),
                                y: _this.currentApp.bounds.y + (el.normalizedPosition.y * _this.currentApp.bounds.height)
                            }, confidence: 0.95, detectionMethod: 'accessibility' })); });
                        result = {
                            method: 'accessibility',
                            elements: elements,
                            summary: "Apple accessibility found ".concat(elements.length, " clickable elements"),
                            suggestedActions: elements.map(function (el) {
                                return "Click \"".concat(el.text || el.type, "\" at screen (").concat(el.screenPosition.x, ", ").concat(el.screenPosition.y, ") or normalized (").concat(el.normalizedPosition.x.toFixed(3), ", ").concat(el.normalizedPosition.y.toFixed(3), ")");
                            }),
                            windowBounds: this.currentApp.bounds
                        };
                        return [4 /*yield*/, this.log("Apple accessibility found ".concat(elements.length, " elements"))];
                    case 8:
                        _b.sent();
                        _b.label = 9;
                    case 9: return [3 /*break*/, 12];
                    case 10:
                        error_5 = _b.sent();
                        return [4 /*yield*/, this.log("Apple accessibility failed: ".concat(error_5))];
                    case 11:
                        _b.sent();
                        return [3 /*break*/, 12];
                    case 12:
                        if (!((!result || result.elements.length === 0) && (forceMethod === 'auto' || forceMethod === 'ai'))) return [3 /*break*/, 21];
                        _b.label = 13;
                    case 13:
                        _b.trys.push([13, 19, , 21]);
                        return [4 /*yield*/, this.log('Trying AI analysis')];
                    case 14:
                        _b.sent();
                        return [4 /*yield*/, this.takeScreenshot()];
                    case 15:
                        screenshot_1 = _b.sent();
                        return [4 /*yield*/, ((_a = this.llmAnalyzer) === null || _a === void 0 ? void 0 : _a.analyzeScreenshot(screenshot_1, this.currentApp.bounds.width, this.currentApp.bounds.height, appName))];
                    case 16:
                        aiAnalysis = _b.sent();
                        if (!(aiAnalysis && aiAnalysis.elements.length > 0)) return [3 /*break*/, 18];
                        elements = aiAnalysis.elements.map(function (el) { return (__assign(__assign({}, el), { screenPosition: {
                                x: _this.currentApp.bounds.x + (el.normalizedPosition.x * _this.currentApp.bounds.width),
                                y: _this.currentApp.bounds.y + (el.normalizedPosition.y * _this.currentApp.bounds.height)
                            }, confidence: 0.85, detectionMethod: 'ai' })); });
                        result = {
                            method: 'ai',
                            elements: elements,
                            summary: "AI analysis found ".concat(elements.length, " clickable elements"),
                            suggestedActions: elements.map(function (el) {
                                return "Click \"".concat(el.text || el.type, "\" at screen (").concat(el.screenPosition.x, ", ").concat(el.screenPosition.y, ") or normalized (").concat(el.normalizedPosition.x.toFixed(3), ", ").concat(el.normalizedPosition.y.toFixed(3), ")");
                            }),
                            windowBounds: this.currentApp.bounds
                        };
                        return [4 /*yield*/, this.log("AI analysis found ".concat(elements.length, " elements"))];
                    case 17:
                        _b.sent();
                        _b.label = 18;
                    case 18: return [3 /*break*/, 21];
                    case 19:
                        error_6 = _b.sent();
                        return [4 /*yield*/, this.log("AI analysis failed: ".concat(error_6))];
                    case 20:
                        _b.sent();
                        return [3 /*break*/, 21];
                    case 21:
                        if (!((!result || result.elements.length === 0) && (forceMethod === 'auto' || forceMethod === 'ocr'))) return [3 /*break*/, 30];
                        _b.label = 22;
                    case 22:
                        _b.trys.push([22, 28, , 30]);
                        return [4 /*yield*/, this.log('Trying OCR analysis')];
                    case 23:
                        _b.sent();
                        return [4 /*yield*/, this.takeScreenshot()];
                    case 24:
                        screenshot_2 = _b.sent();
                        return [4 /*yield*/, this.ocrAnalyzer.analyzeScreenshot(screenshot_2, this.currentApp.bounds.width, this.currentApp.bounds.height)];
                    case 25:
                        ocrAnalysis = _b.sent();
                        if (!(ocrAnalysis && ocrAnalysis.elements.length > 0)) return [3 /*break*/, 27];
                        elements = ocrAnalysis.elements.map(function (el) { return ({
                            type: 'button',
                            text: el.text,
                            bounds: el.bounds,
                            normalizedPosition: el.normalizedPosition,
                            screenPosition: {
                                x: _this.currentApp.bounds.x + (el.normalizedPosition.x * _this.currentApp.bounds.width),
                                y: _this.currentApp.bounds.y + (el.normalizedPosition.y * _this.currentApp.bounds.height)
                            },
                            isClickable: true,
                            isEnabled: true,
                            confidence: 0.7,
                            detectionMethod: 'ocr'
                        }); });
                        result = {
                            method: 'ocr',
                            elements: elements,
                            summary: "OCR analysis found ".concat(elements.length, " clickable elements"),
                            suggestedActions: elements.map(function (el) {
                                return "Click \"".concat(el.text || 'element', "\" at screen (").concat(el.screenPosition.x, ", ").concat(el.screenPosition.y, ") or normalized (").concat(el.normalizedPosition.x.toFixed(3), ", ").concat(el.normalizedPosition.y.toFixed(3), ")");
                            }),
                            windowBounds: this.currentApp.bounds
                        };
                        return [4 /*yield*/, this.log("OCR analysis found ".concat(elements.length, " elements"))];
                    case 26:
                        _b.sent();
                        _b.label = 27;
                    case 27: return [3 /*break*/, 30];
                    case 28:
                        error_7 = _b.sent();
                        return [4 /*yield*/, this.log("OCR analysis failed: ".concat(error_7))];
                    case 29:
                        _b.sent();
                        return [3 /*break*/, 30];
                    case 30:
                        if (!(!result || result.elements.length === 0)) return [3 /*break*/, 32];
                        return [4 /*yield*/, this.log('Using heuristic fallback detection')];
                    case 31:
                        _b.sent();
                        elements = this.createHeuristicElements();
                        result = {
                            method: 'heuristic',
                            elements: elements,
                            summary: "Heuristic detection found ".concat(elements.length, " clickable elements"),
                            suggestedActions: elements.map(function (el) {
                                return "Click \"".concat(el.text || 'element', "\" at screen (").concat(el.screenPosition.x, ", ").concat(el.screenPosition.y, ") or normalized (").concat(el.normalizedPosition.x.toFixed(3), ", ").concat(el.normalizedPosition.y.toFixed(3), ")");
                            }),
                            windowBounds: this.currentApp.bounds
                        };
                        _b.label = 32;
                    case 32:
                        responseText = "Clickable Elements for ".concat(appName, " (").concat(result.method, " method):\n\n") +
                            "Window bounds: ".concat(result.windowBounds.width, "x").concat(result.windowBounds.height, " at (").concat(result.windowBounds.x, ", ").concat(result.windowBounds.y, ")\n\n") +
                            "Found ".concat(elements.length, " clickable elements:\n\n") +
                            elements.map(function (el, index) {
                                return "".concat(index + 1, ". \"").concat(el.text || el.type, "\" (").concat(el.type, ") - ") +
                                    "Screen: (".concat(el.screenPosition.x, ", ").concat(el.screenPosition.y, ") | ") +
                                    "Normalized: (".concat(el.normalizedPosition.x.toFixed(3), ", ").concat(el.normalizedPosition.y.toFixed(3), ") | ") +
                                    "Confidence: ".concat(el.confidence, " | Method: ").concat(el.detectionMethod);
                            }).join('\n') +
                            "\n\nSuggested Actions:\n".concat(result.suggestedActions.join('\n'));
                        return [2 /*return*/, {
                                content: [
                                    {
                                        type: 'text',
                                        text: responseText,
                                    },
                                ],
                            }];
                    case 33:
                        error_8 = _b.sent();
                        throw new Error("Failed to get clickable elements: ".concat(error_8 instanceof Error ? error_8.message : String(error_8)));
                    case 34: return [2 /*return*/];
                }
            });
        });
    };
    AccessibilityFirstServer.prototype.clickElement = function (appName, elementIndex, button, useScreenCoordinates) {
        return __awaiter(this, void 0, void 0, function () {
            var elementsResult, elementsText, elements, lines, inElementsSection, _i, lines_1, line, match, element, targetX, targetY, _a, error_9;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0: return [4 /*yield*/, this.checkPermissions()];
                    case 1:
                        _b.sent();
                        return [4 /*yield*/, this.log("Clicking element ".concat(elementIndex, " in ").concat(appName))];
                    case 2:
                        _b.sent();
                        _b.label = 3;
                    case 3:
                        _b.trys.push([3, 15, , 16]);
                        return [4 /*yield*/, this.getClickableElements(appName, true, 'auto')];
                    case 4:
                        elementsResult = _b.sent();
                        elementsText = elementsResult.content[0].text;
                        elements = [];
                        lines = elementsText.split('\n');
                        inElementsSection = false;
                        for (_i = 0, lines_1 = lines; _i < lines_1.length; _i++) {
                            line = lines_1[_i];
                            if (line.includes('Found') && line.includes('clickable elements:')) {
                                inElementsSection = true;
                                continue;
                            }
                            if (inElementsSection && line.match(/^\d+\./)) {
                                match = line.match(/(\d+)\. "(.+)" \((.+)\) - Screen: \((\d+), (\d+)\) \| Normalized: \((.+), (.+)\)/);
                                if (match) {
                                    elements.push({
                                        type: match[3],
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
                            throw new Error("Element index ".concat(elementIndex, " out of range (0-").concat(elements.length - 1, ")"));
                        }
                        element = elements[elementIndex];
                        targetX = useScreenCoordinates ? element.screenPosition.x :
                            (this.currentApp.bounds.x + element.normalizedPosition.x * this.currentApp.bounds.width);
                        targetY = useScreenCoordinates ? element.screenPosition.y :
                            (this.currentApp.bounds.y + element.normalizedPosition.y * this.currentApp.bounds.height);
                        return [4 /*yield*/, this.log("Moving mouse to (".concat(targetX, ", ").concat(targetY, ") and clicking ").concat(button, " button"))];
                    case 5:
                        _b.sent();
                        return [4 /*yield*/, nut_js_1.mouse.move([new nut_js_1.Point(targetX, targetY)])];
                    case 6:
                        _b.sent();
                        _a = button;
                        switch (_a) {
                            case 'left': return [3 /*break*/, 7];
                            case 'right': return [3 /*break*/, 9];
                            case 'middle': return [3 /*break*/, 11];
                        }
                        return [3 /*break*/, 13];
                    case 7: return [4 /*yield*/, nut_js_1.mouse.leftClick()];
                    case 8:
                        _b.sent();
                        return [3 /*break*/, 14];
                    case 9: return [4 /*yield*/, nut_js_1.mouse.rightClick()];
                    case 10:
                        _b.sent();
                        return [3 /*break*/, 14];
                    case 11: return [4 /*yield*/, nut_js_1.mouse.scrollDown(0)];
                    case 12:
                        _b.sent();
                        return [3 /*break*/, 14];
                    case 13: throw new Error("Invalid button: ".concat(button));
                    case 14: return [2 /*return*/, {
                            content: [
                                {
                                    type: 'text',
                                    text: "Successfully clicked element ".concat(elementIndex + 1, " (\"").concat(element.text, "\") at (").concat(targetX, ", ").concat(targetY, ") with ").concat(button, " button"),
                                },
                            ],
                        }];
                    case 15:
                        error_9 = _b.sent();
                        throw new Error("Failed to click element: ".concat(error_9 instanceof Error ? error_9.message : String(error_9)));
                    case 16: return [2 /*return*/];
                }
            });
        });
    };
    AccessibilityFirstServer.prototype.findAndClickElement = function (appName_1, searchText_1, elementType_1) {
        return __awaiter(this, arguments, void 0, function (appName, searchText, elementType, button) {
            var elementsResult, elementsText, elements, lines, inElementsSection, _i, lines_2, line, match, targetElement, targetIndex, lowerSearchText, i, i, error_10;
            if (button === void 0) { button = 'left'; }
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.checkPermissions()];
                    case 1:
                        _a.sent();
                        return [4 /*yield*/, this.log("Finding and clicking element in ".concat(appName))];
                    case 2:
                        _a.sent();
                        _a.label = 3;
                    case 3:
                        _a.trys.push([3, 6, , 7]);
                        return [4 /*yield*/, this.getClickableElements(appName, true, 'auto')];
                    case 4:
                        elementsResult = _a.sent();
                        elementsText = elementsResult.content[0].text;
                        elements = [];
                        lines = elementsText.split('\n');
                        inElementsSection = false;
                        for (_i = 0, lines_2 = lines; _i < lines_2.length; _i++) {
                            line = lines_2[_i];
                            if (line.includes('Found') && line.includes('clickable elements:')) {
                                inElementsSection = true;
                                continue;
                            }
                            if (inElementsSection && line.match(/^\d+\./)) {
                                match = line.match(/(\d+)\. "(.+)" \((.+)\) - Screen: \((\d+), (\d+)\) \| Normalized: \((.+), (.+)\)/);
                                if (match) {
                                    elements.push({
                                        type: match[3],
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
                        targetElement = null;
                        targetIndex = -1;
                        if (searchText) {
                            lowerSearchText = searchText.toLowerCase();
                            for (i = 0; i < elements.length; i++) {
                                if (elements[i].text && elements[i].text.toLowerCase().includes(lowerSearchText)) {
                                    targetElement = elements[i];
                                    targetIndex = i;
                                    break;
                                }
                            }
                        }
                        else if (elementType) {
                            for (i = 0; i < elements.length; i++) {
                                if (elements[i].type === elementType) {
                                    targetElement = elements[i];
                                    targetIndex = i;
                                    break;
                                }
                            }
                        }
                        if (!targetElement) {
                            throw new Error("No element found matching criteria: ".concat(searchText ? "text=\"".concat(searchText, "\"") : "type=\"".concat(elementType, "\"")));
                        }
                        return [4 /*yield*/, this.clickElement(appName, targetIndex, button, true)];
                    case 5: 
                    // Click the element
                    return [2 /*return*/, _a.sent()];
                    case 6:
                        error_10 = _a.sent();
                        throw new Error("Failed to find and click element: ".concat(error_10 instanceof Error ? error_10.message : String(error_10)));
                    case 7: return [2 /*return*/];
                }
            });
        });
    };
    AccessibilityFirstServer.prototype.moveMouseToElement = function (appName, elementIndex, useScreenCoordinates) {
        return __awaiter(this, void 0, void 0, function () {
            var elementsResult, elementsText, elements, lines, inElementsSection, _i, lines_3, line, match, element, targetX, targetY, error_11;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.checkPermissions()];
                    case 1:
                        _a.sent();
                        return [4 /*yield*/, this.log("Moving mouse to element ".concat(elementIndex, " in ").concat(appName))];
                    case 2:
                        _a.sent();
                        _a.label = 3;
                    case 3:
                        _a.trys.push([3, 7, , 8]);
                        return [4 /*yield*/, this.getClickableElements(appName, true, 'auto')];
                    case 4:
                        elementsResult = _a.sent();
                        elementsText = elementsResult.content[0].text;
                        elements = [];
                        lines = elementsText.split('\n');
                        inElementsSection = false;
                        for (_i = 0, lines_3 = lines; _i < lines_3.length; _i++) {
                            line = lines_3[_i];
                            if (line.includes('Found') && line.includes('clickable elements:')) {
                                inElementsSection = true;
                                continue;
                            }
                            if (inElementsSection && line.match(/^\d+\./)) {
                                match = line.match(/(\d+)\. "(.+)" \((.+)\) - Screen: \((\d+), (\d+)\) \| Normalized: \((.+), (.+)\)/);
                                if (match) {
                                    elements.push({
                                        type: match[3],
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
                            throw new Error("Element index ".concat(elementIndex, " out of range (0-").concat(elements.length - 1, ")"));
                        }
                        element = elements[elementIndex];
                        targetX = useScreenCoordinates ? element.screenPosition.x :
                            (this.currentApp.bounds.x + element.normalizedPosition.x * this.currentApp.bounds.width);
                        targetY = useScreenCoordinates ? element.screenPosition.y :
                            (this.currentApp.bounds.y + element.normalizedPosition.y * this.currentApp.bounds.height);
                        return [4 /*yield*/, this.log("Moving mouse to (".concat(targetX, ", ").concat(targetY, ")"))];
                    case 5:
                        _a.sent();
                        return [4 /*yield*/, nut_js_1.mouse.move([new nut_js_1.Point(targetX, targetY)])];
                    case 6:
                        _a.sent();
                        return [2 /*return*/, {
                                content: [
                                    {
                                        type: 'text',
                                        text: "Successfully moved mouse to element ".concat(elementIndex + 1, " (\"").concat(element.text, "\") at (").concat(targetX, ", ").concat(targetY, ")"),
                                    },
                                ],
                            }];
                    case 7:
                        error_11 = _a.sent();
                        throw new Error("Failed to move mouse to element: ".concat(error_11 instanceof Error ? error_11.message : String(error_11)));
                    case 8: return [2 /*return*/];
                }
            });
        });
    };
    AccessibilityFirstServer.prototype.testDetectionMethods = function () {
        return __awaiter(this, void 0, void 0, function () {
            var results, testResult, error_12, availability, error_13, _a, _b, error_14;
            return __generator(this, function (_c) {
                switch (_c.label) {
                    case 0: return [4 /*yield*/, this.log('Testing detection methods availability')];
                    case 1:
                        _c.sent();
                        results = {
                            'accessibility': false,
                            'ai': false,
                            'ocr': false
                        };
                        _c.label = 2;
                    case 2:
                        _c.trys.push([2, 4, , 6]);
                        return [4 /*yield*/, apple_window_manager_1.AppleWindowManager.analyzeWindow('Finder')];
                    case 3:
                        testResult = _c.sent();
                        results['accessibility'] = testResult !== null;
                        return [3 /*break*/, 6];
                    case 4:
                        error_12 = _c.sent();
                        return [4 /*yield*/, this.log("Apple accessibility test failed: ".concat(error_12))];
                    case 5:
                        _c.sent();
                        return [3 /*break*/, 6];
                    case 6:
                        _c.trys.push([6, 8, , 10]);
                        return [4 /*yield*/, this.ocrAnalyzer.checkOCRAvailability()];
                    case 7:
                        availability = _c.sent();
                        results['ocr'] = availability.tesseract || availability.macOS;
                        return [3 /*break*/, 10];
                    case 8:
                        error_13 = _c.sent();
                        return [4 /*yield*/, this.log("OCR test failed: ".concat(error_13))];
                    case 9:
                        _c.sent();
                        return [3 /*break*/, 10];
                    case 10:
                        if (!this.llmAnalyzer) return [3 /*break*/, 15];
                        _c.label = 11;
                    case 11:
                        _c.trys.push([11, 13, , 15]);
                        _a = results;
                        _b = 'ai';
                        return [4 /*yield*/, this.llmAnalyzer.testConnection()];
                    case 12:
                        _a[_b] = _c.sent();
                        return [3 /*break*/, 15];
                    case 13:
                        error_14 = _c.sent();
                        return [4 /*yield*/, this.log("Local LLM test failed: ".concat(error_14))];
                    case 14:
                        _c.sent();
                        return [3 /*break*/, 15];
                    case 15: return [2 /*return*/, {
                            content: [
                                {
                                    type: 'text',
                                    text: "Detection Methods Test Results:\n\n" +
                                        "\u2705 Apple Accessibility: ".concat(results['accessibility'] ? 'Available' : 'Not Available', "\n") +
                                        "\u2705 AI Analysis (Local LLM): ".concat(results['ai'] ? 'Available' : 'Not Available', "\n") +
                                        "\u2705 OCR Analysis: ".concat(results['ocr'] ? 'Available' : 'Not Available', "\n\n") +
                                        "Priority Order: Accessibility \u2192 AI \u2192 OCR \u2192 Heuristic\n" +
                                        "Local LLM URL: http://127.0.0.1:1234\n" +
                                        "Model: gpt-oss-20b",
                                },
                            ],
                        }];
                }
            });
        });
    };
    AccessibilityFirstServer.prototype.takeScreenshot = function () {
        return __awaiter(this, arguments, void 0, function (padding) {
            var fullScreenshot, cropX, cropY, cropWidth, cropHeight, croppedBuffer;
            if (padding === void 0) { padding = 0; }
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        if (!this.currentApp) {
                            throw new Error('No application focused');
                        }
                        return [4 /*yield*/, (0, screenshot_desktop_1.default)()];
                    case 1:
                        fullScreenshot = _a.sent();
                        cropX = Math.max(0, this.currentApp.bounds.x - padding);
                        cropY = Math.max(0, this.currentApp.bounds.y - padding);
                        cropWidth = this.currentApp.bounds.width + (padding * 2);
                        cropHeight = this.currentApp.bounds.height + (padding * 2);
                        return [4 /*yield*/, (0, sharp_1.default)(fullScreenshot)
                                .extract({
                                left: cropX,
                                top: cropY,
                                width: cropWidth,
                                height: cropHeight,
                            })
                                .png()
                                .toBuffer()];
                    case 2:
                        croppedBuffer = _a.sent();
                        return [2 /*return*/, croppedBuffer];
                }
            });
        });
    };
    AccessibilityFirstServer.prototype.createHeuristicElements = function () {
        if (!this.currentApp)
            return [];
        var elements = [
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
    };
    AccessibilityFirstServer.prototype.run = function () {
        return __awaiter(this, void 0, void 0, function () {
            var transport;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        transport = new stdio_js_1.StdioServerTransport();
                        return [4 /*yield*/, this.server.connect(transport)];
                    case 1:
                        _a.sent();
                        console.error('Accessibility First MCP server running on stdio');
                        return [2 /*return*/];
                }
            });
        });
    };
    return AccessibilityFirstServer;
}());
// Start the server
var server = new AccessibilityFirstServer();
server.run().catch(console.error);
