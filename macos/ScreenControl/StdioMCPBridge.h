/**
 * StdioMCPBridge - MCP Server over stdio with WebSocket backend
 *
 * Provides MCP protocol over stdin/stdout, forwarding tool calls
 * to the remote ScreenControl server via WebSocket.
 *
 * Usage: ScreenControl --mcp-stdio
 */

#import <Foundation/Foundation.h>

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
