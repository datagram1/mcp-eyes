import Link from 'next/link';

export default function TroubleshootingPage() {
  return (
    <div className="space-y-8">
      {/* Hero */}
      <div className="bg-gradient-to-r from-orange-600/20 to-red-600/20 rounded-xl p-8 border border-orange-500/30">
        <h1 className="text-3xl font-bold text-white mb-3">Troubleshooting</h1>
        <p className="text-slate-300 text-lg max-w-2xl">
          Solutions to common issues with ScreenControl. If you don&apos;t find your answer here,
          check the GitHub issues or ask for help.
        </p>
      </div>

      {/* Quick Diagnostics */}
      <div className="bg-slate-800/50 rounded-xl p-6 border border-slate-700">
        <h2 className="text-xl font-semibold text-white mb-4">Quick Diagnostics</h2>

        <div className="space-y-4">
          <div className="bg-slate-900 rounded-lg p-4 font-mono text-sm">
            <p className="text-slate-400"># Check MCP status in Claude Code</p>
            <p className="text-green-400">/mcp</p>
          </div>

          <div className="bg-slate-900 rounded-lg p-4 font-mono text-sm">
            <p className="text-slate-400"># Verify permissions</p>
            <p className="text-green-400">checkPermissions()</p>
          </div>

          <div className="bg-slate-900 rounded-lg p-4 font-mono text-sm">
            <p className="text-slate-400"># Check browser extension connection</p>
            <p className="text-green-400">browser_listConnected()</p>
          </div>

          <div className="bg-slate-900 rounded-lg p-4 font-mono text-sm">
            <p className="text-slate-400"># Test browser extension from terminal</p>
            <p className="text-green-400">curl -X POST http://127.0.0.1:3457/command -H &quot;Content-Type: application/json&quot; -d &apos;{`{"action":"getTabs"}`}&apos;</p>
          </div>
        </div>
      </div>

      {/* MCP Connection Issues */}
      <div className="bg-slate-800/50 rounded-xl p-6 border border-slate-700">
        <h2 className="text-xl font-semibold text-white mb-4">MCP Connection Issues</h2>

        <div className="space-y-6">
          <div className="border border-red-600/30 bg-red-900/20 rounded-lg p-4">
            <h3 className="text-red-300 font-medium mb-2">Status: ✘ failed</h3>
            <p className="text-slate-300 text-sm mb-3">The MCP server failed to start.</p>
            <div className="space-y-2">
              <p className="text-slate-400 text-sm">1. Check path exists:</p>
              <div className="bg-slate-900 rounded p-2 font-mono text-xs">
                <p className="text-green-400">ls /Applications/ScreenControl.app</p>
              </div>
              <p className="text-slate-400 text-sm mt-2">2. Verify code signature:</p>
              <div className="bg-slate-900 rounded p-2 font-mono text-xs">
                <p className="text-green-400">codesign -v /Applications/ScreenControl.app</p>
              </div>
              <p className="text-slate-400 text-sm mt-2">3. Run manually to see errors:</p>
              <div className="bg-slate-900 rounded p-2 font-mono text-xs">
                <p className="text-green-400">/Applications/ScreenControl.app/Contents/MacOS/ScreenControl --mcp-stdio</p>
              </div>
            </div>
          </div>

          <div className="border border-yellow-600/30 bg-yellow-900/20 rounded-lg p-4">
            <h3 className="text-yellow-300 font-medium mb-2">Only 39 Tools (Missing Browser Tools)</h3>
            <p className="text-slate-300 text-sm mb-3">Browser tools require the GUI app and extension.</p>
            <ul className="list-disc list-inside text-slate-300 text-sm space-y-1">
              <li>Ensure ScreenControl.app is running (check menu bar for 👀)</li>
              <li>If not running: <code className="bg-slate-700 px-1 rounded">open /Applications/ScreenControl.app</code></li>
              <li>Verify browser extension is installed and connected</li>
              <li>Test: <code className="bg-slate-700 px-1 rounded">curl http://127.0.0.1:3457/command -X POST -d &apos;{`{"action":"getTabs"}`}&apos;</code></li>
            </ul>
          </div>

          <div className="border border-slate-600 rounded-lg p-4">
            <h3 className="text-white font-medium mb-2">Config Not Loading</h3>
            <ul className="list-disc list-inside text-slate-300 text-sm space-y-1">
              <li>Check JSON syntax: <code className="bg-slate-700 px-1 rounded">cat ~/.claude.json | jq .</code></li>
              <li>Verify mcpServers section exists</li>
              <li>Check for duplicate entries</li>
              <li>Look for project-level .mcp.json overrides</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Permission Issues */}
      <div className="bg-slate-800/50 rounded-xl p-6 border border-slate-700">
        <h2 className="text-xl font-semibold text-white mb-4">Permission Issues (macOS)</h2>

        <div className="space-y-6">
          <div className="border border-slate-600 rounded-lg p-4">
            <h3 className="text-white font-medium mb-2">Screenshots are Blank</h3>
            <p className="text-slate-300 text-sm mb-2">Screen Recording permission not granted.</p>
            <ol className="list-decimal list-inside text-slate-300 text-sm space-y-1">
              <li>Open System Preferences → Privacy & Security → Screen Recording</li>
              <li>Enable ScreenControl.app</li>
              <li>Enable your terminal (iTerm2, Terminal, etc.)</li>
              <li>Restart the app</li>
            </ol>
          </div>

          <div className="border border-slate-600 rounded-lg p-4">
            <h3 className="text-white font-medium mb-2">Clicks Don&apos;t Register</h3>
            <p className="text-slate-300 text-sm mb-2">Accessibility permission not granted.</p>
            <ol className="list-decimal list-inside text-slate-300 text-sm space-y-1">
              <li>Open System Preferences → Privacy & Security → Accessibility</li>
              <li>Enable ScreenControl.app</li>
              <li>Enable your terminal</li>
              <li>Restart the app</li>
            </ol>
          </div>

          <div className="border border-slate-600 rounded-lg p-4">
            <h3 className="text-white font-medium mb-2">Reset All Permissions</h3>
            <div className="bg-slate-900 rounded-lg p-3 font-mono text-sm">
              <p className="text-green-400">sudo tccutil reset Accessibility</p>
              <p className="text-green-400">sudo tccutil reset ScreenCapture</p>
            </div>
            <p className="text-slate-400 text-xs mt-2">Then re-grant permissions and restart.</p>
          </div>
        </div>
      </div>

      {/* Click/Interaction Issues */}
      <div className="bg-slate-800/50 rounded-xl p-6 border border-slate-700">
        <h2 className="text-xl font-semibold text-white mb-4">Click & Interaction Issues</h2>

        <div className="space-y-4">
          <div className="border border-slate-600 rounded-lg p-4">
            <h3 className="text-white font-medium mb-2">browser_clickElement Fails</h3>
            <p className="text-slate-300 text-sm mb-2">Try these alternatives:</p>
            <ol className="list-decimal list-inside text-slate-300 text-sm space-y-1">
              <li>Use browser_clickByText with visible text</li>
              <li>Use browser_getInteractiveElements to find correct selector</li>
              <li>Fall back to grid tools: <code className="bg-slate-700 px-1 rounded">screenshot_grid</code> + <code className="bg-slate-700 px-1 rounded">click_grid</code></li>
            </ol>
          </div>

          <div className="border border-slate-600 rounded-lg p-4">
            <h3 className="text-white font-medium mb-2">click_grid Misses Target</h3>
            <ul className="list-disc list-inside text-slate-300 text-sm space-y-1">
              <li>OCR may not have detected the text</li>
              <li>Use <code className="bg-slate-700 px-1 rounded">click_relative</code> with pixel coordinates instead</li>
              <li>Check centerX/centerY in screenshot_grid elements array</li>
              <li>Use offset_y to click below detected text</li>
            </ul>
          </div>

          <div className="border border-slate-600 rounded-lg p-4">
            <h3 className="text-white font-medium mb-2">Click Goes to Wrong Window</h3>
            <ul className="list-disc list-inside text-slate-300 text-sm space-y-1">
              <li>Ensure focus: true (default) or call focusApplication first</li>
              <li>Specify identifier parameter explicitly</li>
              <li>Multi-monitor: grid tools handle this automatically</li>
            </ul>
          </div>

          <div className="border border-slate-600 rounded-lg p-4">
            <h3 className="text-white font-medium mb-2">typeText Enters Wrong Characters</h3>
            <p className="text-slate-300 text-sm mb-2">For iOS Simulator:</p>
            <ul className="list-disc list-inside text-slate-300 text-sm space-y-1">
              <li>Press Cmd+K to toggle hardware keyboard off</li>
              <li>Use click_relative to tap on-screen keyboard keys</li>
              <li>Type slowly, allow time between key taps</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Browser Extension Issues */}
      <div className="bg-slate-800/50 rounded-xl p-6 border border-slate-700">
        <h2 className="text-xl font-semibold text-white mb-4">Browser Extension Issues</h2>

        <div className="space-y-4">
          <div className="border border-slate-600 rounded-lg p-4">
            <h3 className="text-white font-medium mb-2">Extension Not Connected</h3>
            <ul className="list-disc list-inside text-slate-300 text-sm space-y-1">
              <li>Verify extension is installed and enabled</li>
              <li>Check ScreenControl.app is running (menu bar icon)</li>
              <li>Try refreshing the web page</li>
              <li>Test port: <code className="bg-slate-700 px-1 rounded">curl http://127.0.0.1:3457/command -X POST</code></li>
            </ul>
          </div>

          <div className="border border-slate-600 rounded-lg p-4">
            <h3 className="text-white font-medium mb-2">Website Blocks Extension</h3>
            <p className="text-slate-300 text-sm mb-2">Some sites (banking, DRM content) block extensions. Use grid tools instead:</p>
            <div className="bg-slate-900 rounded-lg p-3 font-mono text-sm">
              <p className="text-green-400">screenshot_grid({`{ identifier: "Firefox" }`})</p>
              <p className="text-green-400">click_grid({`{ element_text: "Submit" }`})</p>
              <p className="text-green-400">typeText({`{ text: "input value" }`})</p>
            </div>
          </div>

          <div className="border border-slate-600 rounded-lg p-4">
            <h3 className="text-white font-medium mb-2">Wrong Tab Targeted</h3>
            <p className="text-slate-300 text-sm">Use explicit targeting:</p>
            <div className="bg-slate-900 rounded-lg p-3 font-mono text-sm mt-2">
              <p className="text-slate-400">// By URL pattern (works in background)</p>
              <p className="text-green-400">browser_clickElement({`{ selector: "button", url: "github.com" }`})</p>
              <p className="text-slate-400 mt-2">// By tab ID</p>
              <p className="text-green-400">browser_clickElement({`{ selector: "button", tabId: 123 }`})</p>
            </div>
          </div>
        </div>
      </div>

      {/* macOS Specific */}
      <div className="bg-slate-800/50 rounded-xl p-6 border border-slate-700">
        <h2 className="text-xl font-semibold text-white mb-4">macOS Specific Issues</h2>

        <div className="space-y-4">
          <div className="border border-slate-600 rounded-lg p-4">
            <h3 className="text-white font-medium mb-2">&quot;App is damaged&quot; Error</h3>
            <div className="bg-slate-900 rounded-lg p-3 font-mono text-sm">
              <p className="text-green-400">xattr -cr /Applications/ScreenControl.app</p>
            </div>
          </div>

          <div className="border border-slate-600 rounded-lg p-4">
            <h3 className="text-white font-medium mb-2">SIGKILL (Code Signature Invalid)</h3>
            <div className="bg-slate-900 rounded-lg p-3 font-mono text-sm">
              <p className="text-green-400">codesign --force --deep --sign - /Applications/ScreenControl.app</p>
            </div>
          </div>

          <div className="border border-slate-600 rounded-lg p-4">
            <h3 className="text-white font-medium mb-2">iOS Simulator Issues</h3>
            <ul className="list-disc list-inside text-slate-300 text-sm space-y-1">
              <li>Use screenshot_grid with identifier: &quot;Simulator&quot;</li>
              <li>Press Cmd+K to toggle software keyboard</li>
              <li>Use click_relative for keyboard keys</li>
              <li>Add wait() between typing actions</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Still Stuck */}
      <div className="bg-slate-800/50 rounded-xl p-6 border border-slate-700">
        <h2 className="text-xl font-semibold text-white mb-4">Still Stuck?</h2>

        <div className="flex flex-wrap gap-4">
          <a
            href="https://github.com/anthropics/screen-control/issues"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 px-4 py-2 bg-slate-700 rounded-lg text-slate-300 hover:text-white hover:bg-slate-600 transition-colors"
          >
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
              <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.477 2 12c0 4.42 2.865 8.17 6.839 9.49.5.092.682-.217.682-.482 0-.237-.008-.866-.013-1.7-2.782.604-3.369-1.34-3.369-1.34-.454-1.156-1.11-1.463-1.11-1.463-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.578 9.578 0 0112 6.836c.85.004 1.705.114 2.504.336 1.909-1.294 2.747-1.025 2.747-1.025.546 1.377.203 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.743 0 .267.18.578.688.48C19.138 20.167 22 16.418 22 12c0-5.523-4.477-10-10-10z" />
            </svg>
            Report Issue on GitHub
          </a>
          <Link
            href="/dashboard/help"
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 rounded-lg text-white hover:bg-blue-700 transition-colors"
          >
            Back to Help Home
          </Link>
        </div>
      </div>
    </div>
  );
}
