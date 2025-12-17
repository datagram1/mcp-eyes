//
//  TestServer.m
//  ScreenControl
//
//  Remote testing server for automated agent testing.
//  Only available in DEBUG builds.
//

#import "TestServer.h"

#ifdef DEBUG

#import "AppDelegate.h"
#import <sys/socket.h>
#import <netinet/in.h>
#import <arpa/inet.h>

@interface TestServer ()
@property (nonatomic, assign) int serverSocket;
@property (nonatomic, strong) dispatch_source_t acceptSource;
@property (nonatomic, assign) BOOL isRunning;
@property (nonatomic, assign) uint16_t port;
@end

@implementation TestServer

- (instancetype)initWithAppDelegate:(AppDelegate *)appDelegate {
    self = [super init];
    if (self) {
        _appDelegate = appDelegate;
        _serverSocket = -1;
        _isRunning = NO;
        _port = 0;
    }
    return self;
}

- (void)dealloc {
    [self stop];
}

- (BOOL)startOnPort:(uint16_t)port {
    if (self.isRunning) {
        NSLog(@"[TestServer] Already running on port %d", self.port);
        return YES;
    }

    // Try primary port, then fallback
    uint16_t ports[] = { port, (uint16_t)(port + 1) };

    for (int i = 0; i < 2; i++) {
        if ([self bindToPort:ports[i]]) {
            self.port = ports[i];
            self.isRunning = YES;
            NSLog(@"[TestServer] Started on 0.0.0.0:%d (DEBUG BUILD ONLY - accessible remotely)", self.port);
            return YES;
        }
    }

    NSLog(@"[TestServer] Failed to bind to any port");
    return NO;
}

- (BOOL)bindToPort:(uint16_t)port {
    // Create socket
    self.serverSocket = socket(AF_INET, SOCK_STREAM, 0);
    if (self.serverSocket < 0) {
        NSLog(@"[TestServer] Failed to create socket: %s", strerror(errno));
        return NO;
    }

    // Allow address reuse
    int optval = 1;
    setsockopt(self.serverSocket, SOL_SOCKET, SO_REUSEADDR, &optval, sizeof(optval));

    // Bind to all interfaces for remote testing (DEBUG builds only)
    struct sockaddr_in addr;
    memset(&addr, 0, sizeof(addr));
    addr.sin_family = AF_INET;
    addr.sin_port = htons(port);
    addr.sin_addr.s_addr = INADDR_ANY;  // 0.0.0.0 - allows remote access in DEBUG builds

    if (bind(self.serverSocket, (struct sockaddr *)&addr, sizeof(addr)) < 0) {
        NSLog(@"[TestServer] Failed to bind to port %d: %s", port, strerror(errno));
        close(self.serverSocket);
        self.serverSocket = -1;
        return NO;
    }

    // Listen
    if (listen(self.serverSocket, 5) < 0) {
        NSLog(@"[TestServer] Failed to listen: %s", strerror(errno));
        close(self.serverSocket);
        self.serverSocket = -1;
        return NO;
    }

    // Create dispatch source for accepting connections
    self.acceptSource = dispatch_source_create(DISPATCH_SOURCE_TYPE_READ, self.serverSocket, 0, dispatch_get_global_queue(DISPATCH_QUEUE_PRIORITY_DEFAULT, 0));

    __weak typeof(self) weakSelf = self;
    dispatch_source_set_event_handler(self.acceptSource, ^{
        [weakSelf acceptConnection];
    });

    dispatch_source_set_cancel_handler(self.acceptSource, ^{
        if (weakSelf.serverSocket >= 0) {
            close(weakSelf.serverSocket);
            weakSelf.serverSocket = -1;
        }
    });

    dispatch_resume(self.acceptSource);

    return YES;
}

- (void)stop {
    if (!self.isRunning) return;

    NSLog(@"[TestServer] Stopping...");

    if (self.acceptSource) {
        dispatch_source_cancel(self.acceptSource);
        self.acceptSource = nil;
    }

    self.isRunning = NO;
    self.port = 0;
}

