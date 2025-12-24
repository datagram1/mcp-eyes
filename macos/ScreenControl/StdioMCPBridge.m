/**
 * StdioMCPBridge - Native MCP Server over stdio
 *
 * Provides MCP protocol over stdin/stdout with LOCAL tool execution.
 * No remote server dependency - all tools run natively on this machine.
 */

#import "StdioMCPBridge.h"
#import "MCPServer.h"
#import "BrowserWebSocketServer.h"
#import "FilesystemTools.h"
#import "ShellTools.h"
#import "ServiceClient.h"
#import <Foundation/Foundation.h>

static NSString *const kMCPVersion = @"2024-11-05";
static NSString *const kServerName = @"screencontrol";
static NSString *const kServerVersion = @"1.0.0";

@interface StdioMCPBridge () <BrowserWebSocketServerDelegate>
@property (nonatomic, strong) NSFileHandle *stdinHandle;
@property (nonatomic, strong) NSFileHandle *stdoutHandle;
@property (nonatomic, strong) NSMutableData *stdinBuffer;
@property (nonatomic, assign) BOOL isRunning;

// Local servers
@property (nonatomic, strong) MCPServer *mcpServer;
@property (nonatomic, strong) BrowserWebSocketServer *browserWebSocketServer;

// Service client (for routing shell/fs commands through service when available)
@property (nonatomic, strong) ServiceClient *serviceClient;
@property (nonatomic, assign) BOOL serviceAvailable;

// Current app tracking (for screenshot_app)
@property (nonatomic, strong) NSString *currentAppBundleId;
@property (nonatomic, strong) NSString *currentWindowTitle;  // For multi-window apps (e.g., "Developer Tools")
@property (nonatomic, strong) NSDictionary *currentAppBounds;

// Store detected elements from last screenshot_grid for click_grid precision
@property (nonatomic, strong) NSArray *lastDetectedElements;
@end

@implementation StdioMCPBridge

- (instancetype)init {
    self = [super init];
    if (self) {
        _stdinBuffer = [NSMutableData data];
        _isRunning = NO;
    }
    return self;
}

- (void)start {
    self.isRunning = YES;

    // Set up stdin/stdout
    self.stdinHandle = [NSFileHandle fileHandleWithStandardInput];
    self.stdoutHandle = [NSFileHandle fileHandleWithStandardOutput];

    // Start local MCPServer (port doesn't matter much for stdio mode, but needed for internal use)
    self.mcpServer = [[MCPServer alloc] initWithPort:3456 apiKey:nil];
    [self.mcpServer start];
    [self logError:@"Started local MCPServer"];

    // Start BrowserWebSocketServer for browser extension on port 3458
    // (Port 3457 is used by GUI app, 3459 by ScreenControlService for remote agents)
    self.browserWebSocketServer = [[BrowserWebSocketServer alloc] initWithPort:3458];
    self.browserWebSocketServer.delegate = self;
    BOOL wsStarted = [self.browserWebSocketServer start];
    if (wsStarted) {
        [self logError:@"Started BrowserWebSocketServer on port 3458"];
    } else {
        [self logError:@"WARNING: Failed to start BrowserWebSocketServer on port 3458"];
        [self logError:@"Browser tools will NOT be available."];
    }

    // Check if ScreenControl service is running (for secure shell/fs command routing)
    self.serviceClient = [[ServiceClient alloc] initWithPort:3459];
    [self checkServiceAvailability];

    // Start reading from stdin
    [self startReadingStdin];

    // Run the main run loop
    [[NSRunLoop mainRunLoop] run];
}

- (void)checkServiceAvailability {
    // Check if service is available - do this synchronously on startup
    __block BOOL available = NO;
    dispatch_semaphore_t semaphore = dispatch_semaphore_create(0);

    [self.serviceClient checkHealthWithCompletion:^(BOOL isAvailable, NSDictionary *info, NSError *error) {
        available = isAvailable;
        if (isAvailable) {
            [self logError:@"ScreenControl service detected - shell/fs commands will use service (security hardened)"];
        } else {
            [self logError:@"ScreenControl service not running - shell/fs commands will run locally"];
        }
        dispatch_semaphore_signal(semaphore);
    }];

    // Wait up to 2 seconds for service check
    dispatch_semaphore_wait(semaphore, dispatch_time(DISPATCH_TIME_NOW, 2 * NSEC_PER_SEC));
    self.serviceAvailable = available;
}

- (void)stop {
    self.isRunning = NO;

    if (self.mcpServer) {
        [self.mcpServer stop];
    }
    if (self.browserWebSocketServer) {
        [self.browserWebSocketServer stop];
    }
}

#pragma mark - Stdin Reading

- (void)startReadingStdin {
    dispatch_async(dispatch_get_global_queue(DISPATCH_QUEUE_PRIORITY_DEFAULT, 0), ^{
        while (self.isRunning) {
            @autoreleasepool {
                NSData *data = [self.stdinHandle availableData];
                if (data.length == 0) {
                    // EOF - stdin closed
                    [self stop];
                    exit(0);
                }

                [self.stdinBuffer appendData:data];
                [self processStdinBuffer];
            }
        }
    });
}

- (void)processStdinBuffer {
    // MCP uses newline-delimited JSON
    while (YES) {
        NSRange newlineRange = [self.stdinBuffer rangeOfData:[@"\n" dataUsingEncoding:NSUTF8StringEncoding]
                                                    options:0
                                                      range:NSMakeRange(0, self.stdinBuffer.length)];

        if (newlineRange.location == NSNotFound) {
            break;
        }

        NSData *lineData = [self.stdinBuffer subdataWithRange:NSMakeRange(0, newlineRange.location)];
        [self.stdinBuffer replaceBytesInRange:NSMakeRange(0, newlineRange.location + 1) withBytes:NULL length:0];

        if (lineData.length > 0) {
            [self handleMCPRequest:lineData];
        }
    }
}

- (void)handleMCPRequest:(NSData *)requestData {
    NSError *error;
    NSDictionary *request = [NSJSONSerialization JSONObjectWithData:requestData options:0 error:&error];

    if (error || !request) {
        [self sendMCPError:@"Parse error" code:-32700 id:nil];
        return;
    }

    NSString *method = request[@"method"];
    id requestId = request[@"id"];
    NSDictionary *params = request[@"params"];

    if ([method isEqualToString:@"initialize"]) {
        [self handleInitialize:params id:requestId];
    } else if ([method isEqualToString:@"tools/list"]) {
        [self handleToolsList:params id:requestId];
    } else if ([method isEqualToString:@"tools/call"]) {
        [self handleToolsCall:params id:requestId];
    } else if ([method isEqualToString:@"notifications/initialized"]) {
        // Client notification, no response needed
    } else {
        [self sendMCPError:@"Method not found" code:-32601 id:requestId];
    }
}

#pragma mark - MCP Protocol Handlers

- (void)handleInitialize:(NSDictionary *)params id:(id)requestId {
    NSDictionary *result = @{
        @"protocolVersion": kMCPVersion,
        @"capabilities": @{
            @"tools": @{
                @"listChanged": @YES  // Advertise that we support dynamic tool updates
            }
        },
        @"serverInfo": @{
            @"name": kServerName,
            @"version": kServerVersion
        }
    };

    [self sendMCPResult:result id:requestId];
}

- (void)handleToolsList:(NSDictionary *)params id:(id)requestId {
    NSArray *tools = [self getAvailableTools];
    NSDictionary *response = @{@"tools": tools};
    [self sendMCPResult:response id:requestId];
}

- (void)handleToolsCall:(NSDictionary *)params id:(id)requestId {
    NSString *toolName = params[@"name"];
    NSDictionary *arguments = params[@"arguments"] ?: @{};

    if (!toolName) {
        [self sendMCPError:@"Missing tool name" code:-32602 id:requestId];
        return;
    }

    // Execute tool locally
    NSDictionary *result = [self executeToolLocally:toolName arguments:arguments];

    // Format result as MCP tool result
    NSArray *content = [self formatMCPContent:result];

    NSDictionary *response = @{@"content": content};
    [self sendMCPResult:response id:requestId];
}

#pragma mark - Local Tool Execution

