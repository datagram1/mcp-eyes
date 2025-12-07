# MCP Agent – Extended PRD: Configurable Toolsets & Remote Project Primitives

> **Stage:** Extended design for configurable toolsets + filesystem & shell primitives  
> **Version:** 1.0  
> **Date:** 2025-01-XX  
> **Depends on:** Existing MCP SSE server, browser/GUI tools, rules-based LLM guidance

---

## 1. Overview

This stage extends the MCP Agent so that:

1. **Toolsets are fully configurable per machine / profile**  
   - The agent can expose many primitives but selectively enable/disable them.
   - Callers (Open WebUI, Codex, Claude-Code, Gemini CLI, etc.) only see tools that are enabled for that machine.

2. **Filesystem and Shell primitives exist for deep project control on remote machines**  
   - Read/write/edit files (including large files).
   - Search and patch using `ripgrep` and `sed` to avoid blowing context windows.
   - Run shell commands, including **parallel sessions** for things like `tail -f` and verbose logging during tests.

This allows a controller (e.g. Codex or Open WebUI) to treat our MCP Agent as a **remote Codex-style tool host**:

- Run Playwright tests remotely.
- Watch logs live while other commands run.
- Edit project files via MCP tools.
- All while being able to **turn off** FS/Shell/SSH/etc. where they're not allowed.

---

## 2. Goals & Non-Goals

### 2.1 Goals

- Provide a **configurable tool registry**:
  - Tools are grouped into categories (Filesystem, Shell, SSH, Browser, GUI, etc.).
  - Each category and each tool can be enabled/disabled via the GUI.
  - Only enabled tools are advertised over MCP/SSE.

- Add **Filesystem primitives** that allow a caller to:
  - Inspect directories and files.
  - Read and write/edit files safely.
  - Use `ripgrep` and `sed` style operations to:
    - Find occurrences of text.
    - Patch files without sending the entire file to the LLM.

- Add **Shell primitives** that allow a caller to:
  - Run commands once and collect output.
  - Start **long-running / streaming sessions** (e.g. `tail -f`, verbose logs).
  - Manage multiple sessions in parallel via `session_id`.

- Design primitives so that:
  - A higher-level caller (Codex, Open WebUI, etc.) can implement complex behaviours like:
    - Remote Playwright runs.
    - Remote test suites.
    - Live log monitoring while other tools are being used.

### 2.2 Non-Goals (for this stage)

- No UI for editing raw JSON config files (we back settings with JSON but the user uses the GUI).
- No complex project detection / language-specific logic in this phase (focus is generic primitives).
- No orchestration logic (e.g. "run Playwright and then interpret results") inside the MCP Agent – this is left to the caller.
- No hard sandboxing – we assume full machine access, with **behaviour guided by rules** and **capability toggles**, not a hard whitelist.
- No SSH primitives in v1 (deferred to future stage).

---

## 3. Design Principles

### 3.1 No Hard Sandbox / baseDir Enforcement by Default

**Critical:** The MCP agent is intentionally a "full access" power tool.

- We **do not** want to force all FS operations to be constrained to a baseDir or prohibit `..` traversal globally.
- Path validation should:
  - Canonicalise (using `path.resolve()`).
  - Maybe sanity check, but **not block outside-workspace paths by default**.
- Any restrictions must come from **configurable blacklists and LLM rules**, not from hard-coded baseDir checks.
- For now, assume "no blacklist yet": just get the primitives working. We'll add blacklist wiring in a follow-up phase.

### 3.2 Configurable Toolsets via UI, not JSON Editing

- We'll have a **Tools tab** in the macOS settings where users can toggle entire categories and individual tools.
- JSON (`tools.json`) is just the backing store; normal users shouldn't ever need to touch it.
- On each machine, they can choose:
  - "Full access dev box" → FS + shell + browser + (optionally) SSH / GUI.
  - "Browser-only box" → only browser tools.
  - Etc.

### 3.3 Blacklists, Not Whitelists

- We want **full command freedom by default**.
- Later we'll add a configurable blacklist (paths and command patterns) in settings – not a mandatory whitelist, and not a hard-coded sandbox.
- For now, you can assume "no blacklist yet": just get the primitives working.

### 3.4 MCP Agent = Primitives Only; Callers Do Orchestration

- We don't want the SSE server to guess "project vs system mode".
- Tools are generic primitives (FS + shell + optional extras).
- Callers like Open WebUI / Codex / Claude-Code / Gemini-CLI do the higher level orchestration and prompts.

---

## 4. Tool Configuration: Configurable Toolsets

### 4.1 Concept

We maintain a **tool registry** driven by UI-based configuration, backed by a file (`tools.json`):

- Each **profile** has:
  - `id`, `label`, `enabled`
  - A list of **categories**:
    - `filesystem`, `shell`, `ssh`, `browser`, `gui`, etc.
  - Each category has:
    - `enabled` flag (master toggle)
    - A list of tools with:
      - `id`, `name`, `description`, `category`, `inputSchema`, `enabled`

### 4.2 Configuration File Structure

**Location:**
- **macOS:** `~/Library/Application Support/MCPEyes/tools.json`
- **Fallback (cross-platform):** `~/.mcp-eyes-tools.json`

**Structure:**

```jsonc
{
  "version": 1,
  "activeProfile": "default",
  "profiles": [
    {
      "id": "default",
      "label": "Default",
      "enabled": true,
      "categories": [
        {
          "id": "filesystem",
          "label": "Filesystem Tools",
          "enabled": true,
          "tools": [
            {
              "id": "fs_list",
              "name": "fs_list",
              "description": "List files and directories at or under a given path.",
              "category": "filesystem",
              "enabled": true,
              "inputSchema": {
                "type": "object",
                "properties": {
                  "path": { "type": "string" },
                  "recursive": { "type": "boolean", "default": false },
                  "max_depth": { "type": "number", "default": 3 }
                },
                "required": ["path"]
              }
            },
            {
              "id": "fs_read",
              "name": "fs_read",
              "description": "Read the contents of a file (with size limit).",
              "category": "filesystem",
              "enabled": true,
              "inputSchema": { /* ... */ }
            }
            // ... more filesystem tools
          ]
        },
        {
          "id": "shell",
          "label": "Shell Tools",
          "enabled": true,
          "tools": [
            {
              "id": "shell_exec",
              "name": "shell_exec",
              "description": "Run a command and return output when it finishes.",
              "category": "shell",
              "enabled": true,
              "inputSchema": { /* ... */ }
            }
            // ... more shell tools
          ]
        },
        {
          "id": "browser",
          "label": "Browser Tools",
          "enabled": true,
          "tools": [
            // Existing browser tools registered here
          ]
        },
        {
          "id": "gui",
          "label": "GUI Tools",
          "enabled": true,
          "tools": [
            // Existing GUI tools registered here
          ]
        }
      ]
    }
  ]
}
```

