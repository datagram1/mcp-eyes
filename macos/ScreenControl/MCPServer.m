/**
 * MCP-Eyes HTTP Server Implementation
 */

#import "MCPServer.h"
#import "FilesystemTools.h"
#import "ShellTools.h"
#import <sys/socket.h>
#import <netinet/in.h>
#import <arpa/inet.h>
#import <Carbon/Carbon.h>
#import <dlfcn.h>
#import <Vision/Vision.h>

// Forward declaration for executeToolFromWebSocket: method
@interface NSObject (ToolExecution)
- (NSDictionary *)executeToolFromWebSocket:(NSDictionary *)params;
@end

// Dynamic loading for CGWindowListCreateImage (deprecated in macOS 15)
typedef CGImageRef (*CGWindowListCreateImageFn)(CGRect, CGWindowListOption, CGWindowID, CGWindowImageOption);
static CGWindowListCreateImageFn gCGWindowListCreateImage = NULL;

@interface MCPServer ()
@property (nonatomic, assign) int serverSocket;
@property (nonatomic, strong) NSThread *serverThread;
@property (nonatomic, assign) BOOL shouldStop;
@property (nonatomic, assign) NSUInteger serverPort;
@property (nonatomic, strong) NSString *currentAppBundleId;
@property (nonatomic, strong) NSDictionary *currentAppBounds;
@property (nonatomic, strong) NSURLSession *urlSession;
// Tool instances (readwrite internally)
@property (nonatomic, strong, readwrite) FilesystemTools *filesystemTools;
@property (nonatomic, strong, readwrite) ShellTools *shellTools;
@end

@implementation MCPServer

+ (void)initialize {
    if (self == [MCPServer class]) {
        // Load CGWindowListCreateImage dynamically
        void *handle = dlopen("/System/Library/Frameworks/CoreGraphics.framework/CoreGraphics", RTLD_LAZY);
        if (handle) {
            gCGWindowListCreateImage = (CGWindowListCreateImageFn)dlsym(handle, "CGWindowListCreateImage");
        }
    }
}

- (instancetype)initWithPort:(NSUInteger)port apiKey:(NSString *)apiKey {
    self = [super init];
    if (self) {
        _serverPort = port;
        _apiKey = apiKey;
        _serverSocket = -1;
        _shouldStop = NO;
        // Create URL session for proxying browser commands
        NSURLSessionConfiguration *config = [NSURLSessionConfiguration defaultSessionConfiguration];
        config.timeoutIntervalForRequest = 30.0;
        _urlSession = [NSURLSession sessionWithConfiguration:config];
        // Initialize tool instances
        _filesystemTools = [[FilesystemTools alloc] init];
        _shellTools = [[ShellTools alloc] init];
    }
    return self;
}

- (void)dealloc {
    [self stop];
}

- (BOOL)isRunning {
    return _serverSocket >= 0 && _serverThread != nil;
}

- (NSUInteger)port {
    return _serverPort;
}

#pragma mark - Server Lifecycle

- (BOOL)start {
    if (self.isRunning) return YES;

    // Create socket
    _serverSocket = socket(AF_INET, SOCK_STREAM, 0);
    if (_serverSocket < 0) {
        NSLog(@"Failed to create socket");
        return NO;
    }

    // Allow address reuse
    int yes = 1;
    setsockopt(_serverSocket, SOL_SOCKET, SO_REUSEADDR, &yes, sizeof(yes));

    // Bind to port
    struct sockaddr_in addr;
    memset(&addr, 0, sizeof(addr));
    addr.sin_family = AF_INET;
    addr.sin_addr.s_addr = inet_addr("127.0.0.1");
    addr.sin_port = htons(_serverPort);

    if (bind(_serverSocket, (struct sockaddr *)&addr, sizeof(addr)) < 0) {
        NSLog(@"Failed to bind to port %lu", (unsigned long)_serverPort);
        close(_serverSocket);
        _serverSocket = -1;
        return NO;
    }

    // Listen
    if (listen(_serverSocket, 10) < 0) {
        NSLog(@"Failed to listen");
        close(_serverSocket);
        _serverSocket = -1;
        return NO;
    }

    // Start server thread
    _shouldStop = NO;
    _serverThread = [[NSThread alloc] initWithTarget:self selector:@selector(serverLoop) object:nil];
    [_serverThread start];

    NSLog(@"MCP Server started on port %lu", (unsigned long)_serverPort);

    if ([self.delegate respondsToSelector:@selector(serverDidStart:)]) {
        dispatch_async(dispatch_get_main_queue(), ^{
            [self.delegate serverDidStart:self->_serverPort];
        });
    }

    return YES;
}

- (void)stop {
    _shouldStop = YES;

    if (_serverSocket >= 0) {
        close(_serverSocket);
        _serverSocket = -1;
    }

    _serverThread = nil;

    // Clean up shell sessions
    [_shellTools cleanupAllSessions];

    if ([self.delegate respondsToSelector:@selector(serverDidStop)]) {
        dispatch_async(dispatch_get_main_queue(), ^{
            [self.delegate serverDidStop];
        });
    }
}

- (void)serverLoop {
    while (!_shouldStop && _serverSocket >= 0) {
        struct sockaddr_in clientAddr;
        socklen_t clientLen = sizeof(clientAddr);

        int clientSocket = accept(_serverSocket, (struct sockaddr *)&clientAddr, &clientLen);
        if (clientSocket < 0) {
            if (!_shouldStop) {
                NSLog(@"Accept failed");
            }
            continue;
        }

        // Handle request in a new thread
        dispatch_async(dispatch_get_global_queue(DISPATCH_QUEUE_PRIORITY_DEFAULT, 0), ^{
            [self handleClient:clientSocket];
        });
    }
}

#pragma mark - HTTP Handling

- (void)handleClient:(int)clientSocket {
    // Read request
    char buffer[8192];
    ssize_t bytesRead = recv(clientSocket, buffer, sizeof(buffer) - 1, 0);
    if (bytesRead <= 0) {
        close(clientSocket);
        return;
    }
    buffer[bytesRead] = '\0';

    NSString *request = [NSString stringWithUTF8String:buffer];

    // Parse HTTP request
    NSArray *lines = [request componentsSeparatedByString:@"\r\n"];
    if (lines.count == 0) {
        [self sendErrorResponse:clientSocket status:400 message:@"Bad Request"];
        close(clientSocket);
        return;
    }

    NSString *requestLine = lines[0];
    NSArray *parts = [requestLine componentsSeparatedByString:@" "];
    if (parts.count < 2) {
        [self sendErrorResponse:clientSocket status:400 message:@"Bad Request"];
        close(clientSocket);
        return;
    }

    NSString *method = parts[0];
    NSString *path = parts[1];

    // Parse headers
    NSMutableDictionary *headers = [NSMutableDictionary dictionary];
    NSInteger bodyStart = -1;
    for (NSInteger i = 1; i < lines.count; i++) {
        NSString *line = lines[i];
        if (line.length == 0) {
            bodyStart = i + 1;
            break;
        }
        NSRange colonRange = [line rangeOfString:@": "];
        if (colonRange.location != NSNotFound) {
            NSString *key = [[line substringToIndex:colonRange.location] lowercaseString];
            NSString *value = [line substringFromIndex:colonRange.location + 2];
            headers[key] = value;
        }
    }

    // Parse body for POST requests
    NSString *body = @"";
    if (bodyStart > 0 && bodyStart < lines.count) {
        body = [[lines subarrayWithRange:NSMakeRange(bodyStart, lines.count - bodyStart)] componentsJoinedByString:@"\r\n"];
    }

    // Handle CORS preflight
    if ([method isEqualToString:@"OPTIONS"]) {
        [self sendCORSResponse:clientSocket];
        close(clientSocket);
        return;
    }

    // Health check doesn't require auth
    if ([path isEqualToString:@"/health"]) {
        NSDictionary *response = @{@"status": @"ok", @"version": @"2.0.0"};
        [self sendJSONResponse:clientSocket data:response];
        close(clientSocket);
        return;
    }

    // Verify API key
    NSString *authHeader = headers[@"authorization"];
    NSString *providedKey = nil;
    if ([authHeader hasPrefix:@"Bearer "]) {
        providedKey = [authHeader substringFromIndex:7];
    }

    if (!providedKey || ![providedKey isEqualToString:self.apiKey]) {
        [self sendErrorResponse:clientSocket status:401 message:@"Unauthorized"];
        close(clientSocket);
        return;
    }

    // Route request
    NSDictionary *result = [self handlePath:path method:method body:body];
    [self sendJSONResponse:clientSocket data:result];
    close(clientSocket);
}

