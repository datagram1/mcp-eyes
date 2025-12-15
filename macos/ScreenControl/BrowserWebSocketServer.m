/**
 * Browser WebSocket Server Implementation
 * Native WebSocket server for browser extension connections
 * Replaces the problematic Node.js browser-bridge-server
 *
 * Protocol: RFC 6455 WebSocket Protocol
 * Port: 3457
 * Message Format: JSON {"type": "tool_call", "id": "uuid", "tool": "...", "params": {...}}
 */

#import "BrowserWebSocketServer.h"
#import <sys/socket.h>
#import <netinet/in.h>
#import <arpa/inet.h>
#import <CommonCrypto/CommonDigest.h>

// WebSocket protocol constants
static const NSString *WS_GUID = @"258EAFA5-E914-47DA-95CA-C5AB0DC85B11";
static const int WS_OPCODE_TEXT = 0x1;
static const int WS_OPCODE_CLOSE = 0x8;
static const int WS_OPCODE_PING = 0x9;
static const int WS_OPCODE_PONG = 0xA;

@interface BrowserConnection : NSObject
@property (nonatomic, assign) int socket;
@property (nonatomic, strong) NSString *browserId;
@property (nonatomic, assign) BOOL handshakeComplete;
@property (nonatomic, strong) NSMutableData *receiveBuffer;
@property (nonatomic, strong) dispatch_source_t readSource;
@end

@implementation BrowserConnection
- (instancetype)initWithSocket:(int)sock browserId:(NSString *)bid {
    self = [super init];
    if (self) {
        _socket = sock;
        _browserId = bid;
        _handshakeComplete = NO;
        _receiveBuffer = [NSMutableData data];
    }
    return self;
}

- (void)dealloc {
    if (_readSource) {
        dispatch_source_cancel(_readSource);
        _readSource = nil;
    }
    if (_socket >= 0) {
        close(_socket);
        _socket = -1;
    }
}
@end

@interface BrowserWebSocketServer ()
@property (nonatomic, assign) int serverSocket;
@property (nonatomic, assign) NSUInteger port;
@property (nonatomic, assign) BOOL isRunning;
@property (nonatomic, strong) dispatch_source_t acceptSource;
@property (nonatomic, strong) dispatch_queue_t socketQueue;
@property (nonatomic, strong) NSMutableDictionary<NSString *, BrowserConnection *> *connections;
@property (nonatomic, strong) NSMutableSet *connectedBrowsers;
@end

@implementation BrowserWebSocketServer

- (instancetype)initWithPort:(NSUInteger)port {
    self = [super init];
    if (self) {
        _port = port ?: 3457;
        _isRunning = NO;
        _serverSocket = -1;
        _connections = [NSMutableDictionary dictionary];
        _connectedBrowsers = [NSMutableSet set];
        _socketQueue = dispatch_queue_create("com.screencontrol.websocket", DISPATCH_QUEUE_CONCURRENT);
    }
    return self;
}

#pragma mark - Server Lifecycle

