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
var EnhancedAnalysisServer = /** @class */ (function () {
    function EnhancedAnalysisServer(config) {
        this.currentApp = null;
        this.llmAnalyzer = null;
        this.logFile = '/Users/richardbrown/dev/mcp_eyes/test-screenshots/enhanced-analysis-debug-log.md';
        this.config = config;
        this.server = new index_js_1.Server({
            name: 'enhanced-analysis-server',
            version: '1.1.12',
        });
        // Initialize analyzers
        this.ocrAnalyzer = new ocr_analyzer_1.OCRAnalyzer();
        if (config.useLocalLLM && config.localLLMConfig) {
            this.llmAnalyzer = new local_llm_analyzer_1.LocalLLMAnalyzer(config.localLLMConfig);
        }
        this.setupToolHandlers();
    }
    EnhancedAnalysisServer.prototype.log = function (message) {
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
    EnhancedAnalysisServer.prototype.setupToolHandlers = function () {
        var _this = this;
        this.server.setRequestHandler(types_js_1.ListToolsRequestSchema, function () { return __awaiter(_this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                return [2 /*return*/, {
                        tools: [
                            {
                                name: 'analyzeWindow',
                                description: 'Comprehensive window analysis using Apple Window Manager, OCR, and/or Local LLM',
                                inputSchema: {
                                    type: 'object',
                                    properties: {
                                        appName: {
                                            type: 'string',
                                            description: 'Name of the application to analyze',
                                        },
                                        methods: {
                                            type: 'array',
                                            items: {
                                                type: 'string',
                                                enum: ['apple-window-manager', 'ocr', 'local-llm', 'all']
                                            },
                                            description: 'Analysis methods to use (default: all)',
                                            default: ['all']
                                        },
                                        includeBoundingBoxes: {
                                            type: 'boolean',
                                            description: 'Whether to include bounding box information',
                                            default: true
                                        }
                                    },
                                    required: ['appName'],
                                },
                            },
                            {
                                name: 'findClickableElements',
                                description: 'Find all clickable elements in a window with detailed analysis',
                                inputSchema: {
                                    type: 'object',
                                    properties: {
                                        appName: {
                                            type: 'string',
                                            description: 'Name of the application to analyze',
                                        },
                                        elementTypes: {
                                            type: 'array',
                                            items: {
                                                type: 'string',
                                                enum: ['button', 'text', 'input', 'link', 'image', 'menu', 'checkbox', 'radio', 'slider']
                                            },
                                            description: 'Types of elements to find (default: all)',
                                        },
                                        searchText: {
                                            type: 'string',
                                            description: 'Search for elements containing specific text',
                                        }
                                    },
                                    required: ['appName'],
                                },
                            },
                            {
                                name: 'getElementChoices',
                                description: 'Get a list of clickable elements with coordinates for user selection',
                                inputSchema: {
                                    type: 'object',
                                    properties: {
                                        appName: {
                                            type: 'string',
                                            description: 'Name of the application to analyze',
                                        },
                                        filterByText: {
                                            type: 'string',
                                            description: 'Filter elements by text content',
                                        },
                                        filterByType: {
                                            type: 'string',
                                            description: 'Filter elements by type',
                                        }
                                    },
                                    required: ['appName'],
                                },
                            },
                            {
                                name: 'clickElementByChoice',
                                description: 'Click an element from the choices provided by getElementChoices',
                                inputSchema: {
                                    type: 'object',
                                    properties: {
                                        appName: {
                                            type: 'string',
                                            description: 'Name of the application',
                                        },
                                        elementIndex: {
                                            type: 'number',
                                            description: 'Index of the element from getElementChoices result',
                                        },
                                        button: {
                                            type: 'string',
                                            enum: ['left', 'right', 'middle'],
                                            description: 'Mouse button to click',
                                            default: 'left'
                                        }
                                    },
                                    required: ['appName', 'elementIndex'],
                                },
                            },
                            {
                                name: 'screenshotWithAnalysis',
                                description: 'Take screenshot and analyze it with all available methods',
                                inputSchema: {
                                    type: 'object',
                                    properties: {
                                        appName: {
                                            type: 'string',
                                            description: 'Name of the application to screenshot',
                                        },
                                        padding: {
                                            type: 'number',
                                            description: 'Padding around the window in pixels',
                                            default: 10
                                        },
                                        includeImage: {
                                            type: 'boolean',
                                            description: 'Whether to include the screenshot image in response',
                                            default: true
                                        },
                                        analysisMethods: {
                                            type: 'array',
                                            items: {
                                                type: 'string',
                                                enum: ['apple-window-manager', 'ocr', 'local-llm', 'all']
                                            },
                                            description: 'Analysis methods to use',
                                            default: ['all']
                                        }
                                    },
                                    required: ['appName'],
                                },
                            },
                            {
                                name: 'testAnalysisMethods',
                                description: 'Test which analysis methods are available and working',
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
                        _c.trys.push([1, 20, , 21]);
                        _b = name;
                        switch (_b) {
                            case 'analyzeWindow': return [3 /*break*/, 2];
                            case 'findClickableElements': return [3 /*break*/, 4];
                            case 'getElementChoices': return [3 /*break*/, 6];
                            case 'clickElementByChoice': return [3 /*break*/, 8];
                            case 'screenshotWithAnalysis': return [3 /*break*/, 10];
                            case 'testAnalysisMethods': return [3 /*break*/, 12];
                            case 'listApplications': return [3 /*break*/, 14];
                            case 'focusApplication': return [3 /*break*/, 16];
                        }
                        return [3 /*break*/, 18];
                    case 2: return [4 /*yield*/, this.analyzeWindow(args === null || args === void 0 ? void 0 : args.appName, (args === null || args === void 0 ? void 0 : args.methods) || ['all'], (args === null || args === void 0 ? void 0 : args.includeBoundingBoxes) !== false)];
                    case 3: return [2 /*return*/, _c.sent()];
                    case 4: return [4 /*yield*/, this.findClickableElements(args === null || args === void 0 ? void 0 : args.appName, args === null || args === void 0 ? void 0 : args.elementTypes, args === null || args === void 0 ? void 0 : args.searchText)];
                    case 5: return [2 /*return*/, _c.sent()];
                    case 6: return [4 /*yield*/, this.getElementChoices(args === null || args === void 0 ? void 0 : args.appName, args === null || args === void 0 ? void 0 : args.filterByText, args === null || args === void 0 ? void 0 : args.filterByType)];
                    case 7: return [2 /*return*/, _c.sent()];
                    case 8: return [4 /*yield*/, this.clickElementByChoice(args === null || args === void 0 ? void 0 : args.appName, args === null || args === void 0 ? void 0 : args.elementIndex, (args === null || args === void 0 ? void 0 : args.button) || 'left')];
                    case 9: return [2 /*return*/, _c.sent()];
                    case 10: return [4 /*yield*/, this.screenshotWithAnalysis(args === null || args === void 0 ? void 0 : args.appName, (args === null || args === void 0 ? void 0 : args.padding) || 10, (args === null || args === void 0 ? void 0 : args.includeImage) !== false, (args === null || args === void 0 ? void 0 : args.analysisMethods) || ['all'])];
                    case 11: return [2 /*return*/, _c.sent()];
                    case 12: return [4 /*yield*/, this.testAnalysisMethods()];
                    case 13: return [2 /*return*/, _c.sent()];
                    case 14: return [4 /*yield*/, this.listApplications()];
                    case 15: return [2 /*return*/, _c.sent()];
                    case 16: return [4 /*yield*/, this.focusApplication(args === null || args === void 0 ? void 0 : args.identifier)];
                    case 17: return [2 /*return*/, _c.sent()];
                    case 18: throw new Error("Unknown tool: ".concat(name));
                    case 19: return [3 /*break*/, 21];
                    case 20:
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
                    case 21: return [2 /*return*/];
                }
            });
        }); });
    };
    EnhancedAnalysisServer.prototype.checkPermissions = function () {
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
    EnhancedAnalysisServer.prototype.listApplications = function () {
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
    EnhancedAnalysisServer.prototype.focusApplication = function (identifier) {
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
    EnhancedAnalysisServer.prototype.analyzeWindow = function (appName, methods, includeBoundingBoxes) {
        return __awaiter(this, void 0, void 0, function () {
            var results, appleAnalysis, error_5, screenshot_1, ocrAnalysis, error_6, screenshot_2, llmAnalysis, error_7, combinedElements, combinedActions, error_8;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.checkPermissions()];
                    case 1:
                        _a.sent();
                        return [4 /*yield*/, this.log("Analyzing window for ".concat(appName, " using methods: ").concat(methods.join(', ')))];
                    case 2:
                        _a.sent();
                        _a.label = 3;
                    case 3:
                        _a.trys.push([3, 22, , 23]);
                        // Focus the application first
                        return [4 /*yield*/, this.focusApplication(appName)];
                    case 4:
                        // Focus the application first
                        _a.sent();
                        if (!this.currentApp) {
                            throw new Error('No application focused');
                        }
                        results = [];
                        if (!(methods.includes('all') || methods.includes('apple-window-manager'))) return [3 /*break*/, 9];
                        if (!this.config.useAppleWindowManager) return [3 /*break*/, 9];
                        _a.label = 5;
                    case 5:
                        _a.trys.push([5, 7, , 9]);
                        return [4 /*yield*/, apple_window_manager_1.AppleWindowManager.analyzeWindow(appName)];
                    case 6:
                        appleAnalysis = _a.sent();
                        if (appleAnalysis) {
                            results.push({
                                method: 'apple-window-manager',
                                elements: appleAnalysis.elements,
                                summary: appleAnalysis.summary,
                                suggestedActions: appleAnalysis.suggestedActions,
                                boundingBoxes: includeBoundingBoxes ? appleAnalysis.elements.map(function (el) { return ({
                                    element: el,
                                    box: el.bounds
                                }); }) : [],
                                confidence: 0.95
                            });
                        }
                        return [3 /*break*/, 9];
                    case 7:
                        error_5 = _a.sent();
                        return [4 /*yield*/, this.log("Apple Window Manager analysis failed: ".concat(error_5))];
                    case 8:
                        _a.sent();
                        return [3 /*break*/, 9];
                    case 9:
                        if (!(methods.includes('all') || methods.includes('ocr'))) return [3 /*break*/, 15];
                        if (!this.config.useOCR) return [3 /*break*/, 15];
                        _a.label = 10;
                    case 10:
                        _a.trys.push([10, 13, , 15]);
                        return [4 /*yield*/, this.takeScreenshot()];
                    case 11:
                        screenshot_1 = _a.sent();
                        return [4 /*yield*/, this.ocrAnalyzer.analyzeScreenshot(screenshot_1, this.currentApp.bounds.width, this.currentApp.bounds.height)];
                    case 12:
                        ocrAnalysis = _a.sent();
                        results.push({
                            method: 'ocr',
                            elements: ocrAnalysis.elements,
                            summary: ocrAnalysis.summary,
                            suggestedActions: ocrAnalysis.suggestedActions,
                            boundingBoxes: includeBoundingBoxes ? ocrAnalysis.elements.map(function (el) { return ({
                                element: el,
                                box: el.bounds
                            }); }) : [],
                            confidence: 0.8
                        });
                        return [3 /*break*/, 15];
                    case 13:
                        error_6 = _a.sent();
                        return [4 /*yield*/, this.log("OCR analysis failed: ".concat(error_6))];
                    case 14:
                        _a.sent();
                        return [3 /*break*/, 15];
                    case 15:
                        if (!(methods.includes('all') || methods.includes('local-llm'))) return [3 /*break*/, 21];
                        if (!(this.config.useLocalLLM && this.llmAnalyzer)) return [3 /*break*/, 21];
                        _a.label = 16;
                    case 16:
                        _a.trys.push([16, 19, , 21]);
                        return [4 /*yield*/, this.takeScreenshot()];
                    case 17:
                        screenshot_2 = _a.sent();
                        return [4 /*yield*/, this.llmAnalyzer.analyzeScreenshot(screenshot_2, this.currentApp.bounds.width, this.currentApp.bounds.height, appName)];
                    case 18:
                        llmAnalysis = _a.sent();
                        results.push({
                            method: 'local-llm',
                            elements: llmAnalysis.elements,
                            summary: llmAnalysis.summary,
                            suggestedActions: llmAnalysis.suggestedActions,
                            boundingBoxes: includeBoundingBoxes ? llmAnalysis.boundingBoxes : [],
                            confidence: 0.9
                        });
                        return [3 /*break*/, 21];
                    case 19:
                        error_7 = _a.sent();
                        return [4 /*yield*/, this.log("Local LLM analysis failed: ".concat(error_7))];
                    case 20:
                        _a.sent();
                        return [3 /*break*/, 21];
                    case 21:
                        combinedElements = this.combineAnalysisResults(results);
                        combinedActions = this.combineSuggestedActions(results);
                        return [2 /*return*/, {
                                content: [
                                    {
                                        type: 'text',
                                        text: "Window Analysis Results for ".concat(appName, ":\n\nMethods Used: ").concat(results.map(function (r) { return r.method; }).join(', '), "\n\nCombined Summary:\n").concat(combinedActions.join('\n'), "\n\nDetailed Results:\n").concat(JSON.stringify(results, null, 2)),
                                    },
                                ],
                            }];
                    case 22:
                        error_8 = _a.sent();
                        throw new Error("Window analysis failed: ".concat(error_8 instanceof Error ? error_8.message : String(error_8)));
                    case 23: return [2 /*return*/];
                }
            });
        });
    };
    EnhancedAnalysisServer.prototype.findClickableElements = function (appName, elementTypes, searchText) {
        return __awaiter(this, void 0, void 0, function () {
            var analysis, analysisText, resultsMatch, results, elements_1, lowerSearchText_1, error_9;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.checkPermissions()];
                    case 1:
                        _a.sent();
                        return [4 /*yield*/, this.log("Finding clickable elements in ".concat(appName))];
                    case 2:
                        _a.sent();
                        _a.label = 3;
                    case 3:
                        _a.trys.push([3, 5, , 6]);
                        return [4 /*yield*/, this.analyzeWindow(appName, ['all'], true)];
                    case 4:
                        analysis = _a.sent();
                        analysisText = analysis.content[0].text;
                        resultsMatch = analysisText.match(/Detailed Results:\n(.*)/s);
                        if (!resultsMatch) {
                            throw new Error('Failed to parse analysis results');
                        }
                        results = JSON.parse(resultsMatch[1]);
                        elements_1 = [];
                        // Combine elements from all methods
                        results.forEach(function (result) {
                            elements_1 = elements_1.concat(result.elements);
                        });
                        // Filter by type if specified
                        if (elementTypes && elementTypes.length > 0) {
                            elements_1 = elements_1.filter(function (el) { return elementTypes.includes(el.type); });
                        }
                        // Filter by text if specified
                        if (searchText) {
                            lowerSearchText_1 = searchText.toLowerCase();
                            elements_1 = elements_1.filter(function (el) {
                                return el.text && el.text.toLowerCase().includes(lowerSearchText_1);
                            });
                        }
                        // Filter to only clickable elements
                        elements_1 = elements_1.filter(function (el) { return el.isClickable !== false; });
                        return [2 /*return*/, {
                                content: [
                                    {
                                        type: 'text',
                                        text: "Found ".concat(elements_1.length, " clickable elements in ").concat(appName, ":\n\n").concat(elements_1.map(function (el, index) { var _a, _b, _c, _d; return "".concat(index + 1, ". ").concat(el.text || el.type, " (").concat(el.type, ") at (").concat(((_b = (_a = el.normalizedPosition) === null || _a === void 0 ? void 0 : _a.x) === null || _b === void 0 ? void 0 : _b.toFixed(3)) || 0, ", ").concat(((_d = (_c = el.normalizedPosition) === null || _c === void 0 ? void 0 : _c.y) === null || _d === void 0 ? void 0 : _d.toFixed(3)) || 0, ")"); }).join('\n')),
                                    },
                                ],
                            }];
                    case 5:
                        error_9 = _a.sent();
                        throw new Error("Failed to find clickable elements: ".concat(error_9 instanceof Error ? error_9.message : String(error_9)));
                    case 6: return [2 /*return*/];
                }
            });
        });
    };
    EnhancedAnalysisServer.prototype.getElementChoices = function (appName, filterByText, filterByType) {
        return __awaiter(this, void 0, void 0, function () {
            var elementsResult, elementsText, elements_2, lines, error_10;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.checkPermissions()];
                    case 1:
                        _a.sent();
                        return [4 /*yield*/, this.log("Getting element choices for ".concat(appName))];
                    case 2:
                        _a.sent();
                        _a.label = 3;
                    case 3:
                        _a.trys.push([3, 5, , 6]);
                        return [4 /*yield*/, this.findClickableElements(appName, filterByType ? [filterByType] : undefined, filterByText)];
                    case 4:
                        elementsResult = _a.sent();
                        elementsText = elementsResult.content[0].text;
                        elements_2 = [];
                        lines = elementsText.split('\n').slice(1);
                        lines.forEach(function (line, index) {
                            if (line.trim()) {
                                var match = line.match(/(\d+)\. (.+) \((.+)\) at \((.+), (.+)\)/);
                                if (match) {
                                    elements_2.push({
                                        index: parseInt(match[1]) - 1,
                                        text: match[2],
                                        type: match[3],
                                        x: parseFloat(match[4]),
                                        y: parseFloat(match[5])
                                    });
                                }
                            }
                        });
                        return [2 /*return*/, {
                                content: [
                                    {
                                        type: 'text',
                                        text: "Element Choices for ".concat(appName, ":\n\n").concat(elements_2.map(function (el) {
                                            return "".concat(el.index + 1, ". \"").concat(el.text, "\" (").concat(el.type, ") - Click at (").concat(el.x, ", ").concat(el.y, ")");
                                        }).join('\n'), "\n\nUse clickElementByChoice with the element index to click an element."),
                                    },
                                ],
                            }];
                    case 5:
                        error_10 = _a.sent();
                        throw new Error("Failed to get element choices: ".concat(error_10 instanceof Error ? error_10.message : String(error_10)));
                    case 6: return [2 /*return*/];
                }
            });
        });
    };
    EnhancedAnalysisServer.prototype.clickElementByChoice = function (appName, elementIndex, button) {
        return __awaiter(this, void 0, void 0, function () {
            var choicesResult, choicesText, lines, targetLine, match, x, y, screenX_1, screenY_1, _a, error_11;
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
                        return [4 /*yield*/, this.getElementChoices(appName)];
                    case 4:
                        choicesResult = _b.sent();
                        choicesText = choicesResult.content[0].text;
                        lines = choicesText.split('\n').slice(1);
                        targetLine = lines[elementIndex];
                        if (!targetLine) {
                            throw new Error("Element index ".concat(elementIndex, " not found"));
                        }
                        match = targetLine.match(/(\d+)\. ".+" \((.+)\) - Click at \((.+), (.+)\)/);
                        if (!match) {
                            throw new Error("Failed to parse element coordinates");
                        }
                        x = parseFloat(match[3]);
                        y = parseFloat(match[4]);
                        // Focus the application
                        return [4 /*yield*/, this.focusApplication(appName)];
                    case 5:
                        // Focus the application
                        _b.sent();
                        if (!this.currentApp) {
                            throw new Error('No application focused');
                        }
                        screenX_1 = this.currentApp.bounds.x + (x * this.currentApp.bounds.width);
                        screenY_1 = this.currentApp.bounds.y + (y * this.currentApp.bounds.height);
                        return [4 /*yield*/, nut_js_1.mouse.move([new nut_js_1.Point(screenX_1, screenY_1)])];
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
                                    text: "Successfully clicked element ".concat(elementIndex, " (\"").concat(match[2], "\") at (").concat(x.toFixed(3), ", ").concat(y.toFixed(3), ") with ").concat(button, " button"),
                                },
                            ],
                        }];
                    case 15:
                        error_11 = _b.sent();
                        throw new Error("Failed to click element: ".concat(error_11 instanceof Error ? error_11.message : String(error_11)));
                    case 16: return [2 /*return*/];
                }
            });
        });
    };
    EnhancedAnalysisServer.prototype.screenshotWithAnalysis = function (appName, padding, includeImage, analysisMethods) {
        return __awaiter(this, void 0, void 0, function () {
            var screenshot_3, base64Image, analysis, result, error_12;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.checkPermissions()];
                    case 1:
                        _a.sent();
                        return [4 /*yield*/, this.log("Taking screenshot with analysis for ".concat(appName))];
                    case 2:
                        _a.sent();
                        _a.label = 3;
                    case 3:
                        _a.trys.push([3, 7, , 8]);
                        // Focus the application
                        return [4 /*yield*/, this.focusApplication(appName)];
                    case 4:
                        // Focus the application
                        _a.sent();
                        if (!this.currentApp) {
                            throw new Error('No application focused');
                        }
                        return [4 /*yield*/, this.takeScreenshot(padding)];
                    case 5:
                        screenshot_3 = _a.sent();
                        base64Image = screenshot_3.toString('base64');
                        return [4 /*yield*/, this.analyzeWindow(appName, analysisMethods, true)];
                    case 6:
                        analysis = _a.sent();
                        result = {
                            content: [
                                {
                                    type: 'text',
                                    text: "Screenshot with analysis for ".concat(appName, " (").concat(this.currentApp.bounds.width, "x").concat(this.currentApp.bounds.height, "px with ").concat(padding, "px padding)"),
                                },
                            ],
                        };
                        if (includeImage) {
                            result.content.push({
                                type: 'image',
                                data: base64Image,
                                mimeType: 'image/png',
                            });
                        }
                        result.content.push({
                            type: 'text',
                            text: "\nAnalysis Results:\n".concat(analysis.content[0].text),
                        });
                        return [2 /*return*/, result];
                    case 7:
                        error_12 = _a.sent();
                        throw new Error("Screenshot with analysis failed: ".concat(error_12 instanceof Error ? error_12.message : String(error_12)));
                    case 8: return [2 /*return*/];
                }
            });
        });
    };
    EnhancedAnalysisServer.prototype.testAnalysisMethods = function () {
        return __awaiter(this, void 0, void 0, function () {
            var results, testResult, error_13, availability, error_14, _a, _b, error_15;
            return __generator(this, function (_c) {
                switch (_c.label) {
                    case 0: return [4 /*yield*/, this.log('Testing analysis methods availability')];
                    case 1:
                        _c.sent();
                        results = {
                            'apple-window-manager': false,
                            'ocr': false,
                            'local-llm': false
                        };
                        if (!this.config.useAppleWindowManager) return [3 /*break*/, 6];
                        _c.label = 2;
                    case 2:
                        _c.trys.push([2, 4, , 6]);
                        return [4 /*yield*/, apple_window_manager_1.AppleWindowManager.analyzeWindow('Finder')];
                    case 3:
                        testResult = _c.sent();
                        results['apple-window-manager'] = testResult !== null;
                        return [3 /*break*/, 6];
                    case 4:
                        error_13 = _c.sent();
                        return [4 /*yield*/, this.log("Apple Window Manager test failed: ".concat(error_13))];
                    case 5:
                        _c.sent();
                        return [3 /*break*/, 6];
                    case 6:
                        if (!this.config.useOCR) return [3 /*break*/, 11];
                        _c.label = 7;
                    case 7:
                        _c.trys.push([7, 9, , 11]);
                        return [4 /*yield*/, this.ocrAnalyzer.checkOCRAvailability()];
                    case 8:
                        availability = _c.sent();
                        results['ocr'] = availability.tesseract || availability.macOS;
                        return [3 /*break*/, 11];
                    case 9:
                        error_14 = _c.sent();
                        return [4 /*yield*/, this.log("OCR test failed: ".concat(error_14))];
                    case 10:
                        _c.sent();
                        return [3 /*break*/, 11];
                    case 11:
                        if (!(this.config.useLocalLLM && this.llmAnalyzer)) return [3 /*break*/, 16];
                        _c.label = 12;
                    case 12:
                        _c.trys.push([12, 14, , 16]);
                        _a = results;
                        _b = 'local-llm';
                        return [4 /*yield*/, this.llmAnalyzer.testConnection()];
                    case 13:
                        _a[_b] = _c.sent();
                        return [3 /*break*/, 16];
                    case 14:
                        error_15 = _c.sent();
                        return [4 /*yield*/, this.log("Local LLM test failed: ".concat(error_15))];
                    case 15:
                        _c.sent();
                        return [3 /*break*/, 16];
                    case 16: return [2 /*return*/, {
                            content: [
                                {
                                    type: 'text',
                                    text: "Analysis Methods Test Results:\n\n".concat(Object.entries(results).map(function (_a) {
                                        var method = _a[0], available = _a[1];
                                        return "".concat(method, ": ").concat(available ? '✅ Available' : '❌ Not Available');
                                    }).join('\n'), "\n\nConfiguration:\n").concat(JSON.stringify(this.config, null, 2)),
                                },
                            ],
                        }];
                }
            });
        });
    };
    EnhancedAnalysisServer.prototype.takeScreenshot = function () {
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
    EnhancedAnalysisServer.prototype.combineAnalysisResults = function (results) {
        var combinedElements = [];
        var seenElements = new Set();
        results.forEach(function (result) {
            result.elements.forEach(function (element) {
                var _a, _b;
                var key = "".concat(element.type, "-").concat(element.text, "-").concat((_a = element.normalizedPosition) === null || _a === void 0 ? void 0 : _a.x, "-").concat((_b = element.normalizedPosition) === null || _b === void 0 ? void 0 : _b.y);
                if (!seenElements.has(key)) {
                    seenElements.add(key);
                    combinedElements.push(element);
                }
            });
        });
        return combinedElements;
    };
    EnhancedAnalysisServer.prototype.combineSuggestedActions = function (results) {
        var combinedActions = [];
        var seenActions = new Set();
        results.forEach(function (result) {
            result.suggestedActions.forEach(function (action) {
                if (!seenActions.has(action)) {
                    seenActions.add(action);
                    combinedActions.push(action);
                }
            });
        });
        return combinedActions;
    };
    EnhancedAnalysisServer.prototype.run = function () {
        return __awaiter(this, void 0, void 0, function () {
            var transport;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        transport = new stdio_js_1.StdioServerTransport();
                        return [4 /*yield*/, this.server.connect(transport)];
                    case 1:
                        _a.sent();
                        console.error('Enhanced Analysis MCP server running on stdio');
                        return [2 /*return*/];
                }
            });
        });
    };
    return EnhancedAnalysisServer;
}());
// Start the server with default configuration
var defaultConfig = {
    useAppleWindowManager: true,
    useOCR: true,
    useLocalLLM: true,
    localLLMConfig: {
        baseUrl: 'http://127.0.0.1:1234',
        model: 'gpt-oss-20b',
        maxTokens: 2000,
        temperature: 0.1
    }
};
var server = new EnhancedAnalysisServer(defaultConfig);
server.run().catch(console.error);
