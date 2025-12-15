/**
 * GUI Bridge Server for ScreenControl Windows Agent
 *
 * HTTP server on port 3457 that handles GUI operations from the service.
 * The service runs in Session 0 (no desktop access), so all GUI operations
 * must be proxied to this tray app running in the user's session.
 *
 * Endpoints:
 *   POST /screenshot - Capture screen
 *   POST /click - Click at coordinates
 *   POST /doubleClick - Double click at coordinates
 *   POST /rightClick - Right click at coordinates
 *   POST /typeText - Type text string
 *   POST /pressKey - Press keyboard key
 *   POST /scroll - Scroll mouse wheel
 *   POST /drag - Drag from point to point
 *   POST /moveMouse - Move mouse cursor
 *   GET /mousePosition - Get cursor position
 */

using System;
using System.Drawing;
using System.Drawing.Imaging;
using System.IO;
using System.Net;
using System.Runtime.InteropServices;
using System.Text;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using System.Windows.Forms;

namespace ScreenControlTray
{
    public class GUIBridgeServer : IDisposable
    {
        private HttpListener? _listener;
        private CancellationTokenSource? _cts;
        private bool _isRunning;
        private ushort _port;

        public bool IsRunning => _isRunning;
        public ushort Port => _port;

        // Windows API imports for input simulation
        [DllImport("user32.dll")]
        private static extern bool SetCursorPos(int x, int y);

        [DllImport("user32.dll")]
        private static extern bool GetCursorPos(out POINT lpPoint);

        [DllImport("user32.dll")]
        private static extern void mouse_event(uint dwFlags, int dx, int dy, int dwData, int dwExtraInfo);

        [DllImport("user32.dll")]
        private static extern uint SendInput(uint nInputs, INPUT[] pInputs, int cbSize);

        [DllImport("user32.dll")]
        private static extern short VkKeyScan(char ch);

        [StructLayout(LayoutKind.Sequential)]
        private struct POINT
        {
            public int X;
            public int Y;
        }

        [StructLayout(LayoutKind.Sequential)]
        private struct INPUT
        {
            public uint type;
            public INPUTUNION union;
        }

        [StructLayout(LayoutKind.Explicit)]
        private struct INPUTUNION
        {
            [FieldOffset(0)] public MOUSEINPUT mi;
            [FieldOffset(0)] public KEYBDINPUT ki;
        }

        [StructLayout(LayoutKind.Sequential)]
        private struct MOUSEINPUT
        {
            public int dx;
            public int dy;
            public int mouseData;
            public uint dwFlags;
            public uint time;
            public IntPtr dwExtraInfo;
        }

        [StructLayout(LayoutKind.Sequential)]
        private struct KEYBDINPUT
        {
            public ushort wVk;
            public ushort wScan;
            public uint dwFlags;
            public uint time;
            public IntPtr dwExtraInfo;
        }

        // Mouse event flags
        private const uint MOUSEEVENTF_LEFTDOWN = 0x0002;
        private const uint MOUSEEVENTF_LEFTUP = 0x0004;
        private const uint MOUSEEVENTF_RIGHTDOWN = 0x0008;
        private const uint MOUSEEVENTF_RIGHTUP = 0x0010;
        private const uint MOUSEEVENTF_MIDDLEDOWN = 0x0020;
        private const uint MOUSEEVENTF_MIDDLEUP = 0x0040;
        private const uint MOUSEEVENTF_WHEEL = 0x0800;
        private const uint MOUSEEVENTF_ABSOLUTE = 0x8000;
        private const uint MOUSEEVENTF_MOVE = 0x0001;

        // Input types
        private const uint INPUT_MOUSE = 0;
        private const uint INPUT_KEYBOARD = 1;

        // Keyboard flags
        private const uint KEYEVENTF_KEYUP = 0x0002;
        private const uint KEYEVENTF_UNICODE = 0x0004;

