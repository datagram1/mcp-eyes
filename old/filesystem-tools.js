#!/usr/bin/env node
"use strict";
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
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.FilesystemTools = void 0;
const fs = __importStar(require("fs/promises"));
const path = __importStar(require("path"));
const child_process_1 = require("child_process");
const util_1 = require("util");
const execAsync = (0, util_1.promisify)(child_process_1.exec);
class FilesystemTools {
    /**
     * Canonicalise path (resolve to absolute path)
     * No baseDir enforcement - full access as per PRD
     */
    canonicalisePath(inputPath) {
        return path.resolve(inputPath);
    }
    /**
     * fs_list: List files and directories at or under a given path
     */
    async listDirectory(params) {
        const dirPath = this.canonicalisePath(params.path);
        const recursive = params.recursive ?? false;
        const maxDepth = params.max_depth ?? 3;
        const entries = [];
        async function traverse(currentPath, depth) {
            if (depth > maxDepth) {
                return;
            }
            try {
                const items = await fs.readdir(currentPath, { withFileTypes: true });
                for (const item of items) {
                    const fullPath = path.join(currentPath, item.name);
                    const stats = await fs.stat(fullPath);
                    if (item.isDirectory()) {
                        entries.push({
                            path: fullPath,
                            type: 'directory',
                            modified: stats.mtime.toISOString(),
                        });
                        if (recursive && depth < maxDepth) {
                            await traverse(fullPath, depth + 1);
                        }
                    }
                    else if (item.isFile()) {
                        entries.push({
                            path: fullPath,
                            type: 'file',
                            size: stats.size,
                            modified: stats.mtime.toISOString(),
                        });
                    }
                }
            }
            catch (error) {
                // Skip directories we can't read
                if (error.code !== 'EACCES' && error.code !== 'EPERM') {
                    throw error;
                }
            }
        }
        await traverse(dirPath, 0);
        return { entries };
    }
    /**
     * fs_read: Read the contents of a file (with size limit)
     */
    async readFile(params) {
        const filePath = this.canonicalisePath(params.path);
        const maxBytes = params.max_bytes ?? 131072; // Default 128KB
        const stats = await fs.stat(filePath);
        const fileSize = stats.size;
        let content;
        let truncated = false;
        if (fileSize > maxBytes) {
            const buffer = Buffer.alloc(maxBytes);
            const fd = await fs.open(filePath, 'r');
            await fd.read(buffer, 0, maxBytes, 0);
            await fd.close();
            content = buffer.toString('utf-8');
            truncated = true;
        }
        else {
            content = await fs.readFile(filePath, 'utf-8');
        }
        return {
            path: filePath,
            content,
            truncated,
            size: fileSize,
        };
    }
    /**
     * fs_read_range: Read a file segment by line range (1-based, inclusive)
     */
    async readFileRange(params) {
        const filePath = this.canonicalisePath(params.path);
        const startLine = params.start_line;
        const endLine = params.end_line;
        if (startLine > endLine) {
            throw new Error(`start_line (${startLine}) must be <= end_line (${endLine})`);
        }
        if (startLine < 1) {
            throw new Error(`start_line must be >= 1`);
        }
        const content = await fs.readFile(filePath, 'utf-8');
        const lines = content.split(/\r?\n/);
        const totalLines = lines.length;
        if (startLine > totalLines) {
            throw new Error(`start_line (${startLine}) exceeds file length (${totalLines} lines)`);
        }
        const actualEndLine = Math.min(endLine, totalLines);
        const selectedLines = lines.slice(startLine - 1, actualEndLine);
        const selectedContent = selectedLines.join('\n');
        return {
            path: filePath,
            start_line: startLine,
            end_line: actualEndLine,
            content: selectedContent,
            total_lines: totalLines,
        };
    }
    /**
     * fs_write: Create or overwrite a file
     */
    async writeFile(params) {
        const filePath = this.canonicalisePath(params.path);
        const createDirs = params.create_dirs ?? true;
        const mode = params.mode ?? 'overwrite';
        // Create parent directories if needed
        if (createDirs) {
            const dir = path.dirname(filePath);
            await fs.mkdir(dir, { recursive: true });
        }
        // Check if file exists
        let fileExists = false;
        try {
            await fs.access(filePath);
            fileExists = true;
        }
        catch {
            // File doesn't exist
        }
        if (mode === 'create_if_missing' && fileExists) {
            throw new Error(`File ${filePath} already exists`);
        }
        let bytesWritten;
        if (mode === 'append' && fileExists) {
            await fs.appendFile(filePath, params.content, 'utf-8');
            bytesWritten = Buffer.byteLength(params.content, 'utf-8');
        }
        else {
            await fs.writeFile(filePath, params.content, 'utf-8');
            bytesWritten = Buffer.byteLength(params.content, 'utf-8');
        }
        return {
            path: filePath,
            bytes_written: bytesWritten,
        };
    }
    /**
     * fs_delete: Delete a file or directory
     */
    async deletePath(params) {
        const targetPath = this.canonicalisePath(params.path);
        const recursive = params.recursive ?? false;
        const stats = await fs.stat(targetPath);
        if (stats.isDirectory()) {
            if (recursive) {
                await fs.rm(targetPath, { recursive: true, force: true });
            }
            else {
                // Check if directory is empty
                const entries = await fs.readdir(targetPath);
                if (entries.length > 0) {
                    throw new Error(`Directory ${targetPath} is not empty. Use recursive: true to delete.`);
                }
                await fs.rmdir(targetPath);
            }
        }
        else {
            await fs.unlink(targetPath);
        }
        return {
            path: targetPath,
            deleted: true,
        };
    }
    /**
     * fs_move: Move or rename a file or directory
     */
    async movePath(params) {
        const fromPath = this.canonicalisePath(params.from);
        const toPath = this.canonicalisePath(params.to);
        // Create parent directories of destination if needed
        const toDir = path.dirname(toPath);
        await fs.mkdir(toDir, { recursive: true });
        await fs.rename(fromPath, toPath);
        return {
            from: fromPath,
            to: toPath,
            moved: true,
        };
    }
    /**
     * fs_search: Find files by pattern (glob)
     * Uses fast-glob if available, falls back to manual traversal
     */
    async searchFiles(params) {
        const basePath = this.canonicalisePath(params.base);
        const globPattern = params.glob || '**/*';
        const maxResults = params.max_results ?? 200;
        // Try to use fast-glob if available
        try {
            const fastGlob = require('fast-glob');
            const results = await fastGlob(globPattern, {
                cwd: basePath,
                absolute: true,
                onlyFiles: false,
                limit: maxResults,
            });
            const matches = [];
            for (const resultPath of results.slice(0, maxResults)) {
                try {
                    const stats = await fs.stat(resultPath);
                    matches.push({
                        path: resultPath,
                        type: stats.isDirectory() ? 'directory' : 'file',
                    });
                }
                catch {
                    // Skip files we can't stat
                }
            }
            return { matches };
        }
        catch (error) {
            // If fast-glob is not available, fall back to manual traversal
            if (error.code === 'MODULE_NOT_FOUND') {
                // Manual glob implementation (simplified)
                const matches = [];
                await this._manualGlobSearch(basePath, globPattern, matches, maxResults);
                return { matches };
            }
            throw error;
        }
    }
    /**
     * Manual glob search fallback (simplified implementation)
     */
    async _manualGlobSearch(basePath, pattern, matches, maxResults) {
        if (matches.length >= maxResults) {
            return;
        }
        try {
            const items = await fs.readdir(basePath, { withFileTypes: true });
            for (const item of items) {
                if (matches.length >= maxResults) {
                    break;
                }
                const fullPath = path.join(basePath, item.name);
                const relativePath = path.relative(basePath, fullPath);
                // Simple pattern matching (supports ** and *)
                const regex = this._globToRegex(pattern);
                if (regex.test(relativePath) || regex.test(item.name)) {
                    try {
                        const stats = await fs.stat(fullPath);
                        matches.push({
                            path: fullPath,
                            type: stats.isDirectory() ? 'directory' : 'file',
                        });
                    }
                    catch {
                        // Skip files we can't stat
                    }
                }
                if (item.isDirectory() && pattern.includes('**')) {
                    await this._manualGlobSearch(fullPath, pattern, matches, maxResults);
                }
            }
        }
        catch {
            // Skip directories we can't read
        }
    }
    /**
     * Convert glob pattern to regex (simplified)
     */
    _globToRegex(pattern) {
        const escaped = pattern
            .replace(/\./g, '\\.')
            .replace(/\*\*/g, '.*')
            .replace(/\*/g, '[^/]*');
        return new RegExp(`^${escaped}$`);
    }
    /**
     * fs_grep: Search within files (ripgrep wrapper)
     */
    async grepFiles(params) {
        const basePath = this.canonicalisePath(params.base);
        const pattern = params.pattern;
        const globPattern = params.glob;
        const maxMatches = params.max_matches ?? 200;
        // Check for ripgrep first
        try {
            await execAsync('which rg');
            return await this._grepWithRipgrep(basePath, pattern, globPattern, maxMatches);
        }
        catch {
            // Fallback to grep
            return await this._grepWithGrep(basePath, pattern, globPattern, maxMatches);
        }
    }
    /**
     * Use ripgrep for searching
     */
    async _grepWithRipgrep(basePath, pattern, globPattern, maxMatches) {
        const matches = [];
        const args = ['--json', '--no-heading', pattern, basePath];
        if (globPattern) {
            args.splice(-1, 0, '-g', globPattern);
        }
        try {
            const { stdout } = await execAsync(`rg ${args.join(' ')}`, {
                maxBuffer: 10 * 1024 * 1024, // 10MB buffer
            });
            const lines = stdout.split('\n').filter((line) => line.trim());
            for (const line of lines) {
                if (matches.length >= maxMatches) {
                    break;
                }
                try {
                    const json = JSON.parse(line);
                    if (json.type === 'match') {
                        matches.push({
                            path: json.data.path.text,
                            line: json.data.line_number,
                            text: json.data.lines.text.trim(),
                            column: json.data.submatches[0]?.start,
                        });
                    }
                }
                catch {
                    // Skip invalid JSON lines
                }
            }
        }
        catch (error) {
            // ripgrep returns non-zero exit code when no matches found
            if (error.code !== 1) {
                throw error;
            }
        }
        return { matches };
    }
    /**
     * Fallback to grep for searching
     */
    async _grepWithGrep(basePath, pattern, globPattern, maxMatches) {
        const matches = [];
        // Build grep command
        let command = `grep -rn "${pattern.replace(/"/g, '\\"')}" "${basePath}"`;
        if (globPattern) {
            // grep doesn't support glob patterns directly, so we'll search all files
            // and filter by extension if possible
            const extMatch = globPattern.match(/\.(\w+)$/);
            if (extMatch) {
                command += ` --include="*.${extMatch[1]}"`;
            }
        }
        try {
            const { stdout } = await execAsync(command, {
                maxBuffer: 10 * 1024 * 1024, // 10MB buffer
            });
            const lines = stdout.split('\n').filter((line) => line.trim());
            for (const line of lines) {
                if (matches.length >= maxMatches) {
                    break;
                }
                // Parse grep output: path:line:content
                const match = line.match(/^([^:]+):(\d+):(.+)$/);
                if (match) {
                    matches.push({
                        path: match[1],
                        line: parseInt(match[2], 10),
                        text: match[3],
                    });
                }
            }
        }
        catch (error) {
            // grep returns non-zero exit code when no matches found
            if (error.code !== 1) {
                throw error;
            }
        }
        return { matches };
    }
    /**
     * fs_patch: Apply focused transformations to a file
     */
    async patchFile(params) {
        const filePath = this.canonicalisePath(params.path);
        const operations = params.operations;
        const dryRun = params.dry_run ?? false;
        const content = await fs.readFile(filePath, 'utf-8');
        const lines = content.split(/\r?\n/);
        let modifiedLines = [...lines];
        let operationsApplied = 0;
        const preview = [];
        for (const op of operations) {
            let changed = false;
            let beforeExcerpt = '';
            let afterExcerpt = '';
            switch (op.type) {
                case 'replace_first': {
                    if (!op.pattern || !op.replacement) {
                        throw new Error('replace_first requires pattern and replacement');
                    }
                    const regex = new RegExp(op.pattern);
                    const matchIndex = modifiedLines.findIndex((line) => regex.test(line));
                    if (matchIndex >= 0) {
                        beforeExcerpt = modifiedLines[matchIndex];
                        modifiedLines[matchIndex] = modifiedLines[matchIndex].replace(regex, op.replacement);
                        afterExcerpt = modifiedLines[matchIndex];
                        changed = true;
                        operationsApplied++;
                    }
                    break;
                }
                case 'replace_all': {
                    if (!op.pattern || !op.replacement) {
                        throw new Error('replace_all requires pattern and replacement');
                    }
                    const regex = new RegExp(op.pattern, 'g');
                    let found = false;
                    for (let i = 0; i < modifiedLines.length; i++) {
                        if (regex.test(modifiedLines[i])) {
                            if (!found) {
                                beforeExcerpt = modifiedLines[i];
                            }
                            modifiedLines[i] = modifiedLines[i].replace(regex, op.replacement);
                            if (!found) {
                                afterExcerpt = modifiedLines[i];
                                found = true;
                            }
                            changed = true;
                        }
                    }
                    if (changed) {
                        operationsApplied++;
                    }
                    break;
                }
                case 'insert_after': {
                    if (!op.match || !op.insert) {
                        throw new Error('insert_after requires match and insert');
                    }
                    const regex = new RegExp(op.match);
                    const matchIndex = modifiedLines.findIndex((line) => regex.test(line));
                    if (matchIndex >= 0) {
                        beforeExcerpt = modifiedLines[matchIndex];
                        modifiedLines.splice(matchIndex + 1, 0, op.insert);
                        afterExcerpt = modifiedLines[matchIndex] + '\n' + op.insert;
                        changed = true;
                        operationsApplied++;
                    }
                    break;
                }
                case 'insert_before': {
                    if (!op.match || !op.insert) {
                        throw new Error('insert_before requires match and insert');
                    }
                    const regex = new RegExp(op.match);
                    const matchIndex = modifiedLines.findIndex((line) => regex.test(line));
                    if (matchIndex >= 0) {
                        beforeExcerpt = modifiedLines[matchIndex];
                        modifiedLines.splice(matchIndex, 0, op.insert);
                        afterExcerpt = op.insert + '\n' + modifiedLines[matchIndex + 1];
                        changed = true;
                        operationsApplied++;
                    }
                    break;
                }
            }
            preview.push({
                operation: op.type,
                changed,
                before_excerpt: changed ? beforeExcerpt : undefined,
                after_excerpt: changed ? afterExcerpt : undefined,
            });
        }
        if (!dryRun) {
            await fs.writeFile(filePath, modifiedLines.join('\n'), 'utf-8');
        }
        return {
            path: filePath,
            operations_applied: operationsApplied,
            preview: dryRun ? preview : undefined,
        };
    }
}
exports.FilesystemTools = FilesystemTools;
//# sourceMappingURL=filesystem-tools.js.map