/**
 * ShellTools - Native Objective-C implementation
 */

#import "ShellTools.h"

@interface ShellSession : NSObject
@property (nonatomic, strong) NSString *sessionId;
@property (nonatomic, strong) NSTask *task;
@property (nonatomic, strong) NSPipe *stdinPipe;
@property (nonatomic, strong) NSPipe *stdoutPipe;
@property (nonatomic, strong) NSPipe *stderrPipe;
@property (nonatomic, strong) NSString *command;
@property (nonatomic, strong) NSString *cwd;
@property (nonatomic, strong) NSDate *startedAt;
@property (nonatomic, assign) pid_t pid;
@property (nonatomic, assign) BOOL captureStderr;
@property (nonatomic, strong) dispatch_source_t timeoutTimer;
@end

@implementation ShellSession
@end

@interface ShellTools ()
@property (nonatomic, strong) NSMutableDictionary<NSString *, ShellSession *> *sessions;
@property (nonatomic, strong) dispatch_queue_t sessionQueue;
@property (nonatomic, strong) dispatch_source_t cleanupTimer;
@end

@implementation ShellTools

- (instancetype)init {
    self = [super init];
    if (self) {
        _sessions = [NSMutableDictionary dictionary];
        _sessionQueue = dispatch_queue_create("com.mcpeyes.shelltools", DISPATCH_QUEUE_SERIAL);
        _maxConcurrentSessions = 10;
        _sessionTimeout = 3600; // 1 hour

        [self startSessionCleanup];
    }
    return self;
}

- (void)dealloc {
    [self cleanupAllSessions];
    if (_cleanupTimer) {
        dispatch_source_cancel(_cleanupTimer);
    }
}

#pragma mark - Synchronous Command Execution

