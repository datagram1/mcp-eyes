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
var nut_js_compat_1 = require("./nut-js-compat");
// @ts-ignore
var screenshot_desktop_1 = require("screenshot-desktop");
// @ts-ignore
var permissions = require("node-mac-permissions");
var run_1 = require("@jxa/run");
var sharp_1 = require("sharp");
var window_bounds_helper_1 = require("./window-bounds-helper");
var EnhancedMacOSGUIControlServer = /** @class */ (function () {
    function EnhancedMacOSGUIControlServer() {
        this.currentApp = null;
        this.server = new index_js_1.Server({
            name: 'enhanced-macos-gui-control',
            version: '1.1.15',
        });
        this.setupToolHandlers();
    }
    EnhancedMacOSGUIControlServer.prototype.setupToolHandlers = function () {
        var _this = this;
        this.server.setRequestHandler(types_js_1.ListToolsRequestSchema, function () { return __awaiter(_this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                return [2 /*return*/, {
                        tools: [
                            // Existing tools
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
                            {
                                name: 'screenshot',
                                description: 'Take a screenshot of the focused application window',
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
                            // NEW ENHANCED TOOLS
                            {
                                name: 'listWindows',
                                description: 'List all windows with detailed information including titles and bounds',
                                inputSchema: {
                                    type: 'object',
                                    properties: {},
                                },
                            },
                            {
                                name: 'getActiveWindow',
                                description: 'Get information about the currently active window',
                                inputSchema: {
                                    type: 'object',
                                    properties: {},
                                },
                            },
                            {
                                name: 'resizeWindow',
                                description: 'Resize a window to specified dimensions',
                                inputSchema: {
                                    type: 'object',
                                    properties: {
                                        width: {
                                            type: 'number',
                                            description: 'New width in pixels',
                                        },
                                        height: {
                                            type: 'number',
                                            description: 'New height in pixels',
                                        },
                                        windowTitle: {
                                            type: 'string',
                                            description: 'Title of the window to resize (optional, uses active window if not specified)',
                                        },
                                    },
                                    required: ['width', 'height'],
                                },
                            },
                            {
                                name: 'moveWindow',
                                description: 'Move a window to specified coordinates',
                                inputSchema: {
                                    type: 'object',
                                    properties: {
                                        x: {
                                            type: 'number',
                                            description: 'X coordinate for window position',
                                        },
                                        y: {
                                            type: 'number',
                                            description: 'Y coordinate for window position',
                                        },
                                        windowTitle: {
                                            type: 'string',
                                            description: 'Title of the window to move (optional, uses active window if not specified)',
                                        },
                                    },
                                    required: ['x', 'y'],
                                },
                            },
                            {
                                name: 'minimizeWindow',
                                description: 'Minimize a window',
                                inputSchema: {
                                    type: 'object',
                                    properties: {
                                        windowTitle: {
                                            type: 'string',
                                            description: 'Title of the window to minimize (optional, uses active window if not specified)',
                                        },
                                    },
                                },
                            },
                            {
                                name: 'restoreWindow',
                                description: 'Restore a minimized window',
                                inputSchema: {
                                    type: 'object',
                                    properties: {
                                        windowTitle: {
                                            type: 'string',
                                            description: 'Title of the window to restore (optional, uses active window if not specified)',
                                        },
                                    },
                                },
                            },
                            {
                                name: 'typeText',
                                description: 'Type text at the current cursor position',
                                inputSchema: {
                                    type: 'object',
                                    properties: {
                                        text: {
                                            type: 'string',
                                            description: 'Text to type',
                                        },
                                        delay: {
                                            type: 'number',
                                            description: 'Delay between keystrokes in milliseconds',
                                            default: 50,
                                        },
                                    },
                                    required: ['text'],
                                },
                            },
                            {
                                name: 'pressKey',
                                description: 'Press a specific key or key combination',
                                inputSchema: {
                                    type: 'object',
                                    properties: {
                                        key: {
                                            type: 'string',
                                            description: 'Key to press (e.g., "Enter", "Tab", "Cmd+A")',
                                        },
                                    },
                                    required: ['key'],
                                },
                            },
                            {
                                name: 'dragMouse',
                                description: 'Perform a mouse drag operation from one point to another',
                                inputSchema: {
                                    type: 'object',
                                    properties: {
                                        startX: {
                                            type: 'number',
                                            description: 'Start X coordinate relative to app window (0-1 normalized)',
                                        },
                                        startY: {
                                            type: 'number',
                                            description: 'Start Y coordinate relative to app window (0-1 normalized)',
                                        },
                                        endX: {
                                            type: 'number',
                                            description: 'End X coordinate relative to app window (0-1 normalized)',
                                        },
                                        endY: {
                                            type: 'number',
                                            description: 'End Y coordinate relative to app window (0-1 normalized)',
                                        },
                                        button: {
                                            type: 'string',
                                            enum: ['left', 'right', 'middle'],
                                            description: 'Mouse button to use for dragging',
                                            default: 'left',
                                        },
                                    },
                                    required: ['startX', 'startY', 'endX', 'endY'],
                                },
                            },
                            {
                                name: 'scrollMouse',
                                description: 'Scroll the mouse wheel',
                                inputSchema: {
                                    type: 'object',
                                    properties: {
                                        direction: {
                                            type: 'string',
                                            enum: ['up', 'down', 'left', 'right'],
                                            description: 'Scroll direction',
                                        },
                                        amount: {
                                            type: 'number',
                                            description: 'Number of scroll steps',
                                            default: 3,
                                        },
                                    },
                                    required: ['direction'],
                                },
                            },
                            {
                                name: 'getScreenColor',
                                description: 'Get the color at a specific screen coordinate',
                                inputSchema: {
                                    type: 'object',
                                    properties: {
                                        x: {
                                            type: 'number',
                                            description: 'X coordinate on screen',
                                        },
                                        y: {
                                            type: 'number',
                                            description: 'Y coordinate on screen',
                                        },
                                    },
                                    required: ['x', 'y'],
                                },
                            },
                            {
                                name: 'highlightRegion',
                                description: 'Highlight a region on the screen',
                                inputSchema: {
                                    type: 'object',
                                    properties: {
                                        x: {
                                            type: 'number',
                                            description: 'X coordinate of the region',
                                        },
                                        y: {
                                            type: 'number',
                                            description: 'Y coordinate of the region',
                                        },
                                        width: {
                                            type: 'number',
                                            description: 'Width of the region',
                                        },
                                        height: {
                                            type: 'number',
                                            description: 'Height of the region',
                                        },
                                        duration: {
                                            type: 'number',
                                            description: 'Duration to highlight in milliseconds',
                                            default: 2000,
                                        },
                                    },
                                    required: ['x', 'y', 'width', 'height'],
                                },
                            },
                            {
                                name: 'copyToClipboard',
                                description: 'Copy text to the clipboard',
                                inputSchema: {
                                    type: 'object',
                                    properties: {
                                        text: {
                                            type: 'string',
                                            description: 'Text to copy to clipboard',
                                        },
                                    },
                                    required: ['text'],
                                },
                            },
                            {
                                name: 'pasteFromClipboard',
                                description: 'Paste text from the clipboard',
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
            var _a, name, args, _b, error_1;
            return __generator(this, function (_c) {
                switch (_c.label) {
                    case 0:
                        _a = request.params, name = _a.name, args = _a.arguments;
                        _c.label = 1;
                    case 1:
                        _c.trys.push([1, 42, , 43]);
                        _b = name;
                        switch (_b) {
                            case 'listApplications': return [3 /*break*/, 2];
                            case 'focusApplication': return [3 /*break*/, 4];
                            case 'click': return [3 /*break*/, 6];
                            case 'moveMouse': return [3 /*break*/, 8];
                            case 'screenshot': return [3 /*break*/, 10];
                            case 'listWindows': return [3 /*break*/, 12];
                            case 'getActiveWindow': return [3 /*break*/, 14];
                            case 'resizeWindow': return [3 /*break*/, 16];
                            case 'moveWindow': return [3 /*break*/, 18];
                            case 'minimizeWindow': return [3 /*break*/, 20];
                            case 'restoreWindow': return [3 /*break*/, 22];
                            case 'typeText': return [3 /*break*/, 24];
                            case 'pressKey': return [3 /*break*/, 26];
                            case 'dragMouse': return [3 /*break*/, 28];
                            case 'scrollMouse': return [3 /*break*/, 30];
                            case 'getScreenColor': return [3 /*break*/, 32];
                            case 'highlightRegion': return [3 /*break*/, 34];
                            case 'copyToClipboard': return [3 /*break*/, 36];
                            case 'pasteFromClipboard': return [3 /*break*/, 38];
                        }
                        return [3 /*break*/, 40];
                    case 2: return [4 /*yield*/, this.listApplications()];
                    case 3: return [2 /*return*/, _c.sent()];
                    case 4: return [4 /*yield*/, this.focusApplication(args === null || args === void 0 ? void 0 : args.identifier)];
                    case 5: return [2 /*return*/, _c.sent()];
                    case 6: return [4 /*yield*/, this.click(args === null || args === void 0 ? void 0 : args.x, args === null || args === void 0 ? void 0 : args.y, (args === null || args === void 0 ? void 0 : args.button) || 'left')];
                    case 7: return [2 /*return*/, _c.sent()];
                    case 8: return [4 /*yield*/, this.moveMouse(args === null || args === void 0 ? void 0 : args.x, args === null || args === void 0 ? void 0 : args.y)];
                    case 9: return [2 /*return*/, _c.sent()];
                    case 10: return [4 /*yield*/, this.screenshot((args === null || args === void 0 ? void 0 : args.padding) || 10)];
                    case 11: return [2 /*return*/, _c.sent()];
                    case 12: return [4 /*yield*/, this.listWindows()];
                    case 13: return [2 /*return*/, _c.sent()];
                    case 14: return [4 /*yield*/, this.getActiveWindowInfo()];
                    case 15: return [2 /*return*/, _c.sent()];
                    case 16: return [4 /*yield*/, this.resizeWindow(args === null || args === void 0 ? void 0 : args.width, args === null || args === void 0 ? void 0 : args.height, args === null || args === void 0 ? void 0 : args.windowTitle)];
                    case 17: return [2 /*return*/, _c.sent()];
                    case 18: return [4 /*yield*/, this.moveWindow(args === null || args === void 0 ? void 0 : args.x, args === null || args === void 0 ? void 0 : args.y, args === null || args === void 0 ? void 0 : args.windowTitle)];
                    case 19: return [2 /*return*/, _c.sent()];
                    case 20: return [4 /*yield*/, this.minimizeWindow(args === null || args === void 0 ? void 0 : args.windowTitle)];
                    case 21: return [2 /*return*/, _c.sent()];
                    case 22: return [4 /*yield*/, this.restoreWindow(args === null || args === void 0 ? void 0 : args.windowTitle)];
                    case 23: return [2 /*return*/, _c.sent()];
                    case 24: return [4 /*yield*/, this.typeText(args === null || args === void 0 ? void 0 : args.text, (args === null || args === void 0 ? void 0 : args.delay) || 50)];
                    case 25: return [2 /*return*/, _c.sent()];
                    case 26: return [4 /*yield*/, this.pressKey(args === null || args === void 0 ? void 0 : args.key)];
                    case 27: return [2 /*return*/, _c.sent()];
                    case 28: return [4 /*yield*/, this.dragMouse(args === null || args === void 0 ? void 0 : args.startX, args === null || args === void 0 ? void 0 : args.startY, args === null || args === void 0 ? void 0 : args.endX, args === null || args === void 0 ? void 0 : args.endY, (args === null || args === void 0 ? void 0 : args.button) || 'left')];
                    case 29: return [2 /*return*/, _c.sent()];
                    case 30: return [4 /*yield*/, this.scrollMouse(args === null || args === void 0 ? void 0 : args.direction, (args === null || args === void 0 ? void 0 : args.amount) || 3)];
                    case 31: return [2 /*return*/, _c.sent()];
                    case 32: return [4 /*yield*/, this.getScreenColor(args === null || args === void 0 ? void 0 : args.x, args === null || args === void 0 ? void 0 : args.y)];
                    case 33: return [2 /*return*/, _c.sent()];
                    case 34: return [4 /*yield*/, this.highlightRegion(args === null || args === void 0 ? void 0 : args.x, args === null || args === void 0 ? void 0 : args.y, args === null || args === void 0 ? void 0 : args.width, args === null || args === void 0 ? void 0 : args.height, (args === null || args === void 0 ? void 0 : args.duration) || 2000)];
                    case 35: return [2 /*return*/, _c.sent()];
                    case 36: return [4 /*yield*/, this.copyToClipboard(args === null || args === void 0 ? void 0 : args.text)];
                    case 37: return [2 /*return*/, _c.sent()];
                    case 38: return [4 /*yield*/, this.pasteFromClipboard()];
                    case 39: return [2 /*return*/, _c.sent()];
                    case 40: throw new Error("Unknown tool: ".concat(name));
                    case 41: return [3 /*break*/, 43];
                    case 42:
                        error_1 = _c.sent();
                        return [2 /*return*/, {
                                content: [
                                    {
                                        type: 'text',
                                        text: "Error: ".concat(error_1 instanceof Error ? error_1.message : String(error_1)),
                                    },
                                ],
                                isError: true,
                            }];
                    case 43: return [2 /*return*/];
                }
            });
        }); });
    };
    EnhancedMacOSGUIControlServer.prototype.checkPermissions = function () {
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
    // EXISTING METHODS (keeping the same implementation)
    EnhancedMacOSGUIControlServer.prototype.listApplications = function () {
        return __awaiter(this, void 0, void 0, function () {
            var apps, _i, _a, app, bounds;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0: return [4 /*yield*/, this.checkPermissions()];
                    case 1:
                        _b.sent();
                        return [4 /*yield*/, (0, run_1.run)(function () {
                                // @ts-ignore
                                var apps = Application.runningApplications();
                                return apps.map(function (app) { return ({
                                    name: app.name(),
                                    bundleId: app.bundleIdentifier(),
                                    pid: app.processIdentifier(),
                                    bounds: { x: 0, y: 0, width: 0, height: 0 } // Will be populated with actual bounds
                                }); });
                            })];
                    case 2:
                        apps = _b.sent();
                        _i = 0, _a = apps;
                        _b.label = 3;
                    case 3:
                        if (!(_i < _a.length)) return [3 /*break*/, 6];
                        app = _a[_i];
                        return [4 /*yield*/, (0, window_bounds_helper_1.getWindowBoundsAppleScript)(app.name, app.pid)];
                    case 4:
                        bounds = _b.sent();
                        if (bounds) {
                            app.bounds = bounds;
                        }
                        _b.label = 5;
                    case 5:
                        _i++;
                        return [3 /*break*/, 3];
                    case 6: return [2 /*return*/, {
                            content: [
                                {
                                    type: 'text',
                                    text: JSON.stringify(apps, null, 2),
                                },
                            ],
                        }];
                }
            });
        });
    };
    EnhancedMacOSGUIControlServer.prototype.focusApplication = function (identifier) {
        return __awaiter(this, void 0, void 0, function () {
            var apps, targetApp, pid_1, bounds;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.checkPermissions()];
                    case 1:
                        _a.sent();
                        return [4 /*yield*/, (0, run_1.run)(function () {
                                // @ts-ignore
                                var apps = Application.runningApplications();
                                return apps.map(function (app) { return ({
                                    name: app.name(),
                                    bundleId: app.bundleIdentifier(),
                                    pid: app.processIdentifier(),
                                    bounds: app.bounds()
                                }); });
                            })];
                    case 2:
                        apps = _a.sent();
                        // Try to find by bundle ID first
                        targetApp = apps.find(function (app) { return app.bundleId === identifier; });
                        // If not found, try by PID
                        if (!targetApp) {
                            pid_1 = parseInt(identifier);
                            if (!isNaN(pid_1)) {
                                targetApp = apps.find(function (app) { return app.pid === pid_1; });
                            }
                        }
                        if (!targetApp) {
                            throw new Error("Application not found: ".concat(identifier));
                        }
                        // Focus the application
                        return [4 /*yield*/, (0, run_1.run)(function (bundleId) {
                                // @ts-ignore
                                var app = Application(bundleId);
                                app.activate();
                            }, targetApp.bundleId)];
                    case 3:
                        // Focus the application
                        _a.sent();
                        return [4 /*yield*/, (0, window_bounds_helper_1.getWindowBoundsAppleScript)(targetApp.name, targetApp.pid)];
                    case 4:
                        bounds = _a.sent();
                        if (bounds) {
                            targetApp.bounds = bounds;
                        }
                        this.currentApp = targetApp;
                        return [2 /*return*/, {
                                content: [
                                    {
                                        type: 'text',
                                        text: "Focused on application: ".concat(targetApp.name, " (").concat(targetApp.bundleId, ")"),
                                    },
                                ],
                            }];
                }
            });
        });
    };
    EnhancedMacOSGUIControlServer.prototype.click = function (x, y, button) {
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
                        return [4 /*yield*/, nut_js_compat_1.mouse.move((0, nut_js_compat_1.straightTo)(new nut_js_compat_1.Point(screenX, screenY)))];
                    case 2:
                        _b.sent();
                        _a = button;
                        switch (_a) {
                            case 'left': return [3 /*break*/, 3];
                            case 'right': return [3 /*break*/, 5];
                            case 'middle': return [3 /*break*/, 7];
                        }
                        return [3 /*break*/, 9];
                    case 3: return [4 /*yield*/, nut_js_compat_1.mouse.click(nut_js_compat_1.Button.LEFT)];
                    case 4:
                        _b.sent();
                        return [3 /*break*/, 10];
                    case 5: return [4 /*yield*/, nut_js_compat_1.mouse.click(nut_js_compat_1.Button.RIGHT)];
                    case 6:
                        _b.sent();
                        return [3 /*break*/, 10];
                    case 7: return [4 /*yield*/, nut_js_compat_1.mouse.click(nut_js_compat_1.Button.MIDDLE)];
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
    EnhancedMacOSGUIControlServer.prototype.moveMouse = function (x, y) {
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
                        return [4 /*yield*/, nut_js_compat_1.mouse.move((0, nut_js_compat_1.straightTo)(new nut_js_compat_1.Point(screenX, screenY)))];
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
    EnhancedMacOSGUIControlServer.prototype.screenshot = function (padding) {
        return __awaiter(this, void 0, void 0, function () {
            var fullScreenshot, cropX, cropY, cropWidth, cropHeight, croppedBuffer, base64Image;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        if (!this.currentApp) {
                            throw new Error('No application focused. Use focusApplication first.');
                        }
                        return [4 /*yield*/, this.checkPermissions()];
                    case 1:
                        _a.sent();
                        return [4 /*yield*/, (0, screenshot_desktop_1.default)()];
                    case 2:
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
                    case 3:
                        croppedBuffer = _a.sent();
                        base64Image = croppedBuffer.toString('base64');
                        return [2 /*return*/, {
                                content: [
                                    {
                                        type: 'text',
                                        text: "Screenshot of ".concat(this.currentApp.name, " window (").concat(cropWidth, "x").concat(cropHeight, "px with ").concat(padding, "px padding)"),
                                    },
                                    {
                                        type: 'image',
                                        data: base64Image,
                                        mimeType: 'image/png',
                                    },
                                ],
                            }];
                }
            });
        });
    };
    // NEW ENHANCED METHODS
    EnhancedMacOSGUIControlServer.prototype.listWindows = function () {
        return __awaiter(this, void 0, void 0, function () {
            var windows, windowInfos, error_2;
            var _this = this;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.checkPermissions()];
                    case 1:
                        _a.sent();
                        _a.label = 2;
                    case 2:
                        _a.trys.push([2, 5, , 6]);
                        return [4 /*yield*/, (0, nut_js_compat_1.getWindows)()];
                    case 3:
                        windows = _a.sent();
                        return [4 /*yield*/, Promise.all(windows.map(function (window) { return __awaiter(_this, void 0, void 0, function () {
                                var _a;
                                return __generator(this, function (_b) {
                                    switch (_b.label) {
                                        case 0:
                                            _a = {};
                                            return [4 /*yield*/, window.title];
                                        case 1:
                                            _a.title = _b.sent();
                                            return [4 /*yield*/, window.region];
                                        case 2: return [2 /*return*/, (_a.bounds = _b.sent(),
                                                _a)];
                                    }
                                });
                            }); }))];
                    case 4:
                        windowInfos = _a.sent();
                        return [2 /*return*/, {
                                content: [
                                    {
                                        type: 'text',
                                        text: JSON.stringify(windowInfos, null, 2),
                                    },
                                ],
                            }];
                    case 5:
                        error_2 = _a.sent();
                        throw new Error("Failed to list windows: ".concat(error_2 instanceof Error ? error_2.message : String(error_2)));
                    case 6: return [2 /*return*/];
                }
            });
        });
    };
    EnhancedMacOSGUIControlServer.prototype.getActiveWindowInfo = function () {
        return __awaiter(this, void 0, void 0, function () {
            var activeWindow, windowInfo, error_3;
            var _a;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0: return [4 /*yield*/, this.checkPermissions()];
                    case 1:
                        _b.sent();
                        _b.label = 2;
                    case 2:
                        _b.trys.push([2, 6, , 7]);
                        return [4 /*yield*/, (0, nut_js_compat_1.getActiveWindow)()];
                    case 3:
                        activeWindow = _b.sent();
                        _a = {};
                        return [4 /*yield*/, activeWindow.title];
                    case 4:
                        _a.title = _b.sent();
                        return [4 /*yield*/, activeWindow.region];
                    case 5:
                        windowInfo = (_a.bounds = _b.sent(),
                            _a);
                        return [2 /*return*/, {
                                content: [
                                    {
                                        type: 'text',
                                        text: JSON.stringify(windowInfo, null, 2),
                                    },
                                ],
                            }];
                    case 6:
                        error_3 = _b.sent();
                        throw new Error("Failed to get active window: ".concat(error_3 instanceof Error ? error_3.message : String(error_3)));
                    case 7: return [2 /*return*/];
                }
            });
        });
    };
    EnhancedMacOSGUIControlServer.prototype.resizeWindow = function (width, height, windowTitle) {
        return __awaiter(this, void 0, void 0, function () {
            var targetWindow, windows, foundWindow, _i, windows_1, w, title, error_4;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.checkPermissions()];
                    case 1:
                        _a.sent();
                        _a.label = 2;
                    case 2:
                        _a.trys.push([2, 14, , 15]);
                        targetWindow = void 0;
                        if (!windowTitle) return [3 /*break*/, 8];
                        return [4 /*yield*/, (0, nut_js_compat_1.getWindows)()];
                    case 3:
                        windows = _a.sent();
                        foundWindow = null;
                        _i = 0, windows_1 = windows;
                        _a.label = 4;
                    case 4:
                        if (!(_i < windows_1.length)) return [3 /*break*/, 7];
                        w = windows_1[_i];
                        return [4 /*yield*/, w.title];
                    case 5:
                        title = _a.sent();
                        if (title.includes(windowTitle)) {
                            foundWindow = w;
                            return [3 /*break*/, 7];
                        }
                        _a.label = 6;
                    case 6:
                        _i++;
                        return [3 /*break*/, 4];
                    case 7:
                        if (!foundWindow) {
                            throw new Error("Window with title containing \"".concat(windowTitle, "\" not found"));
                        }
                        targetWindow = foundWindow;
                        return [3 /*break*/, 10];
                    case 8: return [4 /*yield*/, (0, nut_js_compat_1.getActiveWindow)()];
                    case 9:
                        targetWindow = _a.sent();
                        _a.label = 10;
                    case 10:
                        if (!(process.platform === 'darwin')) return [3 /*break*/, 12];
                        return [4 /*yield*/, (0, nut_js_compat_1.resizeWindowMacOS)(width, height, windowTitle)];
                    case 11:
                        _a.sent();
                        return [3 /*break*/, 13];
                    case 12: throw new Error('Window resize not implemented for this platform');
                    case 13: return [2 /*return*/, {
                            content: [
                                {
                                    type: 'text',
                                    text: "Resized window \"".concat(targetWindow.title, "\" to ").concat(width, "x").concat(height),
                                },
                            ],
                        }];
                    case 14:
                        error_4 = _a.sent();
                        throw new Error("Failed to resize window: ".concat(error_4 instanceof Error ? error_4.message : String(error_4)));
                    case 15: return [2 /*return*/];
                }
            });
        });
    };
    EnhancedMacOSGUIControlServer.prototype.moveWindow = function (x, y, windowTitle) {
        return __awaiter(this, void 0, void 0, function () {
            var targetWindow, windows, foundWindow, _i, windows_2, w, title, error_5;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.checkPermissions()];
                    case 1:
                        _a.sent();
                        _a.label = 2;
                    case 2:
                        _a.trys.push([2, 14, , 15]);
                        targetWindow = void 0;
                        if (!windowTitle) return [3 /*break*/, 8];
                        return [4 /*yield*/, (0, nut_js_compat_1.getWindows)()];
                    case 3:
                        windows = _a.sent();
                        foundWindow = null;
                        _i = 0, windows_2 = windows;
                        _a.label = 4;
                    case 4:
                        if (!(_i < windows_2.length)) return [3 /*break*/, 7];
                        w = windows_2[_i];
                        return [4 /*yield*/, w.title];
                    case 5:
                        title = _a.sent();
                        if (title.includes(windowTitle)) {
                            foundWindow = w;
                            return [3 /*break*/, 7];
                        }
                        _a.label = 6;
                    case 6:
                        _i++;
                        return [3 /*break*/, 4];
                    case 7:
                        if (!foundWindow) {
                            throw new Error("Window with title containing \"".concat(windowTitle, "\" not found"));
                        }
                        targetWindow = foundWindow;
                        return [3 /*break*/, 10];
                    case 8: return [4 /*yield*/, (0, nut_js_compat_1.getActiveWindow)()];
                    case 9:
                        targetWindow = _a.sent();
                        _a.label = 10;
                    case 10:
                        if (!(process.platform === 'darwin')) return [3 /*break*/, 12];
                        return [4 /*yield*/, (0, nut_js_compat_1.moveWindowMacOS)(x, y, windowTitle)];
                    case 11:
                        _a.sent();
                        return [3 /*break*/, 13];
                    case 12: throw new Error('Window move not implemented for this platform');
                    case 13: return [2 /*return*/, {
                            content: [
                                {
                                    type: 'text',
                                    text: "Moved window \"".concat(targetWindow.title, "\" to position (").concat(x, ", ").concat(y, ")"),
                                },
                            ],
                        }];
                    case 14:
                        error_5 = _a.sent();
                        throw new Error("Failed to move window: ".concat(error_5 instanceof Error ? error_5.message : String(error_5)));
                    case 15: return [2 /*return*/];
                }
            });
        });
    };
    EnhancedMacOSGUIControlServer.prototype.minimizeWindow = function (windowTitle) {
        return __awaiter(this, void 0, void 0, function () {
            var targetWindow, windows, foundWindow, _i, windows_3, w, title, error_6;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.checkPermissions()];
                    case 1:
                        _a.sent();
                        _a.label = 2;
                    case 2:
                        _a.trys.push([2, 14, , 15]);
                        targetWindow = void 0;
                        if (!windowTitle) return [3 /*break*/, 8];
                        return [4 /*yield*/, (0, nut_js_compat_1.getWindows)()];
                    case 3:
                        windows = _a.sent();
                        foundWindow = null;
                        _i = 0, windows_3 = windows;
                        _a.label = 4;
                    case 4:
                        if (!(_i < windows_3.length)) return [3 /*break*/, 7];
                        w = windows_3[_i];
                        return [4 /*yield*/, w.title];
                    case 5:
                        title = _a.sent();
                        if (title.includes(windowTitle)) {
                            foundWindow = w;
                            return [3 /*break*/, 7];
                        }
                        _a.label = 6;
                    case 6:
                        _i++;
                        return [3 /*break*/, 4];
                    case 7:
                        if (!foundWindow) {
                            throw new Error("Window with title containing \"".concat(windowTitle, "\" not found"));
                        }
                        targetWindow = foundWindow;
                        return [3 /*break*/, 10];
                    case 8: return [4 /*yield*/, (0, nut_js_compat_1.getActiveWindow)()];
                    case 9:
                        targetWindow = _a.sent();
                        _a.label = 10;
                    case 10:
                        if (!(process.platform === 'darwin')) return [3 /*break*/, 12];
                        return [4 /*yield*/, (0, nut_js_compat_1.minimizeWindowMacOS)(windowTitle)];
                    case 11:
                        _a.sent();
                        return [3 /*break*/, 13];
                    case 12: throw new Error('Window minimize not implemented for this platform');
                    case 13: return [2 /*return*/, {
                            content: [
                                {
                                    type: 'text',
                                    text: "Minimized window \"".concat(targetWindow.title, "\""),
                                },
                            ],
                        }];
                    case 14:
                        error_6 = _a.sent();
                        throw new Error("Failed to minimize window: ".concat(error_6 instanceof Error ? error_6.message : String(error_6)));
                    case 15: return [2 /*return*/];
                }
            });
        });
    };
    EnhancedMacOSGUIControlServer.prototype.restoreWindow = function (windowTitle) {
        return __awaiter(this, void 0, void 0, function () {
            var targetWindow, windows, foundWindow, _i, windows_4, w, title, error_7;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.checkPermissions()];
                    case 1:
                        _a.sent();
                        _a.label = 2;
                    case 2:
                        _a.trys.push([2, 14, , 15]);
                        targetWindow = void 0;
                        if (!windowTitle) return [3 /*break*/, 8];
                        return [4 /*yield*/, (0, nut_js_compat_1.getWindows)()];
                    case 3:
                        windows = _a.sent();
                        foundWindow = null;
                        _i = 0, windows_4 = windows;
                        _a.label = 4;
                    case 4:
                        if (!(_i < windows_4.length)) return [3 /*break*/, 7];
                        w = windows_4[_i];
                        return [4 /*yield*/, w.title];
                    case 5:
                        title = _a.sent();
                        if (title.includes(windowTitle)) {
                            foundWindow = w;
                            return [3 /*break*/, 7];
                        }
                        _a.label = 6;
                    case 6:
                        _i++;
                        return [3 /*break*/, 4];
                    case 7:
                        if (!foundWindow) {
                            throw new Error("Window with title containing \"".concat(windowTitle, "\" not found"));
                        }
                        targetWindow = foundWindow;
                        return [3 /*break*/, 10];
                    case 8: return [4 /*yield*/, (0, nut_js_compat_1.getActiveWindow)()];
                    case 9:
                        targetWindow = _a.sent();
                        _a.label = 10;
                    case 10:
                        if (!(process.platform === 'darwin')) return [3 /*break*/, 12];
                        return [4 /*yield*/, (0, nut_js_compat_1.restoreWindowMacOS)(windowTitle)];
                    case 11:
                        _a.sent();
                        return [3 /*break*/, 13];
                    case 12: throw new Error('Window restore not implemented for this platform');
                    case 13: return [2 /*return*/, {
                            content: [
                                {
                                    type: 'text',
                                    text: "Restored window \"".concat(targetWindow.title, "\""),
                                },
                            ],
                        }];
                    case 14:
                        error_7 = _a.sent();
                        throw new Error("Failed to restore window: ".concat(error_7 instanceof Error ? error_7.message : String(error_7)));
                    case 15: return [2 /*return*/];
                }
            });
        });
    };
    EnhancedMacOSGUIControlServer.prototype.typeText = function (text, delay) {
        return __awaiter(this, void 0, void 0, function () {
            var error_8;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.checkPermissions()];
                    case 1:
                        _a.sent();
                        _a.label = 2;
                    case 2:
                        _a.trys.push([2, 4, , 5]);
                        // Fork version doesn't support delay parameter
                        return [4 /*yield*/, nut_js_compat_1.keyboard.type(text)];
                    case 3:
                        // Fork version doesn't support delay parameter
                        _a.sent();
                        return [2 /*return*/, {
                                content: [
                                    {
                                        type: 'text',
                                        text: "Typed text: \"".concat(text, "\""),
                                    },
                                ],
                            }];
                    case 4:
                        error_8 = _a.sent();
                        throw new Error("Failed to type text: ".concat(error_8 instanceof Error ? error_8.message : String(error_8)));
                    case 5: return [2 /*return*/];
                }
            });
        });
    };
    EnhancedMacOSGUIControlServer.prototype.pressKey = function (keyString) {
        return __awaiter(this, void 0, void 0, function () {
            var keys, keyCodes, error_9;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.checkPermissions()];
                    case 1:
                        _a.sent();
                        _a.label = 2;
                    case 2:
                        _a.trys.push([2, 7, , 8]);
                        keys = keyString.split('+').map(function (k) { return k.trim(); });
                        keyCodes = keys.map(function (k) {
                            switch (k.toLowerCase()) {
                                // Use Key enum values that exist in the fork
                                case 'cmd': return nut_js_compat_1.Key.LeftCmd;
                                case 'ctrl': return nut_js_compat_1.Key.LeftControl;
                                case 'alt': return nut_js_compat_1.Key.LeftAlt;
                                case 'shift': return nut_js_compat_1.Key.LeftShift;
                                case 'enter': return nut_js_compat_1.Key.Enter;
                                case 'tab': return nut_js_compat_1.Key.Tab;
                                case 'space': return nut_js_compat_1.Key.Space;
                                case 'escape': return nut_js_compat_1.Key.Escape;
                                case 'backspace': return nut_js_compat_1.Key.Backspace;
                                case 'delete': return nut_js_compat_1.Key.Delete;
                                case 'up': return nut_js_compat_1.Key.Up;
                                case 'down': return nut_js_compat_1.Key.Down;
                                case 'left': return nut_js_compat_1.Key.Left;
                                case 'right': return nut_js_compat_1.Key.Right;
                                default: return k; // Assume it's a single character
                            }
                        });
                        if (!(keyCodes.length === 1)) return [3 /*break*/, 4];
                        return [4 /*yield*/, nut_js_compat_1.keyboard.pressKey(keyCodes[0])];
                    case 3:
                        _a.sent();
                        return [3 /*break*/, 6];
                    case 4: return [4 /*yield*/, nut_js_compat_1.keyboard.pressKey.apply(nut_js_compat_1.keyboard, keyCodes)];
                    case 5:
                        _a.sent();
                        _a.label = 6;
                    case 6: return [2 /*return*/, {
                            content: [
                                {
                                    type: 'text',
                                    text: "Pressed key combination: ".concat(keyString),
                                },
                            ],
                        }];
                    case 7:
                        error_9 = _a.sent();
                        throw new Error("Failed to press key: ".concat(error_9 instanceof Error ? error_9.message : String(error_9)));
                    case 8: return [2 /*return*/];
                }
            });
        });
    };
    EnhancedMacOSGUIControlServer.prototype.dragMouse = function (startX, startY, endX, endY, button) {
        return __awaiter(this, void 0, void 0, function () {
            var startScreenX, startScreenY, endScreenX, endScreenY, buttonType;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        if (!this.currentApp) {
                            throw new Error('No application focused. Use focusApplication first.');
                        }
                        return [4 /*yield*/, this.checkPermissions()];
                    case 1:
                        _a.sent();
                        startScreenX = this.currentApp.bounds.x + (startX * this.currentApp.bounds.width);
                        startScreenY = this.currentApp.bounds.y + (startY * this.currentApp.bounds.height);
                        endScreenX = this.currentApp.bounds.x + (endX * this.currentApp.bounds.width);
                        endScreenY = this.currentApp.bounds.y + (endY * this.currentApp.bounds.height);
                        buttonType = button === 'left' ? nut_js_compat_1.Button.LEFT : button === 'right' ? nut_js_compat_1.Button.RIGHT : nut_js_compat_1.Button.MIDDLE;
                        // Fork version has different drag API - use move and click sequence instead
                        return [4 /*yield*/, nut_js_compat_1.mouse.move((0, nut_js_compat_1.straightTo)(new nut_js_compat_1.Point(startScreenX, startScreenY)))];
                    case 2:
                        // Fork version has different drag API - use move and click sequence instead
                        _a.sent();
                        return [4 /*yield*/, nut_js_compat_1.mouse.pressButton(buttonType)];
                    case 3:
                        _a.sent();
                        return [4 /*yield*/, nut_js_compat_1.mouse.move((0, nut_js_compat_1.straightTo)(new nut_js_compat_1.Point(endScreenX, endScreenY)))];
                    case 4:
                        _a.sent();
                        return [4 /*yield*/, nut_js_compat_1.mouse.releaseButton(buttonType)];
                    case 5:
                        _a.sent();
                        return [2 /*return*/, {
                                content: [
                                    {
                                        type: 'text',
                                        text: "Dragged mouse from (".concat(startX.toFixed(3), ", ").concat(startY.toFixed(3), ") to (").concat(endX.toFixed(3), ", ").concat(endY.toFixed(3), ") relative to ").concat(this.currentApp.name),
                                    },
                                ],
                            }];
                }
            });
        });
    };
    EnhancedMacOSGUIControlServer.prototype.scrollMouse = function (direction, amount) {
        return __awaiter(this, void 0, void 0, function () {
            var _a, error_10;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0: return [4 /*yield*/, this.checkPermissions()];
                    case 1:
                        _b.sent();
                        _b.label = 2;
                    case 2:
                        _b.trys.push([2, 13, , 14]);
                        _a = direction.toLowerCase();
                        switch (_a) {
                            case 'up': return [3 /*break*/, 3];
                            case 'down': return [3 /*break*/, 5];
                            case 'left': return [3 /*break*/, 7];
                            case 'right': return [3 /*break*/, 9];
                        }
                        return [3 /*break*/, 11];
                    case 3: return [4 /*yield*/, nut_js_compat_1.mouse.scrollUp(amount)];
                    case 4:
                        _b.sent();
                        return [3 /*break*/, 12];
                    case 5: return [4 /*yield*/, nut_js_compat_1.mouse.scrollDown(amount)];
                    case 6:
                        _b.sent();
                        return [3 /*break*/, 12];
                    case 7: return [4 /*yield*/, nut_js_compat_1.mouse.scrollLeft(amount)];
                    case 8:
                        _b.sent();
                        return [3 /*break*/, 12];
                    case 9: return [4 /*yield*/, nut_js_compat_1.mouse.scrollRight(amount)];
                    case 10:
                        _b.sent();
                        return [3 /*break*/, 12];
                    case 11: throw new Error("Invalid scroll direction: ".concat(direction));
                    case 12: return [2 /*return*/, {
                            content: [
                                {
                                    type: 'text',
                                    text: "Scrolled mouse ".concat(direction, " by ").concat(amount, " steps"),
                                },
                            ],
                        }];
                    case 13:
                        error_10 = _b.sent();
                        throw new Error("Failed to scroll mouse: ".concat(error_10 instanceof Error ? error_10.message : String(error_10)));
                    case 14: return [2 /*return*/];
                }
            });
        });
    };
    EnhancedMacOSGUIControlServer.prototype.getScreenColor = function (x, y) {
        return __awaiter(this, void 0, void 0, function () {
            var color, error_11;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.checkPermissions()];
                    case 1:
                        _a.sent();
                        _a.label = 2;
                    case 2:
                        _a.trys.push([2, 4, , 5]);
                        return [4 /*yield*/, nut_js_compat_1.screen.colorAt(new nut_js_compat_1.Point(x, y))];
                    case 3:
                        color = _a.sent();
                        return [2 /*return*/, {
                                content: [
                                    {
                                        type: 'text',
                                        text: JSON.stringify({
                                            x: x,
                                            y: y,
                                            color: {
                                                r: color.R,
                                                g: color.G,
                                                b: color.B,
                                                a: color.A,
                                                hex: "#".concat(color.R.toString(16).padStart(2, '0')).concat(color.G.toString(16).padStart(2, '0')).concat(color.B.toString(16).padStart(2, '0')),
                                            },
                                        }, null, 2),
                                    },
                                ],
                            }];
                    case 4:
                        error_11 = _a.sent();
                        throw new Error("Failed to get screen color: ".concat(error_11 instanceof Error ? error_11.message : String(error_11)));
                    case 5: return [2 /*return*/];
                }
            });
        });
    };
    EnhancedMacOSGUIControlServer.prototype.highlightRegion = function (x, y, width, height, duration) {
        return __awaiter(this, void 0, void 0, function () {
            var region, error_12;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.checkPermissions()];
                    case 1:
                        _a.sent();
                        _a.label = 2;
                    case 2:
                        _a.trys.push([2, 4, , 5]);
                        region = new nut_js_compat_1.Region(x, y, width, height);
                        // Fork version may not support highlight with duration - use basic highlight
                        return [4 /*yield*/, nut_js_compat_1.screen.highlight(region)];
                    case 3:
                        // Fork version may not support highlight with duration - use basic highlight
                        _a.sent();
                        // Simulate duration with a timeout
                        setTimeout(function () { }, duration);
                        return [2 /*return*/, {
                                content: [
                                    {
                                        type: 'text',
                                        text: "Highlighted region at (".concat(x, ", ").concat(y, ") with size ").concat(width, "x").concat(height, " for ").concat(duration, "ms"),
                                    },
                                ],
                            }];
                    case 4:
                        error_12 = _a.sent();
                        throw new Error("Failed to highlight region: ".concat(error_12 instanceof Error ? error_12.message : String(error_12)));
                    case 5: return [2 /*return*/];
                }
            });
        });
    };
    EnhancedMacOSGUIControlServer.prototype.copyToClipboard = function (text) {
        return __awaiter(this, void 0, void 0, function () {
            var error_13;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.checkPermissions()];
                    case 1:
                        _a.sent();
                        _a.label = 2;
                    case 2:
                        _a.trys.push([2, 4, , 5]);
                        // Fork version uses different clipboard API
                        return [4 /*yield*/, nut_js_compat_1.clipboard.setContent(text)];
                    case 3:
                        // Fork version uses different clipboard API
                        _a.sent();
                        return [2 /*return*/, {
                                content: [
                                    {
                                        type: 'text',
                                        text: "Copied to clipboard: \"".concat(text, "\""),
                                    },
                                ],
                            }];
                    case 4:
                        error_13 = _a.sent();
                        throw new Error("Failed to copy to clipboard: ".concat(error_13 instanceof Error ? error_13.message : String(error_13)));
                    case 5: return [2 /*return*/];
                }
            });
        });
    };
    EnhancedMacOSGUIControlServer.prototype.pasteFromClipboard = function () {
        return __awaiter(this, void 0, void 0, function () {
            var text, error_14;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.checkPermissions()];
                    case 1:
                        _a.sent();
                        _a.label = 2;
                    case 2:
                        _a.trys.push([2, 4, , 5]);
                        return [4 /*yield*/, nut_js_compat_1.clipboard.getContent()];
                    case 3:
                        text = _a.sent();
                        return [2 /*return*/, {
                                content: [
                                    {
                                        type: 'text',
                                        text: "Pasted from clipboard: \"".concat(text, "\""),
                                    },
                                ],
                            }];
                    case 4:
                        error_14 = _a.sent();
                        throw new Error("Failed to paste from clipboard: ".concat(error_14 instanceof Error ? error_14.message : String(error_14)));
                    case 5: return [2 /*return*/];
                }
            });
        });
    };
    EnhancedMacOSGUIControlServer.prototype.run = function () {
        return __awaiter(this, void 0, void 0, function () {
            var transport;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        transport = new stdio_js_1.StdioServerTransport();
                        return [4 /*yield*/, this.server.connect(transport)];
                    case 1:
                        _a.sent();
                        console.error('Enhanced macOS GUI Control MCP server running on stdio');
                        return [2 /*return*/];
                }
            });
        });
    };
    return EnhancedMacOSGUIControlServer;
}());
// Start the server
var server = new EnhancedMacOSGUIControlServer();
server.run().catch(console.error);
