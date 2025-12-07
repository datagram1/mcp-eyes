/**
 * TestServer for ScreenControl Windows Agent
 *
 * HTTP server for automated testing, binds to localhost:3456 only.
 * Only available in DEBUG builds.
 *
 * Supports JSON-RPC style commands:
 *   - ping: Health check
 *   - getState: Get connection status
 *   - getFields: Get all field values
 *   - setField: Set a specific field value
 *   - clickButton: Trigger a button action
 *   - getLogs: Get recent log entries
 *   - getVersion: Get app version info
 *   - restart: Quit and relaunch
 *   - quit: Graceful shutdown
 */

using System;
using System.IO;
using System.Net;
using System.Text;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using System.Reflection;

namespace ScreenControlTray
{
    public class TestServer : IDisposable
    {
        private HttpListener? _listener;
        private CancellationTokenSource? _cts;
        private readonly SettingsForm _settingsForm;
        private bool _isRunning;
        private ushort _port;
        private readonly DateTime _startTime;

        public bool IsRunning => _isRunning;
        public ushort Port => _port;

        public TestServer(SettingsForm settingsForm)
        {
            _settingsForm = settingsForm;
            _startTime = DateTime.Now;
        }

        public bool Start(ushort port = 3456)
        {
            if (_isRunning) return true;

            // Try primary port, then fallback
            ushort[] ports = { port, (ushort)(port + 1) };

            foreach (var p in ports)
            {
                if (TryBind(p))
                {
                    _port = p;
                    _isRunning = true;
                    Console.WriteLine($"[TestServer] Started on localhost:{_port} (DEBUG BUILD ONLY)");
                    return true;
                }
            }

            Console.WriteLine("[TestServer] Failed to bind to any port");
            return false;
        }

        private bool TryBind(ushort port)
        {
            try
            {
                _listener = new HttpListener();
                _listener.Prefixes.Add($"http://127.0.0.1:{port}/");
                _listener.Start();

                _cts = new CancellationTokenSource();
                _ = ListenLoopAsync();

                return true;
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[TestServer] Failed to bind to port {port}: {ex.Message}");
                _listener?.Close();
                _listener = null;
                return false;
            }
        }

        public void Stop()
        {
            if (!_isRunning) return;

            Console.WriteLine("[TestServer] Stopping...");

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
                    // Listener was stopped
                    break;
                }
                catch (ObjectDisposedException)
                {
                    // Listener was disposed
                    break;
                }
                catch (Exception ex)
                {
                    Console.WriteLine($"[TestServer] Error: {ex.Message}");
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

            string responseJson;

            try
            {
                // Handle OPTIONS (CORS preflight)
                if (request.HttpMethod == "OPTIONS")
                {
                    response.StatusCode = 200;
                    responseJson = "{}";
                }
                // Handle GET /ping
                else if (request.HttpMethod == "GET" && request.Url?.AbsolutePath == "/ping")
                {
                    responseJson = HandleMethod("ping", null);
                }
                // Handle POST with JSON body
                else if (request.HttpMethod == "POST")
                {
                    using var reader = new StreamReader(request.InputStream, Encoding.UTF8);
                    var body = await reader.ReadToEndAsync();

                    if (string.IsNullOrEmpty(body))
                    {
                        responseJson = JsonSerializer.Serialize(new { error = "Empty body" });
                    }
                    else
                    {
                        using var doc = JsonDocument.Parse(body);
                        var root = doc.RootElement;

                        if (!root.TryGetProperty("method", out var methodProp))
                        {
                            responseJson = JsonSerializer.Serialize(new { error = "Missing method" });
                        }
                        else
                        {
                            var method = methodProp.GetString() ?? "";
                            JsonElement? paramsElement = root.TryGetProperty("params", out var p) ? p : null;
                            responseJson = HandleMethod(method, paramsElement);
                        }
                    }
                }
                else
                {
                    responseJson = JsonSerializer.Serialize(new { error = "Invalid request" });
                }
            }
            catch (Exception ex)
            {
                responseJson = JsonSerializer.Serialize(new { error = ex.Message });
            }

            // Send response
            response.ContentType = "application/json";
            var buffer = Encoding.UTF8.GetBytes(responseJson);
            response.ContentLength64 = buffer.Length;
            await response.OutputStream.WriteAsync(buffer);
            response.Close();
        }

