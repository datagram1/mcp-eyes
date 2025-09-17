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
class AdvancedServerSimple {
    server;
    currentApp = null;
    constructor() {
        this.server = new index_js_1.Server({
            name: 'mcp-eyes-advanced',
            version: '1.1.9',
        });
        this.setupToolHandlers();
        this.setupErrorHandling();
    }
    setupErrorHandling() {
        this.server.onerror = (error) => {
            console.error('[MCP Error]', error);
        };
        process.on('SIGINT', async () => {
            await this.server.close();
            process.exit(0);
        });
    }
    setupToolHandlers() {
        this.server.setRequestHandler(types_js_1.ListToolsRequestSchema, async () => {
            return {
                tools: [
                    // Basic Tools
                    {
                        name: 'listApplications',
                        description: 'List all running applications with their window bounds and identifiers.',
                        inputSchema: {
                            type: 'object',
                            properties: {},
                        },
                    },
                    {
                        name: 'focusApplication',
                        description: 'Focus on a specific application by bundle ID or PID.',
                        inputSchema: {
                            type: 'object',
                            properties: {
                                identifier: {
                                    type: 'string',
                                    description: 'Bundle ID (e.g., com.apple.Safari) or PID of the application to focus',
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
                    // Apple Accessibility Tools
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
                    // Advanced Tools
                    {
                        name: 'typeText',
                        description: 'Type text at the current cursor position.',
                        inputSchema: {
                            type: 'object',
                            properties: {
                                text: {
                                    type: 'string',
                                    description: 'Text to type',
                                },
                                clearFirst: {
                                    type: 'boolean',
                                    description: 'Clear existing text before typing',
                                    default: false,
                                },
                            },
                            required: ['text'],
                        },
                    },
                    {
                        name: 'pressKey',
                        description: 'Press key combinations.',
                        inputSchema: {
                            type: 'object',
                            properties: {
                                key: {
                                    type: 'string',
                                    description: 'Key combination (e.g., "Cmd+A", "Enter", "Tab")',
                                },
                            },
                            required: ['key'],
                        },
                    },
                    {
                        name: 'doubleClick',
                        description: 'Perform a double-click at specified coordinates.',
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
                        name: 'scrollMouse',
                        description: 'Scroll the mouse wheel.',
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
                                    description: 'Scroll amount (positive for up, negative for down)',
                                    default: 3,
                                },
                            },
                            required: ['direction'],
                        },
                    },
                    {
                        name: 'getMousePosition',
                        description: 'Get the current mouse position.',
                        inputSchema: {
                            type: 'object',
                            properties: {},
                        },
                    },
                    {
                        name: 'wait',
                        description: 'Wait for a specified amount of time.',
                        inputSchema: {
                            type: 'object',
                            properties: {
                                milliseconds: {
                                    type: 'number',
                                    description: 'Time to wait in milliseconds',
                                    default: 1000,
                                },
                            },
                        },
                    },
                ],
            };
        });
        this.server.setRequestHandler(types_js_1.CallToolRequestSchema, async (request) => {
            const { name, arguments: args } = request.params;
            try {
                switch (name) {
                    // Basic Tools
                    case 'listApplications':
                        return await this.listApplications();
                    case 'focusApplication':
                        return await this.focusApplication(args?.identifier);
                    case 'click':
                        return await this.click(args?.x, args?.y, args?.button || 'left');
                    case 'moveMouse':
                        return await this.moveMouse(args?.x, args?.y);
                    case 'screenshot':
                        return await this.screenshot(args?.padding || 10, args?.format || 'png', args?.quality || 90);
                    // Apple Accessibility Tools
                    case 'getClickableElements':
                        return await this.getClickableElements();
                    case 'clickElement':
                        return await this.clickElement(args?.elementIndex);
                    // Advanced Tools
                    case 'typeText':
                        return await this.typeText(args?.text, args?.clearFirst || false);
                    case 'pressKey':
                        return await this.pressKey(args?.key);
                    case 'doubleClick':
                        return await this.doubleClick(args?.x, args?.y);
                    case 'scrollMouse':
                        return await this.scrollMouse(args?.direction, args?.amount || 3);
                    case 'getMousePosition':
                        return await this.getMousePosition();
                    case 'wait':
                        return await this.wait(args?.milliseconds || 1000);
                    default:
                        throw new Error(`Unknown tool: ${name}`);
                }
            }
            catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);
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
    // Basic Tools Implementation (same as basic server)
    async listApplications() {
        try {
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
            return {
                content: [
                    {
                        type: 'text',
                        text: `Found ${apps.length} running applications:\n\n${apps
                            .map((app) => `• ${app.name} (${app.bundleId})\n  PID: ${app.pid}\n  Bounds: ${app.bounds.width}x${app.bounds.height} at (${app.bounds.x}, ${app.bounds.y})`)
                            .join('\n\n')}`,
                    },
                ],
            };
        }
        catch (error) {
            throw new Error(`Failed to list applications: ${error}`);
        }
    }
    async focusApplication(identifier) {
        try {
            const appInfo = await (0, run_1.run)((identifier) => {
                const app = Application.currentApplication();
                app.includeStandardAdditions = true;
                // Try to find app by bundle ID first, then by name
                const runningApps = Application('System Events').applicationProcesses();
                let targetApp = null;
                for (let i = 0; i < runningApps.length; i++) {
                    const appBundleId = runningApps[i].bundleIdentifier();
                    const appName = runningApps[i].name();
                    if (appBundleId === identifier || appName === identifier) {
                        targetApp = runningApps[i];
                        break;
                    }
                }
                if (!targetApp) {
                    throw new Error(`Application not found: ${identifier}`);
                }
                // Activate the application
                targetApp.activate();
                // Get updated bounds after activation
                const windows = targetApp.windows();
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
                return {
                    name: targetApp.name(),
                    bundleId: targetApp.bundleIdentifier(),
                    pid: targetApp.unixId(),
                    bounds: bounds,
                };
            }, identifier);
            this.currentApp = appInfo;
            return {
                content: [
                    {
                        type: 'text',
                        text: `Focused on ${appInfo.name} (${appInfo.bundleId})\nPID: ${appInfo.pid}\nBounds: ${appInfo.bounds.width}x${appInfo.bounds.height} at (${appInfo.bounds.x}, ${appInfo.bounds.y})`,
                    },
                ],
            };
        }
        catch (error) {
            throw new Error(`Failed to focus application: ${error}`);
        }
    }
    async click(x, y, button) {
        if (!this.currentApp) {
            throw new Error('No application focused. Use focusApplication first.');
        }
        try {
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
            return {
                content: [
                    {
                        type: 'text',
                        text: `Clicked ${button} button at normalized (${x}, ${y}) -> screen (${Math.round(screenX)}, ${Math.round(screenY)})`,
                    },
                ],
            };
        }
        catch (error) {
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
            // Check permissions
            const screenRecordingStatus = await (0, node_mac_permissions_1.checkPermissions)('screen');
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
            return {
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
        }
        catch (error) {
            throw new Error(`Failed to take screenshot: ${error}`);
        }
    }
    // Apple Accessibility Tools Implementation (same as basic server)
    async getClickableElements() {
        if (!this.currentApp) {
            throw new Error('No application focused. Use focusApplication first.');
        }
        try {
            const elements = await (0, run_1.run)(() => {
                const app = Application.currentApplication();
                app.includeStandardAdditions = true;
                const runningApps = Application('System Events').applicationProcesses();
                let targetApp = null;
                // Find the current app
                for (let i = 0; i < runningApps.length; i++) {
                    if (runningApps[i].bundleIdentifier() === this.currentApp.bundleId) {
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
                                    x: (elementBounds[0] - this.currentApp.bounds.x) / this.currentApp.bounds.width,
                                    y: (elementBounds[1] - this.currentApp.bounds.y) / this.currentApp.bounds.height,
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
            });
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
            const elements = await (0, run_1.run)(() => {
                const app = Application.currentApplication();
                app.includeStandardAdditions = true;
                const runningApps = Application('System Events').applicationProcesses();
                let targetApp = null;
                // Find the current app
                for (let i = 0; i < runningApps.length; i++) {
                    if (runningApps[i].bundleIdentifier() === this.currentApp.bundleId) {
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
                                    x: (elementBounds[0] - this.currentApp.bounds.x) / this.currentApp.bounds.width,
                                    y: (elementBounds[1] - this.currentApp.bounds.y) / this.currentApp.bounds.height,
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
            });
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
    // Advanced Tools Implementation
    async typeText(text, clearFirst) {
        try {
            if (clearFirst) {
                await nut_js_1.keyboard.pressKey(nut_js_1.Key.LeftCmd, nut_js_1.Key.A);
                await nut_js_1.keyboard.pressKey(nut_js_1.Key.Delete);
            }
            await nut_js_1.keyboard.type(text);
            return {
                content: [
                    {
                        type: 'text',
                        text: `Typed "${text}"${clearFirst ? ' (cleared existing text first)' : ''}`,
                    },
                ],
            };
        }
        catch (error) {
            throw new Error(`Failed to type text: ${error}`);
        }
    }
    async pressKey(key) {
        try {
            // Map common key combinations
            const keyMap = {
                'Cmd+A': [nut_js_1.Key.LeftCmd, nut_js_1.Key.A],
                'Cmd+C': [nut_js_1.Key.LeftCmd, nut_js_1.Key.C],
                'Cmd+V': [nut_js_1.Key.LeftCmd, nut_js_1.Key.V],
                'Cmd+Z': [nut_js_1.Key.LeftCmd, nut_js_1.Key.Z],
                'Enter': [nut_js_1.Key.Enter],
                'Tab': [nut_js_1.Key.Tab],
                'Escape': [nut_js_1.Key.Escape],
                'Space': [nut_js_1.Key.Space],
            };
            const keys = keyMap[key];
            if (!keys) {
                throw new Error(`Unknown key combination: ${key}`);
            }
            await nut_js_1.keyboard.pressKey(...keys);
            return {
                content: [
                    {
                        type: 'text',
                        text: `Pressed key combination: ${key}`,
                    },
                ],
            };
        }
        catch (error) {
            throw new Error(`Failed to press key: ${error}`);
        }
    }
    async doubleClick(x, y) {
        if (!this.currentApp) {
            throw new Error('No application focused. Use focusApplication first.');
        }
        try {
            // Convert normalized coordinates to absolute screen coordinates
            const screenX = this.currentApp.bounds.x + (x * this.currentApp.bounds.width);
            const screenY = this.currentApp.bounds.y + (y * this.currentApp.bounds.height);
            await nut_js_1.mouse.setPosition({ x: screenX, y: screenY });
            await nut_js_1.mouse.doubleClick(nut_js_1.Button.LEFT);
            return {
                content: [
                    {
                        type: 'text',
                        text: `Double-clicked at normalized (${x}, ${y}) -> screen (${Math.round(screenX)}, ${Math.round(screenY)})`,
                    },
                ],
            };
        }
        catch (error) {
            throw new Error(`Failed to double-click: ${error}`);
        }
    }
    async scrollMouse(direction, amount) {
        try {
            const scrollAmount = direction === 'up' ? amount : -amount;
            await nut_js_1.mouse.scrollUp(scrollAmount);
            return {
                content: [
                    {
                        type: 'text',
                        text: `Scrolled mouse ${direction} by ${amount} units`,
                    },
                ],
            };
        }
        catch (error) {
            throw new Error(`Failed to scroll mouse: ${error}`);
        }
    }
    async getMousePosition() {
        try {
            const position = await nut_js_1.mouse.getPosition();
            return {
                content: [
                    {
                        type: 'text',
                        text: `Current mouse position: (${position.x}, ${position.y})`,
                    },
                ],
            };
        }
        catch (error) {
            throw new Error(`Failed to get mouse position: ${error}`);
        }
    }
    async wait(milliseconds) {
        return new Promise((resolve) => {
            setTimeout(() => {
                resolve({
                    content: [
                        {
                            type: 'text',
                            text: `Waited for ${milliseconds} milliseconds`,
                        },
                    ],
                });
            }, milliseconds);
        });
    }
    async run() {
        const transport = new stdio_js_1.StdioServerTransport();
        await this.server.connect(transport);
        console.error('MCP Eyes Advanced Server running on stdio');
    }
}
const server = new AdvancedServerSimple();
server.run().catch(console.error);
//# sourceMappingURL=advanced-server-simple.js.map