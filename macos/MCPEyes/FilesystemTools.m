/**
 * FilesystemTools - Native Objective-C implementation
 */

#import "FilesystemTools.h"

@implementation FilesystemTools

#pragma mark - Helper Methods

/**
 * Canonicalise path (resolve to absolute path)
 */
- (NSString *)canonicalisePath:(NSString *)inputPath {
    if (!inputPath || inputPath.length == 0) {
        return [[NSFileManager defaultManager] currentDirectoryPath];
    }

    // Expand tilde
    NSString *expanded = [inputPath stringByExpandingTildeInPath];

    // Resolve to absolute path
    if (![expanded hasPrefix:@"/"]) {
        NSString *cwd = [[NSFileManager defaultManager] currentDirectoryPath];
        expanded = [cwd stringByAppendingPathComponent:expanded];
    }

    // Standardize path (resolve .. and .)
    return [expanded stringByStandardizingPath];
}

/**
 * Format date to ISO 8601 string
 */
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

#pragma mark - Directory Listing

- (NSDictionary *)listDirectory:(NSString *)path
                      recursive:(BOOL)recursive
                       maxDepth:(NSInteger)maxDepth {
    NSString *dirPath = [self canonicalisePath:path];
    NSFileManager *fm = [NSFileManager defaultManager];

    BOOL isDir;
    if (![fm fileExistsAtPath:dirPath isDirectory:&isDir]) {
        return @{@"error": [NSString stringWithFormat:@"Path does not exist: %@", dirPath]};
    }
    if (!isDir) {
        return @{@"error": [NSString stringWithFormat:@"Path is not a directory: %@", dirPath]};
    }

    if (maxDepth <= 0) {
        maxDepth = 3;
    }

    NSMutableArray *entries = [NSMutableArray array];
    [self traverseDirectory:dirPath
                    entries:entries
                  recursive:recursive
                   maxDepth:maxDepth
               currentDepth:0];

    return @{@"entries": entries};
}

- (void)traverseDirectory:(NSString *)currentPath
                  entries:(NSMutableArray *)entries
                recursive:(BOOL)recursive
                 maxDepth:(NSInteger)maxDepth
             currentDepth:(NSInteger)currentDepth {
    if (currentDepth > maxDepth) {
        return;
    }

    NSFileManager *fm = [NSFileManager defaultManager];
    NSError *error = nil;
    NSArray *items = [fm contentsOfDirectoryAtPath:currentPath error:&error];

    if (error) {
        // Skip directories we can't read (permission denied)
        if (error.code != NSFileReadNoPermissionError && error.code != NSFileNoSuchFileError) {
            NSLog(@"Error reading directory %@: %@", currentPath, error);
        }
        return;
    }

    for (NSString *item in items) {
        NSString *fullPath = [currentPath stringByAppendingPathComponent:item];
        NSDictionary *attrs = [fm attributesOfItemAtPath:fullPath error:nil];

        if (!attrs) continue;

        BOOL isDirectory = [attrs[NSFileType] isEqualToString:NSFileTypeDirectory];

        NSMutableDictionary *entry = [NSMutableDictionary dictionary];
        entry[@"path"] = fullPath;
        entry[@"type"] = isDirectory ? @"directory" : @"file";

        NSDate *modDate = attrs[NSFileModificationDate];
        if (modDate) {
            entry[@"modified"] = [self formatDate:modDate];
        }

        if (!isDirectory) {
            entry[@"size"] = attrs[NSFileSize];
        }

        [entries addObject:entry];

        if (recursive && isDirectory && currentDepth < maxDepth) {
            [self traverseDirectory:fullPath
                            entries:entries
                          recursive:recursive
                           maxDepth:maxDepth
                       currentDepth:currentDepth + 1];
        }
    }
}

#pragma mark - File Reading

