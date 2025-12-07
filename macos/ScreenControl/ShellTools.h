/**
 * ShellTools - Native Objective-C implementation
 *
 * Provides shell primitives for MCP agent:
 * - shell_exec: Run a command and return output when it finishes
 * - shell_start_session: Start an interactive or long-running command session
 * - shell_send_input: Send input to a running shell session
 * - shell_stop_session: Stop/terminate a running session
 */

#import <Foundation/Foundation.h>

@protocol ShellToolsDelegate <NSObject>
@optional
/**
 * Called when a session produces output
 */
- (void)shellSession:(NSString *)sessionId
       didReceiveOutput:(NSString *)output
              fromStream:(NSString *)stream; // "stdout" or "stderr"

/**
 * Called when a session exits
 */
- (void)shellSession:(NSString *)sessionId
         didExitWithCode:(NSInteger)exitCode
                   error:(NSString * _Nullable)error;
@end

@interface ShellTools : NSObject

@property (weak, nonatomic) id<ShellToolsDelegate> delegate;
@property (nonatomic, assign) NSInteger maxConcurrentSessions; // Default: 10
@property (nonatomic, assign) NSTimeInterval sessionTimeout;   // Default: 3600 (1 hour)

#pragma mark - Synchronous Command Execution

/**
 * Run a command and return output when it finishes
 * @param command The shell command to execute
 * @param cwd Working directory (nil for current)
 * @param timeoutSeconds Maximum execution time (default: 600)
 * @param captureStderr Whether to capture stderr (default: YES)
 * @return Dictionary with exit_code, stdout, stderr, truncated
 */
- (NSDictionary *)executeCommand:(NSString *)command
                             cwd:(NSString * _Nullable)cwd
                  timeoutSeconds:(NSTimeInterval)timeoutSeconds
                   captureStderr:(BOOL)captureStderr;

#pragma mark - Session Management

/**
 * Start an interactive or long-running command session
 * @param command The shell command to execute
 * @param cwd Working directory (nil for current)
 * @param env Additional environment variables (nil for none)
 * @param captureStderr Whether to capture stderr (default: YES)
 * @return Dictionary with session_id and pid
 */
- (NSDictionary *)startSession:(NSString *)command
                           cwd:(NSString * _Nullable)cwd
                           env:(NSDictionary<NSString *, NSString *> * _Nullable)env
                 captureStderr:(BOOL)captureStderr;

/**
 * Send input to a running shell session
 * @param sessionId The session identifier
 * @param input The input to send
 * @return Dictionary with session_id and bytes_written
 */
- (NSDictionary *)sendInput:(NSString *)sessionId input:(NSString *)input;

/**
 * Stop/terminate a running session
 * @param sessionId The session identifier
 * @param signal Signal to send ("TERM", "KILL", "INT", etc.) - default: "TERM"
 * @return Dictionary with session_id and stopped flag
 */
- (NSDictionary *)stopSession:(NSString *)sessionId signal:(NSString * _Nullable)signal;

#pragma mark - Session Information

/**
 * Get information about a specific session
 * @param sessionId The session identifier
 * @return Dictionary with session info or nil if not found
 */
- (NSDictionary * _Nullable)getSession:(NSString *)sessionId;

/**
 * Get list of all active sessions
 * @return Array of session info dictionaries
 */
- (NSArray<NSDictionary *> *)getAllSessions;

/**
 * Clean up all sessions (call on shutdown)
 */
- (void)cleanupAllSessions;

@end
