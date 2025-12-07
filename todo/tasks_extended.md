# MCP Agent Extended - Implementation Tasks

> **Based on:** `todo/prd_extended.md`
> **Status:** Phase 4 Complete - Tool Registry Fully Integrated
> **Last Updated:** 2025-12-01

---

## Instructions for LLMs

**IMPORTANT:** When working on these tasks:

1. **Check off tasks as you complete them** - Change `[ ]` to `[x]` when a task is finished.
2. **Break down complex tasks** - If a task is too complicated, add subtasks with checkboxes.
3. **Document issues** - If you encounter problems or dependencies that block progress, add them to `./todo/issues.md`.
4. **Add stubs for incomplete work** - If something can't be completed due to missing dependencies, document it in `./todo/issues.md` for later completion.
5. **Test as you go** - Don't mark tasks complete until they're tested and working.
6. **Reference the PRD** - Consult `todo/prd_extended.md` for detailed specifications.

---

## Phase 1: Tool Registry Foundation

### Setup & Core Infrastructure

- [x] **Task 1.1:** Create `src/tool-registry.ts` file
  - [x] Define TypeScript interfaces: `ToolDefinition`, `ToolCategory`, `ToolProfile`, `ToolRegistryConfig`
  - [x] Create `ToolRegistry` class with constructor
  - [x] Implement config path resolution (macOS: `~/Library/Application Support/MCPEyes/tools.json`, fallback: `~/.mcp-eyes-tools.json`)

- [x] **Task 1.2:** Implement config loading/saving
  - [x] Implement `loadConfig()` method - load from `tools.json` or create default
  - [x] Implement `saveConfig()` method - write to `tools.json`
  - [x] Implement `createDefaultConfig()` - create default config structure
  - [x] Handle file I/O errors gracefully

- [x] **Task 1.3:** Implement core registry methods
  - [x] Implement `registerTool(tool: ToolDefinition)` - register a tool with the registry
  - [x] Implement `getEnabledTools()` - return only enabled tools from active profile
  - [x] Implement `getMCPToolDefinitions()` - convert to MCP tool format
  - [x] Implement `isToolEnabled(toolId: string)` - check if tool is enabled
  - [x] Implement `getTool(toolId: string)` - get tool definition by ID or name
  - [x] Implement `getCategoryLabel(categoryId: string)` - human-readable category labels
  - [x] Implement `getConfig()` - get current configuration (for UI)
  - [x] Implement `updateConfig(config: ToolRegistryConfig)` - update from UI

- [x] **Task 1.4:** Hook Tool Registry into MCPSSEServer
  - [x] Import `ToolRegistry` in `src/mcp-sse-server.ts`
  - [x] Add `private toolRegistry: ToolRegistry` property to `MCPSSEServer` class
  - [x] Initialize `ToolRegistry` in constructor
  - [x] Update `getToolDefinitions()` to use `toolRegistry.getMCPToolDefinitions()`
  - [x] Update `callTool()` to check `toolRegistry.isToolEnabled(name)` before execution
  - [x] Return clear error message if tool is disabled: `Tool ${name} is disabled`

- [x] **Task 1.5:** Register stub tools for testing
  - [x] Create `registerAllTools()` method in `MCPSSEServer`
  - [x] Register stub filesystem tools (9 tools with placeholder implementations)
  - [x] Register stub shell tools (4 tools with placeholder implementations)
  - [x] Call `registerAllTools()` in constructor after registry initialization

- [ ] **Task 1.6:** Test Tool Registry functionality
  - [ ] Test config file creation with default profile
  - [ ] Test enabling/disabling tools via config file
  - [ ] Test that only enabled tools appear in `getToolDefinitions()`
  - [ ] Test that disabled tools return error when called
  - [ ] Verify config file location (macOS vs other platforms)

**Deliverable:** Tool Registry working, tools can be toggled via `tools.json`

**Files Created:**
- `src/tool-registry.ts`

**Files Modified:**
- `src/mcp-sse-server.ts`

---

## Phase 2: Filesystem Primitives

### Filesystem Tools Implementation

