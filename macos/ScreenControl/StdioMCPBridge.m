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

// Current app tracking (for screenshot_app)
@property (nonatomic, strong) NSString *currentAppBundleId;
@property (nonatomic, strong) NSDictionary *currentAppBounds;
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

    // Start BrowserWebSocketServer for browser extension on port 3459
    // (Port 3457 is used by GUI app, 3458 by TestServer)
    self.browserWebSocketServer = [[BrowserWebSocketServer alloc] initWithPort:3459];
    self.browserWebSocketServer.delegate = self;
    BOOL wsStarted = [self.browserWebSocketServer start];
    if (wsStarted) {
        [self logError:@"Started BrowserWebSocketServer on port 3459"];
    } else {
        [self logError:@"WARNING: Failed to start BrowserWebSocketServer on port 3459"];
        [self logError:@"Browser tools will NOT be available."];
    }

    // Start reading from stdin
    [self startReadingStdin];

    // Run the main run loop
    [[NSRunLoop mainRunLoop] run];
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
    NSArray *content;
    if (result[@"error"]) {
        content = @[@{@"type": @"text", @"text": result[@"error"], @"isError": @YES}];
    } else {
        NSData *jsonData = [NSJSONSerialization dataWithJSONObject:result options:NSJSONWritingPrettyPrinted error:nil];
        NSString *jsonString = [[NSString alloc] initWithData:jsonData encoding:NSUTF8StringEncoding];
        content = @[@{@"type": @"text", @"text": jsonString ?: @"{}"}];
    }

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
        if ([toolName isEqualToString:@"screenshot"] || [toolName isEqualToString:@"desktop_screenshot"]) {
            NSData *imageData = [self.mcpServer takeScreenshot];
            if (!imageData) return @{@"error": @"Failed to take screenshot"};
            NSString *base64 = [imageData base64EncodedStringWithOptions:0];
            return @{@"image": base64, @"format": @"png"};
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
            NSString *base64 = [imageData base64EncodedStringWithOptions:0];
            return @{@"image": base64, @"format": @"png"};
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

        // ============= FILESYSTEM TOOLS =============
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

        // ============= SHELL TOOLS =============
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

    return result;
}

#pragma mark - Tool Definitions

