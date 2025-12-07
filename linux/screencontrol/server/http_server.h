/**
 * HTTP Server
 *
 * REST API server for Linux agent - matches macOS/Windows API.
 */

#pragma once

#include <string>
#include <atomic>
#include <memory>

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

private:
    void setupRoutes();

    int m_port;
    std::atomic<bool> m_running{false};
    std::unique_ptr<httplib::Server> m_server;
};

} // namespace ScreenControl