- (NSDictionary *)executeCommand:(NSString *)command
                             cwd:(NSString *)cwd
                  timeoutSeconds:(NSTimeInterval)timeoutSeconds
                   captureStderr:(BOOL)captureStderr {
    if (!command || command.length == 0) {
        return @{@"error": @"Command is required"};
    }

    if (timeoutSeconds <= 0) {
        timeoutSeconds = 600; // 10 minutes default
    }

    NSTask *task = [[NSTask alloc] init];
    task.launchPath = @"/bin/sh";
    task.arguments = @[@"-c", command];

    if (cwd && cwd.length > 0) {
        task.currentDirectoryPath = cwd;
    }

    NSPipe *stdoutPipe = [NSPipe pipe];
    NSPipe *stderrPipe = captureStderr ? [NSPipe pipe] : nil;

    task.standardOutput = stdoutPipe;
    task.standardError = stderrPipe ?: [NSFileHandle fileHandleWithNullDevice];
    task.standardInput = [NSFileHandle fileHandleWithNullDevice];

    __block NSMutableData *stdoutData = [NSMutableData data];
    __block NSMutableData *stderrData = [NSMutableData data];
    __block BOOL truncated = NO;
    const NSUInteger maxOutputSize = 10 * 1024 * 1024; // 10MB limit

    // Set up async reading for stdout
    [[stdoutPipe fileHandleForReading] setReadabilityHandler:^(NSFileHandle *handle) {
        NSData *data = [handle availableData];
        if (data.length > 0 && stdoutData.length + data.length <= maxOutputSize) {
            [stdoutData appendData:data];
        } else if (data.length > 0) {
            truncated = YES;
        }
    }];

    // Set up async reading for stderr
    if (stderrPipe) {
        [[stderrPipe fileHandleForReading] setReadabilityHandler:^(NSFileHandle *handle) {
            NSData *data = [handle availableData];
            if (data.length > 0 && stderrData.length + data.length <= maxOutputSize) {
                [stderrData appendData:data];
            } else if (data.length > 0) {
                truncated = YES;
            }
        }];
    }

    // Launch task
    NSError *error = nil;
    if (![task launchAndReturnError:&error]) {
        return @{
            @"error": [NSString stringWithFormat:@"Failed to launch: %@", error.localizedDescription],
            @"exit_code": @(-1),
            @"stdout": @"",
            @"stderr": @""
        };
    }

    // Set up timeout
    __block BOOL timedOut = NO;
    dispatch_source_t timer = dispatch_source_create(DISPATCH_SOURCE_TYPE_TIMER, 0, 0,
                                                     dispatch_get_global_queue(DISPATCH_QUEUE_PRIORITY_DEFAULT, 0));
    dispatch_source_set_timer(timer,
                             dispatch_time(DISPATCH_TIME_NOW, (int64_t)(timeoutSeconds * NSEC_PER_SEC)),
                             DISPATCH_TIME_FOREVER,
                             0);
    dispatch_source_set_event_handler(timer, ^{
        timedOut = YES;
        [task terminate];
    });
    dispatch_resume(timer);

    // Wait for task to complete
    [task waitUntilExit];

    // Cancel timeout timer
    dispatch_source_cancel(timer);

    // Stop reading handlers
    [[stdoutPipe fileHandleForReading] setReadabilityHandler:nil];
    if (stderrPipe) {
        [[stderrPipe fileHandleForReading] setReadabilityHandler:nil];
    }

    // Read any remaining data
    NSData *remainingStdout = [[stdoutPipe fileHandleForReading] readDataToEndOfFile];
    if (remainingStdout.length > 0 && stdoutData.length + remainingStdout.length <= maxOutputSize) {
        [stdoutData appendData:remainingStdout];
    }
    if (stderrPipe) {
        NSData *remainingStderr = [[stderrPipe fileHandleForReading] readDataToEndOfFile];
        if (remainingStderr.length > 0 && stderrData.length + remainingStderr.length <= maxOutputSize) {
            [stderrData appendData:remainingStderr];
        }
    }

    if (timedOut) {
        return @{
            @"error": [NSString stringWithFormat:@"Command timeout after %.0f seconds", timeoutSeconds],
            @"exit_code": @(-1),
            @"stdout": [[NSString alloc] initWithData:stdoutData encoding:NSUTF8StringEncoding] ?: @"",
            @"stderr": [[NSString alloc] initWithData:stderrData encoding:NSUTF8StringEncoding] ?: @"",
            @"truncated": @(truncated)
        };
    }

    return @{
        @"exit_code": @(task.terminationStatus),
        @"stdout": [[NSString alloc] initWithData:stdoutData encoding:NSUTF8StringEncoding] ?: @"",
        @"stderr": [[NSString alloc] initWithData:stderrData encoding:NSUTF8StringEncoding] ?: @"",
        @"truncated": @(truncated)
    };
}

#pragma mark - Session Management