- (NSDictionary *)handlePath:(NSString *)path method:(NSString *)method body:(NSString *)body {
    // Parse body JSON
    NSDictionary *params = @{};
    if (body.length > 0) {
        NSData *bodyData = [body dataUsingEncoding:NSUTF8StringEncoding];
        NSError *error;
        id parsed = [NSJSONSerialization JSONObjectWithData:bodyData options:0 error:&error];
        if ([parsed isKindOfClass:[NSDictionary class]]) {
            params = parsed;
        }
    }

    if ([self.delegate respondsToSelector:@selector(serverDidReceiveRequest:)]) {
        dispatch_async(dispatch_get_main_queue(), ^{
            [self.delegate serverDidReceiveRequest:path];
        });
    }

    @try {
        // MCP-style /tools/call endpoint (for MCP Proxy compatibility)
        if ([path isEqualToString:@"/tools/call"]) {
            NSString *toolName = params[@"name"];
            NSDictionary *arguments = params[@"arguments"] ?: @{};
            if (!toolName) {
                return @{@"error": @"Missing 'name' parameter"};
            }

            // Route to AppDelegate's executeToolFromWebSocket: method
            if ([self.delegate respondsToSelector:@selector(executeToolFromWebSocket:)]) {
                NSDictionary *toolParams = @{
                    @"name": toolName,
                    @"arguments": arguments
                };
                return [(id)self.delegate executeToolFromWebSocket:toolParams];
            } else {
                return @{@"error": @"Tool execution not available"};
            }
        }
        else if ([path isEqualToString:@"/permissions"]) {
            return [self checkPermissions];
        }
        else if ([path isEqualToString:@"/listApplications"]) {
            return @{@"applications": [self listApplications]};
        }
        else if ([path isEqualToString:@"/focusApplication"]) {
            NSString *identifier = params[@"identifier"];
            if (!identifier) {
                return @{@"error": @"identifier is required"};
            }
            BOOL success = [self focusApplication:identifier];
            return @{@"success": @(success)};
        }
        else if ([path isEqualToString:@"/launchApplication"]) {
            NSString *identifier = params[@"identifier"];
            if (!identifier) {
                return @{@"error": @"identifier is required (bundle ID or app name)"};
            }
            NSDictionary *result = [self launchApplication:identifier];
            return result;
        }
        else if ([path isEqualToString:@"/screenshot"]) {
            // Full-screen screenshot
            NSData *imageData = [self takeScreenshot];
            if (!imageData) {
                return @{@"error": @"Failed to take screenshot"};
            }
            NSString *base64 = [imageData base64EncodedStringWithOptions:0];
            return @{@"image": base64, @"format": @"png"};
        }
        else if ([path isEqualToString:@"/screenshot_app"]) {
            // Screenshot of focused or named app
            NSString *appIdentifier = params[@"identifier"];
            CGWindowID windowID = kCGNullWindowID;
            
            if (appIdentifier) {
                // Use the specified app
                windowID = [self getWindowIDForApp:appIdentifier];
            } else if (self.currentAppBundleId) {
                // Use the currently focused app
                windowID = [self getWindowIDForCurrentApp];
            }
            
            NSData *imageData = nil;
            if (windowID != kCGNullWindowID) {
                imageData = [self takeScreenshotOfWindow:windowID];
            }
            
            if (!imageData) {
                return @{@"error": @"Failed to take screenshot. No app focused or app not found."};
            }
            NSString *base64 = [imageData base64EncodedStringWithOptions:0];
            return @{@"image": base64, @"format": @"png"};
        }
        else if ([path isEqualToString:@"/click"]) {
            NSNumber *x = params[@"x"];
            NSNumber *y = params[@"y"];
            if (!x || !y) {
                return @{@"error": @"x and y are required"};
            }
            NSString *button = params[@"button"] ?: @"left";
            BOOL success = [self clickAtX:x.floatValue y:y.floatValue rightButton:[button isEqualToString:@"right"]];
            return @{@"success": @(success)};
        }
        else if ([path isEqualToString:@"/typeText"]) {
            NSString *text = params[@"text"];
            if (!text) {
                return @{@"error": @"text is required"};
            }
            BOOL success = [self typeText:text];
            return @{@"success": @(success)};
        }
        else if ([path isEqualToString:@"/pressKey"]) {
            NSString *key = params[@"key"];
            if (!key) {
                return @{@"error": @"key is required"};
            }
            BOOL success = [self pressKey:key];
            return @{@"success": @(success)};
        }
        else if ([path isEqualToString:@"/moveMouse"]) {
            NSNumber *x = params[@"x"];
            NSNumber *y = params[@"y"];
            if (!x || !y) {
                return @{@"error": @"x and y are required"};
            }
            BOOL success = [self moveMouseToX:x.floatValue y:y.floatValue];
            return @{@"success": @(success)};
        }
        else if ([path isEqualToString:@"/scroll"]) {
            NSNumber *deltaX = params[@"deltaX"] ?: @0;
            NSNumber *deltaY = params[@"deltaY"] ?: @0;
            NSNumber *x = params[@"x"];
            NSNumber *y = params[@"y"];
            BOOL success = [self scrollDeltaX:deltaX.intValue deltaY:deltaY.intValue atX:x y:y];
            return @{@"success": @(success)};
        }
        else if ([path isEqualToString:@"/drag"]) {
            NSNumber *startX = params[@"startX"];
            NSNumber *startY = params[@"startY"];
            NSNumber *endX = params[@"endX"];
            NSNumber *endY = params[@"endY"];
            if (!startX || !startY || !endX || !endY) {
                return @{@"error": @"startX, startY, endX, and endY are required"};
            }
            BOOL success = [self dragFromX:startX.floatValue y:startY.floatValue toX:endX.floatValue y:endY.floatValue];
            return @{@"success": @(success)};
        }
        else if ([path isEqualToString:@"/currentApp"]) {
            if (self.currentAppBundleId) {
                return @{@"bundleId": self.currentAppBundleId, @"bounds": self.currentAppBounds ?: @{}};
            }
            return @{@"bundleId": [NSNull null], @"bounds": @{}};
        }
        else if ([path isEqualToString:@"/getClickableElements"]) {
            return [self getClickableElements];
        }
        else if ([path isEqualToString:@"/doubleClick"]) {
            NSNumber *x = params[@"x"];
            NSNumber *y = params[@"y"];
            if (!x || !y) {
                return @{@"error": @"x and y are required"};
            }
            BOOL success = [self doubleClickAtX:x.floatValue y:y.floatValue];
            return @{@"success": @(success)};
        }
        else if ([path isEqualToString:@"/clickElement"]) {
            NSNumber *elementIndex = params[@"elementIndex"];
            if (!elementIndex) {
                return @{@"error": @"elementIndex is required"};
            }
            return [self clickElementAtIndex:elementIndex.integerValue];
        }
        else if ([path isEqualToString:@"/scrollMouse"]) {
            NSString *direction = params[@"direction"];
            NSNumber *amount = params[@"amount"] ?: @3;
            if (!direction) {
                return @{@"error": @"direction is required (up or down)"};
            }
            int deltaY = [direction isEqualToString:@"up"] ? amount.intValue : -amount.intValue;
            BOOL success = [self scrollDeltaX:0 deltaY:deltaY atX:nil y:nil];
            return @{@"success": @(success), @"direction": direction, @"amount": amount};
        }
        else if ([path isEqualToString:@"/getMousePosition"]) {
            CGPoint mouseLocation = [NSEvent mouseLocation];
            // Convert from bottom-left origin to top-left origin
            NSScreen *mainScreen = [NSScreen mainScreen];
            CGFloat screenHeight = mainScreen.frame.size.height;
            return @{@"x": @(mouseLocation.x), @"y": @(screenHeight - mouseLocation.y)};
        }
        else if ([path isEqualToString:@"/closeApp"]) {
            NSString *identifier = params[@"identifier"];
            NSNumber *force = params[@"force"] ?: @NO;
            if (!identifier) {
                return @{@"error": @"identifier is required"};
            }
            return [self closeApplication:identifier force:force.boolValue];
        }
        else if ([path isEqualToString:@"/click_absolute"]) {
            NSNumber *x = params[@"x"];
            NSNumber *y = params[@"y"];
            if (!x || !y) {
                return @{@"error": @"x and y are required (absolute screen coordinates in pixels)"};
            }
            NSString *button = params[@"button"] ?: @"left";
            BOOL success = [self clickAbsoluteX:x.floatValue y:y.floatValue rightButton:[button isEqualToString:@"right"]];
            return @{@"success": @(success)};
        }
        else if ([path isEqualToString:@"/getUIElements"]) {
            return [self getUIElements];
        }
        else if ([path isEqualToString:@"/analyzeWithOCR"]) {
            return [self analyzeWithOCR];
        }
        else if ([path isEqualToString:@"/wait"]) {
            NSNumber *milliseconds = params[@"milliseconds"] ?: @1000;
            [NSThread sleepForTimeInterval:milliseconds.doubleValue / 1000.0];
            return @{@"success": @YES, @"waited_ms": milliseconds};
        }
        // ======= FILESYSTEM TOOLS =======
        else if ([path isEqualToString:@"/fs/list"]) {
            NSString *fsPath = params[@"path"];
            if (!fsPath) {
                return @{@"error": @"path is required"};
            }
            BOOL recursive = [params[@"recursive"] boolValue];
            NSInteger maxDepth = [params[@"max_depth"] integerValue] ?: 3;
            return [self.filesystemTools listDirectory:fsPath recursive:recursive maxDepth:maxDepth];
        }
        else if ([path isEqualToString:@"/fs/read"]) {
            NSString *fsPath = params[@"path"];
            if (!fsPath) {
                return @{@"error": @"path is required"};
            }
            NSInteger maxBytes = [params[@"max_bytes"] integerValue] ?: 131072;
            return [self.filesystemTools readFile:fsPath maxBytes:maxBytes];
        }
        else if ([path isEqualToString:@"/fs/read_range"]) {
            NSString *fsPath = params[@"path"];
            NSNumber *startLine = params[@"start_line"];
            NSNumber *endLine = params[@"end_line"];
            if (!fsPath || !startLine || !endLine) {
                return @{@"error": @"path, start_line, and end_line are required"};
            }
            return [self.filesystemTools readFileRange:fsPath
                                             startLine:[startLine integerValue]
                                               endLine:[endLine integerValue]];
        }
        else if ([path isEqualToString:@"/fs/write"]) {
            NSString *fsPath = params[@"path"];
            NSString *content = params[@"content"];
            if (!fsPath || !content) {
                return @{@"error": @"path and content are required"};
            }
            BOOL createDirs = params[@"create_dirs"] ? [params[@"create_dirs"] boolValue] : YES;
            NSString *mode = params[@"mode"] ?: @"overwrite";
            return [self.filesystemTools writeFile:fsPath content:content createDirs:createDirs mode:mode];
        }
        else if ([path isEqualToString:@"/fs/delete"]) {
            NSString *fsPath = params[@"path"];
            if (!fsPath) {
                return @{@"error": @"path is required"};
            }
            BOOL recursive = [params[@"recursive"] boolValue];
            return [self.filesystemTools deletePath:fsPath recursive:recursive];
        }
        else if ([path isEqualToString:@"/fs/move"]) {
            NSString *fromPath = params[@"from"];
            NSString *toPath = params[@"to"];
            if (!fromPath || !toPath) {
                return @{@"error": @"from and to are required"};
            }
            return [self.filesystemTools movePath:fromPath toPath:toPath];
        }
        else if ([path isEqualToString:@"/fs/search"]) {
            NSString *basePath = params[@"base"];
            if (!basePath) {
                return @{@"error": @"base is required"};
            }
            NSString *glob = params[@"glob"] ?: @"**/*";
            NSInteger maxResults = [params[@"max_results"] integerValue] ?: 200;
            return [self.filesystemTools searchFiles:basePath glob:glob maxResults:maxResults];
        }
        else if ([path isEqualToString:@"/fs/grep"]) {
            NSString *basePath = params[@"base"];
            NSString *pattern = params[@"pattern"];
            if (!basePath || !pattern) {
                return @{@"error": @"base and pattern are required"};
            }
            NSString *glob = params[@"glob"];
            NSInteger maxMatches = [params[@"max_matches"] integerValue] ?: 200;
            return [self.filesystemTools grepFiles:basePath pattern:pattern glob:glob maxMatches:maxMatches];
        }
        else if ([path isEqualToString:@"/fs/patch"]) {
            NSString *fsPath = params[@"path"];
            NSArray *operations = params[@"operations"];
            if (!fsPath || !operations) {
                return @{@"error": @"path and operations are required"};
            }
            BOOL dryRun = [params[@"dry_run"] boolValue];
            return [self.filesystemTools patchFile:fsPath operations:operations dryRun:dryRun];
        }
        // ======= SHELL TOOLS =======
        else if ([path isEqualToString:@"/shell/exec"]) {
            NSString *command = params[@"command"];
            if (!command) {
                return @{@"error": @"command is required"};
            }
            NSString *cwd = params[@"cwd"];
            NSTimeInterval timeout = [params[@"timeout_seconds"] doubleValue] ?: 600;
            BOOL captureStderr = params[@"capture_stderr"] ? [params[@"capture_stderr"] boolValue] : YES;
            return [self.shellTools executeCommand:command cwd:cwd timeoutSeconds:timeout captureStderr:captureStderr];
        }
        else if ([path isEqualToString:@"/shell/start_session"]) {
            NSString *command = params[@"command"];
            if (!command) {
                return @{@"error": @"command is required"};
            }
            NSString *cwd = params[@"cwd"];
            NSDictionary *env = params[@"env"];
            BOOL captureStderr = params[@"capture_stderr"] ? [params[@"capture_stderr"] boolValue] : YES;
            return [self.shellTools startSession:command cwd:cwd env:env captureStderr:captureStderr];
        }
        else if ([path isEqualToString:@"/shell/send_input"]) {
            NSString *sessionId = params[@"session_id"];
            NSString *input = params[@"input"];
            if (!sessionId || !input) {
                return @{@"error": @"session_id and input are required"};
            }
            return [self.shellTools sendInput:sessionId input:input];
        }
        else if ([path isEqualToString:@"/shell/stop_session"]) {
            NSString *sessionId = params[@"session_id"];
            if (!sessionId) {
                return @{@"error": @"session_id is required"};
            }
            NSString *signal = params[@"signal"] ?: @"TERM";
            return [self.shellTools stopSession:sessionId signal:signal];
        }
        else if ([path isEqualToString:@"/shell/sessions"]) {
            return @{@"sessions": [self.shellTools getAllSessions]};
        }
        else if ([path isEqualToString:@"/shell/session"]) {
            NSString *sessionId = params[@"session_id"];
            if (!sessionId) {
                return @{@"error": @"session_id is required"};
            }
            NSDictionary *session = [self.shellTools getSession:sessionId];
            if (session) {
                return session;
            }
            return @{@"error": [NSString stringWithFormat:@"Session %@ not found", sessionId]};
        }
        // Browser command proxy - forward to browser bridge server on port 3457
        else if ([path hasPrefix:@"/browser/"]) {
            return [self proxyBrowserCommand:path body:body params:params];
        }
        else {
            return @{@"error": @"Not found", @"path": path};
        }
    }
    @catch (NSException *exception) {
        return @{@"error": exception.reason ?: @"Unknown error"};
    }
}

