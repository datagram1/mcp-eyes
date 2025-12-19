/**
 * HTTP Server
 *
 * Cross-platform REST API server for ScreenControl Service.
 * Provides endpoints for GUI operations, filesystem, shell, and system tools.
 */

#pragma once

#include "platform.h"
#include <string>
#include <atomic>
#include <memory>
#include <functional>

// Forward declaration
namespace httplib { class Server; }

namespace ScreenControl
{

class HttpServer
{
public:
    explicit HttpServer(int port);
    ~HttpServer();

    void start();
    void stop();
    bool isRunning() const { return m_running; }

    // Set callback for GUI tool proxy (service routes GUI tools to app)
    using GuiProxyCallback = std::function<std::string(const std::string& endpoint, const std::string& body)>;
    void setGuiProxyCallback(GuiProxyCallback callback);

    // Get port
    int getPort() const { return m_port; }

private:
    void setupRoutes();
    void setupHealthRoutes();
    void setupSettingsRoutes();
    void setupGuiRoutes();
    void setupFilesystemRoutes();
    void setupShellRoutes();
    void setupSystemRoutes();
    void setupUnlockRoutes();
    void setupCredentialProviderRoutes();
    void setupControlServerRoutes();
    void setupToolRoute();

    // Proxy GUI requests to tray app if callback is set
    std::string proxyGuiRequest(const std::string& endpoint, const std::string& body);

    int m_port;
    std::atomic<bool> m_running{false};
    std::unique_ptr<httplib::Server> m_server;
    GuiProxyCallback m_guiProxyCallback;
};

} // namespace ScreenControl