- (NSDictionary *)executeToolLocally:(NSString *)toolName arguments:(NSDictionary *)arguments {
    [self logError:[NSString stringWithFormat:@"Executing tool: %@", toolName]];

    @try {
        // ============= PERMISSIONS =============
        if ([toolName isEqualToString:@"checkPermissions"]) {
            return [self.mcpServer checkPermissions];
        }

        // ============= APPLICATION MANAGEMENT =============
        if ([toolName isEqualToString:@"listApplications"]) {
            return @{@"applications": [self.mcpServer listApplications]};
        }
        if ([toolName isEqualToString:@"focusApplication"]) {
            NSString *identifier = arguments[@"identifier"];
            if (!identifier) return @{@"error": @"identifier is required"};
            BOOL success = [self.mcpServer focusApplication:identifier];
            return @{@"success": @(success)};
        }
        if ([toolName isEqualToString:@"launchApplication"]) {
            NSString *identifier = arguments[@"identifier"];
            if (!identifier) return @{@"error": @"identifier is required"};
            return [self.mcpServer launchApplication:identifier];
        }
        if ([toolName isEqualToString:@"closeApp"]) {
            NSString *identifier = arguments[@"identifier"];
            NSNumber *force = arguments[@"force"] ?: @NO;
            if (!identifier) return @{@"error": @"identifier is required"};
            return [self.mcpServer closeApplication:identifier force:force.boolValue];
        }
        if ([toolName isEqualToString:@"currentApp"]) {
            return self.currentAppBundleId ?
                @{@"bundleId": self.currentAppBundleId, @"bounds": self.currentAppBounds ?: @{}} :
                @{@"bundleId": [NSNull null], @"bounds": @{}};
        }

        // ============= SCREENSHOTS =============
        // Token-safe: Save to file by default to avoid 25k+ token returns
        // Use return_base64:true to get inline base64 (backward compatibility)
        if ([toolName isEqualToString:@"screenshot"] || [toolName isEqualToString:@"desktop_screenshot"]) {
            NSData *imageData = [self.mcpServer takeScreenshot];
            if (!imageData) return @{@"error": @"Failed to take screenshot"};

            NSString *format = arguments[@"format"] ?: @"jpeg";
            BOOL returnBase64 = [arguments[@"return_base64"] boolValue];
            if (returnBase64) {
                // Convert to requested format for base64 return
                NSData *outputData = [self convertImageData:imageData toFormat:format quality:0.8];
                NSString *base64 = [outputData base64EncodedStringWithOptions:0];
                return @{@"image": base64, @"format": format};
            }

            // Save to /tmp file (token-safe default)
            return [self saveScreenshotToFile:imageData prefix:@"desktop" format:format quality:0.8];
        }
        if ([toolName isEqualToString:@"screenshot_app"]) {
            NSString *appIdentifier = arguments[@"identifier"];
            CGWindowID windowID = kCGNullWindowID;
            if (appIdentifier) {
                windowID = [self.mcpServer getWindowIDForApp:appIdentifier];
            } else if (self.currentAppBundleId) {
                windowID = [self.mcpServer getWindowIDForCurrentApp];
            }
            NSData *imageData = nil;
            if (windowID != kCGNullWindowID) {
                imageData = [self.mcpServer takeScreenshotOfWindow:windowID];
            }
            if (!imageData) return @{@"error": @"Failed to take screenshot. No app focused or app not found."};

            NSString *format = arguments[@"format"] ?: @"jpeg";
            BOOL returnBase64 = [arguments[@"return_base64"] boolValue];
            if (returnBase64) {
                NSData *outputData = [self convertImageData:imageData toFormat:format quality:0.8];
                NSString *base64 = [outputData base64EncodedStringWithOptions:0];
                return @{@"image": base64, @"format": format};
            }

            // Save to /tmp file (token-safe default)
            NSString *prefix = appIdentifier ? [appIdentifier stringByReplacingOccurrencesOfString:@"." withString:@"_"] : @"app";
            return [self saveScreenshotToFile:imageData prefix:prefix format:format quality:0.8];
        }
        if ([toolName isEqualToString:@"screenshot_grid"]) {
            // Take screenshot with grid overlay for visual coordinate reference
            NSString *appIdentifier = arguments[@"identifier"];
            NSString *windowTitle = arguments[@"window_title"];  // NEW: Match window by title substring
            NSInteger cols = arguments[@"columns"] ? [arguments[@"columns"] integerValue] : 20;
            NSInteger rows = arguments[@"rows"] ? [arguments[@"rows"] integerValue] : 15;

            // Clamp to reasonable values
            cols = MAX(5, MIN(cols, 40));
            rows = MAX(5, MIN(rows, 30));

            // Get screenshot
            NSData *imageData = nil;
            CGFloat imageWidth = 0;
            CGFloat imageHeight = 0;
            NSDictionary *windowBounds = nil;

            if (appIdentifier) {
                CGWindowID windowID;
                // Use title matching if window_title is provided
                if (windowTitle) {
                    windowID = [self.mcpServer getWindowIDForApp:appIdentifier withTitle:windowTitle];
                    [self logError:[NSString stringWithFormat:@"screenshot_grid: Looking for '%@' window with title containing '%@'",
                                    appIdentifier, windowTitle]];
                } else {
                    windowID = [self.mcpServer getWindowIDForApp:appIdentifier];
                }
                if (windowID != kCGNullWindowID) {
                    imageData = [self.mcpServer takeScreenshotOfWindow:windowID];
                    windowBounds = [self.mcpServer getWindowBounds:windowID];
                    if (windowBounds) {
                        imageWidth = [windowBounds[@"width"] floatValue];
                        imageHeight = [windowBounds[@"height"] floatValue];
                        // Store bounds for subsequent click_grid calls
                        self.currentAppBounds = windowBounds;
                        self.currentAppBundleId = appIdentifier;
                        self.currentWindowTitle = windowTitle;  // Store for click_grid
                    }
                }
            } else if (self.currentAppBundleId) {
                CGWindowID windowID = [self.mcpServer getWindowIDForCurrentApp];
                if (windowID != kCGNullWindowID) {
                    imageData = [self.mcpServer takeScreenshotOfWindow:windowID];
                    if (self.currentAppBounds) {
                        imageWidth = [self.currentAppBounds[@"width"] floatValue];
                        imageHeight = [self.currentAppBounds[@"height"] floatValue];
                    }
                }
            } else {
                imageData = [self.mcpServer takeScreenshot];
                NSScreen *mainScreen = [NSScreen mainScreen];
                imageWidth = mainScreen.frame.size.width;
                imageHeight = mainScreen.frame.size.height;
            }

            if (!imageData) return @{@"error": @"Failed to take screenshot"};

            // Get actual image dimensions if needed
            if (imageWidth == 0 || imageHeight == 0) {
                NSImage *img = [[NSImage alloc] initWithData:imageData];
                if (img) {
                    imageWidth = img.size.width;
                    imageHeight = img.size.height;
                }
            }

            // Run OCR on original image (before grid overlay) to detect text elements
            BOOL skipOCR = [arguments[@"skip_ocr"] boolValue];
            NSArray *detectedElements = @[];
            if (!skipOCR) {
                detectedElements = [self.mcpServer performOCRAndMapToGrid:imageData columns:cols rows:rows];
                // Store for click_grid element matching
                self.lastDetectedElements = detectedElements;
            }

            // Add grid overlay
            NSData *gridImageData = [self.mcpServer addGridOverlayToImageData:imageData columns:cols rows:rows];
            if (!gridImageData) return @{@"error": @"Failed to add grid overlay"};

            // Build response
            NSMutableDictionary *response = [NSMutableDictionary dictionary];
            response[@"columns"] = @(cols);
            response[@"rows"] = @(rows);
            response[@"imageWidth"] = @(imageWidth);
            response[@"imageHeight"] = @(imageHeight);
            response[@"cellWidth"] = @(imageWidth / cols);
            response[@"cellHeight"] = @(imageHeight / rows);

            // Include window position so click_grid knows where to click
            if (windowBounds) {
                response[@"windowBounds"] = windowBounds;
                response[@"windowX"] = windowBounds[@"x"];
                response[@"windowY"] = windowBounds[@"y"];
            } else if (self.currentAppBounds) {
                response[@"windowBounds"] = self.currentAppBounds;
                response[@"windowX"] = self.currentAppBounds[@"x"];
                response[@"windowY"] = self.currentAppBounds[@"y"];
            }

            // Add detected elements with grid positions
            if (detectedElements.count > 0) {
                response[@"elements"] = detectedElements;
                response[@"element_count"] = @(detectedElements.count);
                response[@"usage"] = @"Elements detected with positions. Use click_grid(element=INDEX) for precise clicking at element center, or click_grid(element_text='TEXT') to click by text match, or click_grid(cell='XX') for cell center.";
            } else {
                response[@"elements"] = @[];
                response[@"element_count"] = @0;
                response[@"usage"] = @"No text detected. View image and use click_grid with cell reference like 'E7'";
            }

            BOOL returnBase64 = [arguments[@"return_base64"] boolValue];
            if (returnBase64) {
                response[@"image"] = [gridImageData base64EncodedStringWithOptions:0];
                response[@"format"] = @"png";
            } else {
                NSString *prefix = appIdentifier ? [NSString stringWithFormat:@"%@_grid", [appIdentifier stringByReplacingOccurrencesOfString:@"." withString:@"_"]] : @"grid";
                NSDictionary *fileResult = [self saveScreenshotToFile:gridImageData prefix:prefix format:@"png" quality:1.0];
                [response addEntriesFromDictionary:fileResult];
            }

            return response;
        }

        // ============= MOUSE ACTIONS =============
        if ([toolName isEqualToString:@"click"]) {
            NSNumber *x = arguments[@"x"];
            NSNumber *y = arguments[@"y"];
            if (!x || !y) return @{@"error": @"x and y are required"};
            NSString *button = arguments[@"button"] ?: @"left";
            BOOL success = [self.mcpServer clickAtX:x.floatValue y:y.floatValue rightButton:[button isEqualToString:@"right"]];
            return @{@"success": @(success)};
        }
        if ([toolName isEqualToString:@"click_absolute"]) {
            NSNumber *x = arguments[@"x"];
            NSNumber *y = arguments[@"y"];
            if (!x || !y) return @{@"error": @"x and y are required"};
            NSString *button = arguments[@"button"] ?: @"left";
            BOOL success = [self.mcpServer clickAbsoluteX:x.floatValue y:y.floatValue rightButton:[button isEqualToString:@"right"]];
            return @{@"success": @(success)};
        }
        if ([toolName isEqualToString:@"click_relative"]) {
            // Click at pixel coordinates relative to a window
            NSNumber *x = arguments[@"x"];
            NSNumber *y = arguments[@"y"];
            if (!x || !y) return @{@"error": @"x and y are required"};
            NSString *identifier = arguments[@"identifier"];
            NSString *button = arguments[@"button"] ?: @"left";
            BOOL shouldFocus = arguments[@"focus"] ? [arguments[@"focus"] boolValue] : YES;

            // Get window bounds
            CGFloat offsetX = 0;
            CGFloat offsetY = 0;
            NSDictionary *windowBounds = nil;

            if (identifier) {
                CGWindowID windowID = [self.mcpServer getWindowIDForApp:identifier];
                if (windowID != kCGNullWindowID) {
                    windowBounds = [self.mcpServer getWindowBounds:windowID];
                    if (windowBounds) {
                        offsetX = [windowBounds[@"x"] floatValue];
                        offsetY = [windowBounds[@"y"] floatValue];
                    }
                }
            } else if (self.currentAppBounds) {
                windowBounds = self.currentAppBounds;
                offsetX = [self.currentAppBounds[@"x"] floatValue];
                offsetY = [self.currentAppBounds[@"y"] floatValue];
                identifier = self.currentAppBundleId;
            }

            if (!windowBounds) {
                return @{@"error": @"No window bounds available. Either specify 'identifier' or call screenshot_grid first."};
            }

            // Calculate absolute coordinates
            CGFloat absX = offsetX + x.floatValue;
            CGFloat absY = offsetY + y.floatValue;

            // Focus the window before clicking
            BOOL focusPerformed = NO;
            if (shouldFocus && identifier) {
                focusPerformed = [self.mcpServer focusApplication:identifier];
                usleep(100000); // 100ms delay after focus
            }

            // Perform click
            BOOL success = [self.mcpServer clickAbsoluteX:absX y:absY rightButton:[button isEqualToString:@"right"]];

            return @{
                @"success": @(success),
                @"relativeCoords": @{@"x": x, @"y": y},
                @"absoluteCoords": @{@"x": @(absX), @"y": @(absY)},
                @"windowBounds": windowBounds,
                @"focusPerformed": @(focusPerformed),
                @"identifier": identifier ?: @"none"
            };
        }
        if ([toolName isEqualToString:@"click_grid"]) {
            // Click using grid coordinates from screenshot_grid OR element index/text
            NSString *cellRef = arguments[@"cell"];
            NSNumber *column = arguments[@"column"];
            NSNumber *row = arguments[@"row"];
            NSNumber *elementIndex = arguments[@"element"];  // 0-based index into detected elements
            NSString *elementText = arguments[@"element_text"];  // Text to search for (case-insensitive)
            NSInteger cols = arguments[@"columns"] ? [arguments[@"columns"] integerValue] : 20;
            NSInteger rows = arguments[@"rows"] ? [arguments[@"rows"] integerValue] : 15;
            NSString *button = arguments[@"button"] ?: @"left";
            NSString *identifier = arguments[@"identifier"];

            // Focus parameter: if true (default), focus the window before clicking
            // This is critical for multi-monitor setups and background windows
            BOOL shouldFocus = arguments[@"focus"] ? [arguments[@"focus"] boolValue] : YES;

            // Offset parameters for fine-tuning click position (e.g., click 60px below detected text to hit a button)
            CGFloat clickOffsetX = arguments[@"offset_x"] ? [arguments[@"offset_x"] floatValue] : 0;
            CGFloat clickOffsetY = arguments[@"offset_y"] ? [arguments[@"offset_y"] floatValue] : 0;

            // Check for element-based clicking first
            NSDictionary *matchedElement = nil;
            if (elementIndex != nil && self.lastDetectedElements.count > 0) {
                NSInteger idx = [elementIndex integerValue];
                if (idx >= 0 && idx < (NSInteger)self.lastDetectedElements.count) {
                    matchedElement = self.lastDetectedElements[idx];
                } else {
                    return @{@"error": [NSString stringWithFormat:@"Element index %ld out of range (0-%ld available)",
                                       (long)idx, (long)self.lastDetectedElements.count - 1]};
                }
            } else if (elementText && self.lastDetectedElements.count > 0) {
                NSString *searchText = [elementText lowercaseString];
                for (NSDictionary *elem in self.lastDetectedElements) {
                    NSString *text = [elem[@"text"] lowercaseString];
                    if ([text containsString:searchText]) {
                        matchedElement = elem;
                        break;
                    }
                }
                if (!matchedElement) {
                    // Try exact match
                    for (NSDictionary *elem in self.lastDetectedElements) {
                        if ([[elem[@"text"] lowercaseString] isEqualToString:searchText]) {
                            matchedElement = elem;
                            break;
                        }
                    }
                }
                if (!matchedElement) {
                    return @{@"error": [NSString stringWithFormat:@"No element found matching text '%@'. Available: %@",
                                       elementText, [[self.lastDetectedElements valueForKey:@"text"] componentsJoinedByString:@", "]]};
                }
            }

            // If no element found and no cell/column/row specified, error
            if (!matchedElement && !cellRef && (!column || !row)) {
                return @{@"error": @"Either 'cell' (e.g., 'E7'), both 'column' and 'row', 'element' (index), or 'element_text' are required"};
            }

            // Get target dimensions and offset
            CGFloat targetWidth = 0;
            CGFloat targetHeight = 0;
            CGFloat offsetX = 0;
            CGFloat offsetY = 0;
            NSDictionary *usedBounds = nil;
            NSString *windowTitle = arguments[@"window_title"];

            // If identifier provided, look up window bounds freshly
            if (identifier) {
                CGWindowID windowID;
                // Use title matching if window_title is provided, or use stored title from screenshot_grid
                NSString *titleToUse = windowTitle ?: self.currentWindowTitle;
                if (titleToUse) {
                    windowID = [self.mcpServer getWindowIDForApp:identifier withTitle:titleToUse];
                } else {
                    windowID = [self.mcpServer getWindowIDForApp:identifier];
                }
                if (windowID != kCGNullWindowID) {
                    NSDictionary *bounds = [self.mcpServer getWindowBounds:windowID];
                    if (bounds) {
                        targetWidth = [bounds[@"width"] floatValue];
                        targetHeight = [bounds[@"height"] floatValue];
                        offsetX = [bounds[@"x"] floatValue];
                        offsetY = [bounds[@"y"] floatValue];
                        usedBounds = bounds;
                        // Update stored bounds
                        self.currentAppBounds = bounds;
                        self.currentAppBundleId = identifier;
                        if (windowTitle) self.currentWindowTitle = windowTitle;
                    }
                }
            }

            // Fall back to stored bounds if identifier not provided or lookup failed
            if (targetWidth == 0 && self.currentAppBounds) {
                targetWidth = [self.currentAppBounds[@"width"] floatValue];
                targetHeight = [self.currentAppBounds[@"height"] floatValue];
                offsetX = [self.currentAppBounds[@"x"] floatValue];
                offsetY = [self.currentAppBounds[@"y"] floatValue];
                usedBounds = self.currentAppBounds;
            }

            // Fall back to full screen if no bounds available
            if (targetWidth == 0) {
                NSScreen *mainScreen = [NSScreen mainScreen];
                targetWidth = mainScreen.frame.size.width;
                targetHeight = mainScreen.frame.size.height;
                usedBounds = @{@"x": @0, @"y": @0, @"width": @(targetWidth), @"height": @(targetHeight), @"source": @"fullscreen"};
            }

            CGFloat clickX, clickY;
            NSMutableDictionary *result = [NSMutableDictionary dictionary];

            if (matchedElement) {
                // Use exact element center for precise clicking
                CGFloat elemCenterX = [matchedElement[@"centerX"] floatValue];
                CGFloat elemCenterY = [matchedElement[@"centerY"] floatValue];
                clickX = offsetX + elemCenterX;
                clickY = offsetY + elemCenterY;
                result[@"matchedElement"] = @{
                    @"text": matchedElement[@"text"],
                    @"cell": matchedElement[@"cell"],
                    @"centerX": @(elemCenterX),
                    @"centerY": @(elemCenterY)
                };
                result[@"clickMode"] = @"element_precise";
            } else {
                // Fall back to grid cell center
                NSDictionary *coords = [self.mcpServer gridCoordinatesToPixels:cellRef
                                                                       column:column
                                                                          row:row
                                                                        width:targetWidth
                                                                       height:targetHeight
                                                                      columns:cols
                                                                         rows:rows];

                if (coords[@"error"]) return coords;

                clickX = offsetX + [coords[@"pixelX"] floatValue];
                clickY = offsetY + [coords[@"pixelY"] floatValue];
                result[@"cell"] = cellRef ?: [NSString stringWithFormat:@"%c%ld", (char)('A' + [column integerValue] - 1), (long)[row integerValue]];
                result[@"gridInfo"] = coords;
                result[@"clickMode"] = @"grid_cell_center";
            }

            // Apply user-specified offset (for clicking relative to detected element or cell)
            clickX += clickOffsetX;
            clickY += clickOffsetY;
            if (clickOffsetX != 0 || clickOffsetY != 0) {
                result[@"appliedOffset"] = @{@"x": @(clickOffsetX), @"y": @(clickOffsetY)};
            }

            // Focus the window before clicking (critical for multi-monitor and background windows)
            BOOL focusPerformed = NO;
            NSString *focusTarget = identifier ?: self.currentAppBundleId;
            if (shouldFocus && focusTarget) {
                focusPerformed = [self.mcpServer focusApplication:focusTarget];
                // Brief additional delay after focus to ensure window is frontmost
                usleep(100000); // 100ms
            }
            result[@"focusPerformed"] = @(focusPerformed);
            result[@"focusTarget"] = focusTarget ?: @"none";

            // Perform click using absolute coordinates with warp for reliability
            BOOL success = [self.mcpServer clickAbsoluteX:clickX y:clickY rightButton:[button isEqualToString:@"right"]];

            result[@"success"] = @(success);
            result[@"clickedAt"] = @{@"x": @(clickX), @"y": @(clickY)};
            if (usedBounds) {
                result[@"windowBounds"] = usedBounds;
            }
            if (identifier) {
                result[@"identifier"] = identifier;
            } else if (self.currentAppBundleId) {
                result[@"identifier"] = self.currentAppBundleId;
            }
            return result;
        }
        if ([toolName isEqualToString:@"doubleClick"]) {
            NSNumber *x = arguments[@"x"];
            NSNumber *y = arguments[@"y"];
            if (!x || !y) return @{@"error": @"x and y are required"};
            BOOL success = [self.mcpServer doubleClickAtX:x.floatValue y:y.floatValue];
            return @{@"success": @(success)};
        }
        if ([toolName isEqualToString:@"clickElement"]) {
            NSNumber *elementIndex = arguments[@"elementIndex"];
            if (!elementIndex) return @{@"error": @"elementIndex is required"};
            return [self.mcpServer clickElementAtIndex:elementIndex.integerValue];
        }
        if ([toolName isEqualToString:@"moveMouse"]) {
            NSNumber *x = arguments[@"x"];
            NSNumber *y = arguments[@"y"];
            if (!x || !y) return @{@"error": @"x and y are required"};
            BOOL success = [self.mcpServer moveMouseToX:x.floatValue y:y.floatValue];
            return @{@"success": @(success)};
        }
        if ([toolName isEqualToString:@"getMousePosition"]) {
            CGPoint mouseLocation = [NSEvent mouseLocation];
            NSScreen *mainScreen = [NSScreen mainScreen];
            CGFloat screenHeight = mainScreen.frame.size.height;
            return @{@"x": @(mouseLocation.x), @"y": @(screenHeight - mouseLocation.y)};
        }

        // ============= SCROLL AND DRAG =============
        if ([toolName isEqualToString:@"scroll"]) {
            NSNumber *deltaX = arguments[@"deltaX"] ?: @0;
            NSNumber *deltaY = arguments[@"deltaY"] ?: @0;
            NSNumber *x = arguments[@"x"];
            NSNumber *y = arguments[@"y"];
            BOOL success = [self.mcpServer scrollDeltaX:deltaX.intValue deltaY:deltaY.intValue atX:x y:y];
            return @{@"success": @(success)};
        }
        if ([toolName isEqualToString:@"scrollMouse"]) {
            NSString *direction = arguments[@"direction"];
            NSNumber *amount = arguments[@"amount"] ?: @3;
            if (!direction) return @{@"error": @"direction is required (up or down)"};
            int deltaY = [direction isEqualToString:@"up"] ? amount.intValue : -amount.intValue;
            BOOL success = [self.mcpServer scrollDeltaX:0 deltaY:deltaY atX:nil y:nil];
            return @{@"success": @(success), @"direction": direction, @"amount": amount};
        }
        if ([toolName isEqualToString:@"drag"]) {
            NSNumber *startX = arguments[@"startX"];
            NSNumber *startY = arguments[@"startY"];
            NSNumber *endX = arguments[@"endX"];
            NSNumber *endY = arguments[@"endY"];
            if (!startX || !startY || !endX || !endY) return @{@"error": @"startX, startY, endX, and endY are required"};
            BOOL success = [self.mcpServer dragFromX:startX.floatValue y:startY.floatValue toX:endX.floatValue y:endY.floatValue];
            return @{@"success": @(success)};
        }

        // ============= UI ELEMENTS =============
        if ([toolName isEqualToString:@"getClickableElements"]) {
            return [self.mcpServer getClickableElements];
        }
        if ([toolName isEqualToString:@"getUIElements"]) {
            return [self.mcpServer getUIElements];
        }

        // ============= KEYBOARD INPUT =============
        if ([toolName isEqualToString:@"typeText"]) {
            NSString *text = arguments[@"text"];
            if (!text) return @{@"error": @"text is required"};
            BOOL success = [self.mcpServer typeText:text];
            return @{@"success": @(success)};
        }
        if ([toolName isEqualToString:@"pressKey"]) {
            NSString *key = arguments[@"key"];
            if (!key) return @{@"error": @"key is required"};
            BOOL success = [self.mcpServer pressKey:key];
            return @{@"success": @(success)};
        }

        // ============= OCR =============
        if ([toolName isEqualToString:@"analyzeWithOCR"]) {
            return [self.mcpServer analyzeWithOCR];
        }

        // ============= UTILITY =============
        if ([toolName isEqualToString:@"wait"]) {
            NSNumber *ms = arguments[@"milliseconds"] ?: arguments[@"ms"] ?: @1000;
            [NSThread sleepForTimeInterval:ms.doubleValue / 1000.0];
            return @{@"success": @YES, @"waited_ms": ms};
        }

        // ============= SYSTEM INFO =============
        if ([toolName isEqualToString:@"system_info"]) {
            NSProcessInfo *processInfo = [NSProcessInfo processInfo];
            NSOperatingSystemVersion osVersion = processInfo.operatingSystemVersion;

            // Get memory info
            unsigned long long physicalMemory = processInfo.physicalMemory;
            double memoryGB = physicalMemory / (1024.0 * 1024.0 * 1024.0);

            // Get CPU info
            NSUInteger cpuCount = processInfo.processorCount;
            NSUInteger activeCPUs = processInfo.activeProcessorCount;

            return @{
                @"hostname": processInfo.hostName,
                @"os": @"macOS",
                @"osVersion": [NSString stringWithFormat:@"%ld.%ld.%ld",
                              (long)osVersion.majorVersion,
                              (long)osVersion.minorVersion,
                              (long)osVersion.patchVersion],
                @"osBuild": [[NSProcessInfo processInfo] operatingSystemVersionString],
                @"cpuCores": @(cpuCount),
                @"activeCpuCores": @(activeCPUs),
                @"memoryGB": @(memoryGB),
                @"memoryBytes": @(physicalMemory),
                @"systemUptime": @(processInfo.systemUptime),
                @"userName": NSUserName(),
                @"homeDirectory": NSHomeDirectory()
            };
        }

        // ============= WINDOW LIST =============
        if ([toolName isEqualToString:@"window_list"]) {
            NSMutableArray *windows = [NSMutableArray array];

            // Get all windows using CGWindowListCopyWindowInfo
            CFArrayRef windowList = CGWindowListCopyWindowInfo(
                kCGWindowListOptionOnScreenOnly | kCGWindowListExcludeDesktopElements,
                kCGNullWindowID
            );

            if (windowList) {
                NSArray *windowArray = (__bridge_transfer NSArray *)windowList;
                for (NSDictionary *window in windowArray) {
                    NSString *ownerName = window[(NSString *)kCGWindowOwnerName];
                    NSString *windowName = window[(NSString *)kCGWindowName];
                    NSNumber *windowID = window[(NSString *)kCGWindowNumber];
                    NSNumber *layer = window[(NSString *)kCGWindowLayer];
                    NSDictionary *bounds = window[(NSString *)kCGWindowBounds];

                    // Skip windows without owner or with layer < 0 (system UI)
                    if (!ownerName || [layer intValue] < 0) continue;

                    NSMutableDictionary *windowInfo = [NSMutableDictionary dictionary];
                    windowInfo[@"id"] = windowID;
                    windowInfo[@"app"] = ownerName;
                    if (windowName && windowName.length > 0) {
                        windowInfo[@"title"] = windowName;
                    }
                    if (bounds) {
                        windowInfo[@"bounds"] = bounds;
                    }
                    windowInfo[@"layer"] = layer;

                    [windows addObject:windowInfo];
                }
            }

            return @{@"windows": windows, @"count": @(windows.count)};
        }

        // ============= CLIPBOARD =============
        if ([toolName isEqualToString:@"clipboard_read"]) {
            NSPasteboard *pasteboard = [NSPasteboard generalPasteboard];
            NSString *text = [pasteboard stringForType:NSPasteboardTypeString];
            if (text) {
                return @{@"text": text, @"success": @YES};
            } else {
                // Check for other content types
                NSArray *types = [pasteboard types];
                return @{@"text": [NSNull null], @"availableTypes": types, @"message": @"No text content in clipboard"};
            }
        }
        if ([toolName isEqualToString:@"clipboard_write"]) {
            NSString *text = arguments[@"text"];
            if (!text) return @{@"error": @"text is required"};

            NSPasteboard *pasteboard = [NSPasteboard generalPasteboard];
            [pasteboard clearContents];
            BOOL success = [pasteboard setString:text forType:NSPasteboardTypeString];
            return @{@"success": @(success)};
        }

        // ============= FILESYSTEM TOOLS =============
        // Route through service when available (security hardened with protected paths)
        if ([toolName hasPrefix:@"fs_"]) {
            if (self.serviceAvailable) {
                NSDictionary *result = [self executeToolViaService:toolName arguments:arguments];
                if (result && !result[@"service_unavailable"]) {
                    return result;
                }
                // Fall through to local execution if service call failed
                [self logError:@"Service unavailable, falling back to local filesystem execution"];
            }

            // Local execution fallback
            if ([toolName isEqualToString:@"fs_list"]) {
                NSString *path = arguments[@"path"];
                if (!path) return @{@"error": @"path is required"};
                BOOL recursive = [arguments[@"recursive"] boolValue];
                NSInteger maxDepth = arguments[@"max_depth"] ? [arguments[@"max_depth"] integerValue] : 3;
                return [self.mcpServer.filesystemTools listDirectory:path recursive:recursive maxDepth:maxDepth];
            }
            if ([toolName isEqualToString:@"fs_read"]) {
                NSString *path = arguments[@"path"];
                if (!path) return @{@"error": @"path is required"};
                NSInteger maxBytes = arguments[@"max_bytes"] ? [arguments[@"max_bytes"] integerValue] : 131072;
                return [self.mcpServer.filesystemTools readFile:path maxBytes:maxBytes];
            }
            if ([toolName isEqualToString:@"fs_read_range"]) {
                NSString *path = arguments[@"path"];
                NSNumber *start = arguments[@"start_line"];
                NSNumber *end = arguments[@"end_line"];
                if (!path) return @{@"error": @"path is required"};
                return [self.mcpServer.filesystemTools readFileRange:path startLine:start.integerValue endLine:end.integerValue];
            }
            if ([toolName isEqualToString:@"fs_write"]) {
                NSString *path = arguments[@"path"];
                NSString *content = arguments[@"content"];
                if (!path || !content) return @{@"error": @"path and content are required"};
                BOOL createDirs = arguments[@"create_directories"] ? [arguments[@"create_directories"] boolValue] : YES;
                NSString *mode = arguments[@"mode"] ?: @"overwrite";
                return [self.mcpServer.filesystemTools writeFile:path content:content createDirs:createDirs mode:mode];
            }
            if ([toolName isEqualToString:@"fs_delete"]) {
                NSString *path = arguments[@"path"];
                if (!path) return @{@"error": @"path is required"};
                BOOL recursive = [arguments[@"recursive"] boolValue];
                return [self.mcpServer.filesystemTools deletePath:path recursive:recursive];
            }
            if ([toolName isEqualToString:@"fs_move"]) {
                NSString *source = arguments[@"source"];
                NSString *dest = arguments[@"destination"];
                if (!source || !dest) return @{@"error": @"source and destination are required"};
                return [self.mcpServer.filesystemTools movePath:source toPath:dest];
            }
            if ([toolName isEqualToString:@"fs_search"]) {
                NSString *path = arguments[@"path"];
                NSString *pattern = arguments[@"pattern"];
                if (!path || !pattern) return @{@"error": @"path and pattern are required"};
                NSInteger maxResults = arguments[@"max_results"] ? [arguments[@"max_results"] integerValue] : 200;
                return [self.mcpServer.filesystemTools searchFiles:path glob:pattern maxResults:maxResults];
            }
            if ([toolName isEqualToString:@"fs_grep"]) {
                NSString *path = arguments[@"path"];
                NSString *pattern = arguments[@"pattern"];
                if (!path || !pattern) return @{@"error": @"path and pattern are required"};
                NSString *glob = arguments[@"glob"];
                NSInteger maxMatches = arguments[@"max_matches"] ? [arguments[@"max_matches"] integerValue] : 200;
                return [self.mcpServer.filesystemTools grepFiles:path pattern:pattern glob:glob maxMatches:maxMatches];
            }
            if ([toolName isEqualToString:@"fs_patch"]) {
                NSString *path = arguments[@"path"];
                NSArray *operations = arguments[@"operations"];
                if (!path || !operations) return @{@"error": @"path and operations are required"};
                BOOL dryRun = [arguments[@"dry_run"] boolValue];
                return [self.mcpServer.filesystemTools patchFile:path operations:operations dryRun:dryRun];
            }
        }

        // ============= SHELL TOOLS =============
        // Route through service when available (security hardened with blocked commands)
        if ([toolName hasPrefix:@"shell_"]) {
            if (self.serviceAvailable) {
                NSDictionary *result = [self executeToolViaService:toolName arguments:arguments];
                if (result && !result[@"service_unavailable"]) {
                    return result;
                }
                // Fall through to local execution if service call failed
                [self logError:@"Service unavailable, falling back to local shell execution"];
            }

            // Local execution fallback
            if ([toolName isEqualToString:@"shell_exec"]) {
                NSString *command = arguments[@"command"];
                if (!command) return @{@"error": @"command is required"};
                NSString *cwd = arguments[@"cwd"];
                NSTimeInterval timeout = [arguments[@"timeout_seconds"] doubleValue] ?: 600;
                BOOL captureStderr = arguments[@"capture_stderr"] ? [arguments[@"capture_stderr"] boolValue] : YES;
                return [self.mcpServer.shellTools executeCommand:command cwd:cwd timeoutSeconds:timeout captureStderr:captureStderr];
            }
            if ([toolName isEqualToString:@"shell_start_session"]) {
                NSString *command = arguments[@"command"];
                if (!command) return @{@"error": @"command is required"};
                NSString *cwd = arguments[@"cwd"];
                NSDictionary *env = arguments[@"env"];
                BOOL captureStderr = arguments[@"capture_stderr"] ? [arguments[@"capture_stderr"] boolValue] : YES;
                return [self.mcpServer.shellTools startSession:command cwd:cwd env:env captureStderr:captureStderr];
            }
            if ([toolName isEqualToString:@"shell_send_input"]) {
                NSString *sessionId = arguments[@"session_id"];
                NSString *input = arguments[@"input"];
                if (!sessionId || !input) return @{@"error": @"session_id and input are required"};
                return [self.mcpServer.shellTools sendInput:sessionId input:input];
            }
            if ([toolName isEqualToString:@"shell_stop_session"]) {
                NSString *sessionId = arguments[@"session_id"];
                if (!sessionId) return @{@"error": @"session_id is required"};
                NSString *signal = arguments[@"signal"] ?: @"TERM";
                return [self.mcpServer.shellTools stopSession:sessionId signal:signal];
            }
        }

        // ============= BROWSER TOOLS =============
        if ([toolName hasPrefix:@"browser_"]) {
            return [self executeBrowserTool:toolName arguments:arguments];
        }

        return @{@"error": [NSString stringWithFormat:@"Unknown tool: %@", toolName]};

    } @catch (NSException *exception) {
        return @{@"error": [NSString stringWithFormat:@"Tool execution failed: %@", exception.reason]};
    }
}