- [x] **Task 2.1:** Create `src/filesystem-tools.ts` file
  - [x] Create `FilesystemTools` class
  - [x] Add necessary imports (`fs/promises`, `path`, `child_process`, `util`)
  - [x] Implement path validation helper (canonicalise with `path.resolve()`, no baseDir enforcement)

- [x] **Task 2.2:** Implement `fs_list` tool
  - [x] Implement `listDirectory(params)` method
  - [x] Support `path`, `recursive`, `max_depth` parameters
  - [x] Use `fs.readdir` with `withFileTypes` for efficient reading
  - [x] Return entries with `path`, `type`, `size` (for files), `modified` timestamp
  - [x] Respect `max_depth` for recursive traversal
  - [x] Register tool with Tool Registry

- [x] **Task 2.3:** Implement `fs_read` tool
  - [x] Implement `readFile(params)` method
  - [x] Support `path`, `max_bytes` parameters (default 131072)
  - [x] Read file with size limit
  - [x] Return `path`, `content`, `truncated` flag, `size`
  - [x] Handle file read errors gracefully
  - [x] Register tool with Tool Registry

- [x] **Task 2.4:** Implement `fs_read_range` tool
  - [x] Implement `readFileRange(params)` method
  - [x] Support `path`, `start_line`, `end_line` parameters (1-based, inclusive)
  - [x] Read file, split by newlines, return requested range
  - [x] Return `path`, `start_line`, `end_line`, `content`, `total_lines`
  - [x] Handle edge cases (start > end, out of bounds)
  - [x] Register tool with Tool Registry

- [x] **Task 2.5:** Implement `fs_write` tool
  - [x] Implement `writeFile(params)` method
  - [x] Support `path`, `content`, `create_dirs`, `mode` parameters
  - [x] Handle `mode`: `overwrite`, `append`, `create_if_missing`
  - [x] Create parent directories if `create_dirs: true`
  - [x] Return `path`, `bytes_written`
  - [x] Handle write errors and permission issues
  - [x] Register tool with Tool Registry

- [x] **Task 2.6:** Implement `fs_delete` tool
  - [x] Implement `deletePath(params)` method
  - [x] Support `path`, `recursive` parameters
  - [x] Delete file or directory
  - [x] If `recursive: true`, delete directory and all contents
  - [x] If `recursive: false` and directory, fail if not empty
  - [x] Return `path`, `deleted` flag
  - [x] Handle deletion errors
  - [x] Register tool with Tool Registry

- [x] **Task 2.7:** Implement `fs_move` tool
  - [x] Implement `movePath(params)` method
  - [x] Support `from`, `to` parameters
  - [x] Use `fs.rename()` or equivalent
  - [x] Create parent directories of destination if needed
  - [x] Return `from`, `to`, `moved` flag
  - [x] Handle move errors
  - [x] Register tool with Tool Registry

- [x] **Task 2.8:** Implement `fs_search` tool
  - [x] Install `glob` or `fast-glob` package (add to `package.json`)
  - [x] Implement `searchFiles(params)` method
  - [x] Support `base`, `glob`, `max_results` parameters
  - [x] Use glob package for pattern matching
  - [x] Respect `max_results` limit
  - [x] Return `matches` array with `path`, `type`
  - [x] Register tool with Tool Registry

- [x] **Task 2.9:** Implement `fs_grep` tool
  - [x] Implement `grepFiles(params)` method
  - [x] Support `base`, `pattern`, `glob`, `max_matches` parameters
  - [x] Check for `ripgrep` (`rg` command) in PATH
  - [x] If ripgrep available: use `rg --json` and parse JSON output
  - [x] If ripgrep not available: fallback to `grep` with text parsing
  - [x] Return `matches` array with `path`, `line`, `text`, `column` (if available)
  - [x] Respect `max_matches` limit
  - [x] Handle search errors gracefully
  - [x] Register tool with Tool Registry

