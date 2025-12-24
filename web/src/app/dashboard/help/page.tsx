import Link from 'next/link';

export default function HelpPage() {
  return (
    <div className="space-y-8">
      {/* Hero */}
      <div className="bg-gradient-to-r from-blue-600/20 to-purple-600/20 rounded-xl p-8 border border-blue-500/30">
        <h1 className="text-3xl font-bold text-white mb-3">ScreenControl Documentation</h1>
        <p className="text-slate-300 text-lg max-w-2xl">
          Complete guide to desktop and browser automation with AI. Control any application,
          automate web interactions, and manage files across macOS, Windows, and Linux.
        </p>
      </div>

      {/* Quick Start Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Link
          href="/dashboard/help/getting-started"
          className="group bg-slate-800/50 rounded-xl p-6 border border-slate-700 hover:border-blue-500/50 transition-all"
        >
          <div className="flex items-center gap-4 mb-4">
            <div className="w-12 h-12 bg-green-500/20 rounded-lg flex items-center justify-center">
              <svg className="w-6 h-6 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <div>
              <h2 className="text-xl font-semibold text-white group-hover:text-blue-400 transition-colors">
                Getting Started
              </h2>
              <p className="text-slate-400 text-sm">Installation & setup guides</p>
            </div>
          </div>
          <p className="text-slate-300">
            Install ScreenControl, configure permissions, and set up MCP for Claude Code.
          </p>
        </Link>

        <Link
          href="/dashboard/help/tools"
          className="group bg-slate-800/50 rounded-xl p-6 border border-slate-700 hover:border-blue-500/50 transition-all"
        >
          <div className="flex items-center gap-4 mb-4">
            <div className="w-12 h-12 bg-blue-500/20 rounded-lg flex items-center justify-center">
              <svg className="w-6 h-6 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </div>
            <div>
              <h2 className="text-xl font-semibold text-white group-hover:text-blue-400 transition-colors">
                Tools Reference
              </h2>
              <p className="text-slate-400 text-sm">Complete tool documentation</p>
            </div>
          </div>
          <p className="text-slate-300">
            Detailed reference for all 90+ automation tools with examples and best practices.
          </p>
        </Link>

        <Link
          href="/dashboard/help/platforms"
          className="group bg-slate-800/50 rounded-xl p-6 border border-slate-700 hover:border-blue-500/50 transition-all"
        >
          <div className="flex items-center gap-4 mb-4">
            <div className="w-12 h-12 bg-purple-500/20 rounded-lg flex items-center justify-center">
              <svg className="w-6 h-6 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
            </div>
            <div>
              <h2 className="text-xl font-semibold text-white group-hover:text-blue-400 transition-colors">
                Platform Guides
              </h2>
              <p className="text-slate-400 text-sm">macOS, Windows, Linux</p>
            </div>
          </div>
          <p className="text-slate-300">
            Platform-specific installation and configuration instructions for each operating system.
          </p>
        </Link>

        <Link
          href="/dashboard/help/troubleshooting"
          className="group bg-slate-800/50 rounded-xl p-6 border border-slate-700 hover:border-blue-500/50 transition-all"
        >
          <div className="flex items-center gap-4 mb-4">
            <div className="w-12 h-12 bg-orange-500/20 rounded-lg flex items-center justify-center">
              <svg className="w-6 h-6 text-orange-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div>
              <h2 className="text-xl font-semibold text-white group-hover:text-blue-400 transition-colors">
                Troubleshooting
              </h2>
              <p className="text-slate-400 text-sm">Common issues & solutions</p>
            </div>
          </div>
          <p className="text-slate-300">
            Solutions for common problems, permission issues, and debugging techniques.
          </p>
        </Link>
      </div>

      {/* Quick Reference */}
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
                <td className="py-3"><code className="px-2 py-1 bg-slate-700 rounded text-blue-400 text-sm">screenshot</code></td>
                <td className="py-3"><code className="px-2 py-1 bg-slate-700 rounded text-slate-400 text-sm">browser_screenshot</code></td>
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
            </tbody>
          </table>
        </div>
      </div>

      {/* Tool Categories */}
      <div className="bg-slate-800/50 rounded-xl p-6 border border-slate-700">
        <h2 className="text-xl font-semibold text-white mb-4">Tool Categories</h2>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <div className="p-4 bg-slate-700/30 rounded-lg">
            <h3 className="text-white font-medium mb-2">Browser Tools (46+)</h3>
            <p className="text-slate-400 text-sm mb-2">Web page automation via extension</p>
            <code className="text-blue-400 text-xs">browser_*</code>
          </div>

          <div className="p-4 bg-slate-700/30 rounded-lg">
            <h3 className="text-white font-medium mb-2">Grid Tools</h3>
            <p className="text-slate-400 text-sm mb-2">Visual grid-based interaction</p>
            <code className="text-blue-400 text-xs">screenshot_grid, click_grid, click_relative</code>
          </div>

          <div className="p-4 bg-slate-700/30 rounded-lg">
            <h3 className="text-white font-medium mb-2">Desktop Tools</h3>
            <p className="text-slate-400 text-sm mb-2">System-level automation</p>
            <code className="text-blue-400 text-xs">screenshot, typeText, pressKey</code>
          </div>

          <div className="p-4 bg-slate-700/30 rounded-lg">
            <h3 className="text-white font-medium mb-2">App Tools</h3>
            <p className="text-slate-400 text-sm mb-2">Application management</p>
            <code className="text-blue-400 text-xs">launchApplication, focusApplication, closeApp</code>
          </div>

          <div className="p-4 bg-slate-700/30 rounded-lg">
            <h3 className="text-white font-medium mb-2">File Tools</h3>
            <p className="text-slate-400 text-sm mb-2">Filesystem operations</p>
            <code className="text-blue-400 text-xs">fs_*</code>
          </div>

          <div className="p-4 bg-slate-700/30 rounded-lg">
            <h3 className="text-white font-medium mb-2">Shell Tools</h3>
            <p className="text-slate-400 text-sm mb-2">Command execution</p>
            <code className="text-blue-400 text-xs">shell_*</code>
          </div>
        </div>
      </div>

      {/* Support */}
      <div className="bg-slate-800/50 rounded-xl p-6 border border-slate-700">
        <h2 className="text-xl font-semibold text-white mb-4">Need More Help?</h2>
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
            GitHub Issues
          </a>
          <Link
            href="/dashboard/help/troubleshooting"
            className="flex items-center gap-2 px-4 py-2 bg-slate-700 rounded-lg text-slate-300 hover:text-white hover:bg-slate-600 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
            </svg>
            Troubleshooting Guide
          </Link>
        </div>
      </div>
    </div>
  );
}
