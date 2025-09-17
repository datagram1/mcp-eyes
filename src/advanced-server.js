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
var screenshot_desktop_1 = require("screenshot-desktop");
var nut_js_1 = require("@nut-tree-fork/nut-js");
var run_1 = require("@jxa/run");
var sharp_1 = require("sharp");
var node_mac_permissions_1 = require("node-mac-permissions");
var apple_window_manager_js_1 = require("./apple-window-manager.js");
var ocr_analyzer_js_1 = require("./ocr-analyzer.js");
var local_llm_analyzer_js_1 = require("./local-llm-analyzer.js");
var web_content_detector_js_1 = require("./web-content-detector.js");
var AdvancedServer = /** @class */ (function () {
    function AdvancedServer() {
        this.currentApp = null;
        this.server = new index_js_1.Server({
            name: 'mcp-eyes-advanced',
            version: '1.1.12',
        }, {
            capabilities: {
                tools: {},
            },
        });
        this.appleWindowManager = new apple_window_manager_js_1.AppleWindowManager();
        this.ocrAnalyzer = new ocr_analyzer_js_1.OCRAnalyzer();
        this.localLLMAnalyzer = new local_llm_analyzer_js_1.LocalLLMAnalyzer();
        this.webContentDetector = new web_content_detector_js_1.WebContentDetector();
        this.setupToolHandlers();
        this.setupErrorHandling();
    }
    AdvancedServer.prototype.setupErrorHandling = function () {
        var _this = this;
        this.server.onerror = function (error) {
            console.error('[MCP Error]', error);
        };
        process.on('SIGINT', function () { return __awaiter(_this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.server.close()];
                    case 1:
                        _a.sent();
                        process.exit(0);
                        return [2 /*return*/];
                }
            });
        }); });
    };
    AdvancedServer.prototype.setupToolHandlers = function () {
        var _this = this;
        this.server.setRequestHandler(types_js_1.ListToolsRequestSchema, function () { return __awaiter(_this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                return [2 /*return*/, {
                        tools: [
                            // Basic Tools
                            {
                                name: 'listApplications',
                                description: 'List all running applications with their window bounds and identifiers.',
                                inputSchema: {
                                    type: 'object',
                                    properties: {},
                                },
                            },
                            {
                                name: 'focusApplication',
                                description: 'Focus on a specific application by bundle ID or PID.',
                                inputSchema: {
                                    type: 'object',
                                    properties: {
                                        identifier: {
                                            type: 'string',
                                            description: 'Bundle ID (e.g., com.apple.Safari) or PID of the application to focus',
                                        },
                                    },
                                    required: ['identifier'],
                                },
                            },
                            {
                                name: 'click',
                                description: 'Perform a mouse click at specified coordinates relative to the focused app window.',
                                inputSchema: {
                                    type: 'object',
                                    properties: {
                                        x: {
                                            type: 'number',
                                            description: 'X coordinate relative to the app window (0-1 normalized)',
                                            minimum: 0,
                                            maximum: 1,
                                        },
                                        y: {
                                            type: 'number',
                                            description: 'Y coordinate relative to the app window (0-1 normalized)',
                                            minimum: 0,
                                            maximum: 1,
                                        },
                                        button: {
                                            type: 'string',
                                            enum: ['left', 'right', 'middle'],
                                            description: 'Mouse button to click',
                                            default: 'left',
                                        },
                                    },
                                    required: ['x', 'y'],
                                },
                            },
                            {
                                name: 'moveMouse',
                                description: 'Move mouse to specified coordinates relative to the focused app window.',
                                inputSchema: {
                                    type: 'object',
                                    properties: {
                                        x: {
                                            type: 'number',
                                            description: 'X coordinate relative to the app window (0-1 normalized)',
                                            minimum: 0,
                                            maximum: 1,
                                        },
                                        y: {
                                            type: 'number',
                                            description: 'Y coordinate relative to the app window (0-1 normalized)',
                                            minimum: 0,
                                            maximum: 1,
                                        },
                                    },
                                    required: ['x', 'y'],
                                },
                            },
                            {
                                name: 'screenshot',
                                description: 'Take a screenshot of the focused application window.',
                                inputSchema: {
                                    type: 'object',
                                    properties: {
                                        padding: {
                                            type: 'number',
                                            description: 'Padding around the window in pixels',
                                            default: 10,
                                        },
                                        format: {
                                            type: 'string',
                                            enum: ['png', 'jpg'],
                                            description: 'Image format (png or jpg)',
                                            default: 'png',
                                        },
                                        quality: {
                                            type: 'number',
                                            description: 'JPEG quality (1-100, only applies to JPG format)',
                                            default: 90,
                                        },
                                    },
                                },
                            },
                            // Apple Accessibility Tools
                            {
                                name: 'getClickableElements',
                                description: 'Get all clickable elements in the focused application using Apple Accessibility.',
                                inputSchema: {
                                    type: 'object',
                                    properties: {},
                                },
                            },
                            {
                                name: 'clickElement',
                                description: 'Click a specific element by index from getClickableElements.',
                                inputSchema: {
                                    type: 'object',
                                    properties: {
                                        elementIndex: {
                                            type: 'number',
                                            description: 'Index of the element to click (from getClickableElements)',
                                        },
                                    },
                                    required: ['elementIndex'],
                                },
                            },
                            // AI Analysis Tools
                            {
                                name: 'analyzeImageWithAI',
                                description: 'Analyze a screenshot using AI to find UI elements and their locations.',
                                inputSchema: {
                                    type: 'object',
                                    properties: {
                                        prompt: {
                                            type: 'string',
                                            description: 'What to look for in the image (e.g., "Find the Update Available button")',
                                        },
                                        padding: {
                                            type: 'number',
                                            description: 'Padding around the window in pixels',
                                            default: 10,
                                        },
                                    },
                                    required: ['prompt'],
                                },
                            },
                            {
                                name: 'findAndClickElement',
                                description: 'Find and click an element using AI analysis with fallback methods.',
                                inputSchema: {
                                    type: 'object',
                                    properties: {
                                        elementDescription: {
                                            type: 'string',
                                            description: 'Description of the element to find and click',
                                        },
                                        padding: {
                                            type: 'number',
                                            description: 'Padding around the window in pixels',
                                            default: 10,
                                        },
                                    },
                                    required: ['elementDescription'],
                                },
                            },
                            // OCR Tools
                            {
                                name: 'analyzeImageWithOCR',
                                description: 'Analyze a screenshot using OCR to find text and buttons.',
                                inputSchema: {
                                    type: 'object',
                                    properties: {
                                        padding: {
                                            type: 'number',
                                            description: 'Padding around the window in pixels',
                                            default: 10,
                                        },
                                    },
                                },
                            },
                            // Web Content Tools
                            {
                                name: 'getWebElements',
                                description: 'Get web elements (links, buttons, inputs) from the focused browser.',
                                inputSchema: {
                                    type: 'object',
                                    properties: {
                                        padding: {
                                            type: 'number',
                                            description: 'Padding around the window in pixels',
                                            default: 10,
                                        },
                                    },
                                },
                            },
                            {
                                name: 'clickWebElement',
                                description: 'Click a web element by index from getWebElements.',
                                inputSchema: {
                                    type: 'object',
                                    properties: {
                                        elementIndex: {
                                            type: 'number',
                                            description: 'Index of the web element to click',
                                        },
                                    },
                                    required: ['elementIndex'],
                                },
                            },
                            {
                                name: 'findAndClickWebElement',
                                description: 'Find and click a web element by text or description.',
                                inputSchema: {
                                    type: 'object',
                                    properties: {
                                        elementDescription: {
                                            type: 'string',
                                            description: 'Text or description of the web element to find',
                                        },
                                        padding: {
                                            type: 'number',
                                            description: 'Padding around the window in pixels',
                                            default: 10,
                                        },
                                    },
                                    required: ['elementDescription'],
                                },
                            },
                            // Text Input Tools
                            {
                                name: 'typeText',
                                description: 'Type text into a focused input field.',
                                inputSchema: {
                                    type: 'object',
                                    properties: {
                                        appName: {
                                            type: 'string',
                                            description: 'Name of the application to type into',
                                        },
                                        elementIndex: {
                                            type: 'number',
                                            description: 'Index of the input element (from getWebElements)',
                                        },
                                        text: {
                                            type: 'string',
                                            description: 'Text to type',
                                        },
                                        clearFirst: {
                                            type: 'boolean',
                                            description: 'Clear existing text before typing',
                                            default: true,
                                        },
                                    },
                                    required: ['appName', 'elementIndex', 'text'],
                                },
                            },
                            {
                                name: 'googleSearch',
                                description: 'Perform a complete Google search workflow.',
                                inputSchema: {
                                    type: 'object',
                                    properties: {
                                        appName: {
                                            type: 'string',
                                            description: 'Name of the browser application',
                                            default: 'Google Chrome',
                                        },
                                        searchQuery: {
                                            type: 'string',
                                            description: 'Search query to type',
                                        },
                                        searchButtonText: {
                                            type: 'string',
                                            description: 'Text of the search button to click',
                                            default: 'Google Search',
                                        },
                                    },
                                    required: ['searchQuery'],
                                },
                            },
                            // Utility Tools
                            {
                                name: 'testAnalysisMethods',
                                description: 'Test all analysis methods (Accessibility, AI, OCR) on the current screen.',
                                inputSchema: {
                                    type: 'object',
                                    properties: {
                                        padding: {
                                            type: 'number',
                                            description: 'Padding around the window in pixels',
                                            default: 10,
                                        },
                                    },
                                },
                            },
                            {
                                name: 'getAvailableLLMProviders',
                                description: 'Get list of available LLM providers and their status.',
                                inputSchema: {
                                    type: 'object',
                                    properties: {},
                                },
                            },
                        ],
                    }];
            });
        }); });
        this.server.setRequestHandler(types_js_1.CallToolRequestSchema, function (request) { return __awaiter(_this, void 0, void 0, function () {
            var _a, name, args, _b, error_1, errorMessage;
            return __generator(this, function (_c) {
                switch (_c.label) {
                    case 0:
                        _a = request.params, name = _a.name, args = _a.arguments;
                        _c.label = 1;
                    case 1:
                        _c.trys.push([1, 38, , 39]);
                        _b = name;
                        switch (_b) {
                            case 'listApplications': return [3 /*break*/, 2];
                            case 'focusApplication': return [3 /*break*/, 4];
                            case 'click': return [3 /*break*/, 6];
                            case 'moveMouse': return [3 /*break*/, 8];
                            case 'screenshot': return [3 /*break*/, 10];
                            case 'getClickableElements': return [3 /*break*/, 12];
                            case 'clickElement': return [3 /*break*/, 14];
                            case 'analyzeImageWithAI': return [3 /*break*/, 16];
                            case 'findAndClickElement': return [3 /*break*/, 18];
                            case 'analyzeImageWithOCR': return [3 /*break*/, 20];
                            case 'getWebElements': return [3 /*break*/, 22];
                            case 'clickWebElement': return [3 /*break*/, 24];
                            case 'findAndClickWebElement': return [3 /*break*/, 26];
                            case 'typeText': return [3 /*break*/, 28];
                            case 'googleSearch': return [3 /*break*/, 30];
                            case 'testAnalysisMethods': return [3 /*break*/, 32];
                            case 'getAvailableLLMProviders': return [3 /*break*/, 34];
                        }
                        return [3 /*break*/, 36];
                    case 2: return [4 /*yield*/, this.listApplications()];
                    case 3: return [2 /*return*/, _c.sent()];
                    case 4: return [4 /*yield*/, this.focusApplication(args.identifier)];
                    case 5: return [2 /*return*/, _c.sent()];
                    case 6: return [4 /*yield*/, this.click(args.x, args.y, args.button || 'left')];
                    case 7: return [2 /*return*/, _c.sent()];
                    case 8: return [4 /*yield*/, this.moveMouse(args.x, args.y)];
                    case 9: return [2 /*return*/, _c.sent()];
                    case 10: return [4 /*yield*/, this.screenshot(args.padding || 10, args.format || 'png', args.quality || 90)];
                    case 11: return [2 /*return*/, _c.sent()];
                    case 12: return [4 /*yield*/, this.getClickableElements()];
                    case 13: return [2 /*return*/, _c.sent()];
                    case 14: return [4 /*yield*/, this.clickElement(args.elementIndex)];
                    case 15: return [2 /*return*/, _c.sent()];
                    case 16: return [4 /*yield*/, this.analyzeImageWithAI(args.prompt, args.padding || 10)];
                    case 17: return [2 /*return*/, _c.sent()];
                    case 18: return [4 /*yield*/, this.findAndClickElement(args.elementDescription, args.padding || 10)];
                    case 19: return [2 /*return*/, _c.sent()];
                    case 20: return [4 /*yield*/, this.analyzeImageWithOCR(args.padding || 10)];
                    case 21: return [2 /*return*/, _c.sent()];
                    case 22: return [4 /*yield*/, this.getWebElements(args.padding || 10)];
                    case 23: return [2 /*return*/, _c.sent()];
                    case 24: return [4 /*yield*/, this.clickWebElement(args.elementIndex)];
                    case 25: return [2 /*return*/, _c.sent()];
                    case 26: return [4 /*yield*/, this.findAndClickWebElement(args.elementDescription, args.padding || 10)];
                    case 27: return [2 /*return*/, _c.sent()];
                    case 28: return [4 /*yield*/, this.typeText(args.appName, args.elementIndex, args.text, args.clearFirst !== false)];
                    case 29: return [2 /*return*/, _c.sent()];
                    case 30: return [4 /*yield*/, this.googleSearch(args.appName || 'Google Chrome', args.searchQuery, args.searchButtonText || 'Google Search')];
                    case 31: return [2 /*return*/, _c.sent()];
                    case 32: return [4 /*yield*/, this.testAnalysisMethods(args.padding || 10)];
                    case 33: return [2 /*return*/, _c.sent()];
                    case 34: return [4 /*yield*/, this.getAvailableLLMProviders()];
                    case 35: return [2 /*return*/, _c.sent()];
                    case 36: throw new Error("Unknown tool: ".concat(name));
                    case 37: return [3 /*break*/, 39];
                    case 38:
                        error_1 = _c.sent();
                        errorMessage = error_1 instanceof Error ? error_1.message : String(error_1);
                        return [2 /*return*/, {
                                content: [
                                    {
                                        type: 'text',
                                        text: "Error: ".concat(errorMessage),
                                    },
                                ],
                            }];
                    case 39: return [2 /*return*/];
                }
            });
        }); });
    };
    // Basic Tools Implementation
    AdvancedServer.prototype.listApplications = function () {
        return __awaiter(this, void 0, void 0, function () {
            var apps, error_2;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 2, , 3]);
                        return [4 /*yield*/, (0, run_1.run)(function () {
                                var app = Application.currentApplication();
                                app.includeStandardAdditions = true;
                                var runningApps = Application('System Events').applicationProcesses();
                                var appList = [];
                                for (var i = 0; i < runningApps.length; i++) {
                                    var appName = runningApps[i].name();
                                    var appBundleId = runningApps[i].bundleIdentifier();
                                    var appPid = runningApps[i].unixId();
                                    // Get window bounds
                                    var windows = runningApps[i].windows();
                                    var bounds = { x: 0, y: 0, width: 0, height: 0 };
                                    if (windows.length > 0) {
                                        var window_1 = windows[0];
                                        bounds = {
                                            x: window_1.position()[0],
                                            y: window_1.position()[1],
                                            width: window_1.size()[0],
                                            height: window_1.size()[1],
                                        };
                                    }
                                    appList.push({
                                        name: appName,
                                        bundleId: appBundleId,
                                        pid: appPid,
                                        bounds: bounds,
                                    });
                                }
                                return appList;
                            })];
                    case 1:
                        apps = _a.sent();
                        return [2 /*return*/, {
                                content: [
                                    {
                                        type: 'text',
                                        text: "Found ".concat(apps.length, " running applications:\n\n").concat(apps
                                            .map(function (app) {
                                            return "\u2022 ".concat(app.name, " (").concat(app.bundleId, ")\n  PID: ").concat(app.pid, "\n  Bounds: ").concat(app.bounds.width, "x").concat(app.bounds.height, " at (").concat(app.bounds.x, ", ").concat(app.bounds.y, ")");
                                        })
                                            .join('\n\n')),
                                    },
                                ],
                            }];
                    case 2:
                        error_2 = _a.sent();
                        throw new Error("Failed to list applications: ".concat(error_2));
                    case 3: return [2 /*return*/];
                }
            });
        });
    };
    AdvancedServer.prototype.focusApplication = function (identifier) {
        return __awaiter(this, void 0, void 0, function () {
            var appInfo, error_3;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 2, , 3]);
                        return [4 /*yield*/, (0, run_1.run)(function (identifier) {
                                var app = Application.currentApplication();
                                app.includeStandardAdditions = true;
                                // Try to find app by bundle ID first, then by name
                                var runningApps = Application('System Events').applicationProcesses();
                                var targetApp = null;
                                for (var i = 0; i < runningApps.length; i++) {
                                    var appBundleId = runningApps[i].bundleIdentifier();
                                    var appName = runningApps[i].name();
                                    if (appBundleId === identifier || appName === identifier) {
                                        targetApp = runningApps[i];
                                        break;
                                    }
                                }
                                if (!targetApp) {
                                    throw new Error("Application not found: ".concat(identifier));
                                }
                                // Activate the application
                                targetApp.activate();
                                // Get updated bounds after activation
                                var windows = targetApp.windows();
                                var bounds = { x: 0, y: 0, width: 0, height: 0 };
                                if (windows.length > 0) {
                                    var window_2 = windows[0];
                                    bounds = {
                                        x: window_2.position()[0],
                                        y: window_2.position()[1],
                                        width: window_2.size()[0],
                                        height: window_2.size()[1],
                                    };
                                }
                                return {
                                    name: targetApp.name(),
                                    bundleId: targetApp.bundleIdentifier(),
                                    pid: targetApp.unixId(),
                                    bounds: bounds,
                                };
                            }, identifier)];
                    case 1:
                        appInfo = _a.sent();
                        this.currentApp = appInfo;
                        return [2 /*return*/, {
                                content: [
                                    {
                                        type: 'text',
                                        text: "Focused on ".concat(appInfo.name, " (").concat(appInfo.bundleId, ")\nPID: ").concat(appInfo.pid, "\nBounds: ").concat(appInfo.bounds.width, "x").concat(appInfo.bounds.height, " at (").concat(appInfo.bounds.x, ", ").concat(appInfo.bounds.y, ")"),
                                    },
                                ],
                            }];
                    case 2:
                        error_3 = _a.sent();
                        throw new Error("Failed to focus application: ".concat(error_3));
                    case 3: return [2 /*return*/];
                }
            });
        });
    };
    AdvancedServer.prototype.click = function (x, y, button) {
        return __awaiter(this, void 0, void 0, function () {
            var screenX_1, screenY_1, buttonMap, error_4;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        if (!this.currentApp) {
                            throw new Error('No application focused. Use focusApplication first.');
                        }
                        _a.label = 1;
                    case 1:
                        _a.trys.push([1, 4, , 5]);
                        screenX_1 = this.currentApp.bounds.x + (x * this.currentApp.bounds.width);
                        screenY_1 = this.currentApp.bounds.y + (y * this.currentApp.bounds.height);
                        buttonMap = {
                            left: nut_js_1.Button.LEFT,
                            right: nut_js_1.Button.RIGHT,
                            middle: nut_js_1.Button.MIDDLE,
                        };
                        return [4 /*yield*/, nut_js_1.mouse.setPosition({ x: screenX_1, y: screenY_1 })];
                    case 2:
                        _a.sent();
                        return [4 /*yield*/, nut_js_1.mouse.click(buttonMap[button])];
                    case 3:
                        _a.sent();
                        return [2 /*return*/, {
                                content: [
                                    {
                                        type: 'text',
                                        text: "Clicked ".concat(button, " button at normalized (").concat(x, ", ").concat(y, ") -> screen (").concat(Math.round(screenX_1), ", ").concat(Math.round(screenY_1), ")"),
                                    },
                                ],
                            }];
                    case 4:
                        error_4 = _a.sent();
                        throw new Error("Failed to click: ".concat(error_4));
                    case 5: return [2 /*return*/];
                }
            });
        });
    };
    AdvancedServer.prototype.moveMouse = function (x, y) {
        return __awaiter(this, void 0, void 0, function () {
            var screenX_2, screenY_2, error_5;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        if (!this.currentApp) {
                            throw new Error('No application focused. Use focusApplication first.');
                        }
                        _a.label = 1;
                    case 1:
                        _a.trys.push([1, 3, , 4]);
                        screenX_2 = this.currentApp.bounds.x + (x * this.currentApp.bounds.width);
                        screenY_2 = this.currentApp.bounds.y + (y * this.currentApp.bounds.height);
                        return [4 /*yield*/, nut_js_1.mouse.setPosition({ x: screenX_2, y: screenY_2 })];
                    case 2:
                        _a.sent();
                        return [2 /*return*/, {
                                content: [
                                    {
                                        type: 'text',
                                        text: "Moved mouse to normalized (".concat(x, ", ").concat(y, ") -> screen (").concat(Math.round(screenX_2), ", ").concat(Math.round(screenY_2), ")"),
                                    },
                                ],
                            }];
                    case 3:
                        error_5 = _a.sent();
                        throw new Error("Failed to move mouse: ".concat(error_5));
                    case 4: return [2 /*return*/];
                }
            });
        });
    };
    AdvancedServer.prototype.screenshot = function (padding, format, quality) {
        return __awaiter(this, void 0, void 0, function () {
            var screenRecordingStatus, fullScreenImage, cropX, cropY, cropWidth, cropHeight, croppedImage, base64Image, mimeType, error_6;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        if (!this.currentApp) {
                            throw new Error('No application focused. Use focusApplication first.');
                        }
                        _a.label = 1;
                    case 1:
                        _a.trys.push([1, 5, , 6]);
                        return [4 /*yield*/, (0, node_mac_permissions_1.checkPermissions)('screen')];
                    case 2:
                        screenRecordingStatus = _a.sent();
                        if (screenRecordingStatus !== 'authorized') {
                            throw new Error('Screen Recording permission is required. Please grant permission in System Preferences > Security & Privacy > Privacy > Screen Recording.');
                        }
                        return [4 /*yield*/, (0, screenshot_desktop_1.screenshotDesktop)()];
                    case 3:
                        fullScreenImage = _a.sent();
                        cropX = Math.max(0, this.currentApp.bounds.x - padding);
                        cropY = Math.max(0, this.currentApp.bounds.y - padding);
                        cropWidth = Math.min(fullScreenImage.width - cropX, this.currentApp.bounds.width + (padding * 2));
                        cropHeight = Math.min(fullScreenImage.height - cropY, this.currentApp.bounds.height + (padding * 2));
                        return [4 /*yield*/, (0, sharp_1.default)(fullScreenImage)
                                .extract({
                                left: cropX,
                                top: cropY,
                                width: cropWidth,
                                height: cropHeight,
                            })
                                .toFormat(format, { quality: quality })
                                .toBuffer()];
                    case 4:
                        croppedImage = _a.sent();
                        base64Image = croppedImage.toString('base64');
                        mimeType = format === 'jpg' ? 'image/jpeg' : 'image/png';
                        return [2 /*return*/, {
                                content: [
                                    {
                                        type: 'text',
                                        text: "Screenshot taken of ".concat(this.currentApp.name, " (").concat(cropWidth, "x").concat(cropHeight, "px)"),
                                    },
                                    {
                                        type: 'image',
                                        data: base64Image,
                                        mimeType: mimeType,
                                    },
                                ],
                            }];
                    case 5:
                        error_6 = _a.sent();
                        throw new Error("Failed to take screenshot: ".concat(error_6));
                    case 6: return [2 /*return*/];
                }
            });
        });
    };
    // Apple Accessibility Tools Implementation
    AdvancedServer.prototype.getClickableElements = function () {
        return __awaiter(this, void 0, void 0, function () {
            var elements, error_7;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        if (!this.currentApp) {
                            throw new Error('No application focused. Use focusApplication first.');
                        }
                        _a.label = 1;
                    case 1:
                        _a.trys.push([1, 3, , 4]);
                        return [4 /*yield*/, this.appleWindowManager.getClickableElements(this.currentApp.name)];
                    case 2:
                        elements = _a.sent();
                        return [2 /*return*/, {
                                content: [
                                    {
                                        type: 'text',
                                        text: "Found ".concat(elements.length, " clickable elements in ").concat(this.currentApp.name, ":\n\n").concat(elements
                                            .map(function (element, index) {
                                            return "".concat(index, ". \"").concat(element.text, "\" (").concat(element.type, ")\n   Screen: (").concat(element.screenPosition.x, ", ").concat(element.screenPosition.y, ")\n   Normalized: (").concat(element.normalizedPosition.x.toFixed(3), ", ").concat(element.normalizedPosition.y.toFixed(3), ")");
                                        })
                                            .join('\n\n')),
                                    },
                                ],
                            }];
                    case 3:
                        error_7 = _a.sent();
                        throw new Error("Failed to get clickable elements: ".concat(error_7));
                    case 4: return [2 /*return*/];
                }
            });
        });
    };
    AdvancedServer.prototype.clickElement = function (elementIndex) {
        return __awaiter(this, void 0, void 0, function () {
            var elements, element, normalizedX, normalizedY, error_8;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        if (!this.currentApp) {
                            throw new Error('No application focused. Use focusApplication first.');
                        }
                        _a.label = 1;
                    case 1:
                        _a.trys.push([1, 4, , 5]);
                        return [4 /*yield*/, this.appleWindowManager.getClickableElements(this.currentApp.name)];
                    case 2:
                        elements = _a.sent();
                        if (elementIndex < 0 || elementIndex >= elements.length) {
                            throw new Error("Element index ".concat(elementIndex, " is out of range. Available elements: 0-").concat(elements.length - 1));
                        }
                        element = elements[elementIndex];
                        normalizedX = element.normalizedPosition.x;
                        normalizedY = element.normalizedPosition.y;
                        return [4 /*yield*/, this.click(normalizedX, normalizedY, 'left')];
                    case 3: 
                    // Use the existing click method
                    return [2 /*return*/, _a.sent()];
                    case 4:
                        error_8 = _a.sent();
                        throw new Error("Failed to click element: ".concat(error_8));
                    case 5: return [2 /*return*/];
                }
            });
        });
    };
    // AI Analysis Tools Implementation
    AdvancedServer.prototype.analyzeImageWithAI = function (prompt, padding) {
        return __awaiter(this, void 0, void 0, function () {
            var screenshotResult, imageData, analysis, error_9;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        if (!this.currentApp) {
                            throw new Error('No application focused. Use focusApplication first.');
                        }
                        _a.label = 1;
                    case 1:
                        _a.trys.push([1, 4, , 5]);
                        return [4 /*yield*/, this.screenshot(padding, 'png', 90)];
                    case 2:
                        screenshotResult = _a.sent();
                        imageData = screenshotResult.content[1].data;
                        return [4 /*yield*/, this.localLLMAnalyzer.analyzeImage(imageData, prompt)];
                    case 3:
                        analysis = _a.sent();
                        return [2 /*return*/, {
                                content: [
                                    {
                                        type: 'text',
                                        text: "AI Analysis Results:\n\n".concat(analysis),
                                    },
                                ],
                            }];
                    case 4:
                        error_9 = _a.sent();
                        throw new Error("Failed to analyze image with AI: ".concat(error_9));
                    case 5: return [2 /*return*/];
                }
            });
        });
    };
    AdvancedServer.prototype.findAndClickElement = function (elementDescription, padding) {
        return __awaiter(this, void 0, void 0, function () {
            var elements, matchingElement, normalizedX, normalizedY, accessibilityError_1, analysis, error_10;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        if (!this.currentApp) {
                            throw new Error('No application focused. Use focusApplication first.');
                        }
                        _a.label = 1;
                    case 1:
                        _a.trys.push([1, 9, , 10]);
                        _a.label = 2;
                    case 2:
                        _a.trys.push([2, 6, , 7]);
                        return [4 /*yield*/, this.appleWindowManager.getClickableElements(this.currentApp.name)];
                    case 3:
                        elements = _a.sent();
                        matchingElement = elements.find(function (element) {
                            return element.text.toLowerCase().includes(elementDescription.toLowerCase());
                        });
                        if (!matchingElement) return [3 /*break*/, 5];
                        normalizedX = matchingElement.normalizedPosition.x;
                        normalizedY = matchingElement.normalizedPosition.y;
                        return [4 /*yield*/, this.click(normalizedX, normalizedY, 'left')];
                    case 4:
                        _a.sent();
                        return [2 /*return*/, {
                                content: [
                                    {
                                        type: 'text',
                                        text: "Found and clicked \"".concat(matchingElement.text, "\" using Apple Accessibility at normalized (").concat(normalizedX.toFixed(3), ", ").concat(normalizedY.toFixed(3), ")"),
                                    },
                                ],
                            }];
                    case 5: return [3 /*break*/, 7];
                    case 6:
                        accessibilityError_1 = _a.sent();
                        console.log('Apple Accessibility failed, trying AI analysis...');
                        return [3 /*break*/, 7];
                    case 7: return [4 /*yield*/, this.analyzeImageWithAI("Find and click the \"".concat(elementDescription, "\" element"), padding)];
                    case 8:
                        analysis = _a.sent();
                        return [2 /*return*/, {
                                content: [
                                    {
                                        type: 'text',
                                        text: "AI Analysis completed. Please review the results and use click() with the provided coordinates.",
                                    },
                                ],
                            }];
                    case 9:
                        error_10 = _a.sent();
                        throw new Error("Failed to find and click element: ".concat(error_10));
                    case 10: return [2 /*return*/];
                }
            });
        });
    };
    // OCR Tools Implementation
    AdvancedServer.prototype.analyzeImageWithOCR = function (padding) {
        return __awaiter(this, void 0, void 0, function () {
            var screenshotResult, imageData, analysis, error_11;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        if (!this.currentApp) {
                            throw new Error('No application focused. Use focusApplication first.');
                        }
                        _a.label = 1;
                    case 1:
                        _a.trys.push([1, 4, , 5]);
                        return [4 /*yield*/, this.screenshot(padding, 'png', 90)];
                    case 2:
                        screenshotResult = _a.sent();
                        imageData = screenshotResult.content[1].data;
                        return [4 /*yield*/, this.ocrAnalyzer.analyzeImage(imageData)];
                    case 3:
                        analysis = _a.sent();
                        return [2 /*return*/, {
                                content: [
                                    {
                                        type: 'text',
                                        text: "OCR Analysis Results:\n\n".concat(analysis),
                                    },
                                ],
                            }];
                    case 4:
                        error_11 = _a.sent();
                        throw new Error("Failed to analyze image with OCR: ".concat(error_11));
                    case 5: return [2 /*return*/];
                }
            });
        });
    };
    // Web Content Tools Implementation
    AdvancedServer.prototype.getWebElements = function (padding) {
        return __awaiter(this, void 0, void 0, function () {
            var screenshotResult, imageData, elements, error_12;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        if (!this.currentApp) {
                            throw new Error('No application focused. Use focusApplication first.');
                        }
                        _a.label = 1;
                    case 1:
                        _a.trys.push([1, 4, , 5]);
                        return [4 /*yield*/, this.screenshot(padding, 'png', 90)];
                    case 2:
                        screenshotResult = _a.sent();
                        imageData = screenshotResult.content[1].data;
                        return [4 /*yield*/, this.webContentDetector.analyzeImage(imageData)];
                    case 3:
                        elements = _a.sent();
                        return [2 /*return*/, {
                                content: [
                                    {
                                        type: 'text',
                                        text: "Web Elements for ".concat(this.currentApp.name, ":\n\nWindow bounds: ").concat(this.currentApp.bounds.width, "x").concat(this.currentApp.bounds.height, " at (").concat(this.currentApp.bounds.x, ", ").concat(this.currentApp.bounds.y, ")\n\nFound ").concat(elements.length, " web elements:\n\n").concat(elements
                                            .map(function (element, index) {
                                            return "".concat(index, ". \"").concat(element.text, "\" (").concat(element.type, ") - Screen: (").concat(element.screenPosition.x, ", ").concat(element.screenPosition.y, ") | Normalized: (").concat(element.normalizedPosition.x.toFixed(3), ", ").concat(element.normalizedPosition.y.toFixed(3), ") | Confidence: ").concat(element.confidence, " | Method: ").concat(element.detectionMethod);
                                        })
                                            .join('\n')),
                                    },
                                ],
                            }];
                    case 4:
                        error_12 = _a.sent();
                        throw new Error("Failed to get web elements: ".concat(error_12));
                    case 5: return [2 /*return*/];
                }
            });
        });
    };
    AdvancedServer.prototype.clickWebElement = function (elementIndex) {
        return __awaiter(this, void 0, void 0, function () {
            var screenshotResult, imageData, elements, element, normalizedX, normalizedY, error_13;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        if (!this.currentApp) {
                            throw new Error('No application focused. Use focusApplication first.');
                        }
                        _a.label = 1;
                    case 1:
                        _a.trys.push([1, 5, , 6]);
                        return [4 /*yield*/, this.screenshot(10, 'png', 90)];
                    case 2:
                        screenshotResult = _a.sent();
                        imageData = screenshotResult.content[1].data;
                        return [4 /*yield*/, this.webContentDetector.analyzeImage(imageData)];
                    case 3:
                        elements = _a.sent();
                        if (elementIndex < 0 || elementIndex >= elements.length) {
                            throw new Error("Element index ".concat(elementIndex, " is out of range. Available elements: 0-").concat(elements.length - 1));
                        }
                        element = elements[elementIndex];
                        normalizedX = element.normalizedPosition.x;
                        normalizedY = element.normalizedPosition.y;
                        return [4 /*yield*/, this.click(normalizedX, normalizedY, 'left')];
                    case 4: 
                    // Use the existing click method
                    return [2 /*return*/, _a.sent()];
                    case 5:
                        error_13 = _a.sent();
                        throw new Error("Failed to click web element: ".concat(error_13));
                    case 6: return [2 /*return*/];
                }
            });
        });
    };
    AdvancedServer.prototype.findAndClickWebElement = function (elementDescription, padding) {
        return __awaiter(this, void 0, void 0, function () {
            var screenshotResult, imageData, elements, matchingElement, normalizedX, normalizedY, error_14;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        if (!this.currentApp) {
                            throw new Error('No application focused. Use focusApplication first.');
                        }
                        _a.label = 1;
                    case 1:
                        _a.trys.push([1, 5, , 6]);
                        return [4 /*yield*/, this.screenshot(padding, 'png', 90)];
                    case 2:
                        screenshotResult = _a.sent();
                        imageData = screenshotResult.content[1].data;
                        return [4 /*yield*/, this.webContentDetector.analyzeImage(imageData)];
                    case 3:
                        elements = _a.sent();
                        matchingElement = elements.find(function (element) {
                            return element.text.toLowerCase().includes(elementDescription.toLowerCase());
                        });
                        if (!matchingElement) {
                            throw new Error("Web element \"".concat(elementDescription, "\" not found"));
                        }
                        normalizedX = matchingElement.normalizedPosition.x;
                        normalizedY = matchingElement.normalizedPosition.y;
                        return [4 /*yield*/, this.click(normalizedX, normalizedY, 'left')];
                    case 4:
                        _a.sent();
                        return [2 /*return*/, {
                                content: [
                                    {
                                        type: 'text',
                                        text: "Found and clicked web element \"".concat(matchingElement.text, "\" at normalized (").concat(normalizedX.toFixed(3), ", ").concat(normalizedY.toFixed(3), ")"),
                                    },
                                ],
                            }];
                    case 5:
                        error_14 = _a.sent();
                        throw new Error("Failed to find and click web element: ".concat(error_14));
                    case 6: return [2 /*return*/];
                }
            });
        });
    };
    // Text Input Tools Implementation
    AdvancedServer.prototype.typeText = function (appName, elementIndex, text, clearFirst) {
        return __awaiter(this, void 0, void 0, function () {
            var screenshotResult, imageData, elements, element, normalizedX, normalizedY, screenX_3, screenY_3, error_15;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 10, , 11]);
                        // Focus the application first
                        return [4 /*yield*/, this.focusApplication(appName)];
                    case 1:
                        // Focus the application first
                        _a.sent();
                        return [4 /*yield*/, this.screenshot(10, 'png', 90)];
                    case 2:
                        screenshotResult = _a.sent();
                        imageData = screenshotResult.content[1].data;
                        return [4 /*yield*/, this.webContentDetector.analyzeImage(imageData)];
                    case 3:
                        elements = _a.sent();
                        if (elementIndex < 0 || elementIndex >= elements.length) {
                            throw new Error("Element index ".concat(elementIndex, " is out of range. Available elements: 0-").concat(elements.length - 1));
                        }
                        element = elements[elementIndex];
                        normalizedX = element.normalizedPosition.x;
                        normalizedY = element.normalizedPosition.y;
                        screenX_3 = this.currentApp.bounds.x + (normalizedX * this.currentApp.bounds.width);
                        screenY_3 = this.currentApp.bounds.y + (normalizedY * this.currentApp.bounds.height);
                        // Move mouse and click to focus the input field
                        return [4 /*yield*/, nut_js_1.mouse.setPosition({ x: screenX_3, y: screenY_3 })];
                    case 4:
                        // Move mouse and click to focus the input field
                        _a.sent();
                        return [4 /*yield*/, nut_js_1.mouse.click(nut_js_1.Button.LEFT)];
                    case 5:
                        _a.sent();
                        if (!clearFirst) return [3 /*break*/, 8];
                        return [4 /*yield*/, nut_js_1.keyboard.pressKey(nut_js_1.Key.LeftCmd, nut_js_1.Key.A)];
                    case 6:
                        _a.sent();
                        return [4 /*yield*/, nut_js_1.keyboard.pressKey(nut_js_1.Key.Delete)];
                    case 7:
                        _a.sent();
                        _a.label = 8;
                    case 8: 
                    // Type the text
                    return [4 /*yield*/, nut_js_1.keyboard.type(text)];
                    case 9:
                        // Type the text
                        _a.sent();
                        return [2 /*return*/, {
                                content: [
                                    {
                                        type: 'text',
                                        text: "Typed \"".concat(text, "\" into element ").concat(elementIndex, " (\"").concat(element.text, "\") at normalized (").concat(normalizedX.toFixed(3), ", ").concat(normalizedY.toFixed(3), ")"),
                                    },
                                ],
                            }];
                    case 10:
                        error_15 = _a.sent();
                        throw new Error("Failed to type text: ".concat(error_15));
                    case 11: return [2 /*return*/];
                }
            });
        });
    };
    AdvancedServer.prototype.googleSearch = function (appName, searchQuery, searchButtonText) {
        return __awaiter(this, void 0, void 0, function () {
            var screenshotResult, imageData, elements, searchBox, searchButton, searchBoxIndex, searchButtonIndex, error_16;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 6, , 7]);
                        // Focus the browser
                        return [4 /*yield*/, this.focusApplication(appName)];
                    case 1:
                        // Focus the browser
                        _a.sent();
                        return [4 /*yield*/, this.screenshot(10, 'png', 90)];
                    case 2:
                        screenshotResult = _a.sent();
                        imageData = screenshotResult.content[1].data;
                        return [4 /*yield*/, this.webContentDetector.analyzeImage(imageData)];
                    case 3:
                        elements = _a.sent();
                        searchBox = elements.find(function (element) { var _a; return element.isInput && (element.text.toLowerCase().includes('search') || ((_a = element.placeholder) === null || _a === void 0 ? void 0 : _a.toLowerCase().includes('search'))); });
                        if (!searchBox) {
                            throw new Error('Search box not found');
                        }
                        searchButton = elements.find(function (element) {
                            return element.text.toLowerCase().includes(searchButtonText.toLowerCase());
                        });
                        if (!searchButton) {
                            throw new Error("Search button \"".concat(searchButtonText, "\" not found"));
                        }
                        searchBoxIndex = elements.indexOf(searchBox);
                        return [4 /*yield*/, this.typeText(appName, searchBoxIndex, searchQuery, true)];
                    case 4:
                        _a.sent();
                        searchButtonIndex = elements.indexOf(searchButton);
                        return [4 /*yield*/, this.clickWebElement(searchButtonIndex)];
                    case 5:
                        _a.sent();
                        return [2 /*return*/, {
                                content: [
                                    {
                                        type: 'text',
                                        text: "Successfully performed Google search for \"".concat(searchQuery, "\" using \"").concat(searchButtonText, "\" button"),
                                    },
                                ],
                            }];
                    case 6:
                        error_16 = _a.sent();
                        throw new Error("Failed to perform Google search: ".concat(error_16));
                    case 7: return [2 /*return*/];
                }
            });
        });
    };
    // Utility Tools Implementation
    AdvancedServer.prototype.testAnalysisMethods = function (padding) {
        return __awaiter(this, void 0, void 0, function () {
            var results, accessibilityElements, error_17, screenshotResult, imageData, error_18, screenshotResult, imageData, error_19, screenshotResult, imageData, webElements, error_20, error_21;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        if (!this.currentApp) {
                            throw new Error('No application focused. Use focusApplication first.');
                        }
                        _a.label = 1;
                    case 1:
                        _a.trys.push([1, 18, , 19]);
                        results = [];
                        _a.label = 2;
                    case 2:
                        _a.trys.push([2, 4, , 5]);
                        return [4 /*yield*/, this.appleWindowManager.getClickableElements(this.currentApp.name)];
                    case 3:
                        accessibilityElements = _a.sent();
                        results.push("\u2705 Apple Accessibility: Found ".concat(accessibilityElements.length, " elements"));
                        return [3 /*break*/, 5];
                    case 4:
                        error_17 = _a.sent();
                        results.push("\u274C Apple Accessibility: Failed - ".concat(error_17));
                        return [3 /*break*/, 5];
                    case 5:
                        _a.trys.push([5, 8, , 9]);
                        return [4 /*yield*/, this.screenshot(padding, 'png', 90)];
                    case 6:
                        screenshotResult = _a.sent();
                        imageData = screenshotResult.content[1].data;
                        return [4 /*yield*/, this.localLLMAnalyzer.analyzeImage(imageData, 'Test analysis')];
                    case 7:
                        _a.sent();
                        results.push("\u2705 AI Analysis: Working");
                        return [3 /*break*/, 9];
                    case 8:
                        error_18 = _a.sent();
                        results.push("\u274C AI Analysis: Failed - ".concat(error_18));
                        return [3 /*break*/, 9];
                    case 9:
                        _a.trys.push([9, 12, , 13]);
                        return [4 /*yield*/, this.screenshot(padding, 'png', 90)];
                    case 10:
                        screenshotResult = _a.sent();
                        imageData = screenshotResult.content[1].data;
                        return [4 /*yield*/, this.ocrAnalyzer.analyzeImage(imageData)];
                    case 11:
                        _a.sent();
                        results.push("\u2705 OCR Analysis: Working");
                        return [3 /*break*/, 13];
                    case 12:
                        error_19 = _a.sent();
                        results.push("\u274C OCR Analysis: Failed - ".concat(error_19));
                        return [3 /*break*/, 13];
                    case 13:
                        _a.trys.push([13, 16, , 17]);
                        return [4 /*yield*/, this.screenshot(padding, 'png', 90)];
                    case 14:
                        screenshotResult = _a.sent();
                        imageData = screenshotResult.content[1].data;
                        return [4 /*yield*/, this.webContentDetector.analyzeImage(imageData)];
                    case 15:
                        webElements = _a.sent();
                        results.push("\u2705 Web Content Detection: Found ".concat(webElements.length, " elements"));
                        return [3 /*break*/, 17];
                    case 16:
                        error_20 = _a.sent();
                        results.push("\u274C Web Content Detection: Failed - ".concat(error_20));
                        return [3 /*break*/, 17];
                    case 17: return [2 /*return*/, {
                            content: [
                                {
                                    type: 'text',
                                    text: "Analysis Methods Test Results for ".concat(this.currentApp.name, ":\n\n").concat(results.join('\n')),
                                },
                            ],
                        }];
                    case 18:
                        error_21 = _a.sent();
                        throw new Error("Failed to test analysis methods: ".concat(error_21));
                    case 19: return [2 /*return*/];
                }
            });
        });
    };
    AdvancedServer.prototype.getAvailableLLMProviders = function () {
        return __awaiter(this, void 0, void 0, function () {
            var providers, error_22;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 2, , 3]);
                        return [4 /*yield*/, this.webContentDetector.getAvailableProviders()];
                    case 1:
                        providers = _a.sent();
                        return [2 /*return*/, {
                                content: [
                                    {
                                        type: 'text',
                                        text: "Available LLM Providers:\n\n".concat(providers
                                            .map(function (provider) { return "\u2022 ".concat(provider.name, ": ").concat(provider.status); })
                                            .join('\n')),
                                    },
                                ],
                            }];
                    case 2:
                        error_22 = _a.sent();
                        throw new Error("Failed to get LLM providers: ".concat(error_22));
                    case 3: return [2 /*return*/];
                }
            });
        });
    };
    AdvancedServer.prototype.run = function () {
        return __awaiter(this, void 0, void 0, function () {
            var transport;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        transport = new stdio_js_1.StdioServerTransport();
                        return [4 /*yield*/, this.server.connect(transport)];
                    case 1:
                        _a.sent();
                        console.error('MCP Eyes Advanced Server running on stdio');
                        return [2 /*return*/];
                }
            });
        });
    };
    return AdvancedServer;
}());
var server = new AdvancedServer();
server.run().catch(console.error);