- [x] **Task 2.10:** Implement `fs_patch` tool
  - [x] Implement `patchFile(params)` method
  - [x] Support `path`, `operations`, `dry_run` parameters
  - [x] Implement operation types:
    - [x] `replace_first` - replace first occurrence of pattern
    - [x] `replace_all` - replace all occurrences of pattern
    - [x] `insert_after` - insert text after matching line/pattern
    - [x] `insert_before` - insert text before matching line/pattern
  - [x] If `dry_run: true`, return preview without modifying file
  - [x] Return `path`, `operations_applied`, `preview` (if dry_run)
  - [x] Line-oriented implementation (read file, modify lines, write back)
  - [x] Handle patch errors
  - [x] Register tool with Tool Registry

- [x] **Task 2.11:** Wire filesystem tools into SSE server
  - [x] Add `private filesystemTools: FilesystemTools` property to `MCPSSEServer`
  - [x] Initialize `FilesystemTools` in constructor
  - [x] Create `handleFilesystemTool(name, args)` method
  - [x] Route each `fs_*` tool to appropriate `FilesystemTools` method
  - [x] Update `callTool()` to route `fs_*` tools to `handleFilesystemTool()`

- [ ] **Task 2.12:** Test filesystem tools
  - [ ] Test `fs_list` with various directory structures
  - [ ] Test `fs_read` with files of different sizes (small, large, over max_bytes)
  - [ ] Test `fs_read_range` with various line ranges
  - [ ] Test `fs_write` with all modes (overwrite, append, create_if_missing)
  - [ ] Test `fs_delete` with files and directories (recursive and non-recursive)
  - [ ] Test `fs_move` with files and directories
  - [ ] Test `fs_search` with various glob patterns
  - [ ] Test `fs_grep` with ripgrep (if available) and grep fallback
  - [ ] Test `fs_patch` with all operation types and dry_run mode
  - [ ] Test path canonicalisation (no baseDir enforcement)
  - [ ] Test error handling for all tools

**Deliverable:** All 9 filesystem tools implemented and working

**Files Created:**
- `src/filesystem-tools.ts`

**Files Modified:**
- `src/mcp-sse-server.ts`
- `src/tool-registry.ts` (register tools)
- `package.json` (add glob/fast-glob dependency)

**Dependencies:**
- Install `glob` or `fast-glob` package
- Check for `ripgrep` (`rg`) in PATH (preferred, but fallback to `grep`)

---

## Phase 3: Shell Primitives

### Shell Tools Implementation

- [x] **Task 3.1:** Create `src/shell-tools.ts` file
  - [x] Create `ShellTools` class extending `EventEmitter`
  - [x] Add necessary imports (`child_process`, `events`)
  - [x] Define `ShellSession` interface
  - [x] Create `Map<session_id, ShellSession>` for session management

- [x] **Task 3.2:** Implement `shell_exec` tool
  - [x] Implement `executeCommand(params)` method
  - [x] Support `command`, `cwd`, `timeout_seconds`, `capture_stderr` parameters
  - [x] Use `sh -c` on POSIX, `cmd.exe /c` on Windows
  - [x] Spawn process with `spawn()` or `exec()`
  - [x] Capture stdout and stderr
  - [x] Implement timeout (default 600 seconds)
  - [x] Return `exit_code`, `stdout`, `stderr`, `truncated` flag
  - [x] Handle command errors and timeouts
  - [x] Register tool with Tool Registry

- [x] **Task 3.3:** Implement `shell_start_session` tool
  - [x] Implement `startSession(params)` method
  - [x] Support `command`, `cwd`, `env`, `capture_stderr` parameters
  - [x] Generate unique `session_id` (e.g., `session_${Date.now()}_${random}`)
  - [x] Spawn process with `spawn()` (not `exec()`)
  - [x] Store session in Map with `session_id`
  - [x] Set up stdout/stderr listeners
  - [x] Emit `shell_session_output` events with `session_id`, `stream`, `chunk`
  - [x] Emit `shell_session_exit` event when process exits
  - [x] Return `session_id`, `pid`
  - [x] Handle spawn errors
  - [x] Register tool with Tool Registry

- [x] **Task 3.4:** Implement `shell_send_input` tool
  - [x] Implement `sendInput(sessionId, input)` method
  - [x] Look up session by `session_id`
  - [x] Write `input` to process stdin
  - [x] Return `session_id`, `bytes_written`
  - [x] Handle errors (session not found, stdin closed)
  - [x] Register tool with Tool Registry

