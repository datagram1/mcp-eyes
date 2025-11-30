"use strict";
/**
 * Compatibility layer for nut-js fork differences
 * Maps deprecated or missing APIs to available alternatives
 */
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
exports.sleep = exports.centerOf = exports.straightTo = exports.Size = exports.Region = exports.Key = exports.Button = exports.Point = exports.clipboard = exports.screen = exports.keyboard = exports.mouse = void 0;
exports.getActiveWindow = getActiveWindow;
exports.getWindows = getWindows;
exports.resizeWindowMacOS = resizeWindowMacOS;
exports.moveWindowMacOS = moveWindowMacOS;
exports.minimizeWindowMacOS = minimizeWindowMacOS;
exports.restoreWindowMacOS = restoreWindowMacOS;
var nut_js_1 = require("@nut-tree-fork/nut-js");
Object.defineProperty(exports, "mouse", { enumerable: true, get: function () { return nut_js_1.mouse; } });
Object.defineProperty(exports, "keyboard", { enumerable: true, get: function () { return nut_js_1.keyboard; } });
Object.defineProperty(exports, "screen", { enumerable: true, get: function () { return nut_js_1.screen; } });
Object.defineProperty(exports, "clipboard", { enumerable: true, get: function () { return nut_js_1.clipboard; } });
Object.defineProperty(exports, "Point", { enumerable: true, get: function () { return nut_js_1.Point; } });
Object.defineProperty(exports, "Button", { enumerable: true, get: function () { return nut_js_1.Button; } });
Object.defineProperty(exports, "Key", { enumerable: true, get: function () { return nut_js_1.Key; } });
Object.defineProperty(exports, "Region", { enumerable: true, get: function () { return nut_js_1.Region; } });
Object.defineProperty(exports, "Size", { enumerable: true, get: function () { return nut_js_1.Size; } });
Object.defineProperty(exports, "straightTo", { enumerable: true, get: function () { return nut_js_1.straightTo; } });
Object.defineProperty(exports, "centerOf", { enumerable: true, get: function () { return nut_js_1.centerOf; } });
Object.defineProperty(exports, "sleep", { enumerable: true, get: function () { return nut_js_1.sleep; } });
// Stub implementations for missing window management functions
function getActiveWindow() {
    return __awaiter(this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            // Return a mock window object
            // In production, this would need platform-specific implementation
            console.warn('getActiveWindow is not available in this nut-js fork version');
            return [2 /*return*/, {
                    title: 'Active Window',
                    region: new nut_js_1.Region(0, 0, 1920, 1080)
                }];
        });
    });
}
function getWindows() {
    return __awaiter(this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            // Return empty array as placeholder
            console.warn('getWindows is not available in this nut-js fork version');
            return [2 /*return*/, []];
        });
    });
}
// Platform-specific window management using AppleScript (macOS)
function resizeWindowMacOS(width, height, windowTitle) {
    return __awaiter(this, void 0, void 0, function () {
        var exec, promisify, execAsync, script, error_1;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    exec = require('child_process').exec;
                    promisify = require('util').promisify;
                    execAsync = promisify(exec);
                    script = windowTitle
                        ? "tell application \"System Events\" to tell (first process whose frontmost is true) to set size of front window to {".concat(width, ", ").concat(height, "}")
                        : "tell application \"System Events\" to tell process \"".concat(windowTitle, "\" to set size of front window to {").concat(width, ", ").concat(height, "}");
                    _a.label = 1;
                case 1:
                    _a.trys.push([1, 3, , 4]);
                    return [4 /*yield*/, execAsync("osascript -e '".concat(script, "'"))];
                case 2:
                    _a.sent();
                    return [3 /*break*/, 4];
                case 3:
                    error_1 = _a.sent();
                    throw new Error("Failed to resize window: ".concat(error_1));
                case 4: return [2 /*return*/];
            }
        });
    });
}
function moveWindowMacOS(x, y, windowTitle) {
    return __awaiter(this, void 0, void 0, function () {
        var exec, promisify, execAsync, script, error_2;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    exec = require('child_process').exec;
                    promisify = require('util').promisify;
                    execAsync = promisify(exec);
                    script = windowTitle
                        ? "tell application \"System Events\" to tell (first process whose frontmost is true) to set position of front window to {".concat(x, ", ").concat(y, "}")
                        : "tell application \"System Events\" to tell process \"".concat(windowTitle, "\" to set position of front window to {").concat(x, ", ").concat(y, "}");
                    _a.label = 1;
                case 1:
                    _a.trys.push([1, 3, , 4]);
                    return [4 /*yield*/, execAsync("osascript -e '".concat(script, "'"))];
                case 2:
                    _a.sent();
                    return [3 /*break*/, 4];
                case 3:
                    error_2 = _a.sent();
                    throw new Error("Failed to move window: ".concat(error_2));
                case 4: return [2 /*return*/];
            }
        });
    });
}
function minimizeWindowMacOS(windowTitle) {
    return __awaiter(this, void 0, void 0, function () {
        var exec, promisify, execAsync, script, error_3;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    exec = require('child_process').exec;
                    promisify = require('util').promisify;
                    execAsync = promisify(exec);
                    script = windowTitle
                        ? "tell application \"System Events\" to tell (first process whose frontmost is true) to set miniaturized of front window to true"
                        : "tell application \"System Events\" to tell process \"".concat(windowTitle, "\" to set miniaturized of front window to true");
                    _a.label = 1;
                case 1:
                    _a.trys.push([1, 3, , 4]);
                    return [4 /*yield*/, execAsync("osascript -e '".concat(script, "'"))];
                case 2:
                    _a.sent();
                    return [3 /*break*/, 4];
                case 3:
                    error_3 = _a.sent();
                    throw new Error("Failed to minimize window: ".concat(error_3));
                case 4: return [2 /*return*/];
            }
        });
    });
}
function restoreWindowMacOS(windowTitle) {
    return __awaiter(this, void 0, void 0, function () {
        var exec, promisify, execAsync, script, error_4;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    exec = require('child_process').exec;
                    promisify = require('util').promisify;
                    execAsync = promisify(exec);
                    script = windowTitle
                        ? "tell application \"System Events\" to tell (first process whose frontmost is true) to set miniaturized of front window to false"
                        : "tell application \"System Events\" to tell process \"".concat(windowTitle, "\" to set miniaturized of front window to false");
                    _a.label = 1;
                case 1:
                    _a.trys.push([1, 3, , 4]);
                    return [4 /*yield*/, execAsync("osascript -e '".concat(script, "'"))];
                case 2:
                    _a.sent();
                    return [3 /*break*/, 4];
                case 3:
                    error_4 = _a.sent();
                    throw new Error("Failed to restore window: ".concat(error_4));
                case 4: return [2 /*return*/];
            }
        });
    });
}
