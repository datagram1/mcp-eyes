/**
 * Custom JXA Runner for MCP-Eyes
 *
 * Provides a replacement for @jxa/run that properly inherits the process environment
 * and handles subprocess permission issues with macOS Accessibility.
 */
interface RunOptions {
    timeout?: number;
    maxBuffer?: number;
}
/**
 * Execute raw JXA code string
 */
export declare function runJXACode(jxaCode: string, options?: RunOptions): Promise<any>;
/**
 * Execute a JXA function with arguments (compatible with @jxa/run API)
 */
export declare function run<T extends (...args: any[]) => any>(jxaCodeFunction: T, ...args: Parameters<T>): Promise<ReturnType<T>>;
/**
 * Execute AppleScript code (alternative to JXA that may have better permission handling)
 */
export declare function runAppleScript(appleScriptCode: string): Promise<string>;
/**
 * Check if Accessibility permissions are likely available
 */
export declare function checkAccessibilityPermissions(): Promise<{
    hasPermission: boolean;
    error?: string;
    suggestion?: string;
}>;
/**
 * Get a list of all running applications using a simpler method that might work
 * without full Accessibility permissions
 */
export declare function getRunningAppsSimple(): Promise<Array<{
    name: string;
    bundleId: string;
}>>;
export default run;
//# sourceMappingURL=jxa-runner.d.ts.map