- (NSDictionary *)readFile:(NSString *)path maxBytes:(NSInteger)maxBytes {
    NSString *filePath = [self canonicalisePath:path];
    NSFileManager *fm = [NSFileManager defaultManager];

    if (maxBytes <= 0) {
        maxBytes = 131072; // 128KB default
    }

    BOOL isDir;
    if (![fm fileExistsAtPath:filePath isDirectory:&isDir]) {
        return @{@"error": [NSString stringWithFormat:@"File does not exist: %@", filePath]};
    }
    if (isDir) {
        return @{@"error": [NSString stringWithFormat:@"Path is a directory, not a file: %@", filePath]};
    }

    NSError *error = nil;
    NSDictionary *attrs = [fm attributesOfItemAtPath:filePath error:&error];
    if (error) {
        return @{@"error": [NSString stringWithFormat:@"Cannot read file attributes: %@", error.localizedDescription]};
    }

    NSNumber *fileSize = attrs[NSFileSize];
    NSUInteger size = [fileSize unsignedIntegerValue];

    NSString *content = nil;
    BOOL truncated = NO;

    if (size > maxBytes) {
        // Read partial content
        NSFileHandle *handle = [NSFileHandle fileHandleForReadingAtPath:filePath];
        if (!handle) {
            return @{@"error": @"Cannot open file for reading"};
        }

        NSData *data = [handle readDataOfLength:maxBytes];
        [handle closeFile];

        content = [[NSString alloc] initWithData:data encoding:NSUTF8StringEncoding];
        if (!content) {
            // Try Latin1 if UTF-8 fails
            content = [[NSString alloc] initWithData:data encoding:NSISOLatin1StringEncoding];
        }
        truncated = YES;
    } else {
        content = [NSString stringWithContentsOfFile:filePath
                                            encoding:NSUTF8StringEncoding
                                               error:&error];
        if (!content) {
            // Try Latin1 if UTF-8 fails
            content = [NSString stringWithContentsOfFile:filePath
                                                encoding:NSISOLatin1StringEncoding
                                                   error:&error];
        }
        if (!content) {
            return @{@"error": [NSString stringWithFormat:@"Cannot read file: %@", error.localizedDescription]};
        }
    }

    return @{
        @"path": filePath,
        @"content": content ?: @"",
        @"truncated": @(truncated),
        @"size": fileSize
    };
}

- (NSDictionary *)readFileRange:(NSString *)path
                      startLine:(NSInteger)startLine
                        endLine:(NSInteger)endLine {
    NSString *filePath = [self canonicalisePath:path];

    if (startLine > endLine) {
        return @{@"error": [NSString stringWithFormat:@"start_line (%ld) must be <= end_line (%ld)",
                           (long)startLine, (long)endLine]};
    }

    if (startLine < 1) {
        return @{@"error": @"start_line must be >= 1"};
    }

    NSError *error = nil;
    NSString *content = [NSString stringWithContentsOfFile:filePath
                                                  encoding:NSUTF8StringEncoding
                                                     error:&error];
    if (!content) {
        content = [NSString stringWithContentsOfFile:filePath
                                            encoding:NSISOLatin1StringEncoding
                                               error:&error];
    }
    if (!content) {
        return @{@"error": [NSString stringWithFormat:@"Cannot read file: %@", error.localizedDescription]};
    }

    NSArray *lines = [content componentsSeparatedByCharactersInSet:[NSCharacterSet newlineCharacterSet]];
    NSInteger totalLines = lines.count;

    if (startLine > totalLines) {
        return @{@"error": [NSString stringWithFormat:@"start_line (%ld) exceeds file length (%ld lines)",
                           (long)startLine, (long)totalLines]};
    }

    NSInteger actualEndLine = MIN(endLine, totalLines);
    NSRange range = NSMakeRange(startLine - 1, actualEndLine - startLine + 1);
    NSArray *selectedLines = [lines subarrayWithRange:range];
    NSString *selectedContent = [selectedLines componentsJoinedByString:@"\n"];

    return @{
        @"path": filePath,
        @"start_line": @(startLine),
        @"end_line": @(actualEndLine),
        @"content": selectedContent,
        @"total_lines": @(totalLines)
    };
}

#pragma mark - File Writing

