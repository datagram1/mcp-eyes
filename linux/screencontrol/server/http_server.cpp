/**
 * HTTP Server Implementation
 *
 * All API endpoints matching macOS/Windows agents.
 */

// Enable OpenSSL support for httplib
#define CPPHTTPLIB_OPENSSL_SUPPORT 1
#include "../libs/httplib.h"
#include "../libs/json.hpp"
#include "http_server.h"

// X11 includes for drag implementation
#include <X11/Xlib.h>
#include <X11/extensions/XTest.h>
#include <unistd.h>
#include "../core/config.h"
#include "../core/logger.h"
#include "../tools/gui_tools.h"
#include "../tools/filesystem_tools.h"
#include "../tools/shell_tools.h"
#include "../tools/ui_automation.h"
#include "../tools/system_tools.h"

using json = nlohmann::json;

namespace ScreenControl
{

HttpServer::HttpServer(int port) : m_port(port)
{
    m_server = std::make_unique<httplib::Server>();
    setupRoutes();
}

HttpServer::~HttpServer()
{
    stop();
}

void HttpServer::start()
{
    m_running = true;
    Logger::info("HTTP server starting on port " + std::to_string(m_port));
    // Bind to all interfaces for Docker/remote access
    m_server->listen("0.0.0.0", m_port);
}

void HttpServer::stop()
{
    if (m_running)
    {
        m_running = false;
        m_server->stop();
        Logger::info("HTTP server stopped");
    }
}

void HttpServer::setupRoutes()
{
    // Health check
    m_server->Get("/health", [](const httplib::Request&, httplib::Response& res) {
        res.set_content(R"({"status":"ok"})", "application/json");
    });

    // Status endpoint
    m_server->Get("/status", [](const httplib::Request&, httplib::Response& res) {
        json response = {
            {"success", true},
            {"version", "1.0.0"},
            {"platform", "linux"},
            {"licensed", Config::getInstance().isLicensed()},
            {"licenseStatus", Config::getInstance().getLicenseStatus()},
            {"machineId", Config::getInstance().getMachineId()}
        };
        res.set_content(response.dump(), "application/json");
    });

    // Settings
    m_server->Get("/settings", [](const httplib::Request&, httplib::Response& res) {
        auto& config = Config::getInstance();
        json response = {
            {"port", config.getPort()},
            {"controlServerUrl", config.getControlServerUrl()},
            {"autoStart", config.getAutoStart()},
            {"enableLogging", config.getLoggingEnabled()}
        };
        res.set_content(response.dump(), "application/json");
    });

    m_server->Post("/settings", [](const httplib::Request& req, httplib::Response& res) {
        try
        {
            auto body = json::parse(req.body);
            auto& config = Config::getInstance();

            if (body.contains("controlServerUrl"))
                config.setControlServerUrl(body["controlServerUrl"]);
            if (body.contains("autoStart"))
                config.setAutoStart(body["autoStart"]);
            if (body.contains("enableLogging"))
                config.setLoggingEnabled(body["enableLogging"]);

            config.save();
            res.set_content(R"({"success":true})", "application/json");
        }
        catch (const std::exception& e)
        {
            res.set_content(json{{"success", false}, {"error", e.what()}}.dump(), "application/json");
        }
    });

    // Fingerprint / Machine ID
    m_server->Get("/fingerprint", [](const httplib::Request&, httplib::Response& res) {
        json response = {
            {"success", true},
            {"machineId", Config::getInstance().getMachineId()}
        };
        res.set_content(response.dump(), "application/json");
    });

    // Screenshot
    m_server->Get("/screenshot", [](const httplib::Request& req, httplib::Response& res) {
        int quality = 80;
        if (req.has_param("quality"))
        {
            quality = std::stoi(req.get_param_value("quality"));
        }

        auto result = GuiTools::screenshot(quality);
        res.set_content(result.dump(), "application/json");
    });

    // Mouse click
    m_server->Post("/click", [](const httplib::Request& req, httplib::Response& res) {
        try
        {
            auto body = json::parse(req.body);
            int x = body.value("x", 0);
            int y = body.value("y", 0);
            std::string button = body.value("button", "left");
            int clicks = body.value("clicks", 1);

            auto result = GuiTools::click(x, y, button, clicks);
            res.set_content(result.dump(), "application/json");
        }
        catch (const std::exception& e)
        {
            res.set_content(json{{"success", false}, {"error", e.what()}}.dump(), "application/json");
        }
    });

    // Keyboard type
    m_server->Post("/keyboard/type", [](const httplib::Request& req, httplib::Response& res) {
        try
        {
            auto body = json::parse(req.body);
            std::string text = body.value("text", "");

            auto result = GuiTools::typeText(text);
            res.set_content(result.dump(), "application/json");
        }
        catch (const std::exception& e)
        {
            res.set_content(json{{"success", false}, {"error", e.what()}}.dump(), "application/json");
        }
    });

    // Keyboard key press
    m_server->Post("/keyboard/key", [](const httplib::Request& req, httplib::Response& res) {
        try
        {
            auto body = json::parse(req.body);
            std::string key = body.value("key", "");
            auto modifiers = body.value("modifiers", std::vector<std::string>{});

            auto result = GuiTools::pressKey(key, modifiers);
            res.set_content(result.dump(), "application/json");
        }
        catch (const std::exception& e)
        {
            res.set_content(json{{"success", false}, {"error", e.what()}}.dump(), "application/json");
        }
    });

    // UI elements
    m_server->Get("/ui/elements", [](const httplib::Request&, httplib::Response& res) {
        auto result = UIAutomation::getClickableElements();
        res.set_content(result.dump(), "application/json");
    });

    // Window list
    m_server->Get("/ui/windows", [](const httplib::Request&, httplib::Response& res) {
        auto result = UIAutomation::getWindowList();
        res.set_content(result.dump(), "application/json");
    });

    // Focus window
    m_server->Post("/ui/focus", [](const httplib::Request& req, httplib::Response& res) {
        try
        {
            auto body = json::parse(req.body);
            std::string title = body.value("title", "");
            unsigned long windowId = body.value("windowId", 0UL);

            auto result = UIAutomation::focusWindow(title, windowId);
            res.set_content(result.dump(), "application/json");
        }
        catch (const std::exception& e)
        {
            res.set_content(json{{"success", false}, {"error", e.what()}}.dump(), "application/json");
        }
    });

    // Active window
    m_server->Get("/ui/active", [](const httplib::Request&, httplib::Response& res) {
        auto result = UIAutomation::getActiveWindow();
        res.set_content(result.dump(), "application/json");
    });

    // Filesystem: list
    m_server->Post("/fs/list", [](const httplib::Request& req, httplib::Response& res) {
        try
        {
            auto body = json::parse(req.body);
            std::string path = body.value("path", ".");
            bool recursive = body.value("recursive", false);
            int maxDepth = body.value("maxDepth", 1);

            auto result = FilesystemTools::list(path, recursive, maxDepth);
            res.set_content(result.dump(), "application/json");
        }
        catch (const std::exception& e)
        {
            res.set_content(json{{"success", false}, {"error", e.what()}}.dump(), "application/json");
        }
    });

    // Filesystem: read
    m_server->Post("/fs/read", [](const httplib::Request& req, httplib::Response& res) {
        try
        {
            auto body = json::parse(req.body);
            std::string path = body.value("path", "");
            size_t maxBytes = body.value("maxBytes", 1048576); // 1MB default

            auto result = FilesystemTools::read(path, maxBytes);
            res.set_content(result.dump(), "application/json");
        }
        catch (const std::exception& e)
        {
            res.set_content(json{{"success", false}, {"error", e.what()}}.dump(), "application/json");
        }
    });

    // Filesystem: read range
    m_server->Post("/fs/read_range", [](const httplib::Request& req, httplib::Response& res) {
        try
        {
            auto body = json::parse(req.body);
            std::string path = body.value("path", "");
            int startLine = body.value("startLine", 1);
            int endLine = body.value("endLine", -1);

            auto result = FilesystemTools::readRange(path, startLine, endLine);
            res.set_content(result.dump(), "application/json");
        }
        catch (const std::exception& e)
        {
            res.set_content(json{{"success", false}, {"error", e.what()}}.dump(), "application/json");
        }
    });

    // Filesystem: write
    m_server->Post("/fs/write", [](const httplib::Request& req, httplib::Response& res) {
        try
        {
            auto body = json::parse(req.body);
            std::string path = body.value("path", "");
            std::string content = body.value("content", "");
            std::string mode = body.value("mode", "overwrite");
            bool createDirs = body.value("createDirs", false);

            auto result = FilesystemTools::write(path, content, mode, createDirs);
            res.set_content(result.dump(), "application/json");
        }
        catch (const std::exception& e)
        {
            res.set_content(json{{"success", false}, {"error", e.what()}}.dump(), "application/json");
        }
    });

    // Filesystem: delete
    m_server->Post("/fs/delete", [](const httplib::Request& req, httplib::Response& res) {
        try
        {
            auto body = json::parse(req.body);
            std::string path = body.value("path", "");
            bool recursive = body.value("recursive", false);

            auto result = FilesystemTools::remove(path, recursive);
            res.set_content(result.dump(), "application/json");
        }
        catch (const std::exception& e)
        {
            res.set_content(json{{"success", false}, {"error", e.what()}}.dump(), "application/json");
        }
    });

    // Filesystem: move
    m_server->Post("/fs/move", [](const httplib::Request& req, httplib::Response& res) {
        try
        {
            auto body = json::parse(req.body);
            std::string source = body.value("source", "");
            std::string destination = body.value("destination", "");

            auto result = FilesystemTools::move(source, destination);
            res.set_content(result.dump(), "application/json");
        }
        catch (const std::exception& e)
        {
            res.set_content(json{{"success", false}, {"error", e.what()}}.dump(), "application/json");
        }
    });

    // Filesystem: search (glob)
    m_server->Post("/fs/search", [](const httplib::Request& req, httplib::Response& res) {
        try
        {
            auto body = json::parse(req.body);
            std::string basePath = body.value("path", ".");
            std::string glob = body.value("glob", "*");
            int maxResults = body.value("maxResults", 100);

            auto result = FilesystemTools::search(basePath, glob, maxResults);
            res.set_content(result.dump(), "application/json");
        }
        catch (const std::exception& e)
        {
            res.set_content(json{{"success", false}, {"error", e.what()}}.dump(), "application/json");
        }
    });

    // Filesystem: grep
    m_server->Post("/fs/grep", [](const httplib::Request& req, httplib::Response& res) {
        try
        {
            auto body = json::parse(req.body);
            std::string basePath = body.value("path", ".");
            std::string pattern = body.value("pattern", "");
            std::string glob = body.value("glob", "*");
            int maxMatches = body.value("maxMatches", 100);

            auto result = FilesystemTools::grep(basePath, pattern, glob, maxMatches);
            res.set_content(result.dump(), "application/json");
        }
        catch (const std::exception& e)
        {
            res.set_content(json{{"success", false}, {"error", e.what()}}.dump(), "application/json");
        }
    });

    // Filesystem: patch
    m_server->Post("/fs/patch", [](const httplib::Request& req, httplib::Response& res) {
        try
        {
            auto body = json::parse(req.body);
            std::string path = body.value("path", "");
            auto operations = body.value("operations", json::array());
            bool dryRun = body.value("dryRun", false);

            auto result = FilesystemTools::patch(path, operations, dryRun);
            res.set_content(result.dump(), "application/json");
        }
        catch (const std::exception& e)
        {
            res.set_content(json{{"success", false}, {"error", e.what()}}.dump(), "application/json");
        }
    });

    // Shell: exec
    m_server->Post("/shell/exec", [](const httplib::Request& req, httplib::Response& res) {
        try
        {
            auto body = json::parse(req.body);
            std::string command = body.value("command", "");
            std::string cwd = body.value("cwd", "");
            int timeout = body.value("timeout", 30);

            auto result = ShellTools::exec(command, cwd, timeout);
            res.set_content(result.dump(), "application/json");
        }
        catch (const std::exception& e)
        {
            res.set_content(json{{"success", false}, {"error", e.what()}}.dump(), "application/json");
        }
    });

    // Shell: start session
    m_server->Post("/shell/session/start", [](const httplib::Request& req, httplib::Response& res) {
        try
        {
            auto body = json::parse(req.body);
            std::string command = body.value("command", "");
            std::string cwd = body.value("cwd", "");

            auto result = ShellTools::startSession(command, cwd);
            res.set_content(result.dump(), "application/json");
        }
        catch (const std::exception& e)
        {
            res.set_content(json{{"success", false}, {"error", e.what()}}.dump(), "application/json");
        }
    });

    // Shell: send input to session
    m_server->Post("/shell/session/input", [](const httplib::Request& req, httplib::Response& res) {
        try
        {
            auto body = json::parse(req.body);
            std::string sessionId = body.value("sessionId", "");
            std::string input = body.value("input", "");

            auto result = ShellTools::sendInput(sessionId, input);
            res.set_content(result.dump(), "application/json");
        }
        catch (const std::exception& e)
        {
            res.set_content(json{{"success", false}, {"error", e.what()}}.dump(), "application/json");
        }
    });

    // Shell: stop session
    m_server->Post("/shell/session/stop", [](const httplib::Request& req, httplib::Response& res) {
        try
        {
            auto body = json::parse(req.body);
            std::string sessionId = body.value("sessionId", "");
            std::string signal = body.value("signal", "TERM");

            auto result = ShellTools::stopSession(sessionId, signal);
            res.set_content(result.dump(), "application/json");
        }
        catch (const std::exception& e)
        {
            res.set_content(json{{"success", false}, {"error", e.what()}}.dump(), "application/json");
        }
    });

    // License endpoints
    m_server->Post("/license/activate", [](const httplib::Request& req, httplib::Response& res) {
        try
        {
            auto body = json::parse(req.body);
            std::string licenseKey = body.value("licenseKey", "");

            // TODO: Implement license activation
            res.set_content(json{{"success", true}, {"message", "License activated"}}.dump(), "application/json");
        }
        catch (const std::exception& e)
        {
            res.set_content(json{{"success", false}, {"error", e.what()}}.dump(), "application/json");
        }
    });

    m_server->Post("/license/deactivate", [](const httplib::Request&, httplib::Response& res) {
        // TODO: Implement license deactivation
        res.set_content(json{{"success", true}, {"message", "License deactivated"}}.dump(), "application/json");
    });

    // System info
    m_server->Get("/system/info", [](const httplib::Request&, httplib::Response& res) {
        auto result = SystemTools::getSystemInfo();
        res.set_content(result.dump(), "application/json");
    });

    // Clipboard read
    m_server->Get("/clipboard/read", [](const httplib::Request&, httplib::Response& res) {
        auto result = SystemTools::clipboardRead();
        res.set_content(result.dump(), "application/json");
    });

    // Clipboard write
    m_server->Post("/clipboard/write", [](const httplib::Request& req, httplib::Response& res) {
        try
        {
            auto body = json::parse(req.body);
            std::string text = body.value("text", "");

            auto result = SystemTools::clipboardWrite(text);
            res.set_content(result.dump(), "application/json");
        }
        catch (const std::exception& e)
        {
            res.set_content(json{{"success", false}, {"error", e.what()}}.dump(), "application/json");
        }
    });

    // Wait
    m_server->Post("/wait", [](const httplib::Request& req, httplib::Response& res) {
        try
        {
            auto body = json::parse(req.body);
            int milliseconds = body.value("milliseconds", 0);

            auto result = SystemTools::wait(milliseconds);
            res.set_content(result.dump(), "application/json");
        }
        catch (const std::exception& e)
        {
            res.set_content(json{{"success", false}, {"error", e.what()}}.dump(), "application/json");
        }
    });

    // Mouse move endpoint
    m_server->Post("/mouse/move", [](const httplib::Request& req, httplib::Response& res) {
        try
        {
            auto body = json::parse(req.body);
            int x = body.value("x", 0);
            int y = body.value("y", 0);

            auto result = GuiTools::moveMouse(x, y);
            res.set_content(result.dump(), "application/json");
        }
        catch (const std::exception& e)
        {
            res.set_content(json{{"success", false}, {"error", e.what()}}.dump(), "application/json");
        }
    });

    // Mouse scroll endpoint
    m_server->Post("/mouse/scroll", [](const httplib::Request& req, httplib::Response& res) {
        try
        {
            auto body = json::parse(req.body);
            int x = body.value("x", 0);
            int y = body.value("y", 0);
            int deltaX = body.value("deltaX", 0);
            int deltaY = body.value("deltaY", 0);

            auto result = GuiTools::scroll(x, y, deltaX, deltaY);
            res.set_content(result.dump(), "application/json");
        }
        catch (const std::exception& e)
        {
            res.set_content(json{{"success", false}, {"error", e.what()}}.dump(), "application/json");
        }
    });

    // Get mouse position
    m_server->Get("/mouse/position", [](const httplib::Request&, httplib::Response& res) {
        auto result = GuiTools::getCursorPosition();
        res.set_content(result.dump(), "application/json");
    });

    // Drag endpoint
    m_server->Post("/mouse/drag", [](const httplib::Request& req, httplib::Response& res) {
        try
        {
            auto body = json::parse(req.body);
            int startX = body.value("startX", 0);
            int startY = body.value("startY", 0);
            int endX = body.value("endX", 0);
            int endY = body.value("endY", 0);

            // Implement drag as move + press + move + release
            Display* display = XOpenDisplay(nullptr);
            if (!display)
            {
                res.set_content(json{{"success", false}, {"error", "Cannot open X display"}}.dump(), "application/json");
                return;
            }

            Window root = DefaultRootWindow(display);

            // Move to start
            XWarpPointer(display, None, root, 0, 0, 0, 0, startX, startY);
            XFlush(display);
            usleep(50000);

            // Press button
            XTestFakeButtonEvent(display, Button1, True, CurrentTime);
            XFlush(display);
            usleep(50000);

            // Move to end
            XWarpPointer(display, None, root, 0, 0, 0, 0, endX, endY);
            XFlush(display);
            usleep(50000);

            // Release button
            XTestFakeButtonEvent(display, Button1, False, CurrentTime);
            XFlush(display);

            XCloseDisplay(display);

            res.set_content(json{
                {"success", true},
                {"startX", startX}, {"startY", startY},
                {"endX", endX}, {"endY", endY}
            }.dump(), "application/json");
        }
        catch (const std::exception& e)
        {
            res.set_content(json{{"success", false}, {"error", e.what()}}.dump(), "application/json");
        }
    });

    Logger::info("HTTP routes configured");
}

} // namespace ScreenControl