        private string HandleMethod(string method, JsonElement? parameters)
        {
            object result = method switch
            {
                "ping" => HandlePing(),
                "getState" => HandleGetState(),
                "getFields" => HandleGetFields(),
                "setField" => HandleSetField(parameters),
                "clickButton" => HandleClickButton(parameters),
                "getLogs" => HandleGetLogs(parameters),
                "getVersion" => HandleGetVersion(),
                "quit" => HandleQuit(),
                "restart" => HandleRestart(),
                _ => new { error = $"Unknown method: {method}" }
            };

            return JsonSerializer.Serialize(result);
        }

        #region Method Handlers

        private object HandlePing()
        {
            var version = Assembly.GetExecutingAssembly().GetName().Version?.ToString() ?? "1.0.0";
            return new
            {
                pong = true,
                version,
                debug = true,
                port = _port
            };
        }

        private object HandleGetState()
        {
            // Need to invoke on UI thread to access form controls
            object? state = null;

            _settingsForm.Invoke(new Action(() =>
            {
                state = new
                {
                    connected = false, // Would get from WebSocketClient if available
                    serverUrl = GetFieldValue("serverUrl"),
                    endpointUuid = GetFieldValue("endpointUuid"),
                    customerId = GetFieldValue("customerId"),
                    connectionStatus = "Unknown"
                };
            }));

            return state ?? new { error = "Failed to get state" };
        }

        private object HandleGetFields()
        {
            object? fields = null;

            _settingsForm.Invoke(new Action(() =>
            {
                fields = new
                {
                    serverUrl = GetFieldValue("serverUrl"),
                    endpointUuid = GetFieldValue("endpointUuid"),
                    customerId = GetFieldValue("customerId"),
                    connectOnStartup = GetCheckboxValue("connectOnStartup")
                };
            }));

            return fields ?? new { error = "Failed to get fields" };
        }

        private object HandleSetField(JsonElement? parameters)
        {
            if (parameters == null)
                return new { error = "Missing params" };

            var field = parameters.Value.TryGetProperty("field", out var f) ? f.GetString() : null;
            var value = parameters.Value.TryGetProperty("value", out var v) ? v.GetString() : null;

            if (string.IsNullOrEmpty(field) || value == null)
                return new { error = "Missing field or value" };

            bool success = false;

            _settingsForm.Invoke(new Action(() =>
            {
                success = SetFieldValue(field, value);
            }));

            if (success)
                return new { success = true, field, value };
            else
                return new { error = $"Unknown field: {field}" };
        }

        private object HandleClickButton(JsonElement? parameters)
        {
            if (parameters == null)
                return new { error = "Missing params" };

            var button = parameters.Value.TryGetProperty("button", out var b) ? b.GetString() : null;

            if (string.IsNullOrEmpty(button))
                return new { error = "Missing button parameter" };

            bool success = false;
            string action = "";

            _settingsForm.Invoke(new Action(() =>
            {
                (success, action) = ClickButton(button);
            }));

            if (success)
                return new { success = true, action };
            else
                return new { error = $"Unknown or disabled button: {button}" };
        }

        private object HandleGetLogs(JsonElement? parameters)
        {
            var limit = 50;
            if (parameters?.TryGetProperty("limit", out var l) == true)
            {
                limit = l.GetInt32();
            }

            string[] logs = Array.Empty<string>();

            _settingsForm.Invoke(new Action(() =>
            {
                logs = GetLogs(limit);
            }));

            return new
            {
                logs,
                total = logs.Length,
                returned = logs.Length
            };
        }

        private object HandleGetVersion()
        {
            var assembly = Assembly.GetExecutingAssembly();
            var version = assembly.GetName().Version?.ToString() ?? "1.0.0";
            var buildDate = File.GetLastWriteTime(assembly.Location).ToString("yyyy-MM-dd");
            var uptime = (int)(DateTime.Now - _startTime).TotalSeconds;

            return new
            {
                version,
                build = assembly.GetName().Version?.Build.ToString() ?? "1",
                buildDate,
                gitCommit = "unknown",
                platform = "windows",
                arch = Environment.Is64BitOperatingSystem ? "x64" : "x86",
                uptime
            };
        }

        private object HandleQuit()
        {
            Console.WriteLine("[TestServer] Quit requested via test server");

            _settingsForm.Invoke(new Action(() =>
            {
                System.Windows.Forms.Application.Exit();
            }));

            return new { success = true, action = "quit" };
        }

        private object HandleRestart()
        {
            Console.WriteLine("[TestServer] Restart requested via test server");