- (NSDictionary *)writeFile:(NSString *)path
                    content:(NSString *)content
                 createDirs:(BOOL)createDirs
                       mode:(NSString *)mode {
    NSString *filePath = [self canonicalisePath:path];
    NSFileManager *fm = [NSFileManager defaultManager];

    if (!mode || mode.length == 0) {
        mode = @"overwrite";
    }

    // Create parent directories if needed
    if (createDirs) {
        NSString *directory = [filePath stringByDeletingLastPathComponent];
        NSError *error = nil;
        if (![fm createDirectoryAtPath:directory
           withIntermediateDirectories:YES
                            attributes:nil
                                 error:&error]) {
            if (error.code != NSFileWriteFileExistsError) {
                return @{@"error": [NSString stringWithFormat:@"Cannot create directory: %@", error.localizedDescription]};
            }
        }
    }

    BOOL fileExists = [fm fileExistsAtPath:filePath];

    if ([mode isEqualToString:@"create_if_missing"] && fileExists) {
        return @{@"error": [NSString stringWithFormat:@"File %@ already exists", filePath]};
    }

    NSError *error = nil;
    NSData *data = [content dataUsingEncoding:NSUTF8StringEncoding];
    NSUInteger bytesWritten = data.length;

    if ([mode isEqualToString:@"append"] && fileExists) {
        NSFileHandle *handle = [NSFileHandle fileHandleForWritingAtPath:filePath];
        if (!handle) {
            return @{@"error": @"Cannot open file for appending"};
        }
        [handle seekToEndOfFile];
        [handle writeData:data];
        [handle closeFile];
    } else {
        if (![data writeToFile:filePath options:NSDataWritingAtomic error:&error]) {
            return @{@"error": [NSString stringWithFormat:@"Cannot write file: %@", error.localizedDescription]};
        }
    }

    return @{
        @"path": filePath,
        @"bytes_written": @(bytesWritten)
    };
}

#pragma mark - File Operations

- (NSDictionary *)deletePath:(NSString *)path recursive:(BOOL)recursive {
    NSString *targetPath = [self canonicalisePath:path];
    NSFileManager *fm = [NSFileManager defaultManager];

    BOOL isDir;
    if (![fm fileExistsAtPath:targetPath isDirectory:&isDir]) {
        return @{@"error": [NSString stringWithFormat:@"Path does not exist: %@", targetPath]};
    }

    if (isDir && !recursive) {
        // Check if directory is empty
        NSError *error = nil;
        NSArray *contents = [fm contentsOfDirectoryAtPath:targetPath error:&error];
        if (contents.count > 0) {
            return @{@"error": [NSString stringWithFormat:@"Directory %@ is not empty. Use recursive: true to delete.", targetPath]};
        }
    }

    NSError *error = nil;
    if (![fm removeItemAtPath:targetPath error:&error]) {
        return @{@"error": [NSString stringWithFormat:@"Cannot delete: %@", error.localizedDescription]};
    }

    return @{
        @"path": targetPath,
        @"deleted": @YES
    };
}

- (NSDictionary *)movePath:(NSString *)fromPath toPath:(NSString *)toPath {
    NSString *sourcePath = [self canonicalisePath:fromPath];
    NSString *destPath = [self canonicalisePath:toPath];
    NSFileManager *fm = [NSFileManager defaultManager];

    if (![fm fileExistsAtPath:sourcePath]) {
        return @{@"error": [NSString stringWithFormat:@"Source path does not exist: %@", sourcePath]};
    }

    // Create parent directories of destination if needed
    NSString *destDir = [destPath stringByDeletingLastPathComponent];
    NSError *error = nil;
    if (![fm createDirectoryAtPath:destDir
       withIntermediateDirectories:YES
                        attributes:nil
                             error:&error]) {
        if (error.code != NSFileWriteFileExistsError) {
            return @{@"error": [NSString stringWithFormat:@"Cannot create destination directory: %@", error.localizedDescription]};
        }
    }

    if (![fm moveItemAtPath:sourcePath toPath:destPath error:&error]) {
        return @{@"error": [NSString stringWithFormat:@"Cannot move: %@", error.localizedDescription]};
    }

    return @{
        @"from": sourcePath,
        @"to": destPath,
        @"moved": @YES
    };
}

#pragma mark - File Search