#pragma mark - HTTP Response Helpers

- (void)sendJSONResponse:(int)socket data:(id)data {
    NSError *error;
    NSData *jsonData = [NSJSONSerialization dataWithJSONObject:data options:0 error:&error];
    if (!jsonData) {
        [self sendErrorResponse:socket status:500 message:@"JSON serialization error"];
        return;
    }

    NSString *response = [NSString stringWithFormat:
        @"HTTP/1.1 200 OK\r\n"
        @"Content-Type: application/json\r\n"
        @"Content-Length: %lu\r\n"
        @"Access-Control-Allow-Origin: *\r\n"
        @"Access-Control-Allow-Headers: Authorization, Content-Type\r\n"
        @"Connection: close\r\n"
        @"\r\n",
        (unsigned long)jsonData.length];

    send(socket, response.UTF8String, strlen(response.UTF8String), 0);
    send(socket, jsonData.bytes, jsonData.length, 0);
}

- (void)sendErrorResponse:(int)socket status:(int)status message:(NSString *)message {
    NSDictionary *error = @{@"error": message};
    NSData *jsonData = [NSJSONSerialization dataWithJSONObject:error options:0 error:nil];

    NSString *statusText = status == 401 ? @"Unauthorized" : (status == 404 ? @"Not Found" : @"Bad Request");
    NSString *response = [NSString stringWithFormat:
        @"HTTP/1.1 %d %@\r\n"
        @"Content-Type: application/json\r\n"
        @"Content-Length: %lu\r\n"
        @"Access-Control-Allow-Origin: *\r\n"
        @"Connection: close\r\n"
        @"\r\n",
        status, statusText, (unsigned long)jsonData.length];

    send(socket, response.UTF8String, strlen(response.UTF8String), 0);
    send(socket, jsonData.bytes, jsonData.length, 0);
}

- (void)sendCORSResponse:(int)socket {
    NSString *response =
        @"HTTP/1.1 200 OK\r\n"
        @"Access-Control-Allow-Origin: *\r\n"
        @"Access-Control-Allow-Methods: GET, POST, OPTIONS\r\n"
        @"Access-Control-Allow-Headers: Authorization, Content-Type\r\n"
        @"Content-Length: 0\r\n"
        @"Connection: close\r\n"
        @"\r\n";

    send(socket, response.UTF8String, strlen(response.UTF8String), 0);
}

#pragma mark - Core MCP Functionality

- (NSDictionary *)checkPermissions {
    BOOL hasAccessibility = AXIsProcessTrusted();
    BOOL hasScreenRecording = NO;

    if (@available(macOS 10.15, *)) {
        hasScreenRecording = CGPreflightScreenCaptureAccess();
    } else {
        hasScreenRecording = YES;
    }

    return @{
        @"accessibility": @(hasAccessibility),
        @"screenRecording": @(hasScreenRecording),
        @"hasPermission": @(hasAccessibility && hasScreenRecording)
    };
}

- (NSArray *)listApplications {
    NSMutableArray *apps = [NSMutableArray array];

    // Get window list
    CFArrayRef windowList = CGWindowListCopyWindowInfo(
        kCGWindowListOptionOnScreenOnly | kCGWindowListExcludeDesktopElements,
        kCGNullWindowID
    );

    if (!windowList) return apps;

    NSMutableSet *seenBundleIds = [NSMutableSet set];

    for (NSDictionary *window in (__bridge NSArray *)windowList) {
        NSString *ownerName = window[(__bridge NSString *)kCGWindowOwnerName];
        NSNumber *ownerPID = window[(__bridge NSString *)kCGWindowOwnerPID];
        NSDictionary *bounds = window[(__bridge NSString *)kCGWindowBounds];

        if (!ownerName || !ownerPID) continue;

        // Get bundle ID from PID with error handling
        NSRunningApplication *runningApp = nil;
        @try {
            runningApp = [NSRunningApplication runningApplicationWithProcessIdentifier:ownerPID.intValue];
        }
        @catch (NSException *exception) {
            // Some processes may not be accessible, skip them
            continue;
        }

        NSString *bundleId = runningApp.bundleIdentifier;
        if (!bundleId || bundleId.length == 0) {
            bundleId = [NSString stringWithFormat:@"pid.%@", ownerPID];
        }

        // Skip duplicates
        if ([seenBundleIds containsObject:bundleId]) continue;
        [seenBundleIds addObject:bundleId];

        CGFloat x = [bounds[@"X"] floatValue];
        CGFloat y = [bounds[@"Y"] floatValue];
        CGFloat width = [bounds[@"Width"] floatValue];
        CGFloat height = [bounds[@"Height"] floatValue];

        [apps addObject:@{
            @"name": ownerName,
            @"bundleId": bundleId,
            @"pid": ownerPID,
            @"bounds": @{
                @"x": @(x),
                @"y": @(y),
                @"width": @(width),
                @"height": @(height)
            }
        }];
    }

    CFRelease(windowList);
    return apps;
}

- (BOOL)focusApplication:(NSString *)identifier {
    NSArray *runningApps = [[NSWorkspace sharedWorkspace] runningApplications];

    for (NSRunningApplication *app in runningApps) {
        if ([app.bundleIdentifier isEqualToString:identifier] ||
            [app.localizedName isEqualToString:identifier]) {

            // Unhide the app first if hidden
            if (app.isHidden) {
                [app unhide];
            }

            // Use osascript subprocess - this properly switches Spaces
            NSString *appName = app.localizedName;
            NSString *script = [NSString stringWithFormat:
                @"tell application \"System Events\" to set frontmost of process \"%@\" to true", appName];

            NSTask *task = [[NSTask alloc] init];
            task.launchPath = @"/usr/bin/osascript";
            task.arguments = @[@"-e", script];
            task.standardOutput = [NSPipe pipe];
            task.standardError = [NSPipe pipe];

            NSError *error = nil;
            [task launchAndReturnError:&error];
            if (error) {
                NSLog(@"osascript launch error: %@", error);
            } else {
                [task waitUntilExit];
            }

            // Also use native activation as backup
            [app activateWithOptions:NSApplicationActivateIgnoringOtherApps | NSApplicationActivateAllWindows];

            self.currentAppBundleId = app.bundleIdentifier;

            // Wait for Space switch to complete
            [NSThread sleepForTimeInterval:0.5];

            // Update bounds synchronously
            [self updateCurrentAppBounds];

            return YES;
        }
    }

    return NO;
}

