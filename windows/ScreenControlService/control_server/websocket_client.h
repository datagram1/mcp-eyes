/**
 * WebSocket Client for ScreenControl Windows Service
 *
 * Connects to the control server for agent registration,
 * heartbeat, and command handling.
 */

#pragma once

#include <string>
#include <functional>
#include <thread>
#include <atomic>
#include <mutex>
#include <memory>
#include <winsock2.h>
#include <ws2tcpip.h>

// MSVC-specific pragma (ignored by MinGW which uses CMake link flags)
#ifdef _MSC_VER
#pragma comment(lib, "ws2_32.lib")
#endif

namespace ScreenControl
{

struct DebugConfig
{
    std::string serverUrl = "wss://screencontrol.knws.co.uk/ws";
    std::string endpointUuid;
    std::string customerId;
    bool connectOnStartup = false;

    bool load(const std::string& path);
    bool save(const std::string& path) const;
};

class WebSocketClient
{
public:
    using LogCallback = std::function<void(const std::string&)>;
    using ConnectionCallback = std::function<void(bool)>;
    using StatusCallback = std::function<void(const std::string&, const std::string&)>; // agentId, licenseStatus
    using CommandCallback = std::function<void(const std::string&, const std::string&, const std::string&)>; // requestId, method, params

    WebSocketClient();
    ~WebSocketClient();

    // Connection management
    bool connect(const DebugConfig& config);
    void disconnect();
    bool isConnected() const { return m_connected; }

    // Getters
    std::string getAgentId() const { return m_agentId; }
    std::string getLicenseStatus() const { return m_licenseStatus; }

    // Event callbacks
    void setLogCallback(LogCallback cb) { m_logCallback = cb; }
    void setConnectionCallback(ConnectionCallback cb) { m_connectionCallback = cb; }
    void setStatusCallback(StatusCallback cb) { m_statusCallback = cb; }
    void setCommandCallback(CommandCallback cb) { m_commandCallback = cb; }

    // Send response to command
    void sendResponse(const std::string& requestId, const std::string& result);

private:
    void log(const std::string& message);
    void receiveLoop();
    void sendRegistration(const DebugConfig& config);
    void sendHeartbeat();
    void startHeartbeat(int intervalMs);
    void stopHeartbeat();
    void handleMessage(const std::string& message);
    void handleRegistered(const std::string& json);
    void handleHeartbeatAck(const std::string& json);
    void handleRequest(const std::string& json);
    bool sendWebSocketFrame(const std::string& payload);

    // System info helpers (Windows-specific)
    std::string getMachineId();
    std::string getCpuModel();
    std::string getHostname();
    std::string getOsVersion();
    bool isScreenLocked();

    // SSL/TLS helpers
    bool sslConnect(const std::string& host, int port);
    int sslRead(char* buffer, int length);
    int sslWrite(const char* data, int length);
    void sslDisconnect();

    // Socket
    SOCKET m_socket = INVALID_SOCKET;
    void* m_sslContext = nullptr;  // CredHandle*
    void* m_sslHandle = nullptr;   // SecHandle* (context handle)

    std::atomic<bool> m_connected{false};
    std::atomic<bool> m_running{false};
    std::thread m_receiveThread;
    std::thread m_heartbeatThread;
    std::mutex m_sendMutex;
    std::atomic<bool> m_stopHeartbeat{false};

    std::string m_agentId;
    std::string m_licenseStatus;
    int m_heartbeatInterval = 5000;
    bool m_useSSL = false;

    LogCallback m_logCallback;
    ConnectionCallback m_connectionCallback;
    StatusCallback m_statusCallback;
    CommandCallback m_commandCallback;
};

} // namespace ScreenControl
