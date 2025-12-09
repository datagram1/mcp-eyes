/**
 * Browser Bridge Server Implementation
 * Spawns and manages the Node.js browser-bridge-server process
 * Communicates with browser extensions via WebSocket on port 3457
 */

#import "BrowserBridgeServer.h"

@interface BrowserBridgeServer ()

@property (nonatomic, assign) BOOL isRunning;
@property (nonatomic, assign) NSUInteger port;

// Node.js process management
@property (nonatomic, strong) NSTask *nodeTask;
@property (nonatomic, strong) NSPipe *outputPipe;
@property (nonatomic, strong) NSPipe *errorPipe;

// Connected browsers (tracked from log output)
@property (nonatomic, strong) NSMutableSet<NSNumber *> *connectedBrowserTypes;

@end

@implementation BrowserBridgeServer

- (instancetype)initWithPort:(NSUInteger)port {
    self = [super init];
    if (self) {
        _port = port ?: 3457; // Default to 3457
        _isRunning = NO;
        _connectedBrowserTypes = [NSMutableSet set];
    }
    return self;
}

- (BOOL)start {
    if (self.isRunning) {
        NSLog(@"[BrowserBridge] Server already running");
        return YES;
    }

    NSLog(@"[BrowserBridge] Starting Node.js browser-bridge-server on port %lu...", (unsigned long)self.port);

    // Find Node.js executable
    NSString *nodePath = [self findNodeExecutable];
    if (!nodePath) {
        NSLog(@"[BrowserBridge] Node.js not found. Tried: /usr/local/bin/node, /opt/homebrew/bin/node, /usr/bin/node");
        return NO;
    }

    NSLog(@"[BrowserBridge] Found Node.js at: %@", nodePath);

    // Find browser-bridge-server.js
    NSString *serverScriptPath = [self findBrowserBridgeScript];
    if (!serverScriptPath) {
        NSLog(@"[BrowserBridge] browser-bridge-server.js not found");
        return NO;
    }

    NSLog(@"[BrowserBridge] Found script at: %@", serverScriptPath);

    // Create task
    self.nodeTask = [[NSTask alloc] init];
    self.nodeTask.launchPath = nodePath;
    self.nodeTask.arguments = @[serverScriptPath];

    // Set working directory to project root
    NSString *projectRoot = [serverScriptPath stringByDeletingLastPathComponent];
    self.nodeTask.currentDirectoryPath = projectRoot;

    // Set up output pipes for monitoring
    self.outputPipe = [NSPipe pipe];
    self.errorPipe = [NSPipe pipe];
    self.nodeTask.standardOutput = self.outputPipe;
    self.nodeTask.standardError = self.errorPipe;

    // Monitor output
    [self monitorOutput:self.outputPipe.fileHandleForReading label:@"STDOUT"];
    [self monitorOutput:self.errorPipe.fileHandleForReading label:@"STDERR"];

    // Launch task
    @try {
        [self.nodeTask launch];
        self.isRunning = YES;

        NSLog(@"[BrowserBridge] Node.js server started with PID %d", self.nodeTask.processIdentifier);

        // Notify delegate
        if ([self.delegate respondsToSelector:@selector(browserBridgeServerDidStart:)]) {
            [self.delegate browserBridgeServerDidStart:self.port];
        }

        return YES;
    } @catch (NSException *exception) {
        NSLog(@"[BrowserBridge] Failed to launch Node.js: %@", exception);
        self.nodeTask = nil;
        self.isRunning = NO;
        return NO;
    }
}

- (void)stop {
    if (!self.isRunning || !self.nodeTask) {
        return;
    }

    NSLog(@"[BrowserBridge] Stopping Node.js browser-bridge-server...");

    if (self.nodeTask.isRunning) {
        [self.nodeTask terminate];

        // Wait briefly for graceful shutdown
        dispatch_after(dispatch_time(DISPATCH_TIME_NOW, 2 * NSEC_PER_SEC), dispatch_get_main_queue(), ^{
            if (self.nodeTask && self.nodeTask.isRunning) {
                NSLog(@"[BrowserBridge] Force-killing Node.js process");
                [self.nodeTask interrupt];
            }
        });
    }

    self.nodeTask = nil;
    self.outputPipe = nil;
    self.errorPipe = nil;
    self.isRunning = NO;
    [self.connectedBrowserTypes removeAllObjects];

    // Notify delegate
    if ([self.delegate respondsToSelector:@selector(browserBridgeServerDidStop)]) {
        [self.delegate browserBridgeServerDidStop];
    }

    NSLog(@"[BrowserBridge] Node.js server stopped");
}

#pragma mark - Output Monitoring

- (void)monitorOutput:(NSFileHandle *)fileHandle label:(NSString *)label {
    fileHandle.readabilityHandler = ^(NSFileHandle *handle) {
        NSData *data = [handle availableData];
        if (data.length > 0) {
            NSString *output = [[NSString alloc] initWithData:data encoding:NSUTF8StringEncoding];
            if (output) {
                // Log output
                for (NSString *line in [output componentsSeparatedByString:@"\n"]) {
                    if (line.length > 0) {
                        NSLog(@"[BrowserBridge:%@] %@", label, line);

                        // Parse for browser connections
                        [self parseBrowserConnectionFromLog:line];
                    }
                }
            }
        }
    };
}