- (NSDictionary *)launchApplication:(NSString *)identifier {
    NSWorkspace *workspace = [NSWorkspace sharedWorkspace];

    // First check if app is already running
    NSArray *runningApps = [workspace runningApplications];
    for (NSRunningApplication *app in runningApps) {
        if ([app.bundleIdentifier isEqualToString:identifier] ||
            [app.localizedName caseInsensitiveCompare:identifier] == NSOrderedSame) {
            // Already running, just focus it
            [self focusApplication:identifier];
            return @{
                @"success": @YES,
                @"alreadyRunning": @YES,
                @"bundleId": app.bundleIdentifier ?: @"",
                @"name": app.localizedName ?: @""
            };
        }
    }

    // Try to find and launch by bundle ID first
    NSURL *appURL = [workspace URLForApplicationWithBundleIdentifier:identifier];

    if (!appURL) {
        // Try to find by name in Applications folders
        NSArray *searchPaths = @[
            @"/Applications",
            @"/System/Applications",
            @"/System/Applications/Utilities",
            [NSHomeDirectory() stringByAppendingPathComponent:@"Applications"]
        ];

        for (NSString *basePath in searchPaths) {
            NSString *appPath = [basePath stringByAppendingPathComponent:
                [NSString stringWithFormat:@"%@.app", identifier]];
            if ([[NSFileManager defaultManager] fileExistsAtPath:appPath]) {
                appURL = [NSURL fileURLWithPath:appPath];
                break;
            }
        }
    }

    if (!appURL) {
        // Last resort: use `open -a` which does fuzzy matching
        NSTask *task = [[NSTask alloc] init];
        task.launchPath = @"/usr/bin/open";
        task.arguments = @[@"-a", identifier];
        task.standardOutput = [NSPipe pipe];
        task.standardError = [NSPipe pipe];

        NSError *error = nil;
        [task launchAndReturnError:&error];
        if (error) {
            return @{@"success": @NO, @"error": [NSString stringWithFormat:@"Failed to launch: %@", error.localizedDescription]};
        }
        [task waitUntilExit];

        if (task.terminationStatus != 0) {
            NSData *errorData = [[task.standardError fileHandleForReading] readDataToEndOfFile];
            NSString *errorStr = [[NSString alloc] initWithData:errorData encoding:NSUTF8StringEncoding];
            return @{@"success": @NO, @"error": errorStr ?: @"Application not found"};
        }

        // Wait for app to start
        [NSThread sleepForTimeInterval:1.0];

        return @{
            @"success": @YES,
            @"alreadyRunning": @NO,
            @"name": identifier
        };
    }

    // Launch using NSWorkspace
    NSWorkspaceOpenConfiguration *config = [NSWorkspaceOpenConfiguration configuration];
    config.activates = YES;

    __block NSDictionary *result = nil;
    dispatch_semaphore_t semaphore = dispatch_semaphore_create(0);

    [workspace openApplicationAtURL:appURL configuration:config completionHandler:^(NSRunningApplication *app, NSError *error) {
        if (error) {
            result = @{@"success": @NO, @"error": error.localizedDescription};
        } else {
            self.currentAppBundleId = app.bundleIdentifier;
            [NSThread sleepForTimeInterval:0.5];
            [self updateCurrentAppBounds];

            result = @{
                @"success": @YES,
                @"alreadyRunning": @NO,
                @"bundleId": app.bundleIdentifier ?: @"",
                @"name": app.localizedName ?: @"",
                @"pid": @(app.processIdentifier)
            };
        }
        dispatch_semaphore_signal(semaphore);
    }];

    dispatch_semaphore_wait(semaphore, dispatch_time(DISPATCH_TIME_NOW, 10 * NSEC_PER_SEC));

    return result ?: @{@"success": @NO, @"error": @"Launch timeout"};
}

- (void)updateCurrentAppBounds {
    if (!self.currentAppBundleId) return;

    CFArrayRef windowList = CGWindowListCopyWindowInfo(
        kCGWindowListOptionOnScreenOnly | kCGWindowListExcludeDesktopElements,
        kCGNullWindowID
    );

    if (!windowList) return;

    for (NSDictionary *window in (__bridge NSArray *)windowList) {
        NSNumber *ownerPID = window[(__bridge NSString *)kCGWindowOwnerPID];
        NSRunningApplication *app = [NSRunningApplication runningApplicationWithProcessIdentifier:ownerPID.intValue];

        if ([app.bundleIdentifier isEqualToString:self.currentAppBundleId]) {
            NSDictionary *bounds = window[(__bridge NSString *)kCGWindowBounds];
            self.currentAppBounds = @{
                @"x": bounds[@"X"] ?: @0,
                @"y": bounds[@"Y"] ?: @0,
                @"width": bounds[@"Width"] ?: @0,
                @"height": bounds[@"Height"] ?: @0
            };
            break;
        }
    }

    CFRelease(windowList);
}

- (NSData *)takeScreenshot {
    if (!gCGWindowListCreateImage) {
        NSLog(@"CGWindowListCreateImage not available");
        return nil;
    }

    CGImageRef screenImage = gCGWindowListCreateImage(
        CGRectInfinite,
        kCGWindowListOptionOnScreenOnly,
        kCGNullWindowID,
        kCGWindowImageDefault
    );

    if (!screenImage) {
        NSLog(@"Failed to create screen image");
        return nil;
    }

    // Convert to PNG data
    NSBitmapImageRep *bitmap = [[NSBitmapImageRep alloc] initWithCGImage:screenImage];
    CGImageRelease(screenImage);

    NSData *pngData = [bitmap representationUsingType:NSBitmapImageFileTypePNG properties:@{}];
    return pngData;
}

- (CGWindowID)getWindowIDForCurrentApp {
    if (!self.currentAppBundleId) return kCGNullWindowID;
    return [self getWindowIDForApp:self.currentAppBundleId];
}

- (CGWindowID)getWindowIDForApp:(NSString *)identifier {
    // Find the app by bundle ID or name
    NSRunningApplication *app = nil;
    for (NSRunningApplication *runningApp in [[NSWorkspace sharedWorkspace] runningApplications]) {
        if ([runningApp.bundleIdentifier isEqualToString:identifier] ||
            [runningApp.localizedName caseInsensitiveCompare:identifier] == NSOrderedSame) {
            app = runningApp;
            break;
        }
    }
    
    if (!app) return kCGNullWindowID;
    
    // Get window list and find the front window for this app
    CFArrayRef windowList = CGWindowListCopyWindowInfo(
        kCGWindowListOptionOnScreenOnly | kCGWindowListExcludeDesktopElements,
        kCGNullWindowID
    );
    
    if (!windowList) return kCGNullWindowID;
    
    CGWindowID windowID = kCGNullWindowID;
    NSNumber *targetPID = @(app.processIdentifier);
    
    // Find the frontmost window (lowest layer, typically 0)
    NSInteger lowestLayer = NSIntegerMax;
    
    for (NSDictionary *window in (__bridge NSArray *)windowList) {
        NSNumber *ownerPID = window[(__bridge NSString *)kCGWindowOwnerPID];
        if ([ownerPID isEqual:targetPID]) {
            NSNumber *windowIDNum = window[(__bridge NSString *)kCGWindowNumber];
            NSNumber *layer = window[(__bridge NSString *)kCGWindowLayer];
            
            if (windowIDNum && layer) {
                NSInteger layerValue = layer.integerValue;
                if (layerValue < lowestLayer) {
                    lowestLayer = layerValue;
                    windowID = windowIDNum.unsignedIntValue;
                }
            }
        }
    }
    
    CFRelease(windowList);
    return windowID;
}

- (NSData *)takeScreenshotOfWindow:(CGWindowID)windowID {
    if (!gCGWindowListCreateImage) return nil;

    CGImageRef windowImage = gCGWindowListCreateImage(
        CGRectNull,
        kCGWindowListOptionIncludingWindow,
        windowID,
        kCGWindowImageBoundsIgnoreFraming
    );

    if (!windowImage) return nil;

    NSBitmapImageRep *bitmap = [[NSBitmapImageRep alloc] initWithCGImage:windowImage];
    CGImageRelease(windowImage);

    return [bitmap representationUsingType:NSBitmapImageFileTypePNG properties:@{}];
}

- (BOOL)clickAtX:(CGFloat)x y:(CGFloat)y rightButton:(BOOL)rightButton {
    CGFloat absX = x;
    CGFloat absY = y;

    // If we have a current app, treat x/y as relative coordinates (0-1)
    if (self.currentAppBounds) {
        CGFloat boundsX = [self.currentAppBounds[@"x"] floatValue];
        CGFloat boundsY = [self.currentAppBounds[@"y"] floatValue];
        CGFloat boundsW = [self.currentAppBounds[@"width"] floatValue];
        CGFloat boundsH = [self.currentAppBounds[@"height"] floatValue];

        if (boundsW > 0 && boundsH > 0) {
            absX = boundsX + (x * boundsW);
            absY = boundsY + (y * boundsH);
        }
    }

    CGPoint point = CGPointMake(absX, absY);

    CGEventRef mouseDown, mouseUp;
    if (rightButton) {
        mouseDown = CGEventCreateMouseEvent(NULL, kCGEventRightMouseDown, point, kCGMouseButtonRight);
        mouseUp = CGEventCreateMouseEvent(NULL, kCGEventRightMouseUp, point, kCGMouseButtonRight);
    } else {
        mouseDown = CGEventCreateMouseEvent(NULL, kCGEventLeftMouseDown, point, kCGMouseButtonLeft);
        mouseUp = CGEventCreateMouseEvent(NULL, kCGEventLeftMouseUp, point, kCGMouseButtonLeft);
    }

    if (!mouseDown || !mouseUp) {
        if (mouseDown) CFRelease(mouseDown);
        if (mouseUp) CFRelease(mouseUp);
        return NO;
    }

    CGEventPost(kCGHIDEventTap, mouseDown);
    usleep(50000); // 50ms delay
    CGEventPost(kCGHIDEventTap, mouseUp);

    CFRelease(mouseDown);
    CFRelease(mouseUp);

    return YES;
}

