/**
 * GUIBridgeServer
 *
 * HTTP server that receives GUI operation requests from the ScreenControl Service.
 * The service forwards GUI-related commands (screenshots, clicks, keyboard, etc.)
 * to this server, which executes them using native macOS APIs.
 *
 * Listens on port 3457 (GUI_BRIDGE_PORT) by default.
 */

#import <Foundation/Foundation.h>

NS_ASSUME_NONNULL_BEGIN

@protocol GUIBridgeServerDelegate <NSObject>
@optional
/// Called when a tool request is received from the service
- (NSDictionary *)guiBridgeServer:(id)server executeToolWithName:(NSString *)name arguments:(NSDictionary *)arguments;
/// Called when the server starts or stops
- (void)guiBridgeServerDidStart:(id)server;
- (void)guiBridgeServerDidStop:(id)server;
/// Called for logging
- (void)guiBridgeServer:(id)server logMessage:(NSString *)message;
@end

@interface GUIBridgeServer : NSObject

/// Server port (default: 3457)
@property (nonatomic, assign) int port;

/// Whether the server is currently running
@property (nonatomic, readonly) BOOL isRunning;

/// Delegate for handling tool execution
@property (nonatomic, weak, nullable) id<GUIBridgeServerDelegate> delegate;

/// Shared instance
+ (instancetype)sharedInstance;

/// Initialize with specific port
- (instancetype)initWithPort:(int)port;

/// Start the HTTP server
- (BOOL)start;

/// Stop the HTTP server
- (void)stop;

/// Get server info
- (NSDictionary *)getServerInfo;

@end

NS_ASSUME_NONNULL_END
