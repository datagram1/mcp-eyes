#pragma once

/**
 * MCP-Eyes Native Library
 * Cross-platform screen control agent for LLMs
 */

#include <string>
#include <vector>
#include <functional>
#include <memory>

namespace mcp_eyes {

// Version info
constexpr const char* VERSION = "2.0.0";

// Forward declarations
class Platform;
class HttpServer;
class Config;

/**
 * Application info with window bounds
 */
struct AppInfo {
    std::string name;
    std::string bundle_id;  // macOS bundle ID, Windows AUMID, Linux .desktop
    int pid;
    struct {
        int x, y, width, height;
    } bounds;
};

/**
 * Clickable UI element
 */
struct UIElement {
    std::string type;       // button, text, input, link, etc.
    std::string text;
    std::string role;
    struct {
        int x, y, width, height;
    } bounds;
    struct {
        float x, y;         // 0.0 - 1.0 normalized
    } normalized_position;
    bool is_clickable;
    bool is_enabled;
};

/**
 * OCR result
 */
struct OCRResult {
    std::string text;
    float confidence;
    struct {
        int x, y, width, height;
    } bounds;
};

/**
 * Permission status
 */
struct Permissions {
    bool accessibility;
    bool screen_recording;
    bool automation;
};

/**
 * Agent configuration
 */
struct AgentConfig {
    std::string name;               // Friendly name for this agent
    std::string network_mode;       // "localhost", "lan", "wan"
    int port;
    bool tls_enabled;
    std::string api_key;
    std::vector<std::string> allowed_ips;
};

/**
 * Status info for discovery
 */
struct AgentStatus {
    std::string name;
    std::string version;
    std::string os;
    std::string os_version;
    std::string arch;
    std::string hostname;
    int port;
    bool tls;
    int64_t uptime_seconds;
    Permissions permissions;
};

/**
 * Screenshot result
 */
struct Screenshot {
    std::vector<uint8_t> png_data;
    int width;
    int height;
};

/**
 * Main agent class
 */
class Agent {
public:
    Agent();
    ~Agent();

    // Configuration
    bool load_config(const std::string& path = "");
    bool save_config(const std::string& path = "");
    AgentConfig& config();
    const AgentConfig& config() const;

    // Server control
    bool start();
    void stop();
    bool is_running() const;

    // Status
    AgentStatus status() const;
    Permissions check_permissions() const;

    // Platform operations (exposed for direct use if needed)
    std::vector<AppInfo> list_applications() const;
    bool focus_application(const std::string& identifier);
    Screenshot take_screenshot(int padding = 0);
    bool click(float x, float y, bool right_button = false);
    bool type_text(const std::string& text);
    bool press_key(const std::string& key);
    std::vector<UIElement> get_clickable_elements();
    std::vector<OCRResult> analyze_with_ocr();

private:
    class Impl;
    std::unique_ptr<Impl> impl_;
};

} // namespace mcp_eyes
