#!/usr/bin/env node
"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const index_js_1 = require("@modelcontextprotocol/sdk/server/index.js");
const stdio_js_1 = require("@modelcontextprotocol/sdk/server/stdio.js");
const types_js_1 = require("@modelcontextprotocol/sdk/types.js");
// @ts-ignore
const screenshot_desktop_1 = require("screenshot-desktop");
const nut_js_1 = require("@nut-tree-fork/nut-js");
const run_1 = require("@jxa/run");
const sharp_1 = __importDefault(require("sharp"));
// @ts-ignore
const node_mac_permissions_1 = require("node-mac-permissions");
const window_bounds_helper_js_1 = require("./window-bounds-helper.js");
const logger_js_1 = require("./logger.js");
class BasicServer {
    server;
    currentApp = null;
    constructor() {
        // Initialize global error handlers first
        (0, logger_js_1.setupGlobalErrorHandlers)(logger_js_1.logger);
        this.server = new index_js_1.Server({
            name: 'mcp-eyes-basic',
            version: '1.1.15',
        });
        this.setupToolHandlers();
        this.setupErrorHandling();
        logger_js_1.logger.logServerEvent('BasicServer initialized', {
            serverName: 'mcp-eyes-basic',
            version: '1.1.15'
        });
    }
    setupErrorHandling() {
        this.server.onerror = (error) => {
            logger_js_1.logger.error('MCP Server error', { error: error.message }, error);
        };
    }
    setupToolHandlers() {
        this.server.setRequestHandler(types_js_1.ListToolsRequestSchema, async () => {
            return {
                tools: [
                    {
                        name: 'listApplications',
                        description: '🎯 MCP-EYES: List all running applications with their window bounds and identifiers. Essential for finding apps before closing them.',
                        inputSchema: {
                            type: 'object',
                            properties: {},
                        },
                    },
                    {
                        name: 'focusApplication',
                        description: '🎯 MCP-EYES: Focus on a specific application by bundle ID or PID. Use this before taking screenshots or clicking elements.',
                        inputSchema: {
                            type: 'object',
                            properties: {
                                identifier: {
                                    type: 'string',
                                    description: 'Bundle ID (e.g., com.apple.Music) or PID of the application to focus',
                                },
                            },
                            required: ['identifier'],
                        },
                    },
                    {
                        name: 'closeApp',
                        description: '🎯 MCP-EYES: Close/quit a specific application by bundle ID, name, or PID. This is the preferred method for closing applications when using MCP-eyes toolkit. Supports graceful quit with fallback to force close.',
                        inputSchema: {
                            type: 'object',
                            properties: {
                                identifier: {
                                    type: 'string',
                                    description: 'Bundle ID (e.g., com.apple.Music), app name (e.g., Music), or PID of the application to close',
                                },
                                force: {
                                    type: 'boolean',
                                    description: 'Force close the application if graceful quit fails (default: false)',
                                    default: false,
                                },
                            },
                            required: ['identifier'],
                        },
                    },
                    {
                        name: 'click',
                        description: 'Perform a mouse click at specified coordinates relative to the focused app window.',
                        inputSchema: {
                            type: 'object',
                            properties: {
                                x: {
                                    type: 'number',
                                    description: 'X coordinate relative to the app window (0-1 normalized)',
                                    minimum: 0,
                                    maximum: 1,
                                },
                                y: {
                                    type: 'number',
                                    description: 'Y coordinate relative to the app window (0-1 normalized)',
                                    minimum: 0,
                                    maximum: 1,
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
                        description: 'Move mouse to specified coordinates relative to the focused app window.',
                        inputSchema: {
                            type: 'object',
                            properties: {
                                x: {
                                    type: 'number',
                                    description: 'X coordinate relative to the app window (0-1 normalized)',
                                    minimum: 0,
                                    maximum: 1,
                                },
                                y: {
                                    type: 'number',
                                    description: 'Y coordinate relative to the app window (0-1 normalized)',
                                    minimum: 0,
                                    maximum: 1,
                                },
                            },
                            required: ['x', 'y'],
                        },
                    },
                    {
                        name: 'screenshot',
                        description: 'Take a screenshot of the focused application window.',
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
                        name: 'getClickableElements',
                        description: 'Get all clickable elements in the focused application using Apple Accessibility.',
                        inputSchema: {
                            type: 'object',
                            properties: {},
                        },
                    },
                    {
                        name: 'clickElement',
                        description: 'Click a specific element by index from getClickableElements.',
                        inputSchema: {
                            type: 'object',
                            properties: {
                                elementIndex: {
                                    type: 'number',
                                    description: 'Index of the element to click (from getClickableElements)',
                                },
                            },
                            required: ['elementIndex'],
                        },
                    },
                    {
                        name: 'findAndCloseApp',
                        description: '🎯 MCP-EYES: Find and close an application by name. This is the complete workflow for locating and closing apps using MCP-eyes toolkit.',
                        inputSchema: {
                            type: 'object',
                            properties: {
                                appName: {
                                    type: 'string',
                                    description: 'Name of the application to find and close (e.g., "Music", "Safari", "Chrome")',
                                },
                                force: {
                                    type: 'boolean',
                                    description: 'Force close the application if graceful quit fails (default: false)',
                                    default: false,
                                },
                            },
                            required: ['appName'],
                        },
                    },
                ],
            };
        });
        this.server.setRequestHandler(types_js_1.CallToolRequestSchema, async (request) => {
            const { name, arguments: args } = request.params;
            try {
                logger_js_1.logger.debug(`Tool called: ${name}`, { args });
                let result;
                switch (name) {
                    case 'listApplications':
                        result = await this.listApplications();
                        break;
                    case 'focusApplication':
                        result = await this.focusApplication(args?.identifier);
                        break;
                    case 'closeApp':
                        result = await this.closeApp(args?.identifier, args?.force || false);
                        break;
                    case 'click':
                        result = await this.click(args?.x, args?.y, args?.button || 'left');
                        break;
                    case 'moveMouse':
                        result = await this.moveMouse(args?.x, args?.y);
                        break;
                    case 'screenshot':
                        result = await this.screenshot(args?.padding || 10, args?.format || 'png', args?.quality || 90);
                        break;
                    case 'getClickableElements':
                        result = await this.getClickableElements();
                        break;
                    case 'clickElement':
                        result = await this.clickElement(args?.elementIndex);
                        break;
                    case 'findAndCloseApp':
                        result = await this.findAndCloseApp(args?.appName, args?.force || false);
                        break;
                    default:
                        throw new Error(`Unknown tool: ${name}`);
                }
                logger_js_1.logger.logToolExecution(name, args, result);
                return result;
            }
            catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                logger_js_1.logger.logToolExecution(name, args, null, error instanceof Error ? error : new Error(errorMessage));
                return {
                    content: [
                        {
                            type: 'text',
                            text: `Error: ${errorMessage}`,
                        },
                    ],
                };
            }
        });
    }
    async listApplications() {
        try {
            logger_js_1.logger.debug('Listing applications');
            const apps = await (0, run_1.run)(() => {
                const app = Application.currentApplication();
                app.includeStandardAdditions = true;
                const runningApps = Application('System Events').applicationProcesses();
                const appList = [];
                for (let i = 0; i < runningApps.length; i++) {
                    const appName = runningApps[i].name();
                    const appBundleId = runningApps[i].bundleIdentifier();
                    const appPid = runningApps[i].unixId();
                    // Get window bounds
                    const windows = runningApps[i].windows();
                    let bounds = { x: 0, y: 0, width: 0, height: 0 };
                    if (windows.length > 0) {
                        const window = windows[0];
                        bounds = {
                            x: window.position()[0],
                            y: window.position()[1],
                            width: window.size()[0],
                            height: window.size()[1],
                        };
                    }
                    appList.push({
                        name: appName,
                        bundleId: appBundleId,
                        pid: appPid,
                        bounds: bounds,
                    });
                }
                return appList;
            });
            const result = {
                content: [
                    {
                        type: 'text',
                        text: `Found ${apps.length} running applications:\n\n${apps
                            .map((app) => `• ${app.name} (${app.bundleId})\n  PID: ${app.pid}\n  Bounds: ${app.bounds.width}x${app.bounds.height} at (${app.bounds.x}, ${app.bounds.y})`)
                            .join('\n\n')}`,
                    },
                ],
            };
            logger_js_1.logger.info(`Listed ${apps.length} applications`);
            return result;
        }
        catch (error) {
            logger_js_1.logger.error('Failed to list applications', { error: error instanceof Error ? error.message : String(error) }, error instanceof Error ? error : undefined);
            throw new Error(`Failed to list applications: ${error}`);
        }
    }
    async focusApplication(identifier) {
        try {
            logger_js_1.logger.debug(`Focusing application: ${identifier}`);
            // Use the same approach as listApplications for consistency
            const apps = await (0, run_1.run)(() => {
                const app = Application.currentApplication();
                app.includeStandardAdditions = true;
                const runningApps = Application('System Events').applicationProcesses();
                const appList = [];
                for (let i = 0; i < runningApps.length; i++) {
                    const appName = runningApps[i].name();
                    const appBundleId = runningApps[i].bundleIdentifier();
                    const appPid = runningApps[i].unixId();
                    // Get window bounds
                    const windows = runningApps[i].windows();
                    let bounds = { x: 0, y: 0, width: 0, height: 0 };
                    if (windows.length > 0) {
                        const window = windows[0];
                        bounds = {
                            x: window.position()[0],
                            y: window.position()[1],
                            width: window.size()[0],
                            height: window.size()[1],
                        };
                    }
                    appList.push({
                        name: appName,
                        bundleId: appBundleId,
                        pid: appPid,
                        bounds: bounds,
                    });
                }
                return appList;
            });
            let targetApp;
            // Try to find by bundle ID first
            targetApp = apps.find((app) => app.bundleId === identifier);
            // If not found, try by PID
            if (!targetApp) {
                const pid = parseInt(identifier);
                if (!isNaN(pid)) {
                    targetApp = apps.find((app) => app.pid === pid);
                }
            }
            // If still not found, try by name (partial match)
            if (!targetApp) {
                targetApp = apps.find((app) => app.name.toLowerCase().includes(identifier.toLowerCase()));
            }
            if (!targetApp) {
                throw new Error(`Application not found: ${identifier}`);
            }
            // Focus the application using System Events for better reliability
            await (0, run_1.run)((bundleId) => {
                const app = Application.currentApplication();
                app.includeStandardAdditions = true;
                // Try multiple methods to ensure the app is focused
                try {
                    // Method 1: Direct activation
                    const targetApp = Application(bundleId);
                    targetApp.activate();
                    // Method 2: Use System Events to bring to front
                    const systemEvents = Application('System Events');
                    const processes = systemEvents.applicationProcesses();
                    for (let i = 0; i < processes.length; i++) {
                        if (processes[i].bundleIdentifier() === bundleId) {
                            processes[i].activate();
                            break;
                        }
                    }
                    // Method 3: Bring all windows to front
                    const windows = targetApp.windows();
                    for (let j = 0; j < windows.length; j++) {
                        windows[j].visible = true;
                    }
                }
                catch (error) {
                    console.log('Focus attempt failed:', error);
                }
            }, targetApp.bundleId);
            // Wait a moment for the focus to take effect
            await new Promise(resolve => setTimeout(resolve, 500));
            // Get updated bounds after focusing
            const updatedBounds = await (0, window_bounds_helper_js_1.getWindowBoundsAppleScript)(targetApp.name, targetApp.pid);
            if (updatedBounds) {
                targetApp.bounds = updatedBounds;
            }
            // Verify the app is actually focused by checking if it has valid bounds
            if (targetApp.bounds.width === 0 || targetApp.bounds.height === 0) {
                console.log('Warning: App may not be properly focused - bounds are zero');
            }
            this.currentApp = targetApp;
            const result = {
                content: [
                    {
                        type: 'text',
                        text: `🎯 MCP-EYES: Successfully focused on ${targetApp.name} (${targetApp.bundleId})\nPID: ${targetApp.pid}\nBounds: ${targetApp.bounds.width}x${targetApp.bounds.height} at (${targetApp.bounds.x}, ${targetApp.bounds.y})\n\nApp is now ready for screenshots and interactions.`,
                    },
                ],
            };
            logger_js_1.logger.logAppInteraction('focus', targetApp);
            return result;
        }
        catch (error) {
            logger_js_1.logger.error(`Failed to focus application: ${identifier}`, { identifier }, error instanceof Error ? error : undefined);
            throw new Error(`Failed to focus application: ${error}`);
        }
    }
    async closeApp(identifier, force = false) {
        try {
            logger_js_1.logger.debug(`Closing application: ${identifier}`, { force });
            const closeResult = await (0, run_1.run)((identifier, force) => {
                const app = Application.currentApplication();
                app.includeStandardAdditions = true;
                // Try to find app by bundle ID first, then by name, then by PID
                const runningApps = Application('System Events').applicationProcesses();
                let targetApp = null;
                let appInfo = null;
                // First, try to find by bundle ID or name
                for (let i = 0; i < runningApps.length; i++) {
                    const appBundleId = runningApps[i].bundleIdentifier();
                    const appName = runningApps[i].name();
                    if (appBundleId === identifier || appName === identifier) {
                        targetApp = runningApps[i];
                        appInfo = {
                            name: appName,
                            bundleId: appBundleId,
                            pid: runningApps[i].unixId()
                        };
                        break;
                    }
                }
                // If not found by name/bundle, try by PID
                if (!targetApp && !isNaN(parseInt(identifier))) {
                    const pid = parseInt(identifier);
                    for (let i = 0; i < runningApps.length; i++) {
                        if (runningApps[i].unixId() === pid) {
                            targetApp = runningApps[i];
                            appInfo = {
                                name: runningApps[i].name(),
                                bundleId: runningApps[i].bundleIdentifier(),
                                pid: pid
                            };
                            break;
                        }
                    }
                }
                if (!targetApp) {
                    throw new Error(`Application not found: ${identifier}`);
                }
                // Try graceful quit first
                try {
                    targetApp.quit();
                    return {
                        success: true,
                        method: 'graceful',
                        appInfo: appInfo,
                        message: `Successfully closed ${appInfo.name} gracefully`
                    };
                }
                catch (quitError) {
                    if (force) {
                        // Force kill the process
                        const killResult = app.doShellScript(`kill -9 ${appInfo.pid}`);
                        return {
                            success: true,
                            method: 'force',
                            appInfo: appInfo,
                            message: `Force closed ${appInfo.name} (PID: ${appInfo.pid})`
                        };
                    }
                    else {
                        throw new Error(`Failed to quit ${appInfo.name} gracefully. Use force: true to force close.`);
                    }
                }
            }, identifier, force);
            const typedResult = closeResult;
            // Clear current app if it was the one being closed
            if (this.currentApp &&
                (this.currentApp.bundleId === typedResult.appInfo.bundleId ||
                    this.currentApp.pid === typedResult.appInfo.pid)) {
                this.currentApp = null;
            }
            const closeAppResult = {
                content: [
                    {
                        type: 'text',
                        text: `${typedResult.message}\nMethod: ${typedResult.method}\nApp: ${typedResult.appInfo.name} (${typedResult.appInfo.bundleId})\nPID: ${typedResult.appInfo.pid}`,
                    },
                ],
            };
            logger_js_1.logger.logAppInteraction('close', typedResult.appInfo, { method: typedResult.method });
            return closeAppResult;
        }
        catch (error) {
            logger_js_1.logger.error(`Failed to close application: ${identifier}`, { identifier, force }, error instanceof Error ? error : undefined);
            throw new Error(`Failed to close application: ${error}`);
        }
    }
    async click(x, y, button) {
        if (!this.currentApp) {
            throw new Error('No application focused. Use focusApplication first.');
        }
        try {
            logger_js_1.logger.debug(`Clicking at (${x}, ${y}) with ${button} button`, {
                normalized: { x, y },
                app: this.currentApp.name
            });
            // Convert normalized coordinates to absolute screen coordinates
            const screenX = this.currentApp.bounds.x + (x * this.currentApp.bounds.width);
            const screenY = this.currentApp.bounds.y + (y * this.currentApp.bounds.height);
            // Map button string to nut-js Button enum
            const buttonMap = {
                left: nut_js_1.Button.LEFT,
                right: nut_js_1.Button.RIGHT,
                middle: nut_js_1.Button.MIDDLE,
            };
            await nut_js_1.mouse.setPosition({ x: screenX, y: screenY });
            await nut_js_1.mouse.click(buttonMap[button]);
            const result = {
                content: [
                    {
                        type: 'text',
                        text: `Clicked ${button} button at normalized (${x}, ${y}) -> screen (${Math.round(screenX)}, ${Math.round(screenY)})`,
                    },
                ],
            };
            logger_js_1.logger.logAppInteraction('click', this.currentApp, {
                normalized: { x, y },
                screen: { x: screenX, y: screenY },
                button
            });
            return result;
        }
        catch (error) {
            logger_js_1.logger.error(`Failed to click at (${x}, ${y})`, {
                normalized: { x, y },
                button,
                app: this.currentApp?.name
            }, error instanceof Error ? error : undefined);
            throw new Error(`Failed to click: ${error}`);
        }
    }
    async moveMouse(x, y) {
        if (!this.currentApp) {
            throw new Error('No application focused. Use focusApplication first.');
        }
        try {
            // Convert normalized coordinates to absolute screen coordinates
            const screenX = this.currentApp.bounds.x + (x * this.currentApp.bounds.width);
            const screenY = this.currentApp.bounds.y + (y * this.currentApp.bounds.height);
            await nut_js_1.mouse.setPosition({ x: screenX, y: screenY });
            return {
                content: [
                    {
                        type: 'text',
                        text: `Moved mouse to normalized (${x}, ${y}) -> screen (${Math.round(screenX)}, ${Math.round(screenY)})`,
                    },
                ],
            };
        }
        catch (error) {
            throw new Error(`Failed to move mouse: ${error}`);
        }
    }
    async screenshot(padding, format, quality) {
        if (!this.currentApp) {
            throw new Error('No application focused. Use focusApplication first.');
        }
        try {
            logger_js_1.logger.debug(`Taking screenshot`, {
                padding,
                format,
                quality,
                app: this.currentApp.name
            });
            // Check permissions
            const screenRecordingStatus = await (0, node_mac_permissions_1.checkPermissions)('screen');
            logger_js_1.logger.logPermissionCheck('screen', screenRecordingStatus);
            if (screenRecordingStatus !== 'authorized') {
                throw new Error('Screen Recording permission is required. Please grant permission in System Preferences > Security & Privacy > Privacy > Screen Recording.');
            }
            // Take full screen screenshot
            const fullScreenImage = await (0, screenshot_desktop_1.screenshotDesktop)();
            // Calculate crop area with padding
            const cropX = Math.max(0, this.currentApp.bounds.x - padding);
            const cropY = Math.max(0, this.currentApp.bounds.y - padding);
            const cropWidth = Math.min(fullScreenImage.width - cropX, this.currentApp.bounds.width + (padding * 2));
            const cropHeight = Math.min(fullScreenImage.height - cropY, this.currentApp.bounds.height + (padding * 2));
            // Crop the image
            const croppedImage = await (0, sharp_1.default)(fullScreenImage)
                .extract({
                left: cropX,
                top: cropY,
                width: cropWidth,
                height: cropHeight,
            })
                .toFormat(format, { quality })
                .toBuffer();
            const base64Image = croppedImage.toString('base64');
            const mimeType = format === 'jpg' ? 'image/jpeg' : 'image/png';
            const result = {
                content: [
                    {
                        type: 'text',
                        text: `Screenshot taken of ${this.currentApp.name} (${cropWidth}x${cropHeight}px)`,
                    },
                    {
                        type: 'image',
                        data: base64Image,
                        mimeType: mimeType,
                    },
                ],
            };
            logger_js_1.logger.logAppInteraction('screenshot', this.currentApp, {
                dimensions: { width: cropWidth, height: cropHeight },
                format,
                quality,
                padding
            });
            return result;
        }
        catch (error) {
            logger_js_1.logger.error(`Failed to take screenshot`, {
                app: this.currentApp?.name,
                padding,
                format,
                quality
            }, error instanceof Error ? error : undefined);
            throw new Error(`Failed to take screenshot: ${error}`);
        }
    }
    async getClickableElements() {
        if (!this.currentApp) {
            throw new Error('No application focused. Use focusApplication first.');
        }
        try {
            const currentAppBounds = this.currentApp.bounds;
            const currentAppBundleId = this.currentApp.bundleId;
            const elements = await (0, run_1.run)((appBundleId, appBounds) => {
                const app = Application.currentApplication();
                app.includeStandardAdditions = true;
                const runningApps = Application('System Events').applicationProcesses();
                let targetApp = null;
                // Find the current app
                for (let i = 0; i < runningApps.length; i++) {
                    if (runningApps[i].bundleIdentifier() === appBundleId) {
                        targetApp = runningApps[i];
                        break;
                    }
                }
                if (!targetApp) {
                    throw new Error('Target application not found');
                }
                const elements = [];
                const windows = targetApp.windows();
                if (windows.length > 0) {
                    const window = windows[0];
                    const uiElements = window.UIElements();
                    for (let i = 0; i < uiElements.length; i++) {
                        const element = uiElements[i];
                        const elementType = element.class();
                        const elementText = element.value() || element.title() || '';
                        const elementBounds = element.bounds();
                        const isClickable = element.clickable();
                        const isEnabled = element.enabled();
                        if (isClickable && isEnabled) {
                            elements.push({
                                index: elements.length,
                                type: elementType,
                                text: elementText,
                                bounds: {
                                    x: elementBounds[0],
                                    y: elementBounds[1],
                                    width: elementBounds[2] - elementBounds[0],
                                    height: elementBounds[3] - elementBounds[1],
                                },
                                normalizedPosition: {
                                    x: (elementBounds[0] - appBounds.x) / appBounds.width,
                                    y: (elementBounds[1] - appBounds.y) / appBounds.height,
                                },
                                screenPosition: {
                                    x: elementBounds[0],
                                    y: elementBounds[1],
                                },
                                isClickable: isClickable,
                                isEnabled: isEnabled,
                            });
                        }
                    }
                }
                return elements;
            }, currentAppBundleId, currentAppBounds);
            return {
                content: [
                    {
                        type: 'text',
                        text: `Found ${elements.length} clickable elements in ${this.currentApp.name}:\n\n${elements
                            .map((element) => `${element.index}. "${element.text}" (${element.type})\n   Screen: (${element.screenPosition.x}, ${element.screenPosition.y})\n   Normalized: (${element.normalizedPosition.x.toFixed(3)}, ${element.normalizedPosition.y.toFixed(3)})`)
                            .join('\n\n')}`,
                    },
                ],
            };
        }
        catch (error) {
            throw new Error(`Failed to get clickable elements: ${error}`);
        }
    }
    async clickElement(elementIndex) {
        if (!this.currentApp) {
            throw new Error('No application focused. Use focusApplication first.');
        }
        try {
            const currentAppBounds = this.currentApp.bounds;
            const currentAppBundleId = this.currentApp.bundleId;
            const elements = await (0, run_1.run)((appBundleId, appBounds) => {
                const app = Application.currentApplication();
                app.includeStandardAdditions = true;
                const runningApps = Application('System Events').applicationProcesses();
                let targetApp = null;
                // Find the current app
                for (let i = 0; i < runningApps.length; i++) {
                    if (runningApps[i].bundleIdentifier() === appBundleId) {
                        targetApp = runningApps[i];
                        break;
                    }
                }
                if (!targetApp) {
                    throw new Error('Target application not found');
                }
                const elements = [];
                const windows = targetApp.windows();
                if (windows.length > 0) {
                    const window = windows[0];
                    const uiElements = window.UIElements();
                    for (let i = 0; i < uiElements.length; i++) {
                        const element = uiElements[i];
                        const elementType = element.class();
                        const elementText = element.value() || element.title() || '';
                        const elementBounds = element.bounds();
                        const isClickable = element.clickable();
                        const isEnabled = element.enabled();
                        if (isClickable && isEnabled) {
                            elements.push({
                                index: elements.length,
                                type: elementType,
                                text: elementText,
                                bounds: {
                                    x: elementBounds[0],
                                    y: elementBounds[1],
                                    width: elementBounds[2] - elementBounds[0],
                                    height: elementBounds[3] - elementBounds[1],
                                },
                                normalizedPosition: {
                                    x: (elementBounds[0] - appBounds.x) / appBounds.width,
                                    y: (elementBounds[1] - appBounds.y) / appBounds.height,
                                },
                                screenPosition: {
                                    x: elementBounds[0],
                                    y: elementBounds[1],
                                },
                                isClickable: isClickable,
                                isEnabled: isEnabled,
                            });
                        }
                    }
                }
                return elements;
            }, currentAppBundleId, currentAppBounds);
            if (elementIndex < 0 || elementIndex >= elements.length) {
                throw new Error(`Element index ${elementIndex} is out of range. Available elements: 0-${elements.length - 1}`);
            }
            const element = elements[elementIndex];
            const normalizedX = element.normalizedPosition.x;
            const normalizedY = element.normalizedPosition.y;
            // Use the existing click method
            return await this.click(normalizedX, normalizedY, 'left');
        }
        catch (error) {
            throw new Error(`Failed to click element: ${error}`);
        }
    }
    async findAndCloseApp(appName, force = false) {
        try {
            // First, list all applications to find the target app
            const appsResult = await this.listApplications();
            const appsText = appsResult.content[0].text;
            // Parse the applications from the text output
            const apps = [];
            const lines = appsText.split('\n');
            let currentApp = {};
            for (const line of lines) {
                if (line.startsWith('•')) {
                    if (currentApp.name) {
                        apps.push(currentApp);
                    }
                    const match = line.match(/• (.+?) \((.+?)\)/);
                    if (match) {
                        currentApp = {
                            name: match[1],
                            bundleId: match[2],
                            pid: 0,
                            bounds: { x: 0, y: 0, width: 0, height: 0 }
                        };
                    }
                }
                else if (line.includes('PID:')) {
                    const pidMatch = line.match(/PID: (\d+)/);
                    if (pidMatch) {
                        currentApp.pid = parseInt(pidMatch[1]);
                    }
                }
                else if (line.includes('Bounds:')) {
                    const boundsMatch = line.match(/Bounds: (\d+)x(\d+) at \(([^,]+), ([^)]+)\)/);
                    if (boundsMatch) {
                        currentApp.bounds = {
                            width: parseInt(boundsMatch[1]),
                            height: parseInt(boundsMatch[2]),
                            x: parseInt(boundsMatch[3]),
                            y: parseInt(boundsMatch[4])
                        };
                    }
                }
            }
            if (currentApp.name) {
                apps.push(currentApp);
            }
            // Find the target application
            const targetApp = apps.find(app => app.name.toLowerCase().includes(appName.toLowerCase()) ||
                app.bundleId.toLowerCase().includes(appName.toLowerCase()));
            if (!targetApp) {
                return {
                    content: [
                        {
                            type: 'text',
                            text: `Application "${appName}" not found. Available applications:\n\n${apps.map(app => `• ${app.name} (${app.bundleId})`).join('\n')}`,
                        },
                    ],
                };
            }
            // Close the application
            const closeResult = await this.closeApp(targetApp.bundleId, force);
            return {
                content: [
                    {
                        type: 'text',
                        text: `🎯 MCP-EYES: Successfully found and closed "${targetApp.name}" (${targetApp.bundleId})\n\n${closeResult.content[0].text}`,
                    },
                ],
            };
        }
        catch (error) {
            throw new Error(`Failed to find and close application: ${error}`);
        }
    }
    async run() {
        try {
            logger_js_1.logger.logServerEvent('Starting BasicServer');
            const transport = new stdio_js_1.StdioServerTransport();
            await this.server.connect(transport);
            logger_js_1.logger.logServerEvent('BasicServer connected to stdio transport');
            console.error('MCP Eyes Basic Server running on stdio');
        }
        catch (error) {
            logger_js_1.logger.error('Failed to start BasicServer', { error: error instanceof Error ? error.message : String(error) }, error instanceof Error ? error : undefined);
            throw error;
        }
    }
}
const server = new BasicServer();
server.run().catch((error) => {
    logger_js_1.logger.logCrash(error instanceof Error ? error : new Error(String(error)), {
        context: 'BasicServer startup'
    });
    console.error('MCP Eyes Basic Server failed to start:', error);
    process.exit(1);
});
//# sourceMappingURL=basic-server.js.map