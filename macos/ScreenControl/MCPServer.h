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
- (NSDictionary *)launchApplication:(NSString *)identifier;
- (NSDictionary *)closeApplication:(NSString *)identifier force:(BOOL)force;
- (NSData *)takeScreenshot;
- (NSData *)takeScreenshotOfWindow:(CGWindowID)windowID;
- (CGWindowID)getWindowIDForApp:(NSString *)identifier;
- (CGWindowID)getWindowIDForApp:(NSString *)identifier withTitle:(NSString *)titleSubstring;
- (CGWindowID)getWindowIDForCurrentApp;
- (NSDictionary *)getWindowBounds:(CGWindowID)windowID;

// Grid overlay for visual coordinate-based clicking
- (NSData *)addGridOverlayToImageData:(NSData *)imageData columns:(NSInteger)cols rows:(NSInteger)rows;
- (NSDictionary *)gridCoordinatesToPixels:(NSString *)gridRef
                                   column:(NSNumber *)colNum
                                      row:(NSNumber *)rowNum
                                    width:(CGFloat)width
                                   height:(CGFloat)height
                                  columns:(NSInteger)cols
                                     rows:(NSInteger)rows;
- (NSArray *)performOCRAndMapToGrid:(NSData *)imageData
                            columns:(NSInteger)cols
                               rows:(NSInteger)rows;

- (BOOL)clickAtX:(CGFloat)x y:(CGFloat)y rightButton:(BOOL)rightButton;
- (BOOL)clickAbsoluteX:(CGFloat)x y:(CGFloat)y rightButton:(BOOL)rightButton;
- (BOOL)doubleClickAtX:(CGFloat)x y:(CGFloat)y;
- (NSDictionary *)clickElementAtIndex:(NSInteger)index;
- (BOOL)moveMouseToX:(CGFloat)x y:(CGFloat)y;
- (BOOL)scrollDeltaX:(int)deltaX deltaY:(int)deltaY atX:(NSNumber *)x y:(NSNumber *)y;
- (BOOL)dragFromX:(CGFloat)startX y:(CGFloat)startY toX:(CGFloat)endX y:(CGFloat)endY;
- (NSDictionary *)getClickableElements;
- (NSDictionary *)getUIElements;
- (BOOL)typeText:(NSString *)text;
- (BOOL)pressKey:(NSString *)key;
- (NSDictionary *)analyzeWithOCR;
- (NSDictionary *)checkPermissions;

@end