- (BOOL)start {
    if (self.isRunning) {
        NSLog(@"[WebSocketServer] Already running on port %lu", (unsigned long)self.port);
        return YES;
    }

    NSLog(@"[WebSocketServer] Starting on port %lu...", (unsigned long)self.port);

    // Create socket
    self.serverSocket = socket(AF_INET, SOCK_STREAM, 0);
    if (self.serverSocket < 0) {
        NSLog(@"[WebSocketServer] Failed to create socket: %s", strerror(errno));
        return NO;
    }

    // Set socket options
    int yes = 1;
    if (setsockopt(self.serverSocket, SOL_SOCKET, SO_REUSEADDR, &yes, sizeof(yes)) < 0) {
        NSLog(@"[WebSocketServer] Failed to set SO_REUSEADDR: %s", strerror(errno));
        close(self.serverSocket);
        self.serverSocket = -1;
        return NO;
    }

    // Bind to port
    struct sockaddr_in serverAddr;
    memset(&serverAddr, 0, sizeof(serverAddr));
    serverAddr.sin_family = AF_INET;
    serverAddr.sin_addr.s_addr = INADDR_ANY;
    serverAddr.sin_port = htons(self.port);

    if (bind(self.serverSocket, (struct sockaddr *)&serverAddr, sizeof(serverAddr)) < 0) {
        NSLog(@"[WebSocketServer] Failed to bind to port %lu: %s", (unsigned long)self.port, strerror(errno));
        close(self.serverSocket);
        self.serverSocket = -1;
        return NO;
    }

    // Listen
    if (listen(self.serverSocket, 5) < 0) {
        NSLog(@"[WebSocketServer] Failed to listen: %s", strerror(errno));
        close(self.serverSocket);
        self.serverSocket = -1;
        return NO;
    }

    // Set up accept source
    self.acceptSource = dispatch_source_create(DISPATCH_SOURCE_TYPE_READ, self.serverSocket, 0, self.socketQueue);

    __weak typeof(self) weakSelf = self;
    dispatch_source_set_event_handler(self.acceptSource, ^{
        [weakSelf handleAccept];
    });

    dispatch_source_set_cancel_handler(self.acceptSource, ^{
        close(weakSelf.serverSocket);
        weakSelf.serverSocket = -1;
    });

    dispatch_resume(self.acceptSource);

    self.isRunning = YES;
    NSLog(@"[WebSocketServer] Server started successfully on port %lu", (unsigned long)self.port);

    // Notify delegate
    if ([self.delegate respondsToSelector:@selector(browserWebSocketServerDidStart:onPort:)]) {
        dispatch_async(dispatch_get_main_queue(), ^{
            [self.delegate browserWebSocketServerDidStart:self onPort:self.port];
        });
    }

    return YES;
}

- (void)stop {
    if (!self.isRunning) {
        return;
    }

    NSLog(@"[WebSocketServer] Stopping server...");

    self.isRunning = NO;

    // Close all connections
    @synchronized (self.connections) {
        for (BrowserConnection *connection in self.connections.allValues) {
            [self closeConnection:connection];
        }
        [self.connections removeAllObjects];
    }

    // Cancel accept source
    if (self.acceptSource) {
        dispatch_source_cancel(self.acceptSource);
        self.acceptSource = nil;
    }

    [self.connectedBrowsers removeAllObjects];

    // Notify delegate (no async - avoid issues with object deallocation)
    id<BrowserWebSocketServerDelegate> delegate = self.delegate;
    if ([delegate respondsToSelector:@selector(browserWebSocketServerDidStop:)]) {
        [delegate browserWebSocketServerDidStop:self];
    }

    NSLog(@"[WebSocketServer] Server stopped");
}

#pragma mark - Connection Handling

- (void)handleAccept {
    struct sockaddr_in clientAddr;
    socklen_t clientLen = sizeof(clientAddr);
    int clientSocket = accept(self.serverSocket, (struct sockaddr *)&clientAddr, &clientLen);

    if (clientSocket < 0) {
        NSLog(@"[WebSocketServer] Accept failed: %s", strerror(errno));
        return;
    }

    char clientIP[INET_ADDRSTRLEN];
    inet_ntop(AF_INET, &clientAddr.sin_addr, clientIP, sizeof(clientIP));
    NSLog(@"[WebSocketServer] New connection from %s:%d", clientIP, ntohs(clientAddr.sin_port));

    // Create connection object
    NSString *browserId = [NSString stringWithFormat:@"browser-%d", clientSocket];
    BrowserConnection *connection = [[BrowserConnection alloc] initWithSocket:clientSocket browserId:browserId];

    @synchronized (self.connections) {
        self.connections[browserId] = connection;
    }

    // Set up read source
    [self setupReadSourceForConnection:connection];
}

