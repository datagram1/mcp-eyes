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
exports.EnhancedWindowBoundsHelper = void 0;
var run_1 = require("@jxa/run");
var EnhancedWindowBoundsHelper = /** @class */ (function () {
    function EnhancedWindowBoundsHelper() {
    }
    /**
     * Get accurate window bounds for a specific application
     * This fixes the issue where bounds were showing as (0,0,0,0)
     */
    EnhancedWindowBoundsHelper.getApplicationBounds = function (appName, pid) {
        return __awaiter(this, void 0, void 0, function () {
            var result, error_1;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 2, , 3]);
                        return [4 /*yield*/, (0, run_1.run)(function (appName, pid) {
                                // @ts-ignore
                                var systemEvents = Application("System Events");
                                // Find the process by name or PID
                                var process;
                                if (pid) {
                                    process = systemEvents.processes.byId(pid);
                                }
                                else {
                                    process = systemEvents.processes.byName(appName);
                                }
                                if (!process) {
                                    return null;
                                }
                                // Get the main window
                                var windows = process.windows();
                                if (!windows || windows.length === 0) {
                                    return null;
                                }
                                var mainWindow = windows[0];
                                // Get position and size
                                var position = mainWindow.position();
                                var size = mainWindow.size();
                                return {
                                    x: position[0],
                                    y: position[1],
                                    width: size[0],
                                    height: size[1]
                                };
                            }, appName, pid)];
                    case 1:
                        result = _a.sent();
                        return [2 /*return*/, result];
                    case 2:
                        error_1 = _a.sent();
                        console.error("Failed to get bounds for ".concat(appName, ":"), error_1);
                        return [2 /*return*/, null];
                    case 3: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Get comprehensive application information including bounds
     */
    EnhancedWindowBoundsHelper.getApplicationInfo = function (appName) {
        return __awaiter(this, void 0, void 0, function () {
            var result, error_2;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 2, , 3]);
                        return [4 /*yield*/, (0, run_1.run)(function (appName) {
                                // @ts-ignore
                                var systemEvents = Application("System Events");
                                var process = systemEvents.processes.byName(appName);
                                if (!process) {
                                    return null;
                                }
                                var windows = process.windows();
                                if (!windows || windows.length === 0) {
                                    return {
                                        name: appName,
                                        bundleId: process.bundleIdentifier ? process.bundleIdentifier() : '',
                                        pid: process.unixId(),
                                        bounds: { x: 0, y: 0, width: 0, height: 0 },
                                        isVisible: false,
                                        isMinimized: true,
                                        displayId: 0
                                    };
                                }
                                var mainWindow = windows[0];
                                var position = mainWindow.position();
                                var size = mainWindow.size();
                                // Determine display ID based on position
                                var displayId = 0;
                                if (position[0] > 1920 || position[1] > 1080) {
                                    displayId = 1; // Secondary display
                                }
                                return {
                                    name: appName,
                                    bundleId: process.bundleIdentifier ? process.bundleIdentifier() : '',
                                    pid: process.unixId(),
                                    bounds: {
                                        x: position[0],
                                        y: position[1],
                                        width: size[0],
                                        height: size[1]
                                    },
                                    isVisible: true,
                                    isMinimized: false,
                                    displayId: displayId
                                };
                            }, appName)];
                    case 1:
                        result = _a.sent();
                        return [2 /*return*/, result];
                    case 2:
                        error_2 = _a.sent();
                        console.error("Failed to get application info for ".concat(appName, ":"), error_2);
                        return [2 /*return*/, null];
                    case 3: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Ensure application window is visible and get accurate bounds
     */
    EnhancedWindowBoundsHelper.ensureWindowVisible = function (appName) {
        return __awaiter(this, void 0, void 0, function () {
            var result, error_3;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 2, , 3]);
                        return [4 /*yield*/, (0, run_1.run)(function (appName) {
                                // @ts-ignore
                                var app = Application(appName);
                                app.activate();
                                // Wait a moment for activation (handled by run function)
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
                                var mainWindow = windows[0];
                                // Ensure window is not minimized
                                if (mainWindow.minimized && mainWindow.minimized()) {
                                    mainWindow.minimized = false;
                                    // Wait handled by run function
                                }
                                // Get fresh bounds after ensuring visibility
                                var position = mainWindow.position();
                                var size = mainWindow.size();
                                return {
                                    x: position[0],
                                    y: position[1],
                                    width: size[0],
                                    height: size[1]
                                };
                            }, appName)];
                    case 1:
                        result = _a.sent();
                        return [2 /*return*/, result];
                    case 2:
                        error_3 = _a.sent();
                        console.error("Failed to ensure window visible for ".concat(appName, ":"), error_3);
                        return [2 /*return*/, null];
                    case 3: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Move window to primary display and get bounds
     */
    EnhancedWindowBoundsHelper.moveToPrimaryDisplay = function (appName) {
        return __awaiter(this, void 0, void 0, function () {
            var result, error_4;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 2, , 3]);
                        return [4 /*yield*/, (0, run_1.run)(function (appName) {
                                // @ts-ignore
                                var app = Application(appName);
                                app.activate();
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
                                var mainWindow = windows[0];
                                // Move to primary display (assuming 1920x1080 primary display)
                                mainWindow.position = [100, 100];
                                // Wait for movement to complete (handled by run function)
                                // Get fresh bounds
                                var position = mainWindow.position();
                                var size = mainWindow.size();
                                return {
                                    x: position[0],
                                    y: position[1],
                                    width: size[0],
                                    height: size[1]
                                };
                            }, appName)];
                    case 1:
                        result = _a.sent();
                        return [2 /*return*/, result];
                    case 2:
                        error_4 = _a.sent();
                        console.error("Failed to move window to primary display for ".concat(appName, ":"), error_4);
                        return [2 /*return*/, null];
                    case 3: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Get all visible applications with accurate bounds
     */
    EnhancedWindowBoundsHelper.getAllVisibleApplications = function () {
        return __awaiter(this, void 0, void 0, function () {
            var result, error_5;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 2, , 3]);
                        return [4 /*yield*/, (0, run_1.run)(function () {
                                // @ts-ignore
                                var systemEvents = Application("System Events");
                                var processes = systemEvents.applicationProcesses();
                                var applications = [];
                                processes.forEach(function (process) {
                                    var windows = process.windows();
                                    if (windows && windows.length > 0) {
                                        var mainWindow = windows[0];
                                        var position = mainWindow.position();
                                        var size = mainWindow.size();
                                        // Only include windows with valid bounds
                                        if (size[0] > 0 && size[1] > 0) {
                                            var displayId = 0;
                                            if (position[0] > 1920 || position[1] > 1080) {
                                                displayId = 1;
                                            }
                                            applications.push({
                                                name: process.name(),
                                                bundleId: process.bundleIdentifier ? process.bundleIdentifier() : '',
                                                pid: process.unixId(),
                                                bounds: {
                                                    x: position[0],
                                                    y: position[1],
                                                    width: size[0],
                                                    height: size[1]
                                                },
                                                isVisible: true,
                                                isMinimized: mainWindow.minimized ? mainWindow.minimized() : false,
                                                displayId: displayId
                                            });
                                        }
                                    }
                                });
                                return applications;
                            })];
                    case 1:
                        result = _a.sent();
                        return [2 /*return*/, result];
                    case 2:
                        error_5 = _a.sent();
                        console.error('Failed to get all visible applications:', error_5);
                        return [2 /*return*/, []];
                    case 3: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Validate window bounds and fix if necessary
     */
    EnhancedWindowBoundsHelper.validateAndFixBounds = function (appName) {
        return __awaiter(this, void 0, void 0, function () {
            var bounds, error_6;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 5, , 6]);
                        return [4 /*yield*/, this.getApplicationBounds(appName)];
                    case 1:
                        bounds = _a.sent();
                        if (!(!bounds || (bounds.width === 0 && bounds.height === 0))) return [3 /*break*/, 4];
                        console.log("Invalid bounds for ".concat(appName, ", attempting to fix..."));
                        return [4 /*yield*/, this.ensureWindowVisible(appName)];
                    case 2:
                        // Ensure window is visible
                        bounds = _a.sent();
                        if (!(!bounds || (bounds.width === 0 && bounds.height === 0))) return [3 /*break*/, 4];
                        console.log("Still invalid bounds for ".concat(appName, ", moving to primary display..."));
                        return [4 /*yield*/, this.moveToPrimaryDisplay(appName)];
                    case 3:
                        bounds = _a.sent();
                        _a.label = 4;
                    case 4:
                        // Final validation
                        if (bounds && bounds.width > 0 && bounds.height > 0) {
                            console.log("Valid bounds for ".concat(appName, ": ").concat(bounds.width, "x").concat(bounds.height, " at (").concat(bounds.x, ", ").concat(bounds.y, ")"));
                            return [2 /*return*/, bounds];
                        }
                        else {
                            console.error("Could not get valid bounds for ".concat(appName));
                            return [2 /*return*/, null];
                        }
                        return [3 /*break*/, 6];
                    case 5:
                        error_6 = _a.sent();
                        console.error("Failed to validate and fix bounds for ".concat(appName, ":"), error_6);
                        return [2 /*return*/, null];
                    case 6: return [2 /*return*/];
                }
            });
        });
    };
    return EnhancedWindowBoundsHelper;
}());
exports.EnhancedWindowBoundsHelper = EnhancedWindowBoundsHelper;
exports.default = EnhancedWindowBoundsHelper;
