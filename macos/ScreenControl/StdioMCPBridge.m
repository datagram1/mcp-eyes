/**
 * StdioMCPBridge - MCP Server over stdio with WebSocket backend
 *
 * Provides MCP protocol over stdin/stdout, connecting to the remote
 * ScreenControl server via WebSocket. This allows Claude Code to use
 * the same tools as Claude Desktop without a separate .js proxy.
 */

#import "StdioMCPBridge.h"
#import <Foundation/Foundation.h>

static NSString *const kDefaultServerUrl = @"wss://screencontrol.knws.co.uk/ws";
static NSString *const kMCPVersion = @"2024-11-05";
static NSString *const kServerName = @"screencontrol";
static NSString *const kServerVersion = @"1.0.0";

@interface StdioMCPBridge () <NSURLSessionWebSocketDelegate>
@property (nonatomic, strong) NSURLSession *urlSession;
@property (nonatomic, strong) NSURLSessionWebSocketTask *webSocketTask;
@property (nonatomic, strong) NSFileHandle *stdinHandle;
@property (nonatomic, strong) NSFileHandle *stdoutHandle;
@property (nonatomic, strong) dispatch_queue_t workQueue;
@property (nonatomic, assign) BOOL isConnected;
@property (nonatomic, assign) BOOL isRunning;
@property (nonatomic, strong) NSMutableDictionary *pendingRequests;
@property (nonatomic, strong) NSMutableData *stdinBuffer;
@property (nonatomic, strong) NSArray *cachedTools;
@property (nonatomic, strong) NSString *machineId;
@property (nonatomic, strong) NSString *agentSecret;
@end

@implementation StdioMCPBridge

- (instancetype)init {
    self = [super init];
    if (self) {
        _workQueue = dispatch_queue_create("com.screencontrol.stdio-bridge", DISPATCH_QUEUE_SERIAL);
        _pendingRequests = [NSMutableDictionary dictionary];
        _stdinBuffer = [NSMutableData data];
        _isRunning = NO;
        _isConnected = NO;
        _machineId = [self generateMachineId];
        _agentSecret = [self loadAgentSecret];
    }
    return self;
}

- (NSString *)generateMachineId {
    // Generate a unique machine ID for this MCP client
    io_registry_entry_t ioRegistryRoot = IORegistryEntryFromPath(kIOMainPortDefault, "IOService:/");
    CFStringRef uuidCf = (CFStringRef)IORegistryEntryCreateCFProperty(ioRegistryRoot, CFSTR(kIOPlatformUUIDKey), kCFAllocatorDefault, 0);
    IOObjectRelease(ioRegistryRoot);
    NSString *uuid = (__bridge_transfer NSString *)uuidCf;
    return [NSString stringWithFormat:@"mcp-stdio-%@", uuid ?: [[NSUUID UUID] UUIDString]];
}

- (NSString *)loadAgentSecret {
    // Try to load agent secret from token file
    NSString *tokenPath = [NSHomeDirectory() stringByAppendingPathComponent:@".screencontrol-token"];
    NSData *data = [NSData dataWithContentsOfFile:tokenPath];
    if (data) {
        NSError *error;
        NSDictionary *config = [NSJSONSerialization JSONObjectWithData:data options:0 error:&error];
        if (config[@"apiKey"]) {
            return config[@"apiKey"];
        }
    }
    return nil;
}

- (void)start {
    self.isRunning = YES;

    // Set up stdin/stdout
    self.stdinHandle = [NSFileHandle fileHandleWithStandardInput];
    self.stdoutHandle = [NSFileHandle fileHandleWithStandardOutput];

    // Connect to WebSocket server
    [self connectToServer];

    // Start reading from stdin
    [self startReadingStdin];

    // Run the main run loop
    [[NSRunLoop mainRunLoop] run];
}

- (void)stop {
    self.isRunning = NO;

    if (self.webSocketTask) {
        [self.webSocketTask cancelWithCloseCode:NSURLSessionWebSocketCloseCodeNormalClosure reason:nil];
    }
    if (self.urlSession) {
        [self.urlSession invalidateAndCancel];
    }
}

#pragma mark - WebSocket Connection

