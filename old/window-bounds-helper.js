"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getWindowBoundsAppleScript = getWindowBoundsAppleScript;
exports.clearBoundsCache = clearBoundsCache;
exports.getCachedBounds = getCachedBounds;
const child_process_1 = require("child_process");
const util_1 = require("util");
const execAsync = (0, util_1.promisify)(child_process_1.exec);
// Cache to store bounds per PID
const boundsCache = new Map();
const CACHE_TIMEOUT = 5000; // 5 seconds cache timeout
/**
 * Escape application name for safe AppleScript execution
 */
function escapeAppleScriptString(str) {
    return str.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}
/**
 * Get window bounds using AppleScript System Events
 */
async function getWindowBoundsAppleScript(appName, pid) {
    // Check cache first
    const cached = boundsCache.get(pid);
    if (cached && Date.now() - cached.timestamp < CACHE_TIMEOUT) {
        return cached.bounds;
    }
    const escapedAppName = escapeAppleScriptString(appName);
    // Primary method: Use System Events to get bounds of front window
    const primaryScript = `
    tell application "System Events"
      try
        tell process "${escapedAppName}"
          set frontWindow to front window
          set windowBounds to position of frontWindow & size of frontWindow
          return windowBounds
        end tell
      on error
        return {0, 0, 0, 0}
      end try
    end tell
  `;
    try {
        const { stdout } = await execAsync(`osascript -e '${primaryScript.replace(/'/g, "'\"'\"'")}'`);
        const values = stdout.trim().split(', ').map(v => parseInt(v));
        if (values.length === 4 && values.some(v => v !== 0)) {
            const bounds = {
                x: values[0],
                y: values[1],
                width: values[2],
                height: values[3]
            };
            // Cache the result
            boundsCache.set(pid, { bounds, timestamp: Date.now() });
            return bounds;
        }
    }
    catch (error) {
        console.error(`Primary AppleScript method failed for ${appName}:`, error);
    }
    // Fallback method: Try UI element hierarchy
    const fallbackScript = `
    tell application "System Events"
      try
        tell process "${escapedAppName}"
          set uiWindows to windows
          if (count of uiWindows) > 0 then
            set firstWindow to item 1 of uiWindows
            set windowPosition to position of firstWindow
            set windowSize to size of firstWindow
            return windowPosition & windowSize
          else
            return {0, 0, 0, 0}
          end if
        end tell
      on error
        return {0, 0, 0, 0}
      end try
    end tell
  `;
    try {
        const { stdout } = await execAsync(`osascript -e '${fallbackScript.replace(/'/g, "'\"'\"'")}'`);
        const values = stdout.trim().split(', ').map(v => parseInt(v));
        if (values.length === 4 && values.some(v => v !== 0)) {
            const bounds = {
                x: values[0],
                y: values[1],
                width: values[2],
                height: values[3]
            };
            // Cache the result
            boundsCache.set(pid, { bounds, timestamp: Date.now() });
            return bounds;
        }
    }
    catch (error) {
        console.error(`Fallback AppleScript method failed for ${appName}:`, error);
    }
    return null;
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
    const cached = boundsCache.get(pid);
    if (cached && Date.now() - cached.timestamp < CACHE_TIMEOUT) {
        return cached.bounds;
    }
    return null;
}
//# sourceMappingURL=window-bounds-helper.js.map