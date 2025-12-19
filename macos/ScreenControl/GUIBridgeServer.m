/**
 * GUIBridgeServer Implementation
 *
 * HTTP server using GCDAsyncSocket for receiving GUI commands from the service.
 * Implements a simple HTTP/1.1 server that handles POST /tool requests.
 */

#import "GUIBridgeServer.h"
#import <sys/socket.h>
#import <netinet/in.h>
#import <netinet/tcp.h>
#import <arpa/inet.h>

@interface GUIBridgeServer ()
@property (nonatomic, strong) dispatch_source_t listenSource;
@property (nonatomic, assign) int listenSocket;
@property (nonatomic, assign) BOOL running;
@property (nonatomic, strong) dispatch_queue_t serverQueue;
@end

@implementation GUIBridgeServer

+ (instancetype)sharedInstance {
    static GUIBridgeServer *instance = nil;
    static dispatch_once_t onceToken;
    dispatch_once(&onceToken, ^{
        instance = [[GUIBridgeServer alloc] initWithPort:3460];  // GUI_BRIDGE_PORT
    });
    return instance;
}

- (instancetype)initWithPort:(int)port {
    self = [super init];
    if (self) {
        _port = port;
        _running = NO;
        _listenSocket = -1;
        _serverQueue = dispatch_queue_create("com.screencontrol.guibridge", DISPATCH_QUEUE_CONCURRENT);
    }
    return self;
}

- (BOOL)isRunning {
    return _running;
}

- (void)log:(NSString *)message {
    NSLog(@"[GUIBridge] %@", message);
    if ([self.delegate respondsToSelector:@selector(guiBridgeServer:logMessage:)]) {
        dispatch_async(dispatch_get_main_queue(), ^{
            [self.delegate guiBridgeServer:self logMessage:message];
        });
    }
}

- (BOOL)start {
    if (self.running) {
        [self log:@"Server already running"];
        return YES;
    }

    // Create socket
    self.listenSocket = socket(AF_INET, SOCK_STREAM, 0);
    if (self.listenSocket < 0) {
        [self log:@"Failed to create socket"];
        return NO;
    }

    // Set socket options
    int yes = 1;
    setsockopt(self.listenSocket, SOL_SOCKET, SO_REUSEADDR, &yes, sizeof(yes));

    // Bind to port
    struct sockaddr_in addr;
    memset(&addr, 0, sizeof(addr));
    addr.sin_family = AF_INET;
    addr.sin_port = htons(self.port);
    addr.sin_addr.s_addr = htonl(INADDR_LOOPBACK);  // Only listen on localhost

    if (bind(self.listenSocket, (struct sockaddr *)&addr, sizeof(addr)) < 0) {
        [self log:[NSString stringWithFormat:@"Failed to bind to port %d", self.port]];
        close(self.listenSocket);
        self.listenSocket = -1;
        return NO;
    }

    // Listen
    if (listen(self.listenSocket, 10) < 0) {
        [self log:@"Failed to listen on socket"];
        close(self.listenSocket);
        self.listenSocket = -1;
        return NO;
    }

    // Set non-blocking
    int flags = fcntl(self.listenSocket, F_GETFL, 0);
    fcntl(self.listenSocket, F_SETFL, flags | O_NONBLOCK);

    // Create dispatch source for accepting connections
    self.listenSource = dispatch_source_create(DISPATCH_SOURCE_TYPE_READ, self.listenSocket, 0, self.serverQueue);

    __weak typeof(self) weakSelf = self;
    dispatch_source_set_event_handler(self.listenSource, ^{
        [weakSelf acceptConnection];
    });

    dispatch_source_set_cancel_handler(self.listenSource, ^{
        if (weakSelf.listenSocket >= 0) {
            close(weakSelf.listenSocket);
            weakSelf.listenSocket = -1;
        }
    });

    dispatch_resume(self.listenSource);
    self.running = YES;

    [self log:[NSString stringWithFormat:@"Started on port %d", self.port]];

    if ([self.delegate respondsToSelector:@selector(guiBridgeServerDidStart:)]) {
        dispatch_async(dispatch_get_main_queue(), ^{
            [self.delegate guiBridgeServerDidStart:self];
        });
    }

    return YES;
}

