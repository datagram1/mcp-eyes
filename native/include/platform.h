#pragma once

/**
 * Platform abstraction layer
 * Each platform implements these interfaces
 */

#include "mcp_eyes.h"
#include <memory>

namespace mcp_eyes {

/**
 * Abstract platform interface
 * Implemented by platform_macos.mm, platform_windows.cpp, platform_linux.cpp
 */
class Platform {
public:
    virtual ~Platform() = default;

    // Factory
    static std::unique_ptr<Platform> create();

    // Platform info
    virtual std::string os_name() const = 0;
    virtual std::string os_version() const = 0;
    virtual std::string arch() const = 0;
    virtual std::string hostname() const = 0;

    // Permissions
    virtual Permissions check_permissions() const = 0;
    virtual bool request_accessibility_permission() = 0;
    virtual bool request_screen_recording_permission() = 0;

    // Application management
    virtual std::vector<AppInfo> list_applications() const = 0;
    virtual bool focus_application(const std::string& identifier) = 0;
    virtual AppInfo* get_focused_app() = 0;

    // Screen capture
    virtual Screenshot take_screenshot(const AppInfo* app = nullptr, int padding = 0) = 0;

    // Input simulation
    virtual bool click(int x, int y, bool right_button = false) = 0;
    virtual bool move_mouse(int x, int y) = 0;
    virtual bool type_text(const std::string& text) = 0;
    virtual bool press_key(const std::string& key) = 0;

    // Accessibility / UI elements
    virtual std::vector<UIElement> get_clickable_elements(const std::string& app_name) = 0;

    // OCR
    virtual std::vector<OCRResult> perform_ocr(const Screenshot& screenshot) = 0;
};

/**
 * Service discovery (mDNS/Bonjour)
 */
class Discovery {
public:
    virtual ~Discovery() = default;

    static std::unique_ptr<Discovery> create();

    virtual bool start_advertising(const AgentStatus& status) = 0;
    virtual void stop_advertising() = 0;
    virtual bool is_advertising() const = 0;
};

} // namespace mcp_eyes