- (NSDictionary *)searchFiles:(NSString *)basePath
                         glob:(NSString *)globPattern
                   maxResults:(NSInteger)maxResults {
    NSString *base = [self canonicalisePath:basePath];
    NSFileManager *fm = [NSFileManager defaultManager];

    if (maxResults <= 0) {
        maxResults = 200;
    }

    if (!globPattern || globPattern.length == 0) {
        globPattern = @"**/*";
    }

    NSMutableArray *matches = [NSMutableArray array];

    // Convert glob pattern to regex
    NSString *regexPattern = [self globToRegex:globPattern];
    NSRegularExpression *regex = [NSRegularExpression regularExpressionWithPattern:regexPattern
                                                                           options:0
                                                                             error:nil];

    BOOL isRecursive = [globPattern containsString:@"**"];

    // Use directory enumerator for recursive search
    NSDirectoryEnumerator *enumerator = [fm enumeratorAtPath:base];
    NSString *relativePath;

    while ((relativePath = [enumerator nextObject]) && matches.count < maxResults) {
        NSString *fullPath = [base stringByAppendingPathComponent:relativePath];

        // Check if matches pattern
        NSRange matchRange = [regex rangeOfFirstMatchInString:relativePath
                                                      options:0
                                                        range:NSMakeRange(0, relativePath.length)];

        BOOL matchesPattern = (matchRange.location != NSNotFound);

        // Also check just the filename
        if (!matchesPattern) {
            NSString *filename = [relativePath lastPathComponent];
            matchRange = [regex rangeOfFirstMatchInString:filename
                                                  options:0
                                                    range:NSMakeRange(0, filename.length)];
            matchesPattern = (matchRange.location != NSNotFound);
        }

        if (matchesPattern) {
            BOOL isDir;
            [fm fileExistsAtPath:fullPath isDirectory:&isDir];

            [matches addObject:@{
                @"path": fullPath,
                @"type": isDir ? @"directory" : @"file"
            }];
        }

        // Skip subdirectories if not recursive
        if (!isRecursive) {
            NSDictionary *attrs = [enumerator fileAttributes];
            if ([attrs[NSFileType] isEqualToString:NSFileTypeDirectory]) {
                [enumerator skipDescendants];
            }
        }
    }

    return @{@"matches": matches};
}

- (NSString *)globToRegex:(NSString *)pattern {
    NSMutableString *regex = [NSMutableString string];

    for (NSUInteger i = 0; i < pattern.length; i++) {
        unichar c = [pattern characterAtIndex:i];

        if (c == '*') {
            // Check for **
            if (i + 1 < pattern.length && [pattern characterAtIndex:i + 1] == '*') {
                [regex appendString:@".*"];
                i++; // Skip second *
            } else {
                [regex appendString:@"[^/]*"];
            }
        } else if (c == '?') {
            [regex appendString:@"."];
        } else if (c == '.') {
            [regex appendString:@"\\."];
        } else if (c == '[' || c == ']' || c == '(' || c == ')' ||
                   c == '{' || c == '}' || c == '^' || c == '$' ||
                   c == '+' || c == '|' || c == '\\') {
            [regex appendFormat:@"\\%c", c];
        } else {
            [regex appendFormat:@"%c", c];
        }
    }

    return regex;
}

- (NSDictionary *)grepFiles:(NSString *)basePath
                    pattern:(NSString *)pattern
                       glob:(NSString *)globPattern
                 maxMatches:(NSInteger)maxMatches {
    NSString *base = [self canonicalisePath:basePath];

    if (maxMatches <= 0) {
        maxMatches = 200;
    }

    // Try ripgrep first, fall back to grep
    NSDictionary *result = [self grepWithRipgrep:base
                                         pattern:pattern
                                            glob:globPattern
                                      maxMatches:maxMatches];

    if (result[@"error"] && [result[@"error"] containsString:@"rg not found"]) {
        result = [self grepWithGrep:base
                            pattern:pattern
                               glob:globPattern
                         maxMatches:maxMatches];
    }

    return result;
}