- (void)connectToServer {
    NSURLSessionConfiguration *config = [NSURLSessionConfiguration defaultSessionConfiguration];
    config.timeoutIntervalForRequest = 60.0;
    config.timeoutIntervalForResource = 3600.0;
    config.waitsForConnectivity = YES;

    self.urlSession = [NSURLSession sessionWithConfiguration:config
                                                    delegate:self
                                               delegateQueue:nil];

    NSURL *url = [NSURL URLWithString:kDefaultServerUrl];
    self.webSocketTask = [self.urlSession webSocketTaskWithURL:url];

    [self receiveWebSocketMessage];
    [self.webSocketTask resume];

    // Send registration after brief delay
    dispatch_after(dispatch_time(DISPATCH_TIME_NOW, 500 * NSEC_PER_MSEC), self.workQueue, ^{
        [self sendRegistration];
    });
}

- (void)sendRegistration {
    NSString *hostname = [[NSHost currentHost] localizedName];

    NSMutableDictionary *message = [NSMutableDictionary dictionary];
    message[@"type"] = @"register";
    message[@"machineId"] = self.machineId;
    message[@"machineName"] = [NSString stringWithFormat:@"%@ (MCP)", hostname];
    message[@"osType"] = @"darwin";
    message[@"osVersion"] = [[NSProcessInfo processInfo] operatingSystemVersionString];
    message[@"arch"] = @"arm64";
    message[@"agentVersion"] = @"1.0.0-mcp-stdio";
    message[@"clientType"] = @"mcp-stdio"; // Identify as MCP stdio client

    if (self.agentSecret) {
        message[@"agentSecret"] = self.agentSecret;
    }

    message[@"fingerprint"] = @{
        @"hostname": hostname,
        @"cpuModel": @"Apple Silicon",
        @"macAddresses": @[@"mcp-stdio-client"]
    };

    [self sendWebSocketMessage:message];
}

- (void)sendWebSocketMessage:(NSDictionary *)message {
    NSError *error;
    NSData *jsonData = [NSJSONSerialization dataWithJSONObject:message options:0 error:&error];
    if (error) {
        [self logError:[NSString stringWithFormat:@"Failed to serialize message: %@", error]];
        return;
    }

    NSString *jsonString = [[NSString alloc] initWithData:jsonData encoding:NSUTF8StringEncoding];
    NSURLSessionWebSocketMessage *wsMessage = [[NSURLSessionWebSocketMessage alloc] initWithString:jsonString];

    [self.webSocketTask sendMessage:wsMessage completionHandler:^(NSError *error) {
        if (error) {
            [self logError:[NSString stringWithFormat:@"WebSocket send error: %@", error]];
        }
    }];
}

- (void)receiveWebSocketMessage {
    if (!self.webSocketTask || !self.isRunning) return;

    __weak typeof(self) weakSelf = self;
    [self.webSocketTask receiveMessageWithCompletionHandler:^(NSURLSessionWebSocketMessage *message, NSError *error) {
        if (error) {
            [weakSelf logError:[NSString stringWithFormat:@"WebSocket receive error: %@", error]];
            return;
        }

        if (message.type == NSURLSessionWebSocketMessageTypeString) {
            [weakSelf handleWebSocketMessage:message.string];
        }

        // Continue receiving
        [weakSelf receiveWebSocketMessage];
    }];
}

- (void)handleWebSocketMessage:(NSString *)messageString {
    NSData *data = [messageString dataUsingEncoding:NSUTF8StringEncoding];
    NSError *error;
    NSDictionary *message = [NSJSONSerialization JSONObjectWithData:data options:0 error:&error];

    if (error || !message) {
        [self logError:[NSString stringWithFormat:@"Failed to parse WebSocket message: %@", error]];
        return;
    }

    NSString *type = message[@"type"];

    if ([type isEqualToString:@"registered"]) {
        self.isConnected = YES;
        [self logError:@"Connected to ScreenControl server"];

    } else if ([type isEqualToString:@"response"]) {
        // Handle response to a pending request
        NSString *requestId = message[@"id"];
        if (requestId) {
            void (^completion)(NSDictionary *) = self.pendingRequests[requestId];
            if (completion) {
                completion(message[@"result"]);
                [self.pendingRequests removeObjectForKey:requestId];
            }
        }

    } else if ([type isEqualToString:@"tools_changed"]) {
        // Clear cached tools when they change
        self.cachedTools = nil;

    } else if ([type isEqualToString:@"heartbeat_ack"]) {
        // Ignore heartbeat acks

    } else if ([type isEqualToString:@"ping"]) {
        // Respond to server pings if needed
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
            @"tools": @{}
        },
        @"serverInfo": @{
            @"name": kServerName,
            @"version": kServerVersion
        }
    };

    [self sendMCPResult:result id:requestId];
}