### 4.3 Tool Registry Implementation

**File:** `src/tool-registry.ts`

```typescript
interface ToolDefinition {
  id: string;
  name: string;
  description: string;
  category: string;
  inputSchema: any;
  enabled: boolean;
}

interface ToolCategory {
  id: string;
  label: string;
  enabled: boolean;
  tools: ToolDefinition[];
}

interface ToolProfile {
  id: string;
  label: string;
  enabled: boolean;
  categories: ToolCategory[];
}

interface ToolRegistryConfig {
  version: number;
  activeProfile: string;
  profiles: ToolProfile[];
}

class ToolRegistry {
  private config: ToolRegistryConfig | null = null;
  private configPath: string;
  private registeredTools: Map<string, ToolDefinition> = new Map();

  constructor(configPath?: string) {
    // macOS: prefer ~/Library/Application Support/MCPEyes/tools.json
    // Fallback: ~/.mcp-eyes-tools.json
    if (configPath) {
      this.configPath = configPath;
    } else {
      const os = require('os');
      const home = os.homedir();
      const platform = process.platform;
      
      if (platform === 'darwin') {
        const appSupport = path.join(home, 'Library', 'Application Support', 'MCPEyes');
        // Ensure directory exists
        if (!fs.existsSync(appSupport)) {
          fs.mkdirSync(appSupport, { recursive: true });
        }
        this.configPath = path.join(appSupport, 'tools.json');
      } else {
        this.configPath = path.join(home, '.mcp-eyes-tools.json');
      }
    }
    
    this.loadConfig();
  }

  /**
   * Load configuration from tools.json
   * If file doesn't exist, create default config with all tools enabled
   */
  loadConfig(): void {
    try {
      if (fs.existsSync(this.configPath)) {
        const content = fs.readFileSync(this.configPath, 'utf-8');
        this.config = JSON.parse(content);
      } else {
        // Create default config
        this.config = this.createDefaultConfig();
        this.saveConfig();
      }
    } catch (error) {
      console.error('[ToolRegistry] Failed to load config:', error);
      this.config = this.createDefaultConfig();
    }
  }

  /**
   * Save configuration to tools.json
   */
  saveConfig(): void {
    try {
      fs.writeFileSync(this.configPath, JSON.stringify(this.config, null, 2));
    } catch (error) {
      console.error('[ToolRegistry] Failed to save config:', error);
    }
  }

  /**
   * Create default configuration with all registered tools enabled
   */
  private createDefaultConfig(): ToolRegistryConfig {
    // This will be populated after tools are registered
    return {
      version: 1,
      activeProfile: 'default',
      profiles: [
        {
          id: 'default',
          label: 'Default',
          enabled: true,
          categories: []
        }
      ]
    };
  }

  /**
   * Register a tool (called during server initialization)
   */
  registerTool(tool: ToolDefinition): void {
    this.registeredTools.set(tool.id, tool);
    
    // If config doesn't have this tool yet, add it to the active profile
    if (this.config) {
      const activeProfile = this.config.profiles.find(p => p.id === this.config!.activeProfile);
      if (activeProfile) {
        let category = activeProfile.categories.find(c => c.id === tool.category);
        if (!category) {
          category = {
            id: tool.category,
            label: this.getCategoryLabel(tool.category),
            enabled: true,
            tools: []
          };
          activeProfile.categories.push(category);
        }
        
        // Check if tool already exists in category
        const existingTool = category.tools.find(t => t.id === tool.id);
        if (!existingTool) {
          category.tools.push({
            ...tool,
            enabled: tool.enabled !== undefined ? tool.enabled : true
          });
        }
      }
    }
  }

  /**
   * Get enabled tools for MCP (only tools that are enabled in active profile)
   */
  getEnabledTools(): ToolDefinition[] {
    if (!this.config) {
      return [];
    }

    const activeProfile = this.config.profiles.find(p => p.id === this.config!.activeProfile);
    if (!activeProfile || !activeProfile.enabled) {
      return [];
    }

    const enabledTools: ToolDefinition[] = [];

    for (const category of activeProfile.categories) {
      if (!category.enabled) {
        continue;
      }

      for (const tool of category.tools) {
        if (tool.enabled) {
          // Get full tool definition from registered tools
          const registeredTool = this.registeredTools.get(tool.id);
          if (registeredTool) {
            enabledTools.push({
              ...registeredTool,
              enabled: true
            });
          }
        }
      }
    }

    return enabledTools;
  }

  /**
   * Get MCP tool definitions (for list_tools response)
   */
  getMCPToolDefinitions(): any[] {
    return this.getEnabledTools().map(tool => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema
    }));
  }

  /**
   * Check if a tool is enabled
   */
  isToolEnabled(toolId: string): boolean {
    const enabledTools = this.getEnabledTools();
    return enabledTools.some(tool => tool.id === toolId || tool.name === toolId);
  }

  /**
   * Get full tool definition by ID or name
   */
  getTool(toolId: string): ToolDefinition | undefined {
    return this.registeredTools.get(toolId) || 
           Array.from(this.registeredTools.values()).find(t => t.name === toolId);
  }

  /**
   * Get category label (human-readable)
   */
  private getCategoryLabel(categoryId: string): string {
    const labels: Record<string, string> = {
      'filesystem': 'Filesystem Tools',
      'shell': 'Shell Tools',
      'browser': 'Browser Tools',
      'gui': 'GUI Tools',
      'ssh': 'SSH Tools'
    };
    return labels[categoryId] || categoryId;
  }

  /**
   * Get current configuration (for UI)
   */
  getConfig(): ToolRegistryConfig | null {
    return this.config;
  }

  /**
   * Update configuration (from UI)
   */
  updateConfig(config: ToolRegistryConfig): void {
    this.config = config;
    this.saveConfig();
  }
}
```

### 4.4 Behaviour

- The Settings → Tools page shows:
  - A list of categories, each with a master toggle.
  - Within each category, a list of tools with individual toggles.
  - The active profile is chosen via the UI (for now we can assume a single "default" profile is active).

