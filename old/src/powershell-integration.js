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
exports.powerShellIntegration = exports.PowerShellIntegration = void 0;
var child_process_1 = require("child_process");
var util_1 = require("util");
var os = require("os");
var execAsync = (0, util_1.promisify)(child_process_1.exec);
/**
 * Cross-Platform PowerShell Integration Module
 * Implements Node child_process execution of Get-Process and Start-Process
 * with async functions and admin rights detection.
 */
var PowerShellIntegration = /** @class */ (function () {
    function PowerShellIntegration() {
        this.isWindows = os.platform() === 'win32';
        // Pin PowerShell 7.4 if available, fallback to Windows PowerShell
        this.powerShellCommand = 'powershell.exe';
    }
    PowerShellIntegration.getInstance = function () {
        if (!PowerShellIntegration.instance) {
            PowerShellIntegration.instance = new PowerShellIntegration();
        }
        return PowerShellIntegration.instance;
    };
    /**
     * Check if we have admin rights by testing access to HKLM:\SOFTWARE
     */
    PowerShellIntegration.prototype.checkAdminRights = function () {
        return __awaiter(this, void 0, void 0, function () {
            var command, _a, stdout, stderr, canAccess, error_1;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        if (!this.isWindows) {
                            return [2 /*return*/, {
                                    hasAdminRights: false,
                                    canAccessHKLM: false,
                                    error: 'Admin rights check only available on Windows'
                                }];
                        }
                        _b.label = 1;
                    case 1:
                        _b.trys.push([1, 3, , 4]);
                        command = "".concat(this.powerShellCommand, " -Command \"Test-Path 'HKLM:\\SOFTWARE'\"");
                        return [4 /*yield*/, execAsync(command)];
                    case 2:
                        _a = _b.sent(), stdout = _a.stdout, stderr = _a.stderr;
                        canAccess = stdout.trim().toLowerCase() === 'true';
                        return [2 /*return*/, {
                                hasAdminRights: canAccess,
                                canAccessHKLM: canAccess,
                                error: stderr ? stderr.trim() : undefined
                            }];
                    case 3:
                        error_1 = _b.sent();
                        return [2 /*return*/, {
                                hasAdminRights: false,
                                canAccessHKLM: false,
                                error: error_1 instanceof Error ? error_1.message : String(error_1)
                            }];
                    case 4: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Get list of processes with main windows using Get-Process
     */
    PowerShellIntegration.prototype.getProcesses = function () {
        return __awaiter(this, void 0, void 0, function () {
            var command, _a, stdout, stderr, processes, error_2;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        if (!this.isWindows) {
                            throw new Error('PowerShell process listing only available on Windows');
                        }
                        _b.label = 1;
                    case 1:
                        _b.trys.push([1, 3, , 4]);
                        command = "".concat(this.powerShellCommand, " -Command \"\n        Get-Process | Where-Object {$_.MainWindowTitle -ne '' -and $_.MainWindowTitle -ne $null} | \n        Select-Object @{Name='Name';Expression={$_.ProcessName}}, \n                     @{Name='PID';Expression={$_.Id}}, \n                     @{Name='Title';Expression={$_.MainWindowTitle}},\n                     @{Name='MainWindowHandle';Expression={$_.MainWindowHandle}} |\n        ConvertTo-Json -Depth 2\n      \"");
                        return [4 /*yield*/, execAsync(command, { timeout: 10000 })];
                    case 2:
                        _a = _b.sent(), stdout = _a.stdout, stderr = _a.stderr;
                        if (stderr && stderr.trim()) {
                            console.warn('PowerShell warning:', stderr.trim());
                        }
                        if (!stdout || stdout.trim() === '') {
                            return [2 /*return*/, []];
                        }
                        processes = void 0;
                        try {
                            processes = JSON.parse(stdout);
                        }
                        catch (parseError) {
                            throw new Error("Failed to parse PowerShell output: ".concat(parseError));
                        }
                        // Handle single result (not an array)
                        if (!Array.isArray(processes)) {
                            processes = [processes];
                        }
                        return [2 /*return*/, processes.map(function (proc) { return ({
                                name: proc.Name || '',
                                pid: proc.PID || 0,
                                title: proc.Title || '',
                                mainWindowHandle: proc.MainWindowHandle ? proc.MainWindowHandle.toString() : undefined
                            }); })];
                    case 3:
                        error_2 = _b.sent();
                        throw new Error("PowerShell Get-Process failed: ".concat(error_2 instanceof Error ? error_2.message : String(error_2)));
                    case 4: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Start a process using Start-Process
     */
    PowerShellIntegration.prototype.startProcess = function (processName_1) {
        return __awaiter(this, arguments, void 0, function (processName, args, elevated) {
            var argsString, verbString, passThruString, command, _a, stdout, stderr, result, error_3;
            if (args === void 0) { args = []; }
            if (elevated === void 0) { elevated = false; }
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        if (!this.isWindows) {
                            throw new Error('PowerShell Start-Process only available on Windows');
                        }
                        _b.label = 1;
                    case 1:
                        _b.trys.push([1, 3, , 4]);
                        argsString = args.length > 0 ? "-ArgumentList \"".concat(args.join('", "'), "\"") : '';
                        verbString = elevated ? '-Verb RunAs' : '';
                        passThruString = '-PassThru';
                        command = "".concat(this.powerShellCommand, " -Command \"\n        try {\n          $process = Start-Process -FilePath '").concat(processName, "' ").concat(argsString, " ").concat(verbString, " ").concat(passThruString, " -ErrorAction Stop\n          @{\n            success = $true\n            pid = $process.Id\n          } | ConvertTo-Json\n        } catch {\n          @{\n            success = $false\n            error = $_.Exception.Message\n          } | ConvertTo-Json\n        }\n      \"");
                        return [4 /*yield*/, execAsync(command, { timeout: 15000 })];
                    case 2:
                        _a = _b.sent(), stdout = _a.stdout, stderr = _a.stderr;
                        if (stderr && stderr.trim()) {
                            console.warn('PowerShell Start-Process warning:', stderr.trim());
                        }
                        result = JSON.parse(stdout);
                        return [2 /*return*/, {
                                success: result.success || false,
                                pid: result.pid || undefined,
                                error: result.error || undefined
                            }];
                    case 3:
                        error_3 = _b.sent();
                        return [2 /*return*/, {
                                success: false,
                                error: error_3 instanceof Error ? error_3.message : String(error_3)
                            }];
                    case 4: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Focus a window by process name using Windows API calls
     */
    PowerShellIntegration.prototype.focusWindowByProcessName = function (processName) {
        return __awaiter(this, void 0, void 0, function () {
            var command, _a, stdout, stderr, result, error_4;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        if (!this.isWindows) {
                            throw new Error('Window focusing only available on Windows');
                        }
                        _b.label = 1;
                    case 1:
                        _b.trys.push([1, 3, , 4]);
                        command = "".concat(this.powerShellCommand, " -Command \"\n        try {\n          Add-Type -TypeDefinition '\n            using System;\n            using System.Runtime.InteropServices;\n            public class Win32 {\n              [DllImport(\"user32.dll\")]\n              public static extern bool SetForegroundWindow(IntPtr hWnd);\n              [DllImport(\"user32.dll\")]\n              public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);\n              [DllImport(\"user32.dll\")]\n              public static extern bool IsIconic(IntPtr hWnd);\n            }\n          ' -ErrorAction SilentlyContinue\n\n          $processes = Get-Process -Name '*").concat(processName, "*' -ErrorAction Stop | Where-Object {$_.MainWindowTitle -ne ''}\n          \n          if ($processes) {\n            $process = $processes | Select-Object -First 1\n            $hwnd = $process.MainWindowHandle\n            \n            if ([Win32]::IsIconic($hwnd)) {\n              [Win32]::ShowWindow($hwnd, 9) # SW_RESTORE\n            }\n            \n            $result = [Win32]::SetForegroundWindow($hwnd)\n            \n            @{\n              success = $result\n              processName = $process.ProcessName\n              title = $process.MainWindowTitle\n              pid = $process.Id\n            } | ConvertTo-Json\n          } else {\n            @{\n              success = $false\n              error = 'Process not found or has no main window'\n            } | ConvertTo-Json\n          }\n        } catch {\n          @{\n            success = $false\n            error = $_.Exception.Message\n          } | ConvertTo-Json\n        }\n      \"");
                        return [4 /*yield*/, execAsync(command, { timeout: 10000 })];
                    case 2:
                        _a = _b.sent(), stdout = _a.stdout, stderr = _a.stderr;
                        if (stderr && stderr.trim()) {
                            console.warn('PowerShell focus warning:', stderr.trim());
                        }
                        result = JSON.parse(stdout);
                        return [2 /*return*/, {
                                success: result.success || false,
                                error: result.error || undefined
                            }];
                    case 3:
                        error_4 = _b.sent();
                        return [2 /*return*/, {
                                success: false,
                                error: error_4 instanceof Error ? error_4.message : String(error_4)
                            }];
                    case 4: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Get detailed process information by name or PID
     */
    PowerShellIntegration.prototype.getProcessDetails = function (identifier) {
        return __awaiter(this, void 0, void 0, function () {
            var isNumeric, filter, command, _a, stdout, stderr, process_1, error_5;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        if (!this.isWindows) {
                            throw new Error('Process details only available on Windows');
                        }
                        _b.label = 1;
                    case 1:
                        _b.trys.push([1, 3, , 4]);
                        isNumeric = typeof identifier === 'number' || !isNaN(Number(identifier));
                        filter = isNumeric
                            ? "$_.Id -eq ".concat(identifier)
                            : "$_.ProcessName -like '*".concat(identifier, "*'");
                        command = "".concat(this.powerShellCommand, " -Command \"\n        Get-Process | Where-Object {").concat(filter, " -and $_.MainWindowTitle -ne ''} | \n        Select-Object -First 1 @{Name='Name';Expression={$_.ProcessName}}, \n                     @{Name='PID';Expression={$_.Id}}, \n                     @{Name='Title';Expression={$_.MainWindowTitle}},\n                     @{Name='MainWindowHandle';Expression={$_.MainWindowHandle}} |\n        ConvertTo-Json\n      \"");
                        return [4 /*yield*/, execAsync(command)];
                    case 2:
                        _a = _b.sent(), stdout = _a.stdout, stderr = _a.stderr;
                        if (stderr && stderr.trim()) {
                            console.warn('PowerShell process details warning:', stderr.trim());
                        }
                        if (!stdout || stdout.trim() === 'null' || stdout.trim() === '') {
                            return [2 /*return*/, null];
                        }
                        process_1 = JSON.parse(stdout);
                        return [2 /*return*/, {
                                name: process_1.Name || '',
                                pid: process_1.PID || 0,
                                title: process_1.Title || '',
                                mainWindowHandle: process_1.MainWindowHandle ? process_1.MainWindowHandle.toString() : undefined
                            }];
                    case 3:
                        error_5 = _b.sent();
                        throw new Error("Failed to get process details: ".concat(error_5 instanceof Error ? error_5.message : String(error_5)));
                    case 4: return [2 /*return*/];
                }
            });
        });
    };
    return PowerShellIntegration;
}());
exports.PowerShellIntegration = PowerShellIntegration;
// Export singleton instance
exports.powerShellIntegration = PowerShellIntegration.getInstance();
