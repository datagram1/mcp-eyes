export default function FilesystemToolsPage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-white mb-3">Filesystem & Shell Tools</h1>
        <p className="text-slate-300 text-lg">
          File operations and shell command execution for system automation.
        </p>
      </div>

      {/* Filesystem Tools */}
      <div className="bg-slate-800/50 rounded-xl p-6 border border-slate-700">
        <h2 className="text-xl font-semibold text-white mb-4">Filesystem Tools</h2>
        <p className="text-slate-400 mb-4 text-sm">All filesystem tools are prefixed with <code className="bg-slate-700 px-1 rounded">fs_</code>.</p>

        <div className="space-y-6">
          {/* fs_list */}
          <div className="border border-slate-600 rounded-lg p-4">
            <h3 className="text-white font-medium mb-2">fs_list</h3>
            <p className="text-slate-400 text-sm mb-3">List directory contents.</p>
            <div className="bg-slate-900 rounded-lg p-3 font-mono text-sm">
              <p className="text-green-400">fs_list({`{ path: "/Users/me/Documents" }`})</p>
              <p className="text-slate-400 mt-1">// Returns: [{`{ name, type, size, modified }`}, ...]</p>
            </div>
          </div>

          {/* fs_read */}
          <div className="border border-slate-600 rounded-lg p-4">
            <h3 className="text-white font-medium mb-2">fs_read</h3>
            <p className="text-slate-400 text-sm mb-3">Read file contents.</p>
            <div className="bg-slate-900 rounded-lg p-3 font-mono text-sm">
              <p className="text-green-400">fs_read({`{ path: "/path/to/file.txt" }`})</p>
              <p className="text-slate-400 mt-1">// Returns: {`{ content: "file contents..." }`}</p>
            </div>
            <p className="text-slate-500 text-xs mt-2">Use for: Text files, configs, logs, source code</p>
          </div>

          {/* fs_read_range */}
          <div className="border border-slate-600 rounded-lg p-4">
            <h3 className="text-white font-medium mb-2">fs_read_range</h3>
            <p className="text-slate-400 text-sm mb-3">Read specific lines from a file.</p>
            <div className="bg-slate-900 rounded-lg p-3 font-mono text-sm">
              <p className="text-green-400">fs_read_range({`{ path: "/path/to/file.txt", start_line: 10, end_line: 20 }`})</p>
            </div>
            <p className="text-slate-500 text-xs mt-2">Use for: Large files, viewing specific sections</p>
          </div>

          {/* fs_write */}
          <div className="border border-slate-600 rounded-lg p-4">
            <h3 className="text-white font-medium mb-2">fs_write</h3>
            <p className="text-slate-400 text-sm mb-3">Write content to a file.</p>
            <div className="bg-slate-900 rounded-lg p-3 font-mono text-sm">
              <p className="text-green-400">fs_write({`{ path: "/path/to/file.txt", content: "Hello, World!" }`})</p>
              <p className="text-slate-400 mt-2">// Create parent directories if needed</p>
              <p className="text-green-400">fs_write({`{ path: "/path/to/new/file.txt", content: "data", create_directories: true }`})</p>
            </div>
          </div>

          {/* fs_delete */}
          <div className="border border-slate-600 rounded-lg p-4">
            <h3 className="text-white font-medium mb-2">fs_delete</h3>
            <p className="text-slate-400 text-sm mb-3">Delete a file or directory.</p>
            <div className="bg-slate-900 rounded-lg p-3 font-mono text-sm">
              <p className="text-green-400">fs_delete({`{ path: "/path/to/file.txt" }`})</p>
              <p className="text-green-400">fs_delete({`{ path: "/path/to/directory", recursive: true }`})</p>
            </div>
            <div className="mt-2 bg-red-900/30 border border-red-600/30 rounded-lg p-2">
              <p className="text-red-300 text-xs">⚠️ Be cautious with <code>recursive: true</code></p>
            </div>
          </div>

          {/* fs_move */}
          <div className="border border-slate-600 rounded-lg p-4">
            <h3 className="text-white font-medium mb-2">fs_move</h3>
            <p className="text-slate-400 text-sm mb-3">Move or rename a file.</p>
            <div className="bg-slate-900 rounded-lg p-3 font-mono text-sm">
              <p className="text-green-400">fs_move({`{ source: "/path/from/file.txt", destination: "/path/to/file.txt" }`})</p>
            </div>
          </div>

          {/* fs_search */}
          <div className="border border-slate-600 rounded-lg p-4">
            <h3 className="text-white font-medium mb-2">fs_search</h3>
            <p className="text-slate-400 text-sm mb-3">Search for files by pattern (glob).</p>
            <div className="bg-slate-900 rounded-lg p-3 font-mono text-sm">
              <p className="text-green-400">fs_search({`{ path: "/Users/me", pattern: "*.txt" }`})</p>
              <p className="text-green-400">fs_search({`{ path: "/project", pattern: "**/*.js", max_depth: 3 }`})</p>
            </div>
          </div>

          {/* fs_grep */}
          <div className="border border-slate-600 rounded-lg p-4">
            <h3 className="text-white font-medium mb-2">fs_grep</h3>
            <p className="text-slate-400 text-sm mb-3">Search file contents with regex.</p>
            <div className="bg-slate-900 rounded-lg p-3 font-mono text-sm">
              <p className="text-green-400">fs_grep({`{ path: "/project", pattern: "TODO" }`})</p>
              <p className="text-green-400">fs_grep({`{ path: "/logs", pattern: "error", case_sensitive: false }`})</p>
            </div>
            <p className="text-slate-500 text-xs mt-2">Use for: Finding text in files, searching code, log analysis</p>
          </div>

          {/* fs_patch */}
          <div className="border border-slate-600 rounded-lg p-4">
            <h3 className="text-white font-medium mb-2">fs_patch</h3>
            <p className="text-slate-400 text-sm mb-3">Apply patch operations to a file.</p>
            <div className="bg-slate-900 rounded-lg p-3 font-mono text-sm overflow-x-auto">
              <pre className="text-green-400">{`fs_patch({
  path: "/path/to/file.txt",
  operations: [
    { op: "replace", line: 5, content: "new content" },
    { op: "insert", line: 10, content: "inserted line" }
  ]
})

// Preview changes without applying
fs_patch({
  path: "/path/to/file.txt",
  operations: [...],
  dry_run: true
})`}</pre>
            </div>
          </div>
        </div>
      </div>

      {/* Shell Tools */}
      <div className="bg-slate-800/50 rounded-xl p-6 border border-slate-700">
        <h2 className="text-xl font-semibold text-white mb-4">Shell Tools</h2>
        <p className="text-slate-400 mb-4 text-sm">Execute commands and manage shell sessions.</p>

        <div className="space-y-6">
          {/* shell_exec */}
          <div className="border border-slate-600 rounded-lg p-4">
            <h3 className="text-white font-medium mb-2">shell_exec</h3>
            <p className="text-slate-400 text-sm mb-3">Execute a shell command and get output.</p>
            <div className="bg-slate-900 rounded-lg p-3 font-mono text-sm">
              <p className="text-green-400">shell_exec({`{ command: "ls -la" }`})</p>
              <p className="text-green-400">shell_exec({`{ command: "npm install", cwd: "/project" }`})</p>
              <p className="text-green-400">shell_exec({`{ command: "long-task", timeout_seconds: 300 }`})</p>
            </div>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-700">
                    <th className="pb-2 text-slate-400 font-medium">Parameter</th>
                    <th className="pb-2 text-slate-400 font-medium">Type</th>
                    <th className="pb-2 text-slate-400 font-medium">Description</th>
                  </tr>
                </thead>
                <tbody className="text-slate-300">
                  <tr><td className="py-2"><code className="text-blue-400">command</code></td><td>string</td><td>Command to execute</td></tr>
                  <tr><td className="py-2"><code className="text-blue-400">cwd</code></td><td>string</td><td>Working directory</td></tr>
                  <tr><td className="py-2"><code className="text-blue-400">timeout_seconds</code></td><td>number</td><td>Timeout in seconds</td></tr>
                  <tr><td className="py-2"><code className="text-blue-400">capture_stderr</code></td><td>boolean</td><td>Include stderr in output</td></tr>
                </tbody>
              </table>
            </div>
            <div className="mt-3 bg-slate-900 rounded-lg p-3 font-mono text-xs">
              <p className="text-slate-400">Returns:</p>
              <pre className="text-slate-300">{`{ stdout: "...", stderr: "...", exitCode: 0 }`}</pre>
            </div>
          </div>

          {/* shell_start_session */}
          <div className="border border-slate-600 rounded-lg p-4">
            <h3 className="text-white font-medium mb-2">shell_start_session</h3>
            <p className="text-slate-400 text-sm mb-3">Start an interactive shell session.</p>
            <div className="bg-slate-900 rounded-lg p-3 font-mono text-sm">
              <p className="text-green-400">shell_start_session({`{ command: "python" }`})</p>
              <p className="text-green-400">shell_start_session({`{ command: "node", cwd: "/project" }`})</p>
              <p className="text-slate-400 mt-1">// Returns: {`{ session_id: "abc123", status: "running" }`}</p>
            </div>
            <p className="text-slate-500 text-xs mt-2">Use for: Long-running processes, REPLs, interactive commands</p>
          </div>

          {/* shell_send_input */}
          <div className="border border-slate-600 rounded-lg p-4">
            <h3 className="text-white font-medium mb-2">shell_send_input</h3>
            <p className="text-slate-400 text-sm mb-3">Send input to a running shell session.</p>
            <div className="bg-slate-900 rounded-lg p-3 font-mono text-sm">
              <p className="text-green-400">shell_send_input({`{ session_id: "abc123", input: "print('hello')\\n" }`})</p>
            </div>
            <p className="text-slate-500 text-xs mt-2">Include <code className="bg-slate-700 px-1 rounded">\n</code> for Enter key</p>
          </div>

          {/* shell_stop_session */}
          <div className="border border-slate-600 rounded-lg p-4">
            <h3 className="text-white font-medium mb-2">shell_stop_session</h3>
            <p className="text-slate-400 text-sm mb-3">Stop a shell session.</p>
            <div className="bg-slate-900 rounded-lg p-3 font-mono text-sm">
              <p className="text-green-400">shell_stop_session({`{ session_id: "abc123" }`})</p>
              <p className="text-green-400">shell_stop_session({`{ session_id: "abc123", signal: "KILL" }`})</p>
            </div>
          </div>
        </div>
      </div>

      {/* Common Workflows */}
      <div className="bg-slate-800/50 rounded-xl p-6 border border-slate-700">
        <h2 className="text-xl font-semibold text-white mb-4">Common Workflows</h2>

        <div className="space-y-6">
          <div>
            <h3 className="text-white font-medium mb-2">Find and Read Files</h3>
            <div className="bg-slate-900 rounded-lg p-3 font-mono text-sm">
              <p className="text-slate-400">// Find all JavaScript files</p>
              <p className="text-green-400">fs_search({`{ path: "/project/src", pattern: "**/*.js" }`})</p>
              <p className="text-slate-400 mt-2">// Read a specific file</p>
              <p className="text-green-400">fs_read({`{ path: "/project/src/index.js" }`})</p>
            </div>
          </div>

          <div>
            <h3 className="text-white font-medium mb-2">Run Build Commands</h3>
            <div className="bg-slate-900 rounded-lg p-3 font-mono text-sm overflow-x-auto">
              <pre className="text-green-400">{`// Install dependencies
shell_exec({ command: "npm install", cwd: "/project" })

// Run tests
const result = shell_exec({ command: "npm test", cwd: "/project" })
if (result.exitCode !== 0) {
  console.log("Tests failed:", result.stderr)
}

// Build project
shell_exec({ command: "npm run build", cwd: "/project" })`}</pre>
            </div>
          </div>

          <div>
            <h3 className="text-white font-medium mb-2">Interactive REPL</h3>
            <div className="bg-slate-900 rounded-lg p-3 font-mono text-sm overflow-x-auto">
              <pre className="text-green-400">{`// Start Python session
const session = shell_start_session({ command: "python3" })

// Run commands
shell_send_input({ session_id: session.session_id, input: "x = 5\\n" })
shell_send_input({ session_id: session.session_id, input: "print(x * 2)\\n" })

// End session
shell_stop_session({ session_id: session.session_id })`}</pre>
            </div>
          </div>
        </div>
      </div>

      {/* Best Practices */}
      <div className="bg-slate-800/50 rounded-xl p-6 border border-slate-700">
        <h2 className="text-xl font-semibold text-white mb-4">Best Practices</h2>

        <ul className="list-disc list-inside text-slate-300 space-y-2">
          <li><strong>Check before overwrite:</strong> Use <code className="bg-slate-700 px-1 rounded">fs_read</code> to check file exists before <code className="bg-slate-700 px-1 rounded">fs_write</code></li>
          <li><strong>Use dry_run for patches:</strong> Test <code className="bg-slate-700 px-1 rounded">fs_patch</code> with <code className="bg-slate-700 px-1 rounded">dry_run: true</code> first</li>
          <li><strong>Set timeouts:</strong> Long-running commands should have appropriate <code className="bg-slate-700 px-1 rounded">timeout_seconds</code></li>
          <li><strong>Handle errors:</strong> Check <code className="bg-slate-700 px-1 rounded">exitCode</code> from <code className="bg-slate-700 px-1 rounded">shell_exec</code> to detect failures</li>
          <li><strong>Clean up sessions:</strong> Always call <code className="bg-slate-700 px-1 rounded">shell_stop_session</code> when done</li>
          <li><strong>Use absolute paths:</strong> Prefer absolute paths over relative for reliability</li>
        </ul>
      </div>

      {/* Security Notes */}
      <div className="bg-amber-900/30 border border-amber-600/30 rounded-xl p-6">
        <h2 className="text-lg font-semibold text-amber-300 mb-2">Security Notes</h2>
        <ul className="text-amber-200 text-sm space-y-1">
          <li>• File operations respect system permissions</li>
          <li>• Shell commands run with ScreenControl service permissions</li>
          <li>• Be cautious with <code className="bg-amber-900/50 px-1 rounded">recursive: true</code> on delete operations</li>
          <li>• Avoid running untrusted commands via <code className="bg-amber-900/50 px-1 rounded">shell_exec</code></li>
        </ul>
      </div>
    </div>
  );
}