            var appPath = Assembly.GetExecutingAssembly().Location;
            // For .NET Core/5+, the main executable is different
            if (appPath.EndsWith(".dll"))
            {
                appPath = appPath.Replace(".dll", ".exe");
            }

            _settingsForm.Invoke(new Action(() =>
            {
                // Launch new instance after a short delay
                System.Diagnostics.Process.Start(new System.Diagnostics.ProcessStartInfo
                {
                    FileName = appPath,
                    UseShellExecute = true
                });

                // Exit current instance
                System.Windows.Forms.Application.Exit();
            }));

            return new { success = true, action = "restart" };
        }

        #endregion

        #region UI Access Helpers (called on UI thread)

        private string GetFieldValue(string field)
        {
            // Access private fields via reflection
            var type = _settingsForm.GetType();

            var fieldName = field switch
            {
                "serverUrl" => "_debugServerUrlTextBox",
                "endpointUuid" => "_debugEndpointUuidTextBox",
                "customerId" => "_debugCustomerIdTextBox",
                _ => null
            };

            if (fieldName == null) return "";

            var fieldInfo = type.GetField(fieldName, BindingFlags.NonPublic | BindingFlags.Instance);
            if (fieldInfo?.GetValue(_settingsForm) is System.Windows.Forms.TextBox textBox)
            {
                return textBox.Text ?? "";
            }

            return "";
        }

        private bool GetCheckboxValue(string field)
        {
            var type = _settingsForm.GetType();

            var fieldName = field switch
            {
                "connectOnStartup" => "_debugConnectOnStartupCheckBox",
                _ => null
            };

            if (fieldName == null) return false;

            var fieldInfo = type.GetField(fieldName, BindingFlags.NonPublic | BindingFlags.Instance);
            if (fieldInfo?.GetValue(_settingsForm) is System.Windows.Forms.CheckBox checkbox)
            {
                return checkbox.Checked;
            }

            return false;
        }

        private bool SetFieldValue(string field, string value)
        {
            var type = _settingsForm.GetType();

            var fieldName = field switch
            {
                "serverUrl" => "_debugServerUrlTextBox",
                "endpointUuid" => "_debugEndpointUuidTextBox",
                "customerId" => "_debugCustomerIdTextBox",
                _ => null
            };

            if (fieldName == null)
            {
                // Check for checkbox fields
                if (field == "connectOnStartup")
                {
                    var cbField = type.GetField("_debugConnectOnStartupCheckBox", BindingFlags.NonPublic | BindingFlags.Instance);
                    if (cbField?.GetValue(_settingsForm) is System.Windows.Forms.CheckBox checkbox)
                    {
                        checkbox.Checked = bool.Parse(value);
                        return true;
                    }
                }
                return false;
            }

            var fieldInfo = type.GetField(fieldName, BindingFlags.NonPublic | BindingFlags.Instance);
            if (fieldInfo?.GetValue(_settingsForm) is System.Windows.Forms.TextBox textBox)
            {
                textBox.Text = value;
                return true;
            }

            return false;
        }

        private (bool success, string action) ClickButton(string button)
        {
            var type = _settingsForm.GetType();

            var buttonName = button switch
            {
                "connect" => "_debugConnectButton",
                "disconnect" => "_debugDisconnectButton",
                "saveSettings" => "_debugSaveSettingsButton",
                _ => null
            };

            if (buttonName == null)
                return (false, "");

            var fieldInfo = type.GetField(buttonName, BindingFlags.NonPublic | BindingFlags.Instance);
            if (fieldInfo?.GetValue(_settingsForm) is System.Windows.Forms.Button btn && btn.Enabled)
            {
                btn.PerformClick();
                return (true, button);
            }

            return (false, "");
        }

        private string[] GetLogs(int limit)
        {
            var type = _settingsForm.GetType();
            var fieldInfo = type.GetField("_debugLogTextBox", BindingFlags.NonPublic | BindingFlags.Instance);

            if (fieldInfo?.GetValue(_settingsForm) is System.Windows.Forms.TextBox logBox)
            {
                var lines = logBox.Text.Split(new[] { Environment.NewLine, "\n" }, StringSplitOptions.RemoveEmptyEntries);
                var start = Math.Max(0, lines.Length - limit);
                return lines[start..];
            }

            return Array.Empty<string>();
        }

        #endregion

        public void Dispose()
        {
            Stop();
        }
    }
}