- (NSDictionary *)startSession:(NSString *)command
                           cwd:(NSString *)cwd
                           env:(NSDictionary<NSString *, NSString *> *)env
                 captureStderr:(BOOL)captureStderr {
    if (!command || command.length == 0) {
        return @{@"error": @"Command is required"};
    }

    __block NSDictionary *result = nil;

    dispatch_sync(self.sessionQueue, ^{
        // Check max concurrent sessions
        if (self.sessions.count >= self.maxConcurrentSessions) {
            result = @{@"error": [NSString stringWithFormat:@"Maximum concurrent sessions (%ld) reached",
                                  (long)self.maxConcurrentSessions]};
            return;
        }

        // Generate session ID
        NSString *sessionId = [NSString stringWithFormat:@"session_%ld_%@",
                              (long)[[NSDate date] timeIntervalSince1970],
                              [[NSUUID UUID] UUIDString]];

        // Create task
        NSTask *task = [[NSTask alloc] init];
        task.launchPath = @"/bin/sh";
        task.arguments = @[@"-c", command];

        if (cwd && cwd.length > 0) {
            task.currentDirectoryPath = cwd;
        }

        // Set environment
        if (env && env.count > 0) {
            NSMutableDictionary *fullEnv = [[[NSProcessInfo processInfo] environment] mutableCopy];
            [fullEnv addEntriesFromDictionary:env];
            task.environment = fullEnv;
        }

        // Create pipes
        NSPipe *stdinPipe = [NSPipe pipe];
        NSPipe *stdoutPipe = [NSPipe pipe];
        NSPipe *stderrPipe = captureStderr ? [NSPipe pipe] : nil;

        task.standardInput = stdinPipe;
        task.standardOutput = stdoutPipe;
        task.standardError = stderrPipe ?: [NSFileHandle fileHandleWithNullDevice];

        // Create session object
        ShellSession *session = [[ShellSession alloc] init];
        session.sessionId = sessionId;
        session.task = task;
        session.stdinPipe = stdinPipe;
        session.stdoutPipe = stdoutPipe;
        session.stderrPipe = stderrPipe;
        session.command = command;
        session.cwd = cwd;
        session.startedAt = [NSDate date];
        session.captureStderr = captureStderr;

        // Set up stdout reader
        [[stdoutPipe fileHandleForReading] setReadabilityHandler:^(NSFileHandle *handle) {
            NSData *data = [handle availableData];
            if (data.length > 0) {
                NSString *output = [[NSString alloc] initWithData:data encoding:NSUTF8StringEncoding];
                if (output && [self.delegate respondsToSelector:@selector(shellSession:didReceiveOutput:fromStream:)]) {
                    dispatch_async(dispatch_get_main_queue(), ^{
                        [self.delegate shellSession:sessionId didReceiveOutput:output fromStream:@"stdout"];
                    });
                }
            }
        }];

        // Set up stderr reader
        if (stderrPipe) {
            [[stderrPipe fileHandleForReading] setReadabilityHandler:^(NSFileHandle *handle) {
                NSData *data = [handle availableData];
                if (data.length > 0) {
                    NSString *output = [[NSString alloc] initWithData:data encoding:NSUTF8StringEncoding];
                    if (output && [self.delegate respondsToSelector:@selector(shellSession:didReceiveOutput:fromStream:)]) {
                        dispatch_async(dispatch_get_main_queue(), ^{
                            [self.delegate shellSession:sessionId didReceiveOutput:output fromStream:@"stderr"];
                        });
                    }
                }
            }];
        }

        // Set up termination handler
        task.terminationHandler = ^(NSTask *finishedTask) {
            // Stop reading handlers
            [[stdoutPipe fileHandleForReading] setReadabilityHandler:nil];
            if (stderrPipe) {
                [[stderrPipe fileHandleForReading] setReadabilityHandler:nil];
            }

            // Notify delegate
            if ([self.delegate respondsToSelector:@selector(shellSession:didExitWithCode:error:)]) {
                dispatch_async(dispatch_get_main_queue(), ^{
                    [self.delegate shellSession:sessionId didExitWithCode:finishedTask.terminationStatus error:nil];
                });
            }

            // Clean up session
            dispatch_async(self.sessionQueue, ^{
                [self cleanupSessionInternal:sessionId];
            });
        };

        // Launch task
        NSError *error = nil;
        if (![task launchAndReturnError:&error]) {
            result = @{@"error": [NSString stringWithFormat:@"Failed to launch: %@", error.localizedDescription]};
            return;
        }

        session.pid = task.processIdentifier;

        // Set up session timeout
        dispatch_source_t timeoutTimer = dispatch_source_create(DISPATCH_SOURCE_TYPE_TIMER, 0, 0,
                                                                 dispatch_get_global_queue(DISPATCH_QUEUE_PRIORITY_DEFAULT, 0));
        dispatch_source_set_timer(timeoutTimer,
                                 dispatch_time(DISPATCH_TIME_NOW, (int64_t)(self.sessionTimeout * NSEC_PER_SEC)),
                                 DISPATCH_TIME_FOREVER,
                                 0);
        dispatch_source_set_event_handler(timeoutTimer, ^{
            [self stopSession:sessionId signal:@"TERM"];
        });
        dispatch_resume(timeoutTimer);
        session.timeoutTimer = timeoutTimer;

        // Store session
        self.sessions[sessionId] = session;

        result = @{
            @"session_id": sessionId,
            @"pid": @(session.pid)
        };
    });

    return result;
}

