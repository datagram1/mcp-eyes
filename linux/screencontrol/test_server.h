/**
 * TestServer for ScreenControl Linux Agent
 *
 * HTTP server for automated testing, binds to localhost:3456 only.
 * Only enabled in DEBUG builds.
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

#pragma once

#include <string>
#include <functional>
#include <vector>
#include <thread>
#include <atomic>

namespace ScreenControl
{

class WebSocketClient;

class TestServer
{
public:
    // Callback to get field values
    using GetFieldCallback = std::function<std::string(const std::string&)>;
    // Callback to set field values
    using SetFieldCallback = std::function<bool(const std::string&, const std::string&)>;
    // Callback to get WebSocket client status
    using GetStatusCallback = std::function<std::pair<bool, std::string>()>; // (connected, status)
    // Callback for button clicks
    using ClickButtonCallback = std::function<bool(const std::string&)>;
    // Callback to get logs
    using GetLogsCallback = std::function<std::vector<std::string>(int)>;
    // Callback for quit/restart
    using QuitCallback = std::function<void()>;

    TestServer();
    ~TestServer();

    bool start(uint16_t port = 3456);
    void stop();
    bool isRunning() const { return m_running; }
    uint16_t getPort() const { return m_port; }

    // Set callbacks
    void setGetFieldCallback(GetFieldCallback cb) { m_getFieldCallback = cb; }
    void setSetFieldCallback(SetFieldCallback cb) { m_setFieldCallback = cb; }
    void setGetStatusCallback(GetStatusCallback cb) { m_getStatusCallback = cb; }
    void setClickButtonCallback(ClickButtonCallback cb) { m_clickButtonCallback = cb; }
    void setGetLogsCallback(GetLogsCallback cb) { m_getLogsCallback = cb; }
    void setQuitCallback(QuitCallback cb) { m_quitCallback = cb; }

private:
    void listenLoop();
    void handleClient(int clientSocket);
    std::string handleRequest(const std::string& httpRequest);
    std::string handleMethod(const std::string& method, const std::string& params);

    // Method handlers
    std::string handlePing();
    std::string handleGetState();
    std::string handleGetFields();
    std::string handleSetField(const std::string& params);
    std::string handleClickButton(const std::string& params);
    std::string handleGetLogs(const std::string& params);
    std::string handleGetVersion();
    std::string handleQuit();
    std::string handleRestart();

    int m_serverSocket = -1;
    std::atomic<bool> m_running{false};
    uint16_t m_port = 0;
    std::thread m_listenThread;

    GetFieldCallback m_getFieldCallback;
    SetFieldCallback m_setFieldCallback;
    GetStatusCallback m_getStatusCallback;
    ClickButtonCallback m_clickButtonCallback;
    GetLogsCallback m_getLogsCallback;
    QuitCallback m_quitCallback;

    static constexpr const char* VERSION = "1.0.0";
};

} // namespace ScreenControl