        public bool Start(ushort port = 3457)
        {
            if (_isRunning) return true;

            try
            {
                _listener = new HttpListener();
                _listener.Prefixes.Add($"http://127.0.0.1:{port}/");
                _listener.Start();

                _cts = new CancellationTokenSource();
                _port = port;
                _isRunning = true;

                _ = ListenLoopAsync();

                Console.WriteLine($"[GUIBridge] Started on localhost:{_port}");
                return true;
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[GUIBridge] Failed to start: {ex.Message}");
                _listener?.Close();
                _listener = null;
                return false;
            }
        }

        public void Stop()
        {
            if (!_isRunning) return;

            Console.WriteLine("[GUIBridge] Stopping...");

            _cts?.Cancel();
            _listener?.Stop();
            _listener?.Close();
            _listener = null;
            _isRunning = false;
            _port = 0;
        }

        private async Task ListenLoopAsync()
        {
            while (_isRunning && _listener != null && !_cts!.Token.IsCancellationRequested)
            {
                try
                {
                    var context = await _listener.GetContextAsync();
                    _ = HandleRequestAsync(context);
                }
                catch (HttpListenerException)
                {
                    break;
                }
                catch (ObjectDisposedException)
                {
                    break;
                }
                catch (Exception ex)
                {
                    Console.WriteLine($"[GUIBridge] Error: {ex.Message}");
                }
            }
        }

