/**
 * Tray Application Context
 *
 * Manages the system tray icon and context menu.
 * Monitors service status and displays notifications.
 */

using System;
using System.Drawing;
using System.Windows.Forms;
using System.Threading.Tasks;

namespace ScreenControlTray
{
    internal class TrayApplicationContext : ApplicationContext
    {
        private readonly NotifyIcon _trayIcon;
        private readonly ContextMenuStrip _contextMenu;
        private readonly ToolStripMenuItem _statusItem;
        private readonly ServiceClient _serviceClient;
        private readonly System.Windows.Forms.Timer _statusTimer;
        private SettingsForm? _settingsForm;
        private bool _isConnected;
        private GUIBridgeServer? _guiBridgeServer;

#if DEBUG
        private TestServer? _testServer;
#endif

        public TrayApplicationContext()
        {
            _serviceClient = new ServiceClient();

            // Create context menu
            _contextMenu = new ContextMenuStrip();

            // Add version header
            var version = System.Reflection.Assembly.GetExecutingAssembly().GetName().Version;
            var versionString = version != null ? $"{version.Major}.{version.Minor}.{version.Build}" : "?";
            var versionItem = new ToolStripMenuItem($"ScreenControl v{versionString}")
            {
                Enabled = false
            };
            _contextMenu.Items.Add(versionItem);

            _statusItem = new ToolStripMenuItem("Status: Checking...")
            {
                Enabled = false
            };
            _contextMenu.Items.Add(_statusItem);
            _contextMenu.Items.Add(new ToolStripSeparator());

            var settingsItem = new ToolStripMenuItem("Settings...", null, OnSettingsClick);
            _contextMenu.Items.Add(settingsItem);

            var logsItem = new ToolStripMenuItem("View Logs...", null, OnViewLogsClick);
            _contextMenu.Items.Add(logsItem);

            _contextMenu.Items.Add(new ToolStripSeparator());

            var serviceSubmenu = new ToolStripMenuItem("Service");
            serviceSubmenu.DropDownItems.Add(new ToolStripMenuItem("Start Service", null, OnStartServiceClick));
            serviceSubmenu.DropDownItems.Add(new ToolStripMenuItem("Stop Service", null, OnStopServiceClick));
            serviceSubmenu.DropDownItems.Add(new ToolStripMenuItem("Restart Service", null, OnRestartServiceClick));
            _contextMenu.Items.Add(serviceSubmenu);

            _contextMenu.Items.Add(new ToolStripSeparator());

            var exitItem = new ToolStripMenuItem("Exit", null, OnExitClick);
            _contextMenu.Items.Add(exitItem);

            // Create tray icon
            _trayIcon = new NotifyIcon
            {
                Icon = CreateDefaultIcon(),
                Text = "ScreenControl",
                ContextMenuStrip = _contextMenu,
                Visible = true
            };

            _trayIcon.DoubleClick += OnTrayIconDoubleClick;

            // Start status polling
            _statusTimer = new System.Windows.Forms.Timer
            {
                Interval = 5000 // 5 seconds
            };
            _statusTimer.Tick += OnStatusTimerTick;
            _statusTimer.Start();

            // Start GUI Bridge Server (always, for service proxy)
            _guiBridgeServer = new GUIBridgeServer();
            if (_guiBridgeServer.Start(3457))
            {
                Console.WriteLine("[TrayApp] GUI Bridge Server started on port 3457");
            }
            else
            {
                Console.WriteLine("[TrayApp] Warning: GUI Bridge Server failed to start");
            }

            // Initial status check
            _ = CheckServiceStatusAsync();
        }

        private Icon CreateDefaultIcon()
        {
            // Create a simple icon programmatically
            // In production, load from embedded resource
            var bitmap = new Bitmap(16, 16);
            using (var g = Graphics.FromImage(bitmap))
            {
                g.Clear(Color.Transparent);
                using (var brush = new SolidBrush(Color.FromArgb(0, 122, 204)))
                {
                    g.FillEllipse(brush, 1, 1, 14, 14);
                }
                using (var pen = new Pen(Color.White, 2))
                {
                    g.DrawEllipse(pen, 4, 4, 8, 8);
                }
            }
            return Icon.FromHandle(bitmap.GetHicon());
        }

        private async void OnStatusTimerTick(object? sender, EventArgs e)
        {
            await CheckServiceStatusAsync();
        }

        private async Task CheckServiceStatusAsync()
        {
            try
            {
                var status = await _serviceClient.GetStatusAsync();

                if (status.IsRunning)
                {
                    _isConnected = true;
                    _statusItem.Text = $"Status: Connected ({status.Version})";
                    _trayIcon.Text = $"ScreenControl - Connected\nLicense: {status.LicenseStatus}";

                    if (status.IsLicensed)
                    {
                        UpdateIconColor(Color.FromArgb(0, 200, 83)); // Green
                    }
                    else
                    {
                        UpdateIconColor(Color.FromArgb(255, 152, 0)); // Orange - unlicensed
                    }
                }
                else
                {
                    SetDisconnectedState();
                }
            }
            catch
            {
                SetDisconnectedState();
            }
        }