- (BOOL)moveMouseToX:(CGFloat)x y:(CGFloat)y {
    CGFloat absX = x;
    CGFloat absY = y;

    // If we have a current app, treat x/y as relative coordinates (0-1)
    if (self.currentAppBounds) {
        CGFloat boundsX = [self.currentAppBounds[@"x"] floatValue];
        CGFloat boundsY = [self.currentAppBounds[@"y"] floatValue];
        CGFloat boundsW = [self.currentAppBounds[@"width"] floatValue];
        CGFloat boundsH = [self.currentAppBounds[@"height"] floatValue];

        if (boundsW > 0 && boundsH > 0) {
            absX = boundsX + (x * boundsW);
            absY = boundsY + (y * boundsH);
        }
    }

    CGPoint point = CGPointMake(absX, absY);
    CGEventRef moveEvent = CGEventCreateMouseEvent(NULL, kCGEventMouseMoved, point, kCGMouseButtonLeft);

    if (!moveEvent) {
        return NO;
    }

    CGEventPost(kCGHIDEventTap, moveEvent);
    CFRelease(moveEvent);

    return YES;
}

- (BOOL)scrollDeltaX:(int)deltaX deltaY:(int)deltaY atX:(NSNumber *)x y:(NSNumber *)y {
    // Optionally move mouse to position first
    if (x && y) {
        [self moveMouseToX:x.floatValue y:y.floatValue];
        usleep(50000); // Wait for mouse to move
    }

    // Create scroll event - positive deltaY scrolls up, negative scrolls down
    CGEventRef scrollEvent = CGEventCreateScrollWheelEvent(
        NULL,
        kCGScrollEventUnitLine,
        2, // number of axes
        deltaY,
        deltaX
    );

    if (!scrollEvent) {
        return NO;
    }

    CGEventPost(kCGHIDEventTap, scrollEvent);
    CFRelease(scrollEvent);

    return YES;
}

- (BOOL)dragFromX:(CGFloat)startX y:(CGFloat)startY toX:(CGFloat)endX y:(CGFloat)endY {
    CGFloat absStartX = startX;
    CGFloat absStartY = startY;
    CGFloat absEndX = endX;
    CGFloat absEndY = endY;

    // If we have a current app, treat coordinates as relative (0-1)
    if (self.currentAppBounds) {
        CGFloat boundsX = [self.currentAppBounds[@"x"] floatValue];
        CGFloat boundsY = [self.currentAppBounds[@"y"] floatValue];
        CGFloat boundsW = [self.currentAppBounds[@"width"] floatValue];
        CGFloat boundsH = [self.currentAppBounds[@"height"] floatValue];

        if (boundsW > 0 && boundsH > 0) {
            absStartX = boundsX + (startX * boundsW);
            absStartY = boundsY + (startY * boundsH);
            absEndX = boundsX + (endX * boundsW);
            absEndY = boundsY + (endY * boundsH);
        }
    }

    CGPoint startPoint = CGPointMake(absStartX, absStartY);
    CGPoint endPoint = CGPointMake(absEndX, absEndY);

    // Move to start position
    CGEventRef moveEvent = CGEventCreateMouseEvent(NULL, kCGEventMouseMoved, startPoint, kCGMouseButtonLeft);
    if (moveEvent) {
        CGEventPost(kCGHIDEventTap, moveEvent);
        CFRelease(moveEvent);
    }
    usleep(50000);

    // Mouse down at start
    CGEventRef mouseDown = CGEventCreateMouseEvent(NULL, kCGEventLeftMouseDown, startPoint, kCGMouseButtonLeft);
    if (!mouseDown) return NO;
    CGEventPost(kCGHIDEventTap, mouseDown);
    CFRelease(mouseDown);
    usleep(50000);

    // Drag to end position (multiple intermediate steps for smooth drag)
    int steps = 10;
    for (int i = 1; i <= steps; i++) {
        CGFloat progress = (CGFloat)i / steps;
        CGFloat currentX = absStartX + (absEndX - absStartX) * progress;
        CGFloat currentY = absStartY + (absEndY - absStartY) * progress;
        CGPoint currentPoint = CGPointMake(currentX, currentY);

        CGEventRef dragEvent = CGEventCreateMouseEvent(NULL, kCGEventLeftMouseDragged, currentPoint, kCGMouseButtonLeft);
        if (dragEvent) {
            CGEventPost(kCGHIDEventTap, dragEvent);
            CFRelease(dragEvent);
        }
        usleep(20000); // 20ms between steps
    }

    // Mouse up at end
    CGEventRef mouseUp = CGEventCreateMouseEvent(NULL, kCGEventLeftMouseUp, endPoint, kCGMouseButtonLeft);
    if (!mouseUp) return NO;
    CGEventPost(kCGHIDEventTap, mouseUp);
    CFRelease(mouseUp);

    return YES;
}

- (BOOL)doubleClickAtX:(CGFloat)x y:(CGFloat)y {
    CGFloat absX = x;
    CGFloat absY = y;

    // If we have a current app, treat x/y as relative coordinates (0-1)
    if (self.currentAppBounds) {
        CGFloat boundsX = [self.currentAppBounds[@"x"] floatValue];
        CGFloat boundsY = [self.currentAppBounds[@"y"] floatValue];
        CGFloat boundsW = [self.currentAppBounds[@"width"] floatValue];
        CGFloat boundsH = [self.currentAppBounds[@"height"] floatValue];

        if (boundsW > 0 && boundsH > 0) {
            absX = boundsX + (x * boundsW);
            absY = boundsY + (y * boundsH);
        }
    }

    CGPoint point = CGPointMake(absX, absY);

    // Create double-click events
    CGEventRef mouseDown1 = CGEventCreateMouseEvent(NULL, kCGEventLeftMouseDown, point, kCGMouseButtonLeft);
    CGEventRef mouseUp1 = CGEventCreateMouseEvent(NULL, kCGEventLeftMouseUp, point, kCGMouseButtonLeft);
    CGEventRef mouseDown2 = CGEventCreateMouseEvent(NULL, kCGEventLeftMouseDown, point, kCGMouseButtonLeft);
    CGEventRef mouseUp2 = CGEventCreateMouseEvent(NULL, kCGEventLeftMouseUp, point, kCGMouseButtonLeft);

    if (!mouseDown1 || !mouseUp1 || !mouseDown2 || !mouseUp2) {
        if (mouseDown1) CFRelease(mouseDown1);
        if (mouseUp1) CFRelease(mouseUp1);
        if (mouseDown2) CFRelease(mouseDown2);
        if (mouseUp2) CFRelease(mouseUp2);
        return NO;
    }

    // Set click count for double-click
    CGEventSetIntegerValueField(mouseDown1, kCGMouseEventClickState, 1);
    CGEventSetIntegerValueField(mouseUp1, kCGMouseEventClickState, 1);
    CGEventSetIntegerValueField(mouseDown2, kCGMouseEventClickState, 2);
    CGEventSetIntegerValueField(mouseUp2, kCGMouseEventClickState, 2);

    // First click
    CGEventPost(kCGHIDEventTap, mouseDown1);
    usleep(30000);
    CGEventPost(kCGHIDEventTap, mouseUp1);
    usleep(30000);

    // Second click
    CGEventPost(kCGHIDEventTap, mouseDown2);
    usleep(30000);
    CGEventPost(kCGHIDEventTap, mouseUp2);

    CFRelease(mouseDown1);
    CFRelease(mouseUp1);
    CFRelease(mouseDown2);
    CFRelease(mouseUp2);

    return YES;
}

- (NSDictionary *)clickElementAtIndex:(NSInteger)elementIndex {
    // Get clickable elements first
    NSDictionary *elementsResult = [self getClickableElements];
    NSArray *elements = elementsResult[@"elements"];

    if (!elements || ![elements isKindOfClass:[NSArray class]]) {
        return @{@"error": @"Failed to get clickable elements"};
    }

    if (elementIndex < 0 || elementIndex >= (NSInteger)elements.count) {
        return @{@"error": [NSString stringWithFormat:@"Element index %ld out of range (0-%lu)", (long)elementIndex, (unsigned long)elements.count - 1]};
    }

    NSDictionary *element = elements[elementIndex];
    NSDictionary *normalizedPosition = element[@"normalizedPosition"];

    if (!normalizedPosition) {
        return @{@"error": @"Element has no normalized position"};
    }

    CGFloat x = [normalizedPosition[@"x"] floatValue];
    CGFloat y = [normalizedPosition[@"y"] floatValue];

    BOOL success = [self clickAtX:x y:y rightButton:NO];

    return @{
        @"success": @(success),
        @"message": [NSString stringWithFormat:@"Clicked element %ld at (%.3f, %.3f)", (long)elementIndex, x, y],
        @"element": element
    };
}

- (NSDictionary *)closeApplication:(NSString *)identifier force:(BOOL)force {
    NSRunningApplication *targetApp = nil;

    // Try to find by bundle ID
    if ([identifier containsString:@"."]) {
        NSArray *apps = [NSRunningApplication runningApplicationsWithBundleIdentifier:identifier];
        targetApp = apps.firstObject;
    }

    // Try to find by PID if identifier is numeric
    if (!targetApp) {
        NSScanner *scanner = [NSScanner scannerWithString:identifier];
        int pid;
        if ([scanner scanInt:&pid] && [scanner isAtEnd]) {
            targetApp = [NSRunningApplication runningApplicationWithProcessIdentifier:pid];
        }
    }

    // Try to find by name
    if (!targetApp) {
        NSArray *allApps = [[NSWorkspace sharedWorkspace] runningApplications];
        for (NSRunningApplication *app in allApps) {
            if ([app.localizedName isEqualToString:identifier] ||
                [app.localizedName.lowercaseString isEqualToString:identifier.lowercaseString]) {
                targetApp = app;
                break;
            }
        }
    }

    if (!targetApp) {
        return @{@"error": [NSString stringWithFormat:@"Application not found: %@", identifier]};
    }

    BOOL success;
    if (force) {
        success = [targetApp forceTerminate];
    } else {
        success = [targetApp terminate];
    }

    return @{
        @"success": @(success),
        @"message": [NSString stringWithFormat:@"%@ application: %@ (%@)",
                     force ? @"Force terminated" : @"Terminated",
                     targetApp.localizedName,
                     targetApp.bundleIdentifier ?: @"unknown"]
    };
}

