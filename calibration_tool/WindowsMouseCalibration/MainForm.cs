using System;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using System.Text.Json;
using System.Windows.Forms;

namespace MouseCalibration;

public class MainForm : Form
{
    // Mouse Hook
    private IntPtr _mouseHookHandle = IntPtr.Zero;
    private LowLevelMouseProc? _mouseHookProc;

    // UI State
    private Point _currentMousePosition;
    private Point _lastClickPosition;
    private string _lastClickType = "None";
    private int _lastClickCount = 0;
    private Point _scrollDelta;
    private bool _showGrid = true;
    private CalibrationMode _mode = CalibrationMode.FreeForm;

    // Calibration
    private List<CalibrationTarget> _targets = new();
    private int _currentTargetIndex = 0;
    private List<CalibrationTarget> _results = new();

    // Event Log
    private List<MouseEvent> _eventLog = new();
    private const int MaxLogEntries = 100;
    private string _logFilePath;

    // Timer for smooth updates
    private System.Windows.Forms.Timer _updateTimer;

    // Double buffering
    private BufferedGraphicsContext _bufferContext;
    private BufferedGraphics? _bufferedGraphics;

    public enum CalibrationMode { FreeForm, Calibration, GridTest }

    public MainForm()
    {
        InitializeForm();
        InitializeMouseHook();
        InitializeLogFile();

        _updateTimer = new System.Windows.Forms.Timer();
        _updateTimer.Interval = 16; // ~60 FPS
        _updateTimer.Tick += (s, e) => Invalidate();
        _updateTimer.Start();

        _bufferContext = BufferedGraphicsManager.Current;
    }

    private void InitializeForm()
    {
        this.Text = "Mouse Calibration Tool";
        this.FormBorderStyle = FormBorderStyle.None;
        this.WindowState = FormWindowState.Maximized;
        this.BackColor = Color.Black;
        this.DoubleBuffered = true;
        this.SetStyle(ControlStyles.AllPaintingInWmPaint | ControlStyles.UserPaint | ControlStyles.OptimizedDoubleBuffer, true);

        this.KeyPreview = true;
        this.KeyDown += MainForm_KeyDown;
        this.MouseMove += MainForm_MouseMove;
        this.MouseDown += MainForm_MouseDown;
        this.MouseUp += MainForm_MouseUp;
        this.MouseWheel += MainForm_MouseWheel;
        this.Paint += MainForm_Paint;
        this.Resize += MainForm_Resize;
    }

    private void MainForm_Resize(object? sender, EventArgs e)
    {
        _bufferedGraphics?.Dispose();
        _bufferedGraphics = null;
    }

