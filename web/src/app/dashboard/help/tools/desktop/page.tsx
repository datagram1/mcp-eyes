export default function DesktopToolsPage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-white mb-3">Desktop Automation Tools</h1>
        <p className="text-slate-300 text-lg">
          Native desktop automation for screenshots, mouse control, keyboard input, and application management.
        </p>
      </div>

      {/* Screenshot Tools */}
      <div className="bg-slate-800/50 rounded-xl p-6 border border-slate-700">
        <h2 className="text-xl font-semibold text-white mb-4">Screenshot Tools</h2>

        <div className="space-y-6">
          {/* screenshot */}
          <div className="border border-slate-600 rounded-lg p-4">
            <h3 className="text-white font-medium mb-2">screenshot</h3>
            <p className="text-slate-400 text-sm mb-3">Captures full desktop including all monitors.</p>
            <div className="bg-slate-900 rounded-lg p-3 font-mono text-sm">
              <p className="text-green-400">screenshot()</p>
              <p className="text-green-400">screenshot({`{ format: "png" }`})</p>
              <p className="text-green-400">screenshot({`{ return_base64: true }`})</p>
            </div>
            <p className="text-slate-500 text-xs mt-2">Use for: Quick overview, multi-monitor layouts, documentation</p>
          </div>

          {/* screenshot_app */}
          <div className="border border-slate-600 rounded-lg p-4">
            <h3 className="text-white font-medium mb-2">screenshot_app</h3>
            <p className="text-slate-400 text-sm mb-3">Captures a specific application window.</p>
            <div className="bg-slate-900 rounded-lg p-3 font-mono text-sm">
              <p className="text-green-400">screenshot_app({`{ identifier: "Finder" }`})</p>
              <p className="text-green-400">screenshot_app({`{ identifier: "com.apple.mail" }`})</p>
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
                  <tr>
                    <td className="py-2"><code className="text-blue-400">identifier</code></td>
                    <td>string</td>
                    <td>App name or bundle ID</td>
                  </tr>
                  <tr>
                    <td className="py-2"><code className="text-blue-400">format</code></td>
                    <td>string</td>
                    <td>&quot;jpeg&quot; (default) or &quot;png&quot;</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      {/* Mouse Tools */}
      <div className="bg-slate-800/50 rounded-xl p-6 border border-slate-700">
        <h2 className="text-xl font-semibold text-white mb-4">Mouse Tools</h2>

        <div className="space-y-6">
          {/* doubleClick */}
          <div className="border border-slate-600 rounded-lg p-4">
            <h3 className="text-white font-medium mb-2">doubleClick</h3>
            <p className="text-slate-400 text-sm mb-3">Double-click at absolute coordinates.</p>
            <div className="bg-slate-900 rounded-lg p-3 font-mono text-sm">
              <p className="text-green-400">doubleClick({`{ x: 500, y: 300 }`})</p>
            </div>
            <p className="text-slate-500 text-xs mt-2">Use for: Opening files in Finder, selecting words</p>
          </div>

          {/* moveMouse */}
          <div className="border border-slate-600 rounded-lg p-4">
            <h3 className="text-white font-medium mb-2">moveMouse</h3>
            <p className="text-slate-400 text-sm mb-3">Move cursor without clicking.</p>
            <div className="bg-slate-900 rounded-lg p-3 font-mono text-sm">
              <p className="text-green-400">moveMouse({`{ x: 500, y: 300 }`})</p>
            </div>
            <p className="text-slate-500 text-xs mt-2">Use for: Hover effects, tooltips</p>
          </div>

          {/* getMousePosition */}
          <div className="border border-slate-600 rounded-lg p-4">
            <h3 className="text-white font-medium mb-2">getMousePosition</h3>
            <p className="text-slate-400 text-sm mb-3">Get current cursor position.</p>
            <div className="bg-slate-900 rounded-lg p-3 font-mono text-sm">
              <p className="text-green-400">getMousePosition()</p>
              <p className="text-slate-400 mt-1">// Returns: {`{ x: 500, y: 300 }`}</p>
            </div>
          </div>

          {/* scroll */}
          <div className="border border-slate-600 rounded-lg p-4">
            <h3 className="text-white font-medium mb-2">scroll</h3>
            <p className="text-slate-400 text-sm mb-3">Scroll at a specific location.</p>
            <div className="bg-slate-900 rounded-lg p-3 font-mono text-sm">
              <p className="text-green-400">scroll({`{ deltaY: -100 }`})  // Scroll down</p>
              <p className="text-green-400">scroll({`{ deltaY: 100 }`})   // Scroll up</p>
              <p className="text-green-400">scroll({`{ x: 500, y: 300, deltaY: -50 }`})</p>
            </div>
          </div>

          {/* scrollMouse */}
          <div className="border border-slate-600 rounded-lg p-4">
            <h3 className="text-white font-medium mb-2">scrollMouse</h3>
            <p className="text-slate-400 text-sm mb-3">Simple directional scrolling.</p>
            <div className="bg-slate-900 rounded-lg p-3 font-mono text-sm">
              <p className="text-green-400">scrollMouse({`{ direction: "down" }`})</p>
              <p className="text-green-400">scrollMouse({`{ direction: "up", amount: 5 }`})</p>
            </div>
          </div>

          {/* drag */}
          <div className="border border-slate-600 rounded-lg p-4">
            <h3 className="text-white font-medium mb-2">drag</h3>
            <p className="text-slate-400 text-sm mb-3">Drag from one point to another.</p>
            <div className="bg-slate-900 rounded-lg p-3 font-mono text-sm">
              <p className="text-green-400">drag({`{ startX: 100, startY: 100, endX: 300, endY: 300 }`})</p>
            </div>
            <p className="text-slate-500 text-xs mt-2">Use for: Moving files, sliders, resizing windows</p>
          </div>
        </div>
      </div>

      {/* Keyboard Tools */}
      <div className="bg-slate-800/50 rounded-xl p-6 border border-slate-700">
        <h2 className="text-xl font-semibold text-white mb-4">Keyboard Tools</h2>

        <div className="space-y-6">
          {/* typeText */}
          <div className="border border-slate-600 rounded-lg p-4">
            <h3 className="text-white font-medium mb-2">typeText</h3>
            <p className="text-slate-400 text-sm mb-3">Type text using keyboard simulation.</p>
            <div className="bg-slate-900 rounded-lg p-3 font-mono text-sm">
              <p className="text-green-400">typeText({`{ text: "Hello, World!" }`})</p>
              <p className="text-green-400">typeText({`{ text: "user@example.com" }`})</p>
            </div>
            <div className="mt-3 bg-amber-900/30 border border-amber-600/30 rounded-lg p-3">
              <p className="text-amber-300 text-sm">
                <strong>Note:</strong> For iOS Simulator, if typeText doesn&apos;t work, toggle hardware keyboard
                with <code className="bg-amber-900/50 px-1 rounded">Cmd+K</code> and tap on-screen keys.
              </p>
            </div>
          </div>

          {/* pressKey */}
          <div className="border border-slate-600 rounded-lg p-4">
            <h3 className="text-white font-medium mb-2">pressKey</h3>
            <p className="text-slate-400 text-sm mb-3">Press a specific key or key combination.</p>
            <div className="bg-slate-900 rounded-lg p-3 font-mono text-sm">
              <p className="text-slate-400">// Single keys</p>
              <p className="text-green-400">pressKey({`{ key: "enter" }`})</p>
              <p className="text-green-400">pressKey({`{ key: "tab" }`})</p>
              <p className="text-green-400">pressKey({`{ key: "escape" }`})</p>
              <p className="text-slate-400 mt-2">// Modifier combinations</p>
              <p className="text-green-400">pressKey({`{ key: "cmd+s" }`})  // Save</p>
              <p className="text-green-400">pressKey({`{ key: "cmd+c" }`})  // Copy</p>
              <p className="text-green-400">pressKey({`{ key: "cmd+shift+s" }`})  // Save As</p>
            </div>
            <div className="mt-3">
              <p className="text-slate-400 text-sm font-medium mb-2">Supported Keys:</p>
              <div className="flex flex-wrap gap-2">
                <span className="px-2 py-1 bg-slate-700 rounded text-xs text-slate-300">up/down/left/right</span>
                <span className="px-2 py-1 bg-slate-700 rounded text-xs text-slate-300">home/end</span>
                <span className="px-2 py-1 bg-slate-700 rounded text-xs text-slate-300">pageup/pagedown</span>
                <span className="px-2 py-1 bg-slate-700 rounded text-xs text-slate-300">delete/backspace</span>
                <span className="px-2 py-1 bg-slate-700 rounded text-xs text-slate-300">tab/enter/space</span>
                <span className="px-2 py-1 bg-slate-700 rounded text-xs text-slate-300">escape</span>
                <span className="px-2 py-1 bg-slate-700 rounded text-xs text-slate-300">f1-f12</span>
                <span className="px-2 py-1 bg-slate-700 rounded text-xs text-slate-300">cmd/ctrl/alt/shift</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Application Management */}
      <div className="bg-slate-800/50 rounded-xl p-6 border border-slate-700">
        <h2 className="text-xl font-semibold text-white mb-4">Application Management</h2>

        <div className="space-y-6">
          {/* listApplications */}
          <div className="border border-slate-600 rounded-lg p-4">
            <h3 className="text-white font-medium mb-2">listApplications</h3>
            <p className="text-slate-400 text-sm mb-3">List all running applications with their bundle IDs and window bounds.</p>
            <div className="bg-slate-900 rounded-lg p-3 font-mono text-sm">
              <p className="text-green-400">listApplications()</p>
              <p className="text-slate-400 mt-1">// Returns: [{`{ name, bundleId, windowBounds }`}, ...]</p>
            </div>
          </div>

          {/* focusApplication */}
          <div className="border border-slate-600 rounded-lg p-4">
            <h3 className="text-white font-medium mb-2">focusApplication</h3>
            <p className="text-slate-400 text-sm mb-3">Bring an application to the front.</p>
            <div className="bg-slate-900 rounded-lg p-3 font-mono text-sm">
              <p className="text-green-400">focusApplication({`{ identifier: "Finder" }`})</p>
              <p className="text-green-400">focusApplication({`{ identifier: "com.apple.Safari" }`})</p>
            </div>
          </div>

          {/* launchApplication */}
          <div className="border border-slate-600 rounded-lg p-4">
            <h3 className="text-white font-medium mb-2">launchApplication</h3>
            <p className="text-slate-400 text-sm mb-3">Start an application (or focus if already running).</p>
            <div className="bg-slate-900 rounded-lg p-3 font-mono text-sm">
              <p className="text-green-400">launchApplication({`{ identifier: "Notes" }`})</p>
              <p className="text-green-400">launchApplication({`{ identifier: "com.apple.TextEdit" }`})</p>
            </div>
          </div>

          {/* closeApp */}
          <div className="border border-slate-600 rounded-lg p-4">
            <h3 className="text-white font-medium mb-2">closeApp</h3>
            <p className="text-slate-400 text-sm mb-3">Close an application.</p>
            <div className="bg-slate-900 rounded-lg p-3 font-mono text-sm">
              <p className="text-green-400">closeApp({`{ identifier: "Notes" }`})</p>
              <p className="text-green-400">closeApp({`{ identifier: "Notes", force: true }`})  // Force quit</p>
            </div>
          </div>
        </div>
      </div>

      {/* Utility Tools */}
      <div className="bg-slate-800/50 rounded-xl p-6 border border-slate-700">
        <h2 className="text-xl font-semibold text-white mb-4">Utility Tools</h2>

        <div className="space-y-6">
          {/* wait */}
          <div className="border border-slate-600 rounded-lg p-4">
            <h3 className="text-white font-medium mb-2">wait</h3>
            <p className="text-slate-400 text-sm mb-3">Pause execution for a specified duration.</p>
            <div className="bg-slate-900 rounded-lg p-3 font-mono text-sm">
              <p className="text-green-400">wait({`{ milliseconds: 1000 }`})  // Wait 1 second</p>
              <p className="text-green-400">wait({`{ milliseconds: 500 }`})   // Wait half second</p>
            </div>
            <p className="text-slate-500 text-xs mt-2">Use after clicks that trigger loading or animations</p>
          </div>

          {/* checkPermissions */}
          <div className="border border-slate-600 rounded-lg p-4">
            <h3 className="text-white font-medium mb-2">checkPermissions</h3>
            <p className="text-slate-400 text-sm mb-3">Verify accessibility permissions are granted.</p>
            <div className="bg-slate-900 rounded-lg p-3 font-mono text-sm">
              <p className="text-green-400">checkPermissions()</p>
              <p className="text-slate-400 mt-1">// Returns: {`{ screenRecording: true, accessibility: true }`}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Common Workflow */}
      <div className="bg-slate-800/50 rounded-xl p-6 border border-slate-700">
        <h2 className="text-xl font-semibold text-white mb-4">Common Workflow Example</h2>

        <div className="bg-slate-900 rounded-lg p-4 font-mono text-sm overflow-x-auto">
          <pre className="text-green-400">{`// Open and interact with Notes app
launchApplication({ identifier: "Notes" })
wait({ milliseconds: 1000 })
screenshot_grid({ identifier: "Notes" })
click_grid({ element_text: "New Note" })
typeText({ text: "My note content" })
pressKey({ key: "cmd+s" })  // Save`}</pre>
        </div>
      </div>
    </div>
  );
}