- (NSDictionary *)executeBrowserTool:(NSString *)toolName arguments:(NSDictionary *)arguments {
    // Remove "browser_" prefix to get the action name
    NSString *action = [toolName substringFromIndex:8];
    NSString *browserName = arguments[@"browser"];

    // Forward to browser bridge server via HTTP
    __block NSDictionary *result = nil;
    __block BOOL completed = NO;

    NSURL *url = [NSURL URLWithString:@"http://127.0.0.1:3457/command"];
    NSMutableURLRequest *request = [NSMutableURLRequest requestWithURL:url];
    request.HTTPMethod = @"POST";
    [request setValue:@"application/json" forHTTPHeaderField:@"Content-Type"];
    request.timeoutInterval = 30.0;

    NSMutableDictionary *body = [NSMutableDictionary dictionaryWithDictionary:@{
        @"action": action,
        @"payload": arguments ?: @{}
    }];
    if (browserName) {
        body[@"browser"] = browserName;
    }

    NSError *serializeError = nil;
    request.HTTPBody = [NSJSONSerialization dataWithJSONObject:body options:0 error:&serializeError];

    if (serializeError) {
        return @{@"error": [NSString stringWithFormat:@"Failed to serialize request: %@", serializeError.localizedDescription]};
    }

    [[NSURLSession.sharedSession dataTaskWithRequest:request completionHandler:^(NSData *data, NSURLResponse *response, NSError *error) {
        if (error) {
            result = @{@"error": [NSString stringWithFormat:@"Browser bridge error: %@", error.localizedDescription]};
            completed = YES;
            return;
        }

        NSHTTPURLResponse *httpResponse = (NSHTTPURLResponse *)response;
        if (httpResponse.statusCode != 200) {
            result = @{@"error": [NSString stringWithFormat:@"HTTP %ld", (long)httpResponse.statusCode]};
            completed = YES;
            return;
        }

        NSError *parseError = nil;
        NSDictionary *responseDict = [NSJSONSerialization JSONObjectWithData:data options:0 error:&parseError];

        if (parseError) {
            result = @{@"error": [NSString stringWithFormat:@"Failed to parse response: %@", parseError.localizedDescription]};
        } else if (responseDict[@"error"]) {
            result = @{@"error": responseDict[@"error"]};
        } else {
            result = responseDict ?: @{@"success": @YES};
        }
        completed = YES;
    }] resume];

    // Wait for response (with timeout)
    NSDate *timeout = [NSDate dateWithTimeIntervalSinceNow:30.0];
    while (!completed && [timeout timeIntervalSinceNow] > 0) {
        [[NSRunLoop currentRunLoop] runMode:NSDefaultRunLoopMode beforeDate:[NSDate dateWithTimeIntervalSinceNow:0.1]];
    }

    if (!completed) {
        return @{@"error": @"Browser command timed out after 30 seconds"};
    }

    // Token-safe post-processing for large responses
    result = [self postProcessBrowserResult:result action:action arguments:arguments];

    return result;
}

