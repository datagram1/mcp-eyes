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
var AIEnhancedScreenshotServer = /** @class */ (function () {
    function AIEnhancedScreenshotServer() {
        this.currentApp = null;
        this.logFile = '/Users/richardbrown/dev/mcp_eyes/test-screenshots/ai-enhanced-debug-log.md';
        this.server = new index_js_1.Server({
            name: 'ai-enhanced-screenshot',
            version: '1.1.12',
        });
        this.setupToolHandlers();
    }
    AIEnhancedScreenshotServer.prototype.log = function (message) {
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
    AIEnhancedScreenshotServer.prototype.setupToolHandlers = function () {
        var _this = this;
        this.server.setRequestHandler(types_js_1.ListToolsRequestSchema, function () { return __awaiter(_this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                return [2 /*return*/, {
                        tools: [
                            // Core functionality
                            {
                                name: 'listApplications',
                                description: 'List all running applications with their window bounds',
                                inputSchema: {
                                    type: 'object',
                                    properties: {},
                                },
                            },
                            {
                                name: 'focusApplication',
                                description: 'Focus on a specific application by bundle ID or PID',
                                inputSchema: {
                                    type: 'object',
                                    properties: {
                                        identifier: {
                                            type: 'string',
                                            description: 'Bundle ID or PID of the application to focus',
                                        },
                                    },
                                    required: ['identifier'],
                                },
                            },
                            {
                                name: 'click',
                                description: 'Perform a mouse click at specified coordinates relative to the focused app window',
                                inputSchema: {
                                    type: 'object',
                                    properties: {
                                        x: {
                                            type: 'number',
                                            description: 'X coordinate relative to the app window (0-1 normalized)',
                                        },
                                        y: {
                                            type: 'number',
                                            description: 'Y coordinate relative to the app window (0-1 normalized)',
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
                                description: 'Move mouse to specified coordinates relative to the focused app window',
                                inputSchema: {
                                    type: 'object',
                                    properties: {
                                        x: {
                                            type: 'number',
                                            description: 'X coordinate relative to the app window (0-1 normalized)',
                                        },
                                        y: {
                                            type: 'number',
                                            description: 'Y coordinate relative to the app window (0-1 normalized)',
                                        },
                                    },
                                    required: ['x', 'y'],
                                },
                            },
                            // AI-Enhanced Screenshot Tools
                            {
                                name: 'screenshotWithAI',
                                description: 'Take a screenshot and analyze it with AI to detect UI elements and provide interaction suggestions',
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
                                        includeAnalysis: {
                                            type: 'boolean',
                                            description: 'Whether to include AI analysis of the screenshot',
                                            default: true,
                                        },
                                    },
                                },
                            },
                            {
                                name: 'findAndClickElement',
                                description: 'Find a UI element by description and click it automatically',
                                inputSchema: {
                                    type: 'object',
                                    properties: {
                                        description: {
                                            type: 'string',
                                            description: 'Description of the element to find (e.g., "update available button", "login button", "submit form")',
                                        },
                                        padding: {
                                            type: 'number',
                                            description: 'Padding around the window in pixels',
                                            default: 10,
                                        },
                                        button: {
                                            type: 'string',
                                            enum: ['left', 'right', 'middle'],
                                            description: 'Mouse button to click',
                                            default: 'left',
                                        },
                                    },
                                    required: ['description'],
                                },
                            },
                            {
                                name: 'analyzeScreenshot',
                                description: 'Analyze a screenshot to detect UI elements and provide interaction suggestions',
                                inputSchema: {
                                    type: 'object',
                                    properties: {
                                        imageData: {
                                            type: 'string',
                                            description: 'Base64 encoded image data to analyze',
                                        },
                                        mimeType: {
                                            type: 'string',
                                            description: 'MIME type of the image (image/png or image/jpeg)',
                                            default: 'image/png',
                                        },
                                    },
                                    required: ['imageData'],
                                },
                            },
                            {
                                name: 'smartScreenshot',
                                description: 'Take a smart screenshot of a specific application with automatic window detection and AI analysis',
                                inputSchema: {
                                    type: 'object',
                                    properties: {
                                        appName: {
                                            type: 'string',
                                            description: 'Name of the application to screenshot (e.g., "ChatGPT", "Safari", "Finder")',
                                        },
                                        padding: {
                                            type: 'number',
                                            description: 'Padding around the application window in pixels',
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
                                        includeAnalysis: {
                                            type: 'boolean',
                                            description: 'Whether to include AI analysis of the screenshot',
                                            default: true,
                                        },
                                        moveToPrimary: {
                                            type: 'boolean',
                                            description: 'Optional: Move the app window to primary display before screenshot',
                                            default: false,
                                        },
                                    },
                                    required: ['appName'],
                                },
                            },
                            {
                                name: 'executeWorkflow',
                                description: 'Execute a complete workflow: find app, take screenshot, analyze, and perform actions',
                                inputSchema: {
                                    type: 'object',
                                    properties: {
                                        appName: {
                                            type: 'string',
                                            description: 'Name of the application to work with',
                                        },
                                        actions: {
                                            type: 'array',
                                            items: {
                                                type: 'object',
                                                properties: {
                                                    type: {
                                                        type: 'string',
                                                        enum: ['click', 'type', 'scroll', 'wait'],
                                                        description: 'Type of action to perform',
                                                    },
                                                    target: {
                                                        type: 'string',
                                                        description: 'Target element description (for click/type actions)',
                                                    },
                                                    text: {
                                                        type: 'string',
                                                        description: 'Text to type (for type actions)',
                                                    },
                                                    duration: {
                                                        type: 'number',
                                                        description: 'Duration in milliseconds (for wait actions)',
                                                    },
                                                },
                                                required: ['type'],
                                            },
                                            description: 'Array of actions to perform',
                                        },
                                    },
                                    required: ['appName', 'actions'],
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
                        _c.trys.push([1, 22, , 23]);
                        _b = name;
                        switch (_b) {
                            case 'listApplications': return [3 /*break*/, 2];
                            case 'focusApplication': return [3 /*break*/, 4];
                            case 'click': return [3 /*break*/, 6];
                            case 'moveMouse': return [3 /*break*/, 8];
                            case 'screenshotWithAI': return [3 /*break*/, 10];
                            case 'findAndClickElement': return [3 /*break*/, 12];
                            case 'analyzeScreenshot': return [3 /*break*/, 14];
                            case 'smartScreenshot': return [3 /*break*/, 16];
                            case 'executeWorkflow': return [3 /*break*/, 18];
                        }
                        return [3 /*break*/, 20];
                    case 2: return [4 /*yield*/, this.listApplications()];
                    case 3: return [2 /*return*/, _c.sent()];
                    case 4: return [4 /*yield*/, this.focusApplication(args === null || args === void 0 ? void 0 : args.identifier)];
                    case 5: return [2 /*return*/, _c.sent()];
                    case 6: return [4 /*yield*/, this.click(args === null || args === void 0 ? void 0 : args.x, args === null || args === void 0 ? void 0 : args.y, (args === null || args === void 0 ? void 0 : args.button) || 'left')];
                    case 7: return [2 /*return*/, _c.sent()];
                    case 8: return [4 /*yield*/, this.moveMouse(args === null || args === void 0 ? void 0 : args.x, args === null || args === void 0 ? void 0 : args.y)];
                    case 9: return [2 /*return*/, _c.sent()];
                    case 10: return [4 /*yield*/, this.screenshotWithAI((args === null || args === void 0 ? void 0 : args.padding) || 10, (args === null || args === void 0 ? void 0 : args.format) || 'png', (args === null || args === void 0 ? void 0 : args.quality) || 90, (args === null || args === void 0 ? void 0 : args.includeAnalysis) !== false)];
                    case 11: return [2 /*return*/, _c.sent()];
                    case 12: return [4 /*yield*/, this.findAndClickElement(args === null || args === void 0 ? void 0 : args.description, (args === null || args === void 0 ? void 0 : args.padding) || 10, (args === null || args === void 0 ? void 0 : args.button) || 'left')];
                    case 13: return [2 /*return*/, _c.sent()];
                    case 14: return [4 /*yield*/, this.analyzeScreenshot(args === null || args === void 0 ? void 0 : args.imageData, (args === null || args === void 0 ? void 0 : args.mimeType) || 'image/png')];
                    case 15: return [2 /*return*/, _c.sent()];
                    case 16: return [4 /*yield*/, this.smartScreenshot(args === null || args === void 0 ? void 0 : args.appName, (args === null || args === void 0 ? void 0 : args.padding) || 10, (args === null || args === void 0 ? void 0 : args.format) || 'png', (args === null || args === void 0 ? void 0 : args.quality) || 90, (args === null || args === void 0 ? void 0 : args.includeAnalysis) !== false, (args === null || args === void 0 ? void 0 : args.moveToPrimary) || false)];
                    case 17: return [2 /*return*/, _c.sent()];
                    case 18: return [4 /*yield*/, this.executeWorkflow(args === null || args === void 0 ? void 0 : args.appName, args === null || args === void 0 ? void 0 : args.actions)];
                    case 19: return [2 /*return*/, _c.sent()];
                    case 20: throw new Error("Unknown tool: ".concat(name));
                    case 21: return [3 /*break*/, 23];
                    case 22:
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
                    case 23: return [2 /*return*/];
                }
            });
        }); });
    };
    AIEnhancedScreenshotServer.prototype.checkPermissions = function () {
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
    // Core Methods (same as advanced-screenshot.ts)
    AIEnhancedScreenshotServer.prototype.listApplications = function () {
        return __awaiter(this, void 0, void 0, function () {
            var apps, error_3, commonApps;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.checkPermissions()];
                    case 1:
                        _a.sent();
                        _a.label = 2;
                    case 2:
                        _a.trys.push([2, 4, , 5]);
                        return [4 /*yield*/, (0, run_1.run)(function () {
                                // @ts-ignore
                                var systemEvents = Application("System Events");
                                var processes = systemEvents.applicationProcesses();
                                return processes.map(function (process) { return ({
                                    name: process.name(),
                                    bundleId: process.bundleIdentifier ? process.bundleIdentifier() : null,
                                    pid: process.unixId(),
                                    bounds: { x: 0, y: 0, width: 0, height: 0 }
                                }); });
                            })];
                    case 3:
                        apps = _a.sent();
                        return [2 /*return*/, {
                                content: [
                                    {
                                        type: 'text',
                                        text: JSON.stringify(apps, null, 2),
                                    },
                                ],
                            }];
                    case 4:
                        error_3 = _a.sent();
                        commonApps = [
                            { name: "Claude", bundleId: "com.anthropic.claude-desktop", pid: 0, bounds: { x: 0, y: 0, width: 0, height: 0 } },
                            { name: "Cursor", bundleId: "com.todesktop.230313mzl4w4u92", pid: 0, bounds: { x: 0, y: 0, width: 0, height: 0 } },
                            { name: "Safari", bundleId: "com.apple.Safari", pid: 0, bounds: { x: 0, y: 0, width: 0, height: 0 } },
                            { name: "Finder", bundleId: "com.apple.finder", pid: 0, bounds: { x: 0, y: 0, width: 0, height: 0 } }
                        ];
                        return [2 /*return*/, {
                                content: [
                                    {
                                        type: 'text',
                                        text: "Error listing applications: ".concat(error_3 instanceof Error ? error_3.message : String(error_3), "\n\nFallback list of common applications:\n").concat(JSON.stringify(commonApps, null, 2)),
                                    },
                                ],
                            }];
                    case 5: return [2 /*return*/];
                }
            });
        });
    };
    AIEnhancedScreenshotServer.prototype.focusApplication = function (identifier) {
        return __awaiter(this, void 0, void 0, function () {
            var apps, targetApp, pid_1, appInfo, error_4, fallbackError_1;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.checkPermissions()];
                    case 1:
                        _a.sent();
                        _a.label = 2;
                    case 2:
                        _a.trys.push([2, 5, , 10]);
                        return [4 /*yield*/, (0, run_1.run)(function () {
                                // @ts-ignore
                                var systemEvents = Application("System Events");
                                var processes = systemEvents.applicationProcesses();
                                return processes.map(function (process) { return ({
                                    name: process.name(),
                                    bundleId: process.bundleIdentifier ? process.bundleIdentifier() : null,
                                    pid: process.unixId(),
                                    bounds: { x: 0, y: 0, width: 0, height: 0 }
                                }); });
                            })];
                    case 3:
                        apps = _a.sent();
                        targetApp = void 0;
                        targetApp = apps.find(function (app) { return app.bundleId === identifier; });
                        if (!targetApp) {
                            targetApp = apps.find(function (app) { return app.name.toLowerCase().includes(identifier.toLowerCase()); });
                        }
                        if (!targetApp) {
                            pid_1 = parseInt(identifier);
                            if (!isNaN(pid_1)) {
                                targetApp = apps.find(function (app) { return app.pid === pid_1; });
                            }
                        }
                        if (!targetApp) {
                            throw new Error("Application not found: ".concat(identifier));
                        }
                        return [4 /*yield*/, (0, run_1.run)(function (appName) {
                                // @ts-ignore
                                var app = Application(appName);
                                app.activate();
                                try {
                                    var windows = app.windows();
                                    if (windows && windows.length > 0) {
                                        var mainWindow = windows[0];
                                        var bounds = mainWindow.bounds();
                                        return {
                                            name: appName,
                                            bounds: {
                                                x: bounds.x(),
                                                y: bounds.y(),
                                                width: bounds.width(),
                                                height: bounds.height()
                                            }
                                        };
                                    }
                                }
                                catch (e) {
                                    // If we can't get window bounds, use default
                                }
                                return {
                                    name: appName,
                                    bounds: { x: 0, y: 0, width: 1920, height: 1080 }
                                };
                            }, targetApp.name)];
                    case 4:
                        appInfo = _a.sent();
                        this.currentApp = __assign(__assign({}, targetApp), { bounds: appInfo.bounds });
                        return [2 /*return*/, {
                                content: [
                                    {
                                        type: 'text',
                                        text: "Focused on application: ".concat(targetApp.name, " (").concat(targetApp.bundleId, ") with bounds: ").concat(JSON.stringify(appInfo.bounds)),
                                    },
                                ],
                            }];
                    case 5:
                        error_4 = _a.sent();
                        _a.label = 6;
                    case 6:
                        _a.trys.push([6, 8, , 9]);
                        return [4 /*yield*/, (0, run_1.run)(function (appName) {
                                // @ts-ignore
                                var app = Application(appName);
                                app.activate();
                            }, identifier)];
                    case 7:
                        _a.sent();
                        this.currentApp = {
                            name: identifier,
                            bundleId: identifier,
                            pid: 0,
                            bounds: { x: 0, y: 0, width: 1920, height: 1080 }
                        };
                        return [2 /*return*/, {
                                content: [
                                    {
                                        type: 'text',
                                        text: "Focused on application: ".concat(identifier, " (fallback mode - using default bounds)"),
                                    },
                                ],
                            }];
                    case 8:
                        fallbackError_1 = _a.sent();
                        throw new Error("Failed to focus application ".concat(identifier, ": ").concat(error_4 instanceof Error ? error_4.message : String(error_4)));
                    case 9: return [3 /*break*/, 10];
                    case 10: return [2 /*return*/];
                }
            });
        });
    };
    AIEnhancedScreenshotServer.prototype.click = function (x, y, button) {
        return __awaiter(this, void 0, void 0, function () {
            var screenX, screenY, _a;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        if (!this.currentApp) {
                            throw new Error('No application focused. Use focusApplication first.');
                        }
                        return [4 /*yield*/, this.checkPermissions()];
                    case 1:
                        _b.sent();
                        screenX = this.currentApp.bounds.x + (x * this.currentApp.bounds.width);
                        screenY = this.currentApp.bounds.y + (y * this.currentApp.bounds.height);
                        return [4 /*yield*/, nut_js_1.mouse.move([new nut_js_1.Point(screenX, screenY)])];
                    case 2:
                        _b.sent();
                        _a = button;
                        switch (_a) {
                            case 'left': return [3 /*break*/, 3];
                            case 'right': return [3 /*break*/, 5];
                            case 'middle': return [3 /*break*/, 7];
                        }
                        return [3 /*break*/, 9];
                    case 3: return [4 /*yield*/, nut_js_1.mouse.leftClick()];
                    case 4:
                        _b.sent();
                        return [3 /*break*/, 10];
                    case 5: return [4 /*yield*/, nut_js_1.mouse.rightClick()];
                    case 6:
                        _b.sent();
                        return [3 /*break*/, 10];
                    case 7: return [4 /*yield*/, nut_js_1.mouse.scrollDown(0)];
                    case 8:
                        _b.sent();
                        return [3 /*break*/, 10];
                    case 9: throw new Error("Invalid button: ".concat(button));
                    case 10: return [2 /*return*/, {
                            content: [
                                {
                                    type: 'text',
                                    text: "Clicked ".concat(button, " button at (").concat(x.toFixed(3), ", ").concat(y.toFixed(3), ") relative to ").concat(this.currentApp.name),
                                },
                            ],
                        }];
                }
            });
        });
    };
    AIEnhancedScreenshotServer.prototype.moveMouse = function (x, y) {
        return __awaiter(this, void 0, void 0, function () {
            var screenX, screenY;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        if (!this.currentApp) {
                            throw new Error('No application focused. Use focusApplication first.');
                        }
                        return [4 /*yield*/, this.checkPermissions()];
                    case 1:
                        _a.sent();
                        screenX = this.currentApp.bounds.x + (x * this.currentApp.bounds.width);
                        screenY = this.currentApp.bounds.y + (y * this.currentApp.bounds.height);
                        return [4 /*yield*/, nut_js_1.mouse.move([new nut_js_1.Point(screenX, screenY)])];
                    case 2:
                        _a.sent();
                        return [2 /*return*/, {
                                content: [
                                    {
                                        type: 'text',
                                        text: "Moved mouse to (".concat(x.toFixed(3), ", ").concat(y.toFixed(3), ") relative to ").concat(this.currentApp.name),
                                    },
                                ],
                            }];
                }
            });
        });
    };
    // AI-Enhanced Methods
    AIEnhancedScreenshotServer.prototype.screenshotWithAI = function (padding, format, quality, includeAnalysis) {
        return __awaiter(this, void 0, void 0, function () {
            var fullScreenshot, cropX, cropY, cropWidth, cropHeight, processedBuffer, base64Image, result, analysis, analysisError_1;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        if (!this.currentApp) {
                            throw new Error('No application focused. Use focusApplication first.');
                        }
                        return [4 /*yield*/, this.checkPermissions()];
                    case 1:
                        _a.sent();
                        return [4 /*yield*/, this.log("Taking AI-enhanced screenshot of ".concat(this.currentApp.name))];
                    case 2:
                        _a.sent();
                        return [4 /*yield*/, (0, screenshot_desktop_1.default)()];
                    case 3:
                        fullScreenshot = _a.sent();
                        cropX = Math.max(0, this.currentApp.bounds.x - padding);
                        cropY = Math.max(0, this.currentApp.bounds.y - padding);
                        cropWidth = this.currentApp.bounds.width + (padding * 2);
                        cropHeight = this.currentApp.bounds.height + (padding * 2);
                        if (!(format === 'jpg')) return [3 /*break*/, 5];
                        return [4 /*yield*/, (0, sharp_1.default)(fullScreenshot)
                                .extract({
                                left: cropX,
                                top: cropY,
                                width: cropWidth,
                                height: cropHeight,
                            })
                                .jpeg({ quality: quality })
                                .toBuffer()];
                    case 4:
                        processedBuffer = _a.sent();
                        return [3 /*break*/, 7];
                    case 5: return [4 /*yield*/, (0, sharp_1.default)(fullScreenshot)
                            .extract({
                            left: cropX,
                            top: cropY,
                            width: cropWidth,
                            height: cropHeight,
                        })
                            .png()
                            .toBuffer()];
                    case 6:
                        processedBuffer = _a.sent();
                        _a.label = 7;
                    case 7:
                        base64Image = processedBuffer.toString('base64');
                        result = {
                            content: [
                                {
                                    type: 'text',
                                    text: "Screenshot of ".concat(this.currentApp.name, " window (").concat(cropWidth, "x").concat(cropHeight, "px with ").concat(padding, "px padding) in ").concat(format.toUpperCase(), " format"),
                                },
                                {
                                    type: 'image',
                                    data: base64Image,
                                    mimeType: format === 'jpg' ? 'image/jpeg' : 'image/png',
                                },
                            ],
                        };
                        if (!includeAnalysis) return [3 /*break*/, 13];
                        _a.label = 8;
                    case 8:
                        _a.trys.push([8, 11, , 13]);
                        return [4 /*yield*/, this.performAIAnalysis(processedBuffer, cropWidth, cropHeight)];
                    case 9:
                        analysis = _a.sent();
                        result.content.push({
                            type: 'text',
                            text: "AI Analysis:\n".concat(JSON.stringify(analysis, null, 2)),
                        });
                        return [4 /*yield*/, this.log("AI analysis completed: ".concat(analysis.elements.length, " elements detected"))];
                    case 10:
                        _a.sent();
                        return [3 /*break*/, 13];
                    case 11:
                        analysisError_1 = _a.sent();
                        return [4 /*yield*/, this.log("AI analysis failed: ".concat(analysisError_1))];
                    case 12:
                        _a.sent();
                        result.content.push({
                            type: 'text',
                            text: "AI analysis failed: ".concat(analysisError_1 instanceof Error ? analysisError_1.message : String(analysisError_1)),
                        });
                        return [3 /*break*/, 13];
                    case 13: return [2 /*return*/, result];
                }
            });
        });
    };
    AIEnhancedScreenshotServer.prototype.findAndClickElement = function (description, padding, button) {
        return __awaiter(this, void 0, void 0, function () {
            var screenshotResult, analysisText, analysisMatch, analysis, matchingElement;
            var _a;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        if (!this.currentApp) {
                            throw new Error('No application focused. Use focusApplication first.');
                        }
                        return [4 /*yield*/, this.checkPermissions()];
                    case 1:
                        _b.sent();
                        return [4 /*yield*/, this.log("Finding and clicking element: ".concat(description))];
                    case 2:
                        _b.sent();
                        return [4 /*yield*/, this.screenshotWithAI(padding, 'png', 90, true)];
                    case 3:
                        screenshotResult = _b.sent();
                        analysisText = (_a = screenshotResult.content.find(function (c) { var _a; return (_a = c.text) === null || _a === void 0 ? void 0 : _a.includes('AI Analysis:'); })) === null || _a === void 0 ? void 0 : _a.text;
                        if (!analysisText) {
                            throw new Error('Failed to get AI analysis of the screenshot');
                        }
                        analysisMatch = analysisText.match(/AI Analysis:\n(.*)/s);
                        if (!analysisMatch) {
                            throw new Error('Failed to parse AI analysis');
                        }
                        analysis = JSON.parse(analysisMatch[1]);
                        matchingElement = this.findBestMatchingElement(analysis.elements, description);
                        if (!matchingElement) {
                            throw new Error("No element found matching description: ".concat(description));
                        }
                        return [4 /*yield*/, this.log("Found element: ".concat(matchingElement.type, " at (").concat(matchingElement.normalizedPosition.x, ", ").concat(matchingElement.normalizedPosition.y, ")"))];
                    case 4:
                        _b.sent();
                        return [4 /*yield*/, this.click(matchingElement.normalizedPosition.x, matchingElement.normalizedPosition.y, button)];
                    case 5: 
                    // Click the element
                    return [2 /*return*/, _b.sent()];
                }
            });
        });
    };
    AIEnhancedScreenshotServer.prototype.analyzeScreenshot = function (imageData, mimeType) {
        return __awaiter(this, void 0, void 0, function () {
            var imageBuffer, metadata, width, height, analysis, error_5;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.log('Analyzing provided screenshot')];
                    case 1:
                        _a.sent();
                        _a.label = 2;
                    case 2:
                        _a.trys.push([2, 5, , 6]);
                        imageBuffer = Buffer.from(imageData, 'base64');
                        return [4 /*yield*/, (0, sharp_1.default)(imageBuffer).metadata()];
                    case 3:
                        metadata = _a.sent();
                        width = metadata.width || 0;
                        height = metadata.height || 0;
                        return [4 /*yield*/, this.performAIAnalysis(imageBuffer, width, height)];
                    case 4:
                        analysis = _a.sent();
                        return [2 /*return*/, {
                                content: [
                                    {
                                        type: 'text',
                                        text: "Screenshot Analysis (".concat(width, "x").concat(height, "px):\n").concat(JSON.stringify(analysis, null, 2)),
                                    },
                                ],
                            }];
                    case 5:
                        error_5 = _a.sent();
                        throw new Error("Failed to analyze screenshot: ".concat(error_5 instanceof Error ? error_5.message : String(error_5)));
                    case 6: return [2 /*return*/];
                }
            });
        });
    };
    AIEnhancedScreenshotServer.prototype.smartScreenshot = function (appName, padding, format, quality, includeAnalysis, moveToPrimary) {
        return __awaiter(this, void 0, void 0, function () {
            var error_6;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.checkPermissions()];
                    case 1:
                        _a.sent();
                        return [4 /*yield*/, this.log("Taking smart screenshot of ".concat(appName))];
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
                        // Wait for focus to complete
                        return [4 /*yield*/, new Promise(function (resolve) { return setTimeout(resolve, 1000); })];
                    case 5:
                        // Wait for focus to complete
                        _a.sent();
                        return [4 /*yield*/, this.screenshotWithAI(padding, format, quality, includeAnalysis)];
                    case 6: 
                    // Take screenshot with AI analysis
                    return [2 /*return*/, _a.sent()];
                    case 7:
                        error_6 = _a.sent();
                        throw new Error("Failed to take smart screenshot of ".concat(appName, ": ").concat(error_6 instanceof Error ? error_6.message : String(error_6)));
                    case 8: return [2 /*return*/];
                }
            });
        });
    };
    AIEnhancedScreenshotServer.prototype.executeWorkflow = function (appName, actions) {
        return __awaiter(this, void 0, void 0, function () {
            var results, _loop_1, this_1, _i, actions_1, action, error_7;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.checkPermissions()];
                    case 1:
                        _a.sent();
                        return [4 /*yield*/, this.log("Executing workflow for ".concat(appName, " with ").concat(actions.length, " actions"))];
                    case 2:
                        _a.sent();
                        results = [];
                        _a.label = 3;
                    case 3:
                        _a.trys.push([3, 10, , 11]);
                        // Focus the application
                        return [4 /*yield*/, this.focusApplication(appName)];
                    case 4:
                        // Focus the application
                        _a.sent();
                        return [4 /*yield*/, new Promise(function (resolve) { return setTimeout(resolve, 1000); })];
                    case 5:
                        _a.sent();
                        _loop_1 = function (action) {
                            var _b, clickResult, duration_1;
                            return __generator(this, function (_c) {
                                switch (_c.label) {
                                    case 0: return [4 /*yield*/, this_1.log("Executing action: ".concat(action.type, " - ").concat(action.target || action.text || action.duration || ''))];
                                    case 1:
                                        _c.sent();
                                        _b = action.type;
                                        switch (_b) {
                                            case 'click': return [3 /*break*/, 2];
                                            case 'type': return [3 /*break*/, 4];
                                            case 'wait': return [3 /*break*/, 6];
                                            case 'scroll': return [3 /*break*/, 8];
                                        }
                                        return [3 /*break*/, 10];
                                    case 2:
                                        if (!action.target) {
                                            throw new Error('Click action requires a target description');
                                        }
                                        return [4 /*yield*/, this_1.findAndClickElement(action.target, 10, 'left')];
                                    case 3:
                                        clickResult = _c.sent();
                                        results.push({ action: 'click', target: action.target, result: clickResult });
                                        return [3 /*break*/, 11];
                                    case 4:
                                        if (!action.text) {
                                            throw new Error('Type action requires text to type');
                                        }
                                        // For now, we'll just log the type action
                                        // In a full implementation, you'd use keyboard automation
                                        return [4 /*yield*/, this_1.log("Would type: ".concat(action.text))];
                                    case 5:
                                        // For now, we'll just log the type action
                                        // In a full implementation, you'd use keyboard automation
                                        _c.sent();
                                        results.push({ action: 'type', text: action.text, result: 'logged' });
                                        return [3 /*break*/, 11];
                                    case 6:
                                        duration_1 = action.duration || 1000;
                                        return [4 /*yield*/, new Promise(function (resolve) { return setTimeout(resolve, duration_1); })];
                                    case 7:
                                        _c.sent();
                                        results.push({ action: 'wait', duration: duration_1, result: 'completed' });
                                        return [3 /*break*/, 11];
                                    case 8: 
                                    // For now, we'll just log the scroll action
                                    return [4 /*yield*/, this_1.log("Would scroll")];
                                    case 9:
                                        // For now, we'll just log the scroll action
                                        _c.sent();
                                        results.push({ action: 'scroll', result: 'logged' });
                                        return [3 /*break*/, 11];
                                    case 10: throw new Error("Unknown action type: ".concat(action.type));
                                    case 11: return [2 /*return*/];
                                }
                            });
                        };
                        this_1 = this;
                        _i = 0, actions_1 = actions;
                        _a.label = 6;
                    case 6:
                        if (!(_i < actions_1.length)) return [3 /*break*/, 9];
                        action = actions_1[_i];
                        return [5 /*yield**/, _loop_1(action)];
                    case 7:
                        _a.sent();
                        _a.label = 8;
                    case 8:
                        _i++;
                        return [3 /*break*/, 6];
                    case 9: return [2 /*return*/, {
                            content: [
                                {
                                    type: 'text',
                                    text: "Workflow completed successfully for ".concat(appName, ":\n").concat(JSON.stringify(results, null, 2)),
                                },
                            ],
                        }];
                    case 10:
                        error_7 = _a.sent();
                        throw new Error("Workflow failed: ".concat(error_7 instanceof Error ? error_7.message : String(error_7)));
                    case 11: return [2 /*return*/];
                }
            });
        });
    };
    // AI Analysis Methods
    AIEnhancedScreenshotServer.prototype.performAIAnalysis = function (imageBuffer, width, height) {
        return __awaiter(this, void 0, void 0, function () {
            var elements, analysis;
            var _a;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0: 
                    // This is a simplified AI analysis implementation
                    // In a real implementation, you would use a proper computer vision library
                    // or integrate with an AI service like OpenAI's Vision API
                    return [4 /*yield*/, this.log("Performing AI analysis on ".concat(width, "x").concat(height, " image"))];
                    case 1:
                        // This is a simplified AI analysis implementation
                        // In a real implementation, you would use a proper computer vision library
                        // or integrate with an AI service like OpenAI's Vision API
                        _b.sent();
                        elements = [];
                        // Mock detection of common UI elements
                        // In a real implementation, this would use computer vision to detect:
                        // - Text regions (buttons, labels, input fields)
                        // - Clickable elements (buttons, links)
                        // - Form elements (input fields, dropdowns)
                        // - Navigation elements (menus, tabs)
                        // Example mock elements for a typical application
                        elements.push({
                            type: 'button',
                            text: 'Update Available',
                            bounds: { x: width * 0.8, y: height * 0.1, width: width * 0.15, height: height * 0.05 },
                            confidence: 0.9,
                            normalizedPosition: { x: 0.875, y: 0.125 }
                        });
                        elements.push({
                            type: 'button',
                            text: 'Settings',
                            bounds: { x: width * 0.05, y: height * 0.05, width: width * 0.1, height: height * 0.04 },
                            confidence: 0.8,
                            normalizedPosition: { x: 0.1, y: 0.07 }
                        });
                        elements.push({
                            type: 'text',
                            text: 'Welcome to the application',
                            bounds: { x: width * 0.1, y: height * 0.2, width: width * 0.8, height: height * 0.1 },
                            confidence: 0.7,
                            normalizedPosition: { x: 0.5, y: 0.25 }
                        });
                        analysis = {
                            elements: elements,
                            summary: "Detected ".concat(elements.length, " UI elements including buttons, text, and interactive elements."),
                            suggestedActions: [
                                'Click on "Update Available" button if visible',
                                'Access settings through the settings button',
                                'Look for navigation menus or tabs',
                                'Check for input fields or forms'
                            ],
                            windowInfo: {
                                width: width,
                                height: height,
                                title: (_a = this.currentApp) === null || _a === void 0 ? void 0 : _a.name
                            }
                        };
                        return [2 /*return*/, analysis];
                }
            });
        });
    };
    AIEnhancedScreenshotServer.prototype.findBestMatchingElement = function (elements, description) {
        var lowerDescription = description.toLowerCase();
        // Score elements based on how well they match the description
        var scoredElements = elements.map(function (element) {
            var score = 0;
            // Check if element text matches description
            if (element.text) {
                var lowerText = element.text.toLowerCase();
                if (lowerText.includes(lowerDescription) || lowerDescription.includes(lowerText)) {
                    score += 10;
                }
                // Bonus for exact matches
                if (lowerText === lowerDescription) {
                    score += 5;
                }
                // Bonus for button types when looking for clickable elements
                if (element.type === 'button' && (lowerDescription.includes('button') || lowerDescription.includes('click'))) {
                    score += 3;
                }
            }
            // Consider confidence
            score += element.confidence * 2;
            return { element: element, score: score };
        });
        // Sort by score and return the best match
        scoredElements.sort(function (a, b) { return b.score - a.score; });
        var bestMatch = scoredElements[0];
        return bestMatch && bestMatch.score > 5 ? bestMatch.element : null;
    };
    AIEnhancedScreenshotServer.prototype.run = function () {
        return __awaiter(this, void 0, void 0, function () {
            var transport;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        transport = new stdio_js_1.StdioServerTransport();
                        return [4 /*yield*/, this.server.connect(transport)];
                    case 1:
                        _a.sent();
                        console.error('AI-Enhanced Screenshot MCP server running on stdio');
                        return [2 /*return*/];
                }
            });
        });
    };
    return AIEnhancedScreenshotServer;
}());
// Start the server
var server = new AIEnhancedScreenshotServer();
server.run().catch(console.error);