- (void)stop {
    if (!self.running) return;

    self.running = NO;

    if (self.listenSource) {
        dispatch_source_cancel(self.listenSource);
        self.listenSource = nil;
    }

    [self log:@"Stopped"];

    if ([self.delegate respondsToSelector:@selector(guiBridgeServerDidStop:)]) {
        dispatch_async(dispatch_get_main_queue(), ^{
            [self.delegate guiBridgeServerDidStop:self];
        });
    }
}

- (void)acceptConnection {
    struct sockaddr_in clientAddr;
    socklen_t clientLen = sizeof(clientAddr);
    int clientSocket = accept(self.listenSocket, (struct sockaddr *)&clientAddr, &clientLen);

    if (clientSocket < 0) return;

    // Handle request in background
    dispatch_async(self.serverQueue, ^{
        [self handleClientSocket:clientSocket];
    });
}

- (void)handleClientSocket:(int)clientSocket {
    // Set client socket to blocking mode (inherited non-blocking from listen socket)
    int flags = fcntl(clientSocket, F_GETFL, 0);
    fcntl(clientSocket, F_SETFL, flags & ~O_NONBLOCK);

    // Set TCP_NODELAY on client socket
    int nodelay = 1;
    setsockopt(clientSocket, IPPROTO_TCP, TCP_NODELAY, &nodelay, sizeof(nodelay));

    // Set socket timeout for reads (5 seconds)
    struct timeval tv;
    tv.tv_sec = 5;
    tv.tv_usec = 0;
    setsockopt(clientSocket, SOL_SOCKET, SO_RCVTIMEO, &tv, sizeof(tv));

    // Read HTTP request - accumulate data until we have complete request
    NSMutableData *requestData = [NSMutableData data];
    char buffer[8192];
    NSInteger contentLength = -1;
    NSInteger headerEndOffset = -1;

    // Keep reading until we have headers and full body
    while (YES) {
        ssize_t bytesRead = recv(clientSocket, buffer, sizeof(buffer), 0);

        if (bytesRead <= 0) {
            if (requestData.length == 0) {
                close(clientSocket);
                return;
            }
            // Timeout or connection closed - process what we have
            break;
        }

        [requestData appendBytes:buffer length:bytesRead];

        // Check if we have the complete headers
        if (headerEndOffset < 0) {
            NSString *partialRequest = [[NSString alloc] initWithData:requestData encoding:NSUTF8StringEncoding];
            if (partialRequest) {
                NSRange emptyLineRange = [partialRequest rangeOfString:@"\r\n\r\n"];
                if (emptyLineRange.location != NSNotFound) {
                    headerEndOffset = emptyLineRange.location + 4;

                    // Parse Content-Length from headers
                    NSString *headers = [partialRequest substringToIndex:emptyLineRange.location];
                    NSArray *lines = [headers componentsSeparatedByString:@"\r\n"];
                    for (NSString *line in lines) {
                        if ([line.lowercaseString hasPrefix:@"content-length:"]) {
                            NSString *value = [line substringFromIndex:15];
                            contentLength = [value stringByTrimmingCharactersInSet:[NSCharacterSet whitespaceCharacterSet]].integerValue;
                            break;
                        }
                    }
                    if (contentLength < 0) contentLength = 0;
                }
            }
        }

        // Check if we have the complete body
        if (headerEndOffset >= 0) {
            NSInteger bodyLength = requestData.length - headerEndOffset;
            if (bodyLength >= contentLength) {
                break;  // We have the complete request
            }
        }

        // Safety limit - don't read more than 1MB
        if (requestData.length > 1024 * 1024) {
            [self sendErrorResponse:clientSocket statusCode:413 message:@"Request Too Large"];
            return;
        }
    }

    NSString *request = [[NSString alloc] initWithData:requestData encoding:NSUTF8StringEncoding];
    if (!request) {
        [self sendErrorResponse:clientSocket statusCode:400 message:@"Invalid Request Encoding"];
        return;
    }

    // Parse HTTP request
    NSArray *lines = [request componentsSeparatedByString:@"\r\n"];
    if (lines.count < 1) {
        [self sendErrorResponse:clientSocket statusCode:400 message:@"Bad Request"];
        return;
    }

    // Parse request line
    NSArray *requestLineParts = [lines[0] componentsSeparatedByString:@" "];
    if (requestLineParts.count < 2) {
        [self sendErrorResponse:clientSocket statusCode:400 message:@"Bad Request"];
        return;
    }

    NSString *method = requestLineParts[0];
    NSString *path = requestLineParts[1];

    // Find body (after empty line)
    NSString *body = @"";
    NSRange emptyLineRange = [request rangeOfString:@"\r\n\r\n"];
    if (emptyLineRange.location != NSNotFound) {
        body = [request substringFromIndex:emptyLineRange.location + 4];
    }

    // Route request
    NSDictionary *response = nil;
    int statusCode = 200;

    if ([path isEqualToString:@"/health"]) {
        response = @{@"status": @"ok", @"server": @"GUIBridgeServer"};
    }
    else if ([path isEqualToString:@"/tool"] && [method isEqualToString:@"POST"]) {
        response = [self handleToolRequest:body];
        if (response[@"error"]) {
            statusCode = 400;
        }
    }
    else if ([path isEqualToString:@"/info"]) {
        response = [self getServerInfo];
    }
    else {
        statusCode = 404;
        response = @{@"error": @"Not Found"};
    }

    // Send response
    [self sendJSONResponse:clientSocket statusCode:statusCode data:response];
}

