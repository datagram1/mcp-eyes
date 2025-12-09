//
//  BrowserWebSocketServer.h
//  ScreenControl
//
//  Native WebSocket server for browser extension connections
//  Replaces the problematic Node.js browser-bridge-server
//

#import <Foundation/Foundation.h>

@class BrowserWebSocketServer;

@protocol BrowserWebSocketServerDelegate <NSObject>
@optional
- (void)browserWebSocketServer:(BrowserWebSocketServer *)server didReceiveToolRequest:(NSDictionary *)request fromBrowser:(NSString *)browserId;
- (void)browserWebSocketServerDidStart:(BrowserWebSocketServer *)server onPort:(NSUInteger)port;
- (void)browserWebSocketServerDidStop:(BrowserWebSocketServer *)server;
@end

@interface BrowserWebSocketServer : NSObject

@property (nonatomic, weak) id<BrowserWebSocketServerDelegate> delegate;
@property (nonatomic, assign, readonly) NSUInteger port;
@property (nonatomic, assign, readonly) BOOL isRunning;
@property (nonatomic, strong, readonly) NSMutableSet *connectedBrowsers;

- (instancetype)initWithPort:(NSUInteger)port;
- (BOOL)start;
- (void)stop;

// Send response back to browser
- (void)sendResponse:(NSDictionary *)response toBrowser:(NSString *)browserId;
- (void)broadcastMessage:(NSDictionary *)message;

@end