- (NSDictionary *)postProcessBrowserResult:(NSDictionary *)result action:(NSString *)action arguments:(NSDictionary *)arguments {
    if (!result || result[@"error"]) {
        return result;
    }

    // Handle screenshot - save to /tmp file by default
    if ([action isEqualToString:@"screenshot"]) {
        NSString *screenshot = result[@"screenshot"];
        if (screenshot && [screenshot isKindOfClass:[NSString class]]) {
            BOOL returnBase64 = [arguments[@"return_base64"] boolValue];
            NSString *format = arguments[@"format"] ?: @"jpeg";

            if (!returnBase64) {
                // Extract base64 data (remove data URL prefix if present)
                NSString *base64Data = screenshot;
                if ([screenshot hasPrefix:@"data:image"]) {
                    NSRange commaRange = [screenshot rangeOfString:@","];
                    if (commaRange.location != NSNotFound) {
                        base64Data = [screenshot substringFromIndex:commaRange.location + 1];
                    }
                }

                NSData *imageData = [[NSData alloc] initWithBase64EncodedString:base64Data options:0];
                if (imageData) {
                    return [self saveScreenshotToFile:imageData prefix:@"browser" format:format quality:0.8];
                }
            } else {
                // Return as base64 but convert to requested format
                NSString *base64Data = screenshot;
                if ([screenshot hasPrefix:@"data:image"]) {
                    NSRange commaRange = [screenshot rangeOfString:@","];
                    if (commaRange.location != NSNotFound) {
                        base64Data = [screenshot substringFromIndex:commaRange.location + 1];
                    }
                }
                NSData *imageData = [[NSData alloc] initWithBase64EncodedString:base64Data options:0];
                if (imageData) {
                    NSData *outputData = [self convertImageData:imageData toFormat:format quality:0.8];
                    NSString *base64 = [outputData base64EncodedStringWithOptions:0];
                    return @{@"image": base64, @"format": format};
                }
            }
        }
        return result;
    }

    // Handle interactive elements - summarize by default
    if ([action isEqualToString:@"getInteractiveElements"] ||
        [action isEqualToString:@"getUIElements"] ||
        [action isEqualToString:@"listInteractiveElements"]) {

        BOOL verbose = [arguments[@"verbose"] boolValue];
        if (!verbose) {
            // Check if result is an array (elements directly) or dict with elements key
            NSArray *elements = nil;
            if ([result isKindOfClass:[NSArray class]]) {
                elements = (NSArray *)result;
            } else if (result[@"elements"]) {
                elements = result[@"elements"];
            }

            if (elements) {
                return [self summarizeInteractiveElements:elements];
            }
        }
    }

    return result;
}

#pragma mark - Browser Bridge Check

- (BOOL)checkBrowserBridgeAvailable {
    // Check if browser tools are available from any source:
    // 1. Our own local WebSocket server (if we bound to 3458)
    // 2. The GUI app on port 3457 (shared by all Claude Code instances)
    //
    // This allows all Claude Code instances to see browser tools if the GUI app
    // has browsers connected, even if this instance couldn't bind to port 3458.

    // First check our local WebSocket server
    BOOL wsExists = self.browserWebSocketServer != nil;
    BOOL wsRunning = self.browserWebSocketServer.isRunning;
    NSUInteger browserCount = [self.browserWebSocketServer connectedBrowserCount];  // Thread-safe accessor
    [self logError:[NSString stringWithFormat:@"Browser bridge check: wsExists=%d, wsRunning=%d, browserCount=%lu",
                    wsExists, wsRunning, (unsigned long)browserCount]];

    if (wsExists && wsRunning && browserCount > 0) {
        [self logError:@"Browser bridge: using local WebSocket server (port 3458)"];
        return YES;
    }

    // Check the GUI app on port 3457 via /command endpoint with listConnected action
    __block BOOL available = NO;
    dispatch_semaphore_t semaphore = dispatch_semaphore_create(0);

    NSURL *url = [NSURL URLWithString:@"http://127.0.0.1:3457/command"];
    NSMutableURLRequest *request = [NSMutableURLRequest requestWithURL:url];
    request.HTTPMethod = @"POST";
    [request setValue:@"application/json" forHTTPHeaderField:@"Content-Type"];
    request.timeoutInterval = 1.0;  // Quick timeout for tool listing

    // Send a getTabs command to check if browser bridge is responsive and has browsers connected
    NSDictionary *body = @{@"action": @"getTabs", @"payload": @{}};
    request.HTTPBody = [NSJSONSerialization dataWithJSONObject:body options:0 error:nil];

    [[NSURLSession.sharedSession dataTaskWithRequest:request completionHandler:^(NSData *data, NSURLResponse *response, NSError *error) {
        if (!error && data) {
            NSHTTPURLResponse *httpResponse = (NSHTTPURLResponse *)response;
            if (httpResponse.statusCode == 200) {
                // GUI app browser bridge is running and browser is connected
                NSDictionary *result = [NSJSONSerialization JSONObjectWithData:data options:0 error:nil];
                if (result[@"result"]) {
                    // Got tabs - browser is connected
                    [self logError:@"Browser bridge: using GUI app (port 3457) with connected browser"];
                    available = YES;
                } else if (result[@"error"]) {
                    // Got error (e.g., "No browser connected")
                    // Still show tools - they'll fail gracefully with helpful message
                    [self logError:[NSString stringWithFormat:@"Browser bridge: GUI app running but: %@", result[@"error"]]];
                    available = YES;
                } else {
                    // Some other response - assume bridge is available
                    [self logError:@"Browser bridge: GUI app responding"];
                    available = YES;
                }
            }
        }
        dispatch_semaphore_signal(semaphore);
    }] resume];

    // Wait up to 1 second for response
    dispatch_semaphore_wait(semaphore, dispatch_time(DISPATCH_TIME_NOW, 1 * NSEC_PER_SEC));

    if (!available) {
        [self logError:@"Browser bridge: not available (no response from port 3457)"];
    }

    return available;
}