- (NSDictionary *)grepWithRipgrep:(NSString *)basePath
                          pattern:(NSString *)pattern
                             glob:(NSString *)globPattern
                       maxMatches:(NSInteger)maxMatches {
    NSMutableArray *matches = [NSMutableArray array];

    // Check if ripgrep is available
    NSTask *whichTask = [[NSTask alloc] init];
    whichTask.launchPath = @"/usr/bin/which";
    whichTask.arguments = @[@"rg"];
    whichTask.standardOutput = [NSPipe pipe];
    whichTask.standardError = [NSPipe pipe];

    NSError *error = nil;
    [whichTask launchAndReturnError:&error];
    if (error) {
        return @{@"error": @"rg not found"};
    }
    [whichTask waitUntilExit];

    if (whichTask.terminationStatus != 0) {
        return @{@"error": @"rg not found"};
    }

    // Get rg path
    NSData *rgPathData = [[whichTask.standardOutput fileHandleForReading] readDataToEndOfFile];
    NSString *rgPath = [[NSString alloc] initWithData:rgPathData encoding:NSUTF8StringEncoding];
    rgPath = [rgPath stringByTrimmingCharactersInSet:[NSCharacterSet whitespaceAndNewlineCharacterSet]];

    // Build rg command
    NSMutableArray *args = [NSMutableArray arrayWithArray:@[@"--json", @"--no-heading", pattern, basePath]];
    if (globPattern && globPattern.length > 0) {
        [args insertObject:@"-g" atIndex:0];
        [args insertObject:globPattern atIndex:1];
    }

    NSTask *task = [[NSTask alloc] init];
    task.launchPath = rgPath;
    task.arguments = args;
    task.standardOutput = [NSPipe pipe];
    task.standardError = [NSPipe pipe];

    [task launchAndReturnError:&error];
    if (error) {
        return @{@"error": [NSString stringWithFormat:@"Failed to run rg: %@", error.localizedDescription]};
    }
    [task waitUntilExit];

    // Parse JSON output
    NSData *outputData = [[task.standardOutput fileHandleForReading] readDataToEndOfFile];
    NSString *output = [[NSString alloc] initWithData:outputData encoding:NSUTF8StringEncoding];

    NSArray *lines = [output componentsSeparatedByString:@"\n"];
    for (NSString *line in lines) {
        if (matches.count >= maxMatches) break;
        if (line.length == 0) continue;

        NSData *jsonData = [line dataUsingEncoding:NSUTF8StringEncoding];
        NSDictionary *json = [NSJSONSerialization JSONObjectWithData:jsonData options:0 error:nil];

        if (json && [json[@"type"] isEqualToString:@"match"]) {
            NSDictionary *data = json[@"data"];
            NSString *path = data[@"path"][@"text"];
            NSNumber *lineNum = data[@"line_number"];
            NSString *text = [data[@"lines"][@"text"] stringByTrimmingCharactersInSet:
                              [NSCharacterSet whitespaceAndNewlineCharacterSet]];

            NSMutableDictionary *match = [NSMutableDictionary dictionary];
            match[@"path"] = path ?: @"";
            match[@"line"] = lineNum ?: @0;
            match[@"text"] = text ?: @"";

            NSArray *submatches = data[@"submatches"];
            if (submatches.count > 0) {
                match[@"column"] = submatches[0][@"start"];
            }

            [matches addObject:match];
        }
    }

    return @{@"matches": matches};
}

