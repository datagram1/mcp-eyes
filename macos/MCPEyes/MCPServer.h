/**
 * MCP-Eyes HTTP Server
 * Handles HTTP requests for screenshots, window management, and input simulation
 */

#import <Cocoa/Cocoa.h>

@protocol MCPServerDelegate <NSObject>
@optional
- (void)serverDidStart:(NSUInteger)port;
- (void)serverDidStop;
- (void)serverDidReceiveRequest:(NSString *)path;
@end

@interface MCPServer : NSObject

@property (weak, nonatomic) id<MCPServerDelegate> delegate;
@property (nonatomic, readonly) BOOL isRunning;
@property (nonatomic, readonly) NSUInteger port;
@property (nonatomic, strong) NSString *apiKey;

- (instancetype)initWithPort:(NSUInteger)port apiKey:(NSString *)apiKey;
- (BOOL)start;
- (void)stop;

// Core functionality
- (NSArray *)listApplications;
- (BOOL)focusApplication:(NSString *)identifier;
- (NSData *)takeScreenshot;
- (NSData *)takeScreenshotOfWindow:(CGWindowID)windowID;
- (BOOL)clickAtX:(CGFloat)x y:(CGFloat)y rightButton:(BOOL)rightButton;
- (BOOL)typeText:(NSString *)text;
- (BOOL)pressKey:(NSString *)key;
- (NSDictionary *)checkPermissions;

@end