#pragma mark - Tool Definitions

- (NSArray *)getAvailableTools {
    NSMutableArray *tools = [NSMutableArray array];

    // Check if browser tools are available via the GUI app on port 3457
    // This allows all Claude Code instances to see browser tools if the GUI app has browsers connected
    // We check 3457 (GUI app) which handles browser connections for all instances
    BOOL includeBrowserTools = [self checkBrowserBridgeAvailable];

    [self logError:[NSString stringWithFormat:@"Building tool list - Browser bridge available: %@",
                    includeBrowserTools ? @"YES" : @"NO"]];

    // Tool definitions by category
    NSDictionary *toolDefinitions = @{
        @"gui": @[
            @"listApplications", @"focusApplication", @"launchApplication",
            @"screenshot", @"screenshot_app", @"screenshot_grid", @"click", @"click_absolute",
            @"click_relative", @"click_grid", @"doubleClick", @"clickElement", @"moveMouse", @"scroll",
            @"scrollMouse", @"drag", @"getClickableElements", @"getUIElements",
            @"getMousePosition", @"typeText", @"pressKey", @"analyzeWithOCR",
            @"checkPermissions", @"closeApp", @"wait",
            @"system_info", @"window_list", @"clipboard_read", @"clipboard_write"
        ],
        @"browser": @[
            @"browser_listConnected", @"browser_setDefaultBrowser",
            @"browser_getTabs", @"browser_getActiveTab", @"browser_focusTab",
            @"browser_createTab", @"browser_closeTab", @"browser_getPageInfo",
            @"browser_inspectCurrentPage", @"browser_getInteractiveElements",
            @"browser_getPageContext", @"browser_clickElement", @"browser_fillElement",
            @"browser_fillFormField", @"browser_fillWithFallback", @"browser_fillFormNative",
            @"browser_scrollTo", @"browser_executeScript", @"browser_getFormData",
            @"browser_setWatchMode", @"browser_getVisibleText", @"browser_searchVisibleText",
            @"browser_getUIElements", @"browser_waitForSelector", @"browser_waitForPageLoad",
            @"browser_selectOption", @"browser_isElementVisible", @"browser_getConsoleLogs",
            @"browser_getNetworkRequests", @"browser_getLocalStorage", @"browser_getCookies",
            @"browser_clickByText", @"browser_clickMultiple", @"browser_getFormStructure",
            @"browser_answerQuestions", @"browser_getDropdownOptions", @"browser_openDropdownNative",
            @"browser_listInteractiveElements", @"browser_clickElementWithDebug",
            @"browser_findElementWithDebug", @"browser_findTabByUrl",
            @"browser_navigate", @"browser_screenshot", @"browser_go_back",
            @"browser_go_forward", @"browser_get_visible_html", @"browser_hover",
            @"browser_drag", @"browser_press_key", @"browser_upload_file", @"browser_save_as_pdf"
        ],
        @"filesystem": @[
            @"fs_list", @"fs_read", @"fs_read_range", @"fs_write",
            @"fs_delete", @"fs_move", @"fs_search", @"fs_grep", @"fs_patch"
        ],
        @"shell": @[
            @"shell_exec", @"shell_start_session", @"shell_send_input", @"shell_stop_session"
        ]
    };

    for (NSString *category in toolDefinitions) {
        // Skip browser tools if bridge not running
        if ([category isEqualToString:@"browser"] && !includeBrowserTools) {
            continue;
        }

        NSArray *toolNames = toolDefinitions[category];
        for (NSString *toolName in toolNames) {
            NSDictionary *toolDef = [self createToolDefinition:toolName];
            if (toolDef) {
                [tools addObject:toolDef];
            }
        }
    }

    [self logError:[NSString stringWithFormat:@"Returning %lu tools", (unsigned long)tools.count]];
    return [tools copy];
}

- (NSDictionary *)createToolDefinition:(NSString *)toolName {
    NSMutableDictionary *tool = [NSMutableDictionary dictionary];
    tool[@"name"] = toolName;
    tool[@"description"] = [self getToolDescription:toolName];

    NSMutableDictionary *inputSchema = [NSMutableDictionary dictionary];
    inputSchema[@"type"] = @"object";
    inputSchema[@"properties"] = [self getToolProperties:toolName];

    NSArray *required = [self getToolRequiredFields:toolName];
    if (required.count > 0) {
        inputSchema[@"required"] = required;
    }

    tool[@"inputSchema"] = inputSchema;
    return [tool copy];
}

