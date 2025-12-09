/**
 * Browser Bridge Server
 * Native WebSocket server for browser extension communication
 * Manages connections from Firefox, Chrome, Edge, and Safari extensions
 */

#import <Foundation/Foundation.h>

typedef NS_ENUM(NSInteger, BrowserType) {
    BrowserTypeUnknown,
    BrowserTypeFirefox,
    BrowserTypeChrome,
    BrowserTypeEdge,
    BrowserTypeSafari
};

@protocol BrowserBridgeServerDelegate <NSObject>
@optional
- (void)browserBridgeServerDidStart:(NSUInteger)port;
- (void)browserBridgeServerDidStop;
- (void)browserDidConnect:(BrowserType)browserType name:(NSString *)name;
- (void)browserDidDisconnect:(BrowserType)browserType;
@end

@interface BrowserBridgeServer : NSObject

@property (weak, nonatomic) id<BrowserBridgeServerDelegate> delegate;
@property (nonatomic, readonly) BOOL isRunning;
@property (nonatomic, readonly) NSUInteger port;

- (instancetype)initWithPort:(NSUInteger)port;
- (BOOL)start;
- (void)stop;

// Browser management
- (NSArray<NSString *> *)connectedBrowsers;
- (BOOL)isBrowserConnected:(BrowserType)browserType;

// Send command to browser
- (void)sendCommand:(NSString *)action
            payload:(NSDictionary *)payload
             browser:(NSString *)browserName
  completionHandler:(void (^)(NSDictionary *response, NSError *error))completion;

@end