- (void)acceptConnection {
    struct sockaddr_in clientAddr;
    socklen_t clientLen = sizeof(clientAddr);

    int clientSocket = accept(self.serverSocket, (struct sockaddr *)&clientAddr, &clientLen);
    if (clientSocket < 0) {
        NSLog(@"[TestServer] Accept failed: %s", strerror(errno));
        return;
    }

    // Handle connection in background
    dispatch_async(dispatch_get_global_queue(DISPATCH_QUEUE_PRIORITY_DEFAULT, 0), ^{
        [self handleClient:clientSocket];
    });
}

- (void)handleClient:(int)clientSocket {
    // Read HTTP request
    char buffer[4096];
    ssize_t bytesRead = recv(clientSocket, buffer, sizeof(buffer) - 1, 0);

    if (bytesRead <= 0) {
        close(clientSocket);
        return;
    }

    buffer[bytesRead] = '\0';
    NSString *request = [NSString stringWithUTF8String:buffer];

    // Parse HTTP request
    NSString *response = [self handleRequest:request];

    // Send HTTP response
    NSString *httpResponse = [NSString stringWithFormat:
        @"HTTP/1.1 200 OK\r\n"
        @"Content-Type: application/json\r\n"
        @"Access-Control-Allow-Origin: *\r\n"
        @"Connection: close\r\n"
        @"Content-Length: %lu\r\n"
        @"\r\n"
        @"%@",
        (unsigned long)[response lengthOfBytesUsingEncoding:NSUTF8StringEncoding],
        response
    ];

    const char *responseBytes = [httpResponse UTF8String];
    send(clientSocket, responseBytes, strlen(responseBytes), 0);

    close(clientSocket);
}

- (NSString *)handleRequest:(NSString *)httpRequest {
    // Handle GET requests first (before checking for body)
    if ([httpRequest hasPrefix:@"GET "]) {
        if ([httpRequest hasPrefix:@"GET /ping"]) {
            return [self handleMethod:@"ping" params:nil];
        } else if ([httpRequest hasPrefix:@"GET / "] || [httpRequest hasPrefix:@"GET / HTTP"] || [httpRequest hasPrefix:@"GET /\r\n"]) {
            // Base endpoint - return menu
            return [self handleMenu];
        }
    }

    // Handle OPTIONS (CORS preflight)
    if ([httpRequest hasPrefix:@"OPTIONS"]) {
        return @"{}";
    }

    // Extract JSON body from HTTP request
    NSRange bodyRange = [httpRequest rangeOfString:@"\r\n\r\n"];
    if (bodyRange.location == NSNotFound) {
        return @"{\"error\":\"Invalid request\"}";
    }

    NSString *body = [httpRequest substringFromIndex:NSMaxRange(bodyRange)];

    // Parse JSON
    NSData *jsonData = [body dataUsingEncoding:NSUTF8StringEncoding];
    if (!jsonData || jsonData.length == 0) {
        return @"{\"error\":\"Empty body\"}";
    }

    NSError *error;
    NSDictionary *json = [NSJSONSerialization JSONObjectWithData:jsonData options:0 error:&error];
    if (error || !json) {
        return [NSString stringWithFormat:@"{\"error\":\"Invalid JSON: %@\"}", error.localizedDescription];
    }

    NSString *method = json[@"method"];
    NSDictionary *params = json[@"params"];

    if (!method) {
        return @"{\"error\":\"Missing method\"}";
    }

    return [self handleMethod:method params:params];
}

- (NSString *)handleMethod:(NSString *)method params:(NSDictionary *)params {
    NSDictionary *result;

    if ([method isEqualToString:@"ping"]) {
        result = [self handlePing];
    } else if ([method isEqualToString:@"getState"]) {
        result = [self handleGetState];
    } else if ([method isEqualToString:@"getFields"]) {
        result = [self handleGetFields];
    } else if ([method isEqualToString:@"setField"]) {
        result = [self handleSetField:params];
    } else if ([method isEqualToString:@"clickButton"]) {
        result = [self handleClickButton:params];
    } else if ([method isEqualToString:@"getLogs"]) {
        result = [self handleGetLogs:params];
    } else if ([method isEqualToString:@"quit"]) {
        result = [self handleQuit];
    } else if ([method isEqualToString:@"restart"]) {
        result = [self handleRestart];
    } else if ([method isEqualToString:@"getVersion"]) {
        result = [self handleGetVersion];
    } else {
        result = @{@"error": [NSString stringWithFormat:@"Unknown method: %@", method]};
    }

    NSData *jsonData = [NSJSONSerialization dataWithJSONObject:result options:0 error:nil];
    return [[NSString alloc] initWithData:jsonData encoding:NSUTF8StringEncoding];
}