- (void)handleToolsList:(NSDictionary *)params id:(id)requestId {
    // Request tools from server via WebSocket
    NSString *wsRequestId = [[NSUUID UUID] UUIDString];

    NSDictionary *wsRequest = @{
        @"type": @"request",
        @"method": @"tools/list",
        @"id": wsRequestId,
        @"params": @{}
    };

    __weak typeof(self) weakSelf = self;
    self.pendingRequests[wsRequestId] = ^(NSDictionary *result) {
        NSArray *tools = result[@"tools"] ?: @[];
        weakSelf.cachedTools = tools;

        NSDictionary *response = @{@"tools": tools};
        [weakSelf sendMCPResult:response id:requestId];
    };

    [self sendWebSocketMessage:wsRequest];

    // Timeout after 30 seconds
    dispatch_after(dispatch_time(DISPATCH_TIME_NOW, 30 * NSEC_PER_SEC), self.workQueue, ^{
        if (weakSelf.pendingRequests[wsRequestId]) {
            [weakSelf.pendingRequests removeObjectForKey:wsRequestId];
            [weakSelf sendMCPError:@"Timeout waiting for tools list" code:-32000 id:requestId];
        }
    });
}

- (void)handleToolsCall:(NSDictionary *)params id:(id)requestId {
    NSString *toolName = params[@"name"];
    NSDictionary *arguments = params[@"arguments"] ?: @{};

    if (!toolName) {
        [self sendMCPError:@"Missing tool name" code:-32602 id:requestId];
        return;
    }

    // Forward to server via WebSocket
    NSString *wsRequestId = [[NSUUID UUID] UUIDString];

    NSDictionary *wsRequest = @{
        @"type": @"request",
        @"method": @"tools/call",
        @"id": wsRequestId,
        @"params": @{
            @"name": toolName,
            @"arguments": arguments
        }
    };

    __weak typeof(self) weakSelf = self;
    self.pendingRequests[wsRequestId] = ^(NSDictionary *result) {
        if (result[@"error"]) {
            [weakSelf sendMCPError:result[@"error"] code:-32000 id:requestId];
        } else {
            // Format result as MCP tool result
            NSArray *content;
            if ([result isKindOfClass:[NSDictionary class]]) {
                NSData *jsonData = [NSJSONSerialization dataWithJSONObject:result options:NSJSONWritingPrettyPrinted error:nil];
                NSString *jsonString = [[NSString alloc] initWithData:jsonData encoding:NSUTF8StringEncoding];
                content = @[@{@"type": @"text", @"text": jsonString ?: @"{}"}];
            } else {
                content = @[@{@"type": @"text", @"text": [NSString stringWithFormat:@"%@", result]}];
            }

            NSDictionary *response = @{@"content": content};
            [weakSelf sendMCPResult:response id:requestId];
        }
    };

    [self sendWebSocketMessage:wsRequest];

    // Timeout after 120 seconds (tools can take time)
    dispatch_after(dispatch_time(DISPATCH_TIME_NOW, 120 * NSEC_PER_SEC), self.workQueue, ^{
        if (weakSelf.pendingRequests[wsRequestId]) {
            [weakSelf.pendingRequests removeObjectForKey:wsRequestId];
            [weakSelf sendMCPError:@"Timeout waiting for tool response" code:-32000 id:requestId];
        }
    });
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

#pragma mark - Logging

- (void)logError:(NSString *)message {
    // Write to stderr for debugging
    NSFileHandle *stderr = [NSFileHandle fileHandleWithStandardError];
    NSString *logMessage = [NSString stringWithFormat:@"[StdioMCPBridge] %@\n", message];
    [stderr writeData:[logMessage dataUsingEncoding:NSUTF8StringEncoding]];
}

#pragma mark - NSURLSessionWebSocketDelegate

- (void)URLSession:(NSURLSession *)session webSocketTask:(NSURLSessionWebSocketTask *)webSocketTask didOpenWithProtocol:(NSString *)protocol {
    [self logError:@"WebSocket connected"];
}

- (void)URLSession:(NSURLSession *)session webSocketTask:(NSURLSessionWebSocketTask *)webSocketTask didCloseWithCode:(NSURLSessionWebSocketCloseCode)closeCode reason:(NSData *)reason {
    [self logError:[NSString stringWithFormat:@"WebSocket closed with code %ld", (long)closeCode]];
    self.isConnected = NO;

    // Attempt reconnect if still running
    if (self.isRunning) {
        dispatch_after(dispatch_time(DISPATCH_TIME_NOW, 5 * NSEC_PER_SEC), self.workQueue, ^{
            [self connectToServer];
        });
    }
}

@end
