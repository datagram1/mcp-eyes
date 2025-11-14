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
var path = require("path");
var enhanced_window_bounds_1 = require("./enhanced-window-bounds");
var web_content_detector_1 = require("./web-content-detector");
var WebAwareServer = /** @class */ (function () {
    function WebAwareServer() {
        this.currentApp = null;
        this.logFile = '/Users/richardbrown/dev/mcp_eyes/test-screenshots/web-aware-debug-log.md';
        this.server = new index_js_1.Server({
            name: 'web-aware-server',
            version: '1.1.15',
        });
        this.webDetector = new web_content_detector_1.WebContentDetector();
        this.setupToolHandlers();
    }
    WebAwareServer.prototype.log = function (message) {
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
    WebAwareServer.prototype.setupToolHandlers = function () {
        var _this = this;
        this.server.setRequestHandler(types_js_1.ListToolsRequestSchema, function () { return __awaiter(_this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                return [2 /*return*/, {
                        tools: [
                            {
                                name: 'getWebElements',
                                description: 'Get all web elements (links, buttons) from browser content',
                                inputSchema: {
                                    type: 'object',
                                    properties: {
                                        appName: {
                                            type: 'string',
                                            description: 'Name of the browser application (e.g., "Google Chrome")',
                                        },
                                        includeScreenCoordinates: {
                                            type: 'boolean',
                                            description: 'Whether to include absolute screen coordinates',
                                            default: true
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
                                name: 'clickWebElement',
                                description: 'Click a specific web element by index',
                                inputSchema: {
                                    type: 'object',
                                    properties: {
                                        appName: {
                                            type: 'string',
                                            description: 'Name of the browser application',
                                        },
                                        elementIndex: {
                                            type: 'number',
                                            description: 'Index of the element from getWebElements result',
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
                                name: 'findAndClickWebElement',
                                description: 'Find and click a web element by text content',
                                inputSchema: {
                                    type: 'object',
                                    properties: {
                                        appName: {
                                            type: 'string',
                                            description: 'Name of the browser application',
                                        },
                                        searchText: {
                                            type: 'string',
                                            description: 'Text content to search for',
                                        },
                                        button: {
                                            type: 'string',
                                            enum: ['left', 'right', 'middle'],
                                            description: 'Mouse button to click',
                                            default: 'left'
                                        }
                                    },
                                    required: ['appName', 'searchText'],
                                },
                            },
                            {
                                name: 'testWebDetection',
                                description: 'Test web content detection capabilities',
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
                                name: 'moveMouseToWebElement',
                                description: 'Move mouse to a specific web element without clicking',
                                inputSchema: {
                                    type: 'object',
                                    properties: {
                                        appName: {
                                            type: 'string',
                                            description: 'Name of the browser application',
                                        },
                                        elementIndex: {
                                            type: 'number',
                                            description: 'Index of the element from getWebElements result',
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
                                name: 'screenshotAndAnalyze',
                                description: 'Take screenshot and analyze web content',
                                inputSchema: {
                                    type: 'object',
                                    properties: {
                                        appName: {
                                            type: 'string',
                                            description: 'Name of the browser application',
                                        },
                                        padding: {
                                            type: 'number',
                                            description: 'Padding around the window in pixels',
                                            default: 10
                                        },
                                        includeImage: {
                                            type: 'boolean',
                                            description: 'Whether to include the screenshot image in response',
                                            default: false
                                        }
                                    },
                                    required: ['appName'],
                                },
                            },
                            {
                                name: 'typeText',
                                description: 'Type text into a web element (search box, input field)',
                                inputSchema: {
                                    type: 'object',
                                    properties: {
                                        appName: {
                                            type: 'string',
                                            description: 'Name of the browser application',
                                        },
                                        elementIndex: {
                                            type: 'number',
                                            description: 'Index of the input element from getWebElements result',
                                        },
                                        text: {
                                            type: 'string',
                                            description: 'Text to type into the element',
                                        },
                                        clearFirst: {
                                            type: 'boolean',
                                            description: 'Whether to clear the field before typing',
                                            default: true
                                        }
                                    },
                                    required: ['appName', 'elementIndex', 'text'],
                                },
                            },
                            {
                                name: 'googleSearch',
                                description: 'Complete Google search workflow: find search box, type query, click search button',
                                inputSchema: {
                                    type: 'object',
                                    properties: {
                                        appName: {
                                            type: 'string',
                                            description: 'Name of the browser application',
                                            default: 'Google Chrome'
                                        },
                                        searchQuery: {
                                            type: 'string',
                                            description: 'Search query to type (e.g., "telephone poles")',
                                        },
                                        searchButtonText: {
                                            type: 'string',
                                            description: 'Text of the search button to click (e.g., "AI Mode", "Google Search")',
                                            default: 'AI Mode'
                                        }
                                    },
                                    required: ['searchQuery'],
                                },
                            },
                            {
                                name: 'findSearchBox',
                                description: 'Find and return the search box element',
                                inputSchema: {
                                    type: 'object',
                                    properties: {
                                        appName: {
                                            type: 'string',
                                            description: 'Name of the browser application',
                                        }
                                    },
                                    required: ['appName'],
                                },
                            },
                            {
                                name: 'findButton',
                                description: 'Find a button by text content',
                                inputSchema: {
                                    type: 'object',
                                    properties: {
                                        appName: {
                                            type: 'string',
                                            description: 'Name of the browser application',
                                        },
                                        buttonText: {
                                            type: 'string',
                                            description: 'Text content of the button to find',
                                        }
                                    },
                                    required: ['appName', 'buttonText'],
                                },
                            },
                            {
                                name: 'takeVerificationScreenshot',
                                description: 'Take a screenshot for verification purposes (after text input or button click)',
                                inputSchema: {
                                    type: 'object',
                                    properties: {
                                        appName: {
                                            type: 'string',
                                            description: 'Name of the browser application',
                                        },
                                        description: {
                                            type: 'string',
                                            description: 'Description of what this screenshot is verifying',
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
                                        }
                                    },
                                    required: ['appName', 'description'],
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
                        _c.trys.push([1, 30, , 31]);
                        _b = name;
                        switch (_b) {
                            case 'getWebElements': return [3 /*break*/, 2];
                            case 'clickWebElement': return [3 /*break*/, 4];
                            case 'findAndClickWebElement': return [3 /*break*/, 6];
                            case 'testWebDetection': return [3 /*break*/, 8];
                            case 'listApplications': return [3 /*break*/, 10];
                            case 'focusApplication': return [3 /*break*/, 12];
                            case 'moveMouseToWebElement': return [3 /*break*/, 14];
                            case 'screenshotAndAnalyze': return [3 /*break*/, 16];
                            case 'typeText': return [3 /*break*/, 18];
                            case 'googleSearch': return [3 /*break*/, 20];
                            case 'findSearchBox': return [3 /*break*/, 22];
                            case 'findButton': return [3 /*break*/, 24];
                            case 'takeVerificationScreenshot': return [3 /*break*/, 26];
                        }
                        return [3 /*break*/, 28];
                    case 2: return [4 /*yield*/, this.getWebElements(args === null || args === void 0 ? void 0 : args.appName, (args === null || args === void 0 ? void 0 : args.includeScreenCoordinates) !== false, args === null || args === void 0 ? void 0 : args.searchText)];
                    case 3: return [2 /*return*/, _c.sent()];
                    case 4: return [4 /*yield*/, this.clickWebElement(args === null || args === void 0 ? void 0 : args.appName, args === null || args === void 0 ? void 0 : args.elementIndex, (args === null || args === void 0 ? void 0 : args.button) || 'left', (args === null || args === void 0 ? void 0 : args.useScreenCoordinates) !== false)];
                    case 5: return [2 /*return*/, _c.sent()];
                    case 6: return [4 /*yield*/, this.findAndClickWebElement(args === null || args === void 0 ? void 0 : args.appName, args === null || args === void 0 ? void 0 : args.searchText, (args === null || args === void 0 ? void 0 : args.button) || 'left')];
                    case 7: return [2 /*return*/, _c.sent()];
                    case 8: return [4 /*yield*/, this.testWebDetection()];
                    case 9: return [2 /*return*/, _c.sent()];
                    case 10: return [4 /*yield*/, this.listApplications()];
                    case 11: return [2 /*return*/, _c.sent()];
                    case 12: return [4 /*yield*/, this.focusApplication(args === null || args === void 0 ? void 0 : args.identifier)];
                    case 13: return [2 /*return*/, _c.sent()];
                    case 14: return [4 /*yield*/, this.moveMouseToWebElement(args === null || args === void 0 ? void 0 : args.appName, args === null || args === void 0 ? void 0 : args.elementIndex, (args === null || args === void 0 ? void 0 : args.useScreenCoordinates) !== false)];
                    case 15: return [2 /*return*/, _c.sent()];
                    case 16: return [4 /*yield*/, this.screenshotAndAnalyze(args === null || args === void 0 ? void 0 : args.appName, (args === null || args === void 0 ? void 0 : args.padding) || 10, (args === null || args === void 0 ? void 0 : args.includeImage) !== false)];
                    case 17: return [2 /*return*/, _c.sent()];
                    case 18: return [4 /*yield*/, this.typeText(args === null || args === void 0 ? void 0 : args.appName, args === null || args === void 0 ? void 0 : args.elementIndex, args === null || args === void 0 ? void 0 : args.text, (args === null || args === void 0 ? void 0 : args.clearFirst) !== false)];
                    case 19: return [2 /*return*/, _c.sent()];
                    case 20: return [4 /*yield*/, this.googleSearch((args === null || args === void 0 ? void 0 : args.appName) || 'Google Chrome', args === null || args === void 0 ? void 0 : args.searchQuery, (args === null || args === void 0 ? void 0 : args.searchButtonText) || 'AI Mode')];
                    case 21: return [2 /*return*/, _c.sent()];
                    case 22: return [4 /*yield*/, this.findSearchBox(args === null || args === void 0 ? void 0 : args.appName)];
                    case 23: return [2 /*return*/, _c.sent()];
                    case 24: return [4 /*yield*/, this.findButton(args === null || args === void 0 ? void 0 : args.appName, args === null || args === void 0 ? void 0 : args.buttonText)];
                    case 25: return [2 /*return*/, _c.sent()];
                    case 26: return [4 /*yield*/, this.takeVerificationScreenshot(args === null || args === void 0 ? void 0 : args.appName, args === null || args === void 0 ? void 0 : args.description, (args === null || args === void 0 ? void 0 : args.padding) || 10, (args === null || args === void 0 ? void 0 : args.includeImage) !== false)];
                    case 27: return [2 /*return*/, _c.sent()];
                    case 28: throw new Error("Unknown tool: ".concat(name));
                    case 29: return [3 /*break*/, 31];
                    case 30:
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
                    case 31: return [2 /*return*/];
                }
            });
        }); });
    };
    WebAwareServer.prototype.checkPermissions = function () {
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
    WebAwareServer.prototype.listApplications = function () {
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
    WebAwareServer.prototype.focusApplication = function (identifier) {
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
    WebAwareServer.prototype.getWebElements = function (appName, includeScreenCoordinates, searchText) {
        return __awaiter(this, void 0, void 0, function () {
            var screenshot_1, analysis, elements, responseText, error_5;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.checkPermissions()];
                    case 1:
                        _a.sent();
                        return [4 /*yield*/, this.log("Getting web elements for ".concat(appName))];
                    case 2:
                        _a.sent();
                        _a.label = 3;
                    case 3:
                        _a.trys.push([3, 9, , 10]);
                        // Focus the application first
                        return [4 /*yield*/, this.focusApplication(appName)];
                    case 4:
                        // Focus the application first
                        _a.sent();
                        if (!this.currentApp) {
                            throw new Error('No application focused');
                        }
                        return [4 /*yield*/, this.takeScreenshot()];
                    case 5:
                        screenshot_1 = _a.sent();
                        return [4 /*yield*/, this.webDetector.analyzeWebContent(screenshot_1, this.currentApp.bounds, appName)];
                    case 6:
                        analysis = _a.sent();
                        elements = analysis.elements;
                        if (!searchText) return [3 /*break*/, 8];
                        return [4 /*yield*/, this.webDetector.findElementsByText(elements, searchText)];
                    case 7:
                        elements = _a.sent();
                        _a.label = 8;
                    case 8:
                        responseText = "Web Elements for ".concat(appName, ":\n\n") +
                            "Window bounds: ".concat(this.currentApp.bounds.width, "x").concat(this.currentApp.bounds.height, " at (").concat(this.currentApp.bounds.x, ", ").concat(this.currentApp.bounds.y, ")\n\n") +
                            "Found ".concat(elements.length, " web elements:\n\n") +
                            elements.map(function (el, index) {
                                return "".concat(index + 1, ". \"").concat(el.text || el.type, "\" (").concat(el.type, ") - ") +
                                    "Screen: (".concat(el.screenPosition.x, ", ").concat(el.screenPosition.y, ") | ") +
                                    "Normalized: (".concat(el.normalizedPosition.x.toFixed(3), ", ").concat(el.normalizedPosition.y.toFixed(3), ") | ") +
                                    "Confidence: ".concat(el.confidence, " | Method: ").concat(el.detectionMethod) +
                                    (el.url ? " | URL: ".concat(el.url) : '');
                            }).join('\n') +
                            "\n\nSuggested Actions:\n".concat(analysis.suggestedActions.join('\n'));
                        return [2 /*return*/, {
                                content: [
                                    {
                                        type: 'text',
                                        text: responseText,
                                    },
                                ],
                            }];
                    case 9:
                        error_5 = _a.sent();
                        throw new Error("Failed to get web elements: ".concat(error_5 instanceof Error ? error_5.message : String(error_5)));
                    case 10: return [2 /*return*/];
                }
            });
        });
    };
    WebAwareServer.prototype.clickWebElement = function (appName, elementIndex, button, useScreenCoordinates) {
        return __awaiter(this, void 0, void 0, function () {
            var elementsResult, elementsText, elements, lines, inElementsSection, _i, lines_1, line, match, element, targetX, targetY, _a, error_6;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0: return [4 /*yield*/, this.checkPermissions()];
                    case 1:
                        _b.sent();
                        return [4 /*yield*/, this.log("Clicking web element ".concat(elementIndex, " in ").concat(appName))];
                    case 2:
                        _b.sent();
                        _b.label = 3;
                    case 3:
                        _b.trys.push([3, 15, , 16]);
                        return [4 /*yield*/, this.getWebElements(appName, true)];
                    case 4:
                        elementsResult = _b.sent();
                        elementsText = elementsResult.content[0].text;
                        elements = [];
                        lines = elementsText.split('\n');
                        inElementsSection = false;
                        for (_i = 0, lines_1 = lines; _i < lines_1.length; _i++) {
                            line = lines_1[_i];
                            if (line.includes('Found') && line.includes('web elements:')) {
                                inElementsSection = true;
                                continue;
                            }
                            if (inElementsSection && line.match(/^\d+\./)) {
                                match = line.match(/(\d+)\. "(.+)" \((.+)\) - Screen: \(([0-9.]+), ([0-9.]+)\) \| Normalized: \(([0-9.]+), ([0-9.]+)\)/);
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
                                        detectionMethod: 'ai'
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
                                    text: "Successfully clicked web element ".concat(elementIndex + 1, " (\"").concat(element.text, "\") at (").concat(targetX, ", ").concat(targetY, ") with ").concat(button, " button"),
                                },
                            ],
                        }];
                    case 15:
                        error_6 = _b.sent();
                        throw new Error("Failed to click web element: ".concat(error_6 instanceof Error ? error_6.message : String(error_6)));
                    case 16: return [2 /*return*/];
                }
            });
        });
    };
    WebAwareServer.prototype.findAndClickWebElement = function (appName, searchText, button) {
        return __awaiter(this, void 0, void 0, function () {
            var elementsResult, elementsText, elements, lines, inElementsSection, _i, lines_2, line, match, error_7;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.checkPermissions()];
                    case 1:
                        _a.sent();
                        return [4 /*yield*/, this.log("Finding and clicking web element with text \"".concat(searchText, "\" in ").concat(appName))];
                    case 2:
                        _a.sent();
                        _a.label = 3;
                    case 3:
                        _a.trys.push([3, 6, , 7]);
                        return [4 /*yield*/, this.getWebElements(appName, true, searchText)];
                    case 4:
                        elementsResult = _a.sent();
                        elementsText = elementsResult.content[0].text;
                        elements = [];
                        lines = elementsText.split('\n');
                        inElementsSection = false;
                        for (_i = 0, lines_2 = lines; _i < lines_2.length; _i++) {
                            line = lines_2[_i];
                            if (line.includes('Found') && line.includes('web elements:')) {
                                inElementsSection = true;
                                continue;
                            }
                            if (inElementsSection && line.match(/^\d+\./)) {
                                match = line.match(/(\d+)\. "(.+)" \((.+)\) - Screen: \(([0-9.]+), ([0-9.]+)\) \| Normalized: \(([0-9.]+), ([0-9.]+)\)/);
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
                                        detectionMethod: 'ai'
                                    });
                                }
                            }
                        }
                        if (elements.length === 0) {
                            throw new Error("No web elements found matching text: \"".concat(searchText, "\""));
                        }
                        return [4 /*yield*/, this.clickWebElement(appName, 0, button, true)];
                    case 5: 
                    // Click the first matching element
                    return [2 /*return*/, _a.sent()];
                    case 6:
                        error_7 = _a.sent();
                        throw new Error("Failed to find and click web element: ".concat(error_7 instanceof Error ? error_7.message : String(error_7)));
                    case 7: return [2 /*return*/];
                }
            });
        });
    };
    WebAwareServer.prototype.moveMouseToWebElement = function (appName, elementIndex, useScreenCoordinates) {
        return __awaiter(this, void 0, void 0, function () {
            var elementsResult, elementsText, elements, lines, inElementsSection, _i, lines_3, line, match, element, targetX, targetY, error_8;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.checkPermissions()];
                    case 1:
                        _a.sent();
                        return [4 /*yield*/, this.log("Moving mouse to web element ".concat(elementIndex, " in ").concat(appName))];
                    case 2:
                        _a.sent();
                        _a.label = 3;
                    case 3:
                        _a.trys.push([3, 7, , 8]);
                        return [4 /*yield*/, this.getWebElements(appName, true)];
                    case 4:
                        elementsResult = _a.sent();
                        elementsText = elementsResult.content[0].text;
                        elements = [];
                        lines = elementsText.split('\n');
                        inElementsSection = false;
                        for (_i = 0, lines_3 = lines; _i < lines_3.length; _i++) {
                            line = lines_3[_i];
                            if (line.includes('Found') && line.includes('web elements:')) {
                                inElementsSection = true;
                                continue;
                            }
                            if (inElementsSection && line.match(/^\d+\./)) {
                                match = line.match(/(\d+)\. "(.+)" \((.+)\) - Screen: \(([0-9.]+), ([0-9.]+)\) \| Normalized: \(([0-9.]+), ([0-9.]+)\)/);
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
                                        detectionMethod: 'ai'
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
                                        text: "Successfully moved mouse to web element ".concat(elementIndex + 1, " (\"").concat(element.text, "\") at (").concat(targetX, ", ").concat(targetY, ")"),
                                    },
                                ],
                            }];
                    case 7:
                        error_8 = _a.sent();
                        throw new Error("Failed to move mouse to web element: ".concat(error_8 instanceof Error ? error_8.message : String(error_8)));
                    case 8: return [2 /*return*/];
                }
            });
        });
    };
    WebAwareServer.prototype.screenshotAndAnalyze = function (appName, padding, includeImage) {
        return __awaiter(this, void 0, void 0, function () {
            var screenshot_2, base64Image, analysis, result, error_9;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.checkPermissions()];
                    case 1:
                        _a.sent();
                        return [4 /*yield*/, this.log("Taking screenshot and analyzing web content for ".concat(appName))];
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
                        screenshot_2 = _a.sent();
                        base64Image = screenshot_2.toString('base64');
                        return [4 /*yield*/, this.webDetector.analyzeWebContent(screenshot_2, this.currentApp.bounds, appName)];
                    case 6:
                        analysis = _a.sent();
                        result = {
                            content: [
                                {
                                    type: 'text',
                                    text: "Screenshot and Web Analysis for ".concat(appName, " (").concat(this.currentApp.bounds.width, "x").concat(this.currentApp.bounds.height, "px with ").concat(padding, "px padding)\n\n").concat(analysis.summary, "\n\nFound ").concat(analysis.elements.length, " web elements:\n\n").concat(analysis.elements.map(function (el, index) {
                                        return "".concat(index + 1, ". \"").concat(el.text || el.type, "\" (").concat(el.type, ") - Confidence: ").concat(el.confidence, " | Method: ").concat(el.detectionMethod);
                                    }).join('\n')),
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
                        return [2 /*return*/, result];
                    case 7:
                        error_9 = _a.sent();
                        throw new Error("Screenshot and analysis failed: ".concat(error_9 instanceof Error ? error_9.message : String(error_9)));
                    case 8: return [2 /*return*/];
                }
            });
        });
    };
    WebAwareServer.prototype.testWebDetection = function () {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.log('Testing web content detection capabilities')];
                    case 1:
                        _a.sent();
                        return [2 /*return*/, {
                                content: [
                                    {
                                        type: 'text',
                                        text: "Web Content Detection Test Results:\n\n" +
                                            "\u2705 Web Accessibility: Available (Chrome-specific)\n" +
                                            "\u2705 AI Analysis: Available (Local LLM at http://127.0.0.1:1234)\n" +
                                            "\u2705 Enhanced OCR: Available (Tesseract + Heuristic)\n" +
                                            "\u2705 Heuristic Detection: Available (Pattern-based)\n\n" +
                                            "Priority Order: Web Accessibility \u2192 AI \u2192 Enhanced OCR \u2192 Heuristic\n" +
                                            "Specialized for: Links, buttons, news articles, web content\n" +
                                            "Target Keywords: Swansea, Update, flooded, roundabout, news, article",
                                    },
                                ],
                            }];
                }
            });
        });
    };
    WebAwareServer.prototype.takeScreenshot = function () {
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
    WebAwareServer.prototype.typeText = function (appName, elementIndex, text, clearFirst) {
        return __awaiter(this, void 0, void 0, function () {
            var elementsResult, elementsText, elements, lines, inElementsSection, _i, lines_4, line, match, element_1, element, targetX, targetY, error_10;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.checkPermissions()];
                    case 1:
                        _a.sent();
                        return [4 /*yield*/, this.log("Typing text \"".concat(text, "\" into element ").concat(elementIndex, " in ").concat(appName))];
                    case 2:
                        _a.sent();
                        _a.label = 3;
                    case 3:
                        _a.trys.push([3, 26, , 27]);
                        return [4 /*yield*/, this.getWebElements(appName, true)];
                    case 4:
                        elementsResult = _a.sent();
                        elementsText = elementsResult.content[0].text;
                        return [4 /*yield*/, this.log("Raw elements text: ".concat(elementsText))];
                    case 5:
                        _a.sent();
                        elements = [];
                        lines = elementsText.split('\n');
                        inElementsSection = false;
                        _i = 0, lines_4 = lines;
                        _a.label = 6;
                    case 6:
                        if (!(_i < lines_4.length)) return [3 /*break*/, 9];
                        line = lines_4[_i];
                        if (line.includes('Found') && line.includes('web elements:')) {
                            inElementsSection = true;
                            return [3 /*break*/, 8];
                        }
                        if (!(inElementsSection && line.match(/^\d+\./))) return [3 /*break*/, 8];
                        match = line.match(/(\d+)\. "(.+)" \((.+)\) - Screen: \(([0-9.]+), ([0-9.]+)\) \| Normalized: \(([0-9.]+), ([0-9.]+)\)/);
                        if (!match) return [3 /*break*/, 8];
                        element_1 = {
                            type: match[3],
                            text: match[2],
                            bounds: { x: 0, y: 0, width: 0, height: 0 },
                            normalizedPosition: { x: parseFloat(match[6]), y: parseFloat(match[7]) },
                            screenPosition: { x: parseInt(match[4]), y: parseInt(match[5]) },
                            isClickable: true,
                            isEnabled: true,
                            confidence: 0.8,
                            detectionMethod: 'ai'
                        };
                        elements.push(element_1);
                        return [4 /*yield*/, this.log("Parsed element ".concat(elements.length - 1, ": \"").concat(element_1.text, "\" at screen (").concat(element_1.screenPosition.x, ", ").concat(element_1.screenPosition.y, ")"))];
                    case 7:
                        _a.sent();
                        _a.label = 8;
                    case 8:
                        _i++;
                        return [3 /*break*/, 6];
                    case 9: return [4 /*yield*/, this.log("Parsed ".concat(elements.length, " elements total"))];
                    case 10:
                        _a.sent();
                        if (elementIndex < 0 || elementIndex >= elements.length) {
                            throw new Error("Element index ".concat(elementIndex, " out of range (0-").concat(elements.length - 1, ")"));
                        }
                        element = elements[elementIndex];
                        return [4 /*yield*/, this.log("Using element ".concat(elementIndex, ": \"").concat(element.text, "\" (").concat(element.type, ")"))];
                    case 11:
                        _a.sent();
                        targetX = element.screenPosition.x;
                        targetY = element.screenPosition.y;
                        return [4 /*yield*/, this.log("Clicking on element at screen coordinates (".concat(targetX, ", ").concat(targetY, ") to focus it"))];
                    case 12:
                        _a.sent();
                        // Move mouse and click on the element to focus it
                        return [4 /*yield*/, nut_js_1.mouse.move([new nut_js_1.Point(targetX, targetY)])];
                    case 13:
                        // Move mouse and click on the element to focus it
                        _a.sent();
                        return [4 /*yield*/, new Promise(function (resolve) { return setTimeout(resolve, 200); })];
                    case 14:
                        _a.sent(); // Small delay before click
                        return [4 /*yield*/, nut_js_1.mouse.leftClick()];
                    case 15:
                        _a.sent();
                        // Wait a moment for focus
                        return [4 /*yield*/, new Promise(function (resolve) { return setTimeout(resolve, 800); })];
                    case 16:
                        // Wait a moment for focus
                        _a.sent();
                        if (!clearFirst) return [3 /*break*/, 22];
                        return [4 /*yield*/, this.log('Clearing existing text')];
                    case 17:
                        _a.sent();
                        // Select all and delete
                        return [4 /*yield*/, nut_js_1.keyboard.pressKey(nut_js_1.Key.A, nut_js_1.Key.LeftCmd)];
                    case 18:
                        // Select all and delete
                        _a.sent();
                        return [4 /*yield*/, new Promise(function (resolve) { return setTimeout(resolve, 100); })];
                    case 19:
                        _a.sent();
                        return [4 /*yield*/, nut_js_1.keyboard.pressKey(nut_js_1.Key.Delete)];
                    case 20:
                        _a.sent();
                        return [4 /*yield*/, new Promise(function (resolve) { return setTimeout(resolve, 300); })];
                    case 21:
                        _a.sent();
                        _a.label = 22;
                    case 22: return [4 /*yield*/, this.log("Typing: \"".concat(text, "\""))];
                    case 23:
                        _a.sent();
                        return [4 /*yield*/, nut_js_1.keyboard.type(text)];
                    case 24:
                        _a.sent();
                        // Wait for text to be typed
                        return [4 /*yield*/, new Promise(function (resolve) { return setTimeout(resolve, 500); })];
                    case 25:
                        // Wait for text to be typed
                        _a.sent();
                        return [2 /*return*/, {
                                content: [
                                    {
                                        type: 'text',
                                        text: "Successfully typed \"".concat(text, "\" into element ").concat(elementIndex + 1, " (\"").concat(element.text, "\") at screen coordinates (").concat(targetX, ", ").concat(targetY, ")"),
                                    },
                                ],
                            }];
                    case 26:
                        error_10 = _a.sent();
                        throw new Error("Failed to type text: ".concat(error_10 instanceof Error ? error_10.message : String(error_10)));
                    case 27: return [2 /*return*/];
                }
            });
        });
    };
    WebAwareServer.prototype.googleSearch = function (appName, searchQuery, searchButtonText) {
        return __awaiter(this, void 0, void 0, function () {
            var analysisResult, elementsResult, elementsText, elements, lines, inElementsSection, _i, lines_5, line, match, element, searchBox_1, searchBoxIndex, searchButton_1, searchButtonIndex, error_11;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.checkPermissions()];
                    case 1:
                        _a.sent();
                        return [4 /*yield*/, this.log("Performing Google search for \"".concat(searchQuery, "\" and clicking \"").concat(searchButtonText, "\" button"))];
                    case 2:
                        _a.sent();
                        _a.label = 3;
                    case 3:
                        _a.trys.push([3, 19, , 20]);
                        // Step 1: Focus the application
                        return [4 /*yield*/, this.focusApplication(appName)];
                    case 4:
                        // Step 1: Focus the application
                        _a.sent();
                        return [4 /*yield*/, this.screenshotAndAnalyze(appName, 10, false)];
                    case 5:
                        analysisResult = _a.sent();
                        return [4 /*yield*/, this.getWebElements(appName, true)];
                    case 6:
                        elementsResult = _a.sent();
                        elementsText = elementsResult.content[0].text;
                        return [4 /*yield*/, this.log("Raw elements text: ".concat(elementsText))];
                    case 7:
                        _a.sent();
                        elements = [];
                        lines = elementsText.split('\n');
                        inElementsSection = false;
                        _i = 0, lines_5 = lines;
                        _a.label = 8;
                    case 8:
                        if (!(_i < lines_5.length)) return [3 /*break*/, 11];
                        line = lines_5[_i];
                        if (line.includes('Found') && line.includes('web elements:')) {
                            inElementsSection = true;
                            return [3 /*break*/, 10];
                        }
                        if (!(inElementsSection && line.match(/^\d+\./))) return [3 /*break*/, 10];
                        match = line.match(/(\d+)\. "(.+)" \((.+)\) - Screen: \(([0-9.]+), ([0-9.]+)\) \| Normalized: \(([0-9.]+), ([0-9.]+)\)/);
                        if (!match) return [3 /*break*/, 10];
                        element = {
                            type: match[3],
                            text: match[2],
                            bounds: { x: 0, y: 0, width: 0, height: 0 },
                            normalizedPosition: { x: parseFloat(match[6]), y: parseFloat(match[7]) },
                            screenPosition: { x: parseInt(match[4]), y: parseInt(match[5]) },
                            isClickable: true,
                            isEnabled: true,
                            confidence: 0.8,
                            detectionMethod: 'ai'
                        };
                        elements.push(element);
                        return [4 /*yield*/, this.log("Parsed element ".concat(elements.length - 1, ": \"").concat(element.text, "\" at screen (").concat(element.screenPosition.x, ", ").concat(element.screenPosition.y, ")"))];
                    case 9:
                        _a.sent();
                        _a.label = 10;
                    case 10:
                        _i++;
                        return [3 /*break*/, 8];
                    case 11: return [4 /*yield*/, this.log("Parsed ".concat(elements.length, " elements total"))];
                    case 12:
                        _a.sent();
                        return [4 /*yield*/, this.webDetector.findSearchBox(elements)];
                    case 13:
                        searchBox_1 = _a.sent();
                        if (!searchBox_1) {
                            throw new Error('Could not find search box');
                        }
                        searchBoxIndex = elements.findIndex(function (el) { return el === searchBox_1; });
                        return [4 /*yield*/, this.log("Found search box at index ".concat(searchBoxIndex, ": \"").concat(searchBox_1.text, "\""))];
                    case 14:
                        _a.sent();
                        // Step 5: Type search query
                        return [4 /*yield*/, this.typeText(appName, searchBoxIndex, searchQuery, true)];
                    case 15:
                        // Step 5: Type search query
                        _a.sent();
                        return [4 /*yield*/, this.webDetector.findButtonByText(elements, searchButtonText)];
                    case 16:
                        searchButton_1 = _a.sent();
                        if (!searchButton_1) {
                            throw new Error("Could not find button with text \"".concat(searchButtonText, "\""));
                        }
                        searchButtonIndex = elements.findIndex(function (el) { return el === searchButton_1; });
                        return [4 /*yield*/, this.log("Found search button at index ".concat(searchButtonIndex, ": \"").concat(searchButton_1.text, "\""))];
                    case 17:
                        _a.sent();
                        // Step 7: Click search button
                        return [4 /*yield*/, this.clickWebElement(appName, searchButtonIndex, 'left', true)];
                    case 18:
                        // Step 7: Click search button
                        _a.sent();
                        return [2 /*return*/, {
                                content: [
                                    {
                                        type: 'text',
                                        text: "\u2705 Google search completed successfully!\n\n" +
                                            "\uD83D\uDCDD Search query: \"".concat(searchQuery, "\"\n") +
                                            "\uD83D\uDD0D Search box: \"".concat(searchBox_1.text, "\" (index ").concat(searchBoxIndex, ")\n") +
                                            "\uD83D\uDD18 Search button: \"".concat(searchButton_1.text, "\" (index ").concat(searchButtonIndex, ")\n") +
                                            "\uD83C\uDFAF Task completed: Success",
                                    },
                                ],
                            }];
                    case 19:
                        error_11 = _a.sent();
                        throw new Error("Google search failed: ".concat(error_11 instanceof Error ? error_11.message : String(error_11)));
                    case 20: return [2 /*return*/];
                }
            });
        });
    };
    WebAwareServer.prototype.findSearchBox = function (appName) {
        return __awaiter(this, void 0, void 0, function () {
            var elementsResult, elementsText, elements, lines, inElementsSection, _i, lines_6, line, match, element, searchBox_2, searchBoxIndex, error_12;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.checkPermissions()];
                    case 1:
                        _a.sent();
                        return [4 /*yield*/, this.log("Finding search box in ".concat(appName))];
                    case 2:
                        _a.sent();
                        _a.label = 3;
                    case 3:
                        _a.trys.push([3, 11, , 12]);
                        return [4 /*yield*/, this.getWebElements(appName, true)];
                    case 4:
                        elementsResult = _a.sent();
                        elementsText = elementsResult.content[0].text;
                        return [4 /*yield*/, this.log("Raw elements text: ".concat(elementsText))];
                    case 5:
                        _a.sent();
                        elements = [];
                        lines = elementsText.split('\n');
                        inElementsSection = false;
                        _i = 0, lines_6 = lines;
                        _a.label = 6;
                    case 6:
                        if (!(_i < lines_6.length)) return [3 /*break*/, 9];
                        line = lines_6[_i];
                        if (line.includes('Found') && line.includes('web elements:')) {
                            inElementsSection = true;
                            return [3 /*break*/, 8];
                        }
                        if (!(inElementsSection && line.match(/^\d+\./))) return [3 /*break*/, 8];
                        match = line.match(/(\d+)\. "(.+)" \((.+)\) - Screen: \(([0-9.]+), ([0-9.]+)\) \| Normalized: \(([0-9.]+), ([0-9.]+)\)/);
                        if (!match) return [3 /*break*/, 8];
                        element = {
                            type: match[3],
                            text: match[2],
                            bounds: { x: 0, y: 0, width: 0, height: 0 },
                            normalizedPosition: { x: parseFloat(match[6]), y: parseFloat(match[7]) },
                            screenPosition: { x: parseInt(match[4]), y: parseInt(match[5]) },
                            isClickable: true,
                            isEnabled: true,
                            confidence: 0.8,
                            detectionMethod: 'ai'
                        };
                        elements.push(element);
                        return [4 /*yield*/, this.log("Parsed element ".concat(elements.length - 1, ": \"").concat(element.text, "\" (").concat(element.type, ") at screen (").concat(element.screenPosition.x, ", ").concat(element.screenPosition.y, ")"))];
                    case 7:
                        _a.sent();
                        _a.label = 8;
                    case 8:
                        _i++;
                        return [3 /*break*/, 6];
                    case 9: return [4 /*yield*/, this.log("Parsed ".concat(elements.length, " elements total"))];
                    case 10:
                        _a.sent();
                        searchBox_2 = elements.find(function (element) {
                            return element.type === 'input' ||
                                (element.text && element.text.toLowerCase().includes('search'));
                        });
                        if (!searchBox_2) {
                            return [2 /*return*/, {
                                    content: [
                                        {
                                            type: 'text',
                                            text: "\u274C No search box found in ".concat(appName, ". Available elements:\n").concat(elements.map(function (el, i) { return "".concat(i, ". \"").concat(el.text, "\" (").concat(el.type, ")"); }).join('\n')),
                                        },
                                    ],
                                }];
                        }
                        searchBoxIndex = elements.findIndex(function (el) { return el === searchBox_2; });
                        return [2 /*return*/, {
                                content: [
                                    {
                                        type: 'text',
                                        text: "\u2705 Search box found!\n\n" +
                                            "\uD83D\uDD0D Search box: \"".concat(searchBox_2.text, "\" (").concat(searchBox_2.type, ")\n") +
                                            "\uD83D\uDCCD Index: ".concat(searchBoxIndex, "\n") +
                                            "\uD83D\uDCCD Screen coordinates: (".concat(searchBox_2.screenPosition.x, ", ").concat(searchBox_2.screenPosition.y, ")\n") +
                                            "\uD83D\uDCCD Normalized coordinates: (".concat(searchBox_2.normalizedPosition.x.toFixed(3), ", ").concat(searchBox_2.normalizedPosition.y.toFixed(3), ")"),
                                    },
                                ],
                            }];
                    case 11:
                        error_12 = _a.sent();
                        throw new Error("Failed to find search box: ".concat(error_12 instanceof Error ? error_12.message : String(error_12)));
                    case 12: return [2 /*return*/];
                }
            });
        });
    };
    WebAwareServer.prototype.findButton = function (appName, buttonText) {
        return __awaiter(this, void 0, void 0, function () {
            var elementsResult, elementsText, elements, lines, inElementsSection, _i, lines_7, line, match, element, lowerButtonText_1, button_1, buttonIndex, error_13;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.checkPermissions()];
                    case 1:
                        _a.sent();
                        return [4 /*yield*/, this.log("Finding button \"".concat(buttonText, "\" in ").concat(appName))];
                    case 2:
                        _a.sent();
                        _a.label = 3;
                    case 3:
                        _a.trys.push([3, 11, , 12]);
                        return [4 /*yield*/, this.getWebElements(appName, true)];
                    case 4:
                        elementsResult = _a.sent();
                        elementsText = elementsResult.content[0].text;
                        return [4 /*yield*/, this.log("Raw elements text: ".concat(elementsText))];
                    case 5:
                        _a.sent();
                        elements = [];
                        lines = elementsText.split('\n');
                        inElementsSection = false;
                        _i = 0, lines_7 = lines;
                        _a.label = 6;
                    case 6:
                        if (!(_i < lines_7.length)) return [3 /*break*/, 9];
                        line = lines_7[_i];
                        if (line.includes('Found') && line.includes('web elements:')) {
                            inElementsSection = true;
                            return [3 /*break*/, 8];
                        }
                        if (!(inElementsSection && line.match(/^\d+\./))) return [3 /*break*/, 8];
                        match = line.match(/(\d+)\. "(.+)" \((.+)\) - Screen: \(([0-9.]+), ([0-9.]+)\) \| Normalized: \(([0-9.]+), ([0-9.]+)\)/);
                        if (!match) return [3 /*break*/, 8];
                        element = {
                            type: match[3],
                            text: match[2],
                            bounds: { x: 0, y: 0, width: 0, height: 0 },
                            normalizedPosition: { x: parseFloat(match[6]), y: parseFloat(match[7]) },
                            screenPosition: { x: parseInt(match[4]), y: parseInt(match[5]) },
                            isClickable: true,
                            isEnabled: true,
                            confidence: 0.8,
                            detectionMethod: 'ai'
                        };
                        elements.push(element);
                        return [4 /*yield*/, this.log("Parsed element ".concat(elements.length - 1, ": \"").concat(element.text, "\" (").concat(element.type, ") at screen (").concat(element.screenPosition.x, ", ").concat(element.screenPosition.y, ")"))];
                    case 7:
                        _a.sent();
                        _a.label = 8;
                    case 8:
                        _i++;
                        return [3 /*break*/, 6];
                    case 9: return [4 /*yield*/, this.log("Parsed ".concat(elements.length, " elements total"))];
                    case 10:
                        _a.sent();
                        lowerButtonText_1 = buttonText.toLowerCase();
                        button_1 = elements.find(function (element) {
                            return (element.type === 'button' || element.type === 'link') &&
                                element.text &&
                                element.text.toLowerCase().includes(lowerButtonText_1);
                        });
                        if (!button_1) {
                            return [2 /*return*/, {
                                    content: [
                                        {
                                            type: 'text',
                                            text: "\u274C No button found with text \"".concat(buttonText, "\" in ").concat(appName, ". Available elements:\n").concat(elements.map(function (el, i) { return "".concat(i, ". \"").concat(el.text, "\" (").concat(el.type, ")"); }).join('\n')),
                                        },
                                    ],
                                }];
                        }
                        buttonIndex = elements.findIndex(function (el) { return el === button_1; });
                        return [2 /*return*/, {
                                content: [
                                    {
                                        type: 'text',
                                        text: "\u2705 Button found!\n\n" +
                                            "\uD83D\uDD18 Button: \"".concat(button_1.text, "\" (").concat(button_1.type, ")\n") +
                                            "\uD83D\uDCCD Index: ".concat(buttonIndex, "\n") +
                                            "\uD83D\uDCCD Screen coordinates: (".concat(button_1.screenPosition.x, ", ").concat(button_1.screenPosition.y, ")\n") +
                                            "\uD83D\uDCCD Normalized coordinates: (".concat(button_1.normalizedPosition.x.toFixed(3), ", ").concat(button_1.normalizedPosition.y.toFixed(3), ")"),
                                    },
                                ],
                            }];
                    case 11:
                        error_13 = _a.sent();
                        throw new Error("Failed to find button: ".concat(error_13 instanceof Error ? error_13.message : String(error_13)));
                    case 12: return [2 /*return*/];
                }
            });
        });
    };
    WebAwareServer.prototype.takeVerificationScreenshot = function (appName, description, padding, includeImage) {
        return __awaiter(this, void 0, void 0, function () {
            var screenshotBuffer, timestamp, filename, screenshotDir, screenshotPath, result, error_14;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.checkPermissions()];
                    case 1:
                        _a.sent();
                        return [4 /*yield*/, this.log("Taking verification screenshot: ".concat(description))];
                    case 2:
                        _a.sent();
                        _a.label = 3;
                    case 3:
                        _a.trys.push([3, 11, , 12]);
                        if (!(!this.currentApp || this.currentApp.name !== appName)) return [3 /*break*/, 6];
                        return [4 /*yield*/, this.log("Focusing ".concat(appName, " for verification screenshot"))];
                    case 4:
                        _a.sent();
                        return [4 /*yield*/, this.focusApplication(appName)];
                    case 5:
                        _a.sent();
                        _a.label = 6;
                    case 6: return [4 /*yield*/, this.takeScreenshot(padding)];
                    case 7:
                        screenshotBuffer = _a.sent();
                        timestamp = new Date().toISOString().replace(/[:.]/g, '-');
                        filename = "verification-".concat(description.replace(/[^a-zA-Z0-9]/g, '-'), "-").concat(timestamp, ".png");
                        screenshotDir = '/tmp/mcp-eyes-screenshots';
                        screenshotPath = path.join(screenshotDir, filename);
                        // Ensure directory exists
                        return [4 /*yield*/, fs.promises.mkdir(screenshotDir, { recursive: true })];
                    case 8:
                        // Ensure directory exists
                        _a.sent();
                        return [4 /*yield*/, fs.promises.writeFile(screenshotPath, screenshotBuffer)];
                    case 9:
                        _a.sent();
                        return [4 /*yield*/, this.log("Verification screenshot saved: ".concat(screenshotPath))];
                    case 10:
                        _a.sent();
                        result = {
                            content: [
                                {
                                    type: 'text',
                                    text: "\uD83D\uDCF8 Verification Screenshot: ".concat(description, "\n\n") +
                                        "\uD83D\uDCC1 Saved to: ".concat(screenshotPath, "\n") +
                                        "\uD83D\uDCCF Dimensions: ".concat(this.currentApp.bounds.width, "x").concat(this.currentApp.bounds.height, "px\n") +
                                        "\u23F0 Timestamp: ".concat(new Date().toLocaleString()),
                                },
                            ],
                        };
                        if (includeImage) {
                            result.content.push({
                                type: 'image',
                                data: screenshotBuffer.toString('base64'),
                                mimeType: 'image/png',
                            });
                        }
                        return [2 /*return*/, result];
                    case 11:
                        error_14 = _a.sent();
                        throw new Error("Failed to take verification screenshot: ".concat(error_14 instanceof Error ? error_14.message : String(error_14)));
                    case 12: return [2 /*return*/];
                }
            });
        });
    };
    WebAwareServer.prototype.run = function () {
        return __awaiter(this, void 0, void 0, function () {
            var transport;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        transport = new stdio_js_1.StdioServerTransport();
                        return [4 /*yield*/, this.server.connect(transport)];
                    case 1:
                        _a.sent();
                        console.error('Web Aware MCP server running on stdio');
                        return [2 /*return*/];
                }
            });
        });
    };
    return WebAwareServer;
}());
// Start the server
var server = new WebAwareServer();
server.run().catch(console.error);