#pragma mark - Method Handlers

- (NSString *)handleMenu {
    NSDictionary *menu = @{
        @"service": @"ScreenControl Test Server",
        @"description": @"HTTP API for automated testing of ScreenControl agent (DEBUG builds only)",
        @"version": [[NSBundle mainBundle] objectForInfoDictionaryKey:@"CFBundleShortVersionString"] ?: @"1.0.0",
        @"port": @(self.port),
        @"usage": @"Send POST requests with JSON body: {\"method\": \"<method_name>\", \"params\": {...}}",
        @"availableCommands": @[
            @{
                @"method": @"ping",
                @"description": @"Health check - returns server status",
                @"params": @{},
                @"example": @{@"method": @"ping"}
            },
            @{
                @"method": @"getState",
                @"description": @"Get current connection state and status",
                @"params": @{},
                @"example": @{@"method": @"getState"}
            },
            @{
                @"method": @"getFields",
                @"description": @"Get all UI field values",
                @"params": @{},
                @"example": @{@"method": @"getFields"}
            },
            @{
                @"method": @"setField",
                @"description": @"Set a UI field value",
                @"params": @{@"field": @"<field_name>", @"value": @"<value>"},
                @"example": @{@"method": @"setField", @"params": @{@"field": @"serverUrl", @"value": @"ws://localhost:3000"}}
            },
            @{
                @"method": @"clickButton",
                @"description": @"Click a UI button",
                @"params": @{@"button": @"<button_name>"},
                @"availableButtons": @[
                    @"connect", @"disconnect", @"saveSettings", @"reconnect",
                    @"discoverAndJoin", @"startBrowserBridge", @"stopBrowserBridge"
                ],
                @"example": @{@"method": @"clickButton", @"params": @{@"button": @"startBrowserBridge"}}
            },
            @{
                @"method": @"getLogs",
                @"description": @"Get recent debug logs",
                @"params": @{@"lines": @"<number_of_lines>"},
                @"example": @{@"method": @"getLogs", @"params": @{@"lines": @50}}
            },
            @{
                @"method": @"getVersion",
                @"description": @"Get application version information",
                @"params": @{},
                @"example": @{@"method": @"getVersion"}
            },
            @{
                @"method": @"restart",
                @"description": @"Restart the application",
                @"params": @{},
                @"example": @{@"method": @"restart"}
            },
            @{
                @"method": @"quit",
                @"description": @"Quit the application",
                @"params": @{},
                @"example": @{@"method": @"quit"}
            }
        ]
    };

    NSData *jsonData = [NSJSONSerialization dataWithJSONObject:menu options:NSJSONWritingPrettyPrinted error:nil];
    return [[NSString alloc] initWithData:jsonData encoding:NSUTF8StringEncoding];
}

- (NSDictionary *)handlePing {
    NSString *version = [[NSBundle mainBundle] objectForInfoDictionaryKey:@"CFBundleShortVersionString"] ?: @"1.0.0";
    return @{
        @"pong": @YES,
        @"version": version,
        @"debug": @YES,
        @"port": @(self.port)
    };
}

- (NSDictionary *)handleGetState {
    __block NSDictionary *state;

    dispatch_sync(dispatch_get_main_queue(), ^{
        AppDelegate *app = self.appDelegate;
        state = @{
            @"connected": @(app.debugIsConnected),
            @"serverUrl": app.debugServerUrlField.stringValue ?: @"",
            @"endpointUuid": app.debugEndpointUuidField.stringValue ?: @"",
            @"customerId": app.debugCustomerIdField.stringValue ?: @"",
            @"connectionStatus": app.debugConnectionStatusLabel.stringValue ?: @"Unknown",
            // NOTE: Auto-reconnect is now handled by the service
            @"autoReconnectEnabled": @(YES),
            @"reconnectAttempt": @(0),
            @"reconnectPending": @(NO)
        };
    });

    return state;
}