    private void InitializeLogFile()
    {
        _logFilePath = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.MyDocuments),
            "mouse_calibration_log.jsonl"
        );
        try
        {
            File.WriteAllText(_logFilePath, "");
        }
        catch { }
    }

    #region Mouse Hook

    private delegate IntPtr LowLevelMouseProc(int nCode, IntPtr wParam, IntPtr lParam);

    [DllImport("user32.dll", SetLastError = true)]
    private static extern IntPtr SetWindowsHookEx(int idHook, LowLevelMouseProc lpfn, IntPtr hMod, uint dwThreadId);

    [DllImport("user32.dll")]
    private static extern bool UnhookWindowsHookEx(IntPtr hhk);

    [DllImport("user32.dll")]
    private static extern IntPtr CallNextHookEx(IntPtr hhk, int nCode, IntPtr wParam, IntPtr lParam);

    [DllImport("kernel32.dll")]
    private static extern IntPtr GetModuleHandle(string? lpModuleName);

    [DllImport("user32.dll")]
    private static extern bool GetCursorPos(out POINT lpPoint);

    [StructLayout(LayoutKind.Sequential)]
    private struct POINT { public int X; public int Y; }

    [StructLayout(LayoutKind.Sequential)]
    private struct MSLLHOOKSTRUCT
    {
        public POINT pt;
        public uint mouseData;
        public uint flags;
        public uint time;
        public IntPtr dwExtraInfo;
    }

    private const int WH_MOUSE_LL = 14;
    private const int WM_LBUTTONDOWN = 0x0201;
    private const int WM_LBUTTONUP = 0x0202;
    private const int WM_RBUTTONDOWN = 0x0204;
    private const int WM_RBUTTONUP = 0x0205;
    private const int WM_MBUTTONDOWN = 0x0207;
    private const int WM_MBUTTONUP = 0x0208;
    private const int WM_MOUSEWHEEL = 0x020A;
    private const int WM_MOUSEMOVE = 0x0200;

    private void InitializeMouseHook()
    {
        _mouseHookProc = MouseHookCallback;
        using var curProcess = System.Diagnostics.Process.GetCurrentProcess();
        using var curModule = curProcess.MainModule;
        _mouseHookHandle = SetWindowsHookEx(WH_MOUSE_LL, _mouseHookProc,
            GetModuleHandle(curModule?.ModuleName), 0);

        if (_mouseHookHandle == IntPtr.Zero)
        {
            MessageBox.Show("Failed to install mouse hook. Some features may not work.");
        }
    }

    private IntPtr MouseHookCallback(int nCode, IntPtr wParam, IntPtr lParam)
    {
        if (nCode >= 0)
        {
            var hookStruct = Marshal.PtrToStructure<MSLLHOOKSTRUCT>(lParam);
            var screenPoint = new Point(hookStruct.pt.X, hookStruct.pt.Y);
            var windowPoint = this.PointToClient(screenPoint);

            int msg = (int)wParam;
            string eventType = "";
            int button = -1;
            bool isDown = false;

            switch (msg)
            {
                case WM_LBUTTONDOWN:
                    eventType = "LEFT_DOWN_HOOK"; button = 0; isDown = true;
                    break;
                case WM_LBUTTONUP:
                    eventType = "LEFT_UP_HOOK"; button = 0; isDown = false;
                    break;
                case WM_RBUTTONDOWN:
                    eventType = "RIGHT_DOWN_HOOK"; button = 1; isDown = true;
                    break;
                case WM_RBUTTONUP:
                    eventType = "RIGHT_UP_HOOK"; button = 1; isDown = false;
                    break;
                case WM_MBUTTONDOWN:
                    eventType = "MIDDLE_DOWN_HOOK"; button = 2; isDown = true;
                    break;
                case WM_MBUTTONUP:
                    eventType = "MIDDLE_UP_HOOK"; button = 2; isDown = false;
                    break;
                case WM_MOUSEWHEEL:
                    short delta = (short)(hookStruct.mouseData >> 16);
                    eventType = "SCROLL_HOOK";
                    LogEvent(new MouseEvent
                    {
                        EventType = eventType,
                        ScreenX = screenPoint.X,
                        ScreenY = screenPoint.Y,
                        WindowX = windowPoint.X,
                        WindowY = windowPoint.Y,
                        Button = -1,
                        ClickCount = 0,
                        ScrollDeltaY = delta,
                        Flags = hookStruct.flags
                    });
                    break;
            }

            if (button >= 0)
            {
                var evt = new MouseEvent
                {
                    EventType = eventType,
                    ScreenX = screenPoint.X,
                    ScreenY = screenPoint.Y,
                    WindowX = windowPoint.X,
                    WindowY = windowPoint.Y,
                    Button = button,
                    ClickCount = 1,
                    Flags = hookStruct.flags
                };

                // Check if this is a synthetic event (injected)
                if ((hookStruct.flags & 1) != 0) // LLMHF_INJECTED
                {
                    evt.EventType = eventType.Replace("_HOOK", "_SYNTHETIC");
                }

                LogEvent(evt);

                if (isDown)
                {
                    _lastClickPosition = windowPoint;
                    _lastClickType = button == 0 ? "LEFT" : button == 1 ? "RIGHT" : "MIDDLE";

                    // Check calibration target hit
                    if (_mode == CalibrationMode.Calibration && _currentTargetIndex < _targets.Count)
                    {
                        HandleTargetHit(windowPoint);
                    }
                }
            }
        }

        return CallNextHookEx(_mouseHookHandle, nCode, wParam, lParam);
    }

    #endregion

    #region Form Events

    private void MainForm_KeyDown(object? sender, KeyEventArgs e)
    {
        switch (e.KeyCode)
        {
            case Keys.Escape:
                Close();
                break;
            case Keys.G:
                _showGrid = !_showGrid;
                break;
            case Keys.C:
                StartCalibration();
                break;
            case Keys.F:
                _mode = CalibrationMode.FreeForm;
                break;
            case Keys.T:
                _mode = CalibrationMode.GridTest;
                break;
            case Keys.L:
                ClearLog();
                break;
        }
    }

    private void MainForm_MouseMove(object? sender, MouseEventArgs e)
    {
        _currentMousePosition = e.Location;
    }

    private void MainForm_MouseDown(object? sender, MouseEventArgs e)
    {
        var screenPoint = this.PointToScreen(e.Location);
        string buttonName = e.Button switch
        {
            MouseButtons.Left => "LEFT",
            MouseButtons.Right => "RIGHT",
            MouseButtons.Middle => "MIDDLE",
            _ => "UNKNOWN"
        };

        _lastClickPosition = e.Location;
        _lastClickType = buttonName;
        _lastClickCount = e.Clicks;

        LogEvent(new MouseEvent
        {
            EventType = $"{buttonName}_DOWN",
            ScreenX = screenPoint.X,
            ScreenY = screenPoint.Y,
            WindowX = e.Location.X,
            WindowY = e.Location.Y,
            Button = (int)e.Button,
            ClickCount = e.Clicks
        });
    }

    private void MainForm_MouseUp(object? sender, MouseEventArgs e)
    {
        var screenPoint = this.PointToScreen(e.Location);
        string buttonName = e.Button switch
        {
            MouseButtons.Left => "LEFT",
            MouseButtons.Right => "RIGHT",
            MouseButtons.Middle => "MIDDLE",
            _ => "UNKNOWN"
        };

        LogEvent(new MouseEvent
        {
            EventType = $"{buttonName}_UP",
            ScreenX = screenPoint.X,
            ScreenY = screenPoint.Y,
            WindowX = e.Location.X,
            WindowY = e.Location.Y,
            Button = (int)e.Button,
            ClickCount = e.Clicks
        });
    }

    private void MainForm_MouseWheel(object? sender, MouseEventArgs e)
    {
        var screenPoint = this.PointToScreen(e.Location);
        _scrollDelta = new Point(0, e.Delta);

        LogEvent(new MouseEvent
        {
            EventType = "SCROLL",
            ScreenX = screenPoint.X,
            ScreenY = screenPoint.Y,
            WindowX = e.Location.X,
            WindowY = e.Location.Y,
            ScrollDeltaY = e.Delta
        });
    }

    #endregion

    #region Painting

    private void MainForm_Paint(object? sender, PaintEventArgs e)
    {
        var g = e.Graphics;
        g.SmoothingMode = SmoothingMode.AntiAlias;

        // Get current cursor position
        GetCursorPos(out POINT cursorPos);
        var screenPos = new Point(cursorPos.X, cursorPos.Y);
        var windowPos = this.PointToClient(screenPos);
        _currentMousePosition = windowPos;

        // Draw grid
        if (_showGrid)
        {
            DrawGrid(g);
        }

        // Draw calibration targets
        if (_mode == CalibrationMode.Calibration)
        {
            DrawCalibrationTargets(g);
        }
        else if (_mode == CalibrationMode.GridTest)
        {
            DrawGridTestTargets(g);
        }

        // Draw last click indicator
        if (_lastClickPosition != Point.Empty)
        {
            using var pen = new Pen(Color.Red, 2);
            g.DrawEllipse(pen, _lastClickPosition.X - 10, _lastClickPosition.Y - 10, 20, 20);
        }

        // Draw crosshair at mouse position
        DrawCrosshair(g, windowPos);

        // Draw info panel
        DrawInfoPanel(g, windowPos, screenPos);

        // Draw control panel
        DrawControlPanel(g);

        // Draw event log
        DrawEventLog(g);
    }

    private void DrawGrid(Graphics g)
    {
        const int spacing = 100;
        using var pen = new Pen(Color.FromArgb(50, 128, 128, 128), 1);

        for (int x = 0; x < Width; x += spacing)
        {
            g.DrawLine(pen, x, 0, x, Height);
        }
        for (int y = 0; y < Height; y += spacing)
        {
            g.DrawLine(pen, 0, y, Width, y);
        }
    }

    private void DrawCrosshair(Graphics g, Point pos)
    {
        using var pen = new Pen(Color.Lime, 1);
        using var brush = new SolidBrush(Color.Lime);

        g.DrawLine(pen, pos.X, pos.Y - 20, pos.X, pos.Y + 20);
        g.DrawLine(pen, pos.X - 20, pos.Y, pos.X + 20, pos.Y);
        g.FillEllipse(brush, pos.X - 3, pos.Y - 3, 6, 6);
    }

    private void DrawCalibrationTargets(Graphics g)
    {
        for (int i = 0; i < _targets.Count; i++)
        {
            var target = _targets[i];
            bool isActive = i == _currentTargetIndex;
            Color color = isActive ? Color.Yellow : (target.Hit ? Color.Green : Color.White);

            using var pen = new Pen(color, 2);
            using var brush = new SolidBrush(Color.FromArgb(50, color));
            using var centerBrush = new SolidBrush(color);

            g.DrawEllipse(pen, target.X - 20, target.Y - 20, 40, 40);
            g.FillEllipse(brush, target.X - 15, target.Y - 15, 30, 30);
            g.FillEllipse(centerBrush, target.X - 3, target.Y - 3, 6, 6);

            using var font = new Font("Consolas", 8);
            g.DrawString(target.Label, font, new SolidBrush(Color.White), target.X - 5, target.Y + 25);
        }
    }

    private void DrawGridTestTargets(Graphics g)
    {
        int rows = 5, cols = 7;
        int marginX = 100, marginY = 150;
        float spacingX = (Width - 2 * marginX) / (float)(cols - 1);
        float spacingY = (Height - 2 * marginY - 200) / (float)(rows - 1);

        using var pen = new Pen(Color.Cyan, 1);

        for (int row = 0; row < rows; row++)
        {
            for (int col = 0; col < cols; col++)
            {
                int x = (int)(marginX + spacingX * col);
                int y = (int)(marginY + spacingY * row);
                g.DrawEllipse(pen, x - 10, y - 10, 20, 20);
            }
        }
    }

    private void DrawInfoPanel(Graphics g, Point windowPos, Point screenPos)
    {
        int panelX = 10, panelY = 10;
        int panelWidth = 320, panelHeight = 180;

        using var bgBrush = new SolidBrush(Color.FromArgb(200, 0, 0, 0));
        g.FillRectangle(bgBrush, panelX, panelY, panelWidth, panelHeight);

        using var font = new Font("Consolas", 10);
        using var titleFont = new Font("Consolas", 12, FontStyle.Bold);
        using var whiteBrush = new SolidBrush(Color.White);
        using var greenBrush = new SolidBrush(Color.Lime);

        int y = panelY + 10;
        g.DrawString("Mouse Calibration Tool", titleFont, whiteBrush, panelX + 10, y);
        y += 25;

        var screen = Screen.FromControl(this);
        g.DrawString($"Window Position: ({windowPos.X}, {windowPos.Y})", font, greenBrush, panelX + 10, y); y += 18;
        g.DrawString($"Screen Position: ({screenPos.X}, {screenPos.Y})", font, greenBrush, panelX + 10, y); y += 18;
        g.DrawString($"Screen Size: {screen.Bounds.Width} x {screen.Bounds.Height}", font, greenBrush, panelX + 10, y); y += 18;
        g.DrawString($"Window Size: {Width} x {Height}", font, greenBrush, panelX + 10, y); y += 18;
        g.DrawString($"Last Click: {_lastClickType} ({_lastClickCount}x)", font, greenBrush, panelX + 10, y); y += 18;
        g.DrawString($"Click Pos: ({_lastClickPosition.X}, {_lastClickPosition.Y})", font, greenBrush, panelX + 10, y); y += 18;
        g.DrawString($"Scroll Delta: {_scrollDelta.Y}", font, greenBrush, panelX + 10, y);
    }

    private void DrawControlPanel(Graphics g)
    {
        int panelX = Width - 330, panelY = 10;
        int panelWidth = 320, panelHeight = 130;

        using var bgBrush = new SolidBrush(Color.FromArgb(200, 0, 0, 0));
        g.FillRectangle(bgBrush, panelX, panelY, panelWidth, panelHeight);

        using var font = new Font("Consolas", 9);
        using var whiteBrush = new SolidBrush(Color.White);
        using var yellowBrush = new SolidBrush(Color.Yellow);

        int y = panelY + 10;
        g.DrawString($"Mode: {_mode}", font, yellowBrush, panelX + 10, y); y += 18;
        g.DrawString("[F] Free Form  [C] Calibration  [T] Grid Test", font, whiteBrush, panelX + 10, y); y += 18;
        g.DrawString($"[G] Toggle Grid ({(_showGrid ? "ON" : "OFF")})", font, whiteBrush, panelX + 10, y); y += 18;
        g.DrawString("[L] Clear Log", font, whiteBrush, panelX + 10, y); y += 18;
        g.DrawString("[ESC] Exit", font, whiteBrush, panelX + 10, y); y += 18;

        if (_mode == CalibrationMode.Calibration)
        {
            g.DrawString($"Target: {_currentTargetIndex + 1} / {_targets.Count}", font, yellowBrush, panelX + 10, y);
        }
    }

    private void DrawEventLog(Graphics g)
    {
        int panelX = 10, panelY = Height - 200;
        int panelWidth = Width - 20, panelHeight = 190;

        using var bgBrush = new SolidBrush(Color.FromArgb(200, 0, 0, 0));
        g.FillRectangle(bgBrush, panelX, panelY, panelWidth, panelHeight);

        using var font = new Font("Consolas", 8);
        using var titleFont = new Font("Consolas", 10, FontStyle.Bold);
        using var whiteBrush = new SolidBrush(Color.White);
        using var grayBrush = new SolidBrush(Color.Gray);
        using var yellowBrush = new SolidBrush(Color.Yellow);
        using var greenBrush = new SolidBrush(Color.Lime);
        using var cyanBrush = new SolidBrush(Color.Cyan);
        using var redBrush = new SolidBrush(Color.Red);

        int y = panelY + 5;
        g.DrawString($"Event Log (last {_eventLog.Count})", titleFont, whiteBrush, panelX + 10, y);
        y += 18;

        var recentEvents = _eventLog.TakeLast(10).ToList();
        foreach (var evt in recentEvents)
        {
            string time = evt.Timestamp.ToString("HH:mm:ss.fff");
            g.DrawString(time, font, grayBrush, panelX + 10, y);

            // Color based on event type
            var typeBrush = evt.EventType.Contains("SYNTHETIC") ? redBrush :
                           evt.EventType.Contains("HOOK") ? cyanBrush : yellowBrush;
            g.DrawString(evt.EventType, font, typeBrush, panelX + 100, y);

            g.DrawString($"W:({evt.WindowX},{evt.WindowY})", font, greenBrush, panelX + 280, y);
            g.DrawString($"S:({evt.ScreenX},{evt.ScreenY})", font, cyanBrush, panelX + 420, y);

            if (evt.Flags > 0)
            {
                g.DrawString($"Flags:{evt.Flags}", font, redBrush, panelX + 560, y);
            }

            y += 15;
        }
    }

    #endregion

    #region Calibration

    private void StartCalibration()
    {
        _targets.Clear();
        _results.Clear();
        _currentTargetIndex = 0;

        int margin = 100;
        int rows = 4, cols = 5;
        float spacingX = (Width - 2 * margin) / (float)(cols - 1);
        float spacingY = (Height - 2 * margin - 200) / (float)(rows - 1);

        for (int row = 0; row < rows; row++)
        {
            for (int col = 0; col < cols; col++)
            {
                int x = (int)(margin + spacingX * col);
                int y = (int)(margin + spacingY * row);
                _targets.Add(new CalibrationTarget
                {
                    X = x,
                    Y = y,
                    Label = (row * cols + col + 1).ToString()
                });
            }
        }

        _mode = CalibrationMode.Calibration;
    }

    private void HandleTargetHit(Point clickPos)
    {
        if (_currentTargetIndex >= _targets.Count) return;

        var target = _targets[_currentTargetIndex];
        target.Hit = true;
        target.HitX = clickPos.X;
        target.HitY = clickPos.Y;
        target.Deviation = Math.Sqrt(Math.Pow(clickPos.X - target.X, 2) + Math.Pow(clickPos.Y - target.Y, 2));

        _targets[_currentTargetIndex] = target;
        _results.Add(target);
        _currentTargetIndex++;

        if (_currentTargetIndex >= _targets.Count)
        {
            PrintCalibrationResults();
        }
    }

    private void PrintCalibrationResults()
    {
        var sb = new StringBuilder();
        sb.AppendLine("\n=== CALIBRATION RESULTS ===");
        double totalDeviation = 0;

        foreach (var result in _results)
        {
            sb.AppendLine($"Target {result.Label}: Deviation = {result.Deviation:F1}px");
            totalDeviation += result.Deviation;
        }

        double avgDeviation = totalDeviation / _results.Count;
        sb.AppendLine($"Average Deviation: {avgDeviation:F1}px");
        sb.AppendLine("===========================");

        MessageBox.Show(sb.ToString(), "Calibration Complete");
    }

    #endregion

    #region Logging

    private void LogEvent(MouseEvent evt)
    {
        _eventLog.Add(evt);
        if (_eventLog.Count > MaxLogEntries)
        {
            _eventLog.RemoveAt(0);
        }

        try
        {
            var json = JsonSerializer.Serialize(evt);
            File.AppendAllText(_logFilePath, json + "\n");
        }
        catch { }

        Console.WriteLine($"[{evt.EventType}] Screen:({evt.ScreenX},{evt.ScreenY}) Window:({evt.WindowX},{evt.WindowY}) Flags:{evt.Flags}");
    }

    private void ClearLog()
    {
        _eventLog.Clear();
        try { File.WriteAllText(_logFilePath, ""); } catch { }
    }

    #endregion

    protected override void OnFormClosing(FormClosingEventArgs e)
    {
        _updateTimer?.Stop();
        if (_mouseHookHandle != IntPtr.Zero)
        {
            UnhookWindowsHookEx(_mouseHookHandle);
        }
        base.OnFormClosing(e);
    }
}

public struct CalibrationTarget
{
    public int X { get; set; }
    public int Y { get; set; }
    public string Label { get; set; }
    public bool Hit { get; set; }
    public int HitX { get; set; }
    public int HitY { get; set; }
    public double Deviation { get; set; }
}

public class MouseEvent
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public DateTime Timestamp { get; set; } = DateTime.Now;
    public string EventType { get; set; } = "";
    public int ScreenX { get; set; }
    public int ScreenY { get; set; }
    public int WindowX { get; set; }
    public int WindowY { get; set; }
    public int Button { get; set; }
    public int ClickCount { get; set; }
    public int ScrollDeltaX { get; set; }
    public int ScrollDeltaY { get; set; }
    public uint Flags { get; set; }
}