- (void)setupReadSourceForConnection:(BrowserConnection *)connection {
    connection.readSource = dispatch_source_create(DISPATCH_SOURCE_TYPE_READ, connection.socket, 0, self.socketQueue);

    __weak typeof(self) weakSelf = self;
    dispatch_source_set_event_handler(connection.readSource, ^{
        [weakSelf handleReadForConnection:connection];
    });

    dispatch_source_set_cancel_handler(connection.readSource, ^{
        close(connection.socket);
        connection.socket = -1;
    });

    dispatch_resume(connection.readSource);
}

- (void)handleReadForConnection:(BrowserConnection *)connection {
    char buffer[4096];
    ssize_t bytesRead = read(connection.socket, buffer, sizeof(buffer));

    if (bytesRead <= 0) {
        if (bytesRead < 0) {
            NSLog(@"[WebSocketServer] Read error for %@: %s", connection.browserId, strerror(errno));
        } else {
            NSLog(@"[WebSocketServer] Connection closed by %@", connection.browserId);
        }
        [self closeConnection:connection];
        return;
    }

    [connection.receiveBuffer appendBytes:buffer length:bytesRead];

    if (!connection.handshakeComplete) {
        [self processHandshakeForConnection:connection];
    } else {
        [self processWebSocketFramesForConnection:connection];
    }
}

#pragma mark - WebSocket Handshake

