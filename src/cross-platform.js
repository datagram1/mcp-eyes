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
var sharp_1 = require("sharp");
var os = require("os");
var child_process_1 = require("child_process");
var util_1 = require("util");
var window_bounds_helper_1 = require("./window-bounds-helper");
var powershell_integration_1 = require("./powershell-integration");
var execAsync = (0, util_1.promisify)(child_process_1.exec);
var CrossPlatformGUIControlServer = /** @class */ (function () {
    function CrossPlatformGUIControlServer() {
        this.currentApp = null;
        this.platform = this.detectPlatform();
        this.server = new index_js_1.Server({
            name: 'cross-platform-gui-control',
            version: '1.1.12',
        });
        this.setupToolHandlers();
    }
    CrossPlatformGUIControlServer.prototype.detectPlatform = function () {
        var platform = os.platform();
        switch (platform) {
            case 'darwin':
                return 'macos';
            case 'win32':
                return 'windows';
            case 'linux':
                return 'linux';
            default:
                throw new Error("Unsupported platform: ".concat(platform));
        }
    };
    CrossPlatformGUIControlServer.prototype.setupToolHandlers = function () {
        var _this = this;
        this.server.setRequestHandler(types_js_1.ListToolsRequestSchema, function () { return __awaiter(_this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                return [2 /*return*/, {
                        tools: [
                            {
                                name: 'listApplications',
                                description: "List all running applications with their window bounds (".concat(this.platform, ")"),
                                inputSchema: {
                                    type: 'object',
                                    properties: {},
                                },
                            },
                            {
                                name: 'focusApplication',
                                description: 'Focus on a specific application by name, bundle ID, or PID',
                                inputSchema: {
                                    type: 'object',
                                    properties: {
                                        identifier: {
                                            type: 'string',
                                            description: 'Application name, bundle ID, or PID to focus',
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
                            {
                                name: 'screenshotFullScreen',
                                description: 'Take a screenshot of the entire screen',
                                inputSchema: {
                                    type: 'object',
                                    properties: {
                                        format: {
                                            type: 'string',
                                            enum: ['png', 'jpg'],
                                            description: 'Image format',
                                            default: 'png',
                                        },
                                        quality: {
                                            type: 'number',
                                            description: 'JPEG quality (1-100)',
                                            default: 90,
                                        },
                                    },
                                },
                            },
                            {
                                name: 'screenshotRegion',
                                description: 'Take a screenshot of a specific screen region',
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
                                        format: {
                                            type: 'string',
                                            enum: ['png', 'jpg'],
                                            description: 'Image format',
                                            default: 'png',
                                        },
                                        quality: {
                                            type: 'number',
                                            description: 'JPEG quality (1-100)',
                                            default: 90,
                                        },
                                    },
                                    required: ['x', 'y', 'width', 'height'],
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
                        _c.trys.push([1, 18, , 19]);
                        _b = name;
                        switch (_b) {
                            case 'listApplications': return [3 /*break*/, 2];
                            case 'focusApplication': return [3 /*break*/, 4];
                            case 'click': return [3 /*break*/, 6];
                            case 'moveMouse': return [3 /*break*/, 8];
                            case 'screenshot': return [3 /*break*/, 10];
                            case 'screenshotFullScreen': return [3 /*break*/, 12];
                            case 'screenshotRegion': return [3 /*break*/, 14];
                        }
                        return [3 /*break*/, 16];
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
                    case 12: return [4 /*yield*/, this.screenshotFullScreen((args === null || args === void 0 ? void 0 : args.format) || 'png', (args === null || args === void 0 ? void 0 : args.quality) || 90)];
                    case 13: return [2 /*return*/, _c.sent()];
                    case 14: return [4 /*yield*/, this.screenshotRegion(args === null || args === void 0 ? void 0 : args.x, args === null || args === void 0 ? void 0 : args.y, args === null || args === void 0 ? void 0 : args.width, args === null || args === void 0 ? void 0 : args.height, (args === null || args === void 0 ? void 0 : args.format) || 'png', (args === null || args === void 0 ? void 0 : args.quality) || 90)];
                    case 15: return [2 /*return*/, _c.sent()];
                    case 16: throw new Error("Unknown tool: ".concat(name));
                    case 17: return [3 /*break*/, 19];
                    case 18:
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
                    case 19: return [2 /*return*/];
                }
            });
        }); });
    };
    CrossPlatformGUIControlServer.prototype.checkPermissions = function () {
        return __awaiter(this, void 0, void 0, function () {
            var _a;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        _a = this.platform;
                        switch (_a) {
                            case 'macos': return [3 /*break*/, 1];
                            case 'windows': return [3 /*break*/, 3];
                            case 'linux': return [3 /*break*/, 5];
                        }
                        return [3 /*break*/, 7];
                    case 1: return [4 /*yield*/, this.checkMacOSPermissions()];
                    case 2:
                        _b.sent();
                        return [3 /*break*/, 7];
                    case 3: return [4 /*yield*/, this.checkWindowsPermissions()];
                    case 4:
                        _b.sent();
                        return [3 /*break*/, 7];
                    case 5: return [4 /*yield*/, this.checkLinuxPermissions()];
                    case 6:
                        _b.sent();
                        return [3 /*break*/, 7];
                    case 7: return [2 /*return*/];
                }
            });
        });
    };
    CrossPlatformGUIControlServer.prototype.checkMacOSPermissions = function () {
        return __awaiter(this, void 0, void 0, function () {
            var permissions, screenRecording, accessibility, error_2;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 2, , 3]);
                        return [4 /*yield*/, Promise.resolve().then(function () { return require('node-mac-permissions'); })];
                    case 1:
                        permissions = _a.sent();
                        screenRecording = permissions.getAuthStatus('screen');
                        accessibility = permissions.getAuthStatus('accessibility');
                        if (screenRecording !== 'authorized') {
                            throw new Error('Screen Recording permission is required. Please grant permission in System Preferences > Security & Privacy > Privacy > Screen Recording.');
                        }
                        if (accessibility !== 'authorized') {
                            throw new Error('Accessibility permission is required. Please grant permission in System Preferences > Security & Privacy > Privacy > Accessibility.');
                        }
                        return [3 /*break*/, 3];
                    case 2:
                        error_2 = _a.sent();
                        console.warn('Could not check macOS permissions:', error_2);
                        return [3 /*break*/, 3];
                    case 3: return [2 /*return*/];
                }
            });
        });
    };
    CrossPlatformGUIControlServer.prototype.checkWindowsPermissions = function () {
        return __awaiter(this, void 0, void 0, function () {
            var adminRights, error_3;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 3, , 4]);
                        return [4 /*yield*/, powershell_integration_1.powerShellIntegration.checkAdminRights()];
                    case 1:
                        adminRights = _a.sent();
                        if (adminRights.error && !adminRights.canAccessHKLM) {
                            console.warn('Windows permissions warning:', adminRights.error);
                        }
                        // Test basic PowerShell functionality
                        return [4 /*yield*/, execAsync('powershell.exe -Command "Get-Process | Select-Object -First 1"')];
                    case 2:
                        // Test basic PowerShell functionality
                        _a.sent();
                        return [3 /*break*/, 4];
                    case 3:
                        error_3 = _a.sent();
                        throw new Error('Windows permissions check failed. Make sure you have access to run PowerShell commands.');
                    case 4: return [2 /*return*/];
                }
            });
        });
    };
    CrossPlatformGUIControlServer.prototype.checkLinuxPermissions = function () {
        return __awaiter(this, void 0, void 0, function () {
            var error_4;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 2, , 3]);
                        return [4 /*yield*/, execAsync('which wmctrl')];
                    case 1:
                        _a.sent();
                        return [3 /*break*/, 3];
                    case 2:
                        error_4 = _a.sent();
                        throw new Error('Linux requires wmctrl. Install with: sudo apt-get install wmctrl');
                    case 3: return [2 /*return*/];
                }
            });
        });
    };
    CrossPlatformGUIControlServer.prototype.listApplications = function () {
        return __awaiter(this, void 0, void 0, function () {
            var _a;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0: return [4 /*yield*/, this.checkPermissions()];
                    case 1:
                        _b.sent();
                        _a = this.platform;
                        switch (_a) {
                            case 'macos': return [3 /*break*/, 2];
                            case 'windows': return [3 /*break*/, 4];
                            case 'linux': return [3 /*break*/, 6];
                        }
                        return [3 /*break*/, 8];
                    case 2: return [4 /*yield*/, this.listMacOSApplications()];
                    case 3: return [2 /*return*/, _b.sent()];
                    case 4: return [4 /*yield*/, this.listWindowsApplications()];
                    case 5: return [2 /*return*/, _b.sent()];
                    case 6: return [4 /*yield*/, this.listLinuxApplications()];
                    case 7: return [2 /*return*/, _b.sent()];
                    case 8: return [2 /*return*/];
                }
            });
        });
    };
    CrossPlatformGUIControlServer.prototype.listMacOSApplications = function () {
        return __awaiter(this, void 0, void 0, function () {
            var run, apps, _i, _a, app, bounds, error_5;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        _b.trys.push([0, 7, , 8]);
                        return [4 /*yield*/, Promise.resolve().then(function () { return require('@jxa/run'); })];
                    case 1:
                        run = (_b.sent()).run;
                        return [4 /*yield*/, run(function () {
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
                    case 7:
                        error_5 = _b.sent();
                        throw new Error("macOS app listing failed: ".concat(error_5 instanceof Error ? error_5.message : String(error_5)));
                    case 8: return [2 /*return*/];
                }
            });
        });
    };
    CrossPlatformGUIControlServer.prototype.listWindowsApplications = function () {
        return __awaiter(this, void 0, void 0, function () {
            var processes, apps, error_6;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 2, , 3]);
                        return [4 /*yield*/, powershell_integration_1.powerShellIntegration.getProcesses()];
                    case 1:
                        processes = _a.sent();
                        apps = processes.map(function (proc) { return ({
                            name: proc.name,
                            pid: proc.pid,
                            title: proc.title,
                            mainWindowHandle: proc.mainWindowHandle,
                            bounds: { x: 0, y: 0, width: 0, height: 0 } // Windows doesn't easily provide bounds via PowerShell
                        }); });
                        return [2 /*return*/, {
                                content: [
                                    {
                                        type: 'text',
                                        text: JSON.stringify(apps, null, 2),
                                    },
                                ],
                            }];
                    case 2:
                        error_6 = _a.sent();
                        throw new Error("Windows app listing failed: ".concat(error_6 instanceof Error ? error_6.message : String(error_6)));
                    case 3: return [2 /*return*/];
                }
            });
        });
    };
    CrossPlatformGUIControlServer.prototype.listLinuxApplications = function () {
        return __awaiter(this, void 0, void 0, function () {
            var stdout, lines, apps, error_7;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 2, , 3]);
                        return [4 /*yield*/, execAsync('wmctrl -l')];
                    case 1:
                        stdout = (_a.sent()).stdout;
                        lines = stdout.trim().split('\n');
                        apps = lines.map(function (line) {
                            var parts = line.split(/\s+/);
                            var windowId = parts[0];
                            var desktop = parts[1];
                            var title = parts.slice(3).join(' ');
                            return {
                                name: title,
                                windowId: windowId,
                                desktop: desktop,
                                pid: 0, // wmctrl doesn't provide PID directly
                                bounds: { x: 0, y: 0, width: 0, height: 0 } // Would need xwininfo for bounds
                            };
                        });
                        return [2 /*return*/, {
                                content: [
                                    {
                                        type: 'text',
                                        text: JSON.stringify(apps, null, 2),
                                    },
                                ],
                            }];
                    case 2:
                        error_7 = _a.sent();
                        throw new Error("Linux app listing failed: ".concat(error_7 instanceof Error ? error_7.message : String(error_7)));
                    case 3: return [2 /*return*/];
                }
            });
        });
    };
    CrossPlatformGUIControlServer.prototype.focusApplication = function (identifier) {
        return __awaiter(this, void 0, void 0, function () {
            var _a;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0: return [4 /*yield*/, this.checkPermissions()];
                    case 1:
                        _b.sent();
                        _a = this.platform;
                        switch (_a) {
                            case 'macos': return [3 /*break*/, 2];
                            case 'windows': return [3 /*break*/, 4];
                            case 'linux': return [3 /*break*/, 6];
                        }
                        return [3 /*break*/, 8];
                    case 2: return [4 /*yield*/, this.focusMacOSApplication(identifier)];
                    case 3: return [2 /*return*/, _b.sent()];
                    case 4: return [4 /*yield*/, this.focusWindowsApplication(identifier)];
                    case 5: return [2 /*return*/, _b.sent()];
                    case 6: return [4 /*yield*/, this.focusLinuxApplication(identifier)];
                    case 7: return [2 /*return*/, _b.sent()];
                    case 8: return [2 /*return*/];
                }
            });
        });
    };
    CrossPlatformGUIControlServer.prototype.focusMacOSApplication = function (identifier) {
        return __awaiter(this, void 0, void 0, function () {
            var run, apps, targetApp, pid_1, bounds, error_8;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 5, , 6]);
                        return [4 /*yield*/, Promise.resolve().then(function () { return require('@jxa/run'); })];
                    case 1:
                        run = (_a.sent()).run;
                        return [4 /*yield*/, run(function () {
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
                        targetApp = void 0;
                        // Try to find by bundle ID first
                        targetApp = apps.find(function (app) { return app.bundleId === identifier; });
                        // If not found, try by PID
                        if (!targetApp) {
                            pid_1 = parseInt(identifier);
                            if (!isNaN(pid_1)) {
                                targetApp = apps.find(function (app) { return app.pid === pid_1; });
                            }
                        }
                        // If not found, try by name
                        if (!targetApp) {
                            targetApp = apps.find(function (app) { return app.name.toLowerCase().includes(identifier.toLowerCase()); });
                        }
                        if (!targetApp) {
                            throw new Error("Application not found: ".concat(identifier));
                        }
                        // Focus the application
                        return [4 /*yield*/, run(function (bundleId) {
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
                                        text: "Focused on macOS application: ".concat(targetApp.name, " (").concat(targetApp.bundleId, ")"),
                                    },
                                ],
                            }];
                    case 5:
                        error_8 = _a.sent();
                        throw new Error("macOS focus failed: ".concat(error_8 instanceof Error ? error_8.message : String(error_8)));
                    case 6: return [2 /*return*/];
                }
            });
        });
    };
    CrossPlatformGUIControlServer.prototype.focusWindowsApplication = function (identifier) {
        return __awaiter(this, void 0, void 0, function () {
            var processDetails, focusResult, error_9;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 3, , 4]);
                        return [4 /*yield*/, powershell_integration_1.powerShellIntegration.getProcessDetails(identifier)];
                    case 1:
                        processDetails = _a.sent();
                        if (!processDetails) {
                            throw new Error("Application not found: ".concat(identifier));
                        }
                        return [4 /*yield*/, powershell_integration_1.powerShellIntegration.focusWindowByProcessName(processDetails.name)];
                    case 2:
                        focusResult = _a.sent();
                        if (!focusResult.success) {
                            throw new Error(focusResult.error || 'Failed to focus window');
                        }
                        // Set the current app for coordinate mapping
                        this.currentApp = {
                            name: processDetails.name,
                            pid: processDetails.pid,
                            bounds: { x: 0, y: 0, width: 0, height: 0 } // Windows bounds would need additional WinAPI calls
                        };
                        return [2 /*return*/, {
                                content: [
                                    {
                                        type: 'text',
                                        text: "Focused on Windows application: ".concat(processDetails.name, " (PID: ").concat(processDetails.pid, ") - \"").concat(processDetails.title, "\""),
                                    },
                                ],
                            }];
                    case 3:
                        error_9 = _a.sent();
                        throw new Error("Windows focus failed: ".concat(error_9 instanceof Error ? error_9.message : String(error_9)));
                    case 4: return [2 /*return*/];
                }
            });
        });
    };
    CrossPlatformGUIControlServer.prototype.focusLinuxApplication = function (identifier) {
        return __awaiter(this, void 0, void 0, function () {
            var stdout, error_10;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 2, , 3]);
                        return [4 /*yield*/, execAsync("wmctrl -a \"".concat(identifier, "\""))];
                    case 1:
                        stdout = (_a.sent()).stdout;
                        this.currentApp = {
                            name: identifier,
                            pid: 0,
                            bounds: { x: 0, y: 0, width: 0, height: 0 }
                        };
                        return [2 /*return*/, {
                                content: [
                                    {
                                        type: 'text',
                                        text: "Focused on Linux application: ".concat(identifier),
                                    },
                                ],
                            }];
                    case 2:
                        error_10 = _a.sent();
                        throw new Error("Linux focus failed: ".concat(error_10 instanceof Error ? error_10.message : String(error_10)));
                    case 3: return [2 /*return*/];
                }
            });
        });
    };
    CrossPlatformGUIControlServer.prototype.click = function (x, y, button) {
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
    CrossPlatformGUIControlServer.prototype.moveMouse = function (x, y) {
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
    CrossPlatformGUIControlServer.prototype.screenshot = function (padding) {
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
    CrossPlatformGUIControlServer.prototype.screenshotFullScreen = function (format, quality) {
        return __awaiter(this, void 0, void 0, function () {
            var fullScreenshot, processedBuffer, base64Image;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.checkPermissions()];
                    case 1:
                        _a.sent();
                        return [4 /*yield*/, (0, screenshot_desktop_1.default)()];
                    case 2:
                        fullScreenshot = _a.sent();
                        if (!(format === 'jpg')) return [3 /*break*/, 4];
                        return [4 /*yield*/, (0, sharp_1.default)(fullScreenshot)
                                .jpeg({ quality: quality })
                                .toBuffer()];
                    case 3:
                        processedBuffer = _a.sent();
                        return [3 /*break*/, 6];
                    case 4: return [4 /*yield*/, (0, sharp_1.default)(fullScreenshot)
                            .png()
                            .toBuffer()];
                    case 5:
                        processedBuffer = _a.sent();
                        _a.label = 6;
                    case 6:
                        base64Image = processedBuffer.toString('base64');
                        return [2 /*return*/, {
                                content: [
                                    {
                                        type: 'text',
                                        text: "Full screen screenshot (".concat(format.toUpperCase(), ")"),
                                    },
                                    {
                                        type: 'image',
                                        data: base64Image,
                                        mimeType: "image/".concat(format),
                                    },
                                ],
                            }];
                }
            });
        });
    };
    CrossPlatformGUIControlServer.prototype.screenshotRegion = function (x, y, width, height, format, quality) {
        return __awaiter(this, void 0, void 0, function () {
            var fullScreenshot, processedBuffer, base64Image;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.checkPermissions()];
                    case 1:
                        _a.sent();
                        return [4 /*yield*/, (0, screenshot_desktop_1.default)()];
                    case 2:
                        fullScreenshot = _a.sent();
                        if (!(format === 'jpg')) return [3 /*break*/, 4];
                        return [4 /*yield*/, (0, sharp_1.default)(fullScreenshot)
                                .extract({ left: x, top: y, width: width, height: height })
                                .jpeg({ quality: quality })
                                .toBuffer()];
                    case 3:
                        processedBuffer = _a.sent();
                        return [3 /*break*/, 6];
                    case 4: return [4 /*yield*/, (0, sharp_1.default)(fullScreenshot)
                            .extract({ left: x, top: y, width: width, height: height })
                            .png()
                            .toBuffer()];
                    case 5:
                        processedBuffer = _a.sent();
                        _a.label = 6;
                    case 6:
                        base64Image = processedBuffer.toString('base64');
                        return [2 /*return*/, {
                                content: [
                                    {
                                        type: 'text',
                                        text: "Region screenshot (".concat(width, "x").concat(height, "px at ").concat(x, ",").concat(y, ")"),
                                    },
                                    {
                                        type: 'image',
                                        data: base64Image,
                                        mimeType: "image/".concat(format),
                                    },
                                ],
                            }];
                }
            });
        });
    };
    CrossPlatformGUIControlServer.prototype.run = function () {
        return __awaiter(this, void 0, void 0, function () {
            var transport;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        transport = new stdio_js_1.StdioServerTransport();
                        return [4 /*yield*/, this.server.connect(transport)];
                    case 1:
                        _a.sent();
                        console.error("Cross-platform GUI Control MCP server running on stdio (".concat(this.platform, ")"));
                        return [2 /*return*/];
                }
            });
        });
    };
    return CrossPlatformGUIControlServer;
}());
// Start the server
var server = new CrossPlatformGUIControlServer();
server.run().catch(console.error);