        private async Task HandleRequestAsync(HttpListenerContext context)
        {
            var request = context.Request;
            var response = context.Response;

            // Add CORS headers
            response.Headers.Add("Access-Control-Allow-Origin", "*");
            response.Headers.Add("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
            response.Headers.Add("Access-Control-Allow-Headers", "Content-Type");

            try
            {
                // Handle OPTIONS (CORS preflight)
                if (request.HttpMethod == "OPTIONS")
                {
                    response.StatusCode = 200;
                    response.Close();
                    return;
                }

                string path = request.Url?.AbsolutePath ?? "";
                string body = "";

                if (request.HttpMethod == "POST" && request.HasEntityBody)
                {
                    using var reader = new StreamReader(request.InputStream, Encoding.UTF8);
                    body = await reader.ReadToEndAsync();
                }

                (byte[] responseData, string contentType) = path switch
                {
                    "/screenshot" => HandleScreenshot(body),
                    "/click" => HandleClick(body),
                    "/doubleClick" => HandleDoubleClick(body),
                    "/rightClick" => HandleRightClick(body),
                    "/typeText" => HandleTypeText(body),
                    "/pressKey" => HandlePressKey(body),
                    "/scroll" => HandleScroll(body),
                    "/drag" => HandleDrag(body),
                    "/moveMouse" or "/mouse/move" => HandleMoveMouse(body),
                    "/mousePosition" or "/mouse/position" => HandleMousePosition(),
                    "/clipboard/read" => HandleClipboardRead(),
                    "/clipboard/write" => HandleClipboardWrite(body),
                    "/getWindowList" => HandleGetWindowList(),
                    "/focusWindow" => HandleFocusWindow(body),
                    "/health" => (JsonResponse(new { success = true, service = "GUIBridge", port = _port }), "application/json"),
                    _ => (JsonResponse(new { success = false, error = $"Unknown endpoint: {path}" }), "application/json")
                };

                response.ContentType = contentType;
                response.ContentLength64 = responseData.Length;
                await response.OutputStream.WriteAsync(responseData);
            }
            catch (Exception ex)
            {
                var errorJson = JsonResponse(new { success = false, error = ex.Message });
                response.StatusCode = 500;
                response.ContentType = "application/json";
                response.ContentLength64 = errorJson.Length;
                await response.OutputStream.WriteAsync(errorJson);
            }
            finally
            {
                response.Close();
            }
        }

        private byte[] JsonResponse(object obj)
        {
            return Encoding.UTF8.GetBytes(JsonSerializer.Serialize(obj));
        }

        private (byte[], string) HandleScreenshot(string body)
        {
            try
            {
                // Get virtual screen bounds (all monitors)
                int left = SystemInformation.VirtualScreen.Left;
                int top = SystemInformation.VirtualScreen.Top;
                int width = SystemInformation.VirtualScreen.Width;
                int height = SystemInformation.VirtualScreen.Height;

                using var bitmap = new Bitmap(width, height);
                using var graphics = Graphics.FromImage(bitmap);

                graphics.CopyFromScreen(left, top, 0, 0, new Size(width, height));

                // Convert to JPEG
                using var ms = new MemoryStream();
                var encoder = ImageCodecInfo.GetImageEncoders().First(c => c.FormatID == ImageFormat.Jpeg.Guid);
                var encoderParams = new EncoderParameters(1);
                encoderParams.Param[0] = new EncoderParameter(System.Drawing.Imaging.Encoder.Quality, 85L);
                bitmap.Save(ms, encoder, encoderParams);

                // Return image directly
                return (ms.ToArray(), "image/jpeg");
            }
            catch (Exception ex)
            {
                return (JsonResponse(new { success = false, error = ex.Message }), "application/json");
            }
        }

        private (byte[], string) HandleClick(string body)
        {
            try
            {
                var options = JsonSerializer.Deserialize<JsonElement>(body);
                int x = options.TryGetProperty("x", out var xVal) ? xVal.GetInt32() : 0;
                int y = options.TryGetProperty("y", out var yVal) ? yVal.GetInt32() : 0;
                string button = options.TryGetProperty("button", out var bVal) ? bVal.GetString() ?? "left" : "left";

                SetCursorPos(x, y);
                Thread.Sleep(10);

                if (button == "right")
                {
                    mouse_event(MOUSEEVENTF_RIGHTDOWN, x, y, 0, 0);
                    Thread.Sleep(10);
                    mouse_event(MOUSEEVENTF_RIGHTUP, x, y, 0, 0);
                }
                else if (button == "middle")
                {
                    mouse_event(MOUSEEVENTF_MIDDLEDOWN, x, y, 0, 0);
                    Thread.Sleep(10);
                    mouse_event(MOUSEEVENTF_MIDDLEUP, x, y, 0, 0);
                }
                else
                {
                    mouse_event(MOUSEEVENTF_LEFTDOWN, x, y, 0, 0);
                    Thread.Sleep(10);
                    mouse_event(MOUSEEVENTF_LEFTUP, x, y, 0, 0);
                }

                return (JsonResponse(new { success = true, x, y, button }), "application/json");
            }
            catch (Exception ex)
            {
                return (JsonResponse(new { success = false, error = ex.Message }), "application/json");
            }
        }

        private (byte[], string) HandleDoubleClick(string body)
        {
            try
            {
                var options = JsonSerializer.Deserialize<JsonElement>(body);
                int x = options.TryGetProperty("x", out var xVal) ? xVal.GetInt32() : 0;
                int y = options.TryGetProperty("y", out var yVal) ? yVal.GetInt32() : 0;

                SetCursorPos(x, y);
                Thread.Sleep(10);

                // Double click
                mouse_event(MOUSEEVENTF_LEFTDOWN, x, y, 0, 0);
                Thread.Sleep(10);
                mouse_event(MOUSEEVENTF_LEFTUP, x, y, 0, 0);
                Thread.Sleep(50);
                mouse_event(MOUSEEVENTF_LEFTDOWN, x, y, 0, 0);
                Thread.Sleep(10);
                mouse_event(MOUSEEVENTF_LEFTUP, x, y, 0, 0);

                return (JsonResponse(new { success = true, x, y }), "application/json");
            }
            catch (Exception ex)
            {
                return (JsonResponse(new { success = false, error = ex.Message }), "application/json");
            }
        }

        private (byte[], string) HandleRightClick(string body)
        {
            try
            {
                var options = JsonSerializer.Deserialize<JsonElement>(body);
                int x = options.TryGetProperty("x", out var xVal) ? xVal.GetInt32() : 0;
                int y = options.TryGetProperty("y", out var yVal) ? yVal.GetInt32() : 0;

                SetCursorPos(x, y);
                Thread.Sleep(10);

                mouse_event(MOUSEEVENTF_RIGHTDOWN, x, y, 0, 0);
                Thread.Sleep(10);
                mouse_event(MOUSEEVENTF_RIGHTUP, x, y, 0, 0);

                return (JsonResponse(new { success = true, x, y }), "application/json");
            }
            catch (Exception ex)
            {
                return (JsonResponse(new { success = false, error = ex.Message }), "application/json");
            }
        }

        private (byte[], string) HandleTypeText(string body)
        {
            try
            {
                var options = JsonSerializer.Deserialize<JsonElement>(body);
                string text = options.TryGetProperty("text", out var tVal) ? tVal.GetString() ?? "" : "";

                foreach (char c in text)
                {
                    // Use Unicode input for proper character support
                    INPUT[] inputs = new INPUT[2];

                    inputs[0].type = INPUT_KEYBOARD;
                    inputs[0].union.ki.wVk = 0;
                    inputs[0].union.ki.wScan = (ushort)c;
                    inputs[0].union.ki.dwFlags = KEYEVENTF_UNICODE;

                    inputs[1].type = INPUT_KEYBOARD;
                    inputs[1].union.ki.wVk = 0;
                    inputs[1].union.ki.wScan = (ushort)c;
                    inputs[1].union.ki.dwFlags = KEYEVENTF_UNICODE | KEYEVENTF_KEYUP;

                    SendInput(2, inputs, Marshal.SizeOf(typeof(INPUT)));
                    Thread.Sleep(5);
                }

                return (JsonResponse(new { success = true, length = text.Length }), "application/json");
            }
            catch (Exception ex)
            {
                return (JsonResponse(new { success = false, error = ex.Message }), "application/json");
            }
        }

        private (byte[], string) HandlePressKey(string body)
        {
            try
            {
                var options = JsonSerializer.Deserialize<JsonElement>(body);
                string key = options.TryGetProperty("key", out var kVal) ? kVal.GetString() ?? "" : "";

                ushort vk = GetVirtualKeyCode(key);
                if (vk == 0)
                {
                    return (JsonResponse(new { success = false, error = $"Unknown key: {key}" }), "application/json");
                }

                INPUT[] inputs = new INPUT[2];

                inputs[0].type = INPUT_KEYBOARD;
                inputs[0].union.ki.wVk = vk;
                inputs[0].union.ki.dwFlags = 0;

                inputs[1].type = INPUT_KEYBOARD;
                inputs[1].union.ki.wVk = vk;
                inputs[1].union.ki.dwFlags = KEYEVENTF_KEYUP;

                SendInput(2, inputs, Marshal.SizeOf(typeof(INPUT)));

                return (JsonResponse(new { success = true, key }), "application/json");
            }
            catch (Exception ex)
            {
                return (JsonResponse(new { success = false, error = ex.Message }), "application/json");
            }
        }

        private (byte[], string) HandleScroll(string body)
        {
            try
            {
                var options = JsonSerializer.Deserialize<JsonElement>(body);
                int deltaX = options.TryGetProperty("deltaX", out var dxVal) ? dxVal.GetInt32() : 0;
                int deltaY = options.TryGetProperty("deltaY", out var dyVal) ? dyVal.GetInt32() : 0;
                string direction = options.TryGetProperty("direction", out var dirVal) ? dirVal.GetString() ?? "" : "";
                int amount = options.TryGetProperty("amount", out var amtVal) ? amtVal.GetInt32() : 3;

                // Handle direction-based scrolling
                if (!string.IsNullOrEmpty(direction))
                {
                    deltaY = direction == "up" ? 120 * amount : -120 * amount;
                }

                if (deltaY != 0)
                {
                    mouse_event(MOUSEEVENTF_WHEEL, 0, 0, deltaY, 0);
                }

                return (JsonResponse(new { success = true, deltaX, deltaY }), "application/json");
            }
            catch (Exception ex)
            {
                return (JsonResponse(new { success = false, error = ex.Message }), "application/json");
            }
        }

        private (byte[], string) HandleDrag(string body)
        {
            try
            {
                var options = JsonSerializer.Deserialize<JsonElement>(body);
                int startX = options.TryGetProperty("startX", out var sxVal) ? sxVal.GetInt32() : 0;
                int startY = options.TryGetProperty("startY", out var syVal) ? syVal.GetInt32() : 0;
                int endX = options.TryGetProperty("endX", out var exVal) ? exVal.GetInt32() : 0;
                int endY = options.TryGetProperty("endY", out var eyVal) ? eyVal.GetInt32() : 0;

                // Move to start position
                SetCursorPos(startX, startY);
                Thread.Sleep(50);

                // Press mouse button
                mouse_event(MOUSEEVENTF_LEFTDOWN, startX, startY, 0, 0);
                Thread.Sleep(50);

                // Move to end position in steps
                int steps = 20;
                for (int i = 1; i <= steps; i++)
                {
                    int x = startX + (endX - startX) * i / steps;
                    int y = startY + (endY - startY) * i / steps;
                    SetCursorPos(x, y);
                    Thread.Sleep(10);
                }

                // Release mouse button
                Thread.Sleep(50);
                mouse_event(MOUSEEVENTF_LEFTUP, endX, endY, 0, 0);

                return (JsonResponse(new { success = true, startX, startY, endX, endY }), "application/json");
            }
            catch (Exception ex)
            {
                return (JsonResponse(new { success = false, error = ex.Message }), "application/json");
            }
        }

        private (byte[], string) HandleMoveMouse(string body)
        {
            try
            {
                var options = JsonSerializer.Deserialize<JsonElement>(body);
                int x = options.TryGetProperty("x", out var xVal) ? xVal.GetInt32() : 0;
                int y = options.TryGetProperty("y", out var yVal) ? yVal.GetInt32() : 0;

                SetCursorPos(x, y);

                return (JsonResponse(new { success = true, x, y }), "application/json");
            }
            catch (Exception ex)
            {
                return (JsonResponse(new { success = false, error = ex.Message }), "application/json");
            }
        }

        private (byte[], string) HandleMousePosition()
        {
            try
            {
                GetCursorPos(out POINT point);
                return (JsonResponse(new { success = true, x = point.X, y = point.Y }), "application/json");
            }
            catch (Exception ex)
            {
                return (JsonResponse(new { success = false, error = ex.Message }), "application/json");
            }
        }

        private static ushort GetVirtualKeyCode(string key)
        {
            return key.ToLower() switch
            {
                "enter" or "return" => 0x0D,
                "tab" => 0x09,
                "escape" or "esc" => 0x1B,
                "backspace" => 0x08,
                "delete" or "del" => 0x2E,
                "insert" or "ins" => 0x2D,
                "home" => 0x24,
                "end" => 0x23,
                "pageup" or "pgup" => 0x21,
                "pagedown" or "pgdn" => 0x22,
                "up" or "arrowup" => 0x26,
                "down" or "arrowdown" => 0x28,
                "left" or "arrowleft" => 0x25,
                "right" or "arrowright" => 0x27,
                "space" => 0x20,
                "shift" => 0x10,
                "control" or "ctrl" => 0x11,
                "alt" => 0x12,
                "win" or "meta" or "command" => 0x5B,
                "capslock" => 0x14,
                "numlock" => 0x90,
                "scrolllock" => 0x91,
                "printscreen" => 0x2C,
                "pause" => 0x13,
                "f1" => 0x70,
                "f2" => 0x71,
                "f3" => 0x72,
                "f4" => 0x73,
                "f5" => 0x74,
                "f6" => 0x75,
                "f7" => 0x76,
                "f8" => 0x77,
                "f9" => 0x78,
                "f10" => 0x79,
                "f11" => 0x7A,
                "f12" => 0x7B,
                _ when key.Length == 1 => (ushort)VkKeyScan(key[0]),
                _ => 0
            };
        }

        // Additional Windows APIs for window management
        [DllImport("user32.dll")]
        private static extern bool EnumWindows(EnumWindowsProc lpEnumFunc, IntPtr lParam);

        [DllImport("user32.dll")]
        private static extern int GetWindowText(IntPtr hWnd, StringBuilder lpString, int nMaxCount);

        [DllImport("user32.dll")]
        private static extern bool IsWindowVisible(IntPtr hWnd);

        [DllImport("user32.dll")]
        private static extern bool SetForegroundWindow(IntPtr hWnd);

        [DllImport("user32.dll")]
        private static extern IntPtr FindWindow(string? lpClassName, string lpWindowName);

        [DllImport("user32.dll")]
        private static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);