- (void)processHandshakeForConnection:(BrowserConnection *)connection {
    // Look for double CRLF indicating end of HTTP headers
    NSData *crlfcrlf = [@"\r\n\r\n" dataUsingEncoding:NSUTF8StringEncoding];
    NSRange range = [connection.receiveBuffer rangeOfData:crlfcrlf options:0 range:NSMakeRange(0, connection.receiveBuffer.length)];

    if (range.location == NSNotFound) {
        return; // Not complete yet
    }

    // Parse HTTP request
    NSData *requestData = [connection.receiveBuffer subdataWithRange:NSMakeRange(0, range.location)];
    NSString *requestString = [[NSString alloc] initWithData:requestData encoding:NSUTF8StringEncoding];

    NSLog(@"[WebSocketServer] HTTP request:\n%@", requestString);

    NSArray *lines = [requestString componentsSeparatedByString:@"\r\n"];
    NSString *requestLine = lines.firstObject;

    // Check if this is a WebSocket upgrade or HTTP POST
    NSString *webSocketKey = nil;
    NSString *contentLengthStr = nil;
    BOOL isWebSocketUpgrade = NO;

    for (NSString *line in lines) {
        if ([line hasPrefix:@"Sec-WebSocket-Key:"]) {
            webSocketKey = [[line substringFromIndex:18] stringByTrimmingCharactersInSet:[NSCharacterSet whitespaceCharacterSet]];
            isWebSocketUpgrade = YES;
        }
        if ([line hasPrefix:@"Content-Length:"]) {
            contentLengthStr = [[line substringFromIndex:15] stringByTrimmingCharactersInSet:[NSCharacterSet whitespaceCharacterSet]];
        }
    }

    // Handle HTTP POST to /command (browser tool calls from local agent)
    if ([requestLine hasPrefix:@"POST /command"]) {
        NSLog(@"[WebSocketServer] Processing HTTP POST to /command");

        // Parse Content-Length
        NSInteger contentLength = contentLengthStr ? [contentLengthStr integerValue] : 0;
        NSUInteger headersEndPos = range.location + crlfcrlf.length;

        // Check if we have the complete body
        if (connection.receiveBuffer.length < headersEndPos + contentLength) {
            NSLog(@"[WebSocketServer] Waiting for complete POST body (%lu/%ld bytes)",
                  (unsigned long)(connection.receiveBuffer.length - headersEndPos), (long)contentLength);
            return; // Wait for more data
        }

        // Extract body
        NSData *bodyData = [connection.receiveBuffer subdataWithRange:NSMakeRange(headersEndPos, contentLength)];
        NSString *bodyString = [[NSString alloc] initWithData:bodyData encoding:NSUTF8StringEncoding];
        NSLog(@"[WebSocketServer] POST body: %@", bodyString);

        // Parse JSON body
        NSError *error = nil;
        NSDictionary *request = [NSJSONSerialization JSONObjectWithData:bodyData options:0 error:&error];

        if (error || ![request isKindOfClass:[NSDictionary class]]) {
            NSLog(@"[WebSocketServer] Invalid JSON in POST body: %@", error);
            [self sendHTTPError:@"Invalid JSON" code:400 toConnection:connection];
            [self closeConnection:connection];
            return;
        }

        // Forward to the first connected browser via WebSocket
        BrowserConnection *browserConn = nil;
        @synchronized (self.connections) {
            for (BrowserConnection *conn in self.connections.allValues) {
                if (conn.handshakeComplete && conn != connection) {
                    browserConn = conn;
                    break;
                }
            }
        }

        if (!browserConn) {
            NSLog(@"[WebSocketServer] No browser connected to forward command");
            [self sendHTTPError:@"No browser connected" code:503 toConnection:connection];
            [self closeConnection:connection];
            return;
        }

        // Generate a request ID to track this HTTP request
        NSString *requestId = [[NSUUID UUID] UUIDString];

        // Store the HTTP connection for response
        NSString *httpConnId = [NSString stringWithFormat:@"http-%@", requestId];
        connection.browserId = httpConnId;

        @synchronized (self.connections) {
            self.connections[httpConnId] = connection;
        }

        // Transform message format for browser extension
        // Input: {"action": "getTabs", "params": {...}} or {"name": "browser_getTabs", "arguments": {...}}
        // Output: {"action": "getTabs", "id": "...", "payload": {...}}
        NSString *action = request[@"action"];
        NSDictionary *payload = request[@"params"] ?: request[@"payload"] ?: request[@"arguments"] ?: @{};

        // If no action, try to extract from "name" field (strip "browser_" prefix)
        if (!action) {
            NSString *name = request[@"name"];
            if ([name hasPrefix:@"browser_"]) {
                action = [name substringFromIndex:8];  // Remove "browser_" prefix
            } else {
                action = name;
            }
        }

        if (!action) {
            NSLog(@"[WebSocketServer] No action found in request");
            [self sendHTTPError:@"No action specified" code:400 toConnection:connection];
            [self closeConnection:connection];
            return;
        }

        // Build WebSocket message for browser extension
        NSDictionary *wsMessage = @{
            @"action": action,
            @"id": requestId,
            @"payload": payload
        };

        NSLog(@"[WebSocketServer] Forwarding to browser: %@", wsMessage);
        [self sendJSONMessage:wsMessage toConnection:browserConn];

        // Don't close connection yet - wait for response from browser
        // The browser will send back a message with _httpRequestId
        return;
    }

    // Handle WebSocket upgrade (browser extension connections)
    if (isWebSocketUpgrade && webSocketKey) {
        // Generate Sec-WebSocket-Accept
        NSString *acceptKey = [self generateWebSocketAcceptKey:webSocketKey];

        // Build handshake response
        NSString *response = [NSString stringWithFormat:
            @"HTTP/1.1 101 Switching Protocols\r\n"
            @"Upgrade: websocket\r\n"
            @"Connection: Upgrade\r\n"
            @"Sec-WebSocket-Accept: %@\r\n"
            @"\r\n", acceptKey];

        NSData *responseData = [response dataUsingEncoding:NSUTF8StringEncoding];
        ssize_t bytesSent = write(connection.socket, responseData.bytes, responseData.length);

        if (bytesSent != responseData.length) {
            NSLog(@"[WebSocketServer] Failed to send handshake response");
            [self closeConnection:connection];
            return;
        }

        NSLog(@"[WebSocketServer] WebSocket handshake complete for %@", connection.browserId);
        connection.handshakeComplete = YES;

        // Remove handshake data from buffer
        NSUInteger newLength = connection.receiveBuffer.length - (range.location + crlfcrlf.length);
        if (newLength > 0) {
            NSData *remaining = [connection.receiveBuffer subdataWithRange:NSMakeRange(range.location + crlfcrlf.length, newLength)];
            connection.receiveBuffer = [remaining mutableCopy];
        } else {
            [connection.receiveBuffer setLength:0];
        }

        [self.connectedBrowsers addObject:connection.browserId];

        // Process any remaining data as WebSocket frames
        if (connection.receiveBuffer.length > 0) {
            [self processWebSocketFramesForConnection:connection];
        }
        return;
    }

    // Unknown request type
    NSLog(@"[WebSocketServer] Unknown HTTP request type");
    [self sendHTTPError:@"Bad Request" code:400 toConnection:connection];
    [self closeConnection:connection];
}

