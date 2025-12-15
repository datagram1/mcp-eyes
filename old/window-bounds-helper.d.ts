interface WindowBounds {
    x: number;
    y: number;
    width: number;
    height: number;
}
/**
 * Get window bounds using AppleScript System Events
 */
export declare function getWindowBoundsAppleScript(appName: string, pid: number): Promise<WindowBounds | null>;
/**
 * Clear the cache for a specific PID or all PIDs
 */
export declare function clearBoundsCache(pid?: number): void;
/**
 * Get cached bounds without making a new request
 */
export declare function getCachedBounds(pid: number): WindowBounds | null;
export {};
//# sourceMappingURL=window-bounds-helper.d.ts.map