- (BOOL)typeText:(NSString *)text {
    for (NSUInteger i = 0; i < text.length; i++) {
        unichar character = [text characterAtIndex:i];

        CGEventRef keyDown = CGEventCreateKeyboardEvent(NULL, 0, true);
        CGEventRef keyUp = CGEventCreateKeyboardEvent(NULL, 0, false);

        if (!keyDown || !keyUp) {
            if (keyDown) CFRelease(keyDown);
            if (keyUp) CFRelease(keyUp);
            continue;
        }

        UniChar chars[1] = {character};
        CGEventKeyboardSetUnicodeString(keyDown, 1, chars);
        CGEventKeyboardSetUnicodeString(keyUp, 1, chars);

        CGEventPost(kCGHIDEventTap, keyDown);
        usleep(10000); // 10ms delay
        CGEventPost(kCGHIDEventTap, keyUp);
        usleep(10000);

        CFRelease(keyDown);
        CFRelease(keyUp);
    }

    return YES;
}

- (BOOL)pressKey:(NSString *)key {
    // Map key names to virtual key codes
    NSDictionary *keyMap = @{
        @"return": @36, @"enter": @36,
        @"tab": @48,
        @"space": @49,
        @"delete": @51, @"backspace": @51,
        @"escape": @53, @"esc": @53,
        @"command": @55, @"cmd": @55,
        @"shift": @56,
        @"capslock": @57,
        @"option": @58, @"alt": @58,
        @"control": @59, @"ctrl": @59,
        @"left": @123, @"arrowleft": @123,
        @"right": @124, @"arrowright": @124,
        @"down": @125, @"arrowdown": @125,
        @"up": @126, @"arrowup": @126,
        @"f1": @122, @"f2": @120, @"f3": @99, @"f4": @118,
        @"f5": @96, @"f6": @97, @"f7": @98, @"f8": @100,
        @"f9": @101, @"f10": @109, @"f11": @103, @"f12": @111,
        @"home": @115, @"end": @119,
        @"pageup": @116, @"pagedown": @121,
        // Letter keys
        @"a": @0, @"b": @11, @"c": @8, @"d": @2, @"e": @14, @"f": @3,
        @"g": @5, @"h": @4, @"i": @34, @"j": @38, @"k": @40, @"l": @37,
        @"m": @46, @"n": @45, @"o": @31, @"p": @35, @"q": @12, @"r": @15,
        @"s": @1, @"t": @17, @"u": @32, @"v": @9, @"w": @13, @"x": @7,
        @"y": @16, @"z": @6,
    };

    // Check for modifier key combinations (e.g., "Command+L", "Ctrl+Shift+S")
    CGEventFlags modifierFlags = 0;
    NSString *mainKey = key;

    if ([key containsString:@"+"]) {
        NSArray *parts = [key componentsSeparatedByString:@"+"];
        mainKey = [[parts lastObject] lowercaseString];

        for (NSUInteger i = 0; i < parts.count - 1; i++) {
            NSString *modifier = [[parts[i] lowercaseString] stringByTrimmingCharactersInSet:[NSCharacterSet whitespaceCharacterSet]];
            if ([modifier isEqualToString:@"command"] || [modifier isEqualToString:@"cmd"]) {
                modifierFlags |= kCGEventFlagMaskCommand;
            } else if ([modifier isEqualToString:@"shift"]) {
                modifierFlags |= kCGEventFlagMaskShift;
            } else if ([modifier isEqualToString:@"option"] || [modifier isEqualToString:@"alt"]) {
                modifierFlags |= kCGEventFlagMaskAlternate;
            } else if ([modifier isEqualToString:@"control"] || [modifier isEqualToString:@"ctrl"]) {
                modifierFlags |= kCGEventFlagMaskControl;
            }
        }
    } else {
        mainKey = [key lowercaseString];
    }

    NSNumber *keyCode = keyMap[mainKey];

    if (!keyCode) {
        // Try single character
        if (mainKey.length == 1) {
            // For single characters with modifiers, we need to handle specially
            if (modifierFlags != 0) {
                unichar character = [mainKey characterAtIndex:0];
                CGKeyCode code = 0;

                // Map common letters to key codes
                if (character >= 'a' && character <= 'z') {
                    static CGKeyCode letterKeyCodes[] = {0, 11, 8, 2, 14, 3, 5, 4, 34, 38, 40, 37, 46, 45, 31, 35, 12, 15, 1, 17, 32, 9, 13, 7, 16, 6};
                    code = letterKeyCodes[character - 'a'];
                } else {
                    return NO;
                }

                CGEventRef keyDown = CGEventCreateKeyboardEvent(NULL, code, true);
                CGEventRef keyUp = CGEventCreateKeyboardEvent(NULL, code, false);

                if (!keyDown || !keyUp) {
                    if (keyDown) CFRelease(keyDown);
                    if (keyUp) CFRelease(keyUp);
                    return NO;
                }

                CGEventSetFlags(keyDown, modifierFlags);
                CGEventSetFlags(keyUp, modifierFlags);

                CGEventPost(kCGHIDEventTap, keyDown);
                usleep(50000);
                CGEventPost(kCGHIDEventTap, keyUp);

                CFRelease(keyDown);
                CFRelease(keyUp);
                return YES;
            }
            return [self typeText:mainKey];
        }
        return NO;
    }

    CGEventRef keyDown = CGEventCreateKeyboardEvent(NULL, keyCode.unsignedShortValue, true);
    CGEventRef keyUp = CGEventCreateKeyboardEvent(NULL, keyCode.unsignedShortValue, false);

    if (!keyDown || !keyUp) {
        if (keyDown) CFRelease(keyDown);
        if (keyUp) CFRelease(keyUp);
        return NO;
    }

    // Apply modifier flags if any
    if (modifierFlags != 0) {
        CGEventSetFlags(keyDown, modifierFlags);
        CGEventSetFlags(keyUp, modifierFlags);
    }

    CGEventPost(kCGHIDEventTap, keyDown);
    usleep(50000);
    CGEventPost(kCGHIDEventTap, keyUp);

    CFRelease(keyDown);
    CFRelease(keyUp);

    return YES;
}

#pragma mark - Get Clickable Elements

- (NSDictionary *)getClickableElements {
    if (!self.currentAppBundleId) {
        return @{@"error": @"No application focused. Call focusApplication first."};
    }

    // Get the focused application
    NSRunningApplication *app = nil;
    for (NSRunningApplication *runningApp in [[NSWorkspace sharedWorkspace] runningApplications]) {
        if ([runningApp.bundleIdentifier isEqualToString:self.currentAppBundleId]) {
            app = runningApp;
            break;
        }
    }

    if (!app) {
        return @{@"error": @"Application not found"};
    }

    // Get the AXUIElement for the application
    AXUIElementRef appElement = AXUIElementCreateApplication(app.processIdentifier);
    if (!appElement) {
        return @{@"error": @"Could not access application UI"};
    }

    // Get the focused window
    AXUIElementRef focusedWindow = NULL;
    AXUIElementCopyAttributeValue(appElement, kAXFocusedWindowAttribute, (CFTypeRef *)&focusedWindow);

    if (!focusedWindow) {
        // Try to get the first window
        CFArrayRef windows = NULL;
        AXUIElementCopyAttributeValue(appElement, kAXWindowsAttribute, (CFTypeRef *)&windows);
        if (windows && CFArrayGetCount(windows) > 0) {
            focusedWindow = (AXUIElementRef)CFRetain(CFArrayGetValueAtIndex(windows, 0));
        }
        if (windows) CFRelease(windows);
    }

    NSMutableArray *elements = [NSMutableArray array];

    // Get window bounds for normalization
    CGRect windowBounds = CGRectZero;
    if (focusedWindow) {
        AXValueRef positionValue = NULL;
        AXValueRef sizeValue = NULL;
        CGPoint position = CGPointZero;
        CGSize size = CGSizeZero;

        AXUIElementCopyAttributeValue(focusedWindow, kAXPositionAttribute, (CFTypeRef *)&positionValue);
        AXUIElementCopyAttributeValue(focusedWindow, kAXSizeAttribute, (CFTypeRef *)&sizeValue);

        if (positionValue) {
            AXValueGetValue(positionValue, kAXValueCGPointType, &position);
            CFRelease(positionValue);
        }
        if (sizeValue) {
            AXValueGetValue(sizeValue, kAXValueCGSizeType, &size);
            CFRelease(sizeValue);
        }

        windowBounds = CGRectMake(position.x, position.y, size.width, size.height);

        // Recursively get all UI elements
        [self collectClickableElements:focusedWindow into:elements windowBounds:windowBounds depth:0 maxDepth:15];

        CFRelease(focusedWindow);
    }

    CFRelease(appElement);

    return @{
        @"elements": elements,
        @"count": @(elements.count),
        @"windowBounds": @{
            @"x": @(windowBounds.origin.x),
            @"y": @(windowBounds.origin.y),
            @"width": @(windowBounds.size.width),
            @"height": @(windowBounds.size.height)
        }
    };
}

