import Link from 'next/link';

export default function MacOSPage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-white mb-3">macOS Setup Guide</h1>
        <p className="text-slate-300 text-lg">
          Complete guide for installing and configuring ScreenControl on macOS.
        </p>
      </div>

      {/* Requirements */}
      <div className="bg-slate-800/50 rounded-xl p-6 border border-slate-700">
        <h2 className="text-xl font-semibold text-white mb-4">System Requirements</h2>

        <ul className="list-disc list-inside text-slate-300 space-y-2">
          <li>macOS 12.0 (Monterey) or later</li>
          <li>Apple Silicon (M1/M2/M3/M4) or Intel processor</li>
          <li>Screen Recording permission</li>
          <li>Accessibility permission</li>
        </ul>
      </div>

      {/* Installation */}
      <div className="bg-slate-800/50 rounded-xl p-6 border border-slate-700">
        <h2 className="text-xl font-semibold text-white mb-4">Installation</h2>

        <div className="space-y-4">
          <div>
            <h3 className="text-white font-medium mb-2">Step 1: Copy to Applications</h3>
            <div className="bg-slate-900 rounded-lg p-4 font-mono text-sm">
              <p className="text-green-400">cp -R /path/to/ScreenControl.app /Applications/</p>
            </div>
          </div>

          <div>
            <h3 className="text-white font-medium mb-2">Step 2: First Launch</h3>
            <p className="text-slate-300 text-sm">
              Double-click ScreenControl.app in Applications. If you see &quot;app is damaged&quot;:
            </p>
            <div className="bg-slate-900 rounded-lg p-4 font-mono text-sm mt-2">
              <p className="text-green-400">xattr -cr /Applications/ScreenControl.app</p>
            </div>
          </div>

          <div>
            <h3 className="text-white font-medium mb-2">Step 3: Menu Bar</h3>
            <p className="text-slate-300 text-sm">
              Look for the googly eyes icon (👀) in your menu bar. This indicates ScreenControl is running.
            </p>
          </div>
        </div>
      </div>

      {/* Permissions */}
      <div className="bg-slate-800/50 rounded-xl p-6 border border-slate-700">
        <h2 className="text-xl font-semibold text-white mb-4">Required Permissions</h2>

        <div className="space-y-6">
          <div className="border border-slate-600 rounded-lg p-4">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
                <span className="text-white text-lg">📺</span>
              </div>
              <h3 className="text-white font-medium">Screen Recording</h3>
            </div>
            <ol className="list-decimal list-inside text-slate-300 text-sm space-y-1">
              <li>Open System Preferences → Privacy & Security</li>
              <li>Click Screen Recording in the sidebar</li>
              <li>Enable ScreenControl.app</li>
              <li>Also enable your terminal (iTerm2, Terminal, etc.)</li>
            </ol>
          </div>

          <div className="border border-slate-600 rounded-lg p-4">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-8 h-8 bg-purple-600 rounded-lg flex items-center justify-center">
                <span className="text-white text-lg">🖱️</span>
              </div>
              <h3 className="text-white font-medium">Accessibility</h3>
            </div>
            <ol className="list-decimal list-inside text-slate-300 text-sm space-y-1">
              <li>Open System Preferences → Privacy & Security</li>
              <li>Click Accessibility in the sidebar</li>
              <li>Enable ScreenControl.app</li>
              <li>Enable your terminal for Claude Code</li>
            </ol>
          </div>
        </div>

        <div className="mt-4 bg-amber-900/30 border border-amber-600/30 rounded-lg p-4">
          <p className="text-amber-300 text-sm">
            <strong>Note:</strong> After granting permissions, you may need to quit and relaunch ScreenControl.
          </p>
        </div>
      </div>

      {/* MCP Configuration */}
      <div className="bg-slate-800/50 rounded-xl p-6 border border-slate-700">
        <h2 className="text-xl font-semibold text-white mb-4">Claude Code Configuration</h2>

        <p className="text-slate-300 mb-4">
          Add to <code className="px-2 py-0.5 bg-slate-700 rounded text-blue-400">~/.claude.json</code>:
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

        <div className="mt-4">
          <p className="text-slate-400 text-sm">Restart Claude Code and run <code className="bg-slate-700 px-1 rounded">/mcp</code> to verify.</p>
        </div>
      </div>

      {/* Browser Extension */}
      <div className="bg-slate-800/50 rounded-xl p-6 border border-slate-700">
        <h2 className="text-xl font-semibold text-white mb-4">Browser Extension</h2>

        <p className="text-slate-300 mb-4">
          Install the ScreenControl extension for browser automation:
        </p>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="p-3 bg-slate-700/30 rounded-lg text-center">
            <p className="text-orange-400 text-2xl mb-1">🦊</p>
            <p className="text-white text-sm font-medium">Firefox</p>
            <p className="text-slate-400 text-xs">Recommended</p>
          </div>
          <div className="p-3 bg-slate-700/30 rounded-lg text-center">
            <p className="text-blue-400 text-2xl mb-1">🌐</p>
            <p className="text-white text-sm font-medium">Chrome</p>
            <p className="text-slate-400 text-xs">Supported</p>
          </div>
          <div className="p-3 bg-slate-700/30 rounded-lg text-center">
            <p className="text-purple-400 text-2xl mb-1">🧭</p>
            <p className="text-white text-sm font-medium">Safari</p>
            <p className="text-slate-400 text-xs">macOS only</p>
          </div>
          <div className="p-3 bg-slate-700/30 rounded-lg text-center">
            <p className="text-cyan-400 text-2xl mb-1">🔷</p>
            <p className="text-white text-sm font-medium">Edge</p>
            <p className="text-slate-400 text-xs">Supported</p>
          </div>
        </div>
      </div>

      {/* Troubleshooting */}
      <div className="bg-slate-800/50 rounded-xl p-6 border border-slate-700">
        <h2 className="text-xl font-semibold text-white mb-4">Troubleshooting</h2>

        <div className="space-y-4">
          <div className="border border-slate-600 rounded-lg p-4">
            <h3 className="text-white font-medium mb-2">&quot;App is damaged&quot; error</h3>
            <div className="bg-slate-900 rounded-lg p-3 font-mono text-sm">
              <p className="text-green-400">xattr -cr /Applications/ScreenControl.app</p>
            </div>
          </div>

          <div className="border border-slate-600 rounded-lg p-4">
            <h3 className="text-white font-medium mb-2">Code signature invalid</h3>
            <div className="bg-slate-900 rounded-lg p-3 font-mono text-sm">
              <p className="text-green-400">codesign --force --deep --sign - /Applications/ScreenControl.app</p>
            </div>
          </div>

          <div className="border border-slate-600 rounded-lg p-4">
            <h3 className="text-white font-medium mb-2">Reset permissions</h3>
            <div className="bg-slate-900 rounded-lg p-3 font-mono text-sm">
              <p className="text-green-400">sudo tccutil reset Accessibility</p>
              <p className="text-green-400">sudo tccutil reset ScreenCapture</p>
            </div>
          </div>

          <div className="border border-slate-600 rounded-lg p-4">
            <h3 className="text-white font-medium mb-2">Only 39 tools (missing browser)</h3>
            <p className="text-slate-300 text-sm">
              Ensure ScreenControl.app is running (check menu bar for 👀 icon) and browser extension is connected.
            </p>
          </div>
        </div>
      </div>

      {/* Next Steps */}
      <div className="flex flex-wrap gap-4">
        <Link
          href="/dashboard/help/getting-started/mcp-setup"
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          MCP Setup Guide →
        </Link>
        <Link
          href="/dashboard/help/troubleshooting"
          className="px-4 py-2 bg-slate-700 text-white rounded-lg hover:bg-slate-600 transition-colors"
        >
          Troubleshooting →
        </Link>
      </div>
    </div>
  );
}
