#include "mcp_eyes.h"
#include "platform.h"
#include <httplib.h>
#include <nlohmann/json.hpp>
#include <thread>
#include <atomic>
#include <mutex>

namespace mcp_eyes {

using json = nlohmann::json;

// External: web UI HTML (embedded or loaded from file)
extern const char* get_web_ui_html();

class HttpServer {
public:
    HttpServer(Agent* agent, Platform* platform)
        : agent_(agent), platform_(platform), running_(false) {}

    bool start(const AgentConfig& config) {
        if (running_) return false;

        config_ = config;

        // Determine bind address
        std::string bind_addr = "127.0.0.1";  // localhost default
        if (config_.network_mode == "lan" || config_.network_mode == "wan") {
            bind_addr = "0.0.0.0";
        }

        server_ = std::make_unique<httplib::Server>();
        setup_routes();

        running_ = true;
        server_thread_ = std::thread([this, bind_addr]() {
            server_->listen(bind_addr, config_.port);
        });

        return true;
    }

    void stop() {
        if (!running_) return;
        running_ = false;
        server_->stop();
        if (server_thread_.joinable()) {
            server_thread_.join();
        }
    }

    bool is_running() const { return running_; }

private:
    void setup_routes() {
        // CORS middleware
        server_->set_pre_routing_handler([](const httplib::Request& req, httplib::Response& res) {
            res.set_header("Access-Control-Allow-Origin", "*");
            res.set_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
            res.set_header("Access-Control-Allow-Headers", "Content-Type, Authorization");
            if (req.method == "OPTIONS") {
                res.status = 200;
                return httplib::Server::HandlerResponse::Handled;
            }
            return httplib::Server::HandlerResponse::Unhandled;
        });

        // Auth middleware (skip for health and web UI)
        auto auth_check = [this](const httplib::Request& req) -> bool {
            if (config_.network_mode == "localhost") return true;

            auto auth = req.get_header_value("Authorization");
            if (auth.empty()) return false;

            // Bearer token
            if (auth.substr(0, 7) == "Bearer ") {
                return auth.substr(7) == config_.api_key;
            }
            return false;
        };

        // ═══════════════════════════════════════════════════════════════
        // Web UI
        // ═══════════════════════════════════════════════════════════════

        server_->Get("/", [](const httplib::Request&, httplib::Response& res) {
            res.set_content(get_web_ui_html(), "text/html");
        });

        // ═══════════════════════════════════════════════════════════════
        // Health & Status (no auth required)
        // ═══════════════════════════════════════════════════════════════

        server_->Get("/health", [this](const httplib::Request&, httplib::Response& res) {
            json j = {{"status", "ok"}, {"version", VERSION}};
            res.set_content(j.dump(), "application/json");
        });

        server_->Get("/api/status", [this](const httplib::Request&, httplib::Response& res) {
            auto status = agent_->status();
            json j = {
                {"name", status.name},
                {"version", status.version},
                {"os", status.os},
                {"os_version", status.os_version},
                {"arch", status.arch},
                {"hostname", status.hostname},
                {"port", status.port},
                {"tls", status.tls},
                {"uptime_seconds", status.uptime_seconds},
                {"permissions", {
                    {"accessibility", status.permissions.accessibility},
                    {"screen_recording", status.permissions.screen_recording},
                    {"automation", status.permissions.automation}
                }}
            };
            res.set_content(j.dump(), "application/json");
        });

        // ═══════════════════════════════════════════════════════════════
        // Settings API
        // ═══════════════════════════════════════════════════════════════

        server_->Get("/api/settings", [this, auth_check](const httplib::Request& req, httplib::Response& res) {
            auto& config = agent_->config();
            json j = {
                {"name", config.name},
                {"network_mode", config.network_mode},
                {"port", config.port},
                {"tls_enabled", config.tls_enabled},
                {"api_key", config.api_key},
                {"allowed_ips", config.allowed_ips}
            };
            res.set_content(j.dump(), "application/json");
        });

        server_->Post("/api/settings", [this](const httplib::Request& req, httplib::Response& res) {
            try {
                auto j = json::parse(req.body);
                auto& config = agent_->config();

                if (j.contains("name")) config.name = j["name"];
                if (j.contains("network_mode")) config.network_mode = j["network_mode"];
                if (j.contains("tls_enabled")) config.tls_enabled = j["tls_enabled"];
                if (j.contains("allowed_ips")) config.allowed_ips = j["allowed_ips"].get<std::vector<std::string>>();

                agent_->save_config();
                res.set_content(R"({"success": true})", "application/json");
            } catch (const std::exception& e) {
                res.status = 400;
                json err = {{"error", e.what()}};
                res.set_content(err.dump(), "application/json");
            }
        });

        server_->Post("/api/regenerate-key", [this](const httplib::Request&, httplib::Response& res) {
            // Generate new API key
            // ... implementation
            res.set_content(R"({"success": true})", "application/json");
        });

        // ═══════════════════════════════════════════════════════════════
        // MCP Operations (require auth in network mode)
        // ═══════════════════════════════════════════════════════════════

        server_->Get("/permissions", [this, auth_check](const httplib::Request& req, httplib::Response& res) {
            if (!auth_check(req)) { res.status = 401; return; }

            auto perms = platform_->check_permissions();
            json j = {
                {"accessibility", perms.accessibility},
                {"screen_recording", perms.screen_recording},
                {"automation", perms.automation}
            };
            res.set_content(j.dump(), "application/json");
        });

        server_->Get("/listApplications", [this, auth_check](const httplib::Request& req, httplib::Response& res) {
            if (!auth_check(req)) { res.status = 401; return; }

            auto apps = platform_->list_applications();
            json j = json::array();
            for (const auto& app : apps) {
                json windows = json::array();
                for (const auto& window : app.windows) {
                    windows.push_back({
                        {"title", window.title},
                        {"bounds", {
                            {"x", window.bounds.x},
                            {"y", window.bounds.y},
                            {"width", window.bounds.width},
                            {"height", window.bounds.height}
                        }},
                        {"is_minimized", window.is_minimized},
                        {"is_main", window.is_main}
                    });
                }

                j.push_back({
                    {"name", app.name},
                    {"bundle_id", app.bundle_id},
                    {"pid", app.pid},
                    {"bounds", {
                        {"x", app.bounds.x},
                        {"y", app.bounds.y},
                        {"width", app.bounds.width},
                        {"height", app.bounds.height}
                    }},
                    {"windows", windows}
                });
            }
            res.set_content(j.dump(), "application/json");
        });

        server_->Post("/focusApplication", [this, auth_check](const httplib::Request& req, httplib::Response& res) {
            if (!auth_check(req)) { res.status = 401; return; }

            try {
                auto j = json::parse(req.body);
                std::string identifier = j["identifier"];
                bool success = platform_->focus_application(identifier);
                res.set_content(success ? "true" : "false", "application/json");
            } catch (const std::exception& e) {
                res.status = 400;
                json err = {{"error", e.what()}};
                res.set_content(err.dump(), "application/json");
            }
        });

        server_->Post("/screenshot", [this, auth_check](const httplib::Request& req, httplib::Response& res) {
            if (!auth_check(req)) { res.status = 401; return; }

            try {
                int padding = 0;
                if (!req.body.empty()) {
                    auto j = json::parse(req.body);
                    if (j.contains("padding")) padding = j["padding"];
                }

                auto* focused = platform_->get_focused_app();
                auto screenshot = platform_->take_screenshot(focused, padding);

                // Base64 encode
                static const char* b64_table = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
                std::string base64;
                // ... base64 encoding implementation

                json j = {{"image", base64}, {"format", "png"}};
                res.set_content(j.dump(), "application/json");
            } catch (const std::exception& e) {
                res.status = 500;
                json err = {{"error", e.what()}};
                res.set_content(err.dump(), "application/json");
            }
        });

        server_->Post("/click", [this, auth_check](const httplib::Request& req, httplib::Response& res) {
            if (!auth_check(req)) { res.status = 401; return; }

            try {
                auto j = json::parse(req.body);
                float x = j["x"];
                float y = j["y"];
                bool right = j.value("button", "left") == "right";

                auto* focused = platform_->get_focused_app();
                if (!focused) {
                    res.status = 400;
                    res.set_content(R"({"error": "No app focused"})", "application/json");
                    return;
                }

                // Convert normalized to absolute
                int abs_x = focused->bounds.x + static_cast<int>(x * focused->bounds.width);
                int abs_y = focused->bounds.y + static_cast<int>(y * focused->bounds.height);

                bool success = platform_->click(abs_x, abs_y, right);
                res.set_content(success ? "true" : "false", "application/json");
            } catch (const std::exception& e) {
                res.status = 400;
                json err = {{"error", e.what()}};
                res.set_content(err.dump(), "application/json");
            }
        });

        server_->Post("/click_absolute", [this, auth_check](const httplib::Request& req, httplib::Response& res) {
            if (!auth_check(req)) { res.status = 401; return; }

            try {
                auto j = json::parse(req.body);
                int x = j["x"];
                int y = j["y"];
                bool right = j.value("button", "left") == "right";

                bool success = platform_->click(x, y, right);
                res.set_content(success ? "true" : "false", "application/json");
            } catch (const std::exception& e) {
                res.status = 400;
                json err = {{"error", e.what()}};
                res.set_content(err.dump(), "application/json");
            }
        });

        server_->Post("/typeText", [this, auth_check](const httplib::Request& req, httplib::Response& res) {
            if (!auth_check(req)) { res.status = 401; return; }

            try {
                auto j = json::parse(req.body);
                std::string text = j["text"];
                bool success = platform_->type_text(text);
                res.set_content(success ? "true" : "false", "application/json");
            } catch (const std::exception& e) {
                res.status = 400;
                json err = {{"error", e.what()}};
                res.set_content(err.dump(), "application/json");
            }
        });

        server_->Post("/pressKey", [this, auth_check](const httplib::Request& req, httplib::Response& res) {
            if (!auth_check(req)) { res.status = 401; return; }

            try {
                auto j = json::parse(req.body);
                std::string key = j["key"];
                bool success = platform_->press_key(key);
                res.set_content(success ? "true" : "false", "application/json");
            } catch (const std::exception& e) {
                res.status = 400;
                json err = {{"error", e.what()}};
                res.set_content(err.dump(), "application/json");
            }
        });

        server_->Get("/getClickableElements", [this, auth_check](const httplib::Request& req, httplib::Response& res) {
            if (!auth_check(req)) { res.status = 401; return; }

            auto* focused = platform_->get_focused_app();
            if (!focused) {
                res.set_content("[]", "application/json");
                return;
            }

            auto elements = platform_->get_clickable_elements(focused->name, true);
            json j = json::array();
            for (const auto& el : elements) {
                j.push_back({
                    {"type", el.type},
                    {"text", el.text},
                    {"role", el.role},
                    {"bounds", {
                        {"x", el.bounds.x},
                        {"y", el.bounds.y},
                        {"width", el.bounds.width},
                        {"height", el.bounds.height}
                    }},
                    {"normalized_position", {
                        {"x", el.normalized_position.x},
                        {"y", el.normalized_position.y}
                    }},
                    {"is_clickable", el.is_clickable},
                    {"is_enabled", el.is_enabled}
                });
            }
            res.set_content(j.dump(), "application/json");
        });

        server_->Get("/getUIElements", [this, auth_check](const httplib::Request& req, httplib::Response& res) {
            if (!auth_check(req)) { res.status = 401; return; }

            auto* focused = platform_->get_focused_app();
            if (!focused) {
                res.set_content("[]", "application/json");
                return;
            }

            auto elements = platform_->get_clickable_elements(focused->name, false);
            json j = json::array();
            for (const auto& el : elements) {
                j.push_back({
                    {"type", el.type},
                    {"text", el.text},
                    {"role", el.role},
                    {"bounds", {
                        {"x", el.bounds.x},
                        {"y", el.bounds.y},
                        {"width", el.bounds.width},
                        {"height", el.bounds.height}
                    }},
                    {"normalized_position", {
                        {"x", el.normalized_position.x},
                        {"y", el.normalized_position.y}
                    }},
                    {"is_clickable", el.is_clickable},
                    {"is_enabled", el.is_enabled}
                });
            }
            res.set_content(j.dump(), "application/json");
        });

        server_->Get("/analyzeWithOCR", [this, auth_check](const httplib::Request& req, httplib::Response& res) {
            if (!auth_check(req)) { res.status = 401; return; }

            try {
                auto screenshot = platform_->take_screenshot();
                auto results = platform_->perform_ocr(screenshot);

                json list = json::array();
                for (const auto& r : results) {
                    list.push_back({
                        {"text", r.text},
                        {"confidence", r.confidence},
                        {"bounds", {
                            {"x", r.bounds.x},
                            {"y", r.bounds.y},
                            {"width", r.bounds.width},
                            {"height", r.bounds.height}
                        }}
                    });
                }
                json payload = {
                    {"width", screenshot.width},
                    {"height", screenshot.height},
                    {"results", list}
                };
                res.set_content(payload.dump(), "application/json");
            } catch (const std::exception& e) {
                res.status = 500;
                json err = {{"error", e.what()}};
                res.set_content(err.dump(), "application/json");
            }
        });

        // ═══════════════════════════════════════════════════════════════
        // High-level helper endpoints
        // ═══════════════════════════════════════════════════════════════

        server_->Post("/openUrl", [this, auth_check](const httplib::Request& req, httplib::Response& res) {
            if (!auth_check(req)) { res.status = 401; return; }

            try {
                auto j = json::parse(req.body);
                std::string url = j["url"];

                // Platform-specific URL open
                #ifdef __APPLE__
                    system(("open \"" + url + "\"").c_str());
                #elif _WIN32
                    system(("start \"\" \"" + url + "\"").c_str());
                #else
                    system(("xdg-open \"" + url + "\"").c_str());
                #endif

                res.set_content(R"({"success": true})", "application/json");
            } catch (const std::exception& e) {
                res.status = 400;
                json err = {{"error", e.what()}};
                res.set_content(err.dump(), "application/json");
            }
        });

        server_->Post("/openApp", [this, auth_check](const httplib::Request& req, httplib::Response& res) {
            if (!auth_check(req)) { res.status = 401; return; }

            try {
                auto j = json::parse(req.body);
                std::string app_name = j["app"];

                // Platform-specific app launch
                #ifdef __APPLE__
                    system(("open -a \"" + app_name + "\"").c_str());
                #elif _WIN32
                    system(("start \"\" \"" + app_name + "\"").c_str());
                #else
                    system((app_name + " &").c_str());
                #endif

                res.set_content(R"({"success": true})", "application/json");
            } catch (const std::exception& e) {
                res.status = 400;
                json err = {{"error", e.what()}};
                res.set_content(err.dump(), "application/json");
            }
        });

        server_->Post("/findAndClick", [this, auth_check](const httplib::Request& req, httplib::Response& res) {
            if (!auth_check(req)) { res.status = 401; return; }

            try {
                auto j = json::parse(req.body);
                std::string text = j["text"];

                // Take screenshot, OCR, find text, click
                auto screenshot = platform_->take_screenshot();
                auto results = platform_->perform_ocr(screenshot);

                for (const auto& r : results) {
                    if (r.text.find(text) != std::string::npos) {
                        // Click center of found text
                        int click_x = r.bounds.x + r.bounds.width / 2;
                        int click_y = r.bounds.y + r.bounds.height / 2;
                        platform_->click(click_x, click_y, false);

                        json result = {{"success", true}, {"clicked_text", r.text}};
                        res.set_content(result.dump(), "application/json");
                        return;
                    }
                }

                json result = {{"success", false}, {"error", "Text not found"}};
                res.set_content(result.dump(), "application/json");
            } catch (const std::exception& e) {
                res.status = 500;
                json err = {{"error", e.what()}};
                res.set_content(err.dump(), "application/json");
            }
        });

        server_->Get("/readScreen", [this, auth_check](const httplib::Request& req, httplib::Response& res) {
            if (!auth_check(req)) { res.status = 401; return; }

            try {
                auto screenshot = platform_->take_screenshot();
                auto results = platform_->perform_ocr(screenshot);

                std::string all_text;
                for (const auto& r : results) {
                    all_text += r.text + "\n";
                }

                json j = {{"text", all_text}};
                res.set_content(j.dump(), "application/json");
            } catch (const std::exception& e) {
                res.status = 500;
                json err = {{"error", e.what()}};
                res.set_content(err.dump(), "application/json");
            }
        });
    }

    Agent* agent_;
    Platform* platform_;
    AgentConfig config_;
    std::unique_ptr<httplib::Server> server_;
    std::thread server_thread_;
    std::atomic<bool> running_;
};

} // namespace mcp_eyes