        private void SetDisconnectedState()
        {
            if (_isConnected)
            {
                _trayIcon.ShowBalloonTip(
                    3000,
                    "ScreenControl",
                    "Service connection lost",
                    ToolTipIcon.Warning
                );
            }

            _isConnected = false;
            _statusItem.Text = "Status: Service Not Running";
            _trayIcon.Text = "ScreenControl - Disconnected";
            UpdateIconColor(Color.FromArgb(244, 67, 54)); // Red
        }

        private void UpdateIconColor(Color color)
        {
            var bitmap = new Bitmap(16, 16);
            using (var g = Graphics.FromImage(bitmap))
            {
                g.Clear(Color.Transparent);
                using (var brush = new SolidBrush(color))
                {
                    g.FillEllipse(brush, 1, 1, 14, 14);
                }
                using (var pen = new Pen(Color.White, 2))
                {
                    g.DrawEllipse(pen, 4, 4, 8, 8);
                }
            }

            var oldIcon = _trayIcon.Icon;
            _trayIcon.Icon = Icon.FromHandle(bitmap.GetHicon());
            oldIcon?.Dispose();
        }

        private void OnTrayIconDoubleClick(object? sender, EventArgs e)
        {
            ShowSettingsForm();
        }

        private void OnSettingsClick(object? sender, EventArgs e)
        {
            ShowSettingsForm();
        }

        private void ShowSettingsForm()
        {
            if (_settingsForm == null || _settingsForm.IsDisposed)
            {
                _settingsForm = new SettingsForm(_serviceClient);

#if DEBUG
                // Start test server for automated testing (DEBUG builds only)
                if (_testServer == null)
                {
                    _testServer = new TestServer(_settingsForm);
                    if (_testServer.Start(3456))
                    {
                        Console.WriteLine($"[ScreenControl] Test server started on localhost:{_testServer.Port}");
                    }
                    else
                    {
                        Console.WriteLine("[ScreenControl] WARNING: Failed to start test server");
                    }
                }
#endif
            }

            if (_settingsForm.Visible)
            {
                _settingsForm.Activate();
            }
            else
            {
                _settingsForm.Show();
            }
        }

        private void OnViewLogsClick(object? sender, EventArgs e)
        {
            var logsPath = Environment.ExpandEnvironmentVariables(
                @"%PROGRAMDATA%\ScreenControl\logs"
            );

            try
            {
                System.Diagnostics.Process.Start("explorer.exe", logsPath);
            }
            catch (Exception ex)
            {
                MessageBox.Show(
                    $"Could not open logs folder: {ex.Message}",
                    "ScreenControl",
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Error
                );
            }
        }

        private async void OnStartServiceClick(object? sender, EventArgs e)
        {
            await RunServiceCommandAsync("start");
        }

        private async void OnStopServiceClick(object? sender, EventArgs e)
        {
            await RunServiceCommandAsync("stop");
        }

        private async void OnRestartServiceClick(object? sender, EventArgs e)
        {
            await RunServiceCommandAsync("stop");
            await Task.Delay(2000);
            await RunServiceCommandAsync("start");
        }

        private async Task RunServiceCommandAsync(string command)
        {
            try
            {
                var startInfo = new System.Diagnostics.ProcessStartInfo
                {
                    FileName = "net.exe",
                    Arguments = $"{command} ScreenControlService",
                    Verb = "runas",
                    UseShellExecute = true,
                    CreateNoWindow = true
                };

                var process = System.Diagnostics.Process.Start(startInfo);
                if (process != null)
                {
                    await process.WaitForExitAsync();

                    // Wait and check status
                    await Task.Delay(1000);
                    await CheckServiceStatusAsync();
                }
            }
            catch (Exception ex)
            {
                MessageBox.Show(
                    $"Could not {command} service: {ex.Message}\n\nYou may need to run as Administrator.",
                    "ScreenControl",
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Error
                );
            }
        }

        private void OnExitClick(object? sender, EventArgs e)
        {
            ExitThread();
        }

        protected override void Dispose(bool disposing)
        {
            if (disposing)
            {
                // Stop GUI Bridge Server
                _guiBridgeServer?.Stop();
                _guiBridgeServer?.Dispose();

#if DEBUG
                _testServer?.Stop();
                _testServer?.Dispose();
#endif
                _statusTimer?.Stop();
                _statusTimer?.Dispose();
                _trayIcon?.Dispose();
                _contextMenu?.Dispose();
                _settingsForm?.Dispose();
                _serviceClient?.Dispose();
            }

            base.Dispose(disposing);
        }

        protected override void ExitThreadCore()
        {
            _trayIcon.Visible = false;
            base.ExitThreadCore();
        }
    }
}
