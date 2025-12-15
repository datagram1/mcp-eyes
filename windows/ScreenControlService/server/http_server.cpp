/**
 * HTTP Server
 *
 * cpp-httplib based HTTP server for tool endpoints.
 * Matches the API structure of macOS MCPEyes.app.
 */

#include "http_server.h"
#include "../libs/httplib.h"
#include "../libs/json.hpp"
#include "../core/logger.h"
#include "../tools/gui_tools.h"
#include "../tools/ui_automation.h"
#include "../tools/filesystem_tools.h"
#include "../tools/shell_tools.h"
#include "../tools/system_tools.h"

using json = nlohmann::json;

namespace ScreenControl
{

// GUI Bridge port - tray app handles GUI operations in user session
static const int GUI_BRIDGE_PORT = 3457;

// Helper function to proxy requests to GUI bridge
static bool proxyToGuiBridge(const std::string& endpoint, const std::string& body,
                              httplib::Response& res, bool isPost = true)
{
    httplib::Client client("127.0.0.1", GUI_BRIDGE_PORT);
    client.set_connection_timeout(5);
    client.set_read_timeout(30);

    httplib::Result proxyRes;
    if (isPost)
    {
        proxyRes = client.Post(endpoint, body, "application/json");
    }
    else
    {
        proxyRes = client.Get(endpoint);
    }

    if (proxyRes)
    {
        res.status = proxyRes->status;
        std::string contentType = proxyRes->get_header_value("Content-Type");
        if (contentType.empty())
        {
            contentType = "application/json";
        }
        res.set_content(proxyRes->body, contentType);
        return true;
    }
    else
    {
        json error = {
            {"success", false},
            {"error", "GUI bridge not available. Make sure ScreenControlTray is running."}
        };
        res.status = 502;
        res.set_content(error.dump(), "application/json");
        return false;
    }
}

HttpServer::HttpServer()
    : m_server(std::make_unique<httplib::Server>())
{
}

HttpServer::~HttpServer()
{
    stop();
}

bool HttpServer::start(int port)
{
    if (m_running)
    {
        return true;
    }

    m_port = port;
    setupRoutes();

    // Start server in background thread
    m_thread = std::make_unique<std::thread>([this]() {
        m_running = true;
        m_server->listen("0.0.0.0", m_port);
        m_running = false;
    });

    // Wait a bit for server to start
    std::this_thread::sleep_for(std::chrono::milliseconds(100));

    return m_running;
}

void HttpServer::stop()
{
    if (m_server)
    {
        m_server->stop();
    }

    if (m_thread && m_thread->joinable())
    {
        m_thread->join();
    }

    m_running = false;
}

void HttpServer::setupRoutes()
{
    // GUI Tools - same endpoints as macOS MCPEyes.app
    m_server->Post("/screenshot", [this](const httplib::Request& req, httplib::Response& res) {
        handleScreenshot(&req, &res);
    });

    m_server->Post("/click", [this](const httplib::Request& req, httplib::Response& res) {
        handleClick(&req, &res);
    });

    m_server->Post("/doubleClick", [this](const httplib::Request& req, httplib::Response& res) {
        handleDoubleClick(&req, &res);
    });

    m_server->Post("/rightClick", [this](const httplib::Request& req, httplib::Response& res) {
        handleRightClick(&req, &res);
    });

    m_server->Post("/pressKey", [this](const httplib::Request& req, httplib::Response& res) {
        handlePressKey(&req, &res);
    });

    m_server->Post("/typeText", [this](const httplib::Request& req, httplib::Response& res) {
        handleTypeText(&req, &res);
    });

    m_server->Post("/scroll", [this](const httplib::Request& req, httplib::Response& res) {
        handleScroll(&req, &res);
    });

    m_server->Post("/drag", [this](const httplib::Request& req, httplib::Response& res) {
        handleDrag(&req, &res);
    });

    // UI Automation
    m_server->Post("/getClickableElements", [this](const httplib::Request& req, httplib::Response& res) {
        handleGetClickableElements(&req, &res);
    });

    m_server->Post("/getUIElements", [this](const httplib::Request& req, httplib::Response& res) {
        handleGetUIElements(&req, &res);
    });

    m_server->Post("/getWindowList", [this](const httplib::Request& req, httplib::Response& res) {
        handleGetWindowList(&req, &res);
    });

    m_server->Post("/focusWindow", [this](const httplib::Request& req, httplib::Response& res) {
        handleFocusWindow(&req, &res);
    });

    // Filesystem Tools - same /fs/* endpoints as macOS
    m_server->Post("/fs/list", [this](const httplib::Request& req, httplib::Response& res) {
        handleFsList(&req, &res);
    });

    m_server->Post("/fs/read", [this](const httplib::Request& req, httplib::Response& res) {
        handleFsRead(&req, &res);
    });

    m_server->Post("/fs/read_range", [this](const httplib::Request& req, httplib::Response& res) {
        handleFsReadRange(&req, &res);
    });

    m_server->Post("/fs/write", [this](const httplib::Request& req, httplib::Response& res) {
        handleFsWrite(&req, &res);
    });

    m_server->Post("/fs/delete", [this](const httplib::Request& req, httplib::Response& res) {
        handleFsDelete(&req, &res);
    });

    m_server->Post("/fs/move", [this](const httplib::Request& req, httplib::Response& res) {
        handleFsMove(&req, &res);
    });

    m_server->Post("/fs/search", [this](const httplib::Request& req, httplib::Response& res) {
        handleFsSearch(&req, &res);
    });

    m_server->Post("/fs/grep", [this](const httplib::Request& req, httplib::Response& res) {
        handleFsGrep(&req, &res);
    });

    m_server->Post("/fs/patch", [this](const httplib::Request& req, httplib::Response& res) {
        handleFsPatch(&req, &res);
    });

    // Shell Tools - same /shell/* endpoints as macOS
    m_server->Post("/shell/exec", [this](const httplib::Request& req, httplib::Response& res) {
        handleShellExec(&req, &res);
    });

    m_server->Post("/shell/start_session", [this](const httplib::Request& req, httplib::Response& res) {
        handleShellStartSession(&req, &res);
    });

    m_server->Post("/shell/send_input", [this](const httplib::Request& req, httplib::Response& res) {
        handleShellSendInput(&req, &res);
    });

    m_server->Post("/shell/stop_session", [this](const httplib::Request& req, httplib::Response& res) {
        handleShellStopSession(&req, &res);
    });

    // Status endpoint for tray app
    m_server->Get("/status", [this](const httplib::Request& req, httplib::Response& res) {
        handleStatus(&req, &res);
    });

    // Health check
    m_server->Get("/health", [](const httplib::Request& req, httplib::Response& res) {
        json response = {
            {"status", "ok"},
            {"service", "ScreenControlService"},
            {"version", "1.0.0"}
        };
        res.set_content(response.dump(), "application/json");
    });

    // Browser proxy - forward /browser/* to port 3457
    m_server->Post(R"(/browser/(.*))", [this](const httplib::Request& req, httplib::Response& res) {
        handleBrowserProxy(&req, &res);
    });

    // System tools - matching Linux agent
    m_server->Get("/system/info", [this](const httplib::Request& req, httplib::Response& res) {
        handleSystemInfo(&req, &res);
    });

    m_server->Get("/clipboard/read", [this](const httplib::Request& req, httplib::Response& res) {
        handleClipboardRead(&req, &res);
    });

    m_server->Post("/clipboard/write", [this](const httplib::Request& req, httplib::Response& res) {
        handleClipboardWrite(&req, &res);
    });

    m_server->Post("/wait", [this](const httplib::Request& req, httplib::Response& res) {
        handleWait(&req, &res);
    });

    // Mouse tools - additional endpoints matching Linux
    m_server->Post("/mouse/move", [this](const httplib::Request& req, httplib::Response& res) {
        handleMouseMove(&req, &res);
    });

    m_server->Get("/mouse/position", [this](const httplib::Request& req, httplib::Response& res) {
        handleMousePosition(&req, &res);
    });

    m_server->Post("/mouse/scroll", [this](const httplib::Request& req, httplib::Response& res) {
        handleMouseScroll(&req, &res);
    });

    m_server->Post("/mouse/drag", [this](const httplib::Request& req, httplib::Response& res) {
        handleMouseDrag(&req, &res);
    });

    Logger::getInstance().info(L"HTTP routes configured");
}

// GUI Tool handlers - proxied to GUI Bridge in tray app (user session)
void HttpServer::handleScreenshot(const void* reqPtr, void* resPtr)
{
    auto& req = *static_cast<const httplib::Request*>(reqPtr);
    auto& res = *static_cast<httplib::Response*>(resPtr);

    // Proxy to GUI bridge in tray app
    proxyToGuiBridge("/screenshot", req.body, res);
}

void HttpServer::handleClick(const void* reqPtr, void* resPtr)
{
    auto& req = *static_cast<const httplib::Request*>(reqPtr);
    auto& res = *static_cast<httplib::Response*>(resPtr);

    proxyToGuiBridge("/click", req.body, res);
}

void HttpServer::handleDoubleClick(const void* reqPtr, void* resPtr)
{
    auto& req = *static_cast<const httplib::Request*>(reqPtr);
    auto& res = *static_cast<httplib::Response*>(resPtr);

    proxyToGuiBridge("/doubleClick", req.body, res);
}

void HttpServer::handleRightClick(const void* reqPtr, void* resPtr)
{
    auto& req = *static_cast<const httplib::Request*>(reqPtr);
    auto& res = *static_cast<httplib::Response*>(resPtr);

    proxyToGuiBridge("/rightClick", req.body, res);
}

void HttpServer::handlePressKey(const void* reqPtr, void* resPtr)
{
    auto& req = *static_cast<const httplib::Request*>(reqPtr);
    auto& res = *static_cast<httplib::Response*>(resPtr);

    proxyToGuiBridge("/pressKey", req.body, res);
}

void HttpServer::handleTypeText(const void* reqPtr, void* resPtr)
{
    auto& req = *static_cast<const httplib::Request*>(reqPtr);
    auto& res = *static_cast<httplib::Response*>(resPtr);

    proxyToGuiBridge("/typeText", req.body, res);
}

void HttpServer::handleScroll(const void* reqPtr, void* resPtr)
{
    auto& req = *static_cast<const httplib::Request*>(reqPtr);
    auto& res = *static_cast<httplib::Response*>(resPtr);

    proxyToGuiBridge("/scroll", req.body, res);
}

void HttpServer::handleDrag(const void* reqPtr, void* resPtr)
{
    auto& req = *static_cast<const httplib::Request*>(reqPtr);
    auto& res = *static_cast<httplib::Response*>(resPtr);

    proxyToGuiBridge("/drag", req.body, res);
}

// UI Automation handlers
void HttpServer::handleGetClickableElements(const void* reqPtr, void* resPtr)
{
    auto& res = *static_cast<httplib::Response*>(resPtr);

    try
    {
        auto result = UIAutomation::getClickableElements();
        res.set_content(result.dump(), "application/json");
    }
    catch (const std::exception& e)
    {
        json error = {{"success", false}, {"error", e.what()}};
        res.status = 500;
        res.set_content(error.dump(), "application/json");
    }
}

void HttpServer::handleGetUIElements(const void* reqPtr, void* resPtr)
{
    auto& res = *static_cast<httplib::Response*>(resPtr);

    try
    {
        auto result = UIAutomation::getUIElements();
        res.set_content(result.dump(), "application/json");
    }
    catch (const std::exception& e)
    {
        json error = {{"success", false}, {"error", e.what()}};
        res.status = 500;
        res.set_content(error.dump(), "application/json");
    }
}

void HttpServer::handleGetWindowList(const void* reqPtr, void* resPtr)
{
    auto& req = *static_cast<const httplib::Request*>(reqPtr);
    auto& res = *static_cast<httplib::Response*>(resPtr);

    proxyToGuiBridge("/getWindowList", req.body, res);
}

void HttpServer::handleFocusWindow(const void* reqPtr, void* resPtr)
{
    auto& req = *static_cast<const httplib::Request*>(reqPtr);
    auto& res = *static_cast<httplib::Response*>(resPtr);

    proxyToGuiBridge("/focusWindow", req.body, res);
}

// Filesystem handlers
void HttpServer::handleFsList(const void* reqPtr, void* resPtr)
{
    auto& req = *static_cast<const httplib::Request*>(reqPtr);
    auto& res = *static_cast<httplib::Response*>(resPtr);

    try
    {
        auto params = json::parse(req.body);
        std::string path = params.value("path", ".");
        bool recursive = params.value("recursive", false);
        int maxDepth = params.value("max_depth", 1);

        auto result = FilesystemTools::list(path, recursive, maxDepth);
        res.set_content(result.dump(), "application/json");
    }
    catch (const std::exception& e)
    {
        json error = {{"success", false}, {"error", e.what()}};
        res.status = 500;
        res.set_content(error.dump(), "application/json");
    }
}

void HttpServer::handleFsRead(const void* reqPtr, void* resPtr)
{
    auto& req = *static_cast<const httplib::Request*>(reqPtr);
    auto& res = *static_cast<httplib::Response*>(resPtr);

    try
    {
        auto params = json::parse(req.body);
        std::string path = params.value("path", "");
        size_t maxBytes = params.value("max_bytes", 1048576);  // 1MB default

        auto result = FilesystemTools::read(path, maxBytes);
        res.set_content(result.dump(), "application/json");
    }
    catch (const std::exception& e)
    {
        json error = {{"success", false}, {"error", e.what()}};
        res.status = 500;
        res.set_content(error.dump(), "application/json");
    }
}

void HttpServer::handleFsReadRange(const void* reqPtr, void* resPtr)
{
    auto& req = *static_cast<const httplib::Request*>(reqPtr);
    auto& res = *static_cast<httplib::Response*>(resPtr);

    try
    {
        auto params = json::parse(req.body);
        std::string path = params.value("path", "");
        int startLine = params.value("start_line", 1);
        int endLine = params.value("end_line", -1);

        auto result = FilesystemTools::readRange(path, startLine, endLine);
        res.set_content(result.dump(), "application/json");
    }
    catch (const std::exception& e)
    {
        json error = {{"success", false}, {"error", e.what()}};
        res.status = 500;
        res.set_content(error.dump(), "application/json");
    }
}

void HttpServer::handleFsWrite(const void* reqPtr, void* resPtr)
{
    auto& req = *static_cast<const httplib::Request*>(reqPtr);
    auto& res = *static_cast<httplib::Response*>(resPtr);

    try
    {
        auto params = json::parse(req.body);
        std::string path = params.value("path", "");
        std::string content = params.value("content", "");
        std::string mode = params.value("mode", "overwrite");
        bool createDirs = params.value("create_dirs", true);

        auto result = FilesystemTools::write(path, content, mode, createDirs);
        res.set_content(result.dump(), "application/json");
    }
    catch (const std::exception& e)
    {
        json error = {{"success", false}, {"error", e.what()}};
        res.status = 500;
        res.set_content(error.dump(), "application/json");
    }
}

void HttpServer::handleFsDelete(const void* reqPtr, void* resPtr)
{
    auto& req = *static_cast<const httplib::Request*>(reqPtr);
    auto& res = *static_cast<httplib::Response*>(resPtr);

    try
    {
        auto params = json::parse(req.body);
        std::string path = params.value("path", "");
        bool recursive = params.value("recursive", false);

        auto result = FilesystemTools::remove(path, recursive);
        res.set_content(result.dump(), "application/json");
    }
    catch (const std::exception& e)
    {
        json error = {{"success", false}, {"error", e.what()}};
        res.status = 500;
        res.set_content(error.dump(), "application/json");
    }
}

void HttpServer::handleFsMove(const void* reqPtr, void* resPtr)
{
    auto& req = *static_cast<const httplib::Request*>(reqPtr);
    auto& res = *static_cast<httplib::Response*>(resPtr);

    try
    {
        auto params = json::parse(req.body);
        std::string source = params.value("source", "");
        std::string destination = params.value("destination", "");

        auto result = FilesystemTools::move(source, destination);
        res.set_content(result.dump(), "application/json");
    }
    catch (const std::exception& e)
    {
        json error = {{"success", false}, {"error", e.what()}};
        res.status = 500;
        res.set_content(error.dump(), "application/json");
    }
}

void HttpServer::handleFsSearch(const void* reqPtr, void* resPtr)
{
    auto& req = *static_cast<const httplib::Request*>(reqPtr);
    auto& res = *static_cast<httplib::Response*>(resPtr);

    try
    {
        auto params = json::parse(req.body);
        std::string basePath = params.value("base", ".");
        std::string glob = params.value("glob", "*");
        int maxResults = params.value("max_results", 100);

        auto result = FilesystemTools::search(basePath, glob, maxResults);
        res.set_content(result.dump(), "application/json");
    }
    catch (const std::exception& e)
    {
        json error = {{"success", false}, {"error", e.what()}};
        res.status = 500;
        res.set_content(error.dump(), "application/json");
    }
}

void HttpServer::handleFsGrep(const void* reqPtr, void* resPtr)
{
    auto& req = *static_cast<const httplib::Request*>(reqPtr);
    auto& res = *static_cast<httplib::Response*>(resPtr);

    try
    {
        auto params = json::parse(req.body);
        std::string basePath = params.value("base", ".");
        std::string pattern = params.value("pattern", "");
        std::string glob = params.value("glob", "*");
        int maxMatches = params.value("max_matches", 100);

        auto result = FilesystemTools::grep(basePath, pattern, glob, maxMatches);
        res.set_content(result.dump(), "application/json");
    }
    catch (const std::exception& e)
    {
        json error = {{"success", false}, {"error", e.what()}};
        res.status = 500;
        res.set_content(error.dump(), "application/json");
    }
}

void HttpServer::handleFsPatch(const void* reqPtr, void* resPtr)
{
    auto& req = *static_cast<const httplib::Request*>(reqPtr);
    auto& res = *static_cast<httplib::Response*>(resPtr);

    try
    {
        auto params = json::parse(req.body);
        std::string path = params.value("path", "");
        auto operations = params.value("operations", json::array());
        bool dryRun = params.value("dry_run", false);

        auto result = FilesystemTools::patch(path, operations, dryRun);
        res.set_content(result.dump(), "application/json");
    }
    catch (const std::exception& e)
    {
        json error = {{"success", false}, {"error", e.what()}};
        res.status = 500;
        res.set_content(error.dump(), "application/json");
    }
}

// Shell handlers
void HttpServer::handleShellExec(const void* reqPtr, void* resPtr)
{
    auto& req = *static_cast<const httplib::Request*>(reqPtr);
    auto& res = *static_cast<httplib::Response*>(resPtr);

    try
    {
        auto params = json::parse(req.body);
        std::string command = params.value("command", "");
        std::string cwd = params.value("cwd", "");
        int timeout = params.value("timeout_seconds", 60);

        auto result = ShellTools::exec(command, cwd, timeout);
        res.set_content(result.dump(), "application/json");
    }
    catch (const std::exception& e)
    {
        json error = {{"success", false}, {"error", e.what()}};
        res.status = 500;
        res.set_content(error.dump(), "application/json");
    }
}

void HttpServer::handleShellStartSession(const void* reqPtr, void* resPtr)
{
    auto& req = *static_cast<const httplib::Request*>(reqPtr);
    auto& res = *static_cast<httplib::Response*>(resPtr);

    try
    {
        auto params = json::parse(req.body);
        std::string command = params.value("command", "");
        std::string cwd = params.value("cwd", "");

        auto result = ShellTools::startSession(command, cwd);
        res.set_content(result.dump(), "application/json");
    }
    catch (const std::exception& e)
    {
        json error = {{"success", false}, {"error", e.what()}};
        res.status = 500;
        res.set_content(error.dump(), "application/json");
    }
}

void HttpServer::handleShellSendInput(const void* reqPtr, void* resPtr)
{
    auto& req = *static_cast<const httplib::Request*>(reqPtr);
    auto& res = *static_cast<httplib::Response*>(resPtr);

    try
    {
        auto params = json::parse(req.body);
        std::string sessionId = params.value("session_id", "");
        std::string input = params.value("input", "");

        auto result = ShellTools::sendInput(sessionId, input);
        res.set_content(result.dump(), "application/json");
    }
    catch (const std::exception& e)
    {
        json error = {{"success", false}, {"error", e.what()}};
        res.status = 500;
        res.set_content(error.dump(), "application/json");
    }
}

void HttpServer::handleShellStopSession(const void* reqPtr, void* resPtr)
{
    auto& req = *static_cast<const httplib::Request*>(reqPtr);
    auto& res = *static_cast<httplib::Response*>(resPtr);

    try
    {
        auto params = json::parse(req.body);
        std::string sessionId = params.value("session_id", "");
        std::string signal = params.value("signal", "TERM");

        auto result = ShellTools::stopSession(sessionId, signal);
        res.set_content(result.dump(), "application/json");
    }
    catch (const std::exception& e)
    {
        json error = {{"success", false}, {"error", e.what()}};
        res.status = 500;
        res.set_content(error.dump(), "application/json");
    }
}

void HttpServer::handleStatus(const void* reqPtr, void* resPtr)
{
    auto& res = *static_cast<httplib::Response*>(resPtr);

    // TODO: Get actual status from control server connection
    json response = {
        {"success", true},
        {"service", "ScreenControlService"},
        {"version", "1.0.0"},
        {"status", "running"},
        {"connectionStatus", "connected"},  // TODO: actual status
        {"licenseStatus", "active"},        // TODO: actual license
        {"uptime", 0}                       // TODO: actual uptime
    };

    res.set_content(response.dump(), "application/json");
}

void HttpServer::handleBrowserProxy(const void* reqPtr, void* resPtr)
{
    auto& req = *static_cast<const httplib::Request*>(reqPtr);
    auto& res = *static_cast<httplib::Response*>(resPtr);

    // Forward request to browser bridge on port 3457
    httplib::Client client("127.0.0.1", 3457);
    client.set_connection_timeout(5);
    client.set_read_timeout(30);

    std::string path = "/browser" + std::string(req.matches[1]);

    auto proxyRes = client.Post(path, req.body, "application/json");

    if (proxyRes)
    {
        res.status = proxyRes->status;
        res.set_content(proxyRes->body, proxyRes->get_header_value("Content-Type"));
    }
    else
    {
        json error = {{"success", false}, {"error", "Browser bridge not available"}};
        res.status = 502;
        res.set_content(error.dump(), "application/json");
    }
}

// System tool handlers
void HttpServer::handleSystemInfo(const void* reqPtr, void* resPtr)
{
    auto& res = *static_cast<httplib::Response*>(resPtr);

    try
    {
        auto result = SystemTools::getSystemInfo();
        res.set_content(result.dump(), "application/json");
    }
    catch (const std::exception& e)
    {
        json error = {{"success", false}, {"error", e.what()}};
        res.status = 500;
        res.set_content(error.dump(), "application/json");
    }
}

void HttpServer::handleClipboardRead(const void* reqPtr, void* resPtr)
{
    auto& req = *static_cast<const httplib::Request*>(reqPtr);
    auto& res = *static_cast<httplib::Response*>(resPtr);

    proxyToGuiBridge("/clipboard/read", "", res, false);  // GET request
}

void HttpServer::handleClipboardWrite(const void* reqPtr, void* resPtr)
{
    auto& req = *static_cast<const httplib::Request*>(reqPtr);
    auto& res = *static_cast<httplib::Response*>(resPtr);

    proxyToGuiBridge("/clipboard/write", req.body, res);
}

void HttpServer::handleWait(const void* reqPtr, void* resPtr)
{
    auto& req = *static_cast<const httplib::Request*>(reqPtr);
    auto& res = *static_cast<httplib::Response*>(resPtr);

    try
    {
        auto params = json::parse(req.body);
        int milliseconds = params.value("milliseconds", 0);

        auto result = SystemTools::wait(milliseconds);
        res.set_content(result.dump(), "application/json");
    }
    catch (const std::exception& e)
    {
        json error = {{"success", false}, {"error", e.what()}};
        res.status = 500;
        res.set_content(error.dump(), "application/json");
    }
}

// Mouse tool handlers - proxied to GUI Bridge
void HttpServer::handleMouseMove(const void* reqPtr, void* resPtr)
{
    auto& req = *static_cast<const httplib::Request*>(reqPtr);
    auto& res = *static_cast<httplib::Response*>(resPtr);

    proxyToGuiBridge("/moveMouse", req.body, res);
}

void HttpServer::handleMousePosition(const void* reqPtr, void* resPtr)
{
    auto& req = *static_cast<const httplib::Request*>(reqPtr);
    auto& res = *static_cast<httplib::Response*>(resPtr);

    proxyToGuiBridge("/mousePosition", "", res, false);  // GET request
}

void HttpServer::handleMouseScroll(const void* reqPtr, void* resPtr)
{
    auto& req = *static_cast<const httplib::Request*>(reqPtr);
    auto& res = *static_cast<httplib::Response*>(resPtr);

    proxyToGuiBridge("/scroll", req.body, res);
}

void HttpServer::handleMouseDrag(const void* reqPtr, void* resPtr)
{
    auto& req = *static_cast<const httplib::Request*>(reqPtr);
    auto& res = *static_cast<httplib::Response*>(resPtr);

    proxyToGuiBridge("/drag", req.body, res);
}

} // namespace ScreenControl