- At runtime, the Tool Registry:
  - Loads `tools.json` and finds the active profile.
  - Computes a `Set<String>` of enabled tool IDs.

- The MCP/SSE layer:
  - Advertises only enabled tools in `list_tools` / initial SSE tool manifest.
  - If a disabled tool is called by ID, returns a `TOOL_DISABLED` error.

**Result:** We can ship many primitives, but operators can turn whole categories or individual tools off on a per-machine basis, keeping us compatible with existing tools in Codex/Open WebUI without collisions.

---

## 5. Filesystem Primitives

### 5.1 Design Goals

- Allow callers to:
  - Inspect directory trees.
  - Read files (full or partial).
  - Write and modify files.
  - Search and patch files using efficient native tools, not by pushing whole files into LLM context.
- Provide enough primitives for:
  - Remote code browsing.
  - Automated refactors.
  - Patch application via patterns.
  - Large-file-safe operations using ripgrep and sed-style functionality.

### 5.2 v1 Filesystem Tools

**File:** `src/filesystem-tools.ts`

Implement these 9 tools:

1. **fs_list** - List files and directories
2. **fs_read** - Read file contents (with size limit)
3. **fs_read_range** - Read file segment by line range
4. **fs_write** - Create or overwrite a file
5. **fs_delete** - Delete a file or directory
6. **fs_move** - Move or rename a file/directory
7. **fs_search** - Find files by pattern (glob)
8. **fs_grep** - Search within files (ripgrep wrapper)
9. **fs_patch** - Apply focused transformations to a file

**We do NOT need in v1:**
- `fs_append`
- `fs_copy`
- `fs_stat`
- `fs_exists`
- `fs_mkdir`

### 5.3 Tool Specifications

#### 5.3.1 fs_list

**Input:**
```typescript
{
  path: string;        // absolute or relative path
  recursive?: boolean; // default: false
  max_depth?: number;  // default: 3
}
```

**Output:**
```typescript
{
  entries: Array<{
    path: string;
    type: "file" | "directory";
    size?: number;        // for files
    modified?: string;     // ISO 8601 timestamp
  }>;
}
```

**Implementation Notes:**
- Use `fs.readdir` with `withFileTypes` for efficient directory reading.
- Respect `max_depth` for recursive traversal.
- Canonicalise path using `path.resolve()` but **do not enforce baseDir restrictions**.

#### 5.3.2 fs_read

**Input:**
```typescript
{
  path: string;
  max_bytes?: number;  // default: 131072 (~128 KB)
}
```

**Output:**
```typescript
{
  path: string;
  content: string;
  truncated?: boolean;  // true if file was larger than max_bytes
  size?: number;        // actual file size in bytes
}
```

**Implementation Notes:**
- Read file with size limit.
- If file exceeds `max_bytes`, truncate and set `truncated: true`.
- Return actual file size in response.

#### 5.3.3 fs_read_range

**Input:**
```typescript
{
  path: string;
  start_line: number;  // 1-based line number
  end_line: number;    // inclusive
}
```

**Output:**
```typescript
{
  path: string;
  start_line: number;
  end_line: number;
  content: string;      // lines from start_line to end_line (inclusive)
  total_lines?: number; // total lines in file
}
```

**Implementation Notes:**
- Line-based only (no byte-range in v1).
- Read file, split by newlines, return requested range.
- Include total line count if available.

#### 5.3.4 fs_write

**Input:**
```typescript
{
  path: string;
  content: string;
  create_dirs?: boolean;  // default: true
  mode?: "overwrite" | "append" | "create_if_missing";  // default: "overwrite"
}
```

**Output:**
```typescript
{
  path: string;
  bytes_written: number;
}
```

**Implementation Notes:**
- If `create_dirs: true`, create parent directories as needed.
- `mode: "overwrite"` - replace existing file.
- `mode: "append"` - append to existing file.
- `mode: "create_if_missing"` - only write if file doesn't exist.

#### 5.3.5 fs_delete

**Input:**
```typescript
{
  path: string;
  recursive?: boolean;  // default: false
}
```

**Output:**
```typescript
{
  path: string;
  deleted: boolean;
}
```

**Implementation Notes:**
- If `recursive: true`, delete directory and all contents.
- If `recursive: false` and path is directory, fail if not empty.

#### 5.3.6 fs_move

**Input:**
```typescript
{
  from: string;
  to: string;
}
```

**Output:**
```typescript
{
  from: string;
  to: string;
  moved: boolean;
}
```

**Implementation Notes:**
- Use `fs.rename()` or `fs.move()` (if available).
- Create parent directories of destination if needed.

#### 5.3.7 fs_search

**Input:**
```typescript
{
  base: string;           // base directory
  glob?: string;          // e.g. "**/*.ts"
  max_results?: number;   // default: 200
}
```

**Output:**
```typescript
{
  matches: Array<{
    path: string;
    type: "file" | "directory";
  }>;
}
```

**Implementation Notes:**
- Use `glob` package or `fast-glob` for pattern matching.
- Respect `max_results` limit.

#### 5.3.8 fs_grep (ripgrep wrapper)

**Input:**
```typescript
{
  base: string;           // directory to search
  pattern: string;        // text or regex pattern
  glob?: string;          // e.g. "**/*.{ts,tsx,js}"
  max_matches?: number;   // default: 200
}
```

**Output:**
```typescript
{
  matches: Array<{
    path: string;
    line: number;         // 1-based line number
    text: string;         // matching line content
    column?: number;      // column of match (if available)
  }>;
}
```

**Implementation Notes:**
- **Use ripgrep if available** (`rg` command in PATH).
- Parse ripgrep JSON output format (`rg --json`).
- **Fallback to grep** if ripgrep not available.
- This is crucial for large codebases: the LLM can locate relevant snippets, then use `fs_read_range` to pull only the lines it needs into context.

**Ripgrep Command:**
```bash
rg --json "pattern" base_dir -g "glob_pattern" | head -n (max_matches * 2)
```

#### 5.3.9 fs_patch (sed-like patching)

**Input:**
```typescript
{
  path: string;
  operations: Array<{
    type: "replace_first" | "replace_all" | "insert_after" | "insert_before";
    pattern?: string;      // for replace operations (regex or literal)
    match?: string;        // for insert operations (line or pattern to match)
    replacement?: string;  // for replace operations
    insert?: string;      // for insert operations
  }>;
  dry_run?: boolean;       // default: false
}
```