- (NSDictionary *)sendInput:(NSString *)sessionId input:(NSString *)input {
    if (!sessionId || sessionId.length == 0) {
        return @{@"error": @"Session ID is required"};
    }

    if (!input) {
        return @{@"error": @"Input is required"};
    }

    __block NSDictionary *result = nil;

    dispatch_sync(self.sessionQueue, ^{
        ShellSession *session = self.sessions[sessionId];

        if (!session) {
            result = @{@"error": [NSString stringWithFormat:@"Session %@ not found", sessionId]};
            return;
        }

        if (!session.stdinPipe) {
            result = @{@"error": [NSString stringWithFormat:@"Session %@ stdin is not available", sessionId]};
            return;
        }

        @try {
            NSData *data = [input dataUsingEncoding:NSUTF8StringEncoding];
            [[session.stdinPipe fileHandleForWriting] writeData:data];

            result = @{
                @"session_id": sessionId,
                @"bytes_written": @(data.length)
            };
        }
        @catch (NSException *exception) {
            result = @{@"error": [NSString stringWithFormat:@"Failed to write to session: %@", exception.reason]};
        }
    });

    return result;
}

- (NSDictionary *)stopSession:(NSString *)sessionId signal:(NSString *)signal {
    if (!sessionId || sessionId.length == 0) {
        return @{@"error": @"Session ID is required"};
    }

    if (!signal || signal.length == 0) {
        signal = @"TERM";
    }

    __block NSDictionary *result = nil;

    dispatch_sync(self.sessionQueue, ^{
        ShellSession *session = self.sessions[sessionId];

        if (!session) {
            result = @{@"error": [NSString stringWithFormat:@"Session %@ not found", sessionId]};
            return;
        }

        // Convert signal name to number
        int signalNum = SIGTERM;
        if ([signal isEqualToString:@"KILL"]) {
            signalNum = SIGKILL;
        } else if ([signal isEqualToString:@"INT"]) {
            signalNum = SIGINT;
        } else if ([signal isEqualToString:@"HUP"]) {
            signalNum = SIGHUP;
        } else if ([signal isEqualToString:@"QUIT"]) {
            signalNum = SIGQUIT;
        }

        @try {
            if (session.task.isRunning) {
                kill(session.pid, signalNum);
            }
        }
        @catch (NSException *exception) {
            NSLog(@"[ShellTools] Error stopping session %@: %@", sessionId, exception.reason);
        }

        [self cleanupSessionInternal:sessionId];

        result = @{
            @"session_id": sessionId,
            @"stopped": @YES
        };
    });

    return result;
}

#pragma mark - Session Information

- (NSDictionary *)getSession:(NSString *)sessionId {
    __block NSDictionary *result = nil;

    dispatch_sync(self.sessionQueue, ^{
        ShellSession *session = self.sessions[sessionId];

        if (session) {
            result = @{
                @"session_id": session.sessionId,
                @"command": session.command ?: @"",
                @"cwd": session.cwd ?: @"",
                @"pid": @(session.pid),
                @"started_at": [self formatDate:session.startedAt],
                @"is_running": @(session.task.isRunning)
            };
        }
    });

    return result;
}

- (NSArray<NSDictionary *> *)getAllSessions {
    __block NSArray *result = nil;

    dispatch_sync(self.sessionQueue, ^{
        NSMutableArray *sessionList = [NSMutableArray array];

        for (ShellSession *session in self.sessions.allValues) {
            [sessionList addObject:@{
                @"session_id": session.sessionId,
                @"command": session.command ?: @"",
                @"pid": @(session.pid),
                @"started_at": [self formatDate:session.startedAt],
                @"is_running": @(session.task.isRunning)
            }];
        }

        result = [sessionList copy];
    });

    return result;
}

