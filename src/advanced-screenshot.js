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
var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
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
var AdvancedScreenshotMacOSGUIControlServer = /** @class */ (function () {
    function AdvancedScreenshotMacOSGUIControlServer() {
        this.currentApp = null;
        this.logFile = '/Users/richardbrown/dev/mcp_eyes/test-screenshots/mcp-eyes-debug-log.md';
        this.server = new index_js_1.Server({
            name: 'advanced-screenshot-macos-gui-control',
            version: '1.1.12',
        });
        this.setupToolHandlers();
    }
    AdvancedScreenshotMacOSGUIControlServer.prototype.log = function (message) {
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
    AdvancedScreenshotMacOSGUIControlServer.prototype.setupToolHandlers = function () {
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
                            // ADVANCED SCREENSHOT TOOLS
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
                            {
                                name: 'screenshotFullScreen',
                                description: 'Take a screenshot of the entire screen',
                                inputSchema: {
                                    type: 'object',
                                    properties: {
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
                                        saveToFile: {
                                            type: 'string',
                                            description: 'Optional: Save to file path instead of returning base64',
                                        },
                                    },
                                },
                            },
                            {
                                name: 'screenshotDisplay',
                                description: 'Take a screenshot of a specific display',
                                inputSchema: {
                                    type: 'object',
                                    properties: {
                                        displayId: {
                                            type: 'string',
                                            description: 'Display ID (use listDisplays to see available displays)',
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
                                        saveToFile: {
                                            type: 'string',
                                            description: 'Optional: Save to file path instead of returning base64',
                                        },
                                    },
                                    required: ['displayId'],
                                },
                            },
                            {
                                name: 'screenshotAllDisplays',
                                description: 'Take screenshots of all displays simultaneously',
                                inputSchema: {
                                    type: 'object',
                                    properties: {
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
                                        saveToFiles: {
                                            type: 'string',
                                            description: 'Optional: Directory to save files (will generate timestamped names)',
                                        },
                                    },
                                },
                            },
                            {
                                name: 'listDisplays',
                                description: 'List all available displays',
                                inputSchema: {
                                    type: 'object',
                                    properties: {},
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
                                            description: 'Image format (png or jpg)',
                                            default: 'png',
                                        },
                                        quality: {
                                            type: 'number',
                                            description: 'JPEG quality (1-100, only applies to JPG format)',
                                            default: 90,
                                        },
                                        saveToFile: {
                                            type: 'string',
                                            description: 'Optional: Save to file path instead of returning base64',
                                        },
                                    },
                                    required: ['x', 'y', 'width', 'height'],
                                },
                            },
                            {
                                name: 'screenshotWithTimestamp',
                                description: 'Take a screenshot and save it with a timestamped filename',
                                inputSchema: {
                                    type: 'object',
                                    properties: {
                                        directory: {
                                            type: 'string',
                                            description: 'Directory to save the screenshot',
                                            default: './screenshots',
                                        },
                                        prefix: {
                                            type: 'string',
                                            description: 'Filename prefix',
                                            default: 'screenshot',
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
                                        padding: {
                                            type: 'number',
                                            description: 'Padding around the focused app window (if no app focused, takes full screen)',
                                            default: 10,
                                        },
                                    },
                                },
                            },
                            {
                                name: 'focusApplicationDirect',
                                description: 'Directly focus on an application by name (simpler, more reliable method)',
                                inputSchema: {
                                    type: 'object',
                                    properties: {
                                        appName: {
                                            type: 'string',
                                            description: 'Name of the application to focus (e.g., "Claude", "Safari", "Finder")',
                                        },
                                    },
                                    required: ['appName'],
                                },
                            },
                            {
                                name: 'screenshotApplication',
                                description: 'Smart screenshot of a specific application - automatically finds the app across all displays and takes a targeted screenshot',
                                inputSchema: {
                                    type: 'object',
                                    properties: {
                                        appName: {
                                            type: 'string',
                                            description: 'Name of the application to screenshot (e.g., "Claude", "Safari", "Finder")',
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
                                        saveToFile: {
                                            type: 'string',
                                            description: 'Optional: Save to file path instead of returning base64',
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
                            case 'listApplications': return [3 /*break*/, 2];
                            case 'focusApplication': return [3 /*break*/, 4];
                            case 'click': return [3 /*break*/, 6];
                            case 'moveMouse': return [3 /*break*/, 8];
                            case 'screenshot': return [3 /*break*/, 10];
                            case 'screenshotFullScreen': return [3 /*break*/, 12];
                            case 'screenshotDisplay': return [3 /*break*/, 14];
                            case 'screenshotAllDisplays': return [3 /*break*/, 16];
                            case 'listDisplays': return [3 /*break*/, 18];
                            case 'screenshotRegion': return [3 /*break*/, 20];
                            case 'screenshotWithTimestamp': return [3 /*break*/, 22];
                            case 'focusApplicationDirect': return [3 /*break*/, 24];
                            case 'screenshotApplication': return [3 /*break*/, 26];
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
                    case 12: return [4 /*yield*/, this.screenshotFullScreen((args === null || args === void 0 ? void 0 : args.format) || 'png', (args === null || args === void 0 ? void 0 : args.quality) || 90, args === null || args === void 0 ? void 0 : args.saveToFile)];
                    case 13: return [2 /*return*/, _c.sent()];
                    case 14: return [4 /*yield*/, this.screenshotDisplay(args === null || args === void 0 ? void 0 : args.displayId, (args === null || args === void 0 ? void 0 : args.format) || 'png', (args === null || args === void 0 ? void 0 : args.quality) || 90, args === null || args === void 0 ? void 0 : args.saveToFile)];
                    case 15: return [2 /*return*/, _c.sent()];
                    case 16: return [4 /*yield*/, this.screenshotAllDisplays((args === null || args === void 0 ? void 0 : args.format) || 'png', (args === null || args === void 0 ? void 0 : args.quality) || 90, args === null || args === void 0 ? void 0 : args.saveToFiles)];
                    case 17: return [2 /*return*/, _c.sent()];
                    case 18: return [4 /*yield*/, this.listDisplays()];
                    case 19: return [2 /*return*/, _c.sent()];
                    case 20: return [4 /*yield*/, this.screenshotRegion(args === null || args === void 0 ? void 0 : args.x, args === null || args === void 0 ? void 0 : args.y, args === null || args === void 0 ? void 0 : args.width, args === null || args === void 0 ? void 0 : args.height, (args === null || args === void 0 ? void 0 : args.format) || 'png', (args === null || args === void 0 ? void 0 : args.quality) || 90, args === null || args === void 0 ? void 0 : args.saveToFile)];
                    case 21: return [2 /*return*/, _c.sent()];
                    case 22: return [4 /*yield*/, this.screenshotWithTimestamp((args === null || args === void 0 ? void 0 : args.directory) || './screenshots', (args === null || args === void 0 ? void 0 : args.prefix) || 'screenshot', (args === null || args === void 0 ? void 0 : args.format) || 'png', (args === null || args === void 0 ? void 0 : args.quality) || 90, (args === null || args === void 0 ? void 0 : args.padding) || 10)];
                    case 23: return [2 /*return*/, _c.sent()];
                    case 24: return [4 /*yield*/, this.focusApplicationDirect(args === null || args === void 0 ? void 0 : args.appName)];
                    case 25: return [2 /*return*/, _c.sent()];
                    case 26: return [4 /*yield*/, this.screenshotApplication(args === null || args === void 0 ? void 0 : args.appName, (args === null || args === void 0 ? void 0 : args.padding) || 10, (args === null || args === void 0 ? void 0 : args.format) || 'png', (args === null || args === void 0 ? void 0 : args.quality) || 90, args === null || args === void 0 ? void 0 : args.saveToFile, (args === null || args === void 0 ? void 0 : args.moveToPrimary) || false)];
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
    AdvancedScreenshotMacOSGUIControlServer.prototype.checkPermissions = function () {
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
    AdvancedScreenshotMacOSGUIControlServer.prototype.listApplications = function () {
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
                                    bounds: { x: 0, y: 0, width: 0, height: 0 } // We'll get bounds from window info
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
    AdvancedScreenshotMacOSGUIControlServer.prototype.focusApplication = function (identifier) {
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
                                    bounds: { x: 0, y: 0, width: 0, height: 0 } // We'll get bounds from window info
                                }); });
                            })];
                    case 3:
                        apps = _a.sent();
                        targetApp = void 0;
                        // Try to find by bundle ID first
                        targetApp = apps.find(function (app) { return app.bundleId === identifier; });
                        // If not found, try by name
                        if (!targetApp) {
                            targetApp = apps.find(function (app) { return app.name.toLowerCase().includes(identifier.toLowerCase()); });
                        }
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
                        return [4 /*yield*/, (0, run_1.run)(function (appName) {
                                // @ts-ignore
                                var app = Application(appName);
                                app.activate();
                                // Try to get window bounds
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
                                    bounds: { x: 0, y: 0, width: 1920, height: 1080 } // Default bounds
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
    AdvancedScreenshotMacOSGUIControlServer.prototype.click = function (x, y, button) {
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
    AdvancedScreenshotMacOSGUIControlServer.prototype.moveMouse = function (x, y) {
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
    // ADVANCED SCREENSHOT METHODS
    AdvancedScreenshotMacOSGUIControlServer.prototype.screenshot = function (padding, format, quality) {
        return __awaiter(this, void 0, void 0, function () {
            var fullScreenshot, cropX, cropY, cropWidth, cropHeight, processedBuffer, base64Image;
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
                        if (!(format === 'jpg')) return [3 /*break*/, 4];
                        return [4 /*yield*/, (0, sharp_1.default)(fullScreenshot)
                                .extract({
                                left: cropX,
                                top: cropY,
                                width: cropWidth,
                                height: cropHeight,
                            })
                                .jpeg({ quality: quality })
                                .toBuffer()];
                    case 3:
                        processedBuffer = _a.sent();
                        return [3 /*break*/, 6];
                    case 4: return [4 /*yield*/, (0, sharp_1.default)(fullScreenshot)
                            .extract({
                            left: cropX,
                            top: cropY,
                            width: cropWidth,
                            height: cropHeight,
                        })
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
                                        text: "Screenshot of ".concat(this.currentApp.name, " window (").concat(cropWidth, "x").concat(cropHeight, "px with ").concat(padding, "px padding) in ").concat(format.toUpperCase(), " format"),
                                    },
                                    {
                                        type: 'image',
                                        data: base64Image,
                                        mimeType: format === 'jpg' ? 'image/jpeg' : 'image/png',
                                    },
                                ],
                            }];
                }
            });
        });
    };
    AdvancedScreenshotMacOSGUIControlServer.prototype.screenshotFullScreen = function (format, quality, saveToFile) {
        return __awaiter(this, void 0, void 0, function () {
            var result, base64Image, error_5;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.checkPermissions()];
                    case 1:
                        _a.sent();
                        _a.label = 2;
                    case 2:
                        _a.trys.push([2, 8, , 9]);
                        result = void 0;
                        if (!saveToFile) return [3 /*break*/, 4];
                        return [4 /*yield*/, (0, screenshot_desktop_1.default)({
                                filename: saveToFile,
                                format: format
                            })];
                    case 3:
                        // Save directly to file
                        result = _a.sent();
                        return [3 /*break*/, 7];
                    case 4: return [4 /*yield*/, (0, screenshot_desktop_1.default)({ format: format })];
                    case 5:
                        // Return as buffer
                        result = _a.sent();
                        if (!(format === 'jpg')) return [3 /*break*/, 7];
                        return [4 /*yield*/, (0, sharp_1.default)(result)
                                .jpeg({ quality: quality })
                                .toBuffer()];
                    case 6:
                        result = _a.sent();
                        _a.label = 7;
                    case 7:
                        if (saveToFile) {
                            return [2 /*return*/, {
                                    content: [
                                        {
                                            type: 'text',
                                            text: "Screenshot saved to: ".concat(result),
                                        },
                                    ],
                                }];
                        }
                        else {
                            base64Image = result.toString('base64');
                            return [2 /*return*/, {
                                    content: [
                                        {
                                            type: 'text',
                                            text: "Full screen screenshot in ".concat(format.toUpperCase(), " format"),
                                        },
                                        {
                                            type: 'image',
                                            data: base64Image,
                                            mimeType: format === 'jpg' ? 'image/jpeg' : 'image/png',
                                        },
                                    ],
                                }];
                        }
                        return [3 /*break*/, 9];
                    case 8:
                        error_5 = _a.sent();
                        throw new Error("Failed to take full screen screenshot: ".concat(error_5 instanceof Error ? error_5.message : String(error_5)));
                    case 9: return [2 /*return*/];
                }
            });
        });
    };
    AdvancedScreenshotMacOSGUIControlServer.prototype.screenshotDisplay = function (displayId, format, quality, saveToFile) {
        return __awaiter(this, void 0, void 0, function () {
            var result, base64Image, error_6;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.checkPermissions()];
                    case 1:
                        _a.sent();
                        _a.label = 2;
                    case 2:
                        _a.trys.push([2, 8, , 9]);
                        result = void 0;
                        if (!saveToFile) return [3 /*break*/, 4];
                        return [4 /*yield*/, (0, screenshot_desktop_1.default)({
                                filename: saveToFile,
                                format: format,
                                screen: parseInt(displayId)
                            })];
                    case 3:
                        result = _a.sent();
                        return [3 /*break*/, 7];
                    case 4: return [4 /*yield*/, (0, screenshot_desktop_1.default)({
                            format: format,
                            screen: parseInt(displayId)
                        })];
                    case 5:
                        result = _a.sent();
                        if (!(format === 'jpg')) return [3 /*break*/, 7];
                        return [4 /*yield*/, (0, sharp_1.default)(result)
                                .jpeg({ quality: quality })
                                .toBuffer()];
                    case 6:
                        result = _a.sent();
                        _a.label = 7;
                    case 7:
                        if (saveToFile) {
                            return [2 /*return*/, {
                                    content: [
                                        {
                                            type: 'text',
                                            text: "Screenshot of display ".concat(displayId, " saved to: ").concat(result),
                                        },
                                    ],
                                }];
                        }
                        else {
                            base64Image = result.toString('base64');
                            return [2 /*return*/, {
                                    content: [
                                        {
                                            type: 'text',
                                            text: "Screenshot of display ".concat(displayId, " in ").concat(format.toUpperCase(), " format"),
                                        },
                                        {
                                            type: 'image',
                                            data: base64Image,
                                            mimeType: format === 'jpg' ? 'image/jpeg' : 'image/png',
                                        },
                                    ],
                                }];
                        }
                        return [3 /*break*/, 9];
                    case 8:
                        error_6 = _a.sent();
                        throw new Error("Failed to take screenshot of display ".concat(displayId, ": ").concat(error_6 instanceof Error ? error_6.message : String(error_6)));
                    case 9: return [2 /*return*/];
                }
            });
        });
    };
    AdvancedScreenshotMacOSGUIControlServer.prototype.screenshotAllDisplays = function (format, quality, saveToFiles) {
        return __awaiter(this, void 0, void 0, function () {
            var screenshots, results, i, screenshotBuffer, timestamp, filename, processedBuffer, processedBuffer, error_7;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.checkPermissions()];
                    case 1:
                        _a.sent();
                        _a.label = 2;
                    case 2:
                        _a.trys.push([2, 16, , 17]);
                        return [4 /*yield*/, screenshot_desktop_1.default.all()];
                    case 3:
                        screenshots = _a.sent();
                        results = [];
                        i = 0;
                        _a.label = 4;
                    case 4:
                        if (!(i < screenshots.length)) return [3 /*break*/, 15];
                        screenshotBuffer = screenshots[i];
                        if (!saveToFiles) return [3 /*break*/, 10];
                        timestamp = new Date().toISOString().replace(/[:.]/g, '-');
                        filename = path.join(saveToFiles, "display-".concat(i, "-").concat(timestamp, ".").concat(format));
                        // Ensure directory exists
                        return [4 /*yield*/, fs.promises.mkdir(saveToFiles, { recursive: true })];
                    case 5:
                        // Ensure directory exists
                        _a.sent();
                        processedBuffer = void 0;
                        if (!(format === 'jpg')) return [3 /*break*/, 7];
                        return [4 /*yield*/, (0, sharp_1.default)(screenshotBuffer)
                                .jpeg({ quality: quality })
                                .toBuffer()];
                    case 6:
                        processedBuffer = _a.sent();
                        return [3 /*break*/, 8];
                    case 7:
                        processedBuffer = screenshotBuffer;
                        _a.label = 8;
                    case 8: return [4 /*yield*/, fs.promises.writeFile(filename, processedBuffer)];
                    case 9:
                        _a.sent();
                        results.push({ display: i, filename: filename });
                        return [3 /*break*/, 14];
                    case 10:
                        processedBuffer = void 0;
                        if (!(format === 'jpg')) return [3 /*break*/, 12];
                        return [4 /*yield*/, (0, sharp_1.default)(screenshotBuffer)
                                .jpeg({ quality: quality })
                                .toBuffer()];
                    case 11:
                        processedBuffer = _a.sent();
                        return [3 /*break*/, 13];
                    case 12:
                        processedBuffer = screenshotBuffer;
                        _a.label = 13;
                    case 13:
                        results.push({
                            display: i,
                            image: processedBuffer.toString('base64'),
                            mimeType: format === 'jpg' ? 'image/jpeg' : 'image/png'
                        });
                        _a.label = 14;
                    case 14:
                        i++;
                        return [3 /*break*/, 4];
                    case 15: return [2 /*return*/, {
                            content: __spreadArray(__spreadArray([
                                {
                                    type: 'text',
                                    text: "Screenshots of ".concat(screenshots.length, " displays in ").concat(format.toUpperCase(), " format"),
                                }
                            ], results.map(function (result, index) { return ({
                                type: 'text',
                                text: "Display ".concat(index, ": ").concat(saveToFiles ? result.filename : 'Base64 image data'),
                            }); }), true), (saveToFiles ? [] : results.map(function (result) { return ({
                                type: 'image',
                                data: result.image,
                                mimeType: result.mimeType,
                            }); })), true),
                        }];
                    case 16:
                        error_7 = _a.sent();
                        throw new Error("Failed to take screenshots of all displays: ".concat(error_7 instanceof Error ? error_7.message : String(error_7)));
                    case 17: return [2 /*return*/];
                }
            });
        });
    };
    AdvancedScreenshotMacOSGUIControlServer.prototype.listDisplays = function () {
        return __awaiter(this, void 0, void 0, function () {
            var displays, error_8;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.checkPermissions()];
                    case 1:
                        _a.sent();
                        _a.label = 2;
                    case 2:
                        _a.trys.push([2, 4, , 5]);
                        return [4 /*yield*/, screenshot_desktop_1.default.listDisplays()];
                    case 3:
                        displays = _a.sent();
                        return [2 /*return*/, {
                                content: [
                                    {
                                        type: 'text',
                                        text: JSON.stringify(displays, null, 2),
                                    },
                                ],
                            }];
                    case 4:
                        error_8 = _a.sent();
                        throw new Error("Failed to list displays: ".concat(error_8 instanceof Error ? error_8.message : String(error_8)));
                    case 5: return [2 /*return*/];
                }
            });
        });
    };
    AdvancedScreenshotMacOSGUIControlServer.prototype.screenshotRegion = function (x, y, width, height, format, quality, saveToFile) {
        return __awaiter(this, void 0, void 0, function () {
            var fullScreenshot, processedBuffer, base64Image, error_9;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.checkPermissions()];
                    case 1:
                        _a.sent();
                        _a.label = 2;
                    case 2:
                        _a.trys.push([2, 11, , 12]);
                        return [4 /*yield*/, (0, screenshot_desktop_1.default)()];
                    case 3:
                        fullScreenshot = _a.sent();
                        processedBuffer = void 0;
                        if (!(format === 'jpg')) return [3 /*break*/, 5];
                        return [4 /*yield*/, (0, sharp_1.default)(fullScreenshot)
                                .extract({
                                left: x,
                                top: y,
                                width: width,
                                height: height,
                            })
                                .jpeg({ quality: quality })
                                .toBuffer()];
                    case 4:
                        processedBuffer = _a.sent();
                        return [3 /*break*/, 7];
                    case 5: return [4 /*yield*/, (0, sharp_1.default)(fullScreenshot)
                            .extract({
                            left: x,
                            top: y,
                            width: width,
                            height: height,
                        })
                            .png()
                            .toBuffer()];
                    case 6:
                        processedBuffer = _a.sent();
                        _a.label = 7;
                    case 7:
                        if (!saveToFile) return [3 /*break*/, 9];
                        return [4 /*yield*/, fs.promises.writeFile(saveToFile, processedBuffer)];
                    case 8:
                        _a.sent();
                        return [2 /*return*/, {
                                content: [
                                    {
                                        type: 'text',
                                        text: "Screenshot of region (".concat(x, ", ").concat(y, ", ").concat(width, ", ").concat(height, ") saved to: ").concat(saveToFile),
                                    },
                                ],
                            }];
                    case 9:
                        base64Image = processedBuffer.toString('base64');
                        return [2 /*return*/, {
                                content: [
                                    {
                                        type: 'text',
                                        text: "Screenshot of region (".concat(x, ", ").concat(y, ", ").concat(width, ", ").concat(height, ") in ").concat(format.toUpperCase(), " format"),
                                    },
                                    {
                                        type: 'image',
                                        data: base64Image,
                                        mimeType: format === 'jpg' ? 'image/jpeg' : 'image/png',
                                    },
                                ],
                            }];
                    case 10: return [3 /*break*/, 12];
                    case 11:
                        error_9 = _a.sent();
                        throw new Error("Failed to take screenshot of region: ".concat(error_9 instanceof Error ? error_9.message : String(error_9)));
                    case 12: return [2 /*return*/];
                }
            });
        });
    };
    AdvancedScreenshotMacOSGUIControlServer.prototype.screenshotWithTimestamp = function (directory, prefix, format, quality, padding) {
        return __awaiter(this, void 0, void 0, function () {
            var timestamp, filename, result, fullScreenshot, cropX, cropY, cropWidth, cropHeight, error_10;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.checkPermissions()];
                    case 1:
                        _a.sent();
                        _a.label = 2;
                    case 2:
                        _a.trys.push([2, 12, , 13]);
                        // Ensure directory exists
                        return [4 /*yield*/, fs.promises.mkdir(directory, { recursive: true })];
                    case 3:
                        // Ensure directory exists
                        _a.sent();
                        timestamp = new Date().toISOString().replace(/[:.]/g, '-');
                        filename = path.join(directory, "".concat(prefix, "-").concat(timestamp, ".").concat(format));
                        result = void 0;
                        if (!this.currentApp) return [3 /*break*/, 9];
                        return [4 /*yield*/, (0, screenshot_desktop_1.default)()];
                    case 4:
                        fullScreenshot = _a.sent();
                        cropX = Math.max(0, this.currentApp.bounds.x - padding);
                        cropY = Math.max(0, this.currentApp.bounds.y - padding);
                        cropWidth = this.currentApp.bounds.width + (padding * 2);
                        cropHeight = this.currentApp.bounds.height + (padding * 2);
                        if (!(format === 'jpg')) return [3 /*break*/, 6];
                        return [4 /*yield*/, (0, sharp_1.default)(fullScreenshot)
                                .extract({
                                left: cropX,
                                top: cropY,
                                width: cropWidth,
                                height: cropHeight,
                            })
                                .jpeg({ quality: quality })
                                .toFile(filename)];
                    case 5:
                        _a.sent();
                        result = filename;
                        return [3 /*break*/, 8];
                    case 6: return [4 /*yield*/, (0, sharp_1.default)(fullScreenshot)
                            .extract({
                            left: cropX,
                            top: cropY,
                            width: cropWidth,
                            height: cropHeight,
                        })
                            .png()
                            .toFile(filename)];
                    case 7:
                        _a.sent();
                        result = filename;
                        _a.label = 8;
                    case 8: return [3 /*break*/, 11];
                    case 9: return [4 /*yield*/, (0, screenshot_desktop_1.default)({
                            filename: filename,
                            format: format
                        })];
                    case 10:
                        // Screenshot full screen
                        result = _a.sent();
                        _a.label = 11;
                    case 11: return [2 /*return*/, {
                            content: [
                                {
                                    type: 'text',
                                    text: "Screenshot saved to: ".concat(filename),
                                },
                            ],
                        }];
                    case 12:
                        error_10 = _a.sent();
                        throw new Error("Failed to take timestamped screenshot: ".concat(error_10 instanceof Error ? error_10.message : String(error_10)));
                    case 13: return [2 /*return*/];
                }
            });
        });
    };
    AdvancedScreenshotMacOSGUIControlServer.prototype.focusApplicationDirect = function (appName) {
        return __awaiter(this, void 0, void 0, function () {
            var error_11;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.checkPermissions()];
                    case 1:
                        _a.sent();
                        _a.label = 2;
                    case 2:
                        _a.trys.push([2, 4, , 5]);
                        // Direct focus using the working JXA approach
                        return [4 /*yield*/, (0, run_1.run)(function (appName) {
                                // @ts-ignore
                                var app = Application(appName);
                                app.activate();
                            }, appName)];
                    case 3:
                        // Direct focus using the working JXA approach
                        _a.sent();
                        this.currentApp = {
                            name: appName,
                            bundleId: appName,
                            pid: 0,
                            bounds: { x: 0, y: 0, width: 1920, height: 1080 } // Default bounds
                        };
                        return [2 /*return*/, {
                                content: [
                                    {
                                        type: 'text',
                                        text: "Successfully focused on application: ".concat(appName),
                                    },
                                ],
                            }];
                    case 4:
                        error_11 = _a.sent();
                        throw new Error("Failed to focus application ".concat(appName, ": ").concat(error_11 instanceof Error ? error_11.message : String(error_11)));
                    case 5: return [2 /*return*/];
                }
            });
        });
    };
    AdvancedScreenshotMacOSGUIControlServer.prototype.findApplicationWindow = function (appName) {
        return __awaiter(this, void 0, void 0, function () {
            var windowInfo, error_12;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.checkPermissions()];
                    case 1:
                        _a.sent();
                        _a.label = 2;
                    case 2:
                        _a.trys.push([2, 6, , 7]);
                        // First activate the app and bring it to front
                        return [4 /*yield*/, (0, run_1.run)(function (appName) {
                                // @ts-ignore
                                var app = Application(appName);
                                app.activate();
                                // Also use System Events to ensure it's frontmost
                                // @ts-ignore
                                var systemEvents = Application("System Events");
                                var process = systemEvents.processes.byName(appName);
                                if (process) {
                                    process.frontmost = true;
                                }
                            }, appName)];
                    case 3:
                        // First activate the app and bring it to front
                        _a.sent();
                        // Wait for activation and bring to front
                        return [4 /*yield*/, new Promise(function (resolve) { return setTimeout(resolve, 1500); })];
                    case 4:
                        // Wait for activation and bring to front
                        _a.sent();
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
                                var window = windows[0];
                                var position = window.position();
                                var size = window.size();
                                var x = position[0];
                                var y = position[1];
                                var width = size[0];
                                var height = size[1];
                                // Determine which display the window is on
                                // For now, we'll use a simple heuristic based on coordinates
                                var displayId = 0; // Default to primary display
                                // If window is at coordinates that suggest it's on a secondary display
                                if (x > 1920 || y > 1080) {
                                    // Likely on a 4K display (secondary)
                                    displayId = 1;
                                }
                                else if (x < 0 || y < 0) {
                                    // Off-screen, move to primary display
                                    window.position = [100, 100];
                                    return {
                                        x: 100,
                                        y: 100,
                                        width: width,
                                        height: height,
                                        displayId: 0,
                                        wasOffScreen: true
                                    };
                                }
                                return {
                                    x: x,
                                    y: y,
                                    width: width,
                                    height: height,
                                    displayId: displayId,
                                    wasOffScreen: false
                                };
                            }, appName)];
                    case 5:
                        windowInfo = _a.sent();
                        if (!windowInfo) {
                            return [2 /*return*/, null];
                        }
                        // Return window info with detected display ID
                        return [2 /*return*/, {
                                displayId: windowInfo.displayId || 0,
                                bounds: {
                                    x: windowInfo.x,
                                    y: windowInfo.y,
                                    width: windowInfo.width,
                                    height: windowInfo.height
                                },
                                wasOffScreen: windowInfo.wasOffScreen || false
                            }];
                    case 6:
                        error_12 = _a.sent();
                        throw new Error("Failed to find window for application ".concat(appName, ": ").concat(error_12 instanceof Error ? error_12.message : String(error_12)));
                    case 7: return [2 /*return*/];
                }
            });
        });
    };
    AdvancedScreenshotMacOSGUIControlServer.prototype.screenshotApplication = function (appName_1, padding_1, format_1, quality_1, saveToFile_1) {
        return __awaiter(this, arguments, void 0, function (appName, padding, format, quality, saveToFile, moveToPrimary) {
            var windowInfo, regionX, regionY, regionWidth, regionHeight, processedBuffer, regionScreenshot, regionError_1, fullScreenshot, displayError_1, base64Image, error_13;
            if (moveToPrimary === void 0) { moveToPrimary = false; }
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.checkPermissions()];
                    case 1:
                        _a.sent();
                        return [4 /*yield*/, this.log("Starting screenshotApplication for ".concat(appName, " (moveToPrimary: ").concat(moveToPrimary, ")"))];
                    case 2:
                        _a.sent();
                        _a.label = 3;
                    case 3:
                        _a.trys.push([3, 37, , 38]);
                        return [4 /*yield*/, this.findApplicationWindow(appName)];
                    case 4:
                        windowInfo = _a.sent();
                        if (!!windowInfo) return [3 /*break*/, 6];
                        return [4 /*yield*/, this.log("ERROR: ".concat(appName, " not found or has no visible windows"))];
                    case 5:
                        _a.sent();
                        throw new Error("Application \"".concat(appName, "\" not found or has no visible windows. Make sure the application is running and has at least one window open."));
                    case 6: 
                    // Log the detected display
                    return [4 /*yield*/, this.log("Detected ".concat(appName, " on display ").concat(windowInfo.displayId, " at (").concat(windowInfo.bounds.x, ", ").concat(windowInfo.bounds.y, ") size ").concat(windowInfo.bounds.width, "x").concat(windowInfo.bounds.height))];
                    case 7:
                        // Log the detected display
                        _a.sent();
                        console.log("Detected ".concat(appName, " on display ").concat(windowInfo.displayId, " at (").concat(windowInfo.bounds.x, ", ").concat(windowInfo.bounds.y, ")"));
                        if (!(moveToPrimary && windowInfo.displayId !== 0)) return [3 /*break*/, 12];
                        return [4 /*yield*/, this.log("Moving ".concat(appName, " from display ").concat(windowInfo.displayId, " to primary display"))];
                    case 8:
                        _a.sent();
                        console.log("Moving ".concat(appName, " to primary display..."));
                        return [4 /*yield*/, (0, run_1.run)(function (appName) {
                                // @ts-ignore
                                var systemEvents = Application("System Events");
                                var process = systemEvents.processes.byName(appName);
                                if (process && process.windows().length > 0) {
                                    var window_1 = process.windows()[0];
                                    // Move to primary display coordinates
                                    window_1.position = [100, 100];
                                }
                            }, appName)];
                    case 9:
                        _a.sent();
                        // Wait for movement to complete
                        return [4 /*yield*/, new Promise(function (resolve) { return setTimeout(resolve, 1000); })];
                    case 10:
                        // Wait for movement to complete
                        _a.sent();
                        // Update window info for primary display
                        windowInfo.displayId = 0;
                        windowInfo.bounds.x = 100;
                        windowInfo.bounds.y = 100;
                        return [4 /*yield*/, this.log("Successfully moved ".concat(appName, " to primary display at (100, 100)"))];
                    case 11:
                        _a.sent();
                        console.log("Moved ".concat(appName, " to primary display at (100, 100)"));
                        _a.label = 12;
                    case 12:
                        regionX = Math.max(0, windowInfo.bounds.x - padding);
                        regionY = Math.max(0, windowInfo.bounds.y - padding);
                        regionWidth = windowInfo.bounds.width + (padding * 2);
                        regionHeight = windowInfo.bounds.height + (padding * 2);
                        return [4 /*yield*/, this.log("Taking region screenshot: ".concat(regionWidth, "x").concat(regionHeight, " at (").concat(regionX, ", ").concat(regionY, ")"))];
                    case 13:
                        _a.sent();
                        processedBuffer = void 0;
                        _a.label = 14;
                    case 14:
                        _a.trys.push([14, 20, , 31]);
                        return [4 /*yield*/, (0, screenshot_desktop_1.default)({
                                format: format,
                                x: regionX,
                                y: regionY,
                                width: regionWidth,
                                height: regionHeight
                            })];
                    case 15:
                        regionScreenshot = _a.sent();
                        return [4 /*yield*/, this.log("Successfully captured region screenshot")];
                    case 16:
                        _a.sent();
                        if (!(format === 'jpg')) return [3 /*break*/, 18];
                        return [4 /*yield*/, (0, sharp_1.default)(regionScreenshot)
                                .jpeg({ quality: quality })
                                .toBuffer()];
                    case 17:
                        processedBuffer = _a.sent();
                        return [3 /*break*/, 19];
                    case 18:
                        processedBuffer = regionScreenshot; // PNG doesn't need quality processing
                        _a.label = 19;
                    case 19: return [3 /*break*/, 31];
                    case 20:
                        regionError_1 = _a.sent();
                        // Fallback to full display screenshot with cropping if region fails
                        return [4 /*yield*/, this.log("Region screenshot failed, using display fallback: ".concat(regionError_1))];
                    case 21:
                        // Fallback to full display screenshot with cropping if region fails
                        _a.sent();
                        fullScreenshot = void 0;
                        _a.label = 22;
                    case 22:
                        _a.trys.push([22, 24, , 26]);
                        return [4 /*yield*/, (0, screenshot_desktop_1.default)({
                                format: format,
                                screen: windowInfo.displayId
                            })];
                    case 23:
                        fullScreenshot = _a.sent();
                        return [3 /*break*/, 26];
                    case 24:
                        displayError_1 = _a.sent();
                        return [4 /*yield*/, (0, screenshot_desktop_1.default)()];
                    case 25:
                        fullScreenshot = _a.sent();
                        return [3 /*break*/, 26];
                    case 26:
                        if (!(format === 'jpg')) return [3 /*break*/, 28];
                        return [4 /*yield*/, (0, sharp_1.default)(fullScreenshot)
                                .extract({
                                left: regionX,
                                top: regionY,
                                width: regionWidth,
                                height: regionHeight,
                            })
                                .jpeg({ quality: quality })
                                .toBuffer()];
                    case 27:
                        processedBuffer = _a.sent();
                        return [3 /*break*/, 30];
                    case 28: return [4 /*yield*/, (0, sharp_1.default)(fullScreenshot)
                            .extract({
                            left: regionX,
                            top: regionY,
                            width: regionWidth,
                            height: regionHeight,
                        })
                            .png()
                            .toBuffer()];
                    case 29:
                        processedBuffer = _a.sent();
                        _a.label = 30;
                    case 30: return [3 /*break*/, 31];
                    case 31:
                        if (!saveToFile) return [3 /*break*/, 34];
                        return [4 /*yield*/, fs.promises.writeFile(saveToFile, processedBuffer)];
                    case 32:
                        _a.sent();
                        return [4 /*yield*/, this.log("Screenshot saved to file: ".concat(saveToFile, " (").concat(regionWidth, "x").concat(regionHeight, "px)"))];
                    case 33:
                        _a.sent();
                        return [2 /*return*/, {
                                content: [
                                    {
                                        type: 'text',
                                        text: "Screenshot of ".concat(appName, " (display ").concat(windowInfo.displayId, ") saved to: ").concat(saveToFile),
                                    },
                                ],
                            }];
                    case 34:
                        base64Image = processedBuffer.toString('base64');
                        return [4 /*yield*/, this.log("Screenshot completed successfully (".concat(regionWidth, "x").concat(regionHeight, "px, base64 output)"))];
                    case 35:
                        _a.sent();
                        return [2 /*return*/, {
                                content: [
                                    {
                                        type: 'text',
                                        text: "Smart screenshot of ".concat(appName, " window (display ").concat(windowInfo.displayId, ", ").concat(regionWidth, "x").concat(regionHeight, "px with ").concat(padding, "px padding) in ").concat(format.toUpperCase(), " format"),
                                    },
                                    {
                                        type: 'image',
                                        data: base64Image,
                                        mimeType: format === 'jpg' ? 'image/jpeg' : 'image/png',
                                    },
                                ],
                            }];
                    case 36: return [3 /*break*/, 38];
                    case 37:
                        error_13 = _a.sent();
                        throw new Error("Failed to take screenshot of application ".concat(appName, ": ").concat(error_13 instanceof Error ? error_13.message : String(error_13)));
                    case 38: return [2 /*return*/];
                }
            });
        });
    };
    AdvancedScreenshotMacOSGUIControlServer.prototype.run = function () {
        return __awaiter(this, void 0, void 0, function () {
            var transport;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        transport = new stdio_js_1.StdioServerTransport();
                        return [4 /*yield*/, this.server.connect(transport)];
                    case 1:
                        _a.sent();
                        console.error('Advanced Screenshot macOS GUI Control MCP server running on stdio');
                        return [2 /*return*/];
                }
            });
        });
    };
    return AdvancedScreenshotMacOSGUIControlServer;
}());
// Start the server
var server = new AdvancedScreenshotMacOSGUIControlServer();
server.run().catch(console.error);
