//
//  TestServer.h
//  ScreenControl
//
//  Remote testing server for automated agent testing.
//  Only available in DEBUG builds - controlled by DEBUG preprocessor flag.
//
//  Listens on localhost:3456 for JSON-RPC style commands to control the agent.
//

#import <Foundation/Foundation.h>

#ifdef DEBUG

@class AppDelegate;

NS_ASSUME_NONNULL_BEGIN

/**
 * TestServer provides a local HTTP server for automated testing.
 *
 * This server ONLY binds to 127.0.0.1 (localhost) for security.
 * It accepts JSON-RPC style commands to:
 *   - Get/set UI field values
 *   - Click buttons (connect, disconnect)
 *   - Get connection state
 *   - Get logs
 *   - Restart/quit the agent
 *
 * Available methods:
 *   - ping: Health check, returns { "pong": true, "version": "..." }
 *   - getState: Returns connection status, settings
 *   - getFields: Returns all current field values
 *   - setField: Set a specific field value
 *   - clickButton: Trigger a button action
 *   - getLogs: Get recent log entries
 *   - restart: Quit and relaunch the app
 *   - quit: Graceful shutdown
 */
@interface TestServer : NSObject

@property (nonatomic, weak) AppDelegate *appDelegate;
@property (nonatomic, assign, readonly) BOOL isRunning;
@property (nonatomic, assign, readonly) uint16_t port;

- (instancetype)initWithAppDelegate:(AppDelegate *)appDelegate;

/**
 * Start the test server on the specified port.
 * @param port The port to listen on (default 3456, fallback 3457)
 * @return YES if started successfully, NO otherwise
 */
- (BOOL)startOnPort:(uint16_t)port;

/**
 * Stop the test server.
 */
- (void)stop;

@end

NS_ASSUME_NONNULL_END

#endif // DEBUG
