/**
 * FilesystemTools - Native Objective-C implementation
 *
 * Provides filesystem primitives for MCP agent:
 * - fs_list: List files and directories
 * - fs_read: Read file contents (with size limit)
 * - fs_read_range: Read file segment by line range
 * - fs_write: Create or overwrite a file
 * - fs_delete: Delete a file or directory
 * - fs_move: Move or rename a file/directory
 * - fs_search: Find files by pattern (glob)
 * - fs_grep: Search within files
 * - fs_patch: Apply focused transformations to a file
 */

#import <Foundation/Foundation.h>

@interface FilesystemTools : NSObject

#pragma mark - Directory Listing

/**
 * List files and directories at or under a given path
 * @param path The directory path to list
 * @param recursive Whether to list recursively
 * @param maxDepth Maximum depth for recursive listing (default: 3)
 * @return Dictionary with "entries" array containing path, type, size, modified
 */
- (NSDictionary *)listDirectory:(NSString *)path
                      recursive:(BOOL)recursive
                       maxDepth:(NSInteger)maxDepth;

#pragma mark - File Reading

/**
 * Read the contents of a file (with size limit)
 * @param path The file path to read
 * @param maxBytes Maximum bytes to read (default: 131072 / 128KB)
 * @return Dictionary with path, content, truncated flag, and size
 */
- (NSDictionary *)readFile:(NSString *)path maxBytes:(NSInteger)maxBytes;

/**
 * Read a file segment by line range (1-based, inclusive)
 * @param path The file path to read
 * @param startLine Starting line number (1-based)
 * @param endLine Ending line number (inclusive)
 * @return Dictionary with path, start_line, end_line, content, total_lines
 */
- (NSDictionary *)readFileRange:(NSString *)path
                      startLine:(NSInteger)startLine
                        endLine:(NSInteger)endLine;

#pragma mark - File Writing

/**
 * Create or overwrite a file
 * @param path The file path to write
 * @param content The content to write
 * @param createDirs Whether to create parent directories (default: YES)
 * @param mode Write mode: "overwrite", "append", or "create_if_missing"
 * @return Dictionary with path and bytes_written
 */
- (NSDictionary *)writeFile:(NSString *)path
                    content:(NSString *)content
                 createDirs:(BOOL)createDirs
                       mode:(NSString *)mode;

#pragma mark - File Operations

/**
 * Delete a file or directory
 * @param path The path to delete
 * @param recursive Whether to delete recursively for directories
 * @return Dictionary with path and deleted flag
 */
- (NSDictionary *)deletePath:(NSString *)path recursive:(BOOL)recursive;

/**
 * Move or rename a file or directory
 * @param fromPath Source path
 * @param toPath Destination path
 * @return Dictionary with from, to, and moved flag
 */
- (NSDictionary *)movePath:(NSString *)fromPath toPath:(NSString *)toPath;

#pragma mark - File Search

/**
 * Find files by pattern (glob)
 * @param basePath Base directory for search
 * @param globPattern Glob pattern (e.g., "*.txt", "** / *.js" without spaces)
 * @param maxResults Maximum number of results (default: 200)
 * @return Dictionary with matches array containing path and type
 */
- (NSDictionary *)searchFiles:(NSString *)basePath
                         glob:(NSString *)globPattern
                   maxResults:(NSInteger)maxResults;

/**
 * Search within files (uses grep/ripgrep)
 * @param basePath Base directory for search
 * @param pattern Regex pattern to search for
 * @param globPattern Optional glob filter for files
 * @param maxMatches Maximum number of matches (default: 200)
 * @return Dictionary with matches array containing path, line, text, column
 */
- (NSDictionary *)grepFiles:(NSString *)basePath
                    pattern:(NSString *)pattern
                       glob:(NSString *)globPattern
                 maxMatches:(NSInteger)maxMatches;

#pragma mark - File Patching

/**
 * Apply focused transformations to a file
 * @param path The file path to patch
 * @param operations Array of operation dictionaries with type, pattern/match, replacement/insert
 * @param dryRun If YES, return preview without modifying file
 * @return Dictionary with path, operations_applied, and optional preview
 */
- (NSDictionary *)patchFile:(NSString *)path
                 operations:(NSArray<NSDictionary *> *)operations
                     dryRun:(BOOL)dryRun;

@end
