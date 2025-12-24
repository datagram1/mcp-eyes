# Filesystem & Shell Tools

ScreenControl provides filesystem and shell command execution tools for file operations and system automation.

## Filesystem Tools

All filesystem tools are prefixed with `fs_` and provide cross-platform file operations.

### fs_list

List directory contents.

```javascript
fs_list({ path: "/Users/me/Documents" })
// Returns: [{ name, type, size, modified }, ...]
```

**Parameters**:
| Parameter | Type | Description |
|-----------|------|-------------|
| `path` | string | Directory path to list |

**When to use**: Exploring file structure, finding files, directory navigation.

### fs_read

Read file contents.

```javascript
fs_read({ path: "/path/to/file.txt" })
// Returns: { content: "file contents..." }
```

**Parameters**:
| Parameter | Type | Description |
|-----------|------|-------------|
| `path` | string | File path to read |

**When to use**: Reading text files, configs, logs, source code.

### fs_read_range

Read specific lines from a file.

```javascript
fs_read_range({ path: "/path/to/file.txt", start_line: 10, end_line: 20 })
```

**Parameters**:
| Parameter | Type | Description |
|-----------|------|-------------|
| `path` | string | File path |
| `start_line` | number | Starting line number |
| `end_line` | number | Ending line number |

**When to use**: Reading portions of large files, viewing specific sections.

### fs_write

Write content to a file.

```javascript
fs_write({ path: "/path/to/file.txt", content: "Hello, World!" })
fs_write({ path: "/path/to/new/file.txt", content: "data", create_directories: true })
```

**Parameters**:
| Parameter | Type | Description |
|-----------|------|-------------|
| `path` | string | File path to write |
| `content` | string | Content to write |
| `create_directories` | boolean | Create parent directories if needed |

**When to use**: Creating files, saving data, writing configs.

### fs_delete

Delete a file or directory.

```javascript
fs_delete({ path: "/path/to/file.txt" })
fs_delete({ path: "/path/to/directory", recursive: true })
```

**Parameters**:
| Parameter | Type | Description |
|-----------|------|-------------|
| `path` | string | Path to delete |
| `recursive` | boolean | Delete directories recursively |

**When to use**: Cleanup, removing temporary files, deleting old data.

### fs_move

Move or rename a file.

```javascript
fs_move({ source: "/path/from/file.txt", destination: "/path/to/file.txt" })
```

**Parameters**:
| Parameter | Type | Description |
|-----------|------|-------------|
| `source` | string | Source path |
| `destination` | string | Destination path |

**When to use**: Renaming files, organizing, moving between directories.

### fs_search

Search for files by pattern (glob).

```javascript
fs_search({ path: "/Users/me", pattern: "*.txt" })
fs_search({ path: "/project", pattern: "**/*.js", max_depth: 3 })
```

**Parameters**:
| Parameter | Type | Description |
|-----------|------|-------------|
| `path` | string | Directory to search |
| `pattern` | string | Glob pattern |
| `max_depth` | number | Maximum directory depth |

**When to use**: Finding files by name pattern, locating specific file types.

### fs_grep

Search file contents with regex.

```javascript
fs_grep({ path: "/project", pattern: "TODO" })
fs_grep({ path: "/logs", pattern: "error", case_sensitive: false })
```

**Parameters**:
| Parameter | Type | Description |
|-----------|------|-------------|
| `path` | string | Directory or file to search |
| `pattern` | string | Regex pattern |
| `case_sensitive` | boolean | Case-sensitive matching |

**When to use**: Finding text within files, searching code, log analysis.

### fs_patch

Apply patch operations to a file.

```javascript
fs_patch({
  path: "/path/to/file.txt",
  operations: [
    { op: "replace", line: 5, content: "new content" },
    { op: "insert", line: 10, content: "inserted line" }
  ]
})

// Preview changes
fs_patch({
  path: "/path/to/file.txt",
  operations: [...],
  dry_run: true
})
```

**Parameters**:
| Parameter | Type | Description |
|-----------|------|-------------|
| `path` | string | File to patch |
| `operations` | array | Patch operations |
| `dry_run` | boolean | Preview without applying |

**When to use**: Programmatic file modifications, batch edits.

## Shell Tools

Shell tools provide command execution capabilities.

### shell_exec

Execute a shell command and get output.