- [x] **Task 3.5:** Implement `shell_stop_session` tool
  - [x] Implement `stopSession(sessionId, signal)` method
  - [x] Look up session by `session_id`
  - [x] Send signal to process (default `TERM`)
  - [x] Clean up session from Map
  - [x] Emit `shell_session_exit` event
  - [x] Return `session_id`, `stopped` flag
  - [x] Handle errors (session not found)
  - [x] Register tool with Tool Registry

- [x] **Task 3.6:** Implement session management features
  - [x] Add session timeout (1 hour) - auto-cleanup
  - [x] Add max concurrent sessions limit (10)
  - [x] Implement cleanup on client disconnect
  - [x] Track session metadata (startedAt, command, cwd)

- [x] **Task 3.7:** Wire shell tools into SSE server
  - [x] Add `private shellTools: ShellTools` property to `MCPSSEServer`
  - [x] Initialize `ShellTools` in constructor
  - [x] Set up event listeners for `shell_session_output` and `shell_session_exit`
  - [x] Create `broadcastSSE(eventType, data)` method
  - [x] Forward shell session events to all connected SSE clients
  - [x] Create `handleShellTool(name, args)` method
  - [x] Route each `shell_*` tool to appropriate `ShellTools` method
  - [x] Update `callTool()` to route `shell_*` tools to `handleShellTool()`

- [ ] **Task 3.8:** Test shell tools
  - [ ] Test `shell_exec` with simple commands
  - [ ] Test `shell_exec` with commands that produce stdout/stderr
  - [ ] Test `shell_exec` timeout handling
  - [ ] Test `shell_exec` with different `cwd` values
  - [ ] Test `shell_start_session` - start a long-running command
  - [ ] Test SSE event streaming for session output
  - [ ] Test `shell_send_input` - send input to interactive session
  - [ ] Test `shell_stop_session` - terminate session
  - [ ] Test parallel sessions (multiple sessions running simultaneously)
  - [ ] Test session cleanup on disconnect
  - [ ] Test max concurrent sessions limit
  - [ ] Test session timeout

**Deliverable:** All 4 shell tools implemented with SSE streaming support

**Files Created:**
- `src/shell-tools.ts`

**Files Modified:**
- `src/mcp-sse-server.ts`
- `src/tool-registry.ts` (register tools)

---

## Phase 4: Migrate Existing Tools to Registry

### Browser & GUI Tools Migration

- [x] **Task 4.1:** Register existing browser tools
  - [x] Identify all browser tools in current `getToolDefinitions()`
  - [x] Register each browser tool with Tool Registry:
    - [x] `browser_listConnected`
    - [x] `browser_getTabs`
    - [x] `browser_getActiveTab`
    - [x] `browser_getPageInfo`
    - [x] `browser_getInteractiveElements`
    - [x] `browser_clickElement`
    - [x] `browser_fillElement`
    - [x] `browser_executeScript`
    - [x] `browser_inspectCurrentPage`
    - [x] `browser_getUIElements`
    - [x] `browser_fillFormField`
  - [x] Set category to `browser`
  - [x] Ensure all tools have proper `id`, `name`, `description`, `inputSchema`

- [x] **Task 4.2:** Register existing GUI tools
  - [x] Identify all GUI/native tools in current `getToolDefinitions()`
  - [x] Register each GUI tool with Tool Registry:
    - [x] `listApplications`
    - [x] `focusApplication`
    - [x] `screenshot`
    - [x] `click`
    - [x] `getClickableElements`
    - [x] `typeText`
    - [x] `pressKey`
    - [x] `analyzeWithOCR`
    - [x] `checkPermissions`
  - [x] Set category to `gui`
  - [x] Ensure all tools have proper `id`, `name`, `description`, `inputSchema`

- [x] **Task 4.3:** Update `callTool()` routing
  - [x] Ensure browser tools route through registry check
  - [x] Ensure GUI tools route through registry check
  - [x] Remove hardcoded tool definitions from `getToolDefinitions()`
  - [x] Ensure all tools go through `toolRegistry.isToolEnabled()` check