**Output:**
```typescript
{
  path: string;
  operations_applied: number;
  preview?: Array<{       // if dry_run: true
    operation: string;
    changed: boolean;
    before_excerpt?: string;
    after_excerpt?: string;
  }>;
}
```

**Implementation Notes:**
- Keep it simple for v1:
  - `replace_first` - replace first occurrence of pattern.
  - `replace_all` - replace all occurrences of pattern.
  - `insert_after` - insert text after matching line/pattern.
  - `insert_before` - insert text before matching line/pattern.
- Line-oriented implementation is fine for v1.
- If `dry_run: true`, return preview without modifying file.

### 5.4 Security Considerations

**Path Validation:**
- **Canonicalise** all paths using `path.resolve()`.
- **Do NOT** enforce baseDir restrictions or block `..` traversal by default.
- Optional `baseDir` parameter can be added for future use, but should be non-enforcing in v1.
- Any restrictions will come from configurable blacklists (future phase).

**File Size Limits:**
- `fs_read`: Default 128KB, configurable via `max_bytes`.
- `fs_grep`: Limit results via `max_matches` (default 200).

---

## 6. Shell Primitives

### 6.1 Design Goals

- Provide both simple one-shot commands and long-running streaming sessions.
- Allow multiple sessions in parallel:
  - e.g. `tail -f some.log --verbose` in one session
  - while running tests in another command.
- Let caller manage sessions via `session_id`.

### 6.2 v1 Shell Tools

**File:** `src/shell-tools.ts`

Implement these 4 tools:

1. **shell_exec** - Run a command and return output when it finishes
2. **shell_start_session** - Start an interactive or long-running command
3. **shell_send_input** - Send input to a running shell session
4. **shell_stop_session** - Stop/terminate a running session

**We do NOT need in v1:**
- `shell_list_sessions`
- `shell_exec_detached` / background execution

### 6.3 Tool Specifications

#### 6.3.1 shell_exec (one-shot)

**Input:**
```typescript
{
  command: string;              // e.g. "pytest -q", "npm test"
  cwd?: string | null;          // working directory
  timeout_seconds?: number;     // default: 600
  capture_stderr?: boolean;      // default: true
}
```

**Output:**
```typescript
{
  exit_code: number;
  stdout: string;
  stderr: string;               // if capture_stderr: true
  truncated?: boolean;           // if output was truncated
}
```

**Implementation Notes:**
- Use `sh -c` (or platform equivalent: `cmd /c` on Windows).
- Honor `cwd` if provided, but **do not enforce** that it's under any workspace root.
- Set timeout (default 600 seconds).
- Capture stdout and optionally stderr.
- Return exit code.

#### 6.3.2 shell_start_session (long-running / parallel)

**Input:**
```typescript
{
  command: string;             // e.g. "tail -f logs/app.log --verbose"
  cwd?: string | null;
  env?: Record<string, string>; // additional environment variables
  capture_stderr?: boolean;     // default: true
}
```

**Output (tool response):**
```typescript
{
  session_id: string;
  pid: number;
}
```

**SSE Streaming Events:**

The tool returns immediately with `session_id` and `pid`. Output is streamed via SSE events:

1. **shell_session_output**
```typescript
{
  type: "shell_session_output",
  session_id: string;
  stream: "stdout" | "stderr";
  chunk: string;
}
```

2. **shell_session_exit**
```typescript
{
  type: "shell_session_exit",
  session_id: string;
  exit_code: number;
}
```

**Implementation Notes:**
- Store sessions in a `Map<session_id, ShellSession>`.
- Spawn process with `spawn()` (not `exec()`).
- Stream stdout/stderr via events → SSE.
- Generate unique `session_id` (e.g., `session_${Date.now()}_${random}`).
- Multiple sessions can exist in parallel.

#### 6.3.3 shell_send_input

**Input:**
```typescript
{
  session_id: string;
  input: string;      // what to send to stdin (may include "\n")
}
```

**Output:**
```typescript
{
  session_id: string;
  bytes_written: number;
}
```

**Implementation Notes:**
- Write to stdin of the session process.
- Return number of bytes written.

#### 6.3.4 shell_stop_session

**Input:**
```typescript
{
  session_id: string;
  signal?: string;   // optional: "TERM", "KILL", etc. (default: "TERM")
}
```

**Output:**
```typescript
{
  session_id: string;
  stopped: boolean;
}
```

**Implementation Notes:**
- Send signal to process (default `TERM`).
- Clean up session from Map.
- Emit `shell_session_exit` event.

### 6.4 Example: Parallel Logging + Testing

A Codex/Open WebUI-style caller can:

1. **Start a tailing session:**
```typescript
shell_start_session({
  command: "tail -f logs/myapp.log --verbose",
  cwd: "/Users/richardbrown/dev/test"
})
// Returns: { session_id: "session_123", pid: 45678 }
```

2. **Run tests in parallel with shell_exec:**
```typescript
shell_exec({
  command: "pytest -vv",
  cwd: "/Users/richardbrown/dev/test"
})
// Returns: { exit_code: 0, stdout: "...", stderr: "..." }
```

3. **Watch log output via SSE events** from the tail session while parsing test output from `shell_exec`.

4. **When done, call shell_stop_session:**
```typescript
shell_stop_session({ session_id: "session_123" })
```

This is exactly the pattern we want to enable for "remote Codex" usage.

### 6.5 Security Considerations

**Command Execution:**
- **No command whitelist/blacklist in v1** (deferred to future phase).
- Full command freedom by default.
- Timeout limits (default 600s, configurable).
- Output size limits (optional, to prevent memory exhaustion).

**Session Management:**
- Limit concurrent sessions (e.g., max 10) to prevent resource exhaustion.
- Session timeout (e.g., 1 hour) - auto-cleanup.
- Cleanup on client disconnect.

---

## 7. SSE Integration

### 7.1 Integration Points

**File:** `src/mcp-sse-server.ts`

Modify `MCPSSEServer` class:

1. **Initialize Tool Registry:**
```typescript
private toolRegistry: ToolRegistry;
private filesystemTools: FilesystemTools;
private shellTools: ShellTools;

constructor() {
  super();
  this.toolRegistry = new ToolRegistry();
  this.filesystemTools = new FilesystemTools();
  this.shellTools = new ShellTools();
  
  // Forward shell session events to SSE clients
  this.shellTools.on('session_output', (data) => {
    this.broadcastSSE('shell_session_output', data);
  });
  
  this.shellTools.on('session_exit', (data) => {
    this.broadcastSSE('shell_session_exit', data);
  });
  
  // Register all tools with registry
  this.registerAllTools();
  
  this.httpServer = http.createServer(this.handleRequest.bind(this));
  // ... rest of constructor
}
```