- (void)collectClickableElements:(AXUIElementRef)element into:(NSMutableArray *)elements windowBounds:(CGRect)windowBounds depth:(int)depth maxDepth:(int)maxDepth {
    if (depth > maxDepth || !element) return;

    // Get element role
    CFStringRef roleRef = NULL;
    AXUIElementCopyAttributeValue(element, kAXRoleAttribute, (CFTypeRef *)&roleRef);
    NSString *role = (__bridge_transfer NSString *)roleRef;

    // Get element position and size
    AXValueRef positionValue = NULL;
    AXValueRef sizeValue = NULL;
    CGPoint position = CGPointZero;
    CGSize size = CGSizeZero;

    AXUIElementCopyAttributeValue(element, kAXPositionAttribute, (CFTypeRef *)&positionValue);
    AXUIElementCopyAttributeValue(element, kAXSizeAttribute, (CFTypeRef *)&sizeValue);

    if (positionValue) {
        AXValueGetValue(positionValue, kAXValueCGPointType, &position);
        CFRelease(positionValue);
    }
    if (sizeValue) {
        AXValueGetValue(sizeValue, kAXValueCGSizeType, &size);
        CFRelease(sizeValue);
    }

    // Check if this is a clickable element
    BOOL isClickable = NO;
    NSString *type = @"unknown";

    if ([role isEqualToString:(__bridge NSString *)kAXButtonRole]) {
        isClickable = YES;
        type = @"button";
    } else if ([role isEqualToString:@"AXLink"]) {
        isClickable = YES;
        type = @"link";
    } else if ([role isEqualToString:(__bridge NSString *)kAXCheckBoxRole]) {
        isClickable = YES;
        type = @"checkbox";
    } else if ([role isEqualToString:(__bridge NSString *)kAXRadioButtonRole]) {
        isClickable = YES;
        type = @"radio";
    } else if ([role isEqualToString:(__bridge NSString *)kAXPopUpButtonRole]) {
        isClickable = YES;
        type = @"dropdown";
    } else if ([role isEqualToString:(__bridge NSString *)kAXMenuItemRole]) {
        isClickable = YES;
        type = @"menuitem";
    } else if ([role isEqualToString:(__bridge NSString *)kAXTextFieldRole]) {
        isClickable = YES;
        type = @"textfield";
    } else if ([role isEqualToString:(__bridge NSString *)kAXTextAreaRole]) {
        isClickable = YES;
        type = @"textarea";
    } else if ([role isEqualToString:@"AXTabGroup"] || [role isEqualToString:@"AXTab"]) {
        isClickable = YES;
        type = @"tab";
    }

    // Get element title/description
    CFStringRef titleRef = NULL;
    CFStringRef descRef = NULL;
    AXUIElementCopyAttributeValue(element, kAXTitleAttribute, (CFTypeRef *)&titleRef);
    AXUIElementCopyAttributeValue(element, kAXDescriptionAttribute, (CFTypeRef *)&descRef);

    NSString *title = (__bridge_transfer NSString *)titleRef ?: @"";
    NSString *desc = (__bridge_transfer NSString *)descRef ?: @"";
    NSString *text = title.length > 0 ? title : desc;

    // Check if enabled
    CFBooleanRef enabledRef = NULL;
    AXUIElementCopyAttributeValue(element, kAXEnabledAttribute, (CFTypeRef *)&enabledRef);
    BOOL isEnabled = enabledRef ? CFBooleanGetValue(enabledRef) : YES;
    if (enabledRef) CFRelease(enabledRef);

    // Add to elements list if clickable and has size
    if (isClickable && size.width > 0 && size.height > 0) {
        // Calculate normalized position relative to window
        CGFloat normalizedX = 0;
        CGFloat normalizedY = 0;

        if (windowBounds.size.width > 0 && windowBounds.size.height > 0) {
            // Center of the element relative to window
            CGFloat centerX = position.x + size.width / 2 - windowBounds.origin.x;
            CGFloat centerY = position.y + size.height / 2 - windowBounds.origin.y;

            normalizedX = centerX / windowBounds.size.width;
            normalizedY = centerY / windowBounds.size.height;
        }

        [elements addObject:@{
            @"type": type,
            @"role": role ?: @"",
            @"text": text,
            @"isEnabled": @(isEnabled),
            @"isClickable": @(isClickable),
            @"bounds": @{
                @"x": @(position.x),
                @"y": @(position.y),
                @"width": @(size.width),
                @"height": @(size.height)
            },
            @"normalizedPosition": @{
                @"x": @(normalizedX),
                @"y": @(normalizedY)
            }
        }];
    }

    // Recursively process children
    CFArrayRef children = NULL;
    AXUIElementCopyAttributeValue(element, kAXChildrenAttribute, (CFTypeRef *)&children);

    if (children) {
        CFIndex count = CFArrayGetCount(children);
        for (CFIndex i = 0; i < count; i++) {
            AXUIElementRef child = (AXUIElementRef)CFArrayGetValueAtIndex(children, i);
            [self collectClickableElements:child into:elements windowBounds:windowBounds depth:depth + 1 maxDepth:maxDepth];
        }
        CFRelease(children);
    }
}

#pragma mark - Click Absolute

- (BOOL)clickAbsoluteX:(CGFloat)x y:(CGFloat)y rightButton:(BOOL)rightButton {
    // Click at absolute screen coordinates (in pixels)
    CGPoint clickPoint = CGPointMake(x, y);

    CGEventRef mouseDown;
    CGEventRef mouseUp;

    if (rightButton) {
        mouseDown = CGEventCreateMouseEvent(NULL, kCGEventRightMouseDown, clickPoint, kCGMouseButtonRight);
        mouseUp = CGEventCreateMouseEvent(NULL, kCGEventRightMouseUp, clickPoint, kCGMouseButtonRight);
    } else {
        mouseDown = CGEventCreateMouseEvent(NULL, kCGEventLeftMouseDown, clickPoint, kCGMouseButtonLeft);
        mouseUp = CGEventCreateMouseEvent(NULL, kCGEventLeftMouseUp, clickPoint, kCGMouseButtonLeft);
    }

    CGEventPost(kCGHIDEventTap, mouseDown);
    usleep(50000); // 50ms delay
    CGEventPost(kCGHIDEventTap, mouseUp);

    CFRelease(mouseDown);
    CFRelease(mouseUp);

    return YES;
}

#pragma mark - Get UI Elements (Enhanced Accessibility Tree)

- (NSDictionary *)getUIElements {
    if (!self.currentAppBundleId) {
        return @{@"error": @"No application focused. Call focusApplication first."};
    }

    NSRunningApplication *app = nil;
    for (NSRunningApplication *runningApp in [[NSWorkspace sharedWorkspace] runningApplications]) {
        if ([runningApp.bundleIdentifier isEqualToString:self.currentAppBundleId]) {
            app = runningApp;
            break;
        }
    }

    if (!app) {
        return @{@"error": @"Application not found"};
    }

    AXUIElementRef appElement = AXUIElementCreateApplication(app.processIdentifier);
    if (!appElement) {
        return @{@"error": @"Could not access application UI"};
    }

    AXUIElementRef focusedWindow = NULL;
    AXUIElementCopyAttributeValue(appElement, kAXFocusedWindowAttribute, (CFTypeRef *)&focusedWindow);

    if (!focusedWindow) {
        CFArrayRef windows = NULL;
        AXUIElementCopyAttributeValue(appElement, kAXWindowsAttribute, (CFTypeRef *)&windows);
        if (windows && CFArrayGetCount(windows) > 0) {
            focusedWindow = (AXUIElementRef)CFRetain(CFArrayGetValueAtIndex(windows, 0));
        }
        if (windows) CFRelease(windows);
    }

    NSMutableArray *clickableElements = [NSMutableArray array];
    NSMutableArray *nonClickableElements = [NSMutableArray array];

    CGRect windowBounds = CGRectZero;
    if (focusedWindow) {
        AXValueRef positionValue = NULL;
        AXValueRef sizeValue = NULL;
        CGPoint position = CGPointZero;
        CGSize size = CGSizeZero;

        AXUIElementCopyAttributeValue(focusedWindow, kAXPositionAttribute, (CFTypeRef *)&positionValue);
        AXUIElementCopyAttributeValue(focusedWindow, kAXSizeAttribute, (CFTypeRef *)&sizeValue);

        if (positionValue) {
            AXValueGetValue(positionValue, kAXValueCGPointType, &position);
            CFRelease(positionValue);
        }
        if (sizeValue) {
            AXValueGetValue(sizeValue, kAXValueCGSizeType, &size);
            CFRelease(sizeValue);
        }

        windowBounds = CGRectMake(position.x, position.y, size.width, size.height);

        [self collectAllUIElements:focusedWindow
                    clickable:clickableElements
                 nonClickable:nonClickableElements
                 windowBounds:windowBounds
                        depth:0
                     maxDepth:20];

        CFRelease(focusedWindow);
    }

    CFRelease(appElement);

    return @{
        @"clickable": clickableElements,
        @"nonClickable": nonClickableElements,
        @"clickableCount": @(clickableElements.count),
        @"nonClickableCount": @(nonClickableElements.count),
        @"windowBounds": @{
            @"x": @(windowBounds.origin.x),
            @"y": @(windowBounds.origin.y),
            @"width": @(windowBounds.size.width),
            @"height": @(windowBounds.size.height)
        }
    };
}

