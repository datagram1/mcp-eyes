import Link from 'next/link';

export default function LinuxPage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-white mb-3">Linux Setup Guide</h1>
        <p className="text-slate-300 text-lg">
          Complete guide for installing and configuring ScreenControl on Linux.
        </p>
      </div>

      {/* Requirements */}
      <div className="bg-slate-800/50 rounded-xl p-6 border border-slate-700">
        <h2 className="text-xl font-semibold text-white mb-4">System Requirements</h2>

        <ul className="list-disc list-inside text-slate-300 space-y-2">
          <li>X11 display server (Wayland requires XWayland)</li>
          <li>x64 or ARM64 architecture</li>
          <li>X11 development libraries</li>
          <li>sudo access for installation</li>
        </ul>
      </div>

      {/* Dependencies */}
      <div className="bg-slate-800/50 rounded-xl p-6 border border-slate-700">
        <h2 className="text-xl font-semibold text-white mb-4">Install Dependencies</h2>

        <div className="space-y-4">
          <div>
            <h3 className="text-white font-medium mb-2">Ubuntu/Debian</h3>
            <div className="bg-slate-900 rounded-lg p-4 font-mono text-sm">
              <p className="text-green-400">sudo apt update</p>
              <p className="text-green-400">sudo apt install libx11-dev libxtst-dev libxrandr-dev libxinerama-dev</p>
            </div>
          </div>

          <div>
            <h3 className="text-white font-medium mb-2">Fedora/RHEL</h3>
            <div className="bg-slate-900 rounded-lg p-4 font-mono text-sm">
              <p className="text-green-400">sudo dnf install libX11-devel libXtst-devel libXrandr-devel libXinerama-devel</p>
            </div>
          </div>

          <div>
            <h3 className="text-white font-medium mb-2">Arch Linux</h3>
            <div className="bg-slate-900 rounded-lg p-4 font-mono text-sm">
              <p className="text-green-400">sudo pacman -S libx11 libxtst libxrandr libxinerama</p>
            </div>
          </div>
        </div>
      </div>

      {/* Installation */}
      <div className="bg-slate-800/50 rounded-xl p-6 border border-slate-700">
        <h2 className="text-xl font-semibold text-white mb-4">Installation</h2>

        <div className="space-y-4">
          <div>
            <h3 className="text-white font-medium mb-2">Step 1: Download and Extract</h3>
            <div className="bg-slate-900 rounded-lg p-4 font-mono text-sm">
              <p className="text-green-400">wget https://releases.screencontrol.dev/linux/screencontrol-linux-x64.tar.gz</p>
              <p className="text-green-400">tar -xzf screencontrol-linux-x64.tar.gz</p>
              <p className="text-green-400">cd screencontrol</p>
            </div>
          </div>

          <div>
            <h3 className="text-white font-medium mb-2">Step 2: Install</h3>
            <div className="bg-slate-900 rounded-lg p-4 font-mono text-sm">
              <p className="text-green-400">sudo ./install.sh</p>
            </div>
            <p className="text-slate-400 text-sm mt-2">
              This installs the binary to <code className="bg-slate-700 px-1 rounded">/usr/local/bin/screencontrol</code>
            </p>
          </div>

          <div>
            <h3 className="text-white font-medium mb-2">Step 3: Add User to Input Group</h3>
            <div className="bg-slate-900 rounded-lg p-4 font-mono text-sm">
              <p className="text-green-400">sudo usermod -a -G input $USER</p>
            </div>
            <p className="text-slate-400 text-sm mt-2">Log out and back in for group changes to take effect.</p>
          </div>
        </div>
      </div>

      {/* Wayland */}
      <div className="bg-amber-900/30 border border-amber-600/30 rounded-xl p-6">
        <h2 className="text-lg font-semibold text-amber-300 mb-2">Wayland Note</h2>
        <p className="text-amber-200 text-sm mb-3">
          ScreenControl requires X11. On Wayland systems, you need XWayland:
        </p>
        <div className="bg-slate-900 rounded-lg p-3 font-mono text-sm">
          <p className="text-slate-400"># Force X11 for Qt apps</p>
          <p className="text-green-400">export QT_QPA_PLATFORM=xcb</p>
          <p className="text-slate-400 mt-2"># Force X11 for GTK apps</p>
          <p className="text-green-400">export GDK_BACKEND=x11</p>
        </div>
        <p className="text-amber-200 text-sm mt-3">
          Add these to your <code className="bg-amber-900/50 px-1 rounded">~/.bashrc</code> or
          <code className="bg-amber-900/50 px-1 rounded">~/.profile</code>.
        </p>
      </div>

      {/* Configuration */}
      <div className="bg-slate-800/50 rounded-xl p-6 border border-slate-700">
        <h2 className="text-xl font-semibold text-white mb-4">Claude Code Configuration</h2>

        <p className="text-slate-300 mb-4">
          Add to <code className="px-2 py-0.5 bg-slate-700 rounded text-blue-400">~/.claude.json</code>:
        </p>

        <div className="bg-slate-900 rounded-lg p-4 font-mono text-sm overflow-x-auto">
          <pre className="text-green-400">{`{
  "mcpServers": {
    "screencontrol": {
      "command": "/usr/local/bin/screencontrol",
      "args": ["--mcp-stdio"]
    }
  }
}`}</pre>
        </div>
      </div>

      {/* Systemd Service */}
      <div className="bg-slate-800/50 rounded-xl p-6 border border-slate-700">
        <h2 className="text-xl font-semibold text-white mb-4">Systemd Service (Optional)</h2>

        <p className="text-slate-300 mb-4">
          For remote agent mode, create a systemd service:
        </p>

        <div className="bg-slate-900 rounded-lg p-4 font-mono text-sm overflow-x-auto">
          <p className="text-slate-400"># /etc/systemd/system/screencontrol.service</p>
          <pre className="text-green-400">{`[Unit]
Description=ScreenControl Service
After=network.target

[Service]
Type=simple
User=your-username
Environment=DISPLAY=:0
ExecStart=/usr/local/bin/screencontrol --service
Restart=always

[Install]
WantedBy=multi-user.target`}</pre>
        </div>

        <div className="mt-4 bg-slate-900 rounded-lg p-4 font-mono text-sm">
          <p className="text-green-400">sudo systemctl enable screencontrol</p>
          <p className="text-green-400">sudo systemctl start screencontrol</p>
        </div>
      </div>

      {/* Browser Extension */}
      <div className="bg-slate-800/50 rounded-xl p-6 border border-slate-700">
        <h2 className="text-xl font-semibold text-white mb-4">Browser Extension</h2>

        <p className="text-slate-300 mb-4">
          Install the ScreenControl extension for browser automation:
        </p>

        <div className="grid grid-cols-2 gap-4">
          <div className="p-3 bg-slate-700/30 rounded-lg text-center">
            <p className="text-orange-400 text-2xl mb-1">🦊</p>
            <p className="text-white text-sm font-medium">Firefox</p>
            <p className="text-slate-400 text-xs">Recommended</p>
          </div>
          <div className="p-3 bg-slate-700/30 rounded-lg text-center">
            <p className="text-blue-400 text-2xl mb-1">🌐</p>
            <p className="text-white text-sm font-medium">Chrome/Chromium</p>
            <p className="text-slate-400 text-xs">Supported</p>
          </div>
        </div>
      </div>

      {/* Troubleshooting */}
      <div className="bg-slate-800/50 rounded-xl p-6 border border-slate-700">
        <h2 className="text-xl font-semibold text-white mb-4">Troubleshooting</h2>

        <div className="space-y-4">
          <div className="border border-slate-600 rounded-lg p-4">
            <h3 className="text-white font-medium mb-2">Cannot connect to X display</h3>
            <div className="bg-slate-900 rounded-lg p-3 font-mono text-sm">
              <p className="text-green-400">export DISPLAY=:0</p>
              <p className="text-green-400">xhost +local:</p>
            </div>
          </div>

          <div className="border border-slate-600 rounded-lg p-4">
            <h3 className="text-white font-medium mb-2">Permission denied for input</h3>
            <p className="text-slate-300 text-sm mb-2">
              Add user to input group:
            </p>
            <div className="bg-slate-900 rounded-lg p-3 font-mono text-sm">
              <p className="text-green-400">sudo usermod -a -G input $USER</p>
            </div>
            <p className="text-slate-400 text-xs mt-2">Log out and back in after.</p>
          </div>

          <div className="border border-slate-600 rounded-lg p-4">
            <h3 className="text-white font-medium mb-2">XTest extension not available</h3>
            <p className="text-slate-300 text-sm">
              Install XTest library:
            </p>
            <div className="bg-slate-900 rounded-lg p-3 font-mono text-sm mt-2">
              <p className="text-green-400">sudo apt install libxtst6</p>
            </div>
          </div>

          <div className="border border-slate-600 rounded-lg p-4">
            <h3 className="text-white font-medium mb-2">Screenshots blank on Wayland</h3>
            <p className="text-slate-300 text-sm">
              Force XWayland or use an X11 session. Some Wayland compositors block screen capture.
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