- (NSDictionary *)handleGetFields {
    __block NSDictionary *fields;

    dispatch_sync(dispatch_get_main_queue(), ^{
        AppDelegate *app = self.appDelegate;
        fields = @{
            @"serverUrl": app.debugServerUrlField.stringValue ?: @"",
            @"endpointUuid": app.debugEndpointUuidField.stringValue ?: @"",
            @"customerId": app.debugCustomerIdField.stringValue ?: @"",
            @"connectOnStartup": @(app.debugConnectOnStartupCheckbox.state == NSControlStateValueOn),
            @"mcpUrl": app.debugMcpUrlField.stringValue ?: @"",
            @"oauthStatus": app.debugOAuthStatusLabel.stringValue ?: @"",
            // Control Server (General tab) fields
            @"controlServerUrl": app.controlServerAddressField.stringValue ?: @"",
            @"controlServerStatus": app.connectionStatusLabel.stringValue ?: @""
        };
    });

    return fields;
}

- (NSDictionary *)handleSetField:(NSDictionary *)params {
    NSString *field = params[@"field"];
    NSString *value = params[@"value"];

    if (!field || !value) {
        return @{@"error": @"Missing field or value"};
    }

    __block BOOL success = NO;

    dispatch_sync(dispatch_get_main_queue(), ^{
        AppDelegate *app = self.appDelegate;

        if ([field isEqualToString:@"serverUrl"]) {
            app.debugServerUrlField.stringValue = value;
            success = YES;
        } else if ([field isEqualToString:@"endpointUuid"]) {
            app.debugEndpointUuidField.stringValue = value;
            success = YES;
        } else if ([field isEqualToString:@"customerId"]) {
            app.debugCustomerIdField.stringValue = value;
            success = YES;
        } else if ([field isEqualToString:@"connectOnStartup"]) {
            app.debugConnectOnStartupCheckbox.state = [value boolValue] ? NSControlStateValueOn : NSControlStateValueOff;
            success = YES;
        } else if ([field isEqualToString:@"mcpUrl"]) {
            app.debugMcpUrlField.stringValue = value;
            success = YES;
        } else if ([field isEqualToString:@"controlServerUrl"]) {
            app.controlServerAddressField.stringValue = value;
            success = YES;
        }
    });

    if (success) {
        return @{@"success": @YES, @"field": field, @"value": value};
    } else {
        return @{@"error": [NSString stringWithFormat:@"Unknown field: %@", field]};
    }
}

- (NSDictionary *)handleClickButton:(NSDictionary *)params {
    NSString *button = params[@"button"];

    if (!button) {
        return @{@"error": @"Missing button parameter"};
    }

    __block BOOL success = NO;
    __block NSString *action = @"";

    dispatch_sync(dispatch_get_main_queue(), ^{
        AppDelegate *app = self.appDelegate;

        if ([button isEqualToString:@"connect"]) {
            if (app.debugConnectButton.enabled) {
                [app debugConnectClicked:nil];
                action = @"connect";
                success = YES;
            }
        } else if ([button isEqualToString:@"disconnect"]) {
            if (app.debugDisconnectButton.enabled) {
                [app debugDisconnectClicked:nil];
                action = @"disconnect";
                success = YES;
            }
        } else if ([button isEqualToString:@"reconnect"]) {
            // Force reconnect - always available
            [app debugReconnectClicked:nil];
            action = @"reconnect";
            success = YES;
        } else if ([button isEqualToString:@"saveSettings"]) {
            [app debugSaveSettingsClicked:nil];
            action = @"saveSettings";
            success = YES;
        } else if ([button isEqualToString:@"discoverAndJoin"]) {
            // Trigger OAuth discovery and join
            [app discoverAndJoinClicked:nil];
            action = @"discoverAndJoin";
            success = YES;
        } else if ([button isEqualToString:@"controlServerConnect"]) {
            // Connect to control server (General tab)
            if (app.connectButton.enabled) {
                [app connectControlServer:nil];
                action = @"controlServerConnect";
                success = YES;
            }
        } else if ([button isEqualToString:@"startBrowserBridge"]) {
            // Start browser bridge server
            [app startBrowserBridge];
            action = @"startBrowserBridge";
            success = YES;
        } else if ([button isEqualToString:@"stopBrowserBridge"]) {
            // Stop browser bridge server
            [app stopBrowserBridge];
            action = @"stopBrowserBridge";
            success = YES;
        }
    });

    if (success) {
        return @{@"success": @YES, @"action": action};
    } else {
        return @{@"error": [NSString stringWithFormat:@"Unknown or disabled button: %@", button]};
    }
}