- (NSDictionary *)grepWithGrep:(NSString *)basePath
                       pattern:(NSString *)pattern
                          glob:(NSString *)globPattern
                    maxMatches:(NSInteger)maxMatches {
    NSMutableArray *matches = [NSMutableArray array];

    // Build grep command
    NSMutableString *command = [NSMutableString stringWithFormat:@"grep -rn \"%@\" \"%@\"",
                                [pattern stringByReplacingOccurrencesOfString:@"\"" withString:@"\\\""],
                                basePath];

    if (globPattern && globPattern.length > 0) {
        // Extract extension from glob if possible
        NSRange extRange = [globPattern rangeOfString:@"." options:NSBackwardsSearch];
        if (extRange.location != NSNotFound) {
            NSString *ext = [globPattern substringFromIndex:extRange.location + 1];
            if (ext.length > 0 && ![ext containsString:@"*"]) {
                [command appendFormat:@" --include=\"*.%@\"", ext];
            }
        }
    }

    NSTask *task = [[NSTask alloc] init];
    task.launchPath = @"/bin/sh";
    task.arguments = @[@"-c", command];
    task.standardOutput = [NSPipe pipe];
    task.standardError = [NSPipe pipe];

    NSError *error = nil;
    [task launchAndReturnError:&error];
    if (error) {
        return @{@"error": [NSString stringWithFormat:@"Failed to run grep: %@", error.localizedDescription]};
    }
    [task waitUntilExit];

    // Parse output
    NSData *outputData = [[task.standardOutput fileHandleForReading] readDataToEndOfFile];
    NSString *output = [[NSString alloc] initWithData:outputData encoding:NSUTF8StringEncoding];

    NSArray *lines = [output componentsSeparatedByString:@"\n"];
    for (NSString *line in lines) {
        if (matches.count >= maxMatches) break;
        if (line.length == 0) continue;

        // Parse grep output: path:line:content
        NSRegularExpression *regex = [NSRegularExpression regularExpressionWithPattern:@"^([^:]+):(\\d+):(.+)$"
                                                                               options:0
                                                                                 error:nil];
        NSTextCheckingResult *match = [regex firstMatchInString:line options:0 range:NSMakeRange(0, line.length)];

        if (match && match.numberOfRanges >= 4) {
            NSString *path = [line substringWithRange:[match rangeAtIndex:1]];
            NSString *lineNumStr = [line substringWithRange:[match rangeAtIndex:2]];
            NSString *text = [line substringWithRange:[match rangeAtIndex:3]];

            [matches addObject:@{
                @"path": path,
                @"line": @([lineNumStr integerValue]),
                @"text": text
            }];
        }
    }

    return @{@"matches": matches};
}

#pragma mark - File Patching

