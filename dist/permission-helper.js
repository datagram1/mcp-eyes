#!/usr/bin/env node
"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.permissionHelper = exports.PermissionHelper = void 0;
const child_process_1 = require("child_process");
const logger_js_1 = require("./logger.js");
class PermissionHelper {
    static instance;
    nodePath;
    needsSymlink = false;
    constructor() {
        this.nodePath = this.findNodePath();
        this.needsSymlink = this.checkIfNeedsSymlink();
    }
    static getInstance() {
        if (!PermissionHelper.instance) {
            PermissionHelper.instance = new PermissionHelper();
        }
        return PermissionHelper.instance;
    }
    findNodePath() {
        try {
            return (0, child_process_1.execSync)('which node', { encoding: 'utf8' }).trim();
        }
        catch (error) {
            logger_js_1.logger.error('Could not find Node.js executable', { error: error.message });
            return '';
        }
    }
    checkIfNeedsSymlink() {
        // Check if Node.js is in a hidden directory (starts with .)
        return this.nodePath.includes('/.');
    }
    async checkPermissions() {
        const screen = await this.checkScreenPermission();
        const accessibility = await this.checkAccessibilityPermission();
        return {
            screen,
            accessibility,
            nodePath: this.nodePath,
            needsSymlink: this.needsSymlink
        };
    }
    async checkScreenPermission() {
        try {
            // Try to take a screenshot to test screen recording permission
            // @ts-ignore - screenshot-desktop doesn't have type definitions
            const screenshotModule = await Promise.resolve().then(() => __importStar(require('screenshot-desktop')));
            const screenshot = screenshotModule.default || screenshotModule.screenshotDesktop;
            if (typeof screenshot !== 'function') {
                logger_js_1.logger.warn('Screenshot function not found in screenshot-desktop module');
                return 'denied';
            }
            const result = await screenshot();
            // Check if we got a valid image buffer
            if (result && result.length > 0) {
                logger_js_1.logger.info('Screen recording permission check successful', {
                    imageSize: result.length,
                    imageType: typeof result
                });
                return 'authorized';
            }
            else {
                logger_js_1.logger.warn('Screenshot returned empty result');
                return 'denied';
            }
        }
        catch (error) {
            logger_js_1.logger.warn('Screen recording permission check failed', { error: error.message });
            return 'denied';
        }
    }
    async checkAccessibilityPermission() {
        try {
            // Try to use AppleScript to test accessibility permission
            const result = (0, child_process_1.execSync)('osascript -e "tell application \\"System Events\\" to get name of every process"', {
                encoding: 'utf8',
                timeout: 5000
            });
            if (result && result.trim().length > 0) {
                return 'authorized';
            }
            return 'denied';
        }
        catch (error) {
            logger_js_1.logger.warn('Accessibility permission check failed', { error: error.message });
            return 'denied';
        }
    }
    generatePermissionInstructions() {
        const instructions = [];
        if (this.needsSymlink) {
            instructions.push(`
🔧 ACCESSIBILITY PERMISSIONS SETUP REQUIRED

Your Node.js installation is in a hidden directory (${this.nodePath}), which macOS prevents from being added to accessibility permissions through the GUI.

SOLUTION: Run the setup script to create a visible symlink:

  ./setup-permissions.sh

This script will:
1. Create a visible symlink to your Node.js executable
2. Open System Settings to the accessibility section
3. Guide you through adding the symlink to permissions

ALTERNATIVE: Manual setup
1. Run: sudo ln -s "${this.nodePath}" /usr/local/bin/node-mcp-eyes
2. Open System Settings → Privacy & Security → Accessibility
3. Add /usr/local/bin/node-mcp-eyes to the list
`);
        }
        else {
            instructions.push(`
✅ Node.js is in a visible directory: ${this.nodePath}
You can add it directly through System Settings → Privacy & Security → Accessibility
`);
        }
        return instructions.join('\n');
    }
    async createSymlink() {
        if (!this.needsSymlink) {
            logger_js_1.logger.info('No symlink needed - Node.js is already visible');
            return true;
        }
        try {
            const symlinkPath = '/usr/local/bin/node-mcp-eyes';
            // Remove existing symlink if it exists
            try {
                (0, child_process_1.execSync)(`sudo rm "${symlinkPath}"`, { stdio: 'ignore' });
            }
            catch (error) {
                // Ignore if symlink doesn't exist
            }
            // Create new symlink
            (0, child_process_1.execSync)(`sudo ln -s "${this.nodePath}" "${symlinkPath}"`);
            // Set executable permissions
            (0, child_process_1.execSync)(`sudo chmod +x "${symlinkPath}"`);
            logger_js_1.logger.info('Created symlink for accessibility permissions', {
                symlinkPath,
                targetPath: this.nodePath
            });
            return true;
        }
        catch (error) {
            logger_js_1.logger.error('Failed to create symlink', { error: error.message });
            return false;
        }
    }
    openSystemSettings() {
        try {
            // Open System Settings to accessibility section
            (0, child_process_1.execSync)('open "x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility"');
            logger_js_1.logger.info('Opened System Settings to accessibility section');
        }
        catch (error) {
            logger_js_1.logger.error('Failed to open System Settings', { error: error.message });
        }
    }
    openSymlinkDirectory() {
        try {
            (0, child_process_1.execSync)('open /usr/local/bin/');
            logger_js_1.logger.info('Opened /usr/local/bin/ directory');
        }
        catch (error) {
            logger_js_1.logger.error('Failed to open symlink directory', { error: error.message });
        }
    }
}
exports.PermissionHelper = PermissionHelper;
exports.permissionHelper = PermissionHelper.getInstance();
//# sourceMappingURL=permission-helper.js.map