- (NSString *)getToolDescription:(NSString *)toolName {
    NSDictionary *descriptions = @{
        // =====================================================================
        // SCREENSHOT TOOLS - Understanding what's on screen
        // Decision: browser_screenshot for web pages, screenshot_grid for clicking,
        //           screenshot/screenshot_app for quick visual reference
        // =====================================================================
        @"screenshot": @"Take a full desktop screenshot. WHEN TO USE: Quick visual check of entire screen, multi-monitor debugging, seeing overall state. Returns file path (use Read tool to view). NOT FOR CLICKING - use screenshot_grid instead which provides coordinates.",
        @"desktop_screenshot": @"Alias for screenshot. Take a full desktop screenshot for visual reference.",
        @"screenshot_app": @"Screenshot a specific app window. WHEN TO USE: Focus on one app without desktop clutter, capture app state for documentation. Specify identifier='AppName' or bundle ID. Returns file path. NOT FOR CLICKING - use screenshot_grid with identifier instead.",
        @"screenshot_grid": @"PRIMARY TOOL for clicking anything on screen. Takes screenshot with grid overlay (A-T columns, 1-15 rows) + OCR text detection. WORKFLOW: (1) Call screenshot_grid, (2) View image to see grid, (3) Use click_grid or click_relative to click. Returns 'elements' array with {text, centerX, centerY, cell} for detected text. USE FOR: Native apps (Simulator, Mail, Finder), websites when browser extension fails, any UI interaction. Multi-monitor safe. Use identifier='AppName' for specific app, window_title='text' for specific window.",

        // =====================================================================
        // CLICK TOOLS - Interacting with UI elements
        // Decision tree:
        //   1. Web page + browser extension working → browser_clickElement
        //   2. Native app OR browser extension blocked:
        //      a. OCR detected text → click_grid with element_text
        //      b. Icon/image (no text) → click_relative with pixel coords
        //      c. Know grid cell from overlay → click_grid with cell
        // =====================================================================
        @"click_grid": @"Click using screenshot_grid reference. PREFERRED when OCR detected your target. USAGE: (1) element_text='Submit' - clicks detected text center, (2) cell='E7' - clicks grid cell center, (3) element=0 - clicks by index. Add offset_x/offset_y to adjust (e.g., offset_y=50 to click button below text). Auto-focuses window. BEST FOR: Buttons, links, menu items with readable text. Example: click_grid(element_text='Deploy Schema Changes')",
        @"click_relative": @"Click at pixel coordinates within a window. PREFERRED when OCR missed your target (icons, images, small UI). Takes x,y in pixels relative to window top-left - automatically adds window offset. USAGE: click_relative(identifier='Simulator', x=91, y=880). Get coords from screenshot_grid elements (centerX/centerY) or visual estimation. Auto-focuses window. BEST FOR: Tab bar icons, toolbar buttons, images, anything OCR can't read.",
        @"click_absolute": @"Click at absolute screen coordinates. RARELY NEEDED - prefer click_grid or click_relative. Use only when you've manually calculated screen position including window offset. Does not auto-focus window. For multi-monitor: negative X values are valid (secondary monitors to the left).",
        @"click": @"LEGACY - avoid. Click at normalized 0-1 coordinates. Use click_relative for pixel coords or click_grid for element-based clicking.",
        @"doubleClick": @"Double-click at coordinates. WHEN TO USE: Opening files in Finder, selecting words in text editors, activating items that need double-click. Coordinates are absolute screen position.",
        @"clickElement": @"Click accessibility UI element by index. WHEN TO USE: After getUIElements returns indexed elements. Works with native macOS accessibility API. Less reliable than screenshot_grid approach for most use cases.",

        // =====================================================================
        // MOUSE & SCROLL TOOLS
        // =====================================================================
        @"moveMouse": @"Move mouse cursor without clicking. WHEN TO USE: Hover effects, tooltips, preparing for drag operations, visual feedback that mouse is in position.",
        @"getMousePosition": @"Get current mouse cursor position. WHEN TO USE: Debugging click issues, understanding coordinate systems, verifying mouse moved to expected location.",
        @"scroll": @"Scroll at specific location. WHEN TO USE: Scrolling within a specific area (not whole page), precise scroll control. Use deltaY negative=down, positive=up. Optionally specify x,y position to scroll at.",
        @"scrollMouse": @"Simple scroll up/down. WHEN TO USE: Basic page scrolling, list navigation. direction='up' or 'down', amount=number of scroll units (default 3). Easier than scroll for simple cases.",
        @"drag": @"Drag from one point to another. WHEN TO USE: Moving files, slider controls, resizing windows, drag-and-drop operations. Specify startX,startY,endX,endY as absolute coordinates.",

        // =====================================================================
        // KEYBOARD TOOLS
        // =====================================================================
        @"typeText": @"Type text using keyboard. WHEN TO USE: Filling form fields (after clicking to focus), entering search queries, typing in any text input. Works in any app. For special keys use pressKey instead. Pairs well with click_grid to focus field first.",
        @"pressKey": @"Press a specific key. WHEN TO USE: Enter to submit, Tab to move focus, Escape to cancel, arrow keys for navigation, keyboard shortcuts. Supports: enter, tab, escape, space, delete, backspace, up, down, left, right, home, end, pageup, pagedown, f1-f12, plus modifiers.",

        // =====================================================================
        // APPLICATION MANAGEMENT
        // Decision: Need to interact with app? Focus it first. App not running? Launch it.
        // =====================================================================
        @"listApplications": @"List all running applications with bundle IDs and window bounds. WHEN TO USE: Finding correct app identifier for other commands, seeing what's running, getting window positions for coordinate calculations.",
        @"focusApplication": @"Bring an application to front. WHEN TO USE: Before interacting with an app, switching between apps, ensuring clicks go to right window. Handles multi-monitor and Spaces. Use bundle ID (com.apple.mail) or app name (Mail).",
        @"launchApplication": @"Launch an application (or focus if already running). WHEN TO USE: Starting apps that aren't running, ensuring app is available for interaction. Use bundle ID or app name. Will focus if already running.",
        @"closeApp": @"Close an application. WHEN TO USE: Cleaning up after task completion, closing apps blocking interaction, force quitting stuck apps (use force=true).",
        @"currentApp": @"Get currently focused application info. WHEN TO USE: Debugging which app has focus, verifying focusApplication worked, understanding current state.",

        // =====================================================================
        // WINDOW & UI INSPECTION
        // =====================================================================
        @"window_list": @"List all open windows on desktop. WHEN TO USE: Finding window IDs, understanding multi-window apps, seeing window positions across monitors. More detailed than listApplications for window-specific info.",
        @"getClickableElements": @"Get clickable UI elements via accessibility API. WHEN TO USE: Exploring native app UI structure, finding buttons/links programmatically. Returns indexed elements for clickElement. Less reliable than screenshot_grid for actual clicking.",
        @"getUIElements": @"Get all UI elements via accessibility API. WHEN TO USE: Deep UI inspection, understanding app structure, accessibility testing. Can be verbose - prefer screenshot_grid for interaction.",
        @"analyzeWithOCR": @"Run OCR on screen region. WHEN TO USE: Reading text from images, extracting text from non-standard UI, when browser_getVisibleText fails. screenshot_grid already includes OCR - use this for custom regions.",

        // =====================================================================
        // SYSTEM UTILITIES
        // =====================================================================
        @"checkPermissions": @"Check if accessibility permissions are granted. WHEN TO USE: Debugging why clicks don't work, initial setup verification, troubleshooting interaction failures.",
        @"wait": @"Pause execution for milliseconds. WHEN TO USE: Waiting for animations, page loads, UI transitions, giving time for actions to complete. Use after clicks that trigger loading, navigation, or animations.",
        @"system_info": @"Get system information (OS version, CPU, memory, hostname). WHEN TO USE: Understanding environment, debugging platform-specific issues, logging system state.",
        @"clipboard_read": @"Read text from system clipboard. WHEN TO USE: Getting copied text, verifying copy operations worked, transferring data between apps via clipboard.",
        @"clipboard_write": @"Write text to system clipboard. WHEN TO USE: Preparing text for paste operations, sharing data between apps, setting up for Cmd+V paste.",

        // =====================================================================
        // BROWSER TOOLS - For web interaction
        // Decision: browser_* tools are FASTEST when extension is connected.
        //           If they fail (site blocks scripts), fall back to screenshot_grid + click_grid
        // =====================================================================
        @"browser_navigate": @"Navigate browser to URL. WHEN TO USE: Opening web pages, changing sites, starting web workflows. Faster than clicking address bar + typing.",
        @"browser_screenshot": @"Screenshot browser viewport. WHEN TO USE: Visual verification of page state, capturing page appearance. Returns file path. For clicking, prefer screenshot_grid which adds coordinates.",
        @"browser_getVisibleText": @"Get all visible text from page. WHEN TO USE: Reading page content, finding text to search for, understanding page structure. If blocked, use screenshot_grid OCR instead. Use url= to target background tab.",
        @"browser_searchVisibleText": @"Search for specific text in page. WHEN TO USE: Checking if text exists, finding elements by text content. Returns boolean. If blocked, use screenshot_grid OCR instead.",
        @"browser_clickElement": @"Click element by selector. PRIMARY browser clicking method when extension works. WHEN TO USE: Clicking buttons, links, form elements by CSS selector or text. If fails with 'blocked' error, fall back to screenshot_grid + click_grid.",
        @"browser_fillElement": @"Fill form field by selector. PRIMARY form filling method. WHEN TO USE: Text inputs, textareas, any typeable field. If fails, use click_grid to focus + typeText.",
        @"browser_getTabs": @"List all open browser tabs. WHEN TO USE: Finding tab to work with, understanding browser state, getting tab IDs for other commands.",
        @"browser_getActiveTab": @"Get currently active tab info. WHEN TO USE: Verifying correct tab is focused, getting current URL/title.",
        @"browser_focusTab": @"Switch to specific tab. WHEN TO USE: Working with multiple tabs, switching context, bringing tab to front. Use tabId from browser_getTabs.",
        @"browser_createTab": @"Open new tab. WHEN TO USE: Opening new pages without losing current tab, parallel browsing workflows.",
        @"browser_closeTab": @"Close a tab. WHEN TO USE: Cleaning up, closing popups, finishing with a page.",
        @"browser_go_back": @"Navigate back in history. WHEN TO USE: Returning to previous page, undoing navigation.",
        @"browser_go_forward": @"Navigate forward in history. WHEN TO USE: After going back, returning to where you were.",
        @"browser_get_visible_html": @"Get page HTML source. WHEN TO USE: Inspecting page structure, debugging selectors, understanding DOM.",
        @"browser_executeScript": @"Run JavaScript in page. WHEN TO USE: Custom interactions, reading page state, complex operations not covered by other tools. Use carefully - can break page.",
        @"browser_listConnected": @"Check which browsers have extension connected. WHEN TO USE: Verifying browser extension is working, debugging connection issues, choosing which browser to control.",
        @"browser_getInteractiveElements": @"Get clickable/fillable elements. WHEN TO USE: Finding elements to interact with, understanding page structure, getting selectors. Returns summary by default - use verbose=true for full list (WARNING: high tokens).",
        @"browser_getUIElements": @"Get UI elements from page. WHEN TO USE: Similar to getInteractiveElements. Returns summary by default.",
        @"browser_listInteractiveElements": @"List interactive elements. WHEN TO USE: Alias for getInteractiveElements.",

        // Additional browser tools with concise descriptions
        @"browser_findTabByUrl": @"Find tab by URL pattern. WHEN TO USE: Locating specific tab without knowing tabId.",
        @"browser_waitForSelector": @"Wait for element to appear. WHEN TO USE: After actions that load content, before interacting with dynamic elements.",
        @"browser_waitForPageLoad": @"Wait for page to finish loading. WHEN TO USE: After navigation, ensuring page is ready for interaction.",
        @"browser_isElementVisible": @"Check if element is visible. WHEN TO USE: Conditional logic based on element visibility.",
        @"browser_selectOption": @"Select dropdown option. WHEN TO USE: Dropdown menus, select elements. Use value or text to specify option.",
        @"browser_hover": @"Hover over element. WHEN TO USE: Triggering hover menus, tooltips, hover states.",
        @"browser_drag": @"Drag element to position. WHEN TO USE: Drag-and-drop in web apps, sortable lists, sliders.",
        @"browser_press_key": @"Press keyboard key in browser. WHEN TO USE: Keyboard navigation in web app, shortcuts, key-triggered actions.",
        @"browser_upload_file": @"Upload file via file input. WHEN TO USE: File upload forms, attaching documents.",
        @"browser_save_as_pdf": @"Save page as PDF. WHEN TO USE: Capturing page for records, generating reports.",
        @"browser_getConsoleLogs": @"Get browser console logs. WHEN TO USE: Debugging, checking for errors, monitoring page behavior.",
        @"browser_getNetworkRequests": @"Get network requests. WHEN TO USE: Debugging API calls, monitoring page traffic.",
        @"browser_getLocalStorage": @"Read localStorage. WHEN TO USE: Inspecting stored data, debugging state.",
        @"browser_getCookies": @"Get page cookies. WHEN TO USE: Session debugging, authentication state.",
        @"browser_clickByText": @"Click element by text content. WHEN TO USE: When you know button/link text but not selector.",
        @"browser_clickMultiple": @"Click multiple elements matching selector. WHEN TO USE: Batch operations like checking multiple checkboxes.",
        @"browser_getFormData": @"Get current form values. WHEN TO USE: Reading filled form state, verifying input.",
        @"browser_getFormStructure": @"Analyze form structure. WHEN TO USE: Understanding form fields before filling.",
        @"browser_answerQuestions": @"Fill form intelligently. WHEN TO USE: Complex forms where you provide answers and it finds matching fields.",
        @"browser_getDropdownOptions": @"Get options from dropdown. WHEN TO USE: Before selecting, to see available options.",
        @"browser_openDropdownNative": @"Open dropdown via native click. WHEN TO USE: Dropdowns that don't respond to selectOption.",
        @"browser_getPageInfo": @"Get page title, URL, etc. WHEN TO USE: Quick page identification.",
        @"browser_inspectCurrentPage": @"Deep page inspection. WHEN TO USE: Comprehensive page analysis.",
        @"browser_getPageContext": @"Get page context for AI understanding. WHEN TO USE: When you need structured page summary.",
        @"browser_setWatchMode": @"Enable/disable page change monitoring. WHEN TO USE: Watching for dynamic updates.",
        @"browser_setDefaultBrowser": @"Set which browser to use by default. WHEN TO USE: Configuring preferred browser for commands.",
        @"browser_fillFormField": @"Fill specific form field. WHEN TO USE: Targeted field filling.",
        @"browser_fillWithFallback": @"Fill with fallback methods. WHEN TO USE: When standard fill fails.",
        @"browser_fillFormNative": @"Fill using native input events. WHEN TO USE: Fields that reject programmatic input.",
        @"browser_clickElementWithDebug": @"Click with detailed debug output. WHEN TO USE: Debugging why clicks fail.",
        @"browser_findElementWithDebug": @"Find element with debug info. WHEN TO USE: Understanding why selectors don't match.",

        // =====================================================================
        // FILESYSTEM TOOLS
        // =====================================================================
        @"fs_list": @"List directory contents. WHEN TO USE: Exploring file structure, finding files.",
        @"fs_read": @"Read file contents. WHEN TO USE: Reading text files, configs, logs.",
        @"fs_read_range": @"Read specific lines from file. WHEN TO USE: Large files, targeted reading.",
        @"fs_write": @"Write content to file. WHEN TO USE: Creating/updating files.",
        @"fs_delete": @"Delete file or directory. WHEN TO USE: Cleanup, removing files. Use recursive=true for directories.",
        @"fs_move": @"Move or rename file. WHEN TO USE: Organizing files, renaming.",
        @"fs_search": @"Search for files by pattern. WHEN TO USE: Finding files by name pattern (glob).",
        @"fs_grep": @"Search file contents. WHEN TO USE: Finding text within files.",
        @"fs_patch": @"Apply patch operations. WHEN TO USE: Programmatic file modifications.",

        // =====================================================================
        // SHELL TOOLS
        // =====================================================================
        @"shell_exec": @"Execute shell command and get output. WHEN TO USE: Running scripts, system commands, one-off operations.",
        @"shell_start_session": @"Start interactive shell session. WHEN TO USE: Long-running processes, interactive commands that need input.",
        @"shell_send_input": @"Send input to running shell session. WHEN TO USE: Providing input to interactive process.",
        @"shell_stop_session": @"Stop shell session. WHEN TO USE: Ending interactive session, killing process."
    };

    return descriptions[toolName] ?: [NSString stringWithFormat:@"Execute %@ tool", toolName];
}