- (NSDictionary *)patchFile:(NSString *)path
                 operations:(NSArray<NSDictionary *> *)operations
                     dryRun:(BOOL)dryRun {
    NSString *filePath = [self canonicalisePath:path];

    NSError *error = nil;
    NSString *content = [NSString stringWithContentsOfFile:filePath
                                                  encoding:NSUTF8StringEncoding
                                                     error:&error];
    if (!content) {
        content = [NSString stringWithContentsOfFile:filePath
                                            encoding:NSISOLatin1StringEncoding
                                               error:&error];
    }
    if (!content) {
        return @{@"error": [NSString stringWithFormat:@"Cannot read file: %@", error.localizedDescription]};
    }

    NSMutableArray *lines = [[content componentsSeparatedByString:@"\n"] mutableCopy];
    NSInteger operationsApplied = 0;
    NSMutableArray *preview = [NSMutableArray array];

    for (NSDictionary *op in operations) {
        NSString *type = op[@"type"];
        BOOL changed = NO;
        NSString *beforeExcerpt = @"";
        NSString *afterExcerpt = @"";

        if ([type isEqualToString:@"replace_first"]) {
            NSString *pattern = op[@"pattern"];
            NSString *replacement = op[@"replacement"];

            if (!pattern || !replacement) {
                [preview addObject:@{@"operation": type, @"changed": @NO, @"error": @"pattern and replacement required"}];
                continue;
            }

            NSRegularExpression *regex = [NSRegularExpression regularExpressionWithPattern:pattern
                                                                                   options:0
                                                                                     error:nil];

            for (NSInteger i = 0; i < lines.count; i++) {
                NSString *line = lines[i];
                NSRange matchRange = [regex rangeOfFirstMatchInString:line options:0 range:NSMakeRange(0, line.length)];

                if (matchRange.location != NSNotFound) {
                    beforeExcerpt = line;
                    lines[i] = [regex stringByReplacingMatchesInString:line
                                                               options:0
                                                                 range:NSMakeRange(0, line.length)
                                                          withTemplate:replacement];
                    afterExcerpt = lines[i];
                    changed = YES;
                    operationsApplied++;
                    break;
                }
            }
        }
        else if ([type isEqualToString:@"replace_all"]) {
            NSString *pattern = op[@"pattern"];
            NSString *replacement = op[@"replacement"];

            if (!pattern || !replacement) {
                [preview addObject:@{@"operation": type, @"changed": @NO, @"error": @"pattern and replacement required"}];
                continue;
            }

            NSRegularExpression *regex = [NSRegularExpression regularExpressionWithPattern:pattern
                                                                                   options:0
                                                                                     error:nil];
            BOOL firstFound = NO;

            for (NSInteger i = 0; i < lines.count; i++) {
                NSString *line = lines[i];
                NSRange matchRange = [regex rangeOfFirstMatchInString:line options:0 range:NSMakeRange(0, line.length)];

                if (matchRange.location != NSNotFound) {
                    if (!firstFound) {
                        beforeExcerpt = line;
                    }
                    lines[i] = [regex stringByReplacingMatchesInString:line
                                                               options:0
                                                                 range:NSMakeRange(0, line.length)
                                                          withTemplate:replacement];
                    if (!firstFound) {
                        afterExcerpt = lines[i];
                        firstFound = YES;
                    }
                    changed = YES;
                }
            }

            if (changed) {
                operationsApplied++;
            }
        }
        else if ([type isEqualToString:@"insert_after"]) {
            NSString *match = op[@"match"];
            NSString *insert = op[@"insert"];

            if (!match || !insert) {
                [preview addObject:@{@"operation": type, @"changed": @NO, @"error": @"match and insert required"}];
                continue;
            }

            NSRegularExpression *regex = [NSRegularExpression regularExpressionWithPattern:match
                                                                                   options:0
                                                                                     error:nil];

            for (NSInteger i = 0; i < lines.count; i++) {
                NSString *line = lines[i];
                NSRange matchRange = [regex rangeOfFirstMatchInString:line options:0 range:NSMakeRange(0, line.length)];

                if (matchRange.location != NSNotFound) {
                    beforeExcerpt = line;
                    [lines insertObject:insert atIndex:i + 1];
                    afterExcerpt = [NSString stringWithFormat:@"%@\n%@", line, insert];
                    changed = YES;
                    operationsApplied++;
                    break;
                }
            }
        }
        else if ([type isEqualToString:@"insert_before"]) {
            NSString *match = op[@"match"];
            NSString *insert = op[@"insert"];

            if (!match || !insert) {
                [preview addObject:@{@"operation": type, @"changed": @NO, @"error": @"match and insert required"}];
                continue;
            }

            NSRegularExpression *regex = [NSRegularExpression regularExpressionWithPattern:match
                                                                                   options:0
                                                                                     error:nil];

            for (NSInteger i = 0; i < lines.count; i++) {
                NSString *line = lines[i];
                NSRange matchRange = [regex rangeOfFirstMatchInString:line options:0 range:NSMakeRange(0, line.length)];

                if (matchRange.location != NSNotFound) {
                    beforeExcerpt = line;
                    [lines insertObject:insert atIndex:i];
                    afterExcerpt = [NSString stringWithFormat:@"%@\n%@", insert, line];
                    changed = YES;
                    operationsApplied++;
                    break;
                }
            }
        }

        NSMutableDictionary *previewEntry = [NSMutableDictionary dictionary];
        previewEntry[@"operation"] = type;
        previewEntry[@"changed"] = @(changed);
        if (changed) {
            previewEntry[@"before_excerpt"] = beforeExcerpt;
            previewEntry[@"after_excerpt"] = afterExcerpt;
        }
        [preview addObject:previewEntry];
    }

    if (!dryRun && operationsApplied > 0) {
        NSString *newContent = [lines componentsJoinedByString:@"\n"];
        NSError *writeError = nil;
        if (![newContent writeToFile:filePath atomically:YES encoding:NSUTF8StringEncoding error:&writeError]) {
            return @{@"error": [NSString stringWithFormat:@"Cannot write file: %@", writeError.localizedDescription]};
        }
    }

    NSMutableDictionary *result = [NSMutableDictionary dictionary];
    result[@"path"] = filePath;
    result[@"operations_applied"] = @(operationsApplied);
    if (dryRun) {
        result[@"preview"] = preview;
    }

    return result;
}

@end
