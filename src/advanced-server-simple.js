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
// @ts-ignore
var screenshot_desktop_1 = require("screenshot-desktop");
var nut_js_1 = require("@nut-tree-fork/nut-js");
var run_1 = require("@jxa/run");
var sharp_1 = require("sharp");
// @ts-ignore
var node_mac_permissions_1 = require("node-mac-permissions");
var AdvancedServerSimple = /** @class */ (function () {
    function AdvancedServerSimple() {
        this.currentApp = null;
        this.server = new index_js_1.Server({
            name: 'mcp-eyes-advanced',
            version: '1.1.12',
        });
        this.setupToolHandlers();
        this.setupErrorHandling();
    }
    AdvancedServerSimple.prototype.setupErrorHandling = function () {
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
    AdvancedServerSimple.prototype.setupToolHandlers = function () {
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
                            // Advanced Tools
                            {
                                name: 'typeText',
                                description: 'Type text at the current cursor position.',
                                inputSchema: {
                                    type: 'object',
                                    properties: {
                                        text: {
                                            type: 'string',
                                            description: 'Text to type',
                                        },
                                        clearFirst: {
                                            type: 'boolean',
                                            description: 'Clear existing text before typing',
                                            default: false,
                                        },
                                    },
                                    required: ['text'],
                                },
                            },
                            {
                                name: 'pressKey',
                                description: 'Press key combinations.',
                                inputSchema: {
                                    type: 'object',
                                    properties: {
                                        key: {
                                            type: 'string',
                                            description: 'Key combination (e.g., "Cmd+A", "Enter", "Tab")',
                                        },
                                    },
                                    required: ['key'],
                                },
                            },
                            {
                                name: 'doubleClick',
                                description: 'Perform a double-click at specified coordinates.',
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
                                name: 'scrollMouse',
                                description: 'Scroll the mouse wheel.',
                                inputSchema: {
                                    type: 'object',
                                    properties: {
                                        direction: {
                                            type: 'string',
                                            enum: ['up', 'down'],
                                            description: 'Scroll direction',
                                        },
                                        amount: {
                                            type: 'number',
                                            description: 'Scroll amount (positive for up, negative for down)',
                                            default: 3,
                                        },
                                    },
                                    required: ['direction'],
                                },
                            },
                            {
                                name: 'getMousePosition',
                                description: 'Get the current mouse position.',
                                inputSchema: {
                                    type: 'object',
                                    properties: {},
                                },
                            },
                            {
                                name: 'wait',
                                description: 'Wait for a specified amount of time.',
                                inputSchema: {
                                    type: 'object',
                                    properties: {
                                        milliseconds: {
                                            type: 'number',
                                            description: 'Time to wait in milliseconds',
                                            default: 1000,
                                        },
                                    },
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
                        _c.trys.push([1, 30, , 31]);
                        _b = name;
                        switch (_b) {
                            case 'listApplications': return [3 /*break*/, 2];
                            case 'focusApplication': return [3 /*break*/, 4];
                            case 'click': return [3 /*break*/, 6];
                            case 'moveMouse': return [3 /*break*/, 8];
                            case 'screenshot': return [3 /*break*/, 10];
                            case 'getClickableElements': return [3 /*break*/, 12];
                            case 'clickElement': return [3 /*break*/, 14];
                            case 'typeText': return [3 /*break*/, 16];
                            case 'pressKey': return [3 /*break*/, 18];
                            case 'doubleClick': return [3 /*break*/, 20];
                            case 'scrollMouse': return [3 /*break*/, 22];
                            case 'getMousePosition': return [3 /*break*/, 24];
                            case 'wait': return [3 /*break*/, 26];
                        }
                        return [3 /*break*/, 28];
                    case 2: return [4 /*yield*/, this.listApplications()];
                    case 3: return [2 /*return*/, _c.sent()];
                    case 4: return [4 /*yield*/, this.focusApplication(args === null || args === void 0 ? void 0 : args.identifier)];
                    case 5: return [2 /*return*/, _c.sent()];
                    case 6: return [4 /*yield*/, this.click(args === null || args === void 0 ? void 0 : args.x, args === null || args === void 0 ? void 0 : args.y, (args === null || args === void 0 ? void 0 : args.button) || 'left')];
                    case 7: return [2 /*return*/, _c.sent()];
                    case 8: return [4 /*yield*/, this.moveMouse(args === null || args === void 0 ? void 0 : args.x, args === null || args === void 0 ? void 0 : args.y)];
                    case 9: return [2 /*return*/, _c.sent()];
                    case 10: return [4 /*yield*/, this.screenshot((args === null || args === void 0 ? void 0 : args.padding) || 10, (args === null || args === void 0 ? void 0 : args.format) || 'png', (args === null || args === void 0 ? void 0 : args.quality) || 90)];
                    case 11: return [2 /*return*/, _c.sent()];
                    case 12: return [4 /*yield*/, this.getClickableElements()];
                    case 13: return [2 /*return*/, _c.sent()];
                    case 14: return [4 /*yield*/, this.clickElement(args === null || args === void 0 ? void 0 : args.elementIndex)];
                    case 15: return [2 /*return*/, _c.sent()];
                    case 16: return [4 /*yield*/, this.typeText(args === null || args === void 0 ? void 0 : args.text, (args === null || args === void 0 ? void 0 : args.clearFirst) || false)];
                    case 17: return [2 /*return*/, _c.sent()];
                    case 18: return [4 /*yield*/, this.pressKey(args === null || args === void 0 ? void 0 : args.key)];
                    case 19: return [2 /*return*/, _c.sent()];
                    case 20: return [4 /*yield*/, this.doubleClick(args === null || args === void 0 ? void 0 : args.x, args === null || args === void 0 ? void 0 : args.y)];
                    case 21: return [2 /*return*/, _c.sent()];
                    case 22: return [4 /*yield*/, this.scrollMouse(args === null || args === void 0 ? void 0 : args.direction, (args === null || args === void 0 ? void 0 : args.amount) || 3)];
                    case 23: return [2 /*return*/, _c.sent()];
                    case 24: return [4 /*yield*/, this.getMousePosition()];
                    case 25: return [2 /*return*/, _c.sent()];
                    case 26: return [4 /*yield*/, this.wait((args === null || args === void 0 ? void 0 : args.milliseconds) || 1000)];
                    case 27: return [2 /*return*/, _c.sent()];
                    case 28: throw new Error("Unknown tool: ".concat(name));
                    case 29: return [3 /*break*/, 31];
                    case 30:
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
                    case 31: return [2 /*return*/];
                }
            });
        }); });
    };
    // Basic Tools Implementation (same as basic server)
    AdvancedServerSimple.prototype.listApplications = function () {
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
    AdvancedServerSimple.prototype.focusApplication = function (identifier) {
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
    AdvancedServerSimple.prototype.click = function (x, y, button) {
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
    AdvancedServerSimple.prototype.moveMouse = function (x, y) {
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
    AdvancedServerSimple.prototype.screenshot = function (padding, format, quality) {
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
    // Apple Accessibility Tools Implementation (same as basic server)
    AdvancedServerSimple.prototype.getClickableElements = function () {
        return __awaiter(this, void 0, void 0, function () {
            var elements, error_7;
            var _this = this;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        if (!this.currentApp) {
                            throw new Error('No application focused. Use focusApplication first.');
                        }
                        _a.label = 1;
                    case 1:
                        _a.trys.push([1, 3, , 4]);
                        return [4 /*yield*/, (0, run_1.run)(function () {
                                var app = Application.currentApplication();
                                app.includeStandardAdditions = true;
                                var runningApps = Application('System Events').applicationProcesses();
                                var targetApp = null;
                                // Find the current app
                                for (var i = 0; i < runningApps.length; i++) {
                                    if (runningApps[i].bundleIdentifier() === _this.currentApp.bundleId) {
                                        targetApp = runningApps[i];
                                        break;
                                    }
                                }
                                if (!targetApp) {
                                    throw new Error('Target application not found');
                                }
                                var elements = [];
                                var windows = targetApp.windows();
                                if (windows.length > 0) {
                                    var window_3 = windows[0];
                                    var uiElements = window_3.UIElements();
                                    for (var i = 0; i < uiElements.length; i++) {
                                        var element = uiElements[i];
                                        var elementType = element.class();
                                        var elementText = element.value() || element.title() || '';
                                        var elementBounds = element.bounds();
                                        var isClickable = element.clickable();
                                        var isEnabled = element.enabled();
                                        if (isClickable && isEnabled) {
                                            elements.push({
                                                index: elements.length,
                                                type: elementType,
                                                text: elementText,
                                                bounds: {
                                                    x: elementBounds[0],
                                                    y: elementBounds[1],
                                                    width: elementBounds[2] - elementBounds[0],
                                                    height: elementBounds[3] - elementBounds[1],
                                                },
                                                normalizedPosition: {
                                                    x: (elementBounds[0] - _this.currentApp.bounds.x) / _this.currentApp.bounds.width,
                                                    y: (elementBounds[1] - _this.currentApp.bounds.y) / _this.currentApp.bounds.height,
                                                },
                                                screenPosition: {
                                                    x: elementBounds[0],
                                                    y: elementBounds[1],
                                                },
                                                isClickable: isClickable,
                                                isEnabled: isEnabled,
                                            });
                                        }
                                    }
                                }
                                return elements;
                            })];
                    case 2:
                        elements = _a.sent();
                        return [2 /*return*/, {
                                content: [
                                    {
                                        type: 'text',
                                        text: "Found ".concat(elements.length, " clickable elements in ").concat(this.currentApp.name, ":\n\n").concat(elements
                                            .map(function (element) {
                                            return "".concat(element.index, ". \"").concat(element.text, "\" (").concat(element.type, ")\n   Screen: (").concat(element.screenPosition.x, ", ").concat(element.screenPosition.y, ")\n   Normalized: (").concat(element.normalizedPosition.x.toFixed(3), ", ").concat(element.normalizedPosition.y.toFixed(3), ")");
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
    AdvancedServerSimple.prototype.clickElement = function (elementIndex) {
        return __awaiter(this, void 0, void 0, function () {
            var elements, element, normalizedX, normalizedY, error_8;
            var _this = this;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        if (!this.currentApp) {
                            throw new Error('No application focused. Use focusApplication first.');
                        }
                        _a.label = 1;
                    case 1:
                        _a.trys.push([1, 4, , 5]);
                        return [4 /*yield*/, (0, run_1.run)(function () {
                                var app = Application.currentApplication();
                                app.includeStandardAdditions = true;
                                var runningApps = Application('System Events').applicationProcesses();
                                var targetApp = null;
                                // Find the current app
                                for (var i = 0; i < runningApps.length; i++) {
                                    if (runningApps[i].bundleIdentifier() === _this.currentApp.bundleId) {
                                        targetApp = runningApps[i];
                                        break;
                                    }
                                }
                                if (!targetApp) {
                                    throw new Error('Target application not found');
                                }
                                var elements = [];
                                var windows = targetApp.windows();
                                if (windows.length > 0) {
                                    var window_4 = windows[0];
                                    var uiElements = window_4.UIElements();
                                    for (var i = 0; i < uiElements.length; i++) {
                                        var element_1 = uiElements[i];
                                        var elementType = element_1.class();
                                        var elementText = element_1.value() || element_1.title() || '';
                                        var elementBounds = element_1.bounds();
                                        var isClickable = element_1.clickable();
                                        var isEnabled = element_1.enabled();
                                        if (isClickable && isEnabled) {
                                            elements.push({
                                                index: elements.length,
                                                type: elementType,
                                                text: elementText,
                                                bounds: {
                                                    x: elementBounds[0],
                                                    y: elementBounds[1],
                                                    width: elementBounds[2] - elementBounds[0],
                                                    height: elementBounds[3] - elementBounds[1],
                                                },
                                                normalizedPosition: {
                                                    x: (elementBounds[0] - _this.currentApp.bounds.x) / _this.currentApp.bounds.width,
                                                    y: (elementBounds[1] - _this.currentApp.bounds.y) / _this.currentApp.bounds.height,
                                                },
                                                screenPosition: {
                                                    x: elementBounds[0],
                                                    y: elementBounds[1],
                                                },
                                                isClickable: isClickable,
                                                isEnabled: isEnabled,
                                            });
                                        }
                                    }
                                }
                                return elements;
                            })];
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
    // Advanced Tools Implementation
    AdvancedServerSimple.prototype.typeText = function (text, clearFirst) {
        return __awaiter(this, void 0, void 0, function () {
            var error_9;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 5, , 6]);
                        if (!clearFirst) return [3 /*break*/, 3];
                        return [4 /*yield*/, nut_js_1.keyboard.pressKey(nut_js_1.Key.LeftCmd, nut_js_1.Key.A)];
                    case 1:
                        _a.sent();
                        return [4 /*yield*/, nut_js_1.keyboard.pressKey(nut_js_1.Key.Delete)];
                    case 2:
                        _a.sent();
                        _a.label = 3;
                    case 3: return [4 /*yield*/, nut_js_1.keyboard.type(text)];
                    case 4:
                        _a.sent();
                        return [2 /*return*/, {
                                content: [
                                    {
                                        type: 'text',
                                        text: "Typed \"".concat(text, "\"").concat(clearFirst ? ' (cleared existing text first)' : ''),
                                    },
                                ],
                            }];
                    case 5:
                        error_9 = _a.sent();
                        throw new Error("Failed to type text: ".concat(error_9));
                    case 6: return [2 /*return*/];
                }
            });
        });
    };
    AdvancedServerSimple.prototype.pressKey = function (key) {
        return __awaiter(this, void 0, void 0, function () {
            var keyMap, keys, error_10;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 2, , 3]);
                        keyMap = {
                            'Cmd+A': [nut_js_1.Key.LeftCmd, nut_js_1.Key.A],
                            'Cmd+C': [nut_js_1.Key.LeftCmd, nut_js_1.Key.C],
                            'Cmd+V': [nut_js_1.Key.LeftCmd, nut_js_1.Key.V],
                            'Cmd+Z': [nut_js_1.Key.LeftCmd, nut_js_1.Key.Z],
                            'Enter': [nut_js_1.Key.Enter],
                            'Tab': [nut_js_1.Key.Tab],
                            'Escape': [nut_js_1.Key.Escape],
                            'Space': [nut_js_1.Key.Space],
                        };
                        keys = keyMap[key];
                        if (!keys) {
                            throw new Error("Unknown key combination: ".concat(key));
                        }
                        return [4 /*yield*/, nut_js_1.keyboard.pressKey.apply(nut_js_1.keyboard, keys)];
                    case 1:
                        _a.sent();
                        return [2 /*return*/, {
                                content: [
                                    {
                                        type: 'text',
                                        text: "Pressed key combination: ".concat(key),
                                    },
                                ],
                            }];
                    case 2:
                        error_10 = _a.sent();
                        throw new Error("Failed to press key: ".concat(error_10));
                    case 3: return [2 /*return*/];
                }
            });
        });
    };
    AdvancedServerSimple.prototype.doubleClick = function (x, y) {
        return __awaiter(this, void 0, void 0, function () {
            var screenX_3, screenY_3, error_11;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        if (!this.currentApp) {
                            throw new Error('No application focused. Use focusApplication first.');
                        }
                        _a.label = 1;
                    case 1:
                        _a.trys.push([1, 4, , 5]);
                        screenX_3 = this.currentApp.bounds.x + (x * this.currentApp.bounds.width);
                        screenY_3 = this.currentApp.bounds.y + (y * this.currentApp.bounds.height);
                        return [4 /*yield*/, nut_js_1.mouse.setPosition({ x: screenX_3, y: screenY_3 })];
                    case 2:
                        _a.sent();
                        return [4 /*yield*/, nut_js_1.mouse.doubleClick(nut_js_1.Button.LEFT)];
                    case 3:
                        _a.sent();
                        return [2 /*return*/, {
                                content: [
                                    {
                                        type: 'text',
                                        text: "Double-clicked at normalized (".concat(x, ", ").concat(y, ") -> screen (").concat(Math.round(screenX_3), ", ").concat(Math.round(screenY_3), ")"),
                                    },
                                ],
                            }];
                    case 4:
                        error_11 = _a.sent();
                        throw new Error("Failed to double-click: ".concat(error_11));
                    case 5: return [2 /*return*/];
                }
            });
        });
    };
    AdvancedServerSimple.prototype.scrollMouse = function (direction, amount) {
        return __awaiter(this, void 0, void 0, function () {
            var scrollAmount, error_12;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 2, , 3]);
                        scrollAmount = direction === 'up' ? amount : -amount;
                        return [4 /*yield*/, nut_js_1.mouse.scrollUp(scrollAmount)];
                    case 1:
                        _a.sent();
                        return [2 /*return*/, {
                                content: [
                                    {
                                        type: 'text',
                                        text: "Scrolled mouse ".concat(direction, " by ").concat(amount, " units"),
                                    },
                                ],
                            }];
                    case 2:
                        error_12 = _a.sent();
                        throw new Error("Failed to scroll mouse: ".concat(error_12));
                    case 3: return [2 /*return*/];
                }
            });
        });
    };
    AdvancedServerSimple.prototype.getMousePosition = function () {
        return __awaiter(this, void 0, void 0, function () {
            var position, error_13;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 2, , 3]);
                        return [4 /*yield*/, nut_js_1.mouse.getPosition()];
                    case 1:
                        position = _a.sent();
                        return [2 /*return*/, {
                                content: [
                                    {
                                        type: 'text',
                                        text: "Current mouse position: (".concat(position.x, ", ").concat(position.y, ")"),
                                    },
                                ],
                            }];
                    case 2:
                        error_13 = _a.sent();
                        throw new Error("Failed to get mouse position: ".concat(error_13));
                    case 3: return [2 /*return*/];
                }
            });
        });
    };
    AdvancedServerSimple.prototype.wait = function (milliseconds) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                return [2 /*return*/, new Promise(function (resolve) {
                        setTimeout(function () {
                            resolve({
                                content: [
                                    {
                                        type: 'text',
                                        text: "Waited for ".concat(milliseconds, " milliseconds"),
                                    },
                                ],
                            });
                        }, milliseconds);
                    })];
            });
        });
    };
    AdvancedServerSimple.prototype.run = function () {
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
    return AdvancedServerSimple;
}());
var server = new AdvancedServerSimple();
server.run().catch(console.error);