- (NSDictionary *)getToolProperties:(NSString *)toolName {
    NSMutableDictionary *properties = [NSMutableDictionary dictionary];

    // Click tools
    if ([toolName isEqualToString:@"click"] || [toolName isEqualToString:@"click_absolute"] ||
        [toolName isEqualToString:@"doubleClick"] || [toolName isEqualToString:@"moveMouse"]) {
        properties[@"x"] = @{@"type": @"number", @"description": @"X coordinate"};
        properties[@"y"] = @{@"type": @"number", @"description": @"Y coordinate"};
        if ([toolName isEqualToString:@"click"] || [toolName isEqualToString:@"click_absolute"]) {
            properties[@"button"] = @{@"type": @"string", @"enum": @[@"left", @"right"], @"description": @"Mouse button"};
        }
    }
    else if ([toolName isEqualToString:@"scroll"]) {
        properties[@"deltaX"] = @{@"type": @"number", @"description": @"Horizontal scroll amount"};
        properties[@"deltaY"] = @{@"type": @"number", @"description": @"Vertical scroll amount"};
        properties[@"x"] = @{@"type": @"number", @"description": @"X coordinate (optional)"};
        properties[@"y"] = @{@"type": @"number", @"description": @"Y coordinate (optional)"};
    }
    else if ([toolName isEqualToString:@"scrollMouse"]) {
        properties[@"direction"] = @{@"type": @"string", @"enum": @[@"up", @"down"], @"description": @"Scroll direction"};
        properties[@"amount"] = @{@"type": @"number", @"description": @"Scroll amount (default: 3)"};
    }
    else if ([toolName isEqualToString:@"drag"]) {
        properties[@"startX"] = @{@"type": @"number"};
        properties[@"startY"] = @{@"type": @"number"};
        properties[@"endX"] = @{@"type": @"number"};
        properties[@"endY"] = @{@"type": @"number"};
    }
    else if ([toolName isEqualToString:@"clickElement"]) {
        properties[@"elementIndex"] = @{@"type": @"number", @"description": @"Index of element to click"};
    }
    else if ([toolName isEqualToString:@"typeText"]) {
        properties[@"text"] = @{@"type": @"string", @"description": @"Text to type"};
    }
    else if ([toolName isEqualToString:@"pressKey"]) {
        properties[@"key"] = @{@"type": @"string", @"description": @"Key to press (e.g., 'enter', 'tab', 'escape')"};
    }
    else if ([toolName isEqualToString:@"screenshot"] || [toolName isEqualToString:@"desktop_screenshot"]) {
        // Token-safe parameters
        properties[@"return_base64"] = @{@"type": @"boolean", @"description": @"Return base64 instead of file path (default: false, saves tokens)"};
        properties[@"format"] = @{@"type": @"string", @"enum": @[@"jpeg", @"png"], @"description": @"Image format: jpeg (smaller, default) or png (lossless)"};
    }
    else if ([toolName isEqualToString:@"focusApplication"] || [toolName isEqualToString:@"launchApplication"] ||
             [toolName isEqualToString:@"closeApp"] || [toolName isEqualToString:@"screenshot_app"]) {
        properties[@"identifier"] = @{@"type": @"string", @"description": @"App bundle ID or name"};
        if ([toolName isEqualToString:@"closeApp"]) {
            properties[@"force"] = @{@"type": @"boolean", @"description": @"Force quit the app"};
        }
        if ([toolName isEqualToString:@"screenshot_app"]) {
            // Token-safe parameters
            properties[@"return_base64"] = @{@"type": @"boolean", @"description": @"Return base64 instead of file path (default: false, saves tokens)"};
            properties[@"format"] = @{@"type": @"string", @"enum": @[@"jpeg", @"png"], @"description": @"Image format: jpeg (smaller, default) or png (lossless)"};
        }
    }
    else if ([toolName isEqualToString:@"screenshot_grid"]) {
        properties[@"identifier"] = @{@"type": @"string", @"description": @"App bundle ID or name (optional, uses focused app or full screen)"};
        properties[@"window_title"] = @{@"type": @"string", @"description": @"Window title substring to match (for multi-window apps like Firefox with DevTools). Case-insensitive."};
        properties[@"columns"] = @{@"type": @"number", @"description": @"Number of grid columns (default: 20, range: 5-40)"};
        properties[@"rows"] = @{@"type": @"number", @"description": @"Number of grid rows (default: 15, range: 5-30)"};
        properties[@"return_base64"] = @{@"type": @"boolean", @"description": @"Return base64 instead of file path (default: false)"};
    }
    else if ([toolName isEqualToString:@"click_relative"]) {
        properties[@"x"] = @{@"type": @"number", @"description": @"X coordinate in pixels relative to window (required)"};
        properties[@"y"] = @{@"type": @"number", @"description": @"Y coordinate in pixels relative to window (required)"};
        properties[@"identifier"] = @{@"type": @"string", @"description": @"App bundle ID or name (optional, uses current app from screenshot_grid if not specified)"};
        properties[@"button"] = @{@"type": @"string", @"enum": @[@"left", @"right"], @"description": @"Mouse button (default: left)"};
        properties[@"focus"] = @{@"type": @"boolean", @"description": @"Auto-focus the target window before clicking (default: true)"};
    }
    else if ([toolName isEqualToString:@"click_grid"]) {
        properties[@"cell"] = @{@"type": @"string", @"description": @"Grid cell reference (e.g., 'E7', 'A1', 'T15')"};
        properties[@"column"] = @{@"type": @"number", @"description": @"Column number (1-20), alternative to cell reference"};
        properties[@"row"] = @{@"type": @"number", @"description": @"Row number (1-15), alternative to cell reference"};
        properties[@"element"] = @{@"type": @"number", @"description": @"Element index (0-based) from screenshot_grid elements array - clicks at exact element center for precise positioning"};
        properties[@"element_text"] = @{@"type": @"string", @"description": @"Text to search for in detected elements (case-insensitive) - clicks at exact element center"};
        properties[@"offset_x"] = @{@"type": @"number", @"description": @"Horizontal offset in pixels to add after calculating position (positive=right, negative=left)"};
        properties[@"offset_y"] = @{@"type": @"number", @"description": @"Vertical offset in pixels to add after calculating position (positive=down, negative=up). Use to click below detected text to hit buttons OCR missed."};
        properties[@"columns"] = @{@"type": @"number", @"description": @"Grid columns used in screenshot_grid (default: 20)"};
        properties[@"rows"] = @{@"type": @"number", @"description": @"Grid rows used in screenshot_grid (default: 15)"};
        properties[@"button"] = @{@"type": @"string", @"enum": @[@"left", @"right"], @"description": @"Mouse button (default: left)"};
        properties[@"identifier"] = @{@"type": @"string", @"description": @"App bundle ID or name to click in (optional, uses window from last screenshot_grid)"};
        properties[@"window_title"] = @{@"type": @"string", @"description": @"Window title substring to match (optional, uses stored title from screenshot_grid)"};
        properties[@"focus"] = @{@"type": @"boolean", @"description": @"Auto-focus the target window before clicking (default: true). Critical for multi-monitor setups and background windows. Set to false to skip focus."};
    }
    else if ([toolName isEqualToString:@"wait"]) {
        properties[@"milliseconds"] = @{@"type": @"number", @"description": @"Time to wait in milliseconds"};
    }
    else if ([toolName isEqualToString:@"clipboard_write"]) {
        properties[@"text"] = @{@"type": @"string", @"description": @"Text to copy to clipboard"};
    }
    // Filesystem tools
    else if ([toolName hasPrefix:@"fs_"]) {
        properties[@"path"] = @{@"type": @"string", @"description": @"File or directory path"};
        if ([toolName isEqualToString:@"fs_write"]) {
            properties[@"content"] = @{@"type": @"string", @"description": @"Content to write"};
            properties[@"create_directories"] = @{@"type": @"boolean", @"description": @"Create parent directories if needed"};
        }
        else if ([toolName isEqualToString:@"fs_read_range"]) {
            properties[@"start_line"] = @{@"type": @"number", @"description": @"Starting line number"};
            properties[@"end_line"] = @{@"type": @"number", @"description": @"Ending line number"};
        }
        else if ([toolName isEqualToString:@"fs_delete"]) {
            properties[@"recursive"] = @{@"type": @"boolean", @"description": @"Recursively delete directories"};
        }
        else if ([toolName isEqualToString:@"fs_move"]) {
            properties[@"source"] = @{@"type": @"string", @"description": @"Source path"};
            properties[@"destination"] = @{@"type": @"string", @"description": @"Destination path"};
        }
        else if ([toolName isEqualToString:@"fs_search"]) {
            properties[@"pattern"] = @{@"type": @"string", @"description": @"Search pattern (glob)"};
            properties[@"max_depth"] = @{@"type": @"number", @"description": @"Maximum directory depth"};
        }
        else if ([toolName isEqualToString:@"fs_grep"]) {
            properties[@"pattern"] = @{@"type": @"string", @"description": @"Search pattern (regex)"};
            properties[@"case_sensitive"] = @{@"type": @"boolean", @"description": @"Case sensitive search"};
        }
        else if ([toolName isEqualToString:@"fs_patch"]) {
            properties[@"operations"] = @{@"type": @"array", @"description": @"Patch operations"};
            properties[@"dry_run"] = @{@"type": @"boolean", @"description": @"Preview changes without applying"};
        }
    }
    // Shell tools
    else if ([toolName isEqualToString:@"shell_exec"]) {
        properties[@"command"] = @{@"type": @"string", @"description": @"Command to execute"};
        properties[@"cwd"] = @{@"type": @"string", @"description": @"Working directory"};
        properties[@"timeout_seconds"] = @{@"type": @"number", @"description": @"Timeout in seconds"};
        properties[@"capture_stderr"] = @{@"type": @"boolean", @"description": @"Capture stderr"};
    }
    else if ([toolName isEqualToString:@"shell_start_session"]) {
        properties[@"command"] = @{@"type": @"string", @"description": @"Command to start"};
        properties[@"cwd"] = @{@"type": @"string", @"description": @"Working directory"};
        properties[@"env"] = @{@"type": @"object", @"description": @"Environment variables"};
        properties[@"capture_stderr"] = @{@"type": @"boolean", @"description": @"Capture stderr"};
    }
    else if ([toolName isEqualToString:@"shell_send_input"]) {
        properties[@"session_id"] = @{@"type": @"string", @"description": @"Session ID"};
        properties[@"input"] = @{@"type": @"string", @"description": @"Input to send"};
    }
    else if ([toolName isEqualToString:@"shell_stop_session"]) {
        properties[@"session_id"] = @{@"type": @"string", @"description": @"Session ID"};
        properties[@"signal"] = @{@"type": @"string", @"description": @"Signal to send (default: TERM)"};
    }
    // Browser tools
    else if ([toolName hasPrefix:@"browser_"]) {
        properties[@"browser"] = @{@"type": @"string", @"description": @"Target browser (chrome, firefox, safari, edge)"};

        if ([toolName isEqualToString:@"browser_navigate"]) {
            properties[@"url"] = @{@"type": @"string", @"description": @"URL to navigate to"};
        }
        else if ([toolName isEqualToString:@"browser_screenshot"]) {
            // Token-safe parameters
            properties[@"return_base64"] = @{@"type": @"boolean", @"description": @"Return base64 instead of file path (default: false, saves tokens)"};
            properties[@"format"] = @{@"type": @"string", @"enum": @[@"jpeg", @"png"], @"description": @"Image format: jpeg (smaller, default) or png (lossless)"};
        }
        else if ([toolName isEqualToString:@"browser_getInteractiveElements"] ||
                 [toolName isEqualToString:@"browser_getUIElements"] ||
                 [toolName isEqualToString:@"browser_listInteractiveElements"]) {
            properties[@"url"] = @{@"type": @"string", @"description": @"URL of tab to target (without switching)"};
            properties[@"tabId"] = @{@"type": @"number", @"description": @"Tab ID (optional, url preferred)"};
            // Token-safe parameter
            properties[@"verbose"] = @{@"type": @"boolean", @"description": @"Return full element details (default: false, returns summary to save tokens)"};
        }
        else if ([toolName isEqualToString:@"browser_getVisibleText"] ||
                 [toolName isEqualToString:@"browser_searchVisibleText"] ||
                 [toolName isEqualToString:@"browser_clickElement"] ||
                 [toolName isEqualToString:@"browser_fillElement"]) {
            properties[@"url"] = @{@"type": @"string", @"description": @"URL of tab to target (without switching)"};
            properties[@"tabId"] = @{@"type": @"number", @"description": @"Tab ID (optional, url preferred)"};
            if ([toolName isEqualToString:@"browser_searchVisibleText"]) {
                properties[@"query"] = @{@"type": @"string", @"description": @"Text to search for"};
            }
            if ([toolName isEqualToString:@"browser_clickElement"]) {
                properties[@"selector"] = @{@"type": @"string", @"description": @"CSS selector"};
                properties[@"text"] = @{@"type": @"string", @"description": @"Text content to find"};
            }
            if ([toolName isEqualToString:@"browser_fillElement"]) {
                properties[@"selector"] = @{@"type": @"string", @"description": @"CSS selector"};
                properties[@"value"] = @{@"type": @"string", @"description": @"Value to fill"};
            }
        }
        else if ([toolName isEqualToString:@"browser_executeScript"]) {
            properties[@"script"] = @{@"type": @"string", @"description": @"JavaScript to execute"};
        }
        else if ([toolName isEqualToString:@"browser_focusTab"] || [toolName isEqualToString:@"browser_closeTab"]) {
            properties[@"tabId"] = @{@"type": @"number", @"description": @"Tab ID"};
        }
        else if ([toolName isEqualToString:@"browser_createTab"]) {
            properties[@"url"] = @{@"type": @"string", @"description": @"URL for new tab"};
        }
    }

    return [properties copy];
}

- (NSArray *)getToolRequiredFields:(NSString *)toolName {
    if ([toolName isEqualToString:@"click"] || [toolName isEqualToString:@"click_absolute"] ||
        [toolName isEqualToString:@"doubleClick"] || [toolName isEqualToString:@"moveMouse"]) {
        return @[@"x", @"y"];
    }
    if ([toolName isEqualToString:@"drag"]) {
        return @[@"startX", @"startY", @"endX", @"endY"];
    }
    if ([toolName isEqualToString:@"clickElement"]) {
        return @[@"elementIndex"];
    }
    if ([toolName isEqualToString:@"typeText"]) {
        return @[@"text"];
    }
    if ([toolName isEqualToString:@"pressKey"]) {
        return @[@"key"];
    }
    if ([toolName isEqualToString:@"scrollMouse"]) {
        return @[@"direction"];
    }
    if ([toolName isEqualToString:@"focusApplication"] || [toolName isEqualToString:@"launchApplication"] ||
        [toolName isEqualToString:@"closeApp"]) {
        return @[@"identifier"];
    }
    if ([toolName isEqualToString:@"clipboard_write"]) {
        return @[@"text"];
    }
    if ([toolName isEqualToString:@"shell_exec"] || [toolName isEqualToString:@"shell_start_session"]) {
        return @[@"command"];
    }
    if ([toolName isEqualToString:@"shell_send_input"]) {
        return @[@"session_id", @"input"];
    }
    if ([toolName isEqualToString:@"shell_stop_session"]) {
        return @[@"session_id"];
    }
    if ([toolName isEqualToString:@"fs_list"] || [toolName isEqualToString:@"fs_read"] ||
        [toolName isEqualToString:@"fs_read_range"] || [toolName isEqualToString:@"fs_delete"]) {
        return @[@"path"];
    }
    if ([toolName isEqualToString:@"fs_write"]) {
        return @[@"path", @"content"];
    }
    if ([toolName isEqualToString:@"fs_move"]) {
        return @[@"source", @"destination"];
    }
    if ([toolName isEqualToString:@"fs_search"] || [toolName isEqualToString:@"fs_grep"]) {
        return @[@"path", @"pattern"];
    }
    if ([toolName isEqualToString:@"fs_patch"]) {
        return @[@"path", @"operations"];
    }
    if ([toolName isEqualToString:@"browser_navigate"]) {
        return @[@"url"];
    }
    if ([toolName isEqualToString:@"browser_fillElement"]) {
        return @[@"selector", @"value"];
    }
    return @[];
}

#pragma mark - MCP Response Helpers

- (void)sendMCPResult:(id)result id:(id)requestId {
    NSDictionary *response = @{
        @"jsonrpc": @"2.0",
        @"id": requestId ?: [NSNull null],
        @"result": result
    };

    [self writeMCPResponse:response];
}

- (void)sendMCPError:(NSString *)message code:(NSInteger)code id:(id)requestId {
    NSDictionary *response = @{
        @"jsonrpc": @"2.0",
        @"id": requestId ?: [NSNull null],
        @"error": @{
            @"code": @(code),
            @"message": message
        }
    };

    [self writeMCPResponse:response];
}

