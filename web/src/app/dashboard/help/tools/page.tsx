import Link from 'next/link';

export default function ToolsPage() {
  return (
    <div className="space-y-8">
      {/* Hero */}
      <div className="bg-gradient-to-r from-blue-600/20 to-cyan-600/20 rounded-xl p-8 border border-blue-500/30">
        <h1 className="text-3xl font-bold text-white mb-3">Tool Selection Guide</h1>
        <p className="text-slate-300 text-lg max-w-2xl">
          Learn which ScreenControl tool to use for each task. This guide provides decision trees
          and quick reference for choosing the right tool.
        </p>
      </div>

      {/* Quick Reference Table */}
      <div className="bg-slate-800/50 rounded-xl p-6 border border-slate-700">
        <h2 className="text-xl font-semibold text-white mb-4">Quick Reference</h2>

        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-slate-700">
                <th className="pb-3 text-slate-400 font-medium">Task</th>
                <th className="pb-3 text-slate-400 font-medium">First Choice</th>
                <th className="pb-3 text-slate-400 font-medium">Fallback</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700/50">
              <tr>
                <td className="py-3 text-slate-300">Click button on web page</td>
                <td className="py-3"><code className="px-2 py-1 bg-slate-700 rounded text-blue-400 text-sm">browser_clickElement</code></td>
                <td className="py-3"><code className="px-2 py-1 bg-slate-700 rounded text-slate-400 text-sm">screenshot_grid + click_grid</code></td>
              </tr>
              <tr>
                <td className="py-3 text-slate-300">Click button in native app</td>
                <td className="py-3"><code className="px-2 py-1 bg-slate-700 rounded text-blue-400 text-sm">screenshot_grid + click_grid</code></td>
                <td className="py-3"><code className="px-2 py-1 bg-slate-700 rounded text-slate-400 text-sm">click_relative</code></td>
              </tr>
              <tr>
                <td className="py-3 text-slate-300">Fill web form</td>
                <td className="py-3"><code className="px-2 py-1 bg-slate-700 rounded text-blue-400 text-sm">browser_fillElement</code></td>
                <td className="py-3"><code className="px-2 py-1 bg-slate-700 rounded text-slate-400 text-sm">click_grid + typeText</code></td>
              </tr>
              <tr>
                <td className="py-3 text-slate-300">Read web page content</td>
                <td className="py-3"><code className="px-2 py-1 bg-slate-700 rounded text-blue-400 text-sm">browser_getVisibleText</code></td>
                <td className="py-3"><code className="px-2 py-1 bg-slate-700 rounded text-slate-400 text-sm">screenshot_grid OCR</code></td>
              </tr>
              <tr>
                <td className="py-3 text-slate-300">Take screenshot</td>
                <td className="py-3"><code className="px-2 py-1 bg-slate-700 rounded text-blue-400 text-sm">screenshot_grid</code></td>
                <td className="py-3"><code className="px-2 py-1 bg-slate-700 rounded text-slate-400 text-sm">screenshot / browser_screenshot</code></td>
              </tr>
              <tr>
                <td className="py-3 text-slate-300">Navigate to URL</td>
                <td className="py-3"><code className="px-2 py-1 bg-slate-700 rounded text-blue-400 text-sm">browser_navigate</code></td>
                <td className="py-3"><code className="px-2 py-1 bg-slate-700 rounded text-slate-400 text-sm">browser_createTab</code></td>
              </tr>
              <tr>
                <td className="py-3 text-slate-300">Type text anywhere</td>
                <td className="py-3"><code className="px-2 py-1 bg-slate-700 rounded text-blue-400 text-sm">typeText</code></td>
                <td className="py-3"><code className="px-2 py-1 bg-slate-700 rounded text-slate-400 text-sm">pressKey</code></td>
              </tr>
              <tr>
                <td className="py-3 text-slate-300">Press keyboard shortcut</td>
                <td className="py-3"><code className="px-2 py-1 bg-slate-700 rounded text-blue-400 text-sm">pressKey</code></td>
                <td className="py-3 text-slate-500">—</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Decision Tree: Clicking */}
      <div className="bg-slate-800/50 rounded-xl p-6 border border-slate-700">
        <h2 className="text-xl font-semibold text-white mb-4">Decision Tree: Clicking Elements</h2>

        <div className="bg-slate-900 rounded-lg p-4 font-mono text-sm overflow-x-auto">
          <pre className="text-slate-300">{`Need to click something?
│
├─ Is it on a web page?
│   │
│   ├─ Browser extension connected?
│   │   │
│   │   ├─ YES → browser_clickElement(selector) or browser_clickByText(text)
│   │   │        ✓ Fastest, most reliable
│   │   │        ✓ Works in background tabs
│   │   │
│   │   └─ NO or BLOCKED → Go to "Native App" flow below
│   │
│   └─ Don't know? → Use browser_listConnected to check
│
├─ Is it in a native app (Finder, Mail, Simulator, etc.)?
│   │
│   ├─ 1. Take screenshot with grid:
│   │      screenshot_grid({ identifier: "AppName" })
│   │
│   ├─ 2. View the image to see grid overlay and OCR results
│   │
│   └─ 3. Choose click method:
│       │
│       ├─ OCR detected the text you want to click?
│       │   └─ click_grid({ element_text: "Button Text" })
│       │      ✓ Most accurate for text
│       │
│       ├─ Target is an icon/image with no text?
│       │   └─ click_relative({ identifier: "App", x: 150, y: 300 })
│       │      ✓ Use centerX/centerY from elements array
│       │
│       └─ Know the exact grid cell?
│           └─ click_grid({ cell: "E7" })
│              ✓ Good for static UI layouts
│
└─ Is it on secondary monitor?
    └─ Same flow - grid tools handle multi-monitor automatically`}</pre>
        </div>
      </div>

      {/* Decision Tree: Taking Screenshots */}
      <div className="bg-slate-800/50 rounded-xl p-6 border border-slate-700">
        <h2 className="text-xl font-semibold text-white mb-4">Decision Tree: Taking Screenshots</h2>

        <div className="bg-slate-900 rounded-lg p-4 font-mono text-sm overflow-x-auto">
          <pre className="text-slate-300">{`Need a screenshot?
│
├─ For clicking/interaction?
│   └─ screenshot_grid
│      ✓ Includes grid overlay
│      ✓ OCR text detection
│      ✓ Records window position for click_grid
│
├─ Just for viewing/documentation?
│   │
│   ├─ Full desktop → screenshot
│   ├─ Specific app → screenshot_app({ identifier: "AppName" })
│   └─ Web page → browser_screenshot
│
└─ Web page for debugging?
    └─ browser_screenshot
       ✓ Captures browser viewport
       ✓ Works in background tabs with url parameter`}</pre>
        </div>
      </div>

      {/* Tool Categories */}
      <div className="bg-slate-800/50 rounded-xl p-6 border border-slate-700">
        <h2 className="text-xl font-semibold text-white mb-4">Tool Categories</h2>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <Link href="/dashboard/help/tools/desktop" className="group p-4 bg-slate-700/30 rounded-lg hover:bg-slate-700/50 transition-colors">
            <h3 className="text-white font-medium mb-2 group-hover:text-blue-400 transition-colors">Desktop Tools →</h3>
            <p className="text-slate-400 text-sm mb-2">Screenshots, mouse, keyboard, app management</p>
            <code className="text-blue-400 text-xs">screenshot, typeText, pressKey, launchApplication</code>
          </Link>

          <Link href="/dashboard/help/tools/browser" className="group p-4 bg-slate-700/30 rounded-lg hover:bg-slate-700/50 transition-colors">
            <h3 className="text-white font-medium mb-2 group-hover:text-blue-400 transition-colors">Browser Tools →</h3>
            <p className="text-slate-400 text-sm mb-2">46+ tools for web automation via extension</p>
            <code className="text-blue-400 text-xs">browser_clickElement, browser_fillElement, browser_getTabs</code>
          </Link>

          <Link href="/dashboard/help/tools/grid" className="group p-4 bg-slate-700/30 rounded-lg hover:bg-slate-700/50 transition-colors">
            <h3 className="text-white font-medium mb-2 group-hover:text-blue-400 transition-colors">Grid Tools →</h3>
            <p className="text-slate-400 text-sm mb-2">Visual grid-based interaction with OCR</p>
            <code className="text-blue-400 text-xs">screenshot_grid, click_grid, click_relative</code>
          </Link>

          <Link href="/dashboard/help/tools/filesystem" className="group p-4 bg-slate-700/30 rounded-lg hover:bg-slate-700/50 transition-colors">
            <h3 className="text-white font-medium mb-2 group-hover:text-blue-400 transition-colors">Filesystem Tools →</h3>
            <p className="text-slate-400 text-sm mb-2">File operations and shell commands</p>
            <code className="text-blue-400 text-xs">fs_read, fs_write, fs_search, shell_exec</code>
          </Link>

          <Link href="/dashboard/help/tools/system" className="group p-4 bg-slate-700/30 rounded-lg hover:bg-slate-700/50 transition-colors">
            <h3 className="text-white font-medium mb-2 group-hover:text-blue-400 transition-colors">System Tools →</h3>
            <p className="text-slate-400 text-sm mb-2">System info, clipboard, windows</p>
            <code className="text-blue-400 text-xs">system_info, clipboard_read, window_list</code>
          </Link>
        </div>
      </div>

      {/* Common Patterns */}
      <div className="bg-slate-800/50 rounded-xl p-6 border border-slate-700">
        <h2 className="text-xl font-semibold text-white mb-4">Common Patterns</h2>

        <div className="space-y-6">
          <div>
            <h3 className="text-white font-medium mb-2">Web Form Submission</h3>
            <div className="bg-slate-900 rounded-lg p-4 font-mono text-sm overflow-x-auto">
              <pre className="text-green-400">{`// Pattern 1: Browser extension (preferred)
browser_fillElement({ selector: "#email", value: "user@example.com" })
browser_fillElement({ selector: "#password", value: "secret" })
browser_clickElement({ selector: "button[type='submit']" })

// Pattern 2: Extension blocked
screenshot_grid({ identifier: "Firefox" })
click_grid({ element_text: "Email" })
typeText({ text: "user@example.com" })
pressKey({ key: "tab" })
typeText({ text: "secret" })
click_grid({ element_text: "Sign In" })`}</pre>
            </div>
          </div>

          <div>
            <h3 className="text-white font-medium mb-2">Native App Workflow</h3>
            <div className="bg-slate-900 rounded-lg p-4 font-mono text-sm overflow-x-auto">
              <pre className="text-green-400">{`// Open app and interact
launchApplication({ identifier: "Notes" })
wait({ milliseconds: 1000 })
screenshot_grid({ identifier: "Notes" })
click_grid({ element_text: "New Note" })
typeText({ text: "My note content" })
pressKey({ key: "cmd+s" })  // Save`}</pre>
            </div>
          </div>

          <div>
            <h3 className="text-white font-medium mb-2">Multi-Tab Web Research</h3>
            <div className="bg-slate-900 rounded-lg p-4 font-mono text-sm overflow-x-auto">
              <pre className="text-green-400">{`// Open multiple tabs
browser_createTab({ url: "https://docs.example.com" })
browser_createTab({ url: "https://api.example.com" })

// Work with tabs by URL (no need to switch)
const docs = browser_getVisibleText({ url: "docs.example.com" })
const api = browser_getVisibleText({ url: "api.example.com" })`}</pre>
            </div>
          </div>
        </div>
      </div>

      {/* Troubleshooting */}
      <div className="bg-slate-800/50 rounded-xl p-6 border border-slate-700">
        <h2 className="text-xl font-semibold text-white mb-4">Troubleshooting Tool Selection</h2>

        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-slate-700">
                <th className="pb-3 text-slate-400 font-medium">Symptom</th>
                <th className="pb-3 text-slate-400 font-medium">Likely Issue</th>
                <th className="pb-3 text-slate-400 font-medium">Solution</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700/50">
              <tr>
                <td className="py-3 text-slate-300">browser_* returns error</td>
                <td className="py-3 text-slate-400">Extension blocked</td>
                <td className="py-3 text-slate-300">Use screenshot_grid + click_grid</td>
              </tr>
              <tr>
                <td className="py-3 text-slate-300">click_grid misses target</td>
                <td className="py-3 text-slate-400">OCR didn&apos;t detect text</td>
                <td className="py-3 text-slate-300">Use click_relative with pixel coords</td>
              </tr>
              <tr>
                <td className="py-3 text-slate-300">Click goes to wrong window</td>
                <td className="py-3 text-slate-400">Multi-monitor issue</td>
                <td className="py-3 text-slate-300">Ensure focus: true (default)</td>
              </tr>
              <tr>
                <td className="py-3 text-slate-300">typeText enters wrong field</td>
                <td className="py-3 text-slate-400">Field not focused</td>
                <td className="py-3 text-slate-300">Click field first with click_grid</td>
              </tr>
              <tr>
                <td className="py-3 text-slate-300">Screenshot is blank</td>
                <td className="py-3 text-slate-400">Permission issue</td>
                <td className="py-3 text-slate-300">Check Screen Recording permission</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
