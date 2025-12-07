/**
 * Settings Form
 *
 * WinForms UI for service configuration and license management.
 */

using System;
using System.Drawing;
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

        public SettingsForm(ServiceClient serviceClient)
        {
            _serviceClient = serviceClient;
            InitializeComponent();
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
