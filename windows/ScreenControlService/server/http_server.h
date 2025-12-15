/**
 * HTTP Server
 *
 * cpp-httplib based HTTP server for tool endpoints.
 * Matches the API structure of macOS MCPEyes.app.
 */

#pragma once

#include <string>
#include <memory>
#include <thread>
#include <atomic>

// Forward declare httplib types
namespace httplib {
    class Server;
}

namespace ScreenControl
{

class HttpServer
{
public:
    HttpServer();
    ~HttpServer();

    // Start server on specified port
    bool start(int port = 3456);

    // Stop server
    void stop();

    // Check if running
    bool isRunning() const { return m_running; }

    // Get port
    int getPort() const { return m_port; }

private:
    // Setup routes
    void setupRoutes();

    // Route handlers - same API as macOS MCPEyes.app
    void handleScreenshot(const void* req, void* res);
    void handleClick(const void* req, void* res);
    void handleDoubleClick(const void* req, void* res);
    void handleRightClick(const void* req, void* res);
    void handlePressKey(const void* req, void* res);
    void handleTypeText(const void* req, void* res);
    void handleScroll(const void* req, void* res);
    void handleDrag(const void* req, void* res);
    void handleGetClickableElements(const void* req, void* res);
    void handleGetUIElements(const void* req, void* res);
    void handleGetWindowList(const void* req, void* res);
    void handleFocusWindow(const void* req, void* res);

    // Filesystem tools - same API as macOS
    void handleFsList(const void* req, void* res);
    void handleFsRead(const void* req, void* res);
    void handleFsReadRange(const void* req, void* res);
    void handleFsWrite(const void* req, void* res);
    void handleFsDelete(const void* req, void* res);
    void handleFsMove(const void* req, void* res);
    void handleFsSearch(const void* req, void* res);
    void handleFsGrep(const void* req, void* res);
    void handleFsPatch(const void* req, void* res);

    // Shell tools - same API as macOS
    void handleShellExec(const void* req, void* res);
    void handleShellStartSession(const void* req, void* res);
    void handleShellSendInput(const void* req, void* res);
    void handleShellStopSession(const void* req, void* res);

    // System tools - matching Linux agent
    void handleSystemInfo(const void* req, void* res);
    void handleClipboardRead(const void* req, void* res);
    void handleClipboardWrite(const void* req, void* res);
    void handleWait(const void* req, void* res);

    // Mouse tools - additional endpoints
    void handleMouseMove(const void* req, void* res);
    void handleMousePosition(const void* req, void* res);
    void handleMouseScroll(const void* req, void* res);
    void handleMouseDrag(const void* req, void* res);

    // Status endpoint for tray app
    void handleStatus(const void* req, void* res);

    // Browser bridge proxy
    void handleBrowserProxy(const void* req, void* res);

private:
    std::unique_ptr<httplib::Server> m_server;
    std::unique_ptr<std::thread> m_thread;
    std::atomic<bool> m_running{false};
    int m_port{3456};
};

} // namespace ScreenControl