- (NSArray *)getAvailableTools {
    NSMutableArray *tools = [NSMutableArray array];

    // Include browser tools if the WebSocket server is running (matches Agent behavior)
    // Tools will fail gracefully if no browser is connected when called
    BOOL includeBrowserTools = self.browserWebSocketServer && self.browserWebSocketServer.isRunning;

    [self logError:[NSString stringWithFormat:@"Building tool list - Browser bridge running: %@, connected browsers: %lu",
                    includeBrowserTools ? @"YES" : @"NO",
                    (unsigned long)(self.browserWebSocketServer ? self.browserWebSocketServer.connectedBrowsers.count : 0)]];

    // Tool definitions by category
    NSDictionary *toolDefinitions = @{
        @"gui": @[
            @"listApplications", @"focusApplication", @"launchApplication",
            @"screenshot", @"screenshot_app", @"click", @"click_absolute",
            @"doubleClick", @"clickElement", @"moveMouse", @"scroll",
            @"scrollMouse", @"drag", @"getClickableElements", @"getUIElements",
            @"getMousePosition", @"typeText", @"pressKey", @"analyzeWithOCR",
            @"checkPermissions", @"closeApp", @"wait"
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
        // Desktop tools
        @"screenshot": @"Take a screenshot of the entire desktop",
        @"desktop_screenshot": @"Take a screenshot of the entire desktop",
        @"screenshot_app": @"Take a screenshot of a specific application window",
        @"click": @"Click at coordinates relative to current app",
        @"click_absolute": @"Click at absolute screen coordinates",
        @"doubleClick": @"Double-click at coordinates",
        @"clickElement": @"Click a UI element by index",
        @"moveMouse": @"Move mouse to coordinates",
        @"getMousePosition": @"Get current mouse position",
        @"scroll": @"Scroll with delta values",
        @"scrollMouse": @"Scroll up or down",
        @"drag": @"Drag from one point to another",
        @"getClickableElements": @"Get list of clickable UI elements",
        @"getUIElements": @"Get all UI elements",
        @"typeText": @"Type text using keyboard",
        @"pressKey": @"Press a specific key",
        @"analyzeWithOCR": @"Analyze screen with OCR",
        @"listApplications": @"List running applications",
        @"focusApplication": @"Focus an application",
        @"launchApplication": @"Launch an application",
        @"closeApp": @"Close an application",
        @"currentApp": @"Get current focused application",
        @"checkPermissions": @"Check accessibility permissions",
        @"wait": @"Wait for specified milliseconds",

        // Browser tools
        @"browser_navigate": @"Navigate browser to a URL",
        @"browser_screenshot": @"Take a browser screenshot",
        @"browser_getVisibleText": @"Get visible text from a tab (use 'url' parameter to target background tab without switching)",
        @"browser_searchVisibleText": @"Search for text in a tab",
        @"browser_clickElement": @"Click an element in the browser",
        @"browser_fillElement": @"Fill a form field",
        @"browser_getTabs": @"Get list of open tabs",
        @"browser_getActiveTab": @"Get the active tab",
        @"browser_focusTab": @"Focus a specific tab",
        @"browser_createTab": @"Create a new tab",
        @"browser_closeTab": @"Close a tab",
        @"browser_go_back": @"Navigate back",
        @"browser_go_forward": @"Navigate forward",
        @"browser_get_visible_html": @"Get page HTML",
        @"browser_executeScript": @"Execute JavaScript",
        @"browser_listConnected": @"List connected browsers",

        // Filesystem tools
        @"fs_list": @"List directory contents",
        @"fs_read": @"Read a file",
        @"fs_read_range": @"Read specific lines from a file",
        @"fs_write": @"Write to a file",
        @"fs_delete": @"Delete a file or directory",
        @"fs_move": @"Move/rename a file",
        @"fs_search": @"Search for files by pattern",
        @"fs_grep": @"Search file contents",
        @"fs_patch": @"Apply patches to a file",

        // Shell tools
        @"shell_exec": @"Execute a shell command",
        @"shell_start_session": @"Start an interactive shell session",
        @"shell_send_input": @"Send input to a shell session",
        @"shell_stop_session": @"Stop a shell session"
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
    else if ([toolName isEqualToString:@"focusApplication"] || [toolName isEqualToString:@"launchApplication"] ||
             [toolName isEqualToString:@"closeApp"] || [toolName isEqualToString:@"screenshot_app"]) {
        properties[@"identifier"] = @{@"type": @"string", @"description": @"App bundle ID or name"};
        if ([toolName isEqualToString:@"closeApp"]) {
            properties[@"force"] = @{@"type": @"boolean", @"description": @"Force quit the app"};
        }
    }
    else if ([toolName isEqualToString:@"wait"]) {
        properties[@"milliseconds"] = @{@"type": @"number", @"description": @"Time to wait in milliseconds"};
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
        else if ([toolName isEqualToString:@"browser_getVisibleText"] ||
                 [toolName isEqualToString:@"browser_searchVisibleText"] ||
                 [toolName isEqualToString:@"browser_getUIElements"] ||
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

#pragma mark - MCP Notifications

- (void)sendToolsListChangedNotification {
    // MCP notification to tell Claude Code the tool list has changed
    // This allows dynamic re-advertisement of browser tools when browsers connect/disconnect
    NSDictionary *notification = @{
        @"jsonrpc": @"2.0",
        @"method": @"notifications/tools/list_changed"
    };

    NSUInteger browserCount = self.browserWebSocketServer.connectedBrowsers.count;
    NSArray *tools = [self getAvailableTools];
    [self logError:[NSString stringWithFormat:@"Sending tools/list_changed notification (browsers: %lu, tools: %lu)",
                    (unsigned long)browserCount, (unsigned long)tools.count]];

    [self writeMCPResponse:notification];
}

#pragma mark - Logging

- (void)logError:(NSString *)message {
    // Write to stderr for debugging
    NSFileHandle *stderrHandle = [NSFileHandle fileHandleWithStandardError];
    NSString *logMessage = [NSString stringWithFormat:@"[StdioMCPBridge] %@\n", message];
    [stderrHandle writeData:[logMessage dataUsingEncoding:NSUTF8StringEncoding]];
}

@end
