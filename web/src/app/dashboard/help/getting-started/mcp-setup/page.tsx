export default function MCPSetupPage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-white mb-3">MCP Setup for Claude Code</h1>
        <p className="text-slate-300 text-lg">
          Configure ScreenControl as an MCP server to give Claude Code access to 90+ automation tools.
        </p>
      </div>

      {/* Overview */}
      <div className="bg-slate-800/50 rounded-xl p-6 border border-slate-700">
        <h2 className="text-xl font-semibold text-white mb-4">Overview</h2>

        <p className="text-slate-300 mb-4">
          The Model Context Protocol (MCP) allows Claude Code to use external tools. ScreenControl provides:
        </p>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="p-3 bg-slate-700/30 rounded-lg text-center">
            <p className="text-2xl font-bold text-blue-400">46+</p>
            <p className="text-slate-400 text-sm">Browser tools</p>
          </div>
          <div className="p-3 bg-slate-700/30 rounded-lg text-center">
            <p className="text-2xl font-bold text-green-400">20+</p>
            <p className="text-slate-400 text-sm">Desktop tools</p>
          </div>
          <div className="p-3 bg-slate-700/30 rounded-lg text-center">
            <p className="text-2xl font-bold text-purple-400">10+</p>
            <p className="text-slate-400 text-sm">File tools</p>
          </div>
          <div className="p-3 bg-slate-700/30 rounded-lg text-center">
            <p className="text-2xl font-bold text-orange-400">4</p>
            <p className="text-slate-400 text-sm">Shell tools</p>
          </div>
        </div>
      </div>

      {/* Configuration Files */}
      <div className="bg-slate-800/50 rounded-xl p-6 border border-slate-700">
        <h2 className="text-xl font-semibold text-white mb-4">Configuration Files</h2>

        <p className="text-slate-300 mb-4">
          Claude Code uses a hierarchy of configuration files:
        </p>

        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-slate-700">
                <th className="pb-3 text-slate-400 font-medium">Location</th>
                <th className="pb-3 text-slate-400 font-medium">Scope</th>
                <th className="pb-3 text-slate-400 font-medium">Priority</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700/50">
              <tr>
                <td className="py-3"><code className="text-blue-400">~/.claude.json</code></td>
                <td className="py-3 text-slate-300">Global (all projects)</td>
                <td className="py-3 text-slate-300">Lower</td>
              </tr>
              <tr>
                <td className="py-3"><code className="text-blue-400">.mcp.json</code></td>
                <td className="py-3 text-slate-300">Project-specific</td>
                <td className="py-3 text-slate-300">Highest</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="mt-4 bg-green-900/30 border border-green-600/30 rounded-lg p-4">
          <p className="text-green-300 text-sm">
            <strong>Recommendation:</strong> Use <code className="bg-green-900/50 px-1 rounded">~/.claude.json</code> for
            ScreenControl so it&apos;s available in all projects.
          </p>
        </div>
      </div>

      {/* Basic Configuration */}
      <div className="bg-slate-800/50 rounded-xl p-6 border border-slate-700">
        <h2 className="text-xl font-semibold text-white mb-4">Basic Configuration</h2>

        <p className="text-slate-300 mb-4">
          Add to your <code className="px-2 py-0.5 bg-slate-700 rounded text-blue-400">~/.claude.json</code>:
        </p>

        <div className="bg-slate-900 rounded-lg p-4 font-mono text-sm overflow-x-auto">
          <pre className="text-green-400">{`{
  "mcpServers": {
    "screencontrol": {
      "command": "/Applications/ScreenControl.app/Contents/MacOS/ScreenControl",
      "args": ["--mcp-stdio"]
    }
  }
}`}</pre>
        </div>
      </div>

      {/* Platform-Specific Paths */}
      <div className="bg-slate-800/50 rounded-xl p-6 border border-slate-700">
        <h2 className="text-xl font-semibold text-white mb-4">Platform-Specific Paths</h2>

        <div className="space-y-4">
          <div>
            <h3 className="text-white font-medium mb-2">macOS</h3>
            <div className="bg-slate-900 rounded-lg p-3 font-mono text-sm">
              <p className="text-green-400">/Applications/ScreenControl.app/Contents/MacOS/ScreenControl</p>
            </div>
          </div>

          <div>
            <h3 className="text-white font-medium mb-2">Windows</h3>
            <div className="bg-slate-900 rounded-lg p-3 font-mono text-sm">
              <p className="text-green-400">C:\\Program Files\\ScreenControl\\ScreenControl.exe</p>
            </div>
          </div>

          <div>
            <h3 className="text-white font-medium mb-2">Linux</h3>
            <div className="bg-slate-900 rounded-lg p-3 font-mono text-sm">
              <p className="text-green-400">/usr/local/bin/screencontrol</p>
            </div>
          </div>
        </div>
      </div>

      {/* Advanced Configuration */}
      <div className="bg-slate-800/50 rounded-xl p-6 border border-slate-700">
        <h2 className="text-xl font-semibold text-white mb-4">Advanced Configuration</h2>

        <div className="space-y-6">
          <div>
            <h3 className="text-white font-medium mb-2">With Debug Logging</h3>
            <div className="bg-slate-900 rounded-lg p-4 font-mono text-sm overflow-x-auto">
              <pre className="text-green-400">{`{
  "mcpServers": {
    "screencontrol": {
      "type": "stdio",
      "command": "/Applications/ScreenControl.app/Contents/MacOS/ScreenControl",
      "args": ["--mcp-stdio"],
      "env": {
        "SCREENCONTROL_LOG_LEVEL": "debug"
      }
    }
  }
}`}</pre>
            </div>
          </div>

          <div>
            <h3 className="text-white font-medium mb-2">Multiple MCP Servers</h3>
            <div className="bg-slate-900 rounded-lg p-4 font-mono text-sm overflow-x-auto">
              <pre className="text-green-400">{`{
  "mcpServers": {
    "screencontrol": {
      "command": "/Applications/ScreenControl.app/Contents/MacOS/ScreenControl",
      "args": ["--mcp-stdio"]
    },
    "playwright": {
      "command": "npx",
      "args": ["@playwright/mcp@latest"]
    }
  }
}`}</pre>
            </div>
          </div>
        </div>
      </div>

      {/* Verify Setup */}
      <div className="bg-slate-800/50 rounded-xl p-6 border border-slate-700">
        <h2 className="text-xl font-semibold text-white mb-4">Verify Setup</h2>

        <ol className="list-decimal list-inside text-slate-300 space-y-3">
          <li className="text-slate-300">
            <strong>Restart Claude Code</strong> after updating configuration
          </li>
          <li className="text-slate-300">
            <strong>Run <code className="bg-slate-700 px-1 rounded">/mcp</code></strong> to check server status
          </li>
          <li className="text-slate-300">
            <strong>Look for:</strong>
            <div className="bg-slate-900 rounded-lg p-3 mt-2 font-mono text-sm ml-6">
              <p className="text-white">screencontrol: ✓ connected (90 tools)</p>
            </div>
          </li>
        </ol>
      </div>

      {/* Troubleshooting */}
      <div className="bg-slate-800/50 rounded-xl p-6 border border-slate-700">
        <h2 className="text-xl font-semibold text-white mb-4">Common Issues</h2>

        <div className="space-y-4">
          <div className="border border-slate-600 rounded-lg p-4">
            <h3 className="text-white font-medium mb-2">Status: ✘ failed</h3>
            <ul className="list-disc list-inside text-slate-300 text-sm space-y-1">
              <li>Check the path exists: <code className="bg-slate-700 px-1 rounded">ls /Applications/ScreenControl.app</code></li>
              <li>Verify code signature: <code className="bg-slate-700 px-1 rounded">codesign -v /Applications/ScreenControl.app</code></li>
              <li>Run manually to see errors: <code className="bg-slate-700 px-1 rounded">/Applications/ScreenControl.app/Contents/MacOS/ScreenControl --mcp-stdio</code></li>
            </ul>
          </div>

          <div className="border border-slate-600 rounded-lg p-4">
            <h3 className="text-white font-medium mb-2">Only 39 Tools (Missing Browser Tools)</h3>
            <p className="text-slate-300 text-sm mb-2">Browser tools require:</p>
            <ul className="list-disc list-inside text-slate-300 text-sm space-y-1">
              <li>ScreenControl.app must be running (GUI mode, not just --mcp-stdio)</li>
              <li>Look for the googly eyes icon in menu bar</li>
              <li>Browser extension must be connected</li>
            </ul>
          </div>

          <div className="border border-slate-600 rounded-lg p-4">
            <h3 className="text-white font-medium mb-2">Config Not Loading</h3>
            <ul className="list-disc list-inside text-slate-300 text-sm space-y-1">
              <li>Check JSON syntax: <code className="bg-slate-700 px-1 rounded">cat ~/.claude.json | jq .</code></li>
              <li>Verify mcpServers section exists</li>
              <li>Check for duplicate entries</li>
              <li>Look for project-level <code className="bg-slate-700 px-1 rounded">.mcp.json</code> overrides</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Architecture Diagram */}
      <div className="bg-slate-800/50 rounded-xl p-6 border border-slate-700">
        <h2 className="text-xl font-semibold text-white mb-4">Multi-Instance Architecture</h2>

        <p className="text-slate-300 mb-4">
          Multiple Claude Code instances can share browser tools through a single GUI app:
        </p>

        <div className="bg-slate-900 rounded-lg p-4 font-mono text-xs overflow-x-auto">
          <pre className="text-slate-300">{`┌─────────────────────────────────────────────────────────────────┐
│  Claude Code #1              Claude Code #2                     │
│       ↓                           ↓                             │
│  StdioMCPBridge #1          StdioMCPBridge #2                   │
│       │                           │                             │
│       └───────────┬───────────────┘                             │
│                   │ HTTP POST :3457                             │
│                   ▼                                             │
│          ScreenControl.app (GUI)                                │
│          BrowserWebSocketServer :3457                           │
│                   │                                             │
│                   ▼ WebSocket                                   │
│          Browser Extension                                      │
└─────────────────────────────────────────────────────────────────┘`}</pre>
        </div>
      </div>
    </div>
  );
}
