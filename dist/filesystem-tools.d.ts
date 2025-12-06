#!/usr/bin/env node
/**
 * Filesystem Tools
 *
 * Implements filesystem primitives for MCP agent:
 * - fs_list: List files and directories
 * - fs_read: Read file contents (with size limit)
 * - fs_read_range: Read file segment by line range
 * - fs_write: Create or overwrite a file
 * - fs_delete: Delete a file or directory
 * - fs_move: Move or rename a file/directory
 * - fs_search: Find files by pattern (glob)
 * - fs_grep: Search within files (ripgrep wrapper)
 * - fs_patch: Apply focused transformations to a file
 */
export declare class FilesystemTools {
    /**
     * Canonicalise path (resolve to absolute path)
     * No baseDir enforcement - full access as per PRD
     */
    private canonicalisePath;
    /**
     * fs_list: List files and directories at or under a given path
     */
    listDirectory(params: {
        path: string;
        recursive?: boolean;
        max_depth?: number;
    }): Promise<{
        entries: Array<{
            path: string;
            type: 'file' | 'directory';
            size?: number;
            modified?: string;
        }>;
    }>;
    /**
     * fs_read: Read the contents of a file (with size limit)
     */
    readFile(params: {
        path: string;
        max_bytes?: number;
    }): Promise<{
        path: string;
        content: string;
        truncated?: boolean;
        size?: number;
    }>;
    /**
     * fs_read_range: Read a file segment by line range (1-based, inclusive)
     */
    readFileRange(params: {
        path: string;
        start_line: number;
        end_line: number;
    }): Promise<{
        path: string;
        start_line: number;
        end_line: number;
        content: string;
        total_lines?: number;
    }>;
    /**
     * fs_write: Create or overwrite a file
     */
    writeFile(params: {
        path: string;
        content: string;
        create_dirs?: boolean;
        mode?: 'overwrite' | 'append' | 'create_if_missing';
    }): Promise<{
        path: string;
        bytes_written: number;
    }>;
    /**
     * fs_delete: Delete a file or directory
     */
    deletePath(params: {
        path: string;
        recursive?: boolean;
    }): Promise<{
        path: string;
        deleted: boolean;
    }>;
    /**
     * fs_move: Move or rename a file or directory
     */
    movePath(params: {
        from: string;
        to: string;
    }): Promise<{
        from: string;
        to: string;
        moved: boolean;
    }>;
    /**
     * fs_search: Find files by pattern (glob)
     * Uses fast-glob if available, falls back to manual traversal
     */
    searchFiles(params: {
        base: string;
        glob?: string;
        max_results?: number;
    }): Promise<{
        matches: Array<{
            path: string;
            type: 'file' | 'directory';
        }>;
    }>;
    /**
     * Manual glob search fallback (simplified implementation)
     */
    private _manualGlobSearch;
    /**
     * Convert glob pattern to regex (simplified)
     */
    private _globToRegex;
    /**
     * fs_grep: Search within files (ripgrep wrapper)
     */
    grepFiles(params: {
        base: string;
        pattern: string;
        glob?: string;
        max_matches?: number;
    }): Promise<{
        matches: Array<{
            path: string;
            line: number;
            text: string;
            column?: number;
        }>;
    }>;
    /**
     * Use ripgrep for searching
     */
    private _grepWithRipgrep;
    /**
     * Fallback to grep for searching
     */
    private _grepWithGrep;
    /**
     * fs_patch: Apply focused transformations to a file
     */
    patchFile(params: {
        path: string;
        operations: Array<{
            type: 'replace_first' | 'replace_all' | 'insert_after' | 'insert_before';
            pattern?: string;
            match?: string;
            replacement?: string;
            insert?: string;
        }>;
        dry_run?: boolean;
    }): Promise<{
        path: string;
        operations_applied: number;
        preview?: Array<{
            operation: string;
            changed: boolean;
            before_excerpt?: string;
            after_excerpt?: string;
        }>;
    }>;
}
//# sourceMappingURL=filesystem-tools.d.ts.map