- (NSDictionary *)handleGetLogs:(NSDictionary *)params {
    NSInteger limit = [params[@"limit"] integerValue] ?: 50;

    __block NSString *logs = @"";

    dispatch_sync(dispatch_get_main_queue(), ^{
        AppDelegate *app = self.appDelegate;
        logs = app.debugLogTextView.string ?: @"";
    });

    // Get last N lines
    NSArray *lines = [logs componentsSeparatedByString:@"\n"];
    NSInteger start = MAX(0, (NSInteger)lines.count - limit);
    NSArray *recentLines = [lines subarrayWithRange:NSMakeRange(start, lines.count - start)];

    return @{
        @"logs": recentLines,
        @"total": @(lines.count),
        @"returned": @(recentLines.count)
    };
}

- (NSDictionary *)handleQuit {
    NSLog(@"[TestServer] Quit requested via test server");

    dispatch_async(dispatch_get_main_queue(), ^{
        [[NSApplication sharedApplication] terminate:nil];
    });

    return @{@"success": @YES, @"action": @"quit"};
}

- (NSDictionary *)handleRestart {
    NSLog(@"[TestServer] Restart requested via test server");

    // Get path to this app
    NSString *appPath = [[NSBundle mainBundle] bundlePath];

    dispatch_async(dispatch_get_main_queue(), ^{
        // Launch new instance after a short delay
        dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)(0.5 * NSEC_PER_SEC)), dispatch_get_main_queue(), ^{
            [[NSWorkspace sharedWorkspace] openApplicationAtURL:[NSURL fileURLWithPath:appPath]
                                                  configuration:[NSWorkspaceOpenConfiguration configuration]
                                              completionHandler:nil];
        });

        // Terminate current instance
        [[NSApplication sharedApplication] terminate:nil];
    });

    return @{@"success": @YES, @"action": @"restart"};
}

- (NSDictionary *)handleGetVersion {
    NSBundle *bundle = [NSBundle mainBundle];

    // Get version info from bundle
    NSString *version = [bundle objectForInfoDictionaryKey:@"CFBundleShortVersionString"] ?: @"1.0.0";
    NSString *buildNumber = [bundle objectForInfoDictionaryKey:@"CFBundleVersion"] ?: @"1";

    // Get build date from executable modification date
    NSString *executablePath = [bundle executablePath];
    NSDictionary *attrs = [[NSFileManager defaultManager] attributesOfItemAtPath:executablePath error:nil];
    NSDate *buildDate = attrs[NSFileModificationDate] ?: [NSDate date];
    NSDateFormatter *formatter = [[NSDateFormatter alloc] init];
    formatter.dateFormat = @"yyyy-MM-dd";
    NSString *buildDateString = [formatter stringFromDate:buildDate];

    // Get architecture
    NSString *arch = @"unknown";
#if defined(__arm64__)
    arch = @"arm64";
#elif defined(__x86_64__)
    arch = @"x86_64";
#endif

    // Git commit would need to be embedded at build time via a build script
    // For now, check if we have it in Info.plist
    NSString *gitCommit = [bundle objectForInfoDictionaryKey:@"GitCommit"] ?: @"unknown";

    // Get app startup time (uptime)
    static NSDate *startTime = nil;
    static dispatch_once_t onceToken;
    dispatch_once(&onceToken, ^{
        startTime = [NSDate date];
    });
    NSTimeInterval uptime = [[NSDate date] timeIntervalSinceDate:startTime];

    return @{
        @"version": version,
        @"build": buildNumber,
        @"buildDate": buildDateString,
        @"gitCommit": gitCommit,
        @"platform": @"macos",
        @"arch": arch,
        @"uptime": @((NSInteger)uptime)
    };
}

@end

#endif // DEBUG
