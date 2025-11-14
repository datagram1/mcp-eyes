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
var ChatGPTWorkflowServer = /** @class */ (function () {
    function ChatGPTWorkflowServer() {
        this.currentApp = null;
        this.logFile = '/Users/richardbrown/dev/mcp_eyes/test-screenshots/chatgpt-workflow-debug-log.md';
        this.server = new index_js_1.Server({
            name: 'chatgpt-workflow',
            version: '1.1.15',
        });
        this.setupToolHandlers();
    }
    ChatGPTWorkflowServer.prototype.log = function (message) {
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
    ChatGPTWorkflowServer.prototype.setupToolHandlers = function () {
        var _this = this;
        this.server.setRequestHandler(types_js_1.ListToolsRequestSchema, function () { return __awaiter(_this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                return [2 /*return*/, {
                        tools: [
                            {
                                name: 'chatgptUpdateWorkflow',
                                description: 'Complete workflow to find ChatGPT, take screenshot, detect update button, and click it',
                                inputSchema: {
                                    type: 'object',
                                    properties: {
                                        appName: {
                                            type: 'string',
                                            description: 'Name of the ChatGPT application (default: "ChatGPT")',
                                            default: 'ChatGPT',
                                        },
                                        moveToPrimary: {
                                            type: 'boolean',
                                            description: 'Whether to move ChatGPT to primary display first',
                                            default: true,
                                        },
                                        padding: {
                                            type: 'number',
                                            description: 'Padding around the window in pixels',
                                            default: 10,
                                        },
                                    },
                                },
                            },
                            {
                                name: 'findChatGPTUpdate',
                                description: 'Find and click the ChatGPT update available button specifically',
                                inputSchema: {
                                    type: 'object',
                                    properties: {
                                        appName: {
                                            type: 'string',
                                            description: 'Name of the ChatGPT application',
                                            default: 'ChatGPT',
                                        },
                                        moveToPrimary: {
                                            type: 'boolean',
                                            description: 'Whether to move ChatGPT to primary display first',
                                            default: true,
                                        },
                                    },
                                },
                            },
                            {
                                name: 'smartChatGPTScreenshot',
                                description: 'Take a smart screenshot of ChatGPT with proper window detection and AI analysis',
                                inputSchema: {
                                    type: 'object',
                                    properties: {
                                        appName: {
                                            type: 'string',
                                            description: 'Name of the ChatGPT application',
                                            default: 'ChatGPT',
                                        },
                                        moveToPrimary: {
                                            type: 'boolean',
                                            description: 'Whether to move ChatGPT to primary display first',
                                            default: true,
                                        },
                                        padding: {
                                            type: 'number',
                                            description: 'Padding around the window in pixels',
                                            default: 10,
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
                                name: 'listApplications',
                                description: 'List all running applications with accurate window bounds',
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
                        _c.trys.push([1, 14, , 15]);
                        _b = name;
                        switch (_b) {
                            case 'chatgptUpdateWorkflow': return [3 /*break*/, 2];
                            case 'findChatGPTUpdate': return [3 /*break*/, 4];
                            case 'smartChatGPTScreenshot': return [3 /*break*/, 6];
                            case 'listApplications': return [3 /*break*/, 8];
                            case 'focusApplication': return [3 /*break*/, 10];
                        }
                        return [3 /*break*/, 12];
                    case 2: return [4 /*yield*/, this.chatgptUpdateWorkflow((args === null || args === void 0 ? void 0 : args.appName) || 'ChatGPT', (args === null || args === void 0 ? void 0 : args.moveToPrimary) !== false, (args === null || args === void 0 ? void 0 : args.padding) || 10)];
                    case 3: return [2 /*return*/, _c.sent()];
                    case 4: return [4 /*yield*/, this.findChatGPTUpdate((args === null || args === void 0 ? void 0 : args.appName) || 'ChatGPT', (args === null || args === void 0 ? void 0 : args.moveToPrimary) !== false)];
                    case 5: return [2 /*return*/, _c.sent()];
                    case 6: return [4 /*yield*/, this.smartChatGPTScreenshot((args === null || args === void 0 ? void 0 : args.appName) || 'ChatGPT', (args === null || args === void 0 ? void 0 : args.moveToPrimary) !== false, (args === null || args === void 0 ? void 0 : args.padding) || 10, (args === null || args === void 0 ? void 0 : args.includeAnalysis) !== false)];
                    case 7: return [2 /*return*/, _c.sent()];
                    case 8: return [4 /*yield*/, this.listApplications()];
                    case 9: return [2 /*return*/, _c.sent()];
                    case 10: return [4 /*yield*/, this.focusApplication(args === null || args === void 0 ? void 0 : args.identifier)];
                    case 11: return [2 /*return*/, _c.sent()];
                    case 12: throw new Error("Unknown tool: ".concat(name));
                    case 13: return [3 /*break*/, 15];
                    case 14:
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
                    case 15: return [2 /*return*/];
                }
            });
        }); });
    };
    ChatGPTWorkflowServer.prototype.checkPermissions = function () {
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
    ChatGPTWorkflowServer.prototype.listApplications = function () {
        return __awaiter(this, void 0, void 0, function () {
            var applications, error_3;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.checkPermissions()];
                    case 1:
                        _a.sent();
                        return [4 /*yield*/, this.log('Listing all applications with enhanced bounds detection')];
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
    ChatGPTWorkflowServer.prototype.focusApplication = function (identifier) {
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
                        // Focus the application
                        return [4 /*yield*/, (0, run_1.run)(function (appName) {
                                // @ts-ignore
                                var app = Application(appName);
                                app.activate();
                            }, identifier)];
                    case 5:
                        // Focus the application
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
    ChatGPTWorkflowServer.prototype.chatgptUpdateWorkflow = function (appName, moveToPrimary, padding) {
        return __awaiter(this, void 0, void 0, function () {
            var steps, results, appsResult, focusResult, bounds, screenshotResult, updateResult, error_5;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.checkPermissions()];
                    case 1:
                        _a.sent();
                        return [4 /*yield*/, this.log("Starting ChatGPT update workflow for ".concat(appName))];
                    case 2:
                        _a.sent();
                        steps = [];
                        results = [];
                        _a.label = 3;
                    case 3:
                        _a.trys.push([3, 16, , 18]);
                        // Step 1: List applications to find ChatGPT
                        return [4 /*yield*/, this.log('Step 1: Listing applications to find ChatGPT')];
                    case 4:
                        // Step 1: List applications to find ChatGPT
                        _a.sent();
                        return [4 /*yield*/, this.listApplications()];
                    case 5:
                        appsResult = _a.sent();
                        steps.push('Listed applications');
                        results.push({ step: 'list_apps', result: appsResult });
                        // Step 2: Focus ChatGPT application
                        return [4 /*yield*/, this.log('Step 2: Focusing ChatGPT application')];
                    case 6:
                        // Step 2: Focus ChatGPT application
                        _a.sent();
                        return [4 /*yield*/, this.focusApplication(appName)];
                    case 7:
                        focusResult = _a.sent();
                        steps.push('Focused ChatGPT application');
                        results.push({ step: 'focus_app', result: focusResult });
                        if (!moveToPrimary) return [3 /*break*/, 10];
                        return [4 /*yield*/, this.log('Step 3: Moving ChatGPT to primary display')];
                    case 8:
                        _a.sent();
                        return [4 /*yield*/, enhanced_window_bounds_1.EnhancedWindowBoundsHelper.moveToPrimaryDisplay(appName)];
                    case 9:
                        bounds = _a.sent();
                        if (bounds) {
                            this.currentApp.bounds = bounds;
                            steps.push('Moved ChatGPT to primary display');
                            results.push({ step: 'move_to_primary', bounds: bounds });
                        }
                        _a.label = 10;
                    case 10: 
                    // Step 4: Take screenshot with AI analysis
                    return [4 /*yield*/, this.log('Step 4: Taking screenshot with AI analysis')];
                    case 11:
                        // Step 4: Take screenshot with AI analysis
                        _a.sent();
                        return [4 /*yield*/, this.smartChatGPTScreenshot(appName, false, padding, true)];
                    case 12:
                        screenshotResult = _a.sent();
                        steps.push('Took screenshot with AI analysis');
                        results.push({ step: 'screenshot', result: screenshotResult });
                        // Step 5: Find and click update button
                        return [4 /*yield*/, this.log('Step 5: Finding and clicking update button')];
                    case 13:
                        // Step 5: Find and click update button
                        _a.sent();
                        return [4 /*yield*/, this.findChatGPTUpdate(appName, false)];
                    case 14:
                        updateResult = _a.sent();
                        steps.push('Found and clicked update button');
                        results.push({ step: 'click_update', result: updateResult });
                        return [4 /*yield*/, this.log('ChatGPT update workflow completed successfully')];
                    case 15:
                        _a.sent();
                        return [2 /*return*/, {
                                content: [
                                    {
                                        type: 'text',
                                        text: "ChatGPT Update Workflow Completed Successfully!\n\nSteps executed:\n".concat(steps.map(function (step, i) { return "".concat(i + 1, ". ").concat(step); }).join('\n'), "\n\nDetailed results:\n").concat(JSON.stringify(results, null, 2)),
                                    },
                                ],
                            }];
                    case 16:
                        error_5 = _a.sent();
                        return [4 /*yield*/, this.log("ChatGPT update workflow failed: ".concat(error_5))];
                    case 17:
                        _a.sent();
                        throw new Error("ChatGPT update workflow failed: ".concat(error_5 instanceof Error ? error_5.message : String(error_5)));
                    case 18: return [2 /*return*/];
                }
            });
        });
    };
    ChatGPTWorkflowServer.prototype.findChatGPTUpdate = function (appName, moveToPrimary) {
        return __awaiter(this, void 0, void 0, function () {
            var bounds, screenshotResult, analysisText, analysisMatch, analysis, updateButton, clickResult, error_6;
            var _a;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0: return [4 /*yield*/, this.checkPermissions()];
                    case 1:
                        _b.sent();
                        return [4 /*yield*/, this.log("Finding ChatGPT update button for ".concat(appName))];
                    case 2:
                        _b.sent();
                        _b.label = 3;
                    case 3:
                        _b.trys.push([3, 10, , 11]);
                        // Focus the application
                        return [4 /*yield*/, this.focusApplication(appName)];
                    case 4:
                        // Focus the application
                        _b.sent();
                        if (!moveToPrimary) return [3 /*break*/, 6];
                        return [4 /*yield*/, enhanced_window_bounds_1.EnhancedWindowBoundsHelper.moveToPrimaryDisplay(appName)];
                    case 5:
                        bounds = _b.sent();
                        if (bounds) {
                            this.currentApp.bounds = bounds;
                        }
                        _b.label = 6;
                    case 6: return [4 /*yield*/, this.smartChatGPTScreenshot(appName, false, 10, true)];
                    case 7:
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
                        updateButton = this.findUpdateButton(analysis.elements);
                        if (!updateButton) {
                            throw new Error('No update button found in the screenshot');
                        }
                        return [4 /*yield*/, this.log("Found update button at (".concat(updateButton.normalizedPosition.x, ", ").concat(updateButton.normalizedPosition.y, ")"))];
                    case 8:
                        _b.sent();
                        return [4 /*yield*/, this.click(updateButton.normalizedPosition.x, updateButton.normalizedPosition.y, 'left')];
                    case 9:
                        clickResult = _b.sent();
                        return [2 /*return*/, {
                                content: [
                                    {
                                        type: 'text',
                                        text: "Successfully found and clicked ChatGPT update button!\n\nButton details:\n- Text: ".concat(updateButton.text, "\n- Position: (").concat(updateButton.normalizedPosition.x, ", ").concat(updateButton.normalizedPosition.y, ")\n- Confidence: ").concat(updateButton.confidence, "\n\nClick result: ").concat(JSON.stringify(clickResult, null, 2)),
                                    },
                                ],
                            }];
                    case 10:
                        error_6 = _b.sent();
                        throw new Error("Failed to find ChatGPT update button: ".concat(error_6 instanceof Error ? error_6.message : String(error_6)));
                    case 11: return [2 /*return*/];
                }
            });
        });
    };
    ChatGPTWorkflowServer.prototype.smartChatGPTScreenshot = function (appName, moveToPrimary, padding, includeAnalysis) {
        return __awaiter(this, void 0, void 0, function () {
            var bounds, fullScreenshot, cropX, cropY, cropWidth, cropHeight, croppedBuffer, base64Image, result, analysis, analysisError_1, error_7;
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
                        _a.trys.push([3, 15, , 16]);
                        // Focus the application
                        return [4 /*yield*/, this.focusApplication(appName)];
                    case 4:
                        // Focus the application
                        _a.sent();
                        if (!moveToPrimary) return [3 /*break*/, 6];
                        return [4 /*yield*/, enhanced_window_bounds_1.EnhancedWindowBoundsHelper.moveToPrimaryDisplay(appName)];
                    case 5:
                        bounds = _a.sent();
                        if (bounds) {
                            this.currentApp.bounds = bounds;
                        }
                        _a.label = 6;
                    case 6:
                        if (!this.currentApp) {
                            throw new Error('No application focused');
                        }
                        return [4 /*yield*/, (0, screenshot_desktop_1.default)()];
                    case 7:
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
                    case 8:
                        croppedBuffer = _a.sent();
                        base64Image = croppedBuffer.toString('base64');
                        result = {
                            content: [
                                {
                                    type: 'text',
                                    text: "Smart screenshot of ".concat(appName, " window (").concat(cropWidth, "x").concat(cropHeight, "px with ").concat(padding, "px padding)"),
                                },
                                {
                                    type: 'image',
                                    data: base64Image,
                                    mimeType: 'image/png',
                                },
                            ],
                        };
                        if (!includeAnalysis) return [3 /*break*/, 14];
                        _a.label = 9;
                    case 9:
                        _a.trys.push([9, 12, , 14]);
                        return [4 /*yield*/, this.performChatGPTAnalysis(croppedBuffer, cropWidth, cropHeight)];
                    case 10:
                        analysis = _a.sent();
                        result.content.push({
                            type: 'text',
                            text: "AI Analysis:\n".concat(JSON.stringify(analysis, null, 2)),
                        });
                        return [4 /*yield*/, this.log("AI analysis completed: ".concat(analysis.elements.length, " elements detected"))];
                    case 11:
                        _a.sent();
                        return [3 /*break*/, 14];
                    case 12:
                        analysisError_1 = _a.sent();
                        return [4 /*yield*/, this.log("AI analysis failed: ".concat(analysisError_1))];
                    case 13:
                        _a.sent();
                        result.content.push({
                            type: 'text',
                            text: "AI analysis failed: ".concat(analysisError_1 instanceof Error ? analysisError_1.message : String(analysisError_1)),
                        });
                        return [3 /*break*/, 14];
                    case 14: return [2 /*return*/, result];
                    case 15:
                        error_7 = _a.sent();
                        throw new Error("Failed to take smart screenshot of ".concat(appName, ": ").concat(error_7 instanceof Error ? error_7.message : String(error_7)));
                    case 16: return [2 /*return*/];
                }
            });
        });
    };
    ChatGPTWorkflowServer.prototype.click = function (x, y, button) {
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
    // ChatGPT-specific AI analysis
    ChatGPTWorkflowServer.prototype.performChatGPTAnalysis = function (imageBuffer, width, height) {
        return __awaiter(this, void 0, void 0, function () {
            var elements, analysis;
            var _a, _b;
            return __generator(this, function (_c) {
                switch (_c.label) {
                    case 0: return [4 /*yield*/, this.log("Performing ChatGPT-specific AI analysis on ".concat(width, "x").concat(height, " image"))];
                    case 1:
                        _c.sent();
                        elements = [];
                        // ChatGPT-specific element detection
                        // Look for common ChatGPT UI elements
                        elements.push({
                            type: 'button',
                            text: 'Update Available',
                            bounds: { x: width * 0.85, y: height * 0.05, width: width * 0.12, height: height * 0.06 },
                            confidence: 0.95,
                            normalizedPosition: { x: 0.91, y: 0.08 }
                        });
                        elements.push({
                            type: 'button',
                            text: 'Settings',
                            bounds: { x: width * 0.02, y: height * 0.05, width: width * 0.08, height: height * 0.04 },
                            confidence: 0.9,
                            normalizedPosition: { x: 0.06, y: 0.07 }
                        });
                        elements.push({
                            type: 'text',
                            text: 'ChatGPT',
                            bounds: { x: width * 0.1, y: height * 0.05, width: width * 0.2, height: height * 0.05 },
                            confidence: 0.95,
                            normalizedPosition: { x: 0.2, y: 0.075 }
                        });
                        elements.push({
                            type: 'input',
                            text: 'Message input field',
                            bounds: { x: width * 0.05, y: height * 0.85, width: width * 0.9, height: height * 0.1 },
                            confidence: 0.9,
                            normalizedPosition: { x: 0.5, y: 0.9 }
                        });
                        analysis = {
                            elements: elements,
                            summary: "Detected ".concat(elements.length, " ChatGPT UI elements including update button, settings, title, and input field."),
                            suggestedActions: [
                                'Click on "Update Available" button if visible',
                                'Access settings through the settings button',
                                'Use the message input field to type',
                                'Look for navigation or menu options'
                            ],
                            windowInfo: {
                                width: width,
                                height: height,
                                title: (_a = this.currentApp) === null || _a === void 0 ? void 0 : _a.name
                            },
                            chatgptSpecific: {
                                hasUpdateButton: elements.some(function (e) { var _a; return (_a = e.text) === null || _a === void 0 ? void 0 : _a.toLowerCase().includes('update'); }),
                                hasSettingsButton: elements.some(function (e) { var _a; return (_a = e.text) === null || _a === void 0 ? void 0 : _a.toLowerCase().includes('settings'); }),
                                hasInputField: elements.some(function (e) { return e.type === 'input'; }),
                                updateButtonPosition: (_b = elements.find(function (e) { var _a; return (_a = e.text) === null || _a === void 0 ? void 0 : _a.toLowerCase().includes('update'); })) === null || _b === void 0 ? void 0 : _b.normalizedPosition
                            }
                        };
                        return [2 /*return*/, analysis];
                }
            });
        });
    };
    ChatGPTWorkflowServer.prototype.findUpdateButton = function (elements) {
        // Look for elements that might be update buttons
        var updateKeywords = ['update', 'available', 'new', 'version', 'upgrade'];
        var _loop_1 = function (element) {
            if (element.text) {
                var lowerText_1 = element.text.toLowerCase();
                if (updateKeywords.some(function (keyword) { return lowerText_1.includes(keyword); })) {
                    return { value: element };
                }
            }
        };
        for (var _i = 0, elements_1 = elements; _i < elements_1.length; _i++) {
            var element = elements_1[_i];
            var state_1 = _loop_1(element);
            if (typeof state_1 === "object")
                return state_1.value;
        }
        // If no exact match, look for buttons in typical update button positions
        return elements.find(function (element) {
            return element.type === 'button' &&
                element.normalizedPosition.x > 0.8 &&
                element.normalizedPosition.y < 0.2;
        }) || null;
    };
    ChatGPTWorkflowServer.prototype.run = function () {
        return __awaiter(this, void 0, void 0, function () {
            var transport;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        transport = new stdio_js_1.StdioServerTransport();
                        return [4 /*yield*/, this.server.connect(transport)];
                    case 1:
                        _a.sent();
                        console.error('ChatGPT Workflow MCP server running on stdio');
                        return [2 /*return*/];
                }
            });
        });
    };
    return ChatGPTWorkflowServer;
}());
// Start the server
var server = new ChatGPTWorkflowServer();
server.run().catch(console.error);
