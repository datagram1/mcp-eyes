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
var SimplifiedEnhancedMacOSGUIControlServer = /** @class */ (function () {
    function SimplifiedEnhancedMacOSGUIControlServer() {
        this.currentApp = null;
        this.server = new index_js_1.Server({
            name: 'simplified-enhanced-macos-gui-control',
            version: '1.1.15',
        });
        this.setupToolHandlers();
    }
    SimplifiedEnhancedMacOSGUIControlServer.prototype.setupToolHandlers = function () {
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
                            // NEW ENHANCED TOOLS (simplified for fork compatibility)
                            {
                                name: 'doubleClick',
                                description: 'Perform a double-click at specified coordinates relative to the focused app window',
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
                                            description: 'Mouse button to double-click',
                                            default: 'left',
                                        },
                                    },
                                    required: ['x', 'y'],
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
                                            enum: ['up', 'down'],
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
                                name: 'getMousePosition',
                                description: 'Get the current mouse position',
                                inputSchema: {
                                    type: 'object',
                                    properties: {},
                                },
                            },
                            {
                                name: 'wait',
                                description: 'Wait for a specified amount of time',
                                inputSchema: {
                                    type: 'object',
                                    properties: {
                                        milliseconds: {
                                            type: 'number',
                                            description: 'Number of milliseconds to wait',
                                        },
                                    },
                                    required: ['milliseconds'],
                                },
                            },
                            {
                                name: 'getScreenSize',
                                description: 'Get the screen dimensions',
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
                        _c.trys.push([1, 24, , 25]);
                        _b = name;
                        switch (_b) {
                            case 'listApplications': return [3 /*break*/, 2];
                            case 'focusApplication': return [3 /*break*/, 4];
                            case 'click': return [3 /*break*/, 6];
                            case 'moveMouse': return [3 /*break*/, 8];
                            case 'screenshot': return [3 /*break*/, 10];
                            case 'doubleClick': return [3 /*break*/, 12];
                            case 'scrollMouse': return [3 /*break*/, 14];
                            case 'getMousePosition': return [3 /*break*/, 16];
                            case 'wait': return [3 /*break*/, 18];
                            case 'getScreenSize': return [3 /*break*/, 20];
                        }
                        return [3 /*break*/, 22];
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
                    case 12: return [4 /*yield*/, this.doubleClick(args === null || args === void 0 ? void 0 : args.x, args === null || args === void 0 ? void 0 : args.y, (args === null || args === void 0 ? void 0 : args.button) || 'left')];
                    case 13: return [2 /*return*/, _c.sent()];
                    case 14: return [4 /*yield*/, this.scrollMouse(args === null || args === void 0 ? void 0 : args.direction, (args === null || args === void 0 ? void 0 : args.amount) || 3)];
                    case 15: return [2 /*return*/, _c.sent()];
                    case 16: return [4 /*yield*/, this.getMousePosition()];
                    case 17: return [2 /*return*/, _c.sent()];
                    case 18: return [4 /*yield*/, this.wait(args === null || args === void 0 ? void 0 : args.milliseconds)];
                    case 19: return [2 /*return*/, _c.sent()];
                    case 20: return [4 /*yield*/, this.getScreenSize()];
                    case 21: return [2 /*return*/, _c.sent()];
                    case 22: throw new Error("Unknown tool: ".concat(name));
                    case 23: return [3 /*break*/, 25];
                    case 24:
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
                    case 25: return [2 /*return*/];
                }
            });
        }); });
    };
    SimplifiedEnhancedMacOSGUIControlServer.prototype.checkPermissions = function () {
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
    SimplifiedEnhancedMacOSGUIControlServer.prototype.listApplications = function () {
        return __awaiter(this, void 0, void 0, function () {
            var apps;
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
                        return [2 /*return*/, {
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
    SimplifiedEnhancedMacOSGUIControlServer.prototype.focusApplication = function (identifier) {
        return __awaiter(this, void 0, void 0, function () {
            var apps, targetApp, pid_1;
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
    SimplifiedEnhancedMacOSGUIControlServer.prototype.click = function (x, y, button) {
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
    SimplifiedEnhancedMacOSGUIControlServer.prototype.moveMouse = function (x, y) {
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
    SimplifiedEnhancedMacOSGUIControlServer.prototype.screenshot = function (padding) {
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
    // NEW ENHANCED METHODS (simplified for fork compatibility)
    SimplifiedEnhancedMacOSGUIControlServer.prototype.doubleClick = function (x, y, button) {
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
                            case 'right': return [3 /*break*/, 6];
                            case 'middle': return [3 /*break*/, 9];
                        }
                        return [3 /*break*/, 12];
                    case 3: return [4 /*yield*/, nut_js_1.mouse.leftClick()];
                    case 4:
                        _b.sent();
                        return [4 /*yield*/, nut_js_1.mouse.leftClick()];
                    case 5:
                        _b.sent();
                        return [3 /*break*/, 13];
                    case 6: return [4 /*yield*/, nut_js_1.mouse.rightClick()];
                    case 7:
                        _b.sent();
                        return [4 /*yield*/, nut_js_1.mouse.rightClick()];
                    case 8:
                        _b.sent();
                        return [3 /*break*/, 13];
                    case 9: return [4 /*yield*/, nut_js_1.mouse.scrollDown(0)];
                    case 10:
                        _b.sent();
                        return [4 /*yield*/, nut_js_1.mouse.scrollDown(0)];
                    case 11:
                        _b.sent();
                        return [3 /*break*/, 13];
                    case 12: throw new Error("Invalid button: ".concat(button));
                    case 13: return [2 /*return*/, {
                            content: [
                                {
                                    type: 'text',
                                    text: "Double-clicked ".concat(button, " button at (").concat(x.toFixed(3), ", ").concat(y.toFixed(3), ") relative to ").concat(this.currentApp.name),
                                },
                            ],
                        }];
                }
            });
        });
    };
    SimplifiedEnhancedMacOSGUIControlServer.prototype.scrollMouse = function (direction, amount) {
        return __awaiter(this, void 0, void 0, function () {
            var _a, error_2;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0: return [4 /*yield*/, this.checkPermissions()];
                    case 1:
                        _b.sent();
                        _b.label = 2;
                    case 2:
                        _b.trys.push([2, 9, , 10]);
                        _a = direction.toLowerCase();
                        switch (_a) {
                            case 'up': return [3 /*break*/, 3];
                            case 'down': return [3 /*break*/, 5];
                        }
                        return [3 /*break*/, 7];
                    case 3: return [4 /*yield*/, nut_js_1.mouse.scrollUp(amount)];
                    case 4:
                        _b.sent();
                        return [3 /*break*/, 8];
                    case 5: return [4 /*yield*/, nut_js_1.mouse.scrollDown(amount)];
                    case 6:
                        _b.sent();
                        return [3 /*break*/, 8];
                    case 7: throw new Error("Invalid scroll direction: ".concat(direction, ". Use 'up' or 'down'."));
                    case 8: return [2 /*return*/, {
                            content: [
                                {
                                    type: 'text',
                                    text: "Scrolled mouse ".concat(direction, " by ").concat(amount, " steps"),
                                },
                            ],
                        }];
                    case 9:
                        error_2 = _b.sent();
                        throw new Error("Failed to scroll mouse: ".concat(error_2 instanceof Error ? error_2.message : String(error_2)));
                    case 10: return [2 /*return*/];
                }
            });
        });
    };
    SimplifiedEnhancedMacOSGUIControlServer.prototype.getMousePosition = function () {
        return __awaiter(this, void 0, void 0, function () {
            var position, relativePosition, relativeX, relativeY, error_3;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.checkPermissions()];
                    case 1:
                        _a.sent();
                        _a.label = 2;
                    case 2:
                        _a.trys.push([2, 4, , 5]);
                        return [4 /*yield*/, nut_js_1.mouse.getPosition()];
                    case 3:
                        position = _a.sent();
                        relativePosition = null;
                        if (this.currentApp) {
                            relativeX = (position.x - this.currentApp.bounds.x) / this.currentApp.bounds.width;
                            relativeY = (position.y - this.currentApp.bounds.y) / this.currentApp.bounds.height;
                            relativePosition = {
                                x: relativeX,
                                y: relativeY,
                                app: this.currentApp.name
                            };
                        }
                        return [2 /*return*/, {
                                content: [
                                    {
                                        type: 'text',
                                        text: JSON.stringify({
                                            absolute: {
                                                x: position.x,
                                                y: position.y
                                            },
                                            relative: relativePosition
                                        }, null, 2),
                                    },
                                ],
                            }];
                    case 4:
                        error_3 = _a.sent();
                        throw new Error("Failed to get mouse position: ".concat(error_3 instanceof Error ? error_3.message : String(error_3)));
                    case 5: return [2 /*return*/];
                }
            });
        });
    };
    SimplifiedEnhancedMacOSGUIControlServer.prototype.wait = function (milliseconds) {
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
    SimplifiedEnhancedMacOSGUIControlServer.prototype.getScreenSize = function () {
        return __awaiter(this, void 0, void 0, function () {
            var screenshotBuffer, image, metadata, error_4;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.checkPermissions()];
                    case 1:
                        _a.sent();
                        _a.label = 2;
                    case 2:
                        _a.trys.push([2, 6, , 7]);
                        return [4 /*yield*/, (0, screenshot_desktop_1.default)()];
                    case 3:
                        screenshotBuffer = _a.sent();
                        return [4 /*yield*/, (0, sharp_1.default)(screenshotBuffer)];
                    case 4:
                        image = _a.sent();
                        return [4 /*yield*/, image.metadata()];
                    case 5:
                        metadata = _a.sent();
                        return [2 /*return*/, {
                                content: [
                                    {
                                        type: 'text',
                                        text: JSON.stringify({
                                            width: metadata.width,
                                            height: metadata.height,
                                            channels: metadata.channels,
                                            format: metadata.format
                                        }, null, 2),
                                    },
                                ],
                            }];
                    case 6:
                        error_4 = _a.sent();
                        throw new Error("Failed to get screen size: ".concat(error_4 instanceof Error ? error_4.message : String(error_4)));
                    case 7: return [2 /*return*/];
                }
            });
        });
    };
    SimplifiedEnhancedMacOSGUIControlServer.prototype.run = function () {
        return __awaiter(this, void 0, void 0, function () {
            var transport;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        transport = new stdio_js_1.StdioServerTransport();
                        return [4 /*yield*/, this.server.connect(transport)];
                    case 1:
                        _a.sent();
                        console.error('Simplified Enhanced macOS GUI Control MCP server running on stdio');
                        return [2 /*return*/];
                }
            });
        });
    };
    return SimplifiedEnhancedMacOSGUIControlServer;
}());
// Start the server
var server = new SimplifiedEnhancedMacOSGUIControlServer();
server.run().catch(console.error);