        [DllImport("user32.dll")]
        private static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);

        private delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);

        [StructLayout(LayoutKind.Sequential)]
        private struct RECT
        {
            public int Left, Top, Right, Bottom;
        }

        private (byte[], string) HandleClipboardRead()
        {
            try
            {
                string text = "";

                // Clipboard operations must run on STA thread
                var thread = new Thread(() =>
                {
                    if (Clipboard.ContainsText())
                    {
                        text = Clipboard.GetText();
                    }
                });
                thread.SetApartmentState(ApartmentState.STA);
                thread.Start();
                thread.Join(1000);

                return (JsonResponse(new { success = true, text }), "application/json");
            }
            catch (Exception ex)
            {
                return (JsonResponse(new { success = false, error = ex.Message }), "application/json");
            }
        }

        private (byte[], string) HandleClipboardWrite(string body)
        {
            try
            {
                var options = JsonSerializer.Deserialize<JsonElement>(body);
                string text = options.TryGetProperty("text", out var tVal) ? tVal.GetString() ?? "" : "";

                // Clipboard operations must run on STA thread
                var thread = new Thread(() =>
                {
                    Clipboard.SetText(text);
                });
                thread.SetApartmentState(ApartmentState.STA);
                thread.Start();
                thread.Join(1000);

                return (JsonResponse(new { success = true }), "application/json");
            }
            catch (Exception ex)
            {
                return (JsonResponse(new { success = false, error = ex.Message }), "application/json");
            }
        }

        private (byte[], string) HandleGetWindowList()
        {
            try
            {
                var windows = new System.Collections.Generic.List<object>();

                EnumWindows((hWnd, lParam) =>
                {
                    if (!IsWindowVisible(hWnd)) return true;

                    var sb = new StringBuilder(256);
                    GetWindowText(hWnd, sb, 256);
                    string title = sb.ToString();

                    if (string.IsNullOrWhiteSpace(title)) return true;

                    GetWindowRect(hWnd, out RECT rect);
                    GetWindowThreadProcessId(hWnd, out uint pid);

                    windows.Add(new
                    {
                        handle = hWnd.ToInt64(),
                        title,
                        pid,
                        x = rect.Left,
                        y = rect.Top,
                        width = rect.Right - rect.Left,
                        height = rect.Bottom - rect.Top
                    });

                    return true;
                }, IntPtr.Zero);

                return (JsonResponse(new { success = true, windows }), "application/json");
            }
            catch (Exception ex)
            {
                return (JsonResponse(new { success = false, error = ex.Message }), "application/json");
            }
        }

        private (byte[], string) HandleFocusWindow(string body)
        {
            try
            {
                var options = JsonSerializer.Deserialize<JsonElement>(body);

                IntPtr hWnd = IntPtr.Zero;

                if (options.TryGetProperty("handle", out var handleVal))
                {
                    hWnd = new IntPtr(handleVal.GetInt64());
                }
                else if (options.TryGetProperty("title", out var titleVal))
                {
                    string title = titleVal.GetString() ?? "";
                    hWnd = FindWindow(null, title);
                }

                if (hWnd == IntPtr.Zero)
                {
                    return (JsonResponse(new { success = false, error = "Window not found" }), "application/json");
                }

                bool result = SetForegroundWindow(hWnd);
                return (JsonResponse(new { success = result }), "application/json");
            }
            catch (Exception ex)
            {
                return (JsonResponse(new { success = false, error = ex.Message }), "application/json");
            }
        }

        public void Dispose()
        {
            Stop();
        }
    }
}
