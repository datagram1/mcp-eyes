import Link from 'next/link';

export default function WindowsPage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-white mb-3">Windows Setup Guide</h1>
        <p className="text-slate-300 text-lg">
          Complete guide for installing and configuring ScreenControl on Windows.
        </p>
      </div>

      {/* Requirements */}
      <div className="bg-slate-800/50 rounded-xl p-6 border border-slate-700">
        <h2 className="text-xl font-semibold text-white mb-4">System Requirements</h2>

        <ul className="list-disc list-inside text-slate-300 space-y-2">
          <li>Windows 10 (version 1903+) or Windows 11</li>
          <li>x64 or ARM64 architecture</li>
          <li>Administrator access for installation</li>
          <li>.NET Runtime (included in installer)</li>
        </ul>
      </div>

      {/* Installation */}
      <div className="bg-slate-800/50 rounded-xl p-6 border border-slate-700">
        <h2 className="text-xl font-semibold text-white mb-4">Installation</h2>

        <div className="space-y-4">
          <div>
            <h3 className="text-white font-medium mb-2">Step 1: Download Installer</h3>
            <p className="text-slate-300 text-sm">
              Download <code className="px-2 py-0.5 bg-slate-700 rounded text-blue-400">ScreenControl-Setup.exe</code> from
              the releases page.
            </p>
          </div>

          <div>
            <h3 className="text-white font-medium mb-2">Step 2: Run as Administrator</h3>
            <p className="text-slate-300 text-sm">
              Right-click the installer and select &quot;Run as administrator&quot;. Follow the installation wizard.
            </p>
          </div>

          <div>
            <h3 className="text-white font-medium mb-2">Step 3: System Tray</h3>
            <p className="text-slate-300 text-sm">
              After installation, ScreenControl runs in the system tray. Look for the icon in the
              notification area. Right-click for options.
            </p>
          </div>

          <div>
            <h3 className="text-white font-medium mb-2">Step 4: Firewall</h3>
            <p className="text-slate-300 text-sm">
              If prompted, allow ScreenControl through Windows Firewall for browser extension connectivity.
            </p>
          </div>
        </div>
      </div>

      {/* Configuration */}
      <div className="bg-slate-800/50 rounded-xl p-6 border border-slate-700">
        <h2 className="text-xl font-semibold text-white mb-4">Claude Code Configuration</h2>

        <p className="text-slate-300 mb-4">
          Add to <code className="px-2 py-0.5 bg-slate-700 rounded text-blue-400">~/.claude.json</code> (in your user folder):
        </p>

        <div className="bg-slate-900 rounded-lg p-4 font-mono text-sm overflow-x-auto">
          <pre className="text-green-400">{`{
  "mcpServers": {
    "screencontrol": {
      "command": "C:\\\\Program Files\\\\ScreenControl\\\\ScreenControl.exe",
      "args": ["--mcp-stdio"]
    }
  }
}`}</pre>
        </div>

        <div className="mt-4 bg-amber-900/30 border border-amber-600/30 rounded-lg p-4">
          <p className="text-amber-300 text-sm">
            <strong>Note:</strong> Use double backslashes <code className="bg-amber-900/50 px-1 rounded">\\\\</code> in JSON paths.
          </p>
        </div>
      </div>

      {/* Service Mode */}
      <div className="bg-slate-800/50 rounded-xl p-6 border border-slate-700">
        <h2 className="text-xl font-semibold text-white mb-4">Service Mode (Optional)</h2>

        <p className="text-slate-300 mb-4">
          For headless operation, ScreenControl can run as a Windows service:
        </p>

        <div className="bg-slate-900 rounded-lg p-4 font-mono text-sm">
          <p className="text-slate-400"># Install as service (Admin PowerShell)</p>
          <p className="text-green-400">New-Service -Name &quot;ScreenControl&quot; -BinaryPathName &quot;C:\Program Files\ScreenControl\ScreenControlService.exe&quot;</p>
          <p className="text-slate-400 mt-2"># Start service</p>
          <p className="text-green-400">Start-Service ScreenControl</p>
        </div>
      </div>

      {/* Browser Extension */}
      <div className="bg-slate-800/50 rounded-xl p-6 border border-slate-700">
        <h2 className="text-xl font-semibold text-white mb-4">Browser Extension</h2>

        <p className="text-slate-300 mb-4">
          Install the ScreenControl extension for browser automation:
        </p>

        <div className="grid grid-cols-3 gap-4">
          <div className="p-3 bg-slate-700/30 rounded-lg text-center">
            <p className="text-blue-400 text-2xl mb-1">🌐</p>
            <p className="text-white text-sm font-medium">Chrome</p>
            <p className="text-slate-400 text-xs">Recommended</p>
          </div>
          <div className="p-3 bg-slate-700/30 rounded-lg text-center">
            <p className="text-orange-400 text-2xl mb-1">🦊</p>
            <p className="text-white text-sm font-medium">Firefox</p>
            <p className="text-slate-400 text-xs">Supported</p>
          </div>
          <div className="p-3 bg-slate-700/30 rounded-lg text-center">
            <p className="text-cyan-400 text-2xl mb-1">🔷</p>
            <p className="text-white text-sm font-medium">Edge</p>
            <p className="text-slate-400 text-xs">Supported</p>
          </div>
        </div>
      </div>

      {/* Troubleshooting */}
      <div className="bg-slate-800/50 rounded-xl p-6 border border-slate-700">
        <h2 className="text-xl font-semibold text-white mb-4">Troubleshooting</h2>

        <div className="space-y-4">
          <div className="border border-slate-600 rounded-lg p-4">
            <h3 className="text-white font-medium mb-2">UAC Prompts</h3>
            <p className="text-slate-300 text-sm">
              If you get frequent UAC prompts, run the installer with elevated privileges or add
              ScreenControl to your antivirus whitelist.
            </p>
          </div>

          <div className="border border-slate-600 rounded-lg p-4">
            <h3 className="text-white font-medium mb-2">Firewall Blocking</h3>
            <p className="text-slate-300 text-sm mb-2">
              Allow ScreenControl through Windows Defender Firewall:
            </p>
            <div className="bg-slate-900 rounded-lg p-3 font-mono text-sm">
              <p className="text-green-400">netsh advfirewall firewall add rule name=&quot;ScreenControl&quot; dir=in action=allow program=&quot;C:\Program Files\ScreenControl\ScreenControl.exe&quot;</p>
            </div>
          </div>

          <div className="border border-slate-600 rounded-lg p-4">
            <h3 className="text-white font-medium mb-2">Service Not Starting</h3>
            <p className="text-slate-300 text-sm">
              Check Windows Event Viewer for error logs. Ensure .NET Runtime is installed.
            </p>
          </div>

          <div className="border border-slate-600 rounded-lg p-4">
            <h3 className="text-white font-medium mb-2">Screenshots Blank</h3>
            <p className="text-slate-300 text-sm">
              Some games and DRM-protected content block screen capture. Try running as administrator.
            </p>
          </div>
        </div>
      </div>

      {/* Next Steps */}
      <div className="flex flex-wrap gap-4">
        <Link
          href="/dashboard/help/getting-started/mcp-setup"
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          MCP Setup Guide →
        </Link>
        <Link
          href="/dashboard/help/troubleshooting"
          className="px-4 py-2 bg-slate-700 text-white rounded-lg hover:bg-slate-600 transition-colors"
        >
          Troubleshooting →
        </Link>
      </div>
    </div>
  );
}
