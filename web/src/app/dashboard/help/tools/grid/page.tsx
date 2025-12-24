export default function GridToolsPage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-white mb-3">Grid Tools</h1>
        <p className="text-slate-300 text-lg">
          Visual grid-based interaction with OCR text detection. Essential for native apps and websites
          where browser extensions are blocked.
        </p>
      </div>

      {/* When to Use */}
      <div className="bg-blue-900/30 border border-blue-600/30 rounded-xl p-6">
        <h2 className="text-lg font-semibold text-blue-300 mb-2">When to Use Grid Tools</h2>
        <ul className="text-blue-200 text-sm space-y-1">
          <li>• Native macOS/Windows/Linux applications</li>
          <li>• iOS Simulator or other emulators</li>
          <li>• Websites that block browser extensions</li>
          <li>• Elements without accessible CSS selectors</li>
        </ul>
      </div>

      {/* screenshot_grid */}
      <div className="bg-slate-800/50 rounded-xl p-6 border border-slate-700">
        <h2 className="text-xl font-semibold text-white mb-4">screenshot_grid</h2>
        <p className="text-slate-300 mb-4">
          Takes a screenshot with a visual grid overlay (A-T columns, 1-15 rows) and performs OCR
          to detect text elements. This is the primary tool for preparing click operations.
        </p>

        <div className="bg-slate-900 rounded-lg p-4 font-mono text-sm mb-4">
          <p className="text-slate-400">// Screenshot specific app</p>
          <p className="text-green-400">screenshot_grid({`{ identifier: "Simulator" }`})</p>
          <p className="text-slate-400 mt-2">// Screenshot specific window</p>
          <p className="text-green-400">screenshot_grid({`{ identifier: "Firefox", window_title: "GitHub" }`})</p>
          <p className="text-slate-400 mt-2">// Full desktop with custom grid</p>
          <p className="text-green-400">screenshot_grid({`{ columns: 30, rows: 20 }`})</p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-700">
                <th className="pb-2 text-slate-400 font-medium">Parameter</th>
                <th className="pb-2 text-slate-400 font-medium">Type</th>
                <th className="pb-2 text-slate-400 font-medium">Default</th>
                <th className="pb-2 text-slate-400 font-medium">Description</th>
              </tr>
            </thead>
            <tbody className="text-slate-300">
              <tr><td className="py-2"><code className="text-blue-400">identifier</code></td><td>string</td><td>focused app</td><td>App name or bundle ID</td></tr>
              <tr><td className="py-2"><code className="text-blue-400">window_title</code></td><td>string</td><td>null</td><td>Window title substring for multi-window apps</td></tr>
              <tr><td className="py-2"><code className="text-blue-400">columns</code></td><td>number</td><td>20</td><td>Grid columns (5-40)</td></tr>
              <tr><td className="py-2"><code className="text-blue-400">rows</code></td><td>number</td><td>15</td><td>Grid rows (5-30)</td></tr>
            </tbody>
          </table>
        </div>

        <div className="mt-4 bg-slate-900 rounded-lg p-4 font-mono text-xs overflow-x-auto">
          <p className="text-slate-400 mb-2">Response includes:</p>
          <pre className="text-slate-300">{`{
  "file_path": "/tmp/screenshot_Simulator_grid_123.png",
  "windowX": 1735, "windowY": 1141,
  "windowBounds": { "x": 1735, "y": 1141, "width": 456, "height": 972 },
  "columns": 20, "rows": 15,
  "element_count": 28,
  "elements": [
    { "text": "Add item", "cell": "F13", "centerX": 115, "centerY": 819.5 }
  ]
}`}</pre>
        </div>
      </div>

      {/* click_grid */}
      <div className="bg-slate-800/50 rounded-xl p-6 border border-slate-700">
        <h2 className="text-xl font-semibold text-white mb-4">click_grid</h2>
        <p className="text-slate-300 mb-4">
          Click using references from screenshot_grid output. Three modes available.
        </p>

        <div className="space-y-4">
          <div className="border border-slate-600 rounded-lg p-4">
            <h3 className="text-white font-medium mb-2">Mode 1: By Element Text (Preferred)</h3>
            <div className="bg-slate-900 rounded-lg p-3 font-mono text-sm">
              <p className="text-green-400">click_grid({`{ element_text: "Submit" }`})</p>
              <p className="text-slate-400 mt-2">// With offset to click button below text</p>
              <p className="text-green-400">click_grid({`{ element_text: "Deploy Schema", offset_y: 30 }`})</p>
            </div>
            <p className="text-slate-500 text-xs mt-2">Most accurate for text. Works even if button moved slightly.</p>
          </div>

          <div className="border border-slate-600 rounded-lg p-4">
            <h3 className="text-white font-medium mb-2">Mode 2: By Grid Cell</h3>
            <div className="bg-slate-900 rounded-lg p-3 font-mono text-sm">
              <p className="text-green-400">click_grid({`{ cell: "E7" }`})</p>
              <p className="text-green-400">click_grid({`{ cell: "J10", offset_x: 20, offset_y: -10 }`})</p>
            </div>
            <p className="text-slate-500 text-xs mt-2">Good for static UI layouts.</p>
          </div>

          <div className="border border-slate-600 rounded-lg p-4">
            <h3 className="text-white font-medium mb-2">Mode 3: By Element Index</h3>
            <div className="bg-slate-900 rounded-lg p-3 font-mono text-sm">
              <p className="text-green-400">click_grid({`{ element: 0 }`})  // First detected element</p>
              <p className="text-green-400">click_grid({`{ element: 4 }`})  // Fifth element</p>
            </div>
          </div>
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-700">
                <th className="pb-2 text-slate-400 font-medium">Parameter</th>
                <th className="pb-2 text-slate-400 font-medium">Type</th>
                <th className="pb-2 text-slate-400 font-medium">Description</th>
              </tr>
            </thead>
            <tbody className="text-slate-300">
              <tr><td className="py-2"><code className="text-blue-400">element_text</code></td><td>string</td><td>Text to search (case-insensitive)</td></tr>
              <tr><td className="py-2"><code className="text-blue-400">cell</code></td><td>string</td><td>Grid cell reference (e.g., &apos;E7&apos;)</td></tr>
              <tr><td className="py-2"><code className="text-blue-400">element</code></td><td>number</td><td>Element index from elements array</td></tr>
              <tr><td className="py-2"><code className="text-blue-400">offset_x</code></td><td>number</td><td>Horizontal pixel offset</td></tr>
              <tr><td className="py-2"><code className="text-blue-400">offset_y</code></td><td>number</td><td>Vertical pixel offset (e.g., to click below text)</td></tr>
              <tr><td className="py-2"><code className="text-blue-400">focus</code></td><td>boolean</td><td>Auto-focus window (default: true)</td></tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* click_relative */}
      <div className="bg-slate-800/50 rounded-xl p-6 border border-slate-700">
        <h2 className="text-xl font-semibold text-white mb-4">click_relative</h2>
        <p className="text-slate-300 mb-4">
          Click at pixel coordinates relative to a window&apos;s top-left corner. Essential for icons,
          images, and UI elements that OCR misses.
        </p>

        <div className="bg-slate-900 rounded-lg p-4 font-mono text-sm mb-4">
          <p className="text-slate-400">// Click at pixel (100, 200) within Simulator window</p>
          <p className="text-green-400">click_relative({`{ identifier: "Simulator", x: 100, y: 200 }`})</p>
          <p className="text-slate-400 mt-2">// Right-click</p>
          <p className="text-green-400">click_relative({`{ identifier: "Finder", x: 50, y: 80, button: "right" }`})</p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-700">
                <th className="pb-2 text-slate-400 font-medium">Parameter</th>
                <th className="pb-2 text-slate-400 font-medium">Type</th>
                <th className="pb-2 text-slate-400 font-medium">Description</th>
              </tr>
            </thead>
            <tbody className="text-slate-300">
              <tr><td className="py-2"><code className="text-blue-400">x</code></td><td>number</td><td><strong>Required.</strong> X pixels from window left</td></tr>
              <tr><td className="py-2"><code className="text-blue-400">y</code></td><td>number</td><td><strong>Required.</strong> Y pixels from window top</td></tr>
              <tr><td className="py-2"><code className="text-blue-400">identifier</code></td><td>string</td><td>App name or bundle ID</td></tr>
              <tr><td className="py-2"><code className="text-blue-400">focus</code></td><td>boolean</td><td>Auto-focus window (default: true)</td></tr>
              <tr><td className="py-2"><code className="text-blue-400">button</code></td><td>string</td><td>&quot;left&quot; (default) or &quot;right&quot;</td></tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* iOS Simulator Keyboard */}
      <div className="bg-slate-800/50 rounded-xl p-6 border border-slate-700">
        <h2 className="text-xl font-semibold text-white mb-4">iOS Simulator Keyboard</h2>
        <p className="text-slate-300 mb-4">
          When typing on iOS Simulator, toggle hardware keyboard off with <code className="px-2 py-0.5 bg-slate-700 rounded text-blue-400">Cmd+K</code> to show
          the software keyboard, then tap keys with click_relative.
        </p>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-700">
                <th className="pb-2 text-slate-400 font-medium">Row</th>
                <th className="pb-2 text-slate-400 font-medium">Y Position</th>
                <th className="pb-2 text-slate-400 font-medium">Keys</th>
              </tr>
            </thead>
            <tbody className="text-slate-300">
              <tr><td className="py-2">11</td><td>~683</td><td>Q W E R T Y U I O P</td></tr>
              <tr><td className="py-2">12</td><td>~739</td><td>A S D F G H J K L</td></tr>
              <tr><td className="py-2">13</td><td>~795</td><td>(shift) Z X C V B N M (backspace)</td></tr>
              <tr><td className="py-2">14</td><td>~850</td><td>123 (space) (return)</td></tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Complete Workflow */}
      <div className="bg-slate-800/50 rounded-xl p-6 border border-slate-700">
        <h2 className="text-xl font-semibold text-white mb-4">Complete Workflow Example</h2>

        <div className="bg-slate-900 rounded-lg p-4 font-mono text-sm overflow-x-auto">
          <pre className="text-green-400">{`// 1. Take screenshot to see current state
screenshot_grid({ identifier: "Simulator" })

// 2. Click "Add item" button (detected by OCR)
click_grid({ element_text: "Add item", identifier: "Simulator" })

// 3. Wait for keyboard to appear
wait({ milliseconds: 500 })

// 4. Screenshot to see keyboard
screenshot_grid({ identifier: "Simulator" })

// 5. If keyboard shows numbers, click "ABC" to switch
click_grid({ element_text: "ABC", identifier: "Simulator" })

// 6. Type "Milk" by tapping keys
click_relative({ identifier: "Simulator", x: 342, y: 795 })  // M
click_relative({ identifier: "Simulator", x: 319, y: 683 })  // i
click_relative({ identifier: "Simulator", x: 387, y: 739 })  // l
click_relative({ identifier: "Simulator", x: 330, y: 739 })  // k

// 7. Tap checkmark to confirm
click_relative({ identifier: "Simulator", x: 365, y: 850 })`}</pre>
        </div>
      </div>

      {/* Multi-Monitor */}
      <div className="bg-slate-800/50 rounded-xl p-6 border border-slate-700">
        <h2 className="text-xl font-semibold text-white mb-4">Multi-Monitor Support</h2>
        <p className="text-slate-300 mb-4">
          Grid tools automatically handle multi-monitor setups:
        </p>
        <ul className="list-disc list-inside text-slate-300 space-y-2 text-sm">
          <li>Negative X coordinates work for secondary monitors to the left</li>
          <li><code className="px-1 bg-slate-700 rounded text-blue-400">screenshot_grid</code> records window position</li>
          <li><code className="px-1 bg-slate-700 rounded text-blue-400">click_grid</code> uses stored position for accurate clicks</li>
          <li>Auto-focus ensures clicks go to the correct window</li>
        </ul>
      </div>

      {/* Troubleshooting */}
      <div className="bg-slate-800/50 rounded-xl p-6 border border-slate-700">
        <h2 className="text-xl font-semibold text-white mb-4">Troubleshooting</h2>

        <div className="space-y-4">
          <div className="border border-slate-600 rounded-lg p-4">
            <h3 className="text-white font-medium mb-2">Click Not Registering</h3>
            <ul className="list-disc list-inside text-slate-300 text-sm space-y-1">
              <li>Check focus: Ensure <code className="bg-slate-700 px-1 rounded">focus: true</code> (default)</li>
              <li>Verify coordinates with <code className="bg-slate-700 px-1 rounded">screenshot_grid</code></li>
              <li>Check accessibility permissions in System Preferences</li>
            </ul>
          </div>

          <div className="border border-slate-600 rounded-lg p-4">
            <h3 className="text-white font-medium mb-2">OCR Missing Text</h3>
            <ul className="list-disc list-inside text-slate-300 text-sm space-y-1">
              <li>Low contrast text may not be detected</li>
              <li>Use <code className="bg-slate-700 px-1 rounded">click_relative</code> with pixel coordinates instead</li>
              <li>Use visual estimation from the grid overlay</li>
            </ul>
          </div>

          <div className="border border-slate-600 rounded-lg p-4">
            <h3 className="text-white font-medium mb-2">iOS Simulator Keyboard Issues</h3>
            <ul className="list-disc list-inside text-slate-300 text-sm space-y-1">
              <li>Press <code className="bg-slate-700 px-1 rounded">Cmd+K</code> to toggle hardware keyboard off</li>
              <li>Type slowly, allow time between key taps</li>
              <li>Click text field first, wait for keyboard to appear</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
