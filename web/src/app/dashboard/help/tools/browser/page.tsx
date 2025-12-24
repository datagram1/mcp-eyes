export default function BrowserToolsPage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-white mb-3">Browser Automation Tools</h1>
        <p className="text-slate-300 text-lg">
          46+ tools for web automation via the browser extension. Supports Chrome, Firefox, Safari, and Edge.
        </p>
      </div>

      {/* Prerequisites */}
      <div className="bg-amber-900/30 border border-amber-600/30 rounded-xl p-6">
        <h2 className="text-lg font-semibold text-amber-300 mb-2">Prerequisites</h2>
        <p className="text-amber-200 text-sm">
          Browser tools require the ScreenControl extension installed and connected. Check connection with:
        </p>
        <div className="bg-slate-900 rounded-lg p-3 mt-2 font-mono text-sm">
          <p className="text-green-400">browser_listConnected()</p>
          <p className="text-slate-400 mt-1">// Returns: {`{ connected: ["chrome", "firefox"] }`}</p>
        </div>
      </div>

      {/* Tab Management */}
      <div className="bg-slate-800/50 rounded-xl p-6 border border-slate-700">
        <h2 className="text-xl font-semibold text-white mb-4">Tab Management</h2>

        <div className="space-y-6">
          <div className="border border-slate-600 rounded-lg p-4">
            <h3 className="text-white font-medium mb-2">browser_getTabs</h3>
            <p className="text-slate-400 text-sm mb-3">List all open tabs.</p>
            <div className="bg-slate-900 rounded-lg p-3 font-mono text-sm">
              <p className="text-green-400">browser_getTabs()</p>
              <p className="text-slate-400 mt-1">// Returns: [{`{ tabId, url, title, active }`}, ...]</p>
            </div>
          </div>

          <div className="border border-slate-600 rounded-lg p-4">
            <h3 className="text-white font-medium mb-2">browser_getActiveTab</h3>
            <p className="text-slate-400 text-sm mb-3">Get the currently active tab info.</p>
            <div className="bg-slate-900 rounded-lg p-3 font-mono text-sm">
              <p className="text-green-400">browser_getActiveTab()</p>
              <p className="text-slate-400 mt-1">// Returns: {`{ tabId, url, title }`}</p>
            </div>
          </div>

          <div className="border border-slate-600 rounded-lg p-4">
            <h3 className="text-white font-medium mb-2">browser_createTab</h3>
            <p className="text-slate-400 text-sm mb-3">Open a new tab with a URL.</p>
            <div className="bg-slate-900 rounded-lg p-3 font-mono text-sm">
              <p className="text-green-400">browser_createTab({`{ url: "https://github.com" }`})</p>
            </div>
          </div>

          <div className="border border-slate-600 rounded-lg p-4">
            <h3 className="text-white font-medium mb-2">browser_focusTab / browser_closeTab</h3>
            <div className="bg-slate-900 rounded-lg p-3 font-mono text-sm">
              <p className="text-green-400">browser_focusTab({`{ tabId: 123 }`})</p>
              <p className="text-green-400">browser_closeTab({`{ tabId: 123 }`})</p>
            </div>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <div className="bg-slate-800/50 rounded-xl p-6 border border-slate-700">
        <h2 className="text-xl font-semibold text-white mb-4">Navigation</h2>

        <div className="space-y-6">
          <div className="border border-slate-600 rounded-lg p-4">
            <h3 className="text-white font-medium mb-2">browser_navigate</h3>
            <p className="text-slate-400 text-sm mb-3">Navigate to a URL in the active tab.</p>
            <div className="bg-slate-900 rounded-lg p-3 font-mono text-sm">
              <p className="text-green-400">browser_navigate({`{ url: "https://example.com" }`})</p>
            </div>
            <p className="text-slate-500 text-xs mt-2">Faster than clicking address bar + typing</p>
          </div>

          <div className="border border-slate-600 rounded-lg p-4">
            <h3 className="text-white font-medium mb-2">browser_go_back / browser_go_forward</h3>
            <div className="bg-slate-900 rounded-lg p-3 font-mono text-sm">
              <p className="text-green-400">browser_go_back()</p>
              <p className="text-green-400">browser_go_forward()</p>
            </div>
          </div>
        </div>
      </div>

      {/* Clicking Elements */}
      <div className="bg-slate-800/50 rounded-xl p-6 border border-slate-700">
        <h2 className="text-xl font-semibold text-white mb-4">Clicking Elements</h2>

        <div className="space-y-6">
          <div className="border border-slate-600 rounded-lg p-4">
            <h3 className="text-white font-medium mb-2">browser_clickElement</h3>
            <p className="text-slate-400 text-sm mb-3">
              <strong className="text-blue-400">Primary method</strong> for clicking web page elements.
            </p>
            <div className="bg-slate-900 rounded-lg p-3 font-mono text-sm">
              <p className="text-slate-400">// By CSS selector</p>
              <p className="text-green-400">browser_clickElement({`{ selector: "button.submit" }`})</p>
              <p className="text-green-400">browser_clickElement({`{ selector: "#login-btn" }`})</p>
              <p className="text-slate-400 mt-2">// By text content</p>
              <p className="text-green-400">browser_clickElement({`{ text: "Sign In" }`})</p>
              <p className="text-slate-400 mt-2">// In background tab (by URL)</p>
              <p className="text-green-400">browser_clickElement({`{ selector: "button", url: "github.com" }`})</p>
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
                  <tr><td className="py-2"><code className="text-blue-400">selector</code></td><td>string</td><td>CSS selector</td></tr>
                  <tr><td className="py-2"><code className="text-blue-400">text</code></td><td>string</td><td>Text content to find</td></tr>
                  <tr><td className="py-2"><code className="text-blue-400">url</code></td><td>string</td><td>URL pattern for background tab</td></tr>
                  <tr><td className="py-2"><code className="text-blue-400">tabId</code></td><td>number</td><td>Specific tab ID</td></tr>
                </tbody>
              </table>
            </div>
          </div>

          <div className="border border-slate-600 rounded-lg p-4">
            <h3 className="text-white font-medium mb-2">browser_clickByText</h3>
            <p className="text-slate-400 text-sm mb-3">Click element by visible text.</p>
            <div className="bg-slate-900 rounded-lg p-3 font-mono text-sm">
              <p className="text-green-400">browser_clickByText({`{ text: "Submit" }`})</p>
            </div>
          </div>
        </div>
      </div>

      {/* Form Filling */}
      <div className="bg-slate-800/50 rounded-xl p-6 border border-slate-700">
        <h2 className="text-xl font-semibold text-white mb-4">Form Filling</h2>

        <div className="space-y-6">
          <div className="border border-slate-600 rounded-lg p-4">
            <h3 className="text-white font-medium mb-2">browser_fillElement</h3>
            <p className="text-slate-400 text-sm mb-3">
              <strong className="text-blue-400">Primary method</strong> for filling form fields.
            </p>
            <div className="bg-slate-900 rounded-lg p-3 font-mono text-sm">
              <p className="text-green-400">browser_fillElement({`{ selector: "#email", value: "user@example.com" }`})</p>
              <p className="text-green-400">browser_fillElement({`{ selector: "input[name='password']", value: "secret" }`})</p>
              <p className="text-slate-400 mt-2">// In background tab</p>
              <p className="text-green-400">browser_fillElement({`{ selector: "#search", value: "query", url: "google.com" }`})</p>
            </div>
          </div>

          <div className="border border-slate-600 rounded-lg p-4">
            <h3 className="text-white font-medium mb-2">browser_selectOption</h3>
            <p className="text-slate-400 text-sm mb-3">Select a dropdown option.</p>
            <div className="bg-slate-900 rounded-lg p-3 font-mono text-sm">
              <p className="text-green-400">browser_selectOption({`{ selector: "select#country", value: "US" }`})</p>
              <p className="text-green-400">browser_selectOption({`{ selector: "select#country", text: "United States" }`})</p>
            </div>
          </div>

          <div className="border border-slate-600 rounded-lg p-4">
            <h3 className="text-white font-medium mb-2">browser_fillWithFallback / browser_fillFormNative</h3>
            <p className="text-slate-400 text-sm mb-3">Use when standard fill fails on stubborn inputs.</p>
            <div className="bg-slate-900 rounded-lg p-3 font-mono text-sm">
              <p className="text-green-400">browser_fillWithFallback({`{ selector: "#input", value: "text" }`})</p>
              <p className="text-green-400">browser_fillFormNative({`{ selector: "#input", value: "text" }`})</p>
            </div>
          </div>
        </div>
      </div>

      {/* Reading Content */}
      <div className="bg-slate-800/50 rounded-xl p-6 border border-slate-700">
        <h2 className="text-xl font-semibold text-white mb-4">Reading Content</h2>

        <div className="space-y-6">
          <div className="border border-slate-600 rounded-lg p-4">
            <h3 className="text-white font-medium mb-2">browser_getVisibleText</h3>
            <p className="text-slate-400 text-sm mb-3">Get all visible text from a page.</p>
            <div className="bg-slate-900 rounded-lg p-3 font-mono text-sm">
              <p className="text-green-400">browser_getVisibleText()</p>
              <p className="text-green-400">browser_getVisibleText({`{ url: "github.com" }`})  // Background tab</p>
            </div>
          </div>

          <div className="border border-slate-600 rounded-lg p-4">
            <h3 className="text-white font-medium mb-2">browser_searchVisibleText</h3>
            <p className="text-slate-400 text-sm mb-3">Check if specific text exists on the page.</p>
            <div className="bg-slate-900 rounded-lg p-3 font-mono text-sm">
              <p className="text-green-400">browser_searchVisibleText({`{ query: "Success" }`})</p>
              <p className="text-slate-400 mt-1">// Returns: {`{ found: true/false }`}</p>
            </div>
          </div>

          <div className="border border-slate-600 rounded-lg p-4">
            <h3 className="text-white font-medium mb-2">browser_getInteractiveElements</h3>
            <p className="text-slate-400 text-sm mb-3">Get clickable and fillable elements.</p>
            <div className="bg-slate-900 rounded-lg p-3 font-mono text-sm">
              <p className="text-green-400">browser_getInteractiveElements()</p>
              <p className="text-green-400">browser_getInteractiveElements({`{ verbose: true }`})  // Full details</p>
            </div>
            <p className="text-slate-500 text-xs mt-2">Use to find correct selectors</p>
          </div>
        </div>
      </div>

      {/* Waiting */}
      <div className="bg-slate-800/50 rounded-xl p-6 border border-slate-700">
        <h2 className="text-xl font-semibold text-white mb-4">Waiting</h2>

        <div className="space-y-6">
          <div className="border border-slate-600 rounded-lg p-4">
            <h3 className="text-white font-medium mb-2">browser_waitForSelector</h3>
            <p className="text-slate-400 text-sm mb-3">Wait for an element to appear.</p>
            <div className="bg-slate-900 rounded-lg p-3 font-mono text-sm">
              <p className="text-green-400">browser_waitForSelector({`{ selector: ".loading-complete" }`})</p>
            </div>
          </div>

          <div className="border border-slate-600 rounded-lg p-4">
            <h3 className="text-white font-medium mb-2">browser_waitForPageLoad</h3>
            <p className="text-slate-400 text-sm mb-3">Wait for page to finish loading.</p>
            <div className="bg-slate-900 rounded-lg p-3 font-mono text-sm">
              <p className="text-green-400">browser_waitForPageLoad()</p>
            </div>
          </div>
        </div>
      </div>

      {/* Debugging */}
      <div className="bg-slate-800/50 rounded-xl p-6 border border-slate-700">
        <h2 className="text-xl font-semibold text-white mb-4">Debugging</h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-slate-900 rounded-lg p-3 font-mono text-sm">
            <p className="text-slate-400 mb-1">Console logs</p>
            <p className="text-green-400">browser_getConsoleLogs()</p>
          </div>
          <div className="bg-slate-900 rounded-lg p-3 font-mono text-sm">
            <p className="text-slate-400 mb-1">Network requests</p>
            <p className="text-green-400">browser_getNetworkRequests()</p>
          </div>
          <div className="bg-slate-900 rounded-lg p-3 font-mono text-sm">
            <p className="text-slate-400 mb-1">LocalStorage</p>
            <p className="text-green-400">browser_getLocalStorage()</p>
          </div>
          <div className="bg-slate-900 rounded-lg p-3 font-mono text-sm">
            <p className="text-slate-400 mb-1">Cookies</p>
            <p className="text-green-400">browser_getCookies()</p>
          </div>
        </div>
      </div>

      {/* Login Workflow Example */}
      <div className="bg-slate-800/50 rounded-xl p-6 border border-slate-700">
        <h2 className="text-xl font-semibold text-white mb-4">Example: Login Form</h2>

        <div className="bg-slate-900 rounded-lg p-4 font-mono text-sm overflow-x-auto">
          <pre className="text-green-400">{`// Navigate to login page
browser_navigate({ url: "https://app.example.com/login" })
browser_waitForPageLoad()

// Fill credentials
browser_fillElement({ selector: "#email", value: "user@example.com" })
browser_fillElement({ selector: "#password", value: "password123" })

// Submit
browser_clickElement({ selector: "button[type='submit']" })

// Verify login success
browser_waitForSelector({ selector: ".dashboard" })
browser_searchVisibleText({ query: "Welcome" })`}</pre>
        </div>
      </div>

      {/* Extension Blocked */}
      <div className="bg-red-900/30 border border-red-600/30 rounded-xl p-6">
        <h2 className="text-lg font-semibold text-red-300 mb-2">When Extension is Blocked</h2>
        <p className="text-red-200 text-sm mb-3">
          Some websites block browser extensions. When browser_* tools return errors, use grid tools instead:
        </p>
        <div className="bg-slate-900 rounded-lg p-3 font-mono text-sm">
          <p className="text-green-400">screenshot_grid({`{ identifier: "Firefox" }`})</p>
          <p className="text-green-400">click_grid({`{ element_text: "Submit" }`})</p>
          <p className="text-green-400">typeText({`{ text: "input value" }`})</p>
        </div>
      </div>
    </div>
  );
}