- (NSString *)generateWebSocketAcceptKey:(NSString *)key {
    NSString *combined = [key stringByAppendingString:(NSString *)WS_GUID];
    NSData *data = [combined dataUsingEncoding:NSUTF8StringEncoding];

    // SHA-1 hash
    uint8_t digest[CC_SHA1_DIGEST_LENGTH];
    CC_SHA1(data.bytes, (CC_LONG)data.length, digest);

    // Base64 encode
    NSData *hashData = [NSData dataWithBytes:digest length:CC_SHA1_DIGEST_LENGTH];
    return [hashData base64EncodedStringWithOptions:0];
}

#pragma mark - WebSocket Frame Processing

- (void)processWebSocketFramesForConnection:(BrowserConnection *)connection {
    while (connection.receiveBuffer.length >= 2) {
        const uint8_t *bytes = connection.receiveBuffer.bytes;

        // Parse frame header
        BOOL fin = (bytes[0] & 0x80) != 0;
        uint8_t opcode = bytes[0] & 0x0F;
        BOOL masked = (bytes[1] & 0x80) != 0;
        uint64_t payloadLength = bytes[1] & 0x7F;

        NSUInteger headerSize = 2;

        // Extended payload length
        if (payloadLength == 126) {
            if (connection.receiveBuffer.length < 4) return;
            payloadLength = (bytes[2] << 8) | bytes[3];
            headerSize = 4;
        } else if (payloadLength == 127) {
            if (connection.receiveBuffer.length < 10) return;
            payloadLength = 0;
            for (int i = 0; i < 8; i++) {
                payloadLength = (payloadLength << 8) | bytes[2 + i];
            }
            headerSize = 10;
        }

        // Masking key
        uint8_t maskingKey[4] = {0};
        if (masked) {
            if (connection.receiveBuffer.length < headerSize + 4) return;
            memcpy(maskingKey, bytes + headerSize, 4);
            headerSize += 4;
        }

        // Check if we have complete frame
        if (connection.receiveBuffer.length < headerSize + payloadLength) {
            return; // Wait for more data
        }

        // Extract and unmask payload
        NSMutableData *payload = [NSMutableData dataWithLength:payloadLength];
        uint8_t *payloadBytes = payload.mutableBytes;
        memcpy(payloadBytes, bytes + headerSize, payloadLength);

        if (masked) {
            for (uint64_t i = 0; i < payloadLength; i++) {
                payloadBytes[i] ^= maskingKey[i % 4];
            }
        }

        // Remove processed frame from buffer
        NSUInteger frameSize = headerSize + payloadLength;
        [connection.receiveBuffer replaceBytesInRange:NSMakeRange(0, frameSize) withBytes:NULL length:0];

        // Handle frame based on opcode
        [self handleWebSocketFrame:opcode payload:payload fin:fin forConnection:connection];
    }
}

- (void)handleWebSocketFrame:(uint8_t)opcode payload:(NSData *)payload fin:(BOOL)fin forConnection:(BrowserConnection *)connection {
    switch (opcode) {
        case WS_OPCODE_TEXT: {
            NSString *message = [[NSString alloc] initWithData:payload encoding:NSUTF8StringEncoding];
            if (message) {
                [self handleTextMessage:message fromConnection:connection];
            } else {
                NSLog(@"[WebSocketServer] Invalid UTF-8 in text frame");
            }
            break;
        }

        case WS_OPCODE_CLOSE:
            NSLog(@"[WebSocketServer] Close frame received from %@", connection.browserId);
            [self closeConnection:connection];
            break;

        case WS_OPCODE_PING:
            NSLog(@"[WebSocketServer] Ping received from %@", connection.browserId);
            [self sendPongToConnection:connection payload:payload];
            break;

        case WS_OPCODE_PONG:
            NSLog(@"[WebSocketServer] Pong received from %@", connection.browserId);
            break;

        default:
            NSLog(@"[WebSocketServer] Unknown opcode: 0x%02X", opcode);
            break;
    }
}

