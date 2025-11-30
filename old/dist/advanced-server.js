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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const index_js_1 = require("@modelcontextprotocol/sdk/server/index.js");
const stdio_js_1 = require("@modelcontextprotocol/sdk/server/stdio.js");
const types_js_1 = require("@modelcontextprotocol/sdk/types.js");
// @ts-ignore
const screenshot_desktop_1 = __importDefault(require("screenshot-desktop"));
const nut_js_1 = require("@nut-tree-fork/nut-js");
const jxa_runner_js_1 = require("./jxa-runner.js");
const sharp_1 = __importDefault(require("sharp"));
// @ts-ignore
const node_mac_permissions_1 = require("node-mac-permissions");
const apple_window_manager_js_1 = require("./apple-window-manager.js");
const ocr_analyzer_js_1 = require("./ocr-analyzer.js");
const local_llm_analyzer_js_1 = require("./local-llm-analyzer.js");
const web_content_detector_js_1 = require("./web-content-detector.js");
const window_bounds_helper_js_1 = require("./window-bounds-helper.js");
const browser_bridge_js_1 = require("./browser-bridge.js");
class AdvancedServer {
    server;
    currentApp = null;
    appleWindowManager;
    ocrAnalyzer;
    localLLMAnalyzer;
    webContentDetector;
    browserBridge;
    browserWatch = {
        enabled: false,
        browser: 'firefox',
        autoFillRules: [],
        events: [],
        startTime: 0,
    };
    constructor() {
        this.server = new index_js_1.Server({
            name: 'mcp-eyes-advanced',
            version: '1.1.15',
        });
        this.appleWindowManager = new apple_window_manager_js_1.AppleWindowManager();
        this.ocrAnalyzer = new ocr_analyzer_js_1.OCRAnalyzer();
        this.localLLMAnalyzer = new local_llm_analyzer_js_1.LocalLLMAnalyzer();
        this.webContentDetector = new web_content_detector_js_1.WebContentDetector();
        this.browserBridge = (0, browser_bridge_js_1.getGlobalBrowserBridge)();
        this.setupToolHandlers();
        this.setupErrorHandling();
        this.setupBrowserBridge();
    }
    setupBrowserBridge() {
        // Start the socket server for browser extension communication
        this.browserBridge.startServer().then(() => {
            console.error('[MCP Eyes] Browser bridge socket server started');
        }).catch((err) => {
            console.error('[MCP Eyes] Failed to start browser bridge:', err.message);
        });
        // Handle browser events
        this.browserBridge.on('browserEvent', (event) => {
            if (this.browserWatch.enabled) {
                this.browserWatch.events.push(event);
                console.error(`[MCP Eyes] Browser event captured: ${event.event}`);
                // Process auto-fill rules if this is a DOM change with forms
                if (event.event === 'domChanged' && event.payload?.forms) {
                    this.processAutoFillRulesViaSocket(event.payload.forms);
                }
            }
        });
        this.browserBridge.on('clientConnected', () => {
            console.error('[MCP Eyes] Browser extension connected via socket');
        });
        this.browserBridge.on('clientDisconnected', () => {
            console.error('[MCP Eyes] Browser extension disconnected');
        });
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
                    // AI Analysis Tools
                    {
                        name: 'analyzeImageWithAI',
                        description: 'Analyze a screenshot using AI to find UI elements and their locations.',
                        inputSchema: {
                            type: 'object',
                            properties: {
                                prompt: {
                                    type: 'string',
                                    description: 'What to look for in the image (e.g., "Find the Update Available button")',
                                },
                                padding: {
                                    type: 'number',
                                    description: 'Padding around the window in pixels',
                                    default: 10,
                                },
                            },
                            required: ['prompt'],
                        },
                    },
                    {
                        name: 'findAndClickElement',
                        description: 'Find and click an element using AI analysis with fallback methods.',
                        inputSchema: {
                            type: 'object',
                            properties: {
                                elementDescription: {
                                    type: 'string',
                                    description: 'Description of the element to find and click',
                                },
                                padding: {
                                    type: 'number',
                                    description: 'Padding around the window in pixels',
                                    default: 10,
                                },
                            },
                            required: ['elementDescription'],
                        },
                    },
                    // OCR Tools
                    {
                        name: 'analyzeImageWithOCR',
                        description: 'Analyze a screenshot using OCR to find text and buttons.',
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
                    // Web Content Tools
                    {
                        name: 'getWebElements',
                        description: 'Get web elements (links, buttons, inputs) from the focused browser.',
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
                        name: 'clickWebElement',
                        description: 'Click a web element by index from getWebElements.',
                        inputSchema: {
                            type: 'object',
                            properties: {
                                elementIndex: {
                                    type: 'number',
                                    description: 'Index of the web element to click',
                                },
                            },
                            required: ['elementIndex'],
                        },
                    },
                    {
                        name: 'findAndClickWebElement',
                        description: 'Find and click a web element by text or description.',
                        inputSchema: {
                            type: 'object',
                            properties: {
                                elementDescription: {
                                    type: 'string',
                                    description: 'Text or description of the web element to find',
                                },
                                padding: {
                                    type: 'number',
                                    description: 'Padding around the window in pixels',
                                    default: 10,
                                },
                            },
                            required: ['elementDescription'],
                        },
                    },
                    // Text Input Tools
                    {
                        name: 'typeText',
                        description: 'Type text into a focused input field.',
                        inputSchema: {
                            type: 'object',
                            properties: {
                                appName: {
                                    type: 'string',
                                    description: 'Name of the application to type into',
                                },
                                elementIndex: {
                                    type: 'number',
                                    description: 'Index of the input element (from getWebElements)',
                                },
                                text: {
                                    type: 'string',
                                    description: 'Text to type',
                                },
                                clearFirst: {
                                    type: 'boolean',
                                    description: 'Clear existing text before typing',
                                    default: true,
                                },
                            },
                            required: ['appName', 'elementIndex', 'text'],
                        },
                    },
                    {
                        name: 'googleSearch',
                        description: 'Perform a complete Google search workflow.',
                        inputSchema: {
                            type: 'object',
                            properties: {
                                appName: {
                                    type: 'string',
                                    description: 'Name of the browser application',
                                    default: 'Google Chrome',
                                },
                                searchQuery: {
                                    type: 'string',
                                    description: 'Search query to type',
                                },
                                searchButtonText: {
                                    type: 'string',
                                    description: 'Text of the search button to click',
                                    default: 'Google Search',
                                },
                            },
                            required: ['searchQuery'],
                        },
                    },
                    // Utility Tools
                    {
                        name: 'testAnalysisMethods',
                        description: 'Test all analysis methods (Accessibility, AI, OCR) on the current screen.',
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
                        name: 'getAvailableLLMProviders',
                        description: 'Get list of available LLM providers and their status.',
                        inputSchema: {
                            type: 'object',
                            properties: {},
                        },
                    },
                    {
                        name: 'requestAccessibilityPermission',
                        description: '🎯 MCP-EYES: Request macOS Accessibility permission. This will open System Settings to the Accessibility section and prompt the user to grant permission. Required for full functionality including window bounds and element detection.',
                        inputSchema: {
                            type: 'object',
                            properties: {},
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
                    {
                        name: 'healthCheck',
                        description: '🎯 MCP-EYES: Check service health including screen lock status, permissions, and system readiness. Use this to detect if the screen is locked before attempting automation.',
                        inputSchema: {
                            type: 'object',
                            properties: {},
                        },
                    },
                    // Browser Extension Tools
                    {
                        name: 'watchBrowser',
                        description: '🎯 MCP-EYES: Start watching a browser tab for DOM changes. When forms or inputs appear, you will be notified. Requires the MCP-Eyes browser extension.',
                        inputSchema: {
                            type: 'object',
                            properties: {
                                browser: {
                                    type: 'string',
                                    description: 'Browser to watch (firefox, chrome, safari)',
                                    default: 'firefox',
                                },
                                autoFillRules: {
                                    type: 'array',
                                    description: 'Rules for auto-filling forms when they appear',
                                    items: {
                                        type: 'object',
                                        properties: {
                                            fieldMatch: {
                                                type: 'string',
                                                description: 'Field name/id/placeholder pattern to match',
                                            },
                                            value: {
                                                type: 'string',
                                                description: 'Value to fill',
                                            },
                                        },
                                    },
                                },
                            },
                        },
                    },
                    {
                        name: 'stopWatchingBrowser',
                        description: '🎯 MCP-EYES: Stop watching the browser for DOM changes.',
                        inputSchema: {
                            type: 'object',
                            properties: {},
                        },
                    },
                    {
                        name: 'getBrowserEvents',
                        description: '🎯 MCP-EYES: Get pending browser events (DOM changes, form appearances, etc.).',
                        inputSchema: {
                            type: 'object',
                            properties: {
                                clear: {
                                    type: 'boolean',
                                    description: 'Clear events after reading (default: true)',
                                    default: true,
                                },
                            },
                        },
                    },
                    {
                        name: 'fillBrowserForm',
                        description: '🎯 MCP-EYES: Fill form fields in the browser via extension (more reliable than screen-based).',
                        inputSchema: {
                            type: 'object',
                            properties: {
                                fields: {
                                    type: 'array',
                                    description: 'Fields to fill',
                                    items: {
                                        type: 'object',
                                        properties: {
                                            selector: {
                                                type: 'string',
                                                description: 'CSS selector or field name/id',
                                            },
                                            value: {
                                                type: 'string',
                                                description: 'Value to fill',
                                            },
                                        },
                                    },
                                },
                                submit: {
                                    type: 'boolean',
                                    description: 'Submit the form after filling (default: false)',
                                    default: false,
                                },
                            },
                            required: ['fields'],
                        },
                    },
                ],
            };
        });
        this.server.setRequestHandler(types_js_1.CallToolRequestSchema, async (request) => {
            const { name, arguments: args = {} } = request.params;
            const typedArgs = args;
            // Tools that can run even when screen is locked
            const bypassHealthCheckTools = [
                'healthCheck',
                'listApplications',
                'getAvailableLLMProviders',
                'requestAccessibilityPermission',
            ];
            // Check system health before executing tools that require screen access
            if (!bypassHealthCheckTools.includes(name)) {
                const healthStatus = await this.quickHealthCheck();
                if (!healthStatus.ready) {
                    return {
                        content: [
                            {
                                type: 'text',
                                text: `🚫 Tool "${name}" blocked - system not ready for automation\n\n${healthStatus.reason}\n\n💡 Recommendation: ${healthStatus.recommendation}\n\nUse the "healthCheck" tool for detailed status.`,
                            },
                        ],
                        isError: true,
                    };
                }
            }
            try {
                switch (name) {
                    // Basic Tools
                    case 'listApplications':
                        return await this.listApplications();
                    case 'focusApplication':
                        return await this.focusApplication(typedArgs.identifier);
                    case 'closeApp':
                        return await this.closeApp(typedArgs.identifier, typedArgs.force || false);
                    case 'click':
                        return await this.click(typedArgs.x, typedArgs.y, typedArgs.button || 'left');
                    case 'moveMouse':
                        return await this.moveMouse(typedArgs.x, typedArgs.y);
                    case 'screenshot':
                        return await this.screenshot(typedArgs.padding || 10, typedArgs.format || 'png', typedArgs.quality || 90);
                    // Apple Accessibility Tools
                    case 'getClickableElements':
                        return await this.getClickableElements();
                    case 'clickElement':
                        return await this.clickElement(typedArgs.elementIndex);
                    // AI Analysis Tools
                    case 'analyzeImageWithAI':
                        return await this.analyzeImageWithAI(typedArgs.prompt, typedArgs.padding || 10);
                    case 'findAndClickElement':
                        return await this.findAndClickElement(typedArgs.elementDescription, typedArgs.padding || 10);
                    // OCR Tools
                    case 'analyzeImageWithOCR':
                        return await this.analyzeImageWithOCR(typedArgs.padding || 10);
                    // Web Content Tools
                    case 'getWebElements':
                        return await this.getWebElements(typedArgs.padding || 10);
                    case 'clickWebElement':
                        return await this.clickWebElement(typedArgs.elementIndex);
                    case 'findAndClickWebElement':
                        return await this.findAndClickWebElement(typedArgs.elementDescription, typedArgs.padding || 10);
                    // Text Input Tools
                    case 'typeText':
                        return await this.typeText(typedArgs.appName, typedArgs.elementIndex, typedArgs.text, typedArgs.clearFirst !== false);
                    case 'googleSearch':
                        return await this.googleSearch(typedArgs.appName || 'Google Chrome', typedArgs.searchQuery, typedArgs.searchButtonText || 'Google Search');
                    // Utility Tools
                    case 'testAnalysisMethods':
                        return await this.testAnalysisMethods(typedArgs.padding || 10);
                    case 'getAvailableLLMProviders':
                        return await this.getAvailableLLMProviders();
                    case 'requestAccessibilityPermission':
                        return await this.requestAccessibilityPermission();
                    case 'findAndCloseApp':
                        return await this.findAndCloseApp(typedArgs.appName, typedArgs.force || false);
                    case 'healthCheck':
                        return await this.healthCheck();
                    // Browser Extension Tools
                    case 'watchBrowser':
                        return await this.watchBrowser(typedArgs.browser || 'firefox', typedArgs.autoFillRules);
                    case 'stopWatchingBrowser':
                        return await this.stopWatchingBrowser();
                    case 'getBrowserEvents':
                        return await this.getBrowserEvents(typedArgs.clear !== false);
                    case 'fillBrowserForm':
                        return await this.fillBrowserForm(typedArgs.fields, typedArgs.submit || false);
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
    // Basic Tools Implementation
    async listApplications() {
        // Try JXA method first
        try {
            const apps = await (0, jxa_runner_js_1.run)(() => {
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
        catch (jxaError) {
            // Fallback to lsappinfo which doesn't require Accessibility permissions
            console.error('JXA method failed, falling back to lsappinfo:', jxaError);
            return await this.listApplicationsWithLsappinfo();
        }
    }
    /**
     * Fallback method using lsappinfo (doesn't require Accessibility permissions)
     */
    async listApplicationsWithLsappinfo() {
        const { exec } = await Promise.resolve().then(() => __importStar(require('child_process')));
        const { promisify } = await Promise.resolve().then(() => __importStar(require('util')));
        const execAsync = promisify(exec);
        try {
            const { stdout } = await execAsync('lsappinfo list');
            const apps = [];
            // Parse lsappinfo output
            const appBlocks = stdout.split(/\n\s*\d+\)\s+/).filter(block => block.trim());
            for (const block of appBlocks) {
                const nameMatch = block.match(/^"([^"]+)"/);
                const bundleIdMatch = block.match(/bundleID="([^"]+)"/);
                const pidMatch = block.match(/pid\s*=\s*(\d+)/);
                if (nameMatch) {
                    apps.push({
                        name: nameMatch[1],
                        bundleId: bundleIdMatch ? bundleIdMatch[1] : 'unknown',
                        pid: pidMatch ? parseInt(pidMatch[1]) : 0,
                        bounds: { x: 0, y: 0, width: 0, height: 0 }, // lsappinfo doesn't provide window bounds
                    });
                }
            }
            // Filter out background-only processes and system services
            const visibleApps = apps.filter(app => app.bundleId !== 'unknown' &&
                !app.bundleId.startsWith('com.apple.ViewBridge') &&
                app.name !== 'loginwindow');
            return {
                content: [
                    {
                        type: 'text',
                        text: `Found ${visibleApps.length} running applications (via lsappinfo fallback - window bounds not available):\n\n${visibleApps
                            .map((app) => `• ${app.name} (${app.bundleId})\n  PID: ${app.pid}`)
                            .join('\n\n')}`,
                    },
                ],
            };
        }
        catch (error) {
            throw new Error(`Failed to list applications: Both JXA and lsappinfo methods failed. ${error}`);
        }
    }
    async focusApplication(identifier) {
        try {
            // Use the same approach as listApplications for consistency
            const apps = await (0, jxa_runner_js_1.run)(() => {
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
            await (0, jxa_runner_js_1.run)((bundleId) => {
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
            return {
                content: [
                    {
                        type: 'text',
                        text: `🎯 MCP-EYES: Successfully focused on ${targetApp.name} (${targetApp.bundleId})\nPID: ${targetApp.pid}\nBounds: ${targetApp.bounds.width}x${targetApp.bounds.height} at (${targetApp.bounds.x}, ${targetApp.bounds.y})\n\nApp is now ready for screenshots and interactions.`,
                    },
                ],
            };
        }
        catch (error) {
            throw new Error(`Failed to focus application: ${error}`);
        }
    }
    async closeApp(identifier, force = false) {
        try {
            const result = await (0, jxa_runner_js_1.run)((identifier, force) => {
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
            const typedResult = result;
            // Clear current app if it was the one being closed
            if (this.currentApp &&
                (this.currentApp.bundleId === typedResult.appInfo.bundleId ||
                    this.currentApp.pid === typedResult.appInfo.pid)) {
                this.currentApp = null;
            }
            return {
                content: [
                    {
                        type: 'text',
                        text: `${typedResult.message}\nMethod: ${typedResult.method}\nApp: ${typedResult.appInfo.name} (${typedResult.appInfo.bundleId})\nPID: ${typedResult.appInfo.pid}`,
                    },
                ],
            };
        }
        catch (error) {
            throw new Error(`Failed to close application: ${error}`);
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
            const fullScreenImage = await (0, screenshot_desktop_1.default)();
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
    // Apple Accessibility Tools Implementation
    async getClickableElements() {
        if (!this.currentApp) {
            throw new Error('No application focused. Use focusApplication first.');
        }
        try {
            const elements = await this.appleWindowManager.getClickableElements(this.currentApp.name);
            return {
                content: [
                    {
                        type: 'text',
                        text: `Found ${elements.length} clickable elements in ${this.currentApp.name}:\n\n${elements
                            .map((element, index) => `${index}. "${element.text}" (${element.type})\n   Screen: (${element.screenPosition.x}, ${element.screenPosition.y})\n   Normalized: (${element.normalizedPosition.x.toFixed(3)}, ${element.normalizedPosition.y.toFixed(3)})`)
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
            const elements = await this.appleWindowManager.getClickableElements(this.currentApp.name);
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
    // AI Analysis Tools Implementation
    async analyzeImageWithAI(prompt, padding) {
        if (!this.currentApp) {
            throw new Error('No application focused. Use focusApplication first.');
        }
        try {
            // Take screenshot first
            const screenshotResult = await this.screenshot(padding, 'png', 90);
            const imageData = screenshotResult.content[1].data;
            // Analyze with AI
            const analysis = await this.localLLMAnalyzer.analyzeImage(imageData, prompt);
            return {
                content: [
                    {
                        type: 'text',
                        text: `AI Analysis Results:\n\n${analysis}`,
                    },
                ],
            };
        }
        catch (error) {
            throw new Error(`Failed to analyze image with AI: ${error}`);
        }
    }
    async findAndClickElement(elementDescription, padding) {
        if (!this.currentApp) {
            throw new Error('No application focused. Use focusApplication first.');
        }
        try {
            // Try Apple Accessibility first
            try {
                const elements = await this.appleWindowManager.getClickableElements(this.currentApp.name);
                const matchingElement = elements.find((element) => element.text.toLowerCase().includes(elementDescription.toLowerCase()));
                if (matchingElement) {
                    const normalizedX = matchingElement.normalizedPosition.x;
                    const normalizedY = matchingElement.normalizedPosition.y;
                    await this.click(normalizedX, normalizedY, 'left');
                    return {
                        content: [
                            {
                                type: 'text',
                                text: `Found and clicked "${matchingElement.text}" using Apple Accessibility at normalized (${normalizedX.toFixed(3)}, ${normalizedY.toFixed(3)})`,
                            },
                        ],
                    };
                }
            }
            catch (accessibilityError) {
                console.log('Apple Accessibility failed, trying AI analysis...');
            }
            // Fallback to AI analysis
            const analysis = await this.analyzeImageWithAI(`Find and click the "${elementDescription}" element`, padding);
            return {
                content: [
                    {
                        type: 'text',
                        text: `AI Analysis completed. Please review the results and use click() with the provided coordinates.`,
                    },
                ],
            };
        }
        catch (error) {
            throw new Error(`Failed to find and click element: ${error}`);
        }
    }
    // OCR Tools Implementation
    async analyzeImageWithOCR(padding) {
        if (!this.currentApp) {
            throw new Error('No application focused. Use focusApplication first.');
        }
        try {
            // Take screenshot first
            const screenshotResult = await this.screenshot(padding, 'png', 90);
            const imageData = screenshotResult.content[1].data;
            // Analyze with OCR
            const analysis = await this.ocrAnalyzer.analyzeImage(imageData);
            return {
                content: [
                    {
                        type: 'text',
                        text: `OCR Analysis Results:\n\n${analysis}`,
                    },
                ],
            };
        }
        catch (error) {
            throw new Error(`Failed to analyze image with OCR: ${error}`);
        }
    }
    // Web Content Tools Implementation
    async getWebElements(padding) {
        if (!this.currentApp) {
            throw new Error('No application focused. Use focusApplication first.');
        }
        try {
            // Take screenshot first
            const screenshotResult = await this.screenshot(padding, 'png', 90);
            const imageData = screenshotResult.content[1].data;
            // Analyze web content
            const elements = await this.webContentDetector.analyzeImage(imageData);
            return {
                content: [
                    {
                        type: 'text',
                        text: `Web Elements for ${this.currentApp.name}:\n\nWindow bounds: ${this.currentApp.bounds.width}x${this.currentApp.bounds.height} at (${this.currentApp.bounds.x}, ${this.currentApp.bounds.y})\n\nFound ${elements.length} web elements:\n\n${elements
                            .map((element, index) => `${index}. "${element.text}" (${element.type}) - Screen: (${element.screenPosition.x}, ${element.screenPosition.y}) | Normalized: (${element.normalizedPosition.x.toFixed(3)}, ${element.normalizedPosition.y.toFixed(3)}) | Confidence: ${element.confidence} | Method: ${element.detectionMethod}`)
                            .join('\n')}`,
                    },
                ],
            };
        }
        catch (error) {
            throw new Error(`Failed to get web elements: ${error}`);
        }
    }
    async clickWebElement(elementIndex) {
        if (!this.currentApp) {
            throw new Error('No application focused. Use focusApplication first.');
        }
        try {
            // Get web elements
            const screenshotResult = await this.screenshot(10, 'png', 90);
            const imageData = screenshotResult.content[1].data;
            const elements = await this.webContentDetector.analyzeImage(imageData);
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
            throw new Error(`Failed to click web element: ${error}`);
        }
    }
    async findAndClickWebElement(elementDescription, padding) {
        if (!this.currentApp) {
            throw new Error('No application focused. Use focusApplication first.');
        }
        try {
            // Get web elements
            const screenshotResult = await this.screenshot(padding, 'png', 90);
            const imageData = screenshotResult.content[1].data;
            const elements = await this.webContentDetector.analyzeImage(imageData);
            // Find matching element
            const matchingElement = elements.find((element) => element.text.toLowerCase().includes(elementDescription.toLowerCase()));
            if (!matchingElement) {
                throw new Error(`Web element "${elementDescription}" not found`);
            }
            const normalizedX = matchingElement.normalizedPosition.x;
            const normalizedY = matchingElement.normalizedPosition.y;
            await this.click(normalizedX, normalizedY, 'left');
            return {
                content: [
                    {
                        type: 'text',
                        text: `Found and clicked web element "${matchingElement.text}" at normalized (${normalizedX.toFixed(3)}, ${normalizedY.toFixed(3)})`,
                    },
                ],
            };
        }
        catch (error) {
            throw new Error(`Failed to find and click web element: ${error}`);
        }
    }
    // Text Input Tools Implementation
    async typeText(appName, elementIndex, text, clearFirst) {
        try {
            // Focus the application first
            await this.focusApplication(appName);
            // Get web elements to find the input field
            const screenshotResult = await this.screenshot(10, 'png', 90);
            const imageData = screenshotResult.content[1].data;
            const elements = await this.webContentDetector.analyzeImage(imageData);
            if (elementIndex < 0 || elementIndex >= elements.length) {
                throw new Error(`Element index ${elementIndex} is out of range. Available elements: 0-${elements.length - 1}`);
            }
            const element = elements[elementIndex];
            const normalizedX = element.normalizedPosition.x;
            const normalizedY = element.normalizedPosition.y;
            // Convert to screen coordinates
            const screenX = this.currentApp.bounds.x + (normalizedX * this.currentApp.bounds.width);
            const screenY = this.currentApp.bounds.y + (normalizedY * this.currentApp.bounds.height);
            // Move mouse and click to focus the input field
            await nut_js_1.mouse.setPosition({ x: screenX, y: screenY });
            await nut_js_1.mouse.click(nut_js_1.Button.LEFT);
            // Clear existing text if requested
            if (clearFirst) {
                await nut_js_1.keyboard.pressKey(nut_js_1.Key.LeftCmd, nut_js_1.Key.A);
                await nut_js_1.keyboard.pressKey(nut_js_1.Key.Delete);
            }
            // Type the text
            await nut_js_1.keyboard.type(text);
            return {
                content: [
                    {
                        type: 'text',
                        text: `Typed "${text}" into element ${elementIndex} ("${element.text}") at normalized (${normalizedX.toFixed(3)}, ${normalizedY.toFixed(3)})`,
                    },
                ],
            };
        }
        catch (error) {
            throw new Error(`Failed to type text: ${error}`);
        }
    }
    async googleSearch(appName, searchQuery, searchButtonText) {
        try {
            // Focus the browser
            await this.focusApplication(appName);
            // Get web elements
            const screenshotResult = await this.screenshot(10, 'png', 90);
            const imageData = screenshotResult.content[1].data;
            const elements = await this.webContentDetector.analyzeImage(imageData);
            // Find search box
            const searchBox = elements.find((element) => element.isInput && (element.text.toLowerCase().includes('search') || element.placeholder?.toLowerCase().includes('search')));
            if (!searchBox) {
                throw new Error('Search box not found');
            }
            // Find search button
            const searchButton = elements.find((element) => element.text.toLowerCase().includes(searchButtonText.toLowerCase()));
            if (!searchButton) {
                throw new Error(`Search button "${searchButtonText}" not found`);
            }
            // Type in search box
            const searchBoxIndex = elements.indexOf(searchBox);
            await this.typeText(appName, searchBoxIndex, searchQuery, true);
            // Click search button
            const searchButtonIndex = elements.indexOf(searchButton);
            await this.clickWebElement(searchButtonIndex);
            return {
                content: [
                    {
                        type: 'text',
                        text: `Successfully performed Google search for "${searchQuery}" using "${searchButtonText}" button`,
                    },
                ],
            };
        }
        catch (error) {
            throw new Error(`Failed to perform Google search: ${error}`);
        }
    }
    // Utility Tools Implementation
    async testAnalysisMethods(padding) {
        if (!this.currentApp) {
            throw new Error('No application focused. Use focusApplication first.');
        }
        try {
            const results = [];
            // Test Apple Accessibility
            try {
                const accessibilityElements = await this.appleWindowManager.getClickableElements(this.currentApp.name);
                results.push(`✅ Apple Accessibility: Found ${accessibilityElements.length} elements`);
            }
            catch (error) {
                results.push(`❌ Apple Accessibility: Failed - ${error}`);
            }
            // Test AI Analysis
            try {
                const screenshotResult = await this.screenshot(padding, 'png', 90);
                const imageData = screenshotResult.content[1].data;
                await this.localLLMAnalyzer.analyzeImage(imageData, 'Test analysis');
                results.push(`✅ AI Analysis: Working`);
            }
            catch (error) {
                results.push(`❌ AI Analysis: Failed - ${error}`);
            }
            // Test OCR
            try {
                const screenshotResult = await this.screenshot(padding, 'png', 90);
                const imageData = screenshotResult.content[1].data;
                await this.ocrAnalyzer.analyzeImage(imageData);
                results.push(`✅ OCR Analysis: Working`);
            }
            catch (error) {
                results.push(`❌ OCR Analysis: Failed - ${error}`);
            }
            // Test Web Content Detection
            try {
                const screenshotResult = await this.screenshot(padding, 'png', 90);
                const imageData = screenshotResult.content[1].data;
                const webElements = await this.webContentDetector.analyzeImage(imageData);
                results.push(`✅ Web Content Detection: Found ${webElements.length} elements`);
            }
            catch (error) {
                results.push(`❌ Web Content Detection: Failed - ${error}`);
            }
            return {
                content: [
                    {
                        type: 'text',
                        text: `Analysis Methods Test Results for ${this.currentApp.name}:\n\n${results.join('\n')}`,
                    },
                ],
            };
        }
        catch (error) {
            throw new Error(`Failed to test analysis methods: ${error}`);
        }
    }
    async getAvailableLLMProviders() {
        try {
            const providers = await this.webContentDetector.getAvailableProviders();
            return {
                content: [
                    {
                        type: 'text',
                        text: `Available LLM Providers:\n\n${providers
                            .map((provider) => `• ${provider.name}: ${provider.status}`)
                            .join('\n')}`,
                    },
                ],
            };
        }
        catch (error) {
            throw new Error(`Failed to get LLM providers: ${error}`);
        }
    }
    async requestAccessibilityPermission() {
        try {
            // Check current status
            const currentStatus = (0, node_mac_permissions_1.getAuthStatus)('accessibility');
            if (currentStatus === 'authorized') {
                // Test if it actually works with JXA
                const jxaCheck = await (0, jxa_runner_js_1.checkAccessibilityPermissions)();
                if (jxaCheck.hasPermission) {
                    return {
                        content: [
                            {
                                type: 'text',
                                text: `✅ Accessibility permission is already granted and working!\n\nStatus: ${currentStatus}\nJXA Test: Passed\n\nAll MCP-Eyes features should work correctly.`,
                            },
                        ],
                    };
                }
                else {
                    // Permission shows as granted but JXA doesn't work
                    return {
                        content: [
                            {
                                type: 'text',
                                text: `⚠️ Accessibility permission shows as granted but JXA test failed.\n\nStatus: ${currentStatus}\nJXA Error: ${jxaCheck.error || 'Unknown'}\n\n${jxaCheck.suggestion || ''}\n\nTry these steps:\n1. Remove Claude Code/Terminal from Accessibility settings\n2. Re-add it and ensure checkbox is enabled\n3. Restart Claude Code completely`,
                            },
                        ],
                    };
                }
            }
            // Request permission - this will open System Settings
            (0, node_mac_permissions_1.askForAccessibilityAccess)();
            return {
                content: [
                    {
                        type: 'text',
                        text: `🔐 Accessibility Permission Required\n\nOpening System Settings → Privacy & Security → Accessibility...\n\nPlease:\n1. Click the + button\n2. Add your terminal app (iTerm, Terminal, or the app running Claude Code)\n3. Ensure the checkbox is ENABLED\n4. Restart Claude Code after granting permission\n\nCurrent status: ${currentStatus}`,
                    },
                ],
            };
        }
        catch (error) {
            throw new Error(`Failed to request accessibility permission: ${error}`);
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
    /**
     * Quick health check - lightweight check that runs before each tool call
     * Returns immediately if system is not ready for automation
     */
    async quickHealthCheck() {
        const { exec } = await Promise.resolve().then(() => __importStar(require('child_process')));
        const { promisify } = await Promise.resolve().then(() => __importStar(require('util')));
        const execAsync = promisify(exec);
        // Method 1: Fast check via ioreg for screen lock
        try {
            const { stdout: ioregOutput } = await execAsync('ioreg -n Root -d1 -a 2>/dev/null | grep -A1 CGSSessionScreenIsLocked || echo "not_found"', { timeout: 2000 });
            if (ioregOutput.includes('<true/>')) {
                return {
                    ready: false,
                    reason: '🔒 Screen is LOCKED (CGSSessionScreenIsLocked)',
                    recommendation: 'Use Remote Desktop (ARD/VNC) to unlock the screen',
                };
            }
        }
        catch (e) {
            // ioreg failed, try next method
        }
        // Method 2: Check if loginwindow is frontmost
        try {
            const { stdout: frontApp } = await execAsync(`osascript -e 'tell application "System Events" to get name of first application process whose frontmost is true' 2>/dev/null`, { timeout: 2000 });
            if (frontApp.trim() === 'loginwindow') {
                return {
                    ready: false,
                    reason: '🔒 Screen is LOCKED (loginwindow is active)',
                    recommendation: 'Use Remote Desktop (ARD/VNC) to unlock the screen',
                };
            }
        }
        catch (e) {
            // AppleScript failed, continue
        }
        // Method 3: Check screen saver
        try {
            const { stdout: screensaverStatus } = await execAsync(`osascript -e 'tell application "System Events" to get running of screen saver preferences' 2>/dev/null`, { timeout: 2000 });
            if (screensaverStatus.trim() === 'true') {
                return {
                    ready: false,
                    reason: '🔒 Screen saver is RUNNING',
                    recommendation: 'Move mouse or use Remote Desktop to dismiss screen saver',
                };
            }
        }
        catch (e) {
            // Screen saver check failed, continue
        }
        // Quick permission check
        try {
            const accessibilityStatus = (0, node_mac_permissions_1.getAuthStatus)('accessibility');
            if (accessibilityStatus !== 'authorized') {
                return {
                    ready: false,
                    reason: '🔐 Accessibility permission NOT granted',
                    recommendation: 'Grant Accessibility permission in System Settings → Privacy & Security',
                };
            }
        }
        catch (e) {
            // Permission check failed, assume ok
        }
        return {
            ready: true,
            reason: '',
            recommendation: '',
        };
    }
    async healthCheck() {
        const { exec } = await Promise.resolve().then(() => __importStar(require('child_process')));
        const { promisify } = await Promise.resolve().then(() => __importStar(require('util')));
        const execAsync = promisify(exec);
        const health = {
            screenLocked: false,
            screenLockedReason: '',
            accessibilityPermission: 'unknown',
            screenRecordingPermission: 'unknown',
            focusedApp: this.currentApp?.name || null,
            displaySleep: false,
            systemReady: true,
            timestamp: new Date().toISOString(),
            recommendations: [],
        };
        // Check screen lock status using multiple methods
        try {
            // Method 1: Check via ioreg for CGSSessionScreenIsLocked
            const { stdout: ioregOutput } = await execAsync('ioreg -n Root -d1 -a 2>/dev/null | grep -A1 CGSSessionScreenIsLocked || echo "not_found"');
            if (ioregOutput.includes('<true/>')) {
                health.screenLocked = true;
                health.screenLockedReason = 'CGSSessionScreenIsLocked is true (ioreg)';
            }
        }
        catch (e) {
            // ioreg method failed, continue with other methods
        }
        // Method 2: Check if loginwindow is frontmost (indicates lock screen)
        if (!health.screenLocked) {
            try {
                const { stdout: frontApp } = await execAsync(`osascript -e 'tell application "System Events" to get name of first application process whose frontmost is true' 2>/dev/null || echo "error"`);
                if (frontApp.trim() === 'loginwindow') {
                    health.screenLocked = true;
                    health.screenLockedReason = 'loginwindow is frontmost application';
                }
            }
            catch (e) {
                // AppleScript method failed
            }
        }
        // Method 3: Check screen saver status
        if (!health.screenLocked) {
            try {
                const { stdout: screensaverStatus } = await execAsync(`osascript -e 'tell application "System Events" to get running of screen saver preferences' 2>/dev/null || echo "error"`);
                if (screensaverStatus.trim() === 'true') {
                    health.screenLocked = true;
                    health.screenLockedReason = 'Screen saver is running';
                }
            }
            catch (e) {
                // Screen saver check failed
            }
        }
        // Method 4: Check display sleep status via pmset
        try {
            const { stdout: pmsetOutput } = await execAsync('pmset -g 2>/dev/null | grep -i "display" || echo ""');
            if (pmsetOutput.toLowerCase().includes('sleep')) {
                health.displaySleep = true;
                if (!health.screenLocked) {
                    health.screenLocked = true;
                    health.screenLockedReason = 'Display is asleep';
                }
            }
        }
        catch (e) {
            // pmset check failed
        }
        // Method 5: Try to get window list - if it fails or returns empty, screen may be locked
        if (!health.screenLocked) {
            try {
                const { stdout: windowList } = await execAsync(`osascript -e 'tell application "System Events" to get name of every window of every application process whose visible is true' 2>/dev/null || echo "error"`);
                if (windowList.trim() === 'error' || windowList.trim() === '') {
                    // Could indicate locked screen or permission issues
                    health.recommendations.push('Window list unavailable - screen may be locked or permissions missing');
                }
            }
            catch (e) {
                // Window list check failed
            }
        }
        // Check permissions
        try {
            const accessibilityStatus = (0, node_mac_permissions_1.getAuthStatus)('accessibility');
            health.accessibilityPermission = accessibilityStatus;
            if (accessibilityStatus !== 'authorized') {
                health.systemReady = false;
                health.recommendations.push('Grant Accessibility permission in System Settings → Privacy & Security');
            }
        }
        catch (e) {
            health.accessibilityPermission = 'error';
        }
        try {
            const screenStatus = await (0, node_mac_permissions_1.checkPermissions)('screen');
            health.screenRecordingPermission = screenStatus;
            if (screenStatus !== 'authorized') {
                health.systemReady = false;
                health.recommendations.push('Grant Screen Recording permission in System Settings → Privacy & Security');
            }
        }
        catch (e) {
            health.screenRecordingPermission = 'error';
        }
        // Set system ready status
        if (health.screenLocked) {
            health.systemReady = false;
            health.recommendations.push('Screen is locked - use Remote Desktop (ARD/VNC) to unlock before automation');
        }
        // Build status message
        const statusIcon = health.systemReady ? '✅' : '⚠️';
        const lockIcon = health.screenLocked ? '🔒' : '🔓';
        const statusMessage = `${statusIcon} MCP-EYES Health Check

${lockIcon} Screen Status: ${health.screenLocked ? 'LOCKED' : 'UNLOCKED'}
${health.screenLocked ? `   Reason: ${health.screenLockedReason}` : ''}
${health.displaySleep ? '😴 Display: Asleep' : '🖥️  Display: Active'}

🔐 Permissions:
   Accessibility: ${health.accessibilityPermission === 'authorized' ? '✅' : '❌'} ${health.accessibilityPermission}
   Screen Recording: ${health.screenRecordingPermission === 'authorized' ? '✅' : '❌'} ${health.screenRecordingPermission}

🎯 Focused App: ${health.focusedApp || 'None'}
⏱️  Timestamp: ${health.timestamp}

${health.systemReady ? '✅ System is ready for automation' : '⚠️ System NOT ready for automation'}

${health.recommendations.length > 0 ? '📋 Recommendations:\n' + health.recommendations.map(r => `   • ${r}`).join('\n') : ''}`;
        return {
            content: [
                {
                    type: 'text',
                    text: statusMessage,
                },
            ],
            // Also include structured data for programmatic use
            isError: false,
            _meta: {
                health: health,
            },
        };
    }
    // Browser Extension Tools Implementation
    async watchBrowser(browser, autoFillRules) {
        const fs = await Promise.resolve().then(() => __importStar(require('fs')));
        this.browserWatch = {
            enabled: true,
            browser,
            autoFillRules: autoFillRules || [],
            events: [],
            startTime: Date.now(),
        };
        // Check socket connection status
        const isSocketConnected = this.browserBridge.isConnected();
        let connectionMode = 'polling';
        let connectionStatus = '⚠️ Extension not connected via socket - using file polling';
        if (isSocketConnected) {
            connectionMode = 'socket';
            connectionStatus = '✅ Extension connected via socket - real-time events enabled';
            // Try to enable watch mode in the browser
            try {
                await this.browserBridge.send('setWatchMode', { enabled: true });
                console.error('[MCP Eyes] Watch mode enabled in browser');
            }
            catch (e) {
                console.error('[MCP Eyes] Failed to enable watch mode:', e);
            }
        }
        else {
            // Fall back to queue file polling
            const queueFile = '/tmp/mcp-eyes-queue.json';
            try {
                fs.writeFileSync(queueFile, '[]');
            }
            catch (e) {
                // Queue file may not exist yet
            }
            this.startEventPolling();
        }
        const rulesText = autoFillRules && autoFillRules.length > 0
            ? `\n\n📋 Auto-fill rules configured:\n${autoFillRules.map(r => `   • "${r.fieldMatch}" → "${r.value}"`).join('\n')}`
            : '';
        return {
            content: [
                {
                    type: 'text',
                    text: `👁️ Now watching ${browser} for DOM changes

🔌 Connection: ${connectionStatus}

📡 Events will be captured when:
   • New forms appear
   • Input fields are added
   • Modals/dialogs open
   • Buttons become available
${rulesText}

Use "getBrowserEvents" to check for new events.
Use "stopWatchingBrowser" to stop watching.`,
                },
            ],
        };
    }
    eventPollInterval = null;
    startEventPolling() {
        // Stop any existing polling
        if (this.eventPollInterval) {
            clearInterval(this.eventPollInterval);
        }
        const fs = require('fs');
        const queueFile = '/tmp/mcp-eyes-queue.json';
        this.eventPollInterval = setInterval(() => {
            if (!this.browserWatch.enabled) {
                if (this.eventPollInterval) {
                    clearInterval(this.eventPollInterval);
                    this.eventPollInterval = null;
                }
                return;
            }
            try {
                if (fs.existsSync(queueFile)) {
                    const content = fs.readFileSync(queueFile, 'utf8');
                    const events = JSON.parse(content);
                    if (events.length > 0) {
                        // Add new events
                        for (const event of events) {
                            this.browserWatch.events.push(event);
                            // Check if we should auto-fill
                            if (event.message?.event === 'domChanged' && event.message?.payload?.forms) {
                                this.processAutoFillRules(event.message.payload.forms);
                            }
                        }
                        // Clear the queue file
                        fs.writeFileSync(queueFile, '[]');
                    }
                }
            }
            catch (e) {
                // Ignore errors reading queue
            }
        }, 500);
    }
    async processAutoFillRules(forms) {
        if (!this.browserWatch.autoFillRules.length)
            return;
        for (const form of forms) {
            for (const input of form.inputs || []) {
                for (const rule of this.browserWatch.autoFillRules) {
                    const fieldId = input.name || input.id || input.placeholder || '';
                    if (fieldId.toLowerCase().includes(rule.fieldMatch.toLowerCase())) {
                        // Queue a fill command
                        console.error(`[MCP Eyes] Auto-fill: "${fieldId}" → "${rule.value}"`);
                        // Note: Actual fill would need extension communication
                    }
                }
            }
        }
    }
    async processAutoFillRulesViaSocket(forms) {
        if (!this.browserWatch.autoFillRules.length)
            return;
        if (!this.browserBridge.isConnected())
            return;
        for (const form of forms) {
            for (const input of form.inputs || []) {
                for (const rule of this.browserWatch.autoFillRules) {
                    const fieldId = input.name || input.id || input.placeholder || '';
                    if (fieldId.toLowerCase().includes(rule.fieldMatch.toLowerCase())) {
                        console.error(`[MCP Eyes] Auto-filling via socket: "${fieldId}" → "${rule.value}"`);
                        try {
                            // Build selector for the input
                            let selector = '';
                            if (input.id) {
                                selector = `#${input.id}`;
                            }
                            else if (input.name) {
                                selector = `[name="${input.name}"]`;
                            }
                            else if (input.placeholder) {
                                selector = `[placeholder="${input.placeholder}"]`;
                            }
                            if (selector) {
                                await this.browserBridge.fillElement(selector, rule.value);
                                console.error(`[MCP Eyes] Auto-filled "${selector}" with "${rule.value}"`);
                            }
                        }
                        catch (error) {
                            console.error(`[MCP Eyes] Auto-fill error:`, error);
                        }
                    }
                }
            }
        }
    }
    async stopWatchingBrowser() {
        const wasEnabled = this.browserWatch.enabled;
        const eventCount = this.browserWatch.events.length;
        const duration = this.browserWatch.enabled
            ? Math.round((Date.now() - this.browserWatch.startTime) / 1000)
            : 0;
        this.browserWatch.enabled = false;
        if (this.eventPollInterval) {
            clearInterval(this.eventPollInterval);
            this.eventPollInterval = null;
        }
        return {
            content: [
                {
                    type: 'text',
                    text: wasEnabled
                        ? `🛑 Stopped watching browser

📊 Session summary:
   • Duration: ${duration} seconds
   • Events captured: ${eventCount}
   • Browser: ${this.browserWatch.browser}`
                        : '⚠️ Browser watching was not active.',
                },
            ],
        };
    }
    async getBrowserEvents(clear) {
        const events = [...this.browserWatch.events];
        if (clear) {
            this.browserWatch.events = [];
        }
        if (events.length === 0) {
            return {
                content: [
                    {
                        type: 'text',
                        text: this.browserWatch.enabled
                            ? '📭 No new browser events yet. Still watching...'
                            : '⚠️ Browser watching is not active. Use "watchBrowser" to start.',
                    },
                ],
            };
        }
        // Format events for display
        const formattedEvents = events.map((e, i) => {
            const event = e.message || e;
            const changes = event.payload?.changes || {};
            const forms = event.payload?.forms || [];
            let description = `Event ${i + 1}:`;
            if (changes.hasNewForms)
                description += ' 📝 New form';
            if (changes.hasNewInputs)
                description += ' ✏️ New inputs';
            if (changes.hasNewButtons)
                description += ' 🔘 New buttons';
            if (changes.hasNewModals)
                description += ' 💬 Modal/dialog';
            if (forms.length > 0) {
                description += `\n   Forms: ${forms.map((f) => `${f.name || f.id || 'unnamed'} (${f.inputCount} fields)`).join(', ')}`;
            }
            return description;
        });
        return {
            content: [
                {
                    type: 'text',
                    text: `📬 ${events.length} browser event(s):\n\n${formattedEvents.join('\n\n')}`,
                },
            ],
            _meta: {
                events: events,
                cleared: clear,
            },
        };
    }
    async fillBrowserForm(fields, submit) {
        // Try socket connection first (real-time)
        if (this.browserBridge.isConnected()) {
            try {
                const results = [];
                for (const field of fields) {
                    try {
                        await this.browserBridge.fillElement(field.selector, field.value);
                        results.push(`✅ ${field.selector} → "${field.value}"`);
                    }
                    catch (e) {
                        results.push(`❌ ${field.selector}: ${e}`);
                    }
                }
                if (submit) {
                    try {
                        // Try to find and click submit button
                        await this.browserBridge.send('clickElement', { selector: 'button[type="submit"], input[type="submit"], form button:last-of-type' });
                        results.push('✅ Form submitted');
                    }
                    catch (e) {
                        results.push(`❌ Submit failed: ${e}`);
                    }
                }
                return {
                    content: [
                        {
                            type: 'text',
                            text: `📝 Form filled via socket connection

Results:
${results.join('\n')}`,
                        },
                    ],
                };
            }
            catch (error) {
                return {
                    content: [
                        {
                            type: 'text',
                            text: `❌ Socket fill failed: ${error}`,
                        },
                    ],
                };
            }
        }
        // Fall back to queue-based approach
        const fs = await Promise.resolve().then(() => __importStar(require('fs')));
        const commandFile = '/tmp/mcp-eyes-commands.json';
        const command = {
            action: 'fillForm',
            payload: {
                fields,
                submit,
            },
            timestamp: Date.now(),
        };
        try {
            let commands = [];
            if (fs.existsSync(commandFile)) {
                commands = JSON.parse(fs.readFileSync(commandFile, 'utf8'));
            }
            commands.push(command);
            fs.writeFileSync(commandFile, JSON.stringify(commands, null, 2));
            return {
                content: [
                    {
                        type: 'text',
                        text: `📝 Form fill command queued (no socket connection)

Fields to fill:
${fields.map(f => `   • ${f.selector} → "${f.value}"`).join('\n')}
${submit ? '\n🚀 Will submit form after filling' : ''}

⚠️ Requires MCP-Eyes browser extension to execute.`,
                    },
                ],
            };
        }
        catch (error) {
            return {
                content: [
                    {
                        type: 'text',
                        text: `❌ Failed to queue form fill: ${error}`,
                    },
                ],
            };
        }
    }
    async run() {
        const transport = new stdio_js_1.StdioServerTransport();
        await this.server.connect(transport);
        console.error('MCP Eyes Advanced Server running on stdio');
    }
}
const server = new AdvancedServer();
server.run().catch(console.error);
//# sourceMappingURL=advanced-server.js.map