2. **Register All Tools:**
```typescript
private registerAllTools(): void {
  // Register filesystem tools
  this.toolRegistry.registerTool({
    id: 'fs_list',
    name: 'fs_list',
    description: 'List files and directories at or under a given path.',
    category: 'filesystem',
    inputSchema: { /* ... */ },
    enabled: true
  });
  // ... register all filesystem tools
  
  // Register shell tools
  this.toolRegistry.registerTool({
    id: 'shell_exec',
    name: 'shell_exec',
    description: 'Run a command and return output when it finishes.',
    category: 'shell',
    inputSchema: { /* ... */ },
    enabled: true
  });
  // ... register all shell tools
  
  // Register existing browser/GUI tools
  // ... (migrate from current hardcoded list)
}
```

3. **Update getToolDefinitions():**
```typescript
private getToolDefinitions(): any[] {
  // Return only enabled tools from registry
  return this.toolRegistry.getMCPToolDefinitions();
}
```

4. **Update callTool():**
```typescript
private async callTool(name: string, args: any): Promise<any> {
  // Check if tool is enabled
  if (!this.toolRegistry.isToolEnabled(name)) {
    throw new Error(`Tool ${name} is disabled`);
  }

  // Route to appropriate handler
  if (name.startsWith('fs_')) {
    return await this.handleFilesystemTool(name, args);
  } else if (name.startsWith('shell_')) {
    return await this.handleShellTool(name, args);
  } else {
    // Existing tool handlers (browser, GUI, etc.)
    // ...
  }
}

private async handleFilesystemTool(name: string, args: any): Promise<any> {
  switch (name) {
    case 'fs_list':
      return await this.filesystemTools.listDirectory(args);
    case 'fs_read':
      return await this.filesystemTools.readFile(args);
    case 'fs_read_range':
      return await this.filesystemTools.readFileRange(args);
    case 'fs_write':
      return await this.filesystemTools.writeFile(args);
    case 'fs_delete':
      return await this.filesystemTools.deletePath(args);
    case 'fs_move':
      return await this.filesystemTools.movePath(args);
    case 'fs_search':
      return await this.filesystemTools.searchFiles(args);
    case 'fs_grep':
      return await this.filesystemTools.grepFiles(args);
    case 'fs_patch':
      return await this.filesystemTools.patchFile(args);
    default:
      throw new Error(`Unknown filesystem tool: ${name}`);
  }
}

private async handleShellTool(name: string, args: any): Promise<any> {
  switch (name) {
    case 'shell_exec':
      return await this.shellTools.executeCommand(args);
    case 'shell_start_session':
      return this.shellTools.startSession(args);
    case 'shell_send_input':
      return this.shellTools.sendInput(args.session_id, args.input);
    case 'shell_stop_session':
      return this.shellTools.stopSession(args.session_id, args.signal);
    default:
      throw new Error(`Unknown shell tool: ${name}`);
  }
}
```

5. **Broadcast SSE Events:**
```typescript
private broadcastSSE(eventType: string, data: any): void {
  // Send to all connected SSE clients
  for (const client of this.clients.values()) {
    this.sendSSE(client, {
      type: eventType,
      ...data
    });
  }
}
```

### 7.2 SSE Event Format

**Consistent event names:**

1. **shell_session_output:**
```typescript
{
  type: "shell_session_output",
  session_id: string,
  stream: "stdout" | "stderr",
  chunk: string
}
```

2. **shell_session_exit:**
```typescript
{
  type: "shell_session_exit",
  session_id: string,
  exit_code: number
}
```

### 7.3 MCP Tool Advertisement

- The MCP SSE server should **only advertise tool definitions** that are enabled in the Tool Registry.
- When a disabled tool is called, return error: `Tool <id> is disabled`.

---

## 8. Gemini CLI Parity & Final Tool Set

This section documents how our MCP Agent's filesystem and shell tools relate to the built-in tools shipped with **Gemini CLI**, so that a caller like `gemini-cli`, Codex, Open WebUI, etc. can be extended to operate on **remote machines** via this agent.

**Purpose:** We are effectively making a tool set that can extend a caller like Gemini CLI to another computer, giving it the equivalent local tools it can use on the local machine. The toolset also lets web-based callers like Open WebUI behave like Claude Code or Codex on localhosts or remote with a toolset that allows writing coding projects in any directory available to the main agent.

### 8.0 Quick Reference: Gemini CLI → MCP Agent Mapping

**Remote MCP Agent ↔ Gemini CLI Tool Parity (Quick Reference)**