```javascript
shell_exec({ command: "ls -la" })
shell_exec({ command: "npm install", cwd: "/project" })
shell_exec({ command: "long-task", timeout_seconds: 300 })
```

**Parameters**:
| Parameter | Type | Description |
|-----------|------|-------------|
| `command` | string | Command to execute |
| `cwd` | string | Working directory |
| `timeout_seconds` | number | Timeout in seconds |
| `capture_stderr` | boolean | Include stderr in output |

**Returns**:
```javascript
{
  stdout: "command output",
  stderr: "error output",
  exitCode: 0
}
```

**When to use**: Running scripts, system commands, build tools, one-off operations.

### shell_start_session

Start an interactive shell session.

```javascript
shell_start_session({ command: "python" })
shell_start_session({ command: "node", cwd: "/project" })
```

**Parameters**:
| Parameter | Type | Description |
|-----------|------|-------------|
| `command` | string | Command to start |
| `cwd` | string | Working directory |
| `env` | object | Environment variables |
| `capture_stderr` | boolean | Capture stderr |

**Returns**:
```javascript
{
  session_id: "abc123",
  status: "running"
}
```

**When to use**: Long-running processes, interactive commands, REPLs.

### shell_send_input

Send input to a running shell session.

```javascript
shell_send_input({ session_id: "abc123", input: "print('hello')\n" })
```

**Parameters**:
| Parameter | Type | Description |
|-----------|------|-------------|
| `session_id` | string | Session ID from shell_start_session |
| `input` | string | Input to send (include \n for Enter) |

**When to use**: Interacting with running processes, providing input.

### shell_stop_session

Stop a shell session.

```javascript
shell_stop_session({ session_id: "abc123" })
shell_stop_session({ session_id: "abc123", signal: "KILL" })
```

**Parameters**:
| Parameter | Type | Description |
|-----------|------|-------------|
| `session_id` | string | Session ID to stop |
| `signal` | string | Signal to send (default: TERM) |

**When to use**: Ending interactive sessions, killing stuck processes.

## Common Workflows

### Find and Read Files

```javascript
// Find all JavaScript files
const files = fs_search({ path: "/project/src", pattern: "**/*.js" })

// Read a specific file
const content = fs_read({ path: "/project/src/index.js" })
```

### Search and Edit

```javascript
// Find files containing "TODO"
const results = fs_grep({ path: "/project", pattern: "TODO" })

// Read and modify a file
const content = fs_read({ path: "/project/config.json" })
const modified = content.replace("old", "new")
fs_write({ path: "/project/config.json", content: modified })
```

### Run Build Commands

```javascript
// Install dependencies
shell_exec({ command: "npm install", cwd: "/project" })

// Run tests
const result = shell_exec({ command: "npm test", cwd: "/project" })
if (result.exitCode !== 0) {
  console.log("Tests failed:", result.stderr)
}

// Build project
shell_exec({ command: "npm run build", cwd: "/project" })
```

### Interactive REPL

```javascript
// Start Python session
const session = shell_start_session({ command: "python3" })

// Run commands
shell_send_input({ session_id: session.session_id, input: "x = 5\n" })
shell_send_input({ session_id: session.session_id, input: "print(x * 2)\n" })

// End session
shell_stop_session({ session_id: session.session_id })
```

### File Organization

```javascript
// Create directory structure
fs_write({
  path: "/project/new/dir/file.txt",
  content: "data",
  create_directories: true
})

// Move files
fs_move({ source: "/temp/report.pdf", destination: "/docs/report.pdf" })

// Cleanup
fs_delete({ path: "/temp", recursive: true })
```

## Best Practices

1. **Check before overwrite**: Use `fs_read` to check file exists before `fs_write`.

2. **Use dry_run for patches**: Test `fs_patch` with `dry_run: true` first.

3. **Set timeouts**: Long-running commands should have appropriate `timeout_seconds`.

4. **Handle errors**: Check `exitCode` from `shell_exec` to detect failures.

5. **Clean up sessions**: Always call `shell_stop_session` when done with interactive sessions.

6. **Use absolute paths**: Prefer absolute paths over relative for reliability.

## Security Notes

- File operations respect system permissions
- Shell commands run with the permissions of the ScreenControl service
- Be cautious with `recursive: true` on delete operations
- Avoid running untrusted commands via `shell_exec`
