/**
 * ScreenControl macOS App Entry Point
 *
 * Supports two modes:
 * - GUI mode (default): Full macOS app with status bar
 * - MCP stdio mode (--mcp-stdio): Headless MCP server over stdin/stdout
 */

#import <Cocoa/Cocoa.h>
#import <IOKit/IOKitLib.h>
#import "AppDelegate.h"
#import "StdioMCPBridge.h"

int main(int argc, const char * argv[]) {
    @autoreleasepool {
        // Check for --mcp-stdio flag
        BOOL mcpStdioMode = NO;
        for (int i = 1; i < argc; i++) {
            if (strcmp(argv[i], "--mcp-stdio") == 0) {
                mcpStdioMode = YES;
                break;
            }
        }

        if (mcpStdioMode) {
            // Run in headless MCP stdio mode
            // This mode connects to the remote server and provides MCP over stdin/stdout
            StdioMCPBridge *bridge = [[StdioMCPBridge alloc] init];
            [bridge start];
            // start blocks until stopped
            return 0;
        } else {
            // Run as GUI app
            NSApplication *app = [NSApplication sharedApplication];
            AppDelegate *delegate = [[AppDelegate alloc] init];
            [app setDelegate:delegate];
            [app run];
        }
    }
    return 0;
}
