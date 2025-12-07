/**
 * UI Automation Tools
 *
 * Windows UI Automation for element discovery - matches macOS Accessibility API.
 */

#pragma once

#include <windows.h>
#include <string>
#include "../libs/json.hpp"

namespace ScreenControl
{

class UIAutomation
{
public:
    // Get clickable elements (buttons, links, etc.)
    static nlohmann::json getClickableElements();

    // Get all UI elements
    static nlohmann::json getUIElements();

    // Get window list
    static nlohmann::json getWindowList();

    // Focus a window by title or handle
    static nlohmann::json focusWindow(const std::string& title, HWND hwnd);

    // Minimize/maximize/close window
    static nlohmann::json minimizeWindow(HWND hwnd);
    static nlohmann::json maximizeWindow(HWND hwnd);
    static nlohmann::json closeWindow(HWND hwnd);

    // Get active window info
    static nlohmann::json getActiveWindow();

private:
    // Window enumeration callback
    static BOOL CALLBACK EnumWindowsProc(HWND hwnd, LPARAM lParam);
};

} // namespace ScreenControl