- (void)handleTextMessage:(NSString *)message fromConnection:(BrowserConnection *)connection {
    NSLog(@"[WebSocketServer] Received message from %@: %@", connection.browserId, message);

    // Parse JSON
    NSError *error = nil;
    NSData *jsonData = [message dataUsingEncoding:NSUTF8StringEncoding];
    NSDictionary *request = [NSJSONSerialization JSONObjectWithData:jsonData options:0 error:&error];

    if (error || ![request isKindOfClass:[NSDictionary class]]) {
        NSLog(@"[WebSocketServer] Invalid JSON message: %@", error);
        [self sendErrorResponse:@"Invalid JSON" toConnection:connection];
        return;
    }

    // Check for browser identify message
    NSString *action = request[@"action"];
    if ([action isEqualToString:@"identify"]) {
        NSString *browserName = request[@"browserName"] ?: request[@"browser"] ?: @"Unknown";
        NSLog(@"[WebSocketServer] Browser %@ identified as: %@", connection.browserId, browserName);

        // Notify delegate of browser connection
        if ([self.delegate respondsToSelector:@selector(browserWebSocketServer:browserDidConnect:browserName:)]) {
            dispatch_async(dispatch_get_main_queue(), ^{
                [self.delegate browserWebSocketServer:self browserDidConnect:connection.browserId browserName:browserName];
            });
        }
        return;
    }

    // Check if this is a response to an HTTP POST request
    // Browser sends back: {"id": "...", "response": {...}} or {"id": "...", "error": "..."}
    NSString *requestId = request[@"id"];
    if (requestId) {
        NSString *httpConnId = [NSString stringWithFormat:@"http-%@", requestId];

        BrowserConnection *httpConn = nil;
        @synchronized (self.connections) {
            httpConn = self.connections[httpConnId];
        }

        if (httpConn) {
            NSLog(@"[WebSocketServer] Received response for HTTP request %@", requestId);

            // Build response body from browser's response
            NSMutableDictionary *responseBody = [NSMutableDictionary dictionary];

            if (request[@"error"]) {
                responseBody[@"error"] = request[@"error"];
            } else if (request[@"response"]) {
                // Return the response data directly
                id response = request[@"response"];
                if ([response isKindOfClass:[NSDictionary class]]) {
                    [responseBody addEntriesFromDictionary:response];
                } else {
                    responseBody[@"result"] = response;
                }
            } else {
                // Return the whole message minus id
                [responseBody addEntriesFromDictionary:request];
                [responseBody removeObjectForKey:@"id"];
            }

            // Send HTTP response
            [self sendHTTPResponse:responseBody toConnection:httpConn];

            // Don't close the connection immediately - let the client close it after reading
            // The socket will be closed when the read source detects EOF from the client
            // Or after a longer timeout
            __weak typeof(self) weakSelf = self;
            dispatch_after(dispatch_time(DISPATCH_TIME_NOW, 2 * NSEC_PER_SEC), self.socketQueue, ^{
                // Only close if still in connections dict (may have been closed already)
                BrowserConnection *conn = nil;
                @synchronized (weakSelf.connections) {
                    conn = weakSelf.connections[httpConn.browserId];
                }
                if (conn) {
                    NSLog(@"[WebSocketServer] Closing HTTP connection after timeout: %@", httpConn.browserId);
                    [weakSelf closeConnection:httpConn];
                }
            });
            return;
        }
        // If no HTTP connection found, it might be a regular WebSocket response - fall through
    }

    // Regular WebSocket message - notify delegate
    if ([self.delegate respondsToSelector:@selector(browserWebSocketServer:didReceiveToolRequest:fromBrowser:)]) {
        dispatch_async(dispatch_get_main_queue(), ^{
            [self.delegate browserWebSocketServer:self didReceiveToolRequest:request fromBrowser:connection.browserId];
        });
    }
}