- (void)parseBrowserConnectionFromLog:(NSString *)logLine {
    // Look for connection messages in the format:
    // "Firefox connected" or "Chrome connected" etc.

    BrowserType browserType = BrowserTypeUnknown;
    NSString *browserName = nil;

    if ([logLine containsString:@"Firefox connected"] || [logLine containsString:@"firefox connected"]) {
        browserType = BrowserTypeFirefox;
        browserName = @"Firefox";
    } else if ([logLine containsString:@"Chrome connected"] || [logLine containsString:@"chrome connected"]) {
        browserType = BrowserTypeChrome;
        browserName = @"Chrome";
    } else if ([logLine containsString:@"Edge connected"] || [logLine containsString:@"edge connected"]) {
        browserType = BrowserTypeEdge;
        browserName = @"Edge";
    } else if ([logLine containsString:@"Safari connected"] || [logLine containsString:@"safari connected"]) {
        browserType = BrowserTypeSafari;
        browserName = @"Safari";
    }

    if (browserType != BrowserTypeUnknown && ![self.connectedBrowserTypes containsObject:@(browserType)]) {
        [self.connectedBrowserTypes addObject:@(browserType)];

        if ([self.delegate respondsToSelector:@selector(browserDidConnect:name:)]) {
            [self.delegate browserDidConnect:browserType name:browserName];
        }
    }

    // Look for disconnection messages
    if ([logLine containsString:@"disconnected"]) {
        if ([logLine containsString:@"Firefox"] || [logLine containsString:@"firefox"]) {
            [self.connectedBrowserTypes removeObject:@(BrowserTypeFirefox)];
            if ([self.delegate respondsToSelector:@selector(browserDidDisconnect:)]) {
                [self.delegate browserDidDisconnect:BrowserTypeFirefox];
            }
        } else if ([logLine containsString:@"Chrome"] || [logLine containsString:@"chrome"]) {
            [self.connectedBrowserTypes removeObject:@(BrowserTypeChrome)];
            if ([self.delegate respondsToSelector:@selector(browserDidDisconnect:)]) {
                [self.delegate browserDidDisconnect:BrowserTypeChrome];
            }
        } else if ([logLine containsString:@"Edge"] || [logLine containsString:@"edge"]) {
            [self.connectedBrowserTypes removeObject:@(BrowserTypeEdge)];
            if ([self.delegate respondsToSelector:@selector(browserDidDisconnect:)]) {
                [self.delegate browserDidDisconnect:BrowserTypeEdge];
            }
        } else if ([logLine containsString:@"Safari"] || [logLine containsString:@"safari"]) {
            [self.connectedBrowserTypes removeObject:@(BrowserTypeSafari)];
            if ([self.delegate respondsToSelector:@selector(browserDidDisconnect:)]) {
                [self.delegate browserDidDisconnect:BrowserTypeSafari];
            }
        }
    }
}

#pragma mark - Public Methods

- (NSArray<NSString *> *)connectedBrowsers {
    NSMutableArray *browsers = [NSMutableArray array];
    for (NSNumber *browserType in self.connectedBrowserTypes) {
        switch ([browserType intValue]) {
            case BrowserTypeFirefox:
                [browsers addObject:@"Firefox"];
                break;
            case BrowserTypeChrome:
                [browsers addObject:@"Chrome"];
                break;
            case BrowserTypeEdge:
                [browsers addObject:@"Edge"];
                break;
            case BrowserTypeSafari:
                [browsers addObject:@"Safari"];
                break;
            default:
                break;
        }
    }
    return [browsers copy];
}

- (BOOL)isBrowserConnected:(BrowserType)browserType {
    return [self.connectedBrowserTypes containsObject:@(browserType)];
}