- (void)writeMCPResponse:(NSDictionary *)response {
    NSError *error;
    NSData *jsonData = [NSJSONSerialization dataWithJSONObject:response options:0 error:&error];
    if (error) {
        [self logError:[NSString stringWithFormat:@"Failed to serialize MCP response: %@", error]];
        return;
    }

    NSMutableData *outputData = [jsonData mutableCopy];
    [outputData appendData:[@"\n" dataUsingEncoding:NSUTF8StringEncoding]];

    @synchronized (self.stdoutHandle) {
        [self.stdoutHandle writeData:outputData];
    }
}

#pragma mark - BrowserWebSocketServerDelegate

- (void)browserWebSocketServer:(BrowserWebSocketServer *)server didReceiveToolRequest:(NSDictionary *)request fromBrowser:(NSString *)browserId {
    // Handle incoming browser extension requests if needed
    [self logError:[NSString stringWithFormat:@"Browser tool request from %@: %@", browserId, request]];
}

- (void)browserWebSocketServerDidStart:(BrowserWebSocketServer *)server onPort:(NSUInteger)port {
    [self logError:[NSString stringWithFormat:@"BrowserWebSocketServer started on port %lu", (unsigned long)port]];
}

- (void)browserWebSocketServerDidStop:(BrowserWebSocketServer *)server {
    [self logError:@"BrowserWebSocketServer stopped"];
}

- (void)browserWebSocketServer:(BrowserWebSocketServer *)server browserDidConnect:(NSString *)browserId browserName:(NSString *)browserName {
    [self logError:[NSString stringWithFormat:@"Browser connected: %@ (%@)", browserName, browserId]];

    // Send tools/list_changed notification to inform Claude Code that new tools are available
    [self sendToolsListChangedNotification];
}

- (void)browserWebSocketServer:(BrowserWebSocketServer *)server browserDidDisconnect:(NSString *)browserId {
    [self logError:[NSString stringWithFormat:@"Browser disconnected: %@", browserId]];

    // Send tools/list_changed notification to inform Claude Code that tools have changed
    [self sendToolsListChangedNotification];
}

#pragma mark - Token-Safe Response Helpers

- (NSData *)convertImageData:(NSData *)imageData toFormat:(NSString *)format quality:(CGFloat)quality {
    // Convert PNG image data to specified format (jpeg or png)
    if (!imageData) return nil;

    BOOL useJpeg = [format.lowercaseString isEqualToString:@"jpeg"] || [format.lowercaseString isEqualToString:@"jpg"];
    if (!useJpeg) {
        // PNG requested, return as-is
        return imageData;
    }

    // Convert to JPEG
    NSBitmapImageRep *imageRep = [[NSBitmapImageRep alloc] initWithData:imageData];
    if (!imageRep) return imageData;

    NSDictionary *props = @{NSImageCompressionFactor: @(quality)};
    NSData *jpegData = [imageRep representationUsingType:NSBitmapImageFileTypeJPEG properties:props];
    return jpegData ?: imageData;
}

- (NSDictionary *)saveScreenshotToFile:(NSData *)imageData prefix:(NSString *)prefix {
    return [self saveScreenshotToFile:imageData prefix:prefix format:@"jpeg" quality:0.8];
}

- (NSDictionary *)saveScreenshotToFile:(NSData *)imageData prefix:(NSString *)prefix format:(NSString *)format quality:(CGFloat)quality {
    // Save screenshot to /tmp to avoid returning 25k+ tokens of base64
    // Supports jpeg (smaller, default) or png (lossless)

    NSString *tempDir = @"/tmp";
    NSString *timestamp = [NSString stringWithFormat:@"%.0f", [[NSDate date] timeIntervalSince1970] * 1000];

    BOOL useJpeg = [format.lowercaseString isEqualToString:@"jpeg"] || [format.lowercaseString isEqualToString:@"jpg"];
    NSString *extension = useJpeg ? @"jpg" : @"png";
    NSString *filename = [NSString stringWithFormat:@"screenshot_%@_%@.%@", prefix, timestamp, extension];
    NSString *filePath = [tempDir stringByAppendingPathComponent:filename];

    NSData *outputData = imageData;

    // Convert to JPEG if requested (much smaller file size)
    if (useJpeg && imageData) {
        NSBitmapImageRep *imageRep = [[NSBitmapImageRep alloc] initWithData:imageData];
        if (imageRep) {
            NSDictionary *props = @{NSImageCompressionFactor: @(quality)};
            NSData *jpegData = [imageRep representationUsingType:NSBitmapImageFileTypeJPEG properties:props];
            if (jpegData) {
                outputData = jpegData;
                [self logError:[NSString stringWithFormat:@"Converted to JPEG: %lu -> %lu bytes (%.0f%% reduction)",
                               (unsigned long)imageData.length, (unsigned long)jpegData.length,
                               (1.0 - (double)jpegData.length / imageData.length) * 100]];
            }
        }
    }

    NSError *error;
    BOOL success = [outputData writeToFile:filePath options:NSDataWritingAtomic error:&error];

    if (!success) {
        [self logError:[NSString stringWithFormat:@"Failed to save screenshot: %@", error.localizedDescription]];
        // Fall back to base64 if file write fails
        NSString *base64 = [imageData base64EncodedStringWithOptions:0];
        return @{@"image": base64, @"format": @"png", @"warning": @"Failed to save to file, returning base64"};
    }

    [self logError:[NSString stringWithFormat:@"Screenshot saved to: %@", filePath]];

    return @{
        @"file_path": filePath,
        @"format": extension,
        @"size_bytes": @(outputData.length),
        @"message": @"Screenshot saved to file. Use the Read tool to view the image."
    };
}

- (NSDictionary *)summarizeInteractiveElements:(NSArray *)elements {
    // Summarize interactive elements to reduce token usage from ~13k to ~1k
    // Returns counts by type and key elements only

    if (![elements isKindOfClass:[NSArray class]] || elements.count == 0) {
        return @{@"elements": @[], @"count": @0, @"summary": @"No interactive elements found"};
    }

    // Count by role/type
    NSMutableDictionary *countsByRole = [NSMutableDictionary dictionary];
    NSMutableArray *keyElements = [NSMutableArray array];

    for (NSDictionary *element in elements) {
        NSString *role = element[@"role"] ?: element[@"tagName"] ?: @"unknown";
        countsByRole[role] = @([countsByRole[role] integerValue] + 1);

        // Keep key elements: buttons, links, inputs (first 20 of each type)
        NSArray *keyRoles = @[@"button", @"link", @"textbox", @"input", @"checkbox", @"radio", @"combobox", @"menuitem", @"tab"];
        BOOL isKeyRole = NO;
        for (NSString *keyRole in keyRoles) {
            if ([[role lowercaseString] containsString:keyRole]) {
                isKeyRole = YES;
                break;
            }
        }

        if (isKeyRole && keyElements.count < 50) {
            // Return minimal info for each key element
            NSMutableDictionary *minElement = [NSMutableDictionary dictionary];
            if (element[@"index"]) minElement[@"index"] = element[@"index"];
            if (element[@"role"]) minElement[@"role"] = element[@"role"];
            if (element[@"name"]) minElement[@"name"] = element[@"name"];
            if (element[@"text"]) minElement[@"text"] = [self truncateString:element[@"text"] maxLength:50];
            if (element[@"tagName"]) minElement[@"tagName"] = element[@"tagName"];
            if (element[@"id"]) minElement[@"id"] = element[@"id"];
            if (element[@"selector"]) minElement[@"selector"] = element[@"selector"];
            [keyElements addObject:minElement];
        }
    }

    return @{
        @"total_count": @(elements.count),
        @"counts_by_role": countsByRole,
        @"key_elements": keyElements,
        @"key_elements_count": @(keyElements.count),
        @"message": @"Summarized view. Use verbose:true to get all elements with full details."
    };
}

- (NSString *)truncateString:(NSString *)string maxLength:(NSUInteger)maxLength {
    if (!string || ![string isKindOfClass:[NSString class]]) return @"";
    if (string.length <= maxLength) return string;
    return [[string substringToIndex:maxLength] stringByAppendingString:@"..."];
}

#pragma mark - MCP Content Formatting

- (NSArray *)formatMCPContent:(NSDictionary *)result {
    // Format tool result as proper MCP content array
    // Handles errors, images (ImageContent), and regular JSON (TextContent)

    if (!result) {
        return @[@{@"type": @"text", @"text": @"{}"}];
    }

    // Handle errors
    if (result[@"error"]) {
        return @[@{@"type": @"text", @"text": result[@"error"], @"isError": @YES}];
    }

    // Check for base64 image data - return as MCP ImageContent
    // This makes screenshots compatible with Claude web/desktop
    NSString *imageData = result[@"image"];
    if (imageData && [imageData isKindOfClass:[NSString class]] && imageData.length > 100) {
        // Looks like base64 image data
        NSString *format = result[@"format"] ?: @"png";
        NSString *mimeType = [format isEqualToString:@"jpeg"] ? @"image/jpeg" : @"image/png";

        // Return as MCP ImageContent format
        return @[@{
            @"type": @"image",
            @"data": imageData,
            @"mimeType": mimeType
        }];
    }

    // Check for screenshot from browser (may have data: prefix)
    NSString *screenshot = result[@"screenshot"];
    if (screenshot && [screenshot isKindOfClass:[NSString class]]) {
        NSString *base64Data = screenshot;
        NSString *mimeType = @"image/png";

        // Handle data URL format: data:image/png;base64,xxxx
        if ([screenshot hasPrefix:@"data:image"]) {
            NSRange semicolonRange = [screenshot rangeOfString:@";"];
            if (semicolonRange.location != NSNotFound) {
                mimeType = [screenshot substringWithRange:NSMakeRange(5, semicolonRange.location - 5)];
            }
            NSRange commaRange = [screenshot rangeOfString:@","];
            if (commaRange.location != NSNotFound) {
                base64Data = [screenshot substringFromIndex:commaRange.location + 1];
            }
        }

        // Return as MCP ImageContent format
        return @[@{
            @"type": @"image",
            @"data": base64Data,
            @"mimeType": mimeType
        }];
    }

    // Default: return as JSON text
    NSData *jsonData = [NSJSONSerialization dataWithJSONObject:result options:NSJSONWritingPrettyPrinted error:nil];
    NSString *jsonString = [[NSString alloc] initWithData:jsonData encoding:NSUTF8StringEncoding];
    return @[@{@"type": @"text", @"text": jsonString ?: @"{}"}];
}

#pragma mark - MCP Notifications

- (void)sendToolsListChangedNotification {
    // MCP notification to tell Claude Code the tool list has changed
    // This allows dynamic re-advertisement of browser tools when browsers connect/disconnect
    NSDictionary *notification = @{
        @"jsonrpc": @"2.0",
        @"method": @"notifications/tools/list_changed"
    };

    NSUInteger browserCount = [self.browserWebSocketServer connectedBrowserCount];  // Thread-safe accessor
    NSArray *tools = [self getAvailableTools];
    [self logError:[NSString stringWithFormat:@"Sending tools/list_changed notification (browsers: %lu, tools: %lu)",
                    (unsigned long)browserCount, (unsigned long)tools.count]];

    [self writeMCPResponse:notification];
}

#pragma mark - Service Tool Execution

- (NSDictionary *)executeToolViaService:(NSString *)toolName arguments:(NSDictionary *)arguments {
    // Execute tool via the ScreenControl service HTTP API
    // This routes through the service for security hardening (protected paths, blocked commands)

    __block NSDictionary *result = nil;
    __block BOOL completed = NO;

    [self.serviceClient executeToolWithName:toolName
                                 arguments:arguments
                                completion:^(NSDictionary *response, NSError *error) {
        if (error) {
            [self logError:[NSString stringWithFormat:@"Service tool execution error: %@", error.localizedDescription]];
            result = @{@"service_unavailable": @YES};
        } else if (response[@"error"]) {
            result = response;
        } else {
            result = response;
        }
        completed = YES;
    }];

    // Wait for response with timeout (30 seconds for shell commands)
    NSDate *timeout = [NSDate dateWithTimeIntervalSinceNow:30.0];
    while (!completed && [timeout timeIntervalSinceNow] > 0) {
        [[NSRunLoop currentRunLoop] runMode:NSDefaultRunLoopMode beforeDate:[NSDate dateWithTimeIntervalSinceNow:0.1]];
    }

    if (!completed) {
        [self logError:@"Service tool execution timed out"];
        return @{@"service_unavailable": @YES};
    }

    return result;
}

#pragma mark - Logging

- (void)logError:(NSString *)message {
    // Write to stderr for debugging
    NSFileHandle *stderrHandle = [NSFileHandle fileHandleWithStandardError];
    NSString *logMessage = [NSString stringWithFormat:@"[StdioMCPBridge] %@\n", message];
    [stderrHandle writeData:[logMessage dataUsingEncoding:NSUTF8StringEncoding]];
}

@end
