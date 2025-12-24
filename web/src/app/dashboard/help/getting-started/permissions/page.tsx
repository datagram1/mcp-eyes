export default function PermissionsPage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-white mb-3">Permissions Setup</h1>
        <p className="text-slate-300 text-lg">
          ScreenControl requires specific system permissions to control your desktop.
        </p>
      </div>

      {/* macOS Permissions */}
      <div className="bg-slate-800/50 rounded-xl p-6 border border-slate-700">
        <h2 className="text-xl font-semibold text-white mb-4">macOS Permissions</h2>

        <p className="text-slate-300 mb-6">
          macOS requires explicit permission grants in System Preferences → Privacy & Security.
        </p>

        <div className="space-y-6">
          {/* Screen Recording */}
          <div className="border border-slate-600 rounded-lg p-4">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
              </div>
              <div>
                <h3 className="text-white font-medium">Screen Recording</h3>
                <p className="text-slate-400 text-sm">Required for screenshots</p>
              </div>
            </div>

            <div className="bg-slate-900 rounded-lg p-4">
              <ol className="list-decimal list-inside text-slate-300 space-y-2 text-sm">
                <li>Open <strong>System Preferences</strong> (or System Settings on Ventura+)</li>
                <li>Go to <strong>Privacy & Security → Screen Recording</strong></li>
                <li>Click the lock icon to make changes</li>
                <li>Enable <strong>ScreenControl.app</strong></li>
                <li>Also enable your terminal (iTerm2, Terminal, etc.)</li>
              </ol>
            </div>

            <div className="mt-3 bg-amber-900/30 border border-amber-600/30 rounded-lg p-3">
              <p className="text-amber-300 text-sm">
                <strong>Note:</strong> After enabling, you may need to quit and relaunch the app.
              </p>
            </div>
          </div>

          {/* Accessibility */}
          <div className="border border-slate-600 rounded-lg p-4">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-8 h-8 bg-purple-600 rounded-lg flex items-center justify-center">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122" />
                </svg>
              </div>
              <div>
                <h3 className="text-white font-medium">Accessibility</h3>
                <p className="text-slate-400 text-sm">Required for mouse and keyboard control</p>
              </div>
            </div>

            <div className="bg-slate-900 rounded-lg p-4">
              <ol className="list-decimal list-inside text-slate-300 space-y-2 text-sm">
                <li>Open <strong>System Preferences</strong></li>
                <li>Go to <strong>Privacy & Security → Accessibility</strong></li>
                <li>Click the lock icon to make changes</li>
                <li>Enable <strong>ScreenControl.app</strong></li>
                <li>Enable your terminal if using Claude Code</li>
              </ol>
            </div>
          </div>

          {/* Automation (Optional) */}
          <div className="border border-slate-600 rounded-lg p-4">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-8 h-8 bg-green-600 rounded-lg flex items-center justify-center">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              </div>
              <div>
                <h3 className="text-white font-medium">Automation <span className="text-slate-400 text-sm">(Optional)</span></h3>
                <p className="text-slate-400 text-sm">For AppleScript-based operations</p>
              </div>
            </div>

            <p className="text-slate-300 text-sm">
              Some advanced features may require Automation permissions. These are requested
              automatically when needed.
            </p>
          </div>
        </div>
      </div>

      {/* Quick Fix Commands */}
      <div className="bg-slate-800/50 rounded-xl p-6 border border-slate-700">
        <h2 className="text-xl font-semibold text-white mb-4">Quick Fix Commands</h2>

        <p className="text-slate-300 mb-4">
          If you&apos;re having permission issues, try these commands:
        </p>

        <div className="space-y-4">
          <div>
            <p className="text-slate-400 text-sm mb-2">Reset accessibility permissions:</p>
            <div className="bg-slate-900 rounded-lg p-4 font-mono text-sm">
              <p className="text-green-400">sudo tccutil reset Accessibility</p>
            </div>
          </div>

          <div>
            <p className="text-slate-400 text-sm mb-2">Reset screen recording permissions:</p>
            <div className="bg-slate-900 rounded-lg p-4 font-mono text-sm">
              <p className="text-green-400">sudo tccutil reset ScreenCapture</p>
            </div>
          </div>

          <div>
            <p className="text-slate-400 text-sm mb-2">Re-sign the app if code signature issues:</p>
            <div className="bg-slate-900 rounded-lg p-4 font-mono text-sm">
              <p className="text-green-400">codesign --force --deep --sign - /Applications/ScreenControl.app</p>
            </div>
          </div>
        </div>
      </div>

      {/* Windows Permissions */}
      <div className="bg-slate-800/50 rounded-xl p-6 border border-slate-700">
        <h2 className="text-xl font-semibold text-white mb-4">Windows Permissions</h2>

        <p className="text-slate-300 mb-4">
          Windows requires fewer explicit permission grants, but some features need Administrator access.
        </p>

        <ul className="list-disc list-inside text-slate-300 space-y-2">
          <li>Run installer as Administrator</li>
          <li>Allow through Windows Firewall if prompted</li>
          <li>UAC prompts will appear for certain operations</li>
        </ul>
      </div>

      {/* Linux Permissions */}
      <div className="bg-slate-800/50 rounded-xl p-6 border border-slate-700">
        <h2 className="text-xl font-semibold text-white mb-4">Linux Permissions</h2>

        <p className="text-slate-300 mb-4">
          Linux requires X11 access. For Wayland, XWayland must be available.
        </p>

        <div className="space-y-4">
          <div>
            <p className="text-slate-400 text-sm mb-2">Add user to input group:</p>
            <div className="bg-slate-900 rounded-lg p-4 font-mono text-sm">
              <p className="text-green-400">sudo usermod -a -G input $USER</p>
            </div>
          </div>

          <div>
            <p className="text-slate-400 text-sm mb-2">For XWayland on Wayland:</p>
            <div className="bg-slate-900 rounded-lg p-4 font-mono text-sm">
              <p className="text-green-400">export QT_QPA_PLATFORM=xcb</p>
            </div>
          </div>
        </div>
      </div>

      {/* Permission Check */}
      <div className="bg-slate-800/50 rounded-xl p-6 border border-slate-700">
        <h2 className="text-xl font-semibold text-white mb-4">Verify Permissions</h2>

        <p className="text-slate-300 mb-4">
          Use the <code className="px-2 py-0.5 bg-slate-700 rounded text-blue-400">checkPermissions</code> tool
          to verify all permissions are granted:
        </p>

        <div className="bg-slate-900 rounded-lg p-4 font-mono text-sm">
          <p className="text-slate-400"># In Claude Code, run:</p>
          <p className="text-green-400">checkPermissions</p>
          <p className="text-slate-400 mt-3"># Expected output:</p>
          <p className="text-white">{`{`}</p>
          <p className="text-white pl-4">&quot;screenRecording&quot;: true,</p>
          <p className="text-white pl-4">&quot;accessibility&quot;: true</p>
          <p className="text-white">{`}`}</p>
        </div>
      </div>
    </div>
  );
}
