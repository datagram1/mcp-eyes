import Link from 'next/link';

export default function GettingStartedPage() {
  return (
    <div className="space-y-8">
      {/* Hero */}
      <div className="bg-gradient-to-r from-green-600/20 to-emerald-600/20 rounded-xl p-8 border border-green-500/30">
        <h1 className="text-3xl font-bold text-white mb-3">Getting Started with ScreenControl</h1>
        <p className="text-slate-300 text-lg max-w-2xl">
          Get up and running with desktop and browser automation in minutes. This guide walks you through
          installation, permissions, and MCP configuration.
        </p>
      </div>

      {/* Quick Start Steps */}
      <div className="bg-slate-800/50 rounded-xl p-6 border border-slate-700">
        <h2 className="text-xl font-semibold text-white mb-6">Quick Start (5 minutes)</h2>

        <div className="space-y-6">
          {/* Step 1 */}
          <div className="flex gap-4">
            <div className="flex-shrink-0 w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center text-white font-bold">
              1
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-medium text-white mb-2">Install ScreenControl</h3>
              <p className="text-slate-300 mb-3">
                Download and install the ScreenControl app for your platform.
              </p>
              <div className="bg-slate-900 rounded-lg p-4 font-mono text-sm">
                <p className="text-slate-400"># macOS</p>
                <p className="text-green-400">cp -R /path/to/ScreenControl.app /Applications/</p>
              </div>
              <Link href="/dashboard/help/getting-started/installation" className="inline-block mt-3 text-blue-400 hover:text-blue-300 text-sm">
                Detailed installation guide →
              </Link>
            </div>
          </div>

          {/* Step 2 */}
          <div className="flex gap-4">
            <div className="flex-shrink-0 w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center text-white font-bold">
              2
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-medium text-white mb-2">Grant Permissions</h3>
              <p className="text-slate-300 mb-3">
                On macOS, grant Screen Recording and Accessibility permissions.
              </p>
              <div className="bg-slate-900 rounded-lg p-4">
                <p className="text-slate-300 text-sm">
                  System Preferences → Privacy & Security → Screen Recording → ✓ ScreenControl
                </p>
                <p className="text-slate-300 text-sm mt-2">
                  System Preferences → Privacy & Security → Accessibility → ✓ ScreenControl
                </p>
              </div>
              <Link href="/dashboard/help/getting-started/permissions" className="inline-block mt-3 text-blue-400 hover:text-blue-300 text-sm">
                Full permissions guide →
              </Link>
            </div>
          </div>

          {/* Step 3 */}
          <div className="flex gap-4">
            <div className="flex-shrink-0 w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center text-white font-bold">
              3
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-medium text-white mb-2">Configure MCP for Claude Code</h3>
              <p className="text-slate-300 mb-3">
                Add ScreenControl to your Claude Code configuration.
              </p>
              <div className="bg-slate-900 rounded-lg p-4 font-mono text-sm overflow-x-auto">
                <p className="text-slate-400"># Add to ~/.claude.json</p>
                <pre className="text-green-400">{`{
  "mcpServers": {
    "screencontrol": {
      "command": "/Applications/ScreenControl.app/Contents/MacOS/ScreenControl",
      "args": ["--mcp-stdio"]
    }
  }
}`}</pre>
              </div>
              <Link href="/dashboard/help/getting-started/mcp-setup" className="inline-block mt-3 text-blue-400 hover:text-blue-300 text-sm">
                Complete MCP setup guide →
              </Link>
            </div>
          </div>

          {/* Step 4 */}
          <div className="flex gap-4">
            <div className="flex-shrink-0 w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center text-white font-bold">
              4
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-medium text-white mb-2">Install Browser Extension (Optional)</h3>
              <p className="text-slate-300 mb-3">
                For browser automation, install the ScreenControl extension.
              </p>
              <div className="flex flex-wrap gap-3 mt-3">
                <span className="px-3 py-1 bg-orange-500/20 text-orange-400 rounded-full text-sm">Firefox</span>
                <span className="px-3 py-1 bg-blue-500/20 text-blue-400 rounded-full text-sm">Chrome</span>
                <span className="px-3 py-1 bg-purple-500/20 text-purple-400 rounded-full text-sm">Safari</span>
                <span className="px-3 py-1 bg-cyan-500/20 text-cyan-400 rounded-full text-sm">Edge</span>
              </div>
            </div>
          </div>

          {/* Step 5 */}
          <div className="flex gap-4">
            <div className="flex-shrink-0 w-8 h-8 bg-green-600 rounded-full flex items-center justify-center text-white font-bold">
              ✓
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-medium text-white mb-2">Verify Setup</h3>
              <p className="text-slate-300 mb-3">
                Restart Claude Code and check the MCP status.
              </p>
              <div className="bg-slate-900 rounded-lg p-4 font-mono text-sm">
                <p className="text-slate-400"># In Claude Code, run:</p>
                <p className="text-green-400">/mcp</p>
                <p className="text-slate-400 mt-2"># You should see:</p>
                <p className="text-white">screencontrol: ✓ connected (90 tools)</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* What's Included */}
      <div className="bg-slate-800/50 rounded-xl p-6 border border-slate-700">
        <h2 className="text-xl font-semibold text-white mb-4">What&apos;s Included</h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="p-4 bg-slate-700/30 rounded-lg">
            <h3 className="text-white font-medium mb-2">Desktop Automation</h3>
            <p className="text-slate-400 text-sm">
              Screenshots, mouse control, keyboard input, window management across all monitors.
            </p>
          </div>

          <div className="p-4 bg-slate-700/30 rounded-lg">
            <h3 className="text-white font-medium mb-2">Browser Automation</h3>
            <p className="text-slate-400 text-sm">
              46+ tools for web interaction via browser extension - click, fill forms, read content.
            </p>
          </div>

          <div className="p-4 bg-slate-700/30 rounded-lg">
            <h3 className="text-white font-medium mb-2">Grid-Based Interaction</h3>
            <p className="text-slate-400 text-sm">
              Visual grid overlay with OCR for native apps and blocked websites.
            </p>
          </div>

          <div className="p-4 bg-slate-700/30 rounded-lg">
            <h3 className="text-white font-medium mb-2">File & Shell Operations</h3>
            <p className="text-slate-400 text-sm">
              Read, write, search files. Execute shell commands and manage processes.
            </p>
          </div>
        </div>
      </div>

      {/* Next Steps */}
      <div className="bg-slate-800/50 rounded-xl p-6 border border-slate-700">
        <h2 className="text-xl font-semibold text-white mb-4">Next Steps</h2>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Link
            href="/dashboard/help/tools"
            className="group p-4 bg-slate-700/30 rounded-lg hover:bg-slate-700/50 transition-colors"
          >
            <h3 className="text-white font-medium mb-2 group-hover:text-blue-400 transition-colors">
              Tools Reference →
            </h3>
            <p className="text-slate-400 text-sm">
              Learn which tool to use for each task
            </p>
          </Link>

          <Link
            href="/dashboard/help/platforms"
            className="group p-4 bg-slate-700/30 rounded-lg hover:bg-slate-700/50 transition-colors"
          >
            <h3 className="text-white font-medium mb-2 group-hover:text-blue-400 transition-colors">
              Platform Guides →
            </h3>
            <p className="text-slate-400 text-sm">
              Platform-specific setup instructions
            </p>
          </Link>

          <Link
            href="/dashboard/help/troubleshooting"
            className="group p-4 bg-slate-700/30 rounded-lg hover:bg-slate-700/50 transition-colors"
          >
            <h3 className="text-white font-medium mb-2 group-hover:text-blue-400 transition-colors">
              Troubleshooting →
            </h3>
            <p className="text-slate-400 text-sm">
              Solutions to common issues
            </p>
          </Link>
        </div>
      </div>
    </div>
  );
}
