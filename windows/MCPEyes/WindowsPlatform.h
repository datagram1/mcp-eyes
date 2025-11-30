#pragma once

#include "../../native/include/platform.h"
#include <windows.h>
#include <string>
#include <vector>
#include <optional>

namespace mcp_eyes {

/**
 * Windows Platform Implementation
 * Uses Win32 API, UI Automation, GDI for screenshots
 */
class WindowsPlatform : public Platform {
public:
    WindowsPlatform();
    ~WindowsPlatform();

    // Platform info
    std::string os_name() const override;
    std::string os_version() const override;
    std::string arch() const override;
    std::string hostname() const override;

    // Permissions
    Permissions check_permissions() const override;
    bool request_accessibility_permission() override;
    bool request_screen_recording_permission() override;

    // Application management
    std::vector<AppInfo> list_applications() const override;
    bool focus_application(const std::string& identifier) override;
    AppInfo* get_focused_app() override;

    // Screen capture
    Screenshot take_screenshot(const AppInfo* app = nullptr, int padding = 0) override;

    // Input simulation
    bool click(int x, int y, bool right_button = false) override;
    bool move_mouse(int x, int y) override;
    bool type_text(const std::string& text) override;
    bool press_key(const std::string& key) override;

    // Accessibility / UI elements
    std::vector<UIElement> get_clickable_elements(const std::string& app_name) override;

    // OCR
    std::vector<OCRResult> perform_ocr(const Screenshot& screenshot) override;

private:
    struct WindowInfo {
        HWND hwnd;
        DWORD pid;
        std::string title;
        std::string processName;
        RECT bounds;
    };

    std::optional<AppInfo> focused_app_;
    HWND focused_hwnd_;

    // Helper methods
    std::vector<WindowInfo> enumerate_windows() const;
    WindowInfo find_window_by_identifier(const std::string& identifier) const;
    std::string get_process_name(DWORD pid) const;
    RECT get_window_bounds(HWND hwnd) const;
    bool is_window_visible(HWND hwnd) const;
    bool is_main_window(HWND hwnd) const;
    
    // Screenshot helpers
    std::vector<uint8_t> capture_screen_to_png() const;
    std::vector<uint8_t> capture_window_to_png(HWND hwnd) const;
    
    // Coordinate conversion
    void convert_to_absolute(int& x, int& y) const;
};

} // namespace mcp_eyes

