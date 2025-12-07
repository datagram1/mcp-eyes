/**
 * MCP-Eyes HTTP Server
 * Handles HTTP requests for screenshots, window management, input simulation,
 * filesystem operations, and shell commands.
 */

#import <Cocoa/Cocoa.h>

@class FilesystemTools;
@class ShellTools;

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

// Tool instances
@property (nonatomic, strong, readonly) FilesystemTools *filesystemTools;
@property (nonatomic, strong, readonly) ShellTools *shellTools;

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
