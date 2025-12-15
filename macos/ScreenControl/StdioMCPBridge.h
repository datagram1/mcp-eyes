/**
 * StdioMCPBridge - Native MCP Server over stdio
 *
 * Provides MCP protocol over stdin/stdout with LOCAL tool execution.
 * No remote server dependency - all tools run natively on this machine.
 *
 * Usage: ScreenControl --mcp-stdio
 *
 * Architecture:
 *   Claude Code --stdio--> StdioMCPBridge ---> MCPServer (local desktop/fs/shell tools)
 *                                         \--> BrowserWebSocketServer (browser extension)
 */

#import <Foundation/Foundation.h>

@class MCPServer;
@class BrowserWebSocketServer;

NS_ASSUME_NONNULL_BEGIN

@interface StdioMCPBridge : NSObject

/**
 * Start the stdio MCP bridge
 * This method blocks and runs the main event loop
 */
- (void)start;

/**
 * Stop the bridge and cleanup
 */
- (void)stop;

@end

NS_ASSUME_NONNULL_END