#pragma mark - Sending Messages

- (void)sendResponse:(NSDictionary *)response toBrowser:(NSString *)browserId {
    BrowserConnection *connection;
    @synchronized (self.connections) {
        connection = self.connections[browserId];
    }

    if (!connection || !connection.handshakeComplete) {
        NSLog(@"[WebSocketServer] Cannot send to %@ - not connected", browserId);
        return;
    }

    [self sendJSONMessage:response toConnection:connection];
}

- (void)broadcastMessage:(NSDictionary *)message {
    @synchronized (self.connections) {
        for (BrowserConnection *connection in self.connections.allValues) {
            if (connection.handshakeComplete) {
                [self sendJSONMessage:message toConnection:connection];
            }
        }
    }
}

- (void)sendJSONMessage:(NSDictionary *)message toConnection:(BrowserConnection *)connection {
    NSError *error = nil;
    NSData *jsonData = [NSJSONSerialization dataWithJSONObject:message options:0 error:&error];

    if (error) {
        NSLog(@"[WebSocketServer] Failed to serialize JSON: %@", error);
        return;
    }

    NSString *jsonString = [[NSString alloc] initWithData:jsonData encoding:NSUTF8StringEncoding];
    [self sendTextFrame:jsonString toConnection:connection];
}

- (void)sendTextFrame:(NSString *)text toConnection:(BrowserConnection *)connection {
    NSData *payload = [text dataUsingEncoding:NSUTF8StringEncoding];
    [self sendFrame:WS_OPCODE_TEXT payload:payload toConnection:connection];
}

- (void)sendPongToConnection:(BrowserConnection *)connection payload:(NSData *)payload {
    [self sendFrame:WS_OPCODE_PONG payload:payload toConnection:connection];
}

- (void)sendFrame:(uint8_t)opcode payload:(NSData *)payload toConnection:(BrowserConnection *)connection {
    NSMutableData *frame = [NSMutableData data];

    // Byte 0: FIN + opcode
    uint8_t byte0 = 0x80 | opcode; // FIN=1
    [frame appendBytes:&byte0 length:1];

    // Byte 1: MASK + payload length
    uint64_t payloadLength = payload.length;
    uint8_t byte1 = 0x00; // MASK=0 (server doesn't mask)

    if (payloadLength < 126) {
        byte1 |= payloadLength;
        [frame appendBytes:&byte1 length:1];
    } else if (payloadLength < 65536) {
        byte1 |= 126;
        [frame appendBytes:&byte1 length:1];
        uint8_t len[2] = {(payloadLength >> 8) & 0xFF, payloadLength & 0xFF};
        [frame appendBytes:len length:2];
    } else {
        byte1 |= 127;
        [frame appendBytes:&byte1 length:1];
        uint8_t len[8];
        for (int i = 7; i >= 0; i--) {
            len[i] = (payloadLength >> (8 * (7 - i))) & 0xFF;
        }
        [frame appendBytes:len length:8];
    }

    // Payload
    if (payload.length > 0) {
        [frame appendData:payload];
    }

    // Send
    ssize_t bytesSent = write(connection.socket, frame.bytes, frame.length);
    if (bytesSent != frame.length) {
        NSLog(@"[WebSocketServer] Failed to send frame to %@", connection.browserId);
        [self closeConnection:connection];
    }
}

- (void)sendErrorResponse:(NSString *)errorMessage toConnection:(BrowserConnection *)connection {
    NSDictionary *response = @{
        @"type": @"error",
        @"error": errorMessage
    };
    [self sendJSONMessage:response toConnection:connection];
}

