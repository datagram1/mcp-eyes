/**
 * Settings Form
 *
 * WinForms UI for service configuration, license management, and debug mode.
 */

using System;
using System.Drawing;
using System.IO;
using System.Text.Json;
using System.Windows.Forms;
using System.Threading.Tasks;

namespace ScreenControlTray
{
    public class SettingsForm : Form
    {
        private readonly ServiceClient _serviceClient;

        // Tabs
        private TabControl _tabControl;

        // Status tab
        private Label _statusLabel;
        private Label _versionLabel;
        private Label _machineIdLabel;
        private Button _copyMachineIdButton;

        // License tab
        private Label _licenseStatusLabel;
        private TextBox _licenseKeyTextBox;
        private Button _activateButton;
        private Button _deactivateButton;
        private Label _expiryLabel;

        // Settings tab
        private TextBox _controlServerUrlTextBox;
        private NumericUpDown _portNumeric;
        private CheckBox _autoStartCheckBox;
        private CheckBox _loggingCheckBox;
        private Button _saveButton;

        // Debug tab
        private TextBox _debugServerUrlTextBox;
        private TextBox _debugEndpointUuidTextBox;
        private TextBox _debugCustomerIdTextBox;
        private CheckBox _debugConnectOnStartupCheckBox;
        private Button _debugConnectButton;
        private Button _debugDisconnectButton;
        private Button _debugSaveSettingsButton;
        private Button _debugCopyMcpUrlButton;
        private Label _debugConnectionStatusLabel;
        private Label _debugLicenseStatusLabel;
        private Label _debugAgentIdLabel;
        private TextBox _debugLogTextBox;
        private WebSocketClient? _webSocketClient;

        public SettingsForm(ServiceClient serviceClient)
        {
            _serviceClient = serviceClient;
            InitializeComponent();
            LoadDebugConfig();
            _ = LoadDataAsync();
        }

        private void InitializeComponent()
        {
            Text = "ScreenControl Settings";
            Size = new Size(450, 400);
            FormBorderStyle = FormBorderStyle.FixedDialog;
            MaximizeBox = false;
            MinimizeBox = false;
            StartPosition = FormStartPosition.CenterScreen;

            _tabControl = new TabControl
            {
                Dock = DockStyle.Fill,
                Padding = new Point(10, 5)
            };

            // Status Tab
            var statusTab = new TabPage("Status");
            InitializeStatusTab(statusTab);
            _tabControl.TabPages.Add(statusTab);

            // License Tab
            var licenseTab = new TabPage("License");
            InitializeLicenseTab(licenseTab);
            _tabControl.TabPages.Add(licenseTab);

            // Settings Tab
            var settingsTab = new TabPage("Settings");
            InitializeSettingsTab(settingsTab);
            _tabControl.TabPages.Add(settingsTab);

            // Debug Tab
            var debugTab = new TabPage("Debug");
            InitializeDebugTab(debugTab);
            _tabControl.TabPages.Add(debugTab);

            Controls.Add(_tabControl);
        }