- [x] **Task 4.4:** Test existing tools with registry
  - [x] Test that existing browser tools still work
  - [x] Test that existing GUI tools still work
  - [x] Test that tools can be disabled via config
  - [x] Test that disabled tools return proper error
  - [x] Verify all tools appear in config after registration

**Deliverable:** All tools go through Tool Registry ✅

**Files Modified:**
- `src/mcp-sse-server.ts`

**Test Results:**
- ✅ 33 total tools registered (9 filesystem, 4 shell, 9 GUI, 11 browser)
- ✅ Category-level disabling works (disabled shell category: 33 → 29 tools)
- ✅ Individual tool disabling works (disabled fs_delete, fs_write: 9 → 7 filesystem tools)
- ✅ All tools route through registry enable/disable check

---

## Phase 5: Testing & Validation

### Comprehensive Testing

- [ ] **Task 5.1:** Unit tests for Tool Registry
  - [ ] Create `tests/test-tool-registry.js`
  - [ ] Test config loading (existing file, new file)
  - [ ] Test config saving
  - [ ] Test `registerTool()`
  - [ ] Test `getEnabledTools()` - returns only enabled tools
  - [ ] Test `isToolEnabled()` - correctly identifies enabled/disabled tools
  - [ ] Test `getMCPToolDefinitions()` - correct format
  - [ ] Test category enable/disable
  - [ ] Test profile switching (if multiple profiles exist)

- [ ] **Task 5.2:** Unit tests for FilesystemTools
  - [ ] Create `tests/test-filesystem-tools.js`
  - [ ] Test `fs_list` with various scenarios
  - [ ] Test `fs_read` with size limits
  - [ ] Test `fs_read_range` with line ranges
  - [ ] Test `fs_write` with all modes
  - [ ] Test `fs_delete` with files and directories
  - [ ] Test `fs_move` functionality
  - [ ] Test `fs_search` with glob patterns
  - [ ] Test `fs_grep` with ripgrep and grep fallback
  - [ ] Test `fs_patch` with all operation types
  - [ ] Test path canonicalisation
  - [ ] Test error handling

- [ ] **Task 5.3:** Unit tests for ShellTools
  - [ ] Create `tests/test-shell-tools.js`
  - [ ] Test `shell_exec` with various commands
  - [ ] Test `shell_exec` timeout
  - [ ] Test `shell_start_session` - session creation
  - [ ] Test `shell_send_input` - stdin writing
  - [ ] Test `shell_stop_session` - session termination
  - [ ] Test session event emission
  - [ ] Test parallel sessions
  - [ ] Test session cleanup
  - [ ] Test max concurrent sessions limit

- [ ] **Task 5.4:** Integration tests for SSE server
  - [ ] Create `tests/test-sse-integration.js`
  - [ ] Test SSE connection establishment
  - [ ] Test tool list retrieval (only enabled tools)
  - [ ] Test tool execution through SSE
  - [ ] Test disabled tool error handling
  - [ ] Test shell session SSE event streaming
  - [ ] Test multiple clients connecting
  - [ ] Test client disconnect cleanup

- [ ] **Task 5.5:** End-to-end testing
  - [ ] Test Open WebUI connection
  - [ ] Test tool discovery in Open WebUI
  - [ ] Test filesystem tool execution from Open WebUI
  - [ ] Test shell tool execution from Open WebUI
  - [ ] Test shell session streaming in Open WebUI
  - [ ] Test parallel operations (multiple tools in use)
  - [ ] Test large file operations (`fs_read_range`, `fs_grep`)

- [ ] **Task 5.6:** Performance and edge case testing
  - [ ] Test with very large files (fs_read_range)
  - [ ] Test with many files (fs_search, fs_grep)
  - [ ] Test parallel shell sessions (multiple tail -f)
  - [ ] Test long-running commands
  - [ ] Test resource cleanup (sessions, file handles)
  - [ ] Test error recovery

**Deliverable:** Comprehensive test coverage

**Files Created:**
- `tests/test-tool-registry.js`
- `tests/test-filesystem-tools.js`
- `tests/test-shell-tools.js`
- `tests/test-sse-integration.js`

---