- (void)sendHTTPError:(NSString *)errorMessage code:(NSInteger)code toConnection:(BrowserConnection *)connection {
    NSString *statusText = @"Error";
    if (code == 400) statusText = @"Bad Request";
    else if (code == 503) statusText = @"Service Unavailable";

    NSDictionary *errorBody = @{@"error": errorMessage};
    NSData *jsonData = [NSJSONSerialization dataWithJSONObject:errorBody options:0 error:nil];
    if (!jsonData) {
        jsonData = [@"{}" dataUsingEncoding:NSUTF8StringEncoding];
    }

    // Use byte length for Content-Length (not character count)
    NSString *headers = [NSString stringWithFormat:
        @"HTTP/1.1 %ld %@\r\n"
        @"Content-Type: application/json; charset=utf-8\r\n"
        @"Content-Length: %lu\r\n"
        @"Connection: close\r\n"
        @"\r\n",
        (long)code, statusText, (unsigned long)jsonData.length];

    NSData *headerData = [headers dataUsingEncoding:NSUTF8StringEncoding];
    write(connection.socket, headerData.bytes, headerData.length);
    write(connection.socket, jsonData.bytes, jsonData.length);
}

- (void)sendHTTPResponse:(NSDictionary *)responseBody toConnection:(BrowserConnection *)connection {
    NSData *jsonData = [NSJSONSerialization dataWithJSONObject:responseBody options:0 error:nil];
    if (!jsonData) {
        jsonData = [@"{}" dataUsingEncoding:NSUTF8StringEncoding];
    }

    // Use byte length for Content-Length (not character count)
    NSString *headers = [NSString stringWithFormat:
        @"HTTP/1.1 200 OK\r\n"
        @"Content-Type: application/json; charset=utf-8\r\n"
        @"Content-Length: %lu\r\n"
        @"Connection: close\r\n"
        @"\r\n",
        (unsigned long)jsonData.length];

    NSData *headerData = [headers dataUsingEncoding:NSUTF8StringEncoding];

    // Combine headers and body into single write to avoid partial sends
    NSMutableData *fullResponse = [NSMutableData dataWithData:headerData];
    [fullResponse appendData:jsonData];

    ssize_t totalWritten = 0;
    ssize_t remaining = fullResponse.length;
    const uint8_t *bytes = fullResponse.bytes;

    // Ensure all data is written
    while (remaining > 0) {
        ssize_t written = write(connection.socket, bytes + totalWritten, remaining);
        if (written <= 0) {
            NSLog(@"[WebSocketServer] Write error: %s", strerror(errno));
            break;
        }
        totalWritten += written;
        remaining -= written;
    }

    // Shutdown write side to signal EOF to client, allowing them to read remaining data
    if (connection.socket >= 0) {
        shutdown(connection.socket, SHUT_WR);
    }
}

#pragma mark - Connection Management

- (void)closeConnection:(BrowserConnection *)connection {
    NSLog(@"[WebSocketServer] Closing connection %@", connection.browserId);

    // Check if this was a WebSocket browser connection (not HTTP)
    BOOL wasWebSocketBrowser = connection.handshakeComplete && ![connection.browserId hasPrefix:@"http-"];

    @synchronized (self.connections) {
        [self.connections removeObjectForKey:connection.browserId];
    }

    [self.connectedBrowsers removeObject:connection.browserId];

    if (connection.readSource) {
        dispatch_source_cancel(connection.readSource);
        connection.readSource = nil;
    }

    if (connection.socket >= 0) {
        close(connection.socket);
        connection.socket = -1;
    }

    // Notify delegate of browser disconnection (only for actual browser WebSocket connections)
    if (wasWebSocketBrowser && [self.delegate respondsToSelector:@selector(browserWebSocketServer:browserDidDisconnect:)]) {
        NSString *browserId = connection.browserId;
        dispatch_async(dispatch_get_main_queue(), ^{
            [self.delegate browserWebSocketServer:self browserDidDisconnect:browserId];
        });
    }
}

- (void)dealloc {
    [self stop];
}

@end
