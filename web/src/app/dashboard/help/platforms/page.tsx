import Link from 'next/link';

export default function PlatformsPage() {
  return (
    <div className="space-y-8">
      {/* Hero */}
      <div className="bg-gradient-to-r from-purple-600/20 to-pink-600/20 rounded-xl p-8 border border-purple-500/30">
        <h1 className="text-3xl font-bold text-white mb-3">Platform Guides</h1>
        <p className="text-slate-300 text-lg max-w-2xl">
          ScreenControl runs on macOS, Windows, and Linux. Each platform has specific installation
          steps and permissions requirements.
        </p>
      </div>

      {/* Platform Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* macOS */}
        <Link
          href="/dashboard/help/platforms/macos"
          className="group bg-slate-800/50 rounded-xl p-6 border border-slate-700 hover:border-blue-500/50 transition-all"
        >
          <div className="w-16 h-16 bg-slate-700 rounded-2xl flex items-center justify-center mb-4">
            <svg className="w-10 h-10 text-white" fill="currentColor" viewBox="0 0 24 24">
              <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/>
            </svg>
          </div>
          <h2 className="text-xl font-semibold text-white group-hover:text-blue-400 transition-colors mb-2">
            macOS
          </h2>
          <p className="text-slate-400 text-sm mb-4">
            Apple Silicon & Intel support. Requires Screen Recording and Accessibility permissions.
          </p>
          <div className="flex flex-wrap gap-2">
            <span className="px-2 py-1 bg-green-500/20 text-green-400 rounded text-xs">Full Support</span>
            <span className="px-2 py-1 bg-blue-500/20 text-blue-400 rounded text-xs">macOS 12+</span>
          </div>
        </Link>

        {/* Windows */}
        <Link
          href="/dashboard/help/platforms/windows"
          className="group bg-slate-800/50 rounded-xl p-6 border border-slate-700 hover:border-blue-500/50 transition-all"
        >
          <div className="w-16 h-16 bg-blue-600/30 rounded-2xl flex items-center justify-center mb-4">
            <svg className="w-10 h-10 text-blue-400" fill="currentColor" viewBox="0 0 24 24">
              <path d="M3 5.557L10.455 4.5v6.978H3V5.557zM3 18.443L10.455 19.5v-7.023H3v5.966zM11.545 4.33L21 3v8.478h-9.455V4.33zM21 12.522v8.478l-9.455-1.33V12.522H21z"/>
            </svg>
          </div>
          <h2 className="text-xl font-semibold text-white group-hover:text-blue-400 transition-colors mb-2">
            Windows
          </h2>
          <p className="text-slate-400 text-sm mb-4">
            x64 and ARM64 support. System tray application with installer.
          </p>
          <div className="flex flex-wrap gap-2">
            <span className="px-2 py-1 bg-green-500/20 text-green-400 rounded text-xs">Full Support</span>
            <span className="px-2 py-1 bg-blue-500/20 text-blue-400 rounded text-xs">Win 10/11</span>
          </div>
        </Link>

        {/* Linux */}
        <Link
          href="/dashboard/help/platforms/linux"
          className="group bg-slate-800/50 rounded-xl p-6 border border-slate-700 hover:border-blue-500/50 transition-all"
        >
          <div className="w-16 h-16 bg-orange-600/30 rounded-2xl flex items-center justify-center mb-4">
            <svg className="w-10 h-10 text-orange-400" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12.504 0c-.155 0-.311.001-.465.003-.653.014-1.275.07-1.867.177a8.51 8.51 0 00-1.691.477c-.534.21-1.036.468-1.502.776-.466.308-.891.665-1.273 1.07-.382.406-.719.86-1.006 1.359-.287.5-.521 1.043-.698 1.627a7.91 7.91 0 00-.352 1.875c-.056.665-.052 1.366.013 2.102.065.736.192 1.506.38 2.307.189.802.439 1.632.749 2.489.31.858.679 1.74 1.106 2.64.428.9.911 1.815 1.448 2.74.538.924 1.129 1.855 1.77 2.787.641.933 1.33 1.864 2.062 2.788.732.925 1.506 1.84 2.318 2.74.812.9 1.66 1.78 2.539 2.638.88.858 1.79 1.69 2.724 2.49.934.8 1.89 1.566 2.863 2.291l-.001.001z"/>
            </svg>
          </div>
          <h2 className="text-xl font-semibold text-white group-hover:text-blue-400 transition-colors mb-2">
            Linux
          </h2>
          <p className="text-slate-400 text-sm mb-4">
            X11 and Wayland (XWayland) support. Requires X11 development libraries.
          </p>
          <div className="flex flex-wrap gap-2">
            <span className="px-2 py-1 bg-yellow-500/20 text-yellow-400 rounded text-xs">Agent Mode</span>
            <span className="px-2 py-1 bg-blue-500/20 text-blue-400 rounded text-xs">x64/ARM64</span>
          </div>
        </Link>
      </div>

      {/* Feature Comparison */}
      <div className="bg-slate-800/50 rounded-xl p-6 border border-slate-700">
        <h2 className="text-xl font-semibold text-white mb-4">Feature Comparison</h2>

        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-slate-700">
                <th className="pb-3 text-slate-400 font-medium">Feature</th>
                <th className="pb-3 text-slate-400 font-medium text-center">macOS</th>
                <th className="pb-3 text-slate-400 font-medium text-center">Windows</th>
                <th className="pb-3 text-slate-400 font-medium text-center">Linux</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700/50">
              <tr>
                <td className="py-3 text-slate-300">Desktop Automation</td>
                <td className="py-3 text-center text-green-400">✓</td>
                <td className="py-3 text-center text-green-400">✓</td>
                <td className="py-3 text-center text-green-400">✓</td>
              </tr>
              <tr>
                <td className="py-3 text-slate-300">Browser Extension</td>
                <td className="py-3 text-center text-green-400">✓</td>
                <td className="py-3 text-center text-green-400">✓</td>
                <td className="py-3 text-center text-green-400">✓</td>
              </tr>
              <tr>
                <td className="py-3 text-slate-300">Grid Tools + OCR</td>
                <td className="py-3 text-center text-green-400">✓</td>
                <td className="py-3 text-center text-green-400">✓</td>
                <td className="py-3 text-center text-green-400">✓</td>
              </tr>
              <tr>
                <td className="py-3 text-slate-300">GUI Application</td>
                <td className="py-3 text-center text-green-400">✓</td>
                <td className="py-3 text-center text-green-400">✓</td>
                <td className="py-3 text-center text-slate-500">—</td>
              </tr>
              <tr>
                <td className="py-3 text-slate-300">Menu Bar/Tray</td>
                <td className="py-3 text-center text-green-400">✓</td>
                <td className="py-3 text-center text-green-400">✓</td>
                <td className="py-3 text-center text-slate-500">—</td>
              </tr>
              <tr>
                <td className="py-3 text-slate-300">Multi-Monitor</td>
                <td className="py-3 text-center text-green-400">✓</td>
                <td className="py-3 text-center text-green-400">✓</td>
                <td className="py-3 text-center text-green-400">✓</td>
              </tr>
              <tr>
                <td className="py-3 text-slate-300">Remote Agent</td>
                <td className="py-3 text-center text-green-400">✓</td>
                <td className="py-3 text-center text-green-400">✓</td>
                <td className="py-3 text-center text-green-400">✓</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Architecture */}
      <div className="bg-slate-800/50 rounded-xl p-6 border border-slate-700">
        <h2 className="text-xl font-semibold text-white mb-4">Architecture</h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <h3 className="text-white font-medium mb-3">Local Mode (macOS/Windows)</h3>
            <div className="bg-slate-900 rounded-lg p-4 font-mono text-xs">
              <pre className="text-slate-300">{`Claude Code
    ↓ MCP stdio
ScreenControl.app
    ↓ Native APIs
Screen/Keyboard/Mouse`}</pre>
            </div>
            <p className="text-slate-400 text-sm mt-2">
              Direct control via native platform APIs
            </p>
          </div>

          <div>
            <h3 className="text-white font-medium mb-3">Remote Agent Mode (All Platforms)</h3>
            <div className="bg-slate-900 rounded-lg p-4 font-mono text-xs">
              <pre className="text-slate-300">{`Claude Code
    ↓ MCP stdio
Local Bridge
    ↓ HTTP/WS
Remote Agent (Linux/Win/Mac)
    ↓ Native APIs
Screen/Keyboard/Mouse`}</pre>
            </div>
            <p className="text-slate-400 text-sm mt-2">
              Control remote machines over network
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