        private void InitializeStatusTab(TabPage tab)
        {
            var panel = new TableLayoutPanel
            {
                Dock = DockStyle.Fill,
                ColumnCount = 2,
                RowCount = 4,
                Padding = new Padding(20)
            };

            panel.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 120));
            panel.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));

            // Status row
            panel.Controls.Add(new Label { Text = "Service Status:", AutoSize = true }, 0, 0);
            _statusLabel = new Label { Text = "Checking...", AutoSize = true, ForeColor = Color.Gray };
            panel.Controls.Add(_statusLabel, 1, 0);

            // Version row
            panel.Controls.Add(new Label { Text = "Version:", AutoSize = true }, 0, 1);
            _versionLabel = new Label { Text = "-", AutoSize = true };
            panel.Controls.Add(_versionLabel, 1, 1);

            // Machine ID row
            panel.Controls.Add(new Label { Text = "Machine ID:", AutoSize = true }, 0, 2);

            var machineIdPanel = new FlowLayoutPanel { AutoSize = true, WrapContents = false };
            _machineIdLabel = new Label { Text = "-", AutoSize = true };
            _copyMachineIdButton = new Button { Text = "Copy", Size = new Size(50, 23), Margin = new Padding(5, 0, 0, 0) };
            _copyMachineIdButton.Click += OnCopyMachineIdClick;
            machineIdPanel.Controls.Add(_machineIdLabel);
            machineIdPanel.Controls.Add(_copyMachineIdButton);
            panel.Controls.Add(machineIdPanel, 1, 2);

            // Refresh button
            var refreshButton = new Button { Text = "Refresh", Size = new Size(80, 30) };
            refreshButton.Click += async (s, e) => await LoadDataAsync();
            panel.Controls.Add(refreshButton, 1, 3);

            tab.Controls.Add(panel);
        }

        private void InitializeLicenseTab(TabPage tab)
        {
            var panel = new TableLayoutPanel
            {
                Dock = DockStyle.Fill,
                ColumnCount = 2,
                RowCount = 5,
                Padding = new Padding(20)
            };

            panel.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 120));
            panel.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));

            // License status
            panel.Controls.Add(new Label { Text = "License Status:", AutoSize = true }, 0, 0);
            _licenseStatusLabel = new Label { Text = "Checking...", AutoSize = true };
            panel.Controls.Add(_licenseStatusLabel, 1, 0);

            // Expiry
            panel.Controls.Add(new Label { Text = "Expires:", AutoSize = true }, 0, 1);
            _expiryLabel = new Label { Text = "-", AutoSize = true };
            panel.Controls.Add(_expiryLabel, 1, 1);

            // License key input
            panel.Controls.Add(new Label { Text = "License Key:", AutoSize = true }, 0, 2);
            _licenseKeyTextBox = new TextBox { Width = 250 };
            panel.Controls.Add(_licenseKeyTextBox, 1, 2);

            // Buttons
            var buttonPanel = new FlowLayoutPanel { AutoSize = true };
            _activateButton = new Button { Text = "Activate", Size = new Size(80, 30) };
            _activateButton.Click += OnActivateClick;
            _deactivateButton = new Button { Text = "Deactivate", Size = new Size(80, 30), Margin = new Padding(10, 0, 0, 0) };
            _deactivateButton.Click += OnDeactivateClick;
            buttonPanel.Controls.Add(_activateButton);
            buttonPanel.Controls.Add(_deactivateButton);
            panel.Controls.Add(buttonPanel, 1, 3);

            tab.Controls.Add(panel);
        }

        private void InitializeSettingsTab(TabPage tab)
        {
            var panel = new TableLayoutPanel
            {
                Dock = DockStyle.Fill,
                ColumnCount = 2,
                RowCount = 6,
                Padding = new Padding(20)
            };

            panel.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 130));
            panel.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));

            // Control Server URL
            panel.Controls.Add(new Label { Text = "Control Server:", AutoSize = true }, 0, 0);
            _controlServerUrlTextBox = new TextBox { Width = 250 };
            panel.Controls.Add(_controlServerUrlTextBox, 1, 0);

            // Port
            panel.Controls.Add(new Label { Text = "Local Port:", AutoSize = true }, 0, 1);
            _portNumeric = new NumericUpDown
            {
                Minimum = 1024,
                Maximum = 65535,
                Value = 3456,
                Width = 80
            };
            panel.Controls.Add(_portNumeric, 1, 1);

            // Auto-start
            _autoStartCheckBox = new CheckBox { Text = "Start with Windows", AutoSize = true };
            panel.Controls.Add(_autoStartCheckBox, 1, 2);

            // Logging
            _loggingCheckBox = new CheckBox { Text = "Enable logging", AutoSize = true };
            panel.Controls.Add(_loggingCheckBox, 1, 3);

            // Save button
            _saveButton = new Button { Text = "Save Settings", Size = new Size(100, 30) };
            _saveButton.Click += OnSaveClick;
            panel.Controls.Add(_saveButton, 1, 4);

            tab.Controls.Add(panel);
        }

        private void InitializeDebugTab(TabPage tab)
        {
            var mainPanel = new TableLayoutPanel
            {
                Dock = DockStyle.Fill,
                ColumnCount = 1,
                RowCount = 3,
                Padding = new Padding(10)
            };

            mainPanel.RowStyles.Add(new RowStyle(SizeType.AutoSize));
            mainPanel.RowStyles.Add(new RowStyle(SizeType.AutoSize));
            mainPanel.RowStyles.Add(new RowStyle(SizeType.Percent, 100));

            // Connection Settings Group
            var connectionGroup = new GroupBox
            {
                Text = "Debug Connection Settings",
                Dock = DockStyle.Top,
                Height = 180,
                Padding = new Padding(10)
            };

            var connPanel = new TableLayoutPanel
            {
                Dock = DockStyle.Fill,
                ColumnCount = 2,
                RowCount = 5,
                Padding = new Padding(5)
            };
            connPanel.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 120));
            connPanel.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));

            // Server URL
            connPanel.Controls.Add(new Label { Text = "Server URL:", AutoSize = true, Anchor = AnchorStyles.Left }, 0, 0);
            _debugServerUrlTextBox = new TextBox { Width = 280, Text = "wss://screencontrol.knws.co.uk/ws" };
            connPanel.Controls.Add(_debugServerUrlTextBox, 1, 0);

            // Endpoint UUID
            connPanel.Controls.Add(new Label { Text = "Endpoint UUID:", AutoSize = true, Anchor = AnchorStyles.Left }, 0, 1);
            _debugEndpointUuidTextBox = new TextBox { Width = 280 };
            connPanel.Controls.Add(_debugEndpointUuidTextBox, 1, 1);

            // Customer ID
            connPanel.Controls.Add(new Label { Text = "Customer ID:", AutoSize = true, Anchor = AnchorStyles.Left }, 0, 2);
            _debugCustomerIdTextBox = new TextBox { Width = 280 };
            connPanel.Controls.Add(_debugCustomerIdTextBox, 1, 2);

            // Connect on startup checkbox
            _debugConnectOnStartupCheckBox = new CheckBox { Text = "Connect automatically on startup", AutoSize = true };
            connPanel.Controls.Add(_debugConnectOnStartupCheckBox, 1, 3);

            // Buttons
            var buttonPanel = new FlowLayoutPanel { AutoSize = true, Dock = DockStyle.Fill };
            _debugConnectButton = new Button { Text = "Connect", Size = new Size(80, 28) };
            _debugConnectButton.Click += OnDebugConnectClick;
            _debugDisconnectButton = new Button { Text = "Disconnect", Size = new Size(80, 28), Enabled = false };
            _debugDisconnectButton.Click += OnDebugDisconnectClick;
            _debugSaveSettingsButton = new Button { Text = "Save Settings", Size = new Size(90, 28) };
            _debugSaveSettingsButton.Click += OnDebugSaveSettingsClick;
            _debugCopyMcpUrlButton = new Button { Text = "Copy MCP URL", Size = new Size(100, 28) };
            _debugCopyMcpUrlButton.Click += OnDebugCopyMcpUrlClick;
            buttonPanel.Controls.Add(_debugConnectButton);
            buttonPanel.Controls.Add(_debugDisconnectButton);
            buttonPanel.Controls.Add(_debugSaveSettingsButton);
            buttonPanel.Controls.Add(_debugCopyMcpUrlButton);
            connPanel.Controls.Add(buttonPanel, 1, 4);

            connectionGroup.Controls.Add(connPanel);
            mainPanel.Controls.Add(connectionGroup, 0, 0);

            // Status Group
            var statusGroup = new GroupBox
            {
                Text = "Connection Status",
                Dock = DockStyle.Top,
                Height = 80,
                Padding = new Padding(10)
            };

            var statusPanel = new FlowLayoutPanel
            {
                Dock = DockStyle.Fill,
                FlowDirection = FlowDirection.TopDown,
                AutoSize = true
            };

            _debugConnectionStatusLabel = new Label { Text = "Status: Not connected", AutoSize = true, ForeColor = Color.Gray };
            _debugLicenseStatusLabel = new Label { Text = "License: --", AutoSize = true };
            _debugAgentIdLabel = new Label { Text = "Agent ID: --", AutoSize = true };
            statusPanel.Controls.Add(_debugConnectionStatusLabel);
            statusPanel.Controls.Add(_debugLicenseStatusLabel);
            statusPanel.Controls.Add(_debugAgentIdLabel);

            statusGroup.Controls.Add(statusPanel);
            mainPanel.Controls.Add(statusGroup, 0, 1);

            // Log Group
            var logGroup = new GroupBox
            {
                Text = "Connection Log",
                Dock = DockStyle.Fill,
                Padding = new Padding(10)
            };

            _debugLogTextBox = new TextBox
            {
                Multiline = true,
                ReadOnly = true,
                ScrollBars = ScrollBars.Vertical,
                Dock = DockStyle.Fill,
                Font = new Font("Consolas", 9)
            };

            logGroup.Controls.Add(_debugLogTextBox);
            mainPanel.Controls.Add(logGroup, 0, 2);

            tab.Controls.Add(mainPanel);
        }

        #region Debug Tab Event Handlers

        private string GetDebugConfigPath()
        {
            var appData = Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData);
            var configDir = Path.Combine(appData, "ScreenControl");
            Directory.CreateDirectory(configDir);
            return Path.Combine(configDir, "debug-config.json");
        }

        private void LoadDebugConfig()
        {
            try
            {
                var configPath = GetDebugConfigPath();
                if (File.Exists(configPath))
                {
                    var json = File.ReadAllText(configPath);
                    var config = JsonSerializer.Deserialize<DebugConfig>(json);
                    if (config != null)
                    {
                        _debugServerUrlTextBox.Text = config.ServerUrl;
                        _debugEndpointUuidTextBox.Text = config.EndpointUuid;
                        _debugCustomerIdTextBox.Text = config.CustomerId;
                        _debugConnectOnStartupCheckBox.Checked = config.ConnectOnStartup;
                    }
                }
            }
            catch (Exception ex)
            {
                DebugLog($"Failed to load debug config: {ex.Message}");
            }
        }

        private void SaveDebugConfig()
        {
            try
            {
                var config = new DebugConfig
                {
                    ServerUrl = _debugServerUrlTextBox.Text,
                    EndpointUuid = _debugEndpointUuidTextBox.Text,
                    CustomerId = _debugCustomerIdTextBox.Text,
                    ConnectOnStartup = _debugConnectOnStartupCheckBox.Checked
                };

                var json = JsonSerializer.Serialize(config, new JsonSerializerOptions { WriteIndented = true });
                File.WriteAllText(GetDebugConfigPath(), json);
                DebugLog("Settings saved");
            }
            catch (Exception ex)
            {
                DebugLog($"Failed to save debug config: {ex.Message}");
            }
        }

        private async void OnDebugConnectClick(object? sender, EventArgs e)
        {
            if (_webSocketClient != null && _webSocketClient.IsConnected)
                return;

            _webSocketClient?.Dispose();
            _webSocketClient = new WebSocketClient();

            // Wire up events
            _webSocketClient.OnLog += DebugLog;
            _webSocketClient.OnConnectionChanged += OnDebugConnectionChanged;
            _webSocketClient.OnStatusChanged += OnDebugStatusChanged;

            var config = new DebugConfig
            {
                ServerUrl = _debugServerUrlTextBox.Text,
                EndpointUuid = _debugEndpointUuidTextBox.Text,
                CustomerId = _debugCustomerIdTextBox.Text
            };

            _debugConnectButton.Enabled = false;
            _debugConnectionStatusLabel.Text = "Status: Connecting...";
            _debugConnectionStatusLabel.ForeColor = Color.Orange;

            await _webSocketClient.ConnectAsync(config);
        }

        private async void OnDebugDisconnectClick(object? sender, EventArgs e)
        {
            if (_webSocketClient == null) return;

            _debugDisconnectButton.Enabled = false;
            await _webSocketClient.DisconnectAsync();
        }

        private void OnDebugSaveSettingsClick(object? sender, EventArgs e)
        {
            SaveDebugConfig();
            MessageBox.Show("Debug settings saved.", "ScreenControl", MessageBoxButtons.OK, MessageBoxIcon.Information);
        }

        private void OnDebugCopyMcpUrlClick(object? sender, EventArgs e)
        {
            var endpointUuid = _debugEndpointUuidTextBox.Text.Trim();
            if (string.IsNullOrEmpty(endpointUuid))
            {
                MessageBox.Show("Please enter an Endpoint UUID first.", "ScreenControl", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                return;
            }

            var serverUrl = _debugServerUrlTextBox.Text.Trim();
            if (string.IsNullOrEmpty(serverUrl))
            {
                serverUrl = "wss://screencontrol.knws.co.uk/ws";
            }

            // Convert WebSocket URL to HTTP URL
            var httpUrl = serverUrl
                .Replace("wss://", "https://")
                .Replace("ws://", "http://");

            if (httpUrl.EndsWith("/ws"))
            {
                httpUrl = httpUrl[..^3];
            }

            var mcpUrl = $"{httpUrl}/mcp/{endpointUuid}";
            Clipboard.SetText(mcpUrl);
            DebugLog($"MCP URL copied: {mcpUrl}");
            MessageBox.Show("MCP URL copied to clipboard.", "ScreenControl", MessageBoxButtons.OK, MessageBoxIcon.Information);
        }

        private void OnDebugConnectionChanged(bool connected)
        {
            if (InvokeRequired)
            {
                Invoke(new Action(() => OnDebugConnectionChanged(connected)));
                return;
            }

            _debugConnectButton.Enabled = !connected;
            _debugDisconnectButton.Enabled = connected;

            if (connected)
            {
                _debugConnectionStatusLabel.Text = "Status: Connected";
                _debugConnectionStatusLabel.ForeColor = Color.Green;
            }
            else
            {
                _debugConnectionStatusLabel.Text = "Status: Disconnected";
                _debugConnectionStatusLabel.ForeColor = Color.Gray;
                _debugLicenseStatusLabel.Text = "License: --";
                _debugAgentIdLabel.Text = "Agent ID: --";
            }
        }

        private void OnDebugStatusChanged(string agentId, string licenseStatus)
        {
            if (InvokeRequired)
            {
                Invoke(new Action(() => OnDebugStatusChanged(agentId, licenseStatus)));
                return;
            }

            _debugAgentIdLabel.Text = $"Agent ID: {agentId}";
            _debugLicenseStatusLabel.Text = $"License: {licenseStatus.ToUpper()}";

            if (licenseStatus == "active")
            {
                _debugLicenseStatusLabel.ForeColor = Color.Green;
            }
            else if (licenseStatus == "pending")
            {
                _debugLicenseStatusLabel.ForeColor = Color.Orange;
            }
            else
            {
                _debugLicenseStatusLabel.ForeColor = Color.Red;
            }
        }

        private void DebugLog(string message)
        {
            if (InvokeRequired)
            {
                Invoke(new Action(() => DebugLog(message)));
                return;
            }

            _debugLogTextBox.AppendText(message + Environment.NewLine);
            _debugLogTextBox.ScrollToCaret();
        }

        #endregion

        private async Task LoadDataAsync()
        {
            try
            {
                // Load status
                var status = await _serviceClient.GetStatusAsync();

                if (status.IsRunning)
                {
                    _statusLabel.Text = "Running";
                    _statusLabel.ForeColor = Color.Green;
                    _versionLabel.Text = status.Version;
                    _machineIdLabel.Text = status.MachineId.Length > 20
                        ? status.MachineId[..20] + "..."
                        : status.MachineId;
                    _machineIdLabel.Tag = status.MachineId;

                    _licenseStatusLabel.Text = status.IsLicensed ? "Licensed" : "Not Licensed";
                    _licenseStatusLabel.ForeColor = status.IsLicensed ? Color.Green : Color.Orange;
                    _expiryLabel.Text = status.LicenseExpiry?.ToString("yyyy-MM-dd") ?? "N/A";

                    _deactivateButton.Enabled = status.IsLicensed;
                }
                else
                {
                    _statusLabel.Text = "Not Running";
                    _statusLabel.ForeColor = Color.Red;
                    _versionLabel.Text = "-";
                    _machineIdLabel.Text = "-";
                    _licenseStatusLabel.Text = "Service not running";
                    _licenseStatusLabel.ForeColor = Color.Gray;
                    _expiryLabel.Text = "-";
                    _deactivateButton.Enabled = false;
                }

                // Load settings
                var settings = await _serviceClient.GetSettingsAsync();
                _controlServerUrlTextBox.Text = settings.ControlServerUrl;
                _portNumeric.Value = settings.Port;
                _autoStartCheckBox.Checked = settings.AutoStart;
                _loggingCheckBox.Checked = settings.EnableLogging;
            }
            catch (Exception ex)
            {
                MessageBox.Show(
                    $"Failed to load data: {ex.Message}",
                    "Error",
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Error
                );
            }
        }

        private void OnCopyMachineIdClick(object? sender, EventArgs e)
        {
            var machineId = _machineIdLabel.Tag as string;
            if (!string.IsNullOrEmpty(machineId))
            {
                Clipboard.SetText(machineId);
                MessageBox.Show("Machine ID copied to clipboard.", "ScreenControl", MessageBoxButtons.OK, MessageBoxIcon.Information);
            }
        }

        private async void OnActivateClick(object? sender, EventArgs e)
        {
            var licenseKey = _licenseKeyTextBox.Text.Trim();
            if (string.IsNullOrEmpty(licenseKey))
            {
                MessageBox.Show("Please enter a license key.", "ScreenControl", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                return;
            }

            _activateButton.Enabled = false;
            try
            {
                var (success, message) = await _serviceClient.ActivateLicenseAsync(licenseKey);

                if (success)
                {
                    MessageBox.Show("License activated successfully!", "ScreenControl", MessageBoxButtons.OK, MessageBoxIcon.Information);
                    await LoadDataAsync();
                }
                else
                {
                    MessageBox.Show($"Activation failed: {message}", "ScreenControl", MessageBoxButtons.OK, MessageBoxIcon.Error);
                }
            }
            finally
            {
                _activateButton.Enabled = true;
            }
        }

        private async void OnDeactivateClick(object? sender, EventArgs e)
        {
            var result = MessageBox.Show(
                "Are you sure you want to deactivate this license?",
                "Confirm Deactivation",
                MessageBoxButtons.YesNo,
                MessageBoxIcon.Question
            );

            if (result != DialogResult.Yes)
                return;

            _deactivateButton.Enabled = false;
            try
            {
                var (success, message) = await _serviceClient.DeactivateLicenseAsync();

                if (success)
                {
                    MessageBox.Show("License deactivated.", "ScreenControl", MessageBoxButtons.OK, MessageBoxIcon.Information);
                    _licenseKeyTextBox.Text = "";
                    await LoadDataAsync();
                }
                else
                {
                    MessageBox.Show($"Deactivation failed: {message}", "ScreenControl", MessageBoxButtons.OK, MessageBoxIcon.Error);
                }
            }
            finally
            {
                _deactivateButton.Enabled = true;
            }
        }

        private async void OnSaveClick(object? sender, EventArgs e)
        {
            _saveButton.Enabled = false;
            try
            {
                var settings = new ServiceSettings
                {
                    ControlServerUrl = _controlServerUrlTextBox.Text.Trim(),
                    Port = (int)_portNumeric.Value,
                    AutoStart = _autoStartCheckBox.Checked,
                    EnableLogging = _loggingCheckBox.Checked
                };

                var success = await _serviceClient.SaveSettingsAsync(settings);

                if (success)
                {
                    MessageBox.Show("Settings saved successfully.", "ScreenControl", MessageBoxButtons.OK, MessageBoxIcon.Information);
                }
                else
                {
                    MessageBox.Show("Failed to save settings.", "ScreenControl", MessageBoxButtons.OK, MessageBoxIcon.Error);
                }
            }
            finally
            {
                _saveButton.Enabled = true;
            }
        }
    }
}
