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
exports.getWindowBoundsAppleScript = getWindowBoundsAppleScript;
exports.clearBoundsCache = clearBoundsCache;
exports.getCachedBounds = getCachedBounds;
var child_process_1 = require("child_process");
var util_1 = require("util");
var execAsync = (0, util_1.promisify)(child_process_1.exec);
// Cache to store bounds per PID
var boundsCache = new Map();
var CACHE_TIMEOUT = 5000; // 5 seconds cache timeout
/**
 * Escape application name for safe AppleScript execution
 */
function escapeAppleScriptString(str) {
    return str.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}
/**
 * Get window bounds using AppleScript System Events
 */
function getWindowBoundsAppleScript(appName, pid) {
    return __awaiter(this, void 0, void 0, function () {
        var cached, escapedAppName, primaryScript, stdout, values, bounds, error_1, fallbackScript, stdout, values, bounds, error_2;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    cached = boundsCache.get(pid);
                    if (cached && Date.now() - cached.timestamp < CACHE_TIMEOUT) {
                        return [2 /*return*/, cached.bounds];
                    }
                    escapedAppName = escapeAppleScriptString(appName);
                    primaryScript = "\n    tell application \"System Events\"\n      try\n        tell process \"".concat(escapedAppName, "\"\n          set frontWindow to front window\n          set windowBounds to position of frontWindow & size of frontWindow\n          return windowBounds\n        end tell\n      on error\n        return {0, 0, 0, 0}\n      end try\n    end tell\n  ");
                    _a.label = 1;
                case 1:
                    _a.trys.push([1, 3, , 4]);
                    return [4 /*yield*/, execAsync("osascript -e '".concat(primaryScript.replace(/'/g, "'\"'\"'"), "'"))];
                case 2:
                    stdout = (_a.sent()).stdout;
                    values = stdout.trim().split(', ').map(function (v) { return parseInt(v); });
                    if (values.length === 4 && values.some(function (v) { return v !== 0; })) {
                        bounds = {
                            x: values[0],
                            y: values[1],
                            width: values[2],
                            height: values[3]
                        };
                        // Cache the result
                        boundsCache.set(pid, { bounds: bounds, timestamp: Date.now() });
                        return [2 /*return*/, bounds];
                    }
                    return [3 /*break*/, 4];
                case 3:
                    error_1 = _a.sent();
                    console.error("Primary AppleScript method failed for ".concat(appName, ":"), error_1);
                    return [3 /*break*/, 4];
                case 4:
                    fallbackScript = "\n    tell application \"System Events\"\n      try\n        tell process \"".concat(escapedAppName, "\"\n          set uiWindows to windows\n          if (count of uiWindows) > 0 then\n            set firstWindow to item 1 of uiWindows\n            set windowPosition to position of firstWindow\n            set windowSize to size of firstWindow\n            return windowPosition & windowSize\n          else\n            return {0, 0, 0, 0}\n          end if\n        end tell\n      on error\n        return {0, 0, 0, 0}\n      end try\n    end tell\n  ");
                    _a.label = 5;
                case 5:
                    _a.trys.push([5, 7, , 8]);
                    return [4 /*yield*/, execAsync("osascript -e '".concat(fallbackScript.replace(/'/g, "'\"'\"'"), "'"))];
                case 6:
                    stdout = (_a.sent()).stdout;
                    values = stdout.trim().split(', ').map(function (v) { return parseInt(v); });
                    if (values.length === 4 && values.some(function (v) { return v !== 0; })) {
                        bounds = {
                            x: values[0],
                            y: values[1],
                            width: values[2],
                            height: values[3]
                        };
                        // Cache the result
                        boundsCache.set(pid, { bounds: bounds, timestamp: Date.now() });
                        return [2 /*return*/, bounds];
                    }
                    return [3 /*break*/, 8];
                case 7:
                    error_2 = _a.sent();
                    console.error("Fallback AppleScript method failed for ".concat(appName, ":"), error_2);
                    return [3 /*break*/, 8];
                case 8: return [2 /*return*/, null];
            }
        });
    });
}
/**
 * Clear the cache for a specific PID or all PIDs
 */
function clearBoundsCache(pid) {
    if (pid !== undefined) {
        boundsCache.delete(pid);
    }
    else {
        boundsCache.clear();
    }
}
/**
 * Get cached bounds without making a new request
 */
function getCachedBounds(pid) {
    var cached = boundsCache.get(pid);
    if (cached && Date.now() - cached.timestamp < CACHE_TIMEOUT) {
        return cached.bounds;
    }
    return null;
}