## Phase 6: Documentation

### Documentation Updates

- [ ] **Task 6.1:** Update main README
  - [ ] Add section about new filesystem tools
  - [ ] Add section about new shell tools
  - [ ] Add section about Tool Registry
  - [ ] Update tool list table
  - [ ] Add usage examples for new tools
  - [ ] Update installation/configuration instructions

- [ ] **Task 6.2:** Create Tool Registry documentation
  - [ ] Create `docs/TOOL_REGISTRY.md`
  - [ ] Document configuration file structure
  - [ ] Document how to enable/disable tools
  - [ ] Document profile system
  - [ ] Document category system
  - [ ] Add examples of tool configuration

- [ ] **Task 6.3:** Create Filesystem Tools documentation
  - [ ] Create `docs/FILESYSTEM_TOOLS.md`
  - [ ] Document each filesystem tool with examples
  - [ ] Document input/output schemas
  - [ ] Document usage patterns
  - [ ] Document error handling
  - [ ] Add workflow examples (e.g., "Find and read file", "Search and patch")

- [ ] **Task 6.4:** Create Shell Tools documentation
  - [ ] Create `docs/SHELL_TOOLS.md`
  - [ ] Document each shell tool with examples
  - [ ] Document session management
  - [ ] Document SSE event streaming
  - [ ] Document parallel session usage
  - [ ] Add workflow examples (e.g., "Run tests with log monitoring")

- [ ] **Task 6.5:** Add common workflow examples
  - [ ] Example: Remote project analysis (list, read, grep)
  - [ ] Example: File editing workflow (read, patch, verify)
  - [ ] Example: Running tests with log monitoring
  - [ ] Example: Parallel operations (test + tail logs)
  - [ ] Example: Large codebase search and refactor

**Deliverable:** Complete documentation

**Files Modified:**
- `README.md`

**Files Created:**
- `docs/TOOL_REGISTRY.md`
- `docs/FILESYSTEM_TOOLS.md`
- `docs/SHELL_TOOLS.md`

---

## Phase 7: Final Validation & Cleanup

### Pre-Release Checklist

- [ ] **Task 7.1:** Code quality checks
  - [ ] Run TypeScript compiler (`npm run build`)
  - [ ] Fix any TypeScript errors
  - [ ] Run linter (if configured)
  - [ ] Check for unused imports
  - [ ] Verify error handling is consistent

- [ ] **Task 7.2:** Verify all tools are registered
  - [ ] Verify all 9 filesystem tools are registered
  - [ ] Verify all 4 shell tools are registered
  - [ ] Verify all browser tools are registered
  - [ ] Verify all GUI tools are registered
  - [ ] Check that no tools are missing from registry

- [ ] **Task 7.3:** Verify configuration file
  - [ ] Test default config creation
  - [ ] Test config file location (macOS vs other)
  - [ ] Test enabling/disabling tools
  - [ ] Test enabling/disabling categories
  - [ ] Verify config file structure matches PRD

- [ ] **Task 7.4:** Integration validation
  - [ ] Test with Open WebUI
  - [ ] Test with other MCP clients (if available)
  - [ ] Verify SSE event streaming works
  - [ ] Verify tool discovery works
  - [ ] Verify error messages are clear

- [ ] **Task 7.5:** Performance validation
  - [ ] Test with large files
  - [ ] Test with many concurrent operations
  - [ ] Test session management under load
  - [ ] Verify no memory leaks
  - [ ] Verify proper cleanup

- [ ] **Task 7.6:** Security validation
  - [ ] Verify path canonicalisation works
  - [ ] Verify no baseDir enforcement (as per PRD)
  - [ ] Verify timeout limits are enforced
  - [ ] Verify session limits are enforced
  - [ ] Review error messages don't leak sensitive info

**Deliverable:** Production-ready implementation

---

## Notes

- **Dependencies:** Ensure `glob` or `fast-glob` is installed before Phase 2
- **Ripgrep:** Preferred for `fs_grep`, but fallback to `grep` if not available
- **Testing:** Test each phase before moving to the next
- **Issues:** Document any blockers in `./todo/issues.md`

---

**End of Tasks Document**

