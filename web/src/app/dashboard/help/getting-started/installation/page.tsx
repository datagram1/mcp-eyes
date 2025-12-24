export default function InstallationPage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-white mb-3">Installation Guide</h1>
        <p className="text-slate-300 text-lg">
          Install ScreenControl on macOS, Windows, or Linux.
        </p>
      </div>

      {/* macOS */}
      <div className="bg-slate-800/50 rounded-xl p-6 border border-slate-700">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 bg-slate-700 rounded-lg flex items-center justify-center">
            <svg className="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 24 24">
              <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/>
            </svg>
          </div>
          <h2 className="text-xl font-semibold text-white">macOS</h2>
        </div>

        <div className="space-y-4">
          <div>
            <h3 className="text-white font-medium mb-2">Option 1: Copy to Applications</h3>
            <div className="bg-slate-900 rounded-lg p-4 font-mono text-sm">
              <p className="text-green-400">cp -R /path/to/ScreenControl.app /Applications/</p>
            </div>
          </div>

          <div>
            <h3 className="text-white font-medium mb-2">Option 2: Drag and Drop</h3>
            <p className="text-slate-300">
              Drag <code className="px-2 py-0.5 bg-slate-700 rounded text-blue-400">ScreenControl.app</code> to
              the <code className="px-2 py-0.5 bg-slate-700 rounded text-blue-400">/Applications</code> folder in Finder.
            </p>
          </div>

          <div className="bg-amber-900/30 border border-amber-600/30 rounded-lg p-4">
            <p className="text-amber-300 text-sm">
              <strong>Important:</strong> If you see &quot;App is damaged&quot;, run:
            </p>
            <div className="bg-slate-900 rounded-lg p-3 mt-2 font-mono text-sm">
              <p className="text-green-400">xattr -cr /Applications/ScreenControl.app</p>
            </div>
          </div>

          <div>
            <h3 className="text-white font-medium mb-2">System Requirements</h3>
            <ul className="list-disc list-inside text-slate-300 space-y-1">
              <li>macOS 12.0 (Monterey) or later</li>
              <li>Apple Silicon (M1/M2/M3) or Intel</li>
              <li>Screen Recording and Accessibility permissions</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Windows */}
      <div className="bg-slate-800/50 rounded-xl p-6 border border-slate-700">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 bg-blue-600/30 rounded-lg flex items-center justify-center">
            <svg className="w-6 h-6 text-blue-400" fill="currentColor" viewBox="0 0 24 24">
              <path d="M3 5.557L10.455 4.5v6.978H3V5.557zM3 18.443L10.455 19.5v-7.023H3v5.966zM11.545 4.33L21 3v8.478h-9.455V4.33zM21 12.522v8.478l-9.455-1.33V12.522H21z"/>
            </svg>
          </div>
          <h2 className="text-xl font-semibold text-white">Windows</h2>
        </div>

        <div className="space-y-4">
          <div>
            <h3 className="text-white font-medium mb-2">Installation Steps</h3>
            <ol className="list-decimal list-inside text-slate-300 space-y-2">
              <li>Download <code className="px-2 py-0.5 bg-slate-700 rounded text-blue-400">ScreenControl-Setup.exe</code></li>
              <li>Run the installer as Administrator</li>
              <li>Follow the installation wizard</li>
              <li>Launch ScreenControl from the Start menu</li>
            </ol>
          </div>

          <div>
            <h3 className="text-white font-medium mb-2">System Tray</h3>
            <p className="text-slate-300">
              ScreenControl runs in the system tray. Right-click the icon for options.
            </p>
          </div>

          <div>
            <h3 className="text-white font-medium mb-2">System Requirements</h3>
            <ul className="list-disc list-inside text-slate-300 space-y-1">
              <li>Windows 10 (1903) or Windows 11</li>
              <li>x64 or ARM64 architecture</li>
              <li>Administrator access for installation</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Linux */}
      <div className="bg-slate-800/50 rounded-xl p-6 border border-slate-700">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 bg-orange-600/30 rounded-lg flex items-center justify-center">
            <svg className="w-6 h-6 text-orange-400" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12.504 0c-.155 0-.311.001-.465.003-.653.014-1.275.07-1.867.177-.592.108-1.157.267-1.691.477-.534.21-1.036.468-1.502.776-.466.308-.891.665-1.273 1.07-.382.406-.719.86-1.006 1.359-.287.5-.521 1.043-.698 1.627-.177.585-.295 1.21-.352 1.875-.056.665-.052 1.366.013 2.102.065.736.192 1.506.38 2.307.189.802.439 1.632.749 2.489.31.858.679 1.74 1.106 2.64.428.9.911 1.815 1.448 2.74.538.924 1.129 1.855 1.77 2.787.641.933 1.33 1.864 2.062 2.788.732.925 1.506 1.84 2.318 2.74.812.9 1.66 1.78 2.539 2.638.88.858 1.79 1.69 2.724 2.49.934.8 1.89 1.566 2.863 2.291.972.725 1.958 1.406 2.95 2.037.993.632 1.99 1.213 2.984 1.739.994.527 1.98.997 2.95 1.408.97.412 1.92.762 2.843 1.05.922.287 1.814.51 2.669.667.855.157 1.67.248 2.44.272.77.024 1.494-.02 2.166-.133.672-.113 1.29-.293 1.848-.54.558-.247 1.052-.56 1.476-.937.424-.377.775-.817 1.05-1.318.274-.5.468-1.06.578-1.675.11-.616.136-1.285.077-2.006-.06-.72-.203-1.49-.432-2.306-.228-.817-.54-1.676-.934-2.574-.394-.898-.869-1.833-1.423-2.798-.554-.966-1.185-1.96-1.891-2.974-.706-1.014-1.486-2.047-2.335-3.09-.85-1.042-1.768-2.092-2.752-3.14-.983-1.05-2.03-2.096-3.136-3.132-1.106-1.037-2.27-2.062-3.486-3.068-1.215-1.006-2.48-1.99-3.79-2.946-1.31-.955-2.66-1.88-4.045-2.767-1.384-.888-2.8-1.736-4.24-2.538-1.44-.802-2.9-1.556-4.375-2.256-1.476-.7-2.963-1.345-4.453-1.93-1.49-.585-2.98-1.11-4.46-1.568-1.481-.46-2.95-.852-4.398-1.172-1.447-.32-2.87-.567-4.26-.737-1.39-.17-2.745-.263-4.055-.277-.327-.003-.653-.002-.978.003z"/>
            </svg>
          </div>
          <h2 className="text-xl font-semibold text-white">Linux</h2>
        </div>

        <div className="space-y-4">
          <div>
            <h3 className="text-white font-medium mb-2">Install Dependencies</h3>
            <div className="bg-slate-900 rounded-lg p-4 font-mono text-sm space-y-2">
              <p className="text-slate-400"># Ubuntu/Debian</p>
              <p className="text-green-400">sudo apt install libx11-dev libxtst-dev libxrandr-dev</p>
              <p className="text-slate-400 mt-3"># Fedora/RHEL</p>
              <p className="text-green-400">sudo dnf install libX11-devel libXtst-devel libXrandr-devel</p>
            </div>
          </div>

          <div>
            <h3 className="text-white font-medium mb-2">Install Service</h3>
            <div className="bg-slate-900 rounded-lg p-4 font-mono text-sm">
              <p className="text-green-400">tar -xzf screencontrol-linux-x64.tar.gz</p>
              <p className="text-green-400">cd screencontrol</p>
              <p className="text-green-400">sudo ./install.sh</p>
            </div>
          </div>

          <div>
            <h3 className="text-white font-medium mb-2">System Requirements</h3>
            <ul className="list-disc list-inside text-slate-300 space-y-1">
              <li>X11 or Wayland with XWayland</li>
              <li>x64 or ARM64 architecture</li>
              <li>sudo access for installation</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Browser Extension */}
      <div className="bg-slate-800/50 rounded-xl p-6 border border-slate-700">
        <h2 className="text-xl font-semibold text-white mb-4">Browser Extension</h2>

        <p className="text-slate-300 mb-4">
          The browser extension enables 46+ web automation tools. Without it, you can still use grid-based
          interaction for websites.
        </p>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="p-4 bg-slate-700/30 rounded-lg text-center">
            <div className="w-12 h-12 bg-orange-500/20 rounded-full mx-auto mb-2 flex items-center justify-center">
              <span className="text-orange-400 text-2xl">🦊</span>
            </div>
            <p className="text-white font-medium">Firefox</p>
            <p className="text-slate-400 text-sm">Recommended</p>
          </div>

          <div className="p-4 bg-slate-700/30 rounded-lg text-center">
            <div className="w-12 h-12 bg-blue-500/20 rounded-full mx-auto mb-2 flex items-center justify-center">
              <span className="text-blue-400 text-2xl">🌐</span>
            </div>
            <p className="text-white font-medium">Chrome</p>
            <p className="text-slate-400 text-sm">Supported</p>
          </div>

          <div className="p-4 bg-slate-700/30 rounded-lg text-center">
            <div className="w-12 h-12 bg-purple-500/20 rounded-full mx-auto mb-2 flex items-center justify-center">
              <span className="text-purple-400 text-2xl">🧭</span>
            </div>
            <p className="text-white font-medium">Safari</p>
            <p className="text-slate-400 text-sm">macOS only</p>
          </div>

          <div className="p-4 bg-slate-700/30 rounded-lg text-center">
            <div className="w-12 h-12 bg-cyan-500/20 rounded-full mx-auto mb-2 flex items-center justify-center">
              <span className="text-cyan-400 text-2xl">🔷</span>
            </div>
            <p className="text-white font-medium">Edge</p>
            <p className="text-slate-400 text-sm">Supported</p>
          </div>
        </div>

        <div className="mt-4 bg-slate-900 rounded-lg p-4">
          <p className="text-slate-300 text-sm">
            <strong>Verify connection:</strong>
          </p>
          <p className="font-mono text-green-400 text-sm mt-2">
            curl http://127.0.0.1:3457/command -X POST -H &quot;Content-Type: application/json&quot; -d &apos;{`{"action":"getTabs"}`}&apos;
          </p>
        </div>
      </div>
    </div>
  );
}
