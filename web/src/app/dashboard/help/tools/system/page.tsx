export default function SystemToolsPage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-white mb-3">System Tools</h1>
        <p className="text-slate-300 text-lg">
          System information, clipboard access, and window management tools.
        </p>
      </div>

      {/* System Information */}
      <div className="bg-slate-800/50 rounded-xl p-6 border border-slate-700">
        <h2 className="text-xl font-semibold text-white mb-4">System Information</h2>

        <div className="space-y-6">
          <div className="border border-slate-600 rounded-lg p-4">
            <h3 className="text-white font-medium mb-2">system_info</h3>
            <p className="text-slate-400 text-sm mb-3">Get system information including OS, CPU, memory, and hostname.</p>
            <div className="bg-slate-900 rounded-lg p-3 font-mono text-sm">
              <p className="text-green-400">system_info()</p>
              <p className="text-slate-400 mt-2">// Returns:</p>
              <pre className="text-slate-300">{`{
  "os": "macOS",
  "version": "14.2.1",
  "cpu": "Apple M2 Pro",
  "memory": "32 GB",
  "hostname": "MacBook-Pro.local"
}`}</pre>
            </div>
            <p className="text-slate-500 text-xs mt-2">Use for: Environment understanding, platform-specific logic, logging</p>
          </div>

          <div className="border border-slate-600 rounded-lg p-4">
            <h3 className="text-white font-medium mb-2">checkPermissions</h3>
            <p className="text-slate-400 text-sm mb-3">Verify accessibility permissions are granted.</p>
            <div className="bg-slate-900 rounded-lg p-3 font-mono text-sm">
              <p className="text-green-400">checkPermissions()</p>
              <p className="text-slate-400 mt-2">// Returns:</p>
              <pre className="text-slate-300">{`{
  "screenRecording": true,
  "accessibility": true
}`}</pre>
            </div>
            <p className="text-slate-500 text-xs mt-2">Use for: Debugging why clicks don&apos;t work, initial setup verification</p>
          </div>
        </div>
      </div>

      {/* Clipboard */}
      <div className="bg-slate-800/50 rounded-xl p-6 border border-slate-700">
        <h2 className="text-xl font-semibold text-white mb-4">Clipboard</h2>

        <div className="space-y-6">
          <div className="border border-slate-600 rounded-lg p-4">
            <h3 className="text-white font-medium mb-2">clipboard_read</h3>
            <p className="text-slate-400 text-sm mb-3">Read text from the system clipboard.</p>
            <div className="bg-slate-900 rounded-lg p-3 font-mono text-sm">
              <p className="text-green-400">clipboard_read()</p>
              <p className="text-slate-400 mt-1">// Returns: {`{ text: "clipboard contents" }`}</p>
            </div>
            <p className="text-slate-500 text-xs mt-2">Use for: Getting copied text, verifying copy operations, data transfer</p>
          </div>

          <div className="border border-slate-600 rounded-lg p-4">
            <h3 className="text-white font-medium mb-2">clipboard_write</h3>
            <p className="text-slate-400 text-sm mb-3">Write text to the system clipboard.</p>
            <div className="bg-slate-900 rounded-lg p-3 font-mono text-sm">
              <p className="text-green-400">clipboard_write({`{ text: "text to copy" }`})</p>
            </div>
            <p className="text-slate-500 text-xs mt-2">Use for: Preparing for paste operations, sharing data between apps</p>
          </div>
        </div>
      </div>

      {/* Window Management */}
      <div className="bg-slate-800/50 rounded-xl p-6 border border-slate-700">
        <h2 className="text-xl font-semibold text-white mb-4">Window Management</h2>

        <div className="space-y-6">
          <div className="border border-slate-600 rounded-lg p-4">
            <h3 className="text-white font-medium mb-2">window_list</h3>
            <p className="text-slate-400 text-sm mb-3">List all open windows on the desktop.</p>
            <div className="bg-slate-900 rounded-lg p-3 font-mono text-sm">
              <p className="text-green-400">window_list()</p>
              <p className="text-slate-400 mt-2">// Returns detailed window info including:</p>
              <pre className="text-slate-300">{`[
  {
    "title": "Document.txt",
    "app": "TextEdit",
    "bundleId": "com.apple.TextEdit",
    "bounds": { "x": 100, "y": 100, "width": 800, "height": 600 },
    "isMinimized": false
  }
]`}</pre>
            </div>
            <p className="text-slate-500 text-xs mt-2">Use for: Finding window IDs, understanding multi-window apps, multi-monitor debugging</p>
          </div>

          <div className="border border-slate-600 rounded-lg p-4">
            <h3 className="text-white font-medium mb-2">listApplications</h3>
            <p className="text-slate-400 text-sm mb-3">List all running applications with bundle IDs and window bounds.</p>
            <div className="bg-slate-900 rounded-lg p-3 font-mono text-sm">
              <p className="text-green-400">listApplications()</p>
              <p className="text-slate-400 mt-2">// Returns:</p>
              <pre className="text-slate-300">{`[
  {
    "name": "Finder",
    "bundleId": "com.apple.finder",
    "windowBounds": { "x": 50, "y": 50, "width": 1200, "height": 800 }
  }
]`}</pre>
            </div>
            <p className="text-slate-500 text-xs mt-2">Use for: Finding app identifiers, seeing what&apos;s running</p>
          </div>

          <div className="border border-slate-600 rounded-lg p-4">
            <h3 className="text-white font-medium mb-2">wait</h3>
            <p className="text-slate-400 text-sm mb-3">Pause execution for a specified duration.</p>
            <div className="bg-slate-900 rounded-lg p-3 font-mono text-sm">
              <p className="text-green-400">wait({`{ milliseconds: 1000 }`})  // 1 second</p>
              <p className="text-green-400">wait({`{ milliseconds: 500 }`})   // 0.5 seconds</p>
            </div>
            <p className="text-slate-500 text-xs mt-2">Use for: After clicks that trigger loading, waiting for animations</p>
          </div>
        </div>
      </div>

      {/* Browser Connection */}
      <div className="bg-slate-800/50 rounded-xl p-6 border border-slate-700">
        <h2 className="text-xl font-semibold text-white mb-4">Browser Connection</h2>

        <div className="space-y-6">
          <div className="border border-slate-600 rounded-lg p-4">
            <h3 className="text-white font-medium mb-2">browser_listConnected</h3>
            <p className="text-slate-400 text-sm mb-3">Check which browsers have the extension connected.</p>
            <div className="bg-slate-900 rounded-lg p-3 font-mono text-sm">
              <p className="text-green-400">browser_listConnected()</p>
              <p className="text-slate-400 mt-1">// Returns: {`{ connected: ["chrome", "firefox"] }`}</p>
            </div>
            <p className="text-slate-500 text-xs mt-2">Use for: Verifying extension works, debugging connection issues</p>
          </div>

          <div className="border border-slate-600 rounded-lg p-4">
            <h3 className="text-white font-medium mb-2">browser_setDefaultBrowser</h3>
            <p className="text-slate-400 text-sm mb-3">Set which browser to use by default for browser_* commands.</p>
            <div className="bg-slate-900 rounded-lg p-3 font-mono text-sm">
              <p className="text-green-400">browser_setDefaultBrowser({`{ browser: "firefox" }`})</p>
            </div>
          </div>
        </div>
      </div>

      {/* Common Patterns */}
      <div className="bg-slate-800/50 rounded-xl p-6 border border-slate-700">
        <h2 className="text-xl font-semibold text-white mb-4">Common Patterns</h2>

        <div className="space-y-6">
          <div>
            <h3 className="text-white font-medium mb-2">Copy-Paste Workflow</h3>
            <div className="bg-slate-900 rounded-lg p-3 font-mono text-sm">
              <p className="text-slate-400">// Copy some text</p>
              <p className="text-green-400">clipboard_write({`{ text: "Important data" }`})</p>
              <p className="text-slate-400 mt-2">// Focus target app and paste</p>
              <p className="text-green-400">focusApplication({`{ identifier: "Notes" }`})</p>
              <p className="text-green-400">pressKey({`{ key: "cmd+v" }`})</p>
            </div>
          </div>

          <div>
            <h3 className="text-white font-medium mb-2">Wait for UI Updates</h3>
            <div className="bg-slate-900 rounded-lg p-3 font-mono text-sm">
              <p className="text-slate-400">// Click button that loads content</p>
              <p className="text-green-400">click_grid({`{ element_text: "Load More" }`})</p>
              <p className="text-slate-400 mt-2">// Wait for content to load</p>
              <p className="text-green-400">wait({`{ milliseconds: 1000 }`})</p>
              <p className="text-slate-400 mt-2">// Take new screenshot to see results</p>
              <p className="text-green-400">screenshot_grid({`{ identifier: "MyApp" }`})</p>
            </div>
          </div>

          <div>
            <h3 className="text-white font-medium mb-2">Environment Check</h3>
            <div className="bg-slate-900 rounded-lg p-3 font-mono text-sm">
              <p className="text-slate-400">// Check system and permissions</p>
              <p className="text-green-400">const info = system_info()</p>
              <p className="text-green-400">const perms = checkPermissions()</p>
              <p className="text-slate-400 mt-2">// Check browser connection</p>
              <p className="text-green-400">const browsers = browser_listConnected()</p>
            </div>
          </div>
        </div>
      </div>

      {/* All System Tools Summary */}
      <div className="bg-slate-800/50 rounded-xl p-6 border border-slate-700">
        <h2 className="text-xl font-semibold text-white mb-4">Quick Reference</h2>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-700">
                <th className="pb-3 text-slate-400 font-medium">Tool</th>
                <th className="pb-3 text-slate-400 font-medium">Purpose</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700/50">
              <tr>
                <td className="py-3"><code className="text-blue-400">system_info</code></td>
                <td className="py-3 text-slate-300">OS, CPU, memory info</td>
              </tr>
              <tr>
                <td className="py-3"><code className="text-blue-400">checkPermissions</code></td>
                <td className="py-3 text-slate-300">Verify accessibility permissions</td>
              </tr>
              <tr>
                <td className="py-3"><code className="text-blue-400">clipboard_read</code></td>
                <td className="py-3 text-slate-300">Get clipboard text</td>
              </tr>
              <tr>
                <td className="py-3"><code className="text-blue-400">clipboard_write</code></td>
                <td className="py-3 text-slate-300">Set clipboard text</td>
              </tr>
              <tr>
                <td className="py-3"><code className="text-blue-400">window_list</code></td>
                <td className="py-3 text-slate-300">List all windows</td>
              </tr>
              <tr>
                <td className="py-3"><code className="text-blue-400">listApplications</code></td>
                <td className="py-3 text-slate-300">List running apps</td>
              </tr>
              <tr>
                <td className="py-3"><code className="text-blue-400">wait</code></td>
                <td className="py-3 text-slate-300">Pause execution</td>
              </tr>
              <tr>
                <td className="py-3"><code className="text-blue-400">browser_listConnected</code></td>
                <td className="py-3 text-slate-300">Check browser extension</td>
              </tr>
              <tr>
                <td className="py-3"><code className="text-blue-400">browser_setDefaultBrowser</code></td>
                <td className="py-3 text-slate-300">Set default browser</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