- (NSDictionary *)handleToolRequest:(NSString *)body {
    // Parse JSON body
    NSError *error = nil;
    NSData *bodyData = [body dataUsingEncoding:NSUTF8StringEncoding];
    if (!bodyData) {
        return @{@"error": @"Invalid request body"};
    }

    NSDictionary *json = [NSJSONSerialization JSONObjectWithData:bodyData options:0 error:&error];
    if (error || !json) {
        return @{@"error": @"Invalid JSON"};
    }

    NSString *toolMethod = json[@"method"];
    NSDictionary *params = json[@"params"] ?: @{};

    if (!toolMethod) {
        return @{@"error": @"Missing method"};
    }

    [self log:[NSString stringWithFormat:@"Tool request: %@", toolMethod]];

    // Forward to delegate for execution
    if ([self.delegate respondsToSelector:@selector(guiBridgeServer:executeToolWithName:arguments:)]) {
        // Execute on main thread for GUI operations
        __block NSDictionary *result = nil;
        dispatch_sync(dispatch_get_main_queue(), ^{
            result = [self.delegate guiBridgeServer:self executeToolWithName:toolMethod arguments:params];
        });
        return result ?: @{@"error": @"Tool execution failed"};
    }

    return @{@"error": @"No delegate configured"};
}

- (void)sendJSONResponse:(int)socket statusCode:(int)statusCode data:(NSDictionary *)data {
    NSError *error = nil;
    NSData *jsonData = [NSJSONSerialization dataWithJSONObject:data options:0 error:&error];
    if (error) {
        [self sendErrorResponse:socket statusCode:500 message:@"Internal Server Error"];
        return;
    }

    NSString *statusText = (statusCode == 200) ? @"OK" : (statusCode == 400) ? @"Bad Request" : @"Error";
    NSString *headers = [NSString stringWithFormat:
        @"HTTP/1.1 %d %@\r\n"
        @"Content-Type: application/json\r\n"
        @"Content-Length: %lu\r\n"
        @"Connection: close\r\n"
        @"\r\n",
        statusCode, statusText, (unsigned long)jsonData.length];

    NSMutableData *response = [NSMutableData dataWithData:[headers dataUsingEncoding:NSUTF8StringEncoding]];
    [response appendData:jsonData];

    send(socket, response.bytes, response.length, 0);
    close(socket);
}

- (void)sendErrorResponse:(int)socket statusCode:(int)statusCode message:(NSString *)message {
    [self sendJSONResponse:socket statusCode:statusCode data:@{@"error": message}];
}

- (NSDictionary *)getServerInfo {
    return @{
        @"server": @"GUIBridgeServer",
        @"port": @(self.port),
        @"running": @(self.running),
        @"version": @"1.0.0"
    };
}

@end