- (void)cleanupAllSessions {
    dispatch_sync(self.sessionQueue, ^{
        for (NSString *sessionId in [self.sessions.allKeys copy]) {
            ShellSession *session = self.sessions[sessionId];

            if (session.timeoutTimer) {
                dispatch_source_cancel(session.timeoutTimer);
            }

            @try {
                if (session.task.isRunning) {
                    [session.task terminate];
                }
            }
            @catch (NSException *exception) {
                // Ignore
            }

            // Stop reading handlers
            [[session.stdoutPipe fileHandleForReading] setReadabilityHandler:nil];
            if (session.stderrPipe) {
                [[session.stderrPipe fileHandleForReading] setReadabilityHandler:nil];
            }

            // Close stdin
            @try {
                [[session.stdinPipe fileHandleForWriting] closeFile];
            }
            @catch (NSException *exception) {
                // Ignore
            }
        }

        [self.sessions removeAllObjects];
    });
}

#pragma mark - Private Methods

- (void)cleanupSessionInternal:(NSString *)sessionId {
    ShellSession *session = self.sessions[sessionId];

    if (session) {
        // Cancel timeout timer
        if (session.timeoutTimer) {
            dispatch_source_cancel(session.timeoutTimer);
            session.timeoutTimer = nil;
        }

        // Stop reading handlers
        [[session.stdoutPipe fileHandleForReading] setReadabilityHandler:nil];
        if (session.stderrPipe) {
            [[session.stderrPipe fileHandleForReading] setReadabilityHandler:nil];
        }

        // Close stdin
        @try {
            [[session.stdinPipe fileHandleForWriting] closeFile];
        }
        @catch (NSException *exception) {
            // Ignore - pipe may already be closed
        }

        [self.sessions removeObjectForKey:sessionId];
    }
}

- (void)startSessionCleanup {
    // Periodic cleanup of timed-out sessions (every 60 seconds)
    self.cleanupTimer = dispatch_source_create(DISPATCH_SOURCE_TYPE_TIMER, 0, 0,
                                                dispatch_get_global_queue(DISPATCH_QUEUE_PRIORITY_DEFAULT, 0));
    dispatch_source_set_timer(self.cleanupTimer,
                             dispatch_time(DISPATCH_TIME_NOW, 60 * NSEC_PER_SEC),
                             60 * NSEC_PER_SEC,
                             0);

    __weak typeof(self) weakSelf = self;
    dispatch_source_set_event_handler(self.cleanupTimer, ^{
        [weakSelf checkForTimedOutSessions];
    });

    dispatch_resume(self.cleanupTimer);
}

- (void)checkForTimedOutSessions {
    dispatch_async(self.sessionQueue, ^{
        NSDate *now = [NSDate date];

        for (NSString *sessionId in [self.sessions.allKeys copy]) {
            ShellSession *session = self.sessions[sessionId];
            NSTimeInterval age = [now timeIntervalSinceDate:session.startedAt];

            if (age > self.sessionTimeout) {
                NSLog(@"[ShellTools] Cleaning up timed-out session %@", sessionId);

                @try {
                    if (session.task.isRunning) {
                        [session.task terminate];
                    }
                }
                @catch (NSException *exception) {
                    // Ignore
                }

                [self cleanupSessionInternal:sessionId];
            }
        }
    });
}

- (NSString *)formatDate:(NSDate *)date {
    static NSDateFormatter *formatter = nil;
    static dispatch_once_t onceToken;
    dispatch_once(&onceToken, ^{
        formatter = [[NSDateFormatter alloc] init];
        [formatter setDateFormat:@"yyyy-MM-dd'T'HH:mm:ss.SSSZ"];
        [formatter setTimeZone:[NSTimeZone timeZoneWithAbbreviation:@"UTC"]];
    });
    return [formatter stringFromDate:date];
}

@end
