/**
 * UI Automation
 *
 * Window management and UI element discovery using X11.
 */

#pragma once

#include <string>
#include "../libs/json.hpp"

namespace ScreenControl
{

class UIAutomation
{
public:
    // Get clickable elements (limited on X11 without AT-SPI)
    static nlohmann::json getClickableElements();

    // Get all UI elements
    static nlohmann::json getUIElements();

    // Get window list
    static nlohmann::json getWindowList();

    // Focus a window by title or window ID
    static nlohmann::json focusWindow(const std::string& title, unsigned long windowId);

    // Minimize/maximize/close window
    static nlohmann::json minimizeWindow(unsigned long windowId);
    static nlohmann::json maximizeWindow(unsigned long windowId);
    static nlohmann::json closeWindow(unsigned long windowId);

    // Get active window info
    static nlohmann::json getActiveWindow();
};

} // namespace ScreenControl