- (void)sendCommand:(NSString *)action
            payload:(NSDictionary *)payload
             browser:(NSString *)browserName
  completionHandler:(void (^)(NSDictionary *response, NSError *error))completion {

    if (!self.isRunning) {
        if (completion) {
            NSError *error = [NSError errorWithDomain:@"BrowserBridge" code:-1
                                             userInfo:@{NSLocalizedDescriptionKey: @"Server not running"}];
            completion(nil, error);
        }
        return;
    }

    // Build HTTP POST request to http://localhost:3457/command
    NSURL *url = [NSURL URLWithString:[NSString stringWithFormat:@"http://localhost:%lu/command", (unsigned long)self.port]];
    NSMutableURLRequest *request = [NSMutableURLRequest requestWithURL:url];
    request.HTTPMethod = @"POST";
    [request setValue:@"application/json" forHTTPHeaderField:@"Content-Type"];
    request.timeoutInterval = 30.0;

    // Build request body
    NSMutableDictionary *body = [NSMutableDictionary dictionaryWithDictionary:@{
        @"action": action,
        @"payload": payload ?: @{}
    }];
    if (browserName) {
        body[@"browser"] = browserName;
    }

    NSError *serializeError = nil;
    request.HTTPBody = [NSJSONSerialization dataWithJSONObject:body options:0 error:&serializeError];

    if (serializeError) {
        NSLog(@"[BrowserBridge] Failed to serialize request body: %@", serializeError);
        if (completion) {
            completion(nil, serializeError);
        }
        return;
    }

    NSLog(@"[BrowserBridge] Sending command '%@' to browser '%@'", action, browserName ?: @"default");

    // Send request
    [[NSURLSession.sharedSession dataTaskWithRequest:request completionHandler:^(NSData *data, NSURLResponse *response, NSError *error) {
        if (error) {
            NSLog(@"[BrowserBridge] HTTP request failed: %@", error);
            if (completion) {
                dispatch_async(dispatch_get_main_queue(), ^{
                    completion(nil, error);
                });
            }
            return;
        }

        NSHTTPURLResponse *httpResponse = (NSHTTPURLResponse *)response;
        if (httpResponse.statusCode != 200) {
            NSLog(@"[BrowserBridge] HTTP error: %ld", (long)httpResponse.statusCode);
            NSError *httpError = [NSError errorWithDomain:@"BrowserBridge"
                                                     code:httpResponse.statusCode
                                                 userInfo:@{NSLocalizedDescriptionKey: [NSString stringWithFormat:@"HTTP %ld", (long)httpResponse.statusCode]}];
            if (completion) {
                dispatch_async(dispatch_get_main_queue(), ^{
                    completion(nil, httpError);
                });
            }
            return;
        }

        // Parse JSON response
        NSError *parseError = nil;
        NSDictionary *responseDict = [NSJSONSerialization JSONObjectWithData:data options:0 error:&parseError];

        if (parseError) {
            NSLog(@"[BrowserBridge] Failed to parse response: %@", parseError);
            if (completion) {
                dispatch_async(dispatch_get_main_queue(), ^{
                    completion(nil, parseError);
                });
            }
            return;
        }

        // Check for error in response
        if (responseDict[@"error"]) {
            NSLog(@"[BrowserBridge] Server error: %@", responseDict[@"error"]);
            NSError *serverError = [NSError errorWithDomain:@"BrowserBridge"
                                                       code:-1
                                                   userInfo:@{NSLocalizedDescriptionKey: responseDict[@"error"]}];
            if (completion) {
                dispatch_async(dispatch_get_main_queue(), ^{
                    completion(nil, serverError);
                });
            }
            return;
        }

        // Extract result from {success: true, result: {...}}
        NSLog(@"[BrowserBridge] Command succeeded: %@", responseDict[@"result"]);
        if (completion) {
            dispatch_async(dispatch_get_main_queue(), ^{
                completion(responseDict[@"result"], nil);
            });
        }
    }] resume];
}

#pragma mark - Helper Methods

- (NSString *)findNodeExecutable {
    NSArray *possiblePaths = @[
        @"/usr/local/bin/node",
        @"/opt/homebrew/bin/node",
        @"/usr/bin/node",
        [@"~/bin/node" stringByExpandingTildeInPath],
        @"/opt/local/bin/node"
    ];

    NSFileManager *fileManager = [NSFileManager defaultManager];
    for (NSString *path in possiblePaths) {
        if ([fileManager fileExistsAtPath:path]) {
            return path;
        }
    }

    return nil;
}

- (NSString *)findBrowserBridgeScript {
    NSFileManager *fileManager = [NSFileManager defaultManager];

    // Try relative to the app bundle (for deployed builds)
    NSString *bundlePath = [[NSBundle mainBundle] resourcePath];
    NSString *scriptPath = [bundlePath stringByAppendingPathComponent:@"dist/browser-bridge-server.js"];

    if ([fileManager fileExistsAtPath:scriptPath]) {
        return scriptPath;
    }

    // Try relative to project root (for development)
    // Assumes: ScreenControl.app is in macos/DerivedData/.../ScreenControl.app
    // And script is in dist/browser-bridge-server.js

    NSString *appPath = [[NSBundle mainBundle] bundlePath];
    NSString *projectRoot = [[[[appPath stringByDeletingLastPathComponent]
                               stringByDeletingLastPathComponent]
                              stringByDeletingLastPathComponent]
                             stringByDeletingLastPathComponent];

    // Go up from DerivedData to project root
    for (int i = 0; i < 5; i++) {
        projectRoot = [projectRoot stringByDeletingLastPathComponent];
        scriptPath = [projectRoot stringByAppendingPathComponent:@"dist/browser-bridge-server.js"];

        if ([fileManager fileExistsAtPath:scriptPath]) {
            return scriptPath;
        }
    }

    // Try hardcoded dev path
    scriptPath = @"/Users/richardbrown/dev/mcp_eyes_screen_control/dist/browser-bridge-server.js";
    if ([fileManager fileExistsAtPath:scriptPath]) {
        return scriptPath;
    }

    return nil;
}

- (void)dealloc {
    [self stop];
}

@end
