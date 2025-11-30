/**
 * MCP Eyes Browser Bridge
 *
 * Provides tools for the MCP server to interact with browsers via:
 * 1. Native messaging (Chrome/Firefox extension)
 * 2. AppleScript (Safari on macOS)
 *
 * The bridge can operate in two modes:
 * - Natural mode: Returns screen coordinates for mouse/keyboard control
 * - Silent mode: Directly injects clicks/fills via JavaScript
 */
import { EventEmitter } from 'events';
export interface InteractiveElement {
    index: number;
    type: string;
    tagName: string;
    text: string;
    selector: string;
    id: string | null;
    name: string | null;
    href: string | null;
    value: string | null;
    checked: boolean | null;
    disabled: boolean;
    visible: boolean;
    rect: {
        x: number;
        y: number;
        width: number;
        height: number;
    };
    screenRect: {
        x: number;
        y: number;
        width: number;
        height: number;
        centerX: number;
        centerY: number;
    };
    attributes: Record<string, string>;
}
export interface PageInfo {
    url: string;
    title: string;
    domain: string;
    scrollPosition: {
        x: number;
        y: number;
    };
    viewportSize: {
        width: number;
        height: number;
    };
    documentSize: {
        width: number;
        height: number;
    };
    browserWindow: {
        screenX: number;
        screenY: number;
        outerWidth: number;
        outerHeight: number;
        chromeHeight: number;
    };
}
export interface BrowserTab {
    id: number;
    url: string;
    title: string;
    active: boolean;
    windowId?: number;
    index?: number;
}
export interface BrowserBridgeConfig {
    socketPath?: string;
    timeout?: number;
}
/**
 * Browser Bridge - connects to browser extensions via Unix socket or queue file
 */
export declare class BrowserBridge extends EventEmitter {
    private socketPath;
    private timeout;
    private socket;
    private server;
    private connected;
    private pendingRequests;
    private requestIdCounter;
    private buffer;
    private serverRunning;
    constructor(config?: BrowserBridgeConfig);
    /**
     * Start the socket server that the native messaging host connects to
     */
    startServer(): Promise<void>;
    /**
     * Stop the socket server
     */
    stopServer(): Promise<void>;
    private handleData;
    private handleMessage;
    /**
     * Send a command to the browser extension
     */
    send<T = any>(action: string, payload?: any, tabId?: number): Promise<T>;
    private sendViaSocket;
    private sendViaQueue;
    /**
     * Get all interactive elements on the current page
     */
    getInteractiveElements(tabId?: number): Promise<InteractiveElement[]>;
    /**
     * Get page information
     */
    getPageInfo(tabId?: number): Promise<PageInfo>;
    /**
     * Get combined page context (elements + page info)
     */
    getPageContext(tabId?: number): Promise<{
        elements: InteractiveElement[];
        pageInfo: PageInfo;
    }>;
    /**
     * Click an element by selector (silent mode)
     */
    clickElement(selector: string, tabId?: number): Promise<{
        success: boolean;
        error?: string;
    }>;
    /**
     * Fill an input element (silent mode)
     */
    fillElement(selector: string, value: string, tabId?: number): Promise<{
        success: boolean;
        error?: string;
    }>;
    /**
     * Scroll to an element or direction
     */
    scrollTo(target: string, tabId?: number): Promise<{
        success: boolean;
        error?: string;
    }>;
    /**
     * Execute JavaScript in the page context
     */
    executeScript(code: string, tabId?: number): Promise<{
        success: boolean;
        result?: any;
        error?: string;
    }>;
    /**
     * Get element at screen coordinates
     */
    getElementAtPoint(x: number, y: number, tabId?: number): Promise<any>;
    /**
     * Get all forms on the page
     */
    getFormData(tabId?: number): Promise<any[]>;
    /**
     * Get all open browser tabs
     */
    getTabs(): Promise<BrowserTab[]>;
    /**
     * Get the active tab
     */
    getActiveTab(): Promise<BrowserTab>;
    /**
     * Focus a specific tab
     */
    focusTab(tabId: number): Promise<{
        success: boolean;
        error?: string;
    }>;
    /**
     * Check if the extension is connected
     */
    ping(): Promise<{
        status: string;
        timestamp: number;
    }>;
    /**
     * Disconnect from the browser
     */
    disconnect(): void;
    /**
     * Check if connected to a browser
     */
    isConnected(): boolean;
}
/**
 * Safari Bridge - uses AppleScript for Safari automation (macOS only)
 */
export declare class SafariBridge {
    /**
     * Get page source from Safari
     */
    getPageSource(): Promise<string>;
    /**
     * Get current URL from Safari
     */
    getURL(): Promise<string>;
    /**
     * Get page title from Safari
     */
    getTitle(): Promise<string>;
    /**
     * Execute JavaScript in Safari
     */
    executeScript(code: string): Promise<any>;
    /**
     * Get interactive elements from Safari
     */
    getInteractiveElements(): Promise<InteractiveElement[]>;
    /**
     * Get page info from Safari
     */
    getPageInfo(): Promise<PageInfo>;
    /**
     * Click an element in Safari
     */
    clickElement(selector: string): Promise<{
        success: boolean;
        error?: string;
    }>;
    /**
     * Fill an input in Safari
     */
    fillElement(selector: string, value: string): Promise<{
        success: boolean;
        error?: string;
    }>;
    /**
     * Scroll in Safari
     */
    scrollTo(target: string): Promise<{
        success: boolean;
    }>;
    /**
     * Navigate to a URL in Safari
     */
    navigateTo(url: string): Promise<void>;
    /**
     * Get all Safari tabs
     */
    getTabs(): Promise<BrowserTab[]>;
}
/**
 * Create a unified browser interface
 */
export declare function createBrowserBridge(browser?: 'chrome' | 'firefox' | 'safari'): BrowserBridge | SafariBridge;
/**
 * Get the global browser bridge instance (creates one if not exists)
 */
export declare function getGlobalBrowserBridge(): BrowserBridge;
/**
 * Start the global browser bridge server
 */
export declare function startGlobalBrowserBridge(): Promise<BrowserBridge>;
export default BrowserBridge;
//# sourceMappingURL=browser-bridge.d.ts.map