| Gemini CLI tool        | MCP tool(s)                                      | Notes |
|------------------------|--------------------------------------------------|-------|
| `list_directory`       | `fs_list`                                       | List directory contents (optional `recursive`, `max_depth`). |
| `read_file`            | `fs_read`, `fs_read_range`                      | `fs_read` supports `max_bytes`; `fs_read_range` uses `start_line`/`end_line`. |
| `write_file`           | `fs_write`                                      | `mode`: `overwrite` \| `append` \| `create_if_missing`. Diff/confirm is caller-side. |
| `glob`                 | `fs_search`                                     | Glob / filename search under a base path. |
| `search_file_content`  | `fs_grep`                                       | Regex/text search inside files via ripgrep/grep. |
| `replace`              | `fs_patch`                                      | Simple patch ops: `replace_first`, `replace_all`, `insert_after`, `insert_before`. |
| `read_many_files`      | *(none – caller composes via `fs_search` + `fs_read`)* | Intentionally not implemented as a single tool. |
| `run_shell_command`    | `shell_exec`                                    | One-shot command, stdout/stderr + timeout. |
| *(no direct equivalent)* | `shell_start_session`, `shell_send_input`, `shell_stop_session` | Extra: long-running/streaming sessions (e.g. `tail -f`). |
| `web_fetch`            | *(none – use browser tools / caller's web tools)* | Not implemented in MCP agent. |
| `google_web_search`    | *(none – caller handles search)*                | Not implemented in MCP agent. |
| `save_memory`          | *(none – caller handles memory)*                | Not implemented in MCP agent. |

**Notes:**

- Our agent is intentionally **full access** (no hard sandbox).  
  Path safety and "dangerous command" policies are handled by:
  - Tool enable/disable settings, and
  - Optional blacklists / LLM rules in the caller.
- Web search, URL fetch, and long-term memory are **caller responsibilities**, not MCP tools here.

**Final v1 MCP Tool List:**

These are the only FS + Shell primitives we implement and register in v1.

**Filesystem tools (9 tools):**
- `fs_list`        – List files/directories at a path (optional recursive).
- `fs_read`        – Read file content (with `max_bytes`).
- `fs_read_range`  – Read a file by line range (`start_line`, `end_line`).
- `fs_write`       – Create/overwrite/append files (`mode`).
- `fs_delete`      – Delete file or directory (optional recursive).
- `fs_move`        – Move/rename a file or directory.
- `fs_search`      – Glob / filename search under a base path.
- `fs_grep`        – Content search inside files via ripgrep/grep.
- `fs_patch`       – Apply small text patches (replace/insert, optional `dry_run`).

**Shell tools (4 tools):**
- `shell_exec`           – One-shot shell command (exit code, stdout, stderr, timeout).
- `shell_start_session`  – Start long-running shell session (returns `session_id`, `pid`).
- `shell_send_input`     – Send input to a running session (`stdin`).
- `shell_stop_session`   – Stop a session (signal, default `TERM`).

**Explicitly out-of-scope for v1:**
- Any `web_*` / `http_*` search or fetch tools.
- Any memory tools (e.g. `save_memory` equivalents).
- Extra FS helpers like `fs_append`, `fs_copy`, `fs_stat`, `fs_exists`, `fs_mkdir`.
- Extra shell helpers like `shell_list_sessions`, `shell_exec_detached`, `shell_exec_background`.

These can be added later if needed, but the v1 surface area above is the contract we're building to.

### 8.1 Reference: Gemini CLI's built-in primitives

Gemini CLI currently exposes a small core of built-in tools, grouped as: file system tools, a shell tool, and web/memory tools. The important ones for our use case are:

- **File system:**
  - `list_directory` – list contents of a directory.
  - `read_file` – read a file (with offset/limit for big files).
  - `write_file` – write or create a file (with diff + confirmation in the CLI).
  - `glob` – find files matching a pattern.
  - `search_file_content` – search inside files (grep/git grep).
  - `replace` – replace text within a file by pattern/expected-replacements.
  - `read_many_files` – multi-file read helper (being deprecated).

- **Execution:**
  - `run_shell_command` – execute a shell command on the local system.

- **Web & memory (not in scope for us):**
  - `web_fetch` – fetch URLs (uses Gemini's URL context).
  - `google_web_search` – search via Gemini / Google.
  - `save_memory` – persist information across sessions (via GEMINI.md / memory tooling).

Our goal is to provide a **remote analogue** of the file system + shell tools, so that the same kinds of flows Gemini CLI uses on the local machine can be re-used by a caller against remote projects via our MCP service.

We explicitly **do not** implement Gemini CLI's `web_fetch`, `google_web_search`, `read_many_files`, or `save_memory` in this agent, because:

- We already have a **browser extension / browser tools**, so search can be done in a first-class way by opening tabs and driving the browser directly (no API keys, no tied search provider).
- Web search and memory are better handled in the **caller** (Gemini CLI, Open WebUI, etc.), not at the MCP agent level.

### 8.2 Design: how our tools map to Gemini CLI

We keep our internal naming (`fs_*`, `shell_*`) but they correspond closely to Gemini CLI concepts:

| Gemini CLI tool           | Our MCP tool(s)                       | Notes |
|---------------------------|----------------------------------------|-------|
| `list_directory`          | `fs_list`                             | Same semantics: list directory contents; we support optional `recursive` + `max_depth`. |
| `read_file`               | `fs_read`, `fs_read_range`            | `fs_read` supports `max_bytes`; `fs_read_range` adds explicit line ranges for large files. |
| `write_file`              | `fs_write`                            | We support `mode` (`overwrite` \| `append` \| `create_if_missing`). Diff/confirmation is **caller-side**, not enforced by the agent. |
| `glob`                    | `fs_search`                           | We support a `glob` parameter + optional `max_results`; caller can sort by mtime if needed. |
| `search_file_content`     | `fs_grep`                             | We wrap `ripgrep` where available and fall back to `grep`; regex + glob include. |
| `replace`                 | `fs_patch`                            | We support simple operations: `replace_first`, `replace_all`, `insert_after`, `insert_before`. Multi-stage self-correction is left to the caller. |
| `read_many_files`         | ✗ (caller composes via `fs_search` + `fs_read`) | We deliberately skip a dedicated multi-file read tool; the caller can orchestrate this. |
| `run_shell_command`       | `shell_exec`                          | One-shot execution with stdout/stderr + timeout. |
| *(no direct equivalent)*  | `shell_start_session`, `shell_send_input`, `shell_stop_session` | Extra capability: long-running/streaming sessions (e.g. `tail -f`, REPLs) over SSE. |
| `web_fetch`, `google_web_search`, `save_memory` | ✗ | Not implemented in this agent; expected to be handled by the caller or browser tools. |

**Key differences from Gemini CLI:**

- **No hard sandbox:**  
  Gemini CLI has workspace path validation and sandboxing issues around symlinks etc.  
  Our agent is intentionally "full access":  
  - We canonicalise paths (**`path.resolve`**), but we **do not restrict** paths to a workspace baseDir by default.
  - Future safety can be achieved via **user-configurable blacklists** and **rules**, not enforced whitelists.

- **No gating/confirmation layer at MCP level:**  
  Gemini CLI prompts the user to approve certain tool calls (especially writes and dangerous shell commands).  
  We assume the **caller UI** (Gemini CLI, Open WebUI, Codex, etc.) is responsible for:
  - Showing diffs,
  - Getting user confirmation,
  - Applying any policy about "dangerous" commands.
  
  The MCP agent just executes the primitives once they're requested and enabled.

- **Paths:**  
  Gemini CLI requires absolute paths in its system instructions.  
  Our tools accept **absolute or relative** paths:
  - Callers that normally send absolute paths (like Gemini CLI) can continue to do so.
  - Other callers can use project-relative paths; interpretation is left to the calling agent and prompt rules.

### 8.3 Final v1 tool set and names

This is the **final list of primitives** to implement in v1 and expose through the tool registry. Anything not listed here should *not* be implemented or registered yet, even if mentioned as a potential future tool elsewhere in this document.

#### 8.3.1 Filesystem tools (v1)

Implement exactly these:

- `fs_list`
- `fs_read`
- `fs_read_range`
- `fs_write`
- `fs_delete`
- `fs_move`
- `fs_search`
- `fs_grep`
- `fs_patch`

**Notes:**

- `fs_read`  
  - Has a `max_bytes` parameter with a sensible default (≈128KB), but can be overridden by caller.
- `fs_read_range`  
  - Line-based ranges (`start_line`, `end_line`) to handle large files in chunks and avoid blowing context.
- `fs_search`  
  - Supports at minimum: `base`, `glob`, `recursive`, `max_results`.
- `fs_grep`  
  - Wraps ripgrep (`rg --json`) if available, falling back to `grep` if not.
- `fs_patch`  
  - Operations allowed:
    - `replace_first`
    - `replace_all`
    - `insert_after`
    - `insert_before`  
  - `dry_run: true` returns a preview without writing.  
  - Fine to be line-oriented and simple in v1 – it just needs to be predictable.

**Do NOT implement these in v1** (even though they may be mentioned in earlier drafts):

- `fs_append`
- `fs_copy`
- `fs_stat`
- `fs_exists`
- `fs_mkdir`

They can be added later if we genuinely need them.

#### 8.3.2 Shell tools (v1)

Implement exactly these:

- `shell_exec`              – one-shot command.
- `shell_start_session`     – start long-running / streaming session.
- `shell_send_input`        – send `stdin` to a session.
- `shell_stop_session`      – terminate a session.

**Notes:**

- `shell_exec`:
  - Use `sh -c` on POSIX systems and `cmd.exe /c` on Windows, similar to Gemini CLI's behaviour.
  - Support `cwd`, `timeout_seconds`, `capture_stderr`.
- `shell_start_session`:
  - Returns `{ session_id, pid }`.
  - Emits SSE events:
    - `shell_session_output` with `{ session_id, stream: "stdout" | "stderr", chunk }`.
    - `shell_session_exit` with `{ session_id, exit_code }`.
- `shell_send_input`:
  - Writes to `stdin` for that `session_id`.
- `shell_stop_session`:
  - Sends a signal (default `"TERM"`) to the process and cleans up session tracking.

**Do NOT implement or register these as tools in v1:**

- `shell_list_sessions`
- `shell_exec_detached`
- `shell_exec_background`

We only need the four tools above; the rest can be done later if required.

#### 8.3.3 Web & memory tools

We intentionally **do not** implement:

- `web_fetch` / `http_fetch`
- `web_search` / `google_web_search`
- `save_memory` / any memory tools

**Rationale:**

- Web search, browsing, and external APIs are handled either:
  - Locally by the caller (Gemini CLI's own web tools), or
  - Via our existing **browser extension tools** that operate in a first-class way on real browser tabs.
- Long-term persistence ("memory") should be the caller's concern (e.g. GEMINI.md, Open WebUI memory), not the MCP agent's.

### 8.4 PRD / Implementation amendments

Before implementing, make these clarifications and adjustments in the existing PRD and code plans:

1. **Lock the v1 tool list**
   - Confirm in the PRD that v1 implements **only**:
     - Filesystem: `fs_list`, `fs_read`, `fs_read_range`, `fs_write`, `fs_delete`, `fs_move`, `fs_search`, `fs_grep`, `fs_patch`.
     - Shell: `shell_exec`, `shell_start_session`, `shell_send_input`, `shell_stop_session`.
   - Any other `fs_*` or `shell_*` tools mentioned are **future/optional** and should not be wired into the registry yet.

2. **No baseDir enforcement**
   - In the filesystem section, explicitly state:
     - The agent **canonicalises** paths but does **not** restrict them to any baseDir or forbid `..` traversal by default.
     - Any future safety will come from a separate **blacklist / rules** mechanism, not from `validatePath` silently blocking paths.

3. **Caller responsibility for diffs & confirmations**
   - Clarify that:
     - `fs_write` and `fs_patch` do not implement interactive diffs or confirmations.
     - Those user-safe behaviours (e.g. "show diff and ask Y/N") are expected to be implemented in the **caller** UI (like Gemini CLI does today), not inside the MCP agent.

4. **Explicit Gemini CLI mapping (for future extension work)**
   - Keep the mapping table in this section so that:
     - Future work to bridge Gemini CLI → MCP is straightforward.
     - It's obvious which remote tool to call when Gemini asks for `read_file`, `replace`, or `run_shell_command`.

5. **Tool Registry behaviour**
   - Ensure the `ToolRegistry`:
     - Registers all of the v1 tools above with appropriate `id`, `name`, `description`, `category`.
     - Exposes **only enabled tools** in `getToolDefinitions()` / SSE tool manifests.
     - Causes `callTool` to return a clear "tool disabled" error if a tool is not enabled for the current profile.

6. **No web/memory tools in this stage**
   - Verify the PRD does not accidentally mention implementing:
     - `web_fetch`, `google_web_search`, `web_search`, `save_memory`, or `read_many_files` as MCP tools.
   - If any such references exist, mark them as "explicitly out of scope for this stage".

With this, our MCP Agent looks like a **remote twin** of the useful parts of Gemini CLI's toolkit (FS + Shell), while staying cleanly separated from web APIs and memory features that belong in the caller.

---

## 9. Implementation Plan

### 9.1 Phase 1: Tool Registry Foundation

**Tasks:**
1. Create `src/tool-registry.ts` with `ToolRegistry` class.
2. Implement config loading/saving (`tools.json`).
3. Implement `registerTool()`, `getEnabledTools()`, `isToolEnabled()`.
4. Hook Tool Registry into `MCPSSEServer`:
   - Initialize in constructor.
   - Update `getToolDefinitions()` to use registry.
   - Update `callTool()` to check `isToolEnabled()`.
5. Register stub FS and shell tools so we can see them appear/disappear based on config.
6. Test: Verify tools can be enabled/disabled via config file.

**Files to Create:**
- `src/tool-registry.ts`

**Files to Modify:**
- `src/mcp-sse-server.ts`

**Deliverable:** Tool Registry working, tools can be toggled via `tools.json`.

### 9.2 Phase 2: Filesystem Primitives

**Tasks:**
1. Create `src/filesystem-tools.ts` with `FilesystemTools` class.
2. Implement all 9 v1 filesystem tools:
   - `fs_list`
   - `fs_read`
   - `fs_read_range`
   - `fs_write`
   - `fs_delete`
   - `fs_move`
   - `fs_search`
   - `fs_grep` (with ripgrep support + grep fallback)
   - `fs_patch`
3. Implement path validation (canonicalise, no baseDir enforcement).
4. Wire filesystem tools through `handleFilesystemTool()` in SSE server.
5. Register all filesystem tools with Tool Registry.
6. Test: Verify each tool works correctly.

**Files to Create:**
- `src/filesystem-tools.ts`

**Files to Modify:**
- `src/mcp-sse-server.ts`
- `src/tool-registry.ts` (register tools)

**Dependencies:**
- Install `glob` or `fast-glob` package for `fs_search`.
- Check for `ripgrep` (`rg`) in PATH for `fs_grep`.

**Deliverable:** All filesystem tools implemented and working.

### 9.3 Phase 3: Shell Primitives

**Tasks:**
1. Create `src/shell-tools.ts` with `ShellTools` class (extends EventEmitter).
2. Implement all 4 v1 shell tools:
   - `shell_exec` (one-shot)
   - `shell_start_session` (long-running)
   - `shell_send_input` (stdin)
   - `shell_stop_session` (terminate)
3. Implement session management (Map<session_id, ShellSession>).
4. Implement SSE event emission for session output/exit.
5. Wire shell tools through `handleShellTool()` in SSE server.
6. Wire session events to SSE broadcasting.
7. Register all shell tools with Tool Registry.
8. Test: Verify one-shot commands, parallel sessions, SSE streaming.

**Files to Create:**
- `src/shell-tools.ts`

**Files to Modify:**
- `src/mcp-sse-server.ts`
- `src/tool-registry.ts` (register tools)

**Deliverable:** All shell tools implemented with SSE streaming support.

### 9.4 Phase 4: Migrate Existing Tools to Registry

**Tasks:**
1. Register all existing browser tools with Tool Registry.
2. Register all existing GUI tools with Tool Registry.
3. Update `callTool()` to route browser/GUI tools through registry check.
4. Test: Verify existing tools still work and can be toggled.

**Files to Modify:**
- `src/mcp-sse-server.ts`

**Deliverable:** All tools go through Tool Registry.

### 9.5 Phase 5: Testing & Validation

**Tasks:**
1. Unit tests for Tool Registry.
2. Unit tests for FilesystemTools.
3. Unit tests for ShellTools.
4. Integration tests for SSE server with enabled/disabled tools.
5. End-to-end test: Open WebUI connecting and using tools.
6. Test parallel shell sessions.
7. Test large file operations (fs_read_range, fs_grep).

**Files to Create:**
- `tests/test-tool-registry.js`
- `tests/test-filesystem-tools.js`
- `tests/test-shell-tools.js`
- `tests/test-sse-integration.js`

**Deliverable:** Comprehensive test coverage.

### 9.6 Phase 6: Documentation

**Tasks:**
1. Update README with new tools.
2. Document Tool Registry configuration.
3. Document filesystem tool usage patterns.
4. Document shell session streaming.
5. Add examples for common workflows.

**Files to Modify:**
- `README.md`
- Create `docs/TOOL_REGISTRY.md`
- Create `docs/FILESYSTEM_TOOLS.md`
- Create `docs/SHELL_TOOLS.md`

**Deliverable:** Complete documentation.

---

## 10. Future Extensions (Out of Scope for v1)

- **SSH primitives** (ssh_exec, remote session management) - deferred to future stage.
- **Project detection** and language-specific helpers (e.g. "auto-detect Node/Python/Java projects").
- **Higher-level test/build tools** (e.g. `project_run_tests`) built over `shell_exec`.
- **More advanced patch formats** (unified diff application, git-aware patching).
- **Tools UI** in macOS settings app (Tools tab) - deferred to follow-up phase.
- **Configurable blacklists** (paths and command patterns) - deferred to follow-up phase.

---

## 11. Security Considerations

### 11.1 Path Validation

- **Canonicalise** all paths using `path.resolve()`.
- **Do NOT** enforce baseDir restrictions or block `..` traversal by default.
- Any restrictions will come from configurable blacklists (future phase).

### 11.2 Command Execution

- **No command whitelist/blacklist in v1** (deferred to future phase).
- Full command freedom by default.
- Timeout limits (default 600s, configurable).
- Output size limits (optional, to prevent memory exhaustion).

### 11.3 File Operations

- Size limits on reads (128KB default, configurable).
- Write permissions check (let OS handle it).
- No file type restrictions in v1.

### 11.4 Session Management

- Limit concurrent sessions (e.g., max 10) to prevent resource exhaustion.
- Session timeout (e.g., 1 hour) - auto-cleanup.
- Cleanup on client disconnect.

---

## 12. Dependencies

### 12.1 New npm Packages

- `glob` or `fast-glob` - for `fs_search` glob pattern matching
- (Optional) `ripgrep-js` - if we want to bundle ripgrep, but prefer checking for `rg` in PATH

### 12.2 System Requirements

- **ripgrep** (`rg` command) - preferred for `fs_grep`, but fallback to `grep` if not available
- Node.js >= 18.0.0 (already required)

---

## 13. Success Criteria

1. ✅ Tool Registry loads/saves configuration correctly.
2. ✅ Tools can be enabled/disabled via `tools.json`.
3. ✅ Only enabled tools are advertised over MCP/SSE.
4. ✅ All 9 filesystem tools work correctly.
5. ✅ All 4 shell tools work correctly.
6. ✅ Shell sessions stream output via SSE.
7. ✅ Multiple shell sessions can run in parallel.
8. ✅ Existing browser/GUI tools work through Tool Registry.
9. ✅ Open WebUI can connect and use new tools.
10. ✅ Comprehensive test coverage.

---

## 14. Open Questions / Decisions Needed

1. **Ripgrep bundling:** Should we bundle ripgrep or require it to be installed? (Decision: Check PATH, fallback to grep)
2. **Session limits:** What should the max concurrent sessions be? (Decision: 10 for v1)
3. **Session timeout:** What should the auto-cleanup timeout be? (Decision: 1 hour for v1)
4. **Output size limits:** Should we limit stdout/stderr size? (Decision: Optional, configurable in future)

---

## 15. References

- Original PRD: User-provided extended PRD
- MCP Protocol: https://modelcontextprotocol.io
- SSE Server Implementation: `src/mcp-sse-server.ts`
- Existing Tool Definitions: `src/mcp-sse-server.ts:513-681`

---

**End of PRD**