- (void)collectAllUIElements:(AXUIElementRef)element
                   clickable:(NSMutableArray *)clickable
                nonClickable:(NSMutableArray *)nonClickable
                windowBounds:(CGRect)windowBounds
                       depth:(int)depth
                    maxDepth:(int)maxDepth {
    if (depth > maxDepth || !element) return;

    CFStringRef roleRef = NULL;
    AXUIElementCopyAttributeValue(element, kAXRoleAttribute, (CFTypeRef *)&roleRef);
    NSString *role = (__bridge_transfer NSString *)roleRef;

    AXValueRef positionValue = NULL;
    AXValueRef sizeValue = NULL;
    CGPoint position = CGPointZero;
    CGSize size = CGSizeZero;

    AXUIElementCopyAttributeValue(element, kAXPositionAttribute, (CFTypeRef *)&positionValue);
    AXUIElementCopyAttributeValue(element, kAXSizeAttribute, (CFTypeRef *)&sizeValue);

    if (positionValue) {
        AXValueGetValue(positionValue, kAXValueCGPointType, &position);
        CFRelease(positionValue);
    }
    if (sizeValue) {
        AXValueGetValue(sizeValue, kAXValueCGSizeType, &size);
        CFRelease(sizeValue);
    }

    // Determine if clickable and get type
    BOOL isClickable = NO;
    NSString *type = role ?: @"unknown";

    NSSet *clickableRoles = [NSSet setWithArray:@[
        (__bridge NSString *)kAXButtonRole,
        @"AXLink",
        (__bridge NSString *)kAXCheckBoxRole,
        (__bridge NSString *)kAXRadioButtonRole,
        (__bridge NSString *)kAXPopUpButtonRole,
        (__bridge NSString *)kAXMenuItemRole,
        (__bridge NSString *)kAXTextFieldRole,
        (__bridge NSString *)kAXTextAreaRole,
        @"AXTabGroup",
        @"AXTab",
        (__bridge NSString *)kAXSliderRole,
        (__bridge NSString *)kAXIncrementorRole,
        (__bridge NSString *)kAXComboBoxRole
    ]];

    if ([clickableRoles containsObject:role]) {
        isClickable = YES;
    }

    // Get element attributes
    CFStringRef titleRef = NULL;
    CFStringRef descRef = NULL;
    CFStringRef valueRef = NULL;
    CFStringRef helpRef = NULL;
    AXUIElementCopyAttributeValue(element, kAXTitleAttribute, (CFTypeRef *)&titleRef);
    AXUIElementCopyAttributeValue(element, kAXDescriptionAttribute, (CFTypeRef *)&descRef);
    AXUIElementCopyAttributeValue(element, kAXValueAttribute, (CFTypeRef *)&valueRef);
    AXUIElementCopyAttributeValue(element, kAXHelpAttribute, (CFTypeRef *)&helpRef);

    NSString *title = (__bridge_transfer NSString *)titleRef ?: @"";
    NSString *desc = (__bridge_transfer NSString *)descRef ?: @"";
    NSString *value = @"";
    NSString *help = (__bridge_transfer NSString *)helpRef ?: @"";

    if (valueRef) {
        if (CFGetTypeID(valueRef) == CFStringGetTypeID()) {
            value = (__bridge_transfer NSString *)valueRef;
        } else {
            CFRelease(valueRef);
        }
    }

    CFBooleanRef enabledRef = NULL;
    AXUIElementCopyAttributeValue(element, kAXEnabledAttribute, (CFTypeRef *)&enabledRef);
    BOOL isEnabled = enabledRef ? CFBooleanGetValue(enabledRef) : YES;
    if (enabledRef) CFRelease(enabledRef);

    // Only add elements with size
    if (size.width > 0 && size.height > 0) {
        CGFloat normalizedX = 0;
        CGFloat normalizedY = 0;

        if (windowBounds.size.width > 0 && windowBounds.size.height > 0) {
            CGFloat centerX = position.x + size.width / 2 - windowBounds.origin.x;
            CGFloat centerY = position.y + size.height / 2 - windowBounds.origin.y;
            normalizedX = centerX / windowBounds.size.width;
            normalizedY = centerY / windowBounds.size.height;
        }

        NSDictionary *elementInfo = @{
            @"type": type,
            @"role": role ?: @"",
            @"title": title,
            @"description": desc,
            @"value": value,
            @"help": help,
            @"isEnabled": @(isEnabled),
            @"bounds": @{
                @"x": @(position.x),
                @"y": @(position.y),
                @"width": @(size.width),
                @"height": @(size.height)
            },
            @"normalizedPosition": @{
                @"x": @(normalizedX),
                @"y": @(normalizedY)
            }
        };

        if (isClickable) {
            [clickable addObject:elementInfo];
        } else {
            [nonClickable addObject:elementInfo];
        }
    }

    // Recursively process children
    CFArrayRef children = NULL;
    AXUIElementCopyAttributeValue(element, kAXChildrenAttribute, (CFTypeRef *)&children);

    if (children) {
        CFIndex count = CFArrayGetCount(children);
        for (CFIndex i = 0; i < count; i++) {
            AXUIElementRef child = (AXUIElementRef)CFArrayGetValueAtIndex(children, i);
            [self collectAllUIElements:child clickable:clickable nonClickable:nonClickable windowBounds:windowBounds depth:depth + 1 maxDepth:maxDepth];
        }
        CFRelease(children);
    }
}

#pragma mark - OCR Analysis

- (NSDictionary *)analyzeWithOCR {
    // Take a screenshot first
    NSData *imageData = nil;

    if (self.currentAppBundleId) {
        CGWindowID windowID = [self getWindowIDForCurrentApp];
        if (windowID != kCGNullWindowID) {
            imageData = [self takeScreenshotOfWindow:windowID];
        }
    }

    if (!imageData) {
        imageData = [self takeScreenshot];
    }

    if (!imageData) {
        return @{@"error": @"Failed to capture screenshot for OCR"};
    }

    // Create CGImage from PNG data
    CGImageSourceRef source = CGImageSourceCreateWithData((__bridge CFDataRef)imageData, NULL);
    if (!source) {
        return @{@"error": @"Failed to create image source"};
    }

    CGImageRef cgImage = CGImageSourceCreateImageAtIndex(source, 0, NULL);
    CFRelease(source);

    if (!cgImage) {
        return @{@"error": @"Failed to create image for OCR"};
    }

    // Perform OCR using Vision framework
    __block NSMutableArray *textResults = [NSMutableArray array];
    __block NSError *ocrError = nil;

    dispatch_semaphore_t semaphore = dispatch_semaphore_create(0);

    VNRecognizeTextRequest *request = [[VNRecognizeTextRequest alloc] initWithCompletionHandler:^(VNRequest *request, NSError *error) {
        if (error) {
            ocrError = error;
        } else {
            for (VNRecognizedTextObservation *observation in request.results) {
                VNRecognizedText *topCandidate = [[observation topCandidates:1] firstObject];
                if (topCandidate) {
                    CGRect boundingBox = observation.boundingBox;
                    // Convert from normalized coordinates (origin bottom-left) to pixels (origin top-left)
                    CGFloat imageWidth = CGImageGetWidth(cgImage);
                    CGFloat imageHeight = CGImageGetHeight(cgImage);

                    CGFloat x = boundingBox.origin.x * imageWidth;
                    CGFloat y = (1 - boundingBox.origin.y - boundingBox.size.height) * imageHeight;
                    CGFloat width = boundingBox.size.width * imageWidth;
                    CGFloat height = boundingBox.size.height * imageHeight;

                    [textResults addObject:@{
                        @"text": topCandidate.string,
                        @"confidence": @(topCandidate.confidence),
                        @"bounds": @{
                            @"x": @(x),
                            @"y": @(y),
                            @"width": @(width),
                            @"height": @(height)
                        }
                    }];
                }
            }
        }
        dispatch_semaphore_signal(semaphore);
    }];

    request.recognitionLevel = VNRequestTextRecognitionLevelAccurate;
    request.usesLanguageCorrection = YES;

    VNImageRequestHandler *handler = [[VNImageRequestHandler alloc] initWithCGImage:cgImage options:@{}];

    NSError *performError = nil;
    [handler performRequests:@[request] error:&performError];

    if (performError) {
        CGImageRelease(cgImage);
        return @{@"error": [NSString stringWithFormat:@"OCR failed: %@", performError.localizedDescription]};
    }

    // Wait for completion (with timeout)
    dispatch_semaphore_wait(semaphore, dispatch_time(DISPATCH_TIME_NOW, 30 * NSEC_PER_SEC));

    CGImageRelease(cgImage);

    if (ocrError) {
        return @{@"error": [NSString stringWithFormat:@"OCR failed: %@", ocrError.localizedDescription]};
    }

    return @{
        @"success": @YES,
        @"textBlocks": textResults,
        @"count": @(textResults.count)
    };
}

#pragma mark - Browser Command Proxy

- (NSDictionary *)proxyBrowserCommand:(NSString *)path body:(NSString *)body params:(NSDictionary *)params {
    // Proxy browser commands to browser bridge server on port 3457
    NSURL *url = [NSURL URLWithString:[NSString stringWithFormat:@"http://127.0.0.1:3457%@", path]];
    if (!url) {
        return @{@"error": @"Invalid URL"};
    }
    
    NSMutableURLRequest *request = [NSMutableURLRequest requestWithURL:url];
    [request setHTTPMethod:@"POST"];
    [request setValue:@"application/json" forHTTPHeaderField:@"Content-Type"];
    
    // Forward the request body
    if (body.length > 0) {
        [request setHTTPBody:[body dataUsingEncoding:NSUTF8StringEncoding]];
    } else if (params.count > 0) {
        NSError *jsonError;
        NSData *jsonData = [NSJSONSerialization dataWithJSONObject:params options:0 error:&jsonError];
        if (jsonData) {
            [request setHTTPBody:jsonData];
        }
    }
    
    // Synchronous request (for simplicity - could be async)
    __block NSDictionary *result = nil;
    __block NSError *requestError = nil;
    dispatch_semaphore_t semaphore = dispatch_semaphore_create(0);
    
    NSURLSessionDataTask *task = [self.urlSession dataTaskWithRequest:request
                                                     completionHandler:^(NSData *data, NSURLResponse *response, NSError *error) {
        if (error) {
            requestError = error;
            result = @{@"error": error.localizedDescription};
        } else {
            NSError *jsonError;
            id jsonObject = [NSJSONSerialization JSONObjectWithData:data options:0 error:&jsonError];
            if (jsonObject && [jsonObject isKindOfClass:[NSDictionary class]]) {
                result = jsonObject;
            } else if (jsonObject && [jsonObject isKindOfClass:[NSArray class]]) {
                result = @{@"result": jsonObject};
            } else {
                NSString *stringResult = [[NSString alloc] initWithData:data encoding:NSUTF8StringEncoding];
                result = @{@"result": stringResult ?: @""};
            }
        }
        dispatch_semaphore_signal(semaphore);
    }];
    
    [task resume];
    dispatch_semaphore_wait(semaphore, dispatch_time(DISPATCH_TIME_NOW, 30 * NSEC_PER_SEC));
    
    return result ?: @{@"error": @"Request timeout or failed"};
}

@end
