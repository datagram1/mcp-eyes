/**
 * Service Client
 *
 * HTTP client for communicating with the ScreenControl Service.
 * Matches the API endpoints used by macOS MCPEyes.app.
 */

using System;
using System.Net.Http;
using System.Text.Json;
using System.Threading.Tasks;

namespace ScreenControlTray
{
    public class ServiceStatus
    {
        public bool IsRunning { get; set; }
        public string Version { get; set; } = "Unknown";
        public string LicenseStatus { get; set; } = "Unknown";
        public bool IsLicensed { get; set; }
        public string MachineId { get; set; } = "";
        public DateTime? LicenseExpiry { get; set; }
    }

    public class ServiceSettings
    {
        public int Port { get; set; } = 3456;
        public string ControlServerUrl { get; set; } = "";
        public string LicenseKey { get; set; } = "";
        public bool AutoStart { get; set; } = true;
        public bool EnableLogging { get; set; } = true;
    }

    public class ServiceClient : IDisposable
    {
        private readonly HttpClient _httpClient;
        private readonly string _baseUrl;

        public ServiceClient(string baseUrl = "http://127.0.0.1:3456")
        {
            _baseUrl = baseUrl;
            _httpClient = new HttpClient
            {
                Timeout = TimeSpan.FromSeconds(5)
            };
        }

        public async Task<ServiceStatus> GetStatusAsync()
        {
            try
            {
                var response = await _httpClient.GetAsync($"{_baseUrl}/status");

                if (response.IsSuccessStatusCode)
                {
                    var json = await response.Content.ReadAsStringAsync();
                    var doc = JsonDocument.Parse(json);
                    var root = doc.RootElement;

                    return new ServiceStatus
                    {
                        IsRunning = true,
                        Version = GetStringProperty(root, "version", "1.0.0"),
                        LicenseStatus = GetStringProperty(root, "licenseStatus", "Unknown"),
                        IsLicensed = GetBoolProperty(root, "licensed", false),
                        MachineId = GetStringProperty(root, "machineId", ""),
                        LicenseExpiry = GetDateProperty(root, "licenseExpiry")
                    };
                }

                return new ServiceStatus { IsRunning = false };
            }
            catch
            {
                return new ServiceStatus { IsRunning = false };
            }
        }

        public async Task<ServiceSettings> GetSettingsAsync()
        {
            try
            {
                var response = await _httpClient.GetAsync($"{_baseUrl}/settings");

                if (response.IsSuccessStatusCode)
                {
                    var json = await response.Content.ReadAsStringAsync();
                    var doc = JsonDocument.Parse(json);
                    var root = doc.RootElement;

                    return new ServiceSettings
                    {
                        Port = GetIntProperty(root, "port", 3456),
                        ControlServerUrl = GetStringProperty(root, "controlServerUrl", ""),
                        LicenseKey = GetStringProperty(root, "licenseKey", ""),
                        AutoStart = GetBoolProperty(root, "autoStart", true),
                        EnableLogging = GetBoolProperty(root, "enableLogging", true)
                    };
                }

                return new ServiceSettings();
            }
            catch
            {
                return new ServiceSettings();
            }
        }

        public async Task<bool> SaveSettingsAsync(ServiceSettings settings)
        {
            try
            {
                var json = JsonSerializer.Serialize(settings);
                var content = new StringContent(json, System.Text.Encoding.UTF8, "application/json");

                var response = await _httpClient.PostAsync($"{_baseUrl}/settings", content);
                return response.IsSuccessStatusCode;
            }
            catch
            {
                return false;
            }
        }

        public async Task<(bool Success, string Message)> ActivateLicenseAsync(string licenseKey)
        {
            try
            {
                var payload = new { licenseKey };
                var json = JsonSerializer.Serialize(payload);
                var content = new StringContent(json, System.Text.Encoding.UTF8, "application/json");

                var response = await _httpClient.PostAsync($"{_baseUrl}/license/activate", content);
                var responseJson = await response.Content.ReadAsStringAsync();
                var doc = JsonDocument.Parse(responseJson);
                var root = doc.RootElement;

                return (
                    GetBoolProperty(root, "success", false),
                    GetStringProperty(root, "message", "Unknown error")
                );
            }
            catch (Exception ex)
            {
                return (false, ex.Message);
            }
        }

        public async Task<(bool Success, string Message)> DeactivateLicenseAsync()
        {
            try
            {
                var response = await _httpClient.PostAsync($"{_baseUrl}/license/deactivate", null);
                var responseJson = await response.Content.ReadAsStringAsync();
                var doc = JsonDocument.Parse(responseJson);
                var root = doc.RootElement;

                return (
                    GetBoolProperty(root, "success", false),
                    GetStringProperty(root, "message", "Unknown error")
                );
            }
            catch (Exception ex)
            {
                return (false, ex.Message);
            }
        }

        public async Task<string> GetMachineIdAsync()
        {
            try
            {
                var response = await _httpClient.GetAsync($"{_baseUrl}/fingerprint");

                if (response.IsSuccessStatusCode)
                {
                    var json = await response.Content.ReadAsStringAsync();
                    var doc = JsonDocument.Parse(json);
                    return GetStringProperty(doc.RootElement, "machineId", "");
                }

                return "";
            }
            catch
            {
                return "";
            }
        }

        // Helper methods for JSON parsing
        private static string GetStringProperty(JsonElement element, string name, string defaultValue)
        {
            if (element.TryGetProperty(name, out var prop) && prop.ValueKind == JsonValueKind.String)
            {
                return prop.GetString() ?? defaultValue;
            }
            return defaultValue;
        }

        private static int GetIntProperty(JsonElement element, string name, int defaultValue)
        {
            if (element.TryGetProperty(name, out var prop) && prop.ValueKind == JsonValueKind.Number)
            {
                return prop.GetInt32();
            }
            return defaultValue;
        }

        private static bool GetBoolProperty(JsonElement element, string name, bool defaultValue)
        {
            if (element.TryGetProperty(name, out var prop))
            {
                if (prop.ValueKind == JsonValueKind.True) return true;
                if (prop.ValueKind == JsonValueKind.False) return false;
            }
            return defaultValue;
        }

        private static DateTime? GetDateProperty(JsonElement element, string name)
        {
            if (element.TryGetProperty(name, out var prop) && prop.ValueKind == JsonValueKind.String)
            {
                var str = prop.GetString();
                if (!string.IsNullOrEmpty(str) && DateTime.TryParse(str, out var date))
                {
                    return date;
                }
            }
            return null;
        }

        public void Dispose()
        {
            _httpClient?.Dispose();
        }
    }
}
