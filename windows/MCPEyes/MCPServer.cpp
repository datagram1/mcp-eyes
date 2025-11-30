#include "MCPServer.h"
#include "../../native/include/mcp_eyes.h"
#include <httplib.h>
#include <nlohmann/json.hpp>
#include <thread>
#include <atomic>
#include <sstream>
#include <windows.h>
#include <winsock2.h>
#include <ws2tcpip.h>

#pragma comment(lib, "ws2_32.lib")

using json = nlohmann::json;

namespace mcp_eyes {

MCPServer::MCPServer(unsigned int port, const std::string& apiKey)
    : port_(port)
    , apiKey_(apiKey)
    , running_(false)
    , delegate_(nullptr)
    , platform_(nullptr)
{
    // Initialize Winsock
    WSADATA wsaData;
    WSAStartup(MAKEWORD(2, 2), &wsaData);
}

MCPServer::~MCPServer() {
    stop();
    WSACleanup();
}

bool MCPServer::start() {
    if (running_) return false;

    running_ = true;
    serverThread_ = std::thread(&MCPServer::serverLoop, this);

    return true;
}

void MCPServer::stop() {
    if (!running_) return;
    running_ = false;

    if (serverThread_.joinable()) {
        serverThread_.join();
    }
}

void MCPServer::serverLoop() {
    httplib::Server server;

    // CORS middleware
    server.set_pre_routing_handler([](const httplib::Request& req, httplib::Response& res) {
        res.set_header("Access-Control-Allow-Origin", "*");
        res.set_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
        res.set_header("Access-Control-Allow-Headers", "Content-Type, Authorization");
        if (req.method == "OPTIONS") {
            res.status = 200;
            return httplib::Server::HandlerResponse::Handled;
        }
        return httplib::Server::HandlerResponse::Unhandled;
    });

    // Health check
    server.Get("/health", [](const httplib::Request&, httplib::Response& res) {
        json j = {{"status", "ok"}, {"version", "2.0.0"}};
        res.set_content(j.dump(), "application/json");
    });

    // Permissions
    server.Get("/permissions", [this](const httplib::Request&, httplib::Response& res) {
        if (!platform_) {
            res.status = 500;
            return;
        }
        auto perms = platform_->check_permissions();
        json j = {
            {"accessibility", perms.accessibility},
            {"screenRecording", perms.screen_recording},
            {"hasPermission", perms.accessibility && perms.screen_recording}
        };
        res.set_content(j.dump(), "application/json");
    });

    // List applications
    server.Get("/listApplications", [this](const httplib::Request&, httplib::Response& res) {
        if (!platform_) {
            res.status = 500;
            return;
        }
        auto apps = platform_->list_applications();
        json j = json::array();
        for (const auto& app : apps) {
            j.push_back({
                {"name", app.name},
                {"bundleId", app.bundle_id},
                {"pid", app.pid},
                {"bounds", {
                    {"x", app.bounds.x},
                    {"y", app.bounds.y},
                    {"width", app.bounds.width},
                    {"height", app.bounds.height}
                }}
            });
        }
        res.set_content(j.dump(), "application/json");
    });

    // Focus application
    server.Post("/focusApplication", [this](const httplib::Request& req, httplib::Response& res) {
        if (!platform_) {
            res.status = 500;
            return;
        }
        try {
            auto j = json::parse(req.body);
            std::string identifier = j.value("identifier", "");
            if (identifier.empty()) {
                res.status = 400;
                res.set_content(R"({"error": "identifier is required"})", "application/json");
                return;
            }
            bool success = platform_->focus_application(identifier);
            json response = {{"success", success}};
            res.set_content(response.dump(), "application/json");
        } catch (const std::exception& e) {
            res.status = 400;
            json error = {{"error", e.what()}};
            res.set_content(error.dump(), "application/json");
        }
    });

    // Screenshot
    server.Get("/screenshot", [this](const httplib::Request&, httplib::Response& res) {
        if (!platform_) {
            res.status = 500;
            return;
        }
        auto screenshot = platform_->take_screenshot();
        if (screenshot.png_data.empty()) {
            res.status = 500;
            res.set_content(R"({"error": "Failed to take screenshot"})", "application/json");
            return;
        }
        // Convert to base64
        std::string base64 = base64_encode(screenshot.png_data.data(), screenshot.png_data.size());
        json j = {
            {"image", base64},
            {"format", "png"},
            {"width", screenshot.width},
            {"height", screenshot.height}
        };
        res.set_content(j.dump(), "application/json");
    });

    // Click
    server.Post("/click", [this](const httplib::Request& req, httplib::Response& res) {
        if (!platform_) {
            res.status = 500;
            return;
        }
        try {
            auto j = json::parse(req.body);
            float x = j.value("x", 0.0f);
            float y = j.value("y", 0.0f);
            std::string button = j.value("button", "left");
            bool rightButton = (button == "right");
            bool success = platform_->click(static_cast<int>(x * 1000), static_cast<int>(y * 1000), rightButton);
            json response = {{"success", success}};
            res.set_content(response.dump(), "application/json");
        } catch (const std::exception& e) {
            res.status = 400;
            json error = {{"error", e.what()}};
            res.set_content(error.dump(), "application/json");
        }
    });

    // Type text
    server.Post("/typeText", [this](const httplib::Request& req, httplib::Response& res) {
        if (!platform_) {
            res.status = 500;
            return;
        }
        try {
            auto j = json::parse(req.body);
            std::string text = j.value("text", "");
            if (text.empty()) {
                res.status = 400;
                res.set_content(R"({"error": "text is required"})", "application/json");
                return;
            }
            bool success = platform_->type_text(text);
            json response = {{"success", success}};
            res.set_content(response.dump(), "application/json");
        } catch (const std::exception& e) {
            res.status = 400;
            json error = {{"error", e.what()}};
            res.set_content(error.dump(), "application/json");
        }
    });

    // Press key
    server.Post("/pressKey", [this](const httplib::Request& req, httplib::Response& res) {
        if (!platform_) {
            res.status = 500;
            return;
        }
        try {
            auto j = json::parse(req.body);
            std::string key = j.value("key", "");
            if (key.empty()) {
                res.status = 400;
                res.set_content(R"({"error": "key is required"})", "application/json");
                return;
            }
            bool success = platform_->press_key(key);
            json response = {{"success", success}};
            res.set_content(response.dump(), "application/json");
        } catch (const std::exception& e) {
            res.status = 400;
            json error = {{"error", e.what()}};
            res.set_content(error.dump(), "application/json");
        }
    });

    // Screenshot of app
    server.Post("/screenshot_app", [this](const httplib::Request& req, httplib::Response& res) {
        if (!platform_) {
            res.status = 500;
            return;
        }
        try {
            auto j = json::parse(req.body);
            std::string identifier = j.value("identifier", "");
            auto screenshot = takeScreenshotOfWindow(identifier);
            if (screenshot.png_data.empty()) {
                res.status = 500;
                res.set_content(R"({"error": "Failed to take screenshot"})", "application/json");
                return;
            }
            std::string base64 = base64_encode(screenshot.png_data.data(), screenshot.png_data.size());
            json j_response = {
                {"image", base64},
                {"format", "png"},
                {"width", screenshot.width},
                {"height", screenshot.height}
            };
            res.set_content(j_response.dump(), "application/json");
        } catch (const std::exception& e) {
            res.status = 400;
            json error = {{"error", e.what()}};
            res.set_content(error.dump(), "application/json");
        }
    });

    // Move mouse
    server.Post("/moveMouse", [this](const httplib::Request& req, httplib::Response& res) {
        if (!platform_) {
            res.status = 500;
            return;
        }
        try {
            auto j = json::parse(req.body);
            float x = j.value("x", 0.0f);
            float y = j.value("y", 0.0f);
            bool success = moveMouse(x, y);
            json response = {{"success", success}};
            res.set_content(response.dump(), "application/json");
        } catch (const std::exception& e) {
            res.status = 400;
            json error = {{"error", e.what()}};
            res.set_content(error.dump(), "application/json");
        }
    });

    // Scroll
    server.Post("/scroll", [this](const httplib::Request& req, httplib::Response& res) {
        if (!platform_) {
            res.status = 500;
            return;
        }
        try {
            auto j = json::parse(req.body);
            int deltaX = j.value("deltaX", 0);
            int deltaY = j.value("deltaY", 0);
            float x = j.value("x", -1.0f);
            float y = j.value("y", -1.0f);
            bool success = scroll(deltaX, deltaY, x, y);
            json response = {{"success", success}};
            res.set_content(response.dump(), "application/json");
        } catch (const std::exception& e) {
            res.status = 400;
            json error = {{"error", e.what()}};
            res.set_content(error.dump(), "application/json");
        }
    });

    // Drag
    server.Post("/drag", [this](const httplib::Request& req, httplib::Response& res) {
        if (!platform_) {
            res.status = 500;
            return;
        }
        try {
            auto j = json::parse(req.body);
            float startX = j.value("startX", 0.0f);
            float startY = j.value("startY", 0.0f);
            float endX = j.value("endX", 0.0f);
            float endY = j.value("endY", 0.0f);
            bool success = drag(startX, startY, endX, endY);
            json response = {{"success", success}};
            res.set_content(response.dump(), "application/json");
        } catch (const std::exception& e) {
            res.status = 400;
            json error = {{"error", e.what()}};
            res.set_content(error.dump(), "application/json");
        }
    });

    // Get clickable elements
    server.Get("/getClickableElements", [this](const httplib::Request&, httplib::Response& res) {
        if (!platform_) {
            res.status = 500;
            return;
        }
        auto elements = platform_->get_clickable_elements("");
        json j = json::array();
        for (const auto& elem : elements) {
            j.push_back({
                {"type", elem.type},
                {"text", elem.text},
                {"role", elem.role},
                {"isEnabled", elem.is_enabled},
                {"isClickable", elem.is_clickable},
                {"bounds", {
                    {"x", elem.bounds.x},
                    {"y", elem.bounds.y},
                    {"width", elem.bounds.width},
                    {"height", elem.bounds.height}
                }},
                {"normalizedPosition", {
                    {"x", elem.normalized_position.x},
                    {"y", elem.normalized_position.y}
                }}
            });
        }
        json response = {
            {"elements", j},
            {"count", elements.size()}
        };
        res.set_content(response.dump(), "application/json");
    });

    // Notify delegate
    if (delegate_) {
        delegate_->serverDidStart(port_);
    }

    // Start server
    std::string bindAddr = "127.0.0.1";  // Default to localhost
    server.listen(bindAddr, static_cast<int>(port_));

    // Notify delegate of stop
    if (delegate_) {
        delegate_->serverDidStop();
    }
}

bool MCPServer::verifyApiKey(const std::string& authHeader) {
    if (authHeader.empty()) return false;
    if (authHeader.substr(0, 7) == "Bearer ") {
        return authHeader.substr(7) == apiKey_;
    }
    return false;
}

std::string MCPServer::base64_encode(const unsigned char* data, size_t length) {
    static const char base64_chars[] = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    std::string result;
    int i = 0;
    int j = 0;
    unsigned char char_array_3[3];
    unsigned char char_array_4[4];

    for (size_t idx = 0; idx < length; idx++) {
        char_array_3[i++] = data[idx];
        if (i == 3) {
            char_array_4[0] = (char_array_3[0] & 0xfc) >> 2;
            char_array_4[1] = ((char_array_3[0] & 0x03) << 4) + ((char_array_3[1] & 0xf0) >> 4);
            char_array_4[2] = ((char_array_3[1] & 0x0f) << 2) + ((char_array_3[2] & 0xc0) >> 6);
            char_array_4[3] = char_array_3[2] & 0x3f;

            for (i = 0; i < 4; i++) {
                result += base64_chars[char_array_4[i]];
            }
            i = 0;
        }
    }

    if (i) {
        for (j = i; j < 3; j++) {
            char_array_3[j] = '\0';
        }

        char_array_4[0] = (char_array_3[0] & 0xfc) >> 2;
        char_array_4[1] = ((char_array_3[0] & 0x03) << 4) + ((char_array_3[1] & 0xf0) >> 4);
        char_array_4[2] = ((char_array_3[1] & 0x0f) << 2) + ((char_array_3[2] & 0xc0) >> 6);
        char_array_4[3] = char_array_3[2] & 0x3f;

        for (j = 0; j < i + 1; j++) {
            result += base64_chars[char_array_4[j]];
        }

        while (i++ < 3) {
            result += '=';
        }
    }

    return result;
}

// Delegated methods
std::vector<AppInfo> MCPServer::listApplications() {
    if (!platform_) return {};
    return platform_->list_applications();
}

bool MCPServer::focusApplication(const std::string& identifier) {
    if (!platform_) return false;
    return platform_->focus_application(identifier);
}

Screenshot MCPServer::takeScreenshot() {
    if (!platform_) return Screenshot();
    return platform_->take_screenshot();
}

bool MCPServer::clickAtX(float x, float y, bool rightButton) {
    if (!platform_) return false;
    return platform_->click(static_cast<int>(x * 1000), static_cast<int>(y * 1000), rightButton);
}

bool MCPServer::typeText(const std::string& text) {
    if (!platform_) return false;
    return platform_->type_text(text);
}

bool MCPServer::pressKey(const std::string& key) {
    if (!platform_) return false;
    return platform_->press_key(key);
}

std::vector<UIElement> MCPServer::getClickableElements() {
    if (!platform_) return {};
    return platform_->get_clickable_elements("");
}

Permissions MCPServer::checkPermissions() {
    if (!platform_) {
        Permissions perms = {};
        return perms;
    }
    return platform_->check_permissions();
}

AppInfo MCPServer::getCurrentApp() {
    AppInfo info = {};
    if (platform_) {
        AppInfo* focused = platform_->get_focused_app();
        if (focused) {
            info = *focused;
        }
    }
    return info;
}

bool MCPServer::launchApplication(const std::string& identifier) {
    // TODO: Implement application launch
    return false;
}

Screenshot MCPServer::takeScreenshotOfWindow(const std::string& identifier) {
    if (!platform_) return Screenshot();
    // Focus the window first
    platform_->focus_application(identifier);
    return platform_->take_screenshot();
}

bool MCPServer::moveMouse(float x, float y) {
    if (!platform_) return false;
    return platform_->move_mouse(static_cast<int>(x * 1000), static_cast<int>(y * 1000));
}

bool MCPServer::scroll(int deltaX, int deltaY, float x, float y) {
    if (!platform_) return false;
    // Move mouse to position if specified
    if (x >= 0 && y >= 0) {
        moveMouse(x, y);
        Sleep(50);
    }
    // Use SendInput for scrolling
    INPUT input = {};
    input.type = INPUT_MOUSE;
    input.mi.dwFlags = MOUSEEVENTF_WHEEL;
    input.mi.mouseData = static_cast<DWORD>(-deltaY * 120);  // 120 = WHEEL_DELTA
    SendInput(1, &input, sizeof(INPUT));
    return true;
}

bool MCPServer::drag(float startX, float startY, float endX, float endY) {
    if (!platform_) return false;
    // Move to start position
    moveMouse(startX, startY);
    Sleep(50);
    
    // Mouse down
    INPUT input = {};
    input.type = INPUT_MOUSE;
    input.mi.dx = static_cast<int>(startX * 1000);
    input.mi.dy = static_cast<int>(startY * 1000);
    input.mi.dwFlags = MOUSEEVENTF_ABSOLUTE | MOUSEEVENTF_LEFTDOWN;
    SendInput(1, &input, sizeof(INPUT));
    Sleep(50);
    
    // Drag to end position (with intermediate steps)
    int steps = 10;
    for (int i = 1; i <= steps; ++i) {
        float progress = static_cast<float>(i) / steps;
        float currentX = startX + (endX - startX) * progress;
        float currentY = startY + (endY - startY) * progress;
        
        input.mi.dx = static_cast<int>(currentX * 1000);
        input.mi.dy = static_cast<int>(currentY * 1000);
        input.mi.dwFlags = MOUSEEVENTF_ABSOLUTE | MOUSEEVENTF_MOVE;
        SendInput(1, &input, sizeof(INPUT));
        Sleep(20);
    }
    
    // Mouse up
    input.mi.dx = static_cast<int>(endX * 1000);
    input.mi.dy = static_cast<int>(endY * 1000);
    input.mi.dwFlags = MOUSEEVENTF_ABSOLUTE | MOUSEEVENTF_LEFTUP;
    SendInput(1, &input, sizeof(INPUT));
    
    return true;
}

} // namespace mcp_eyes

