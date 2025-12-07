/**
 * GUI Tools
 *
 * Screenshot capture and input simulation for X11/Wayland.
 */

#pragma once

#include <string>
#include <vector>
#include "../libs/json.hpp"

namespace ScreenControl
{

class GuiTools
{
public:
    // Screenshot capture
    static nlohmann::json screenshot(int quality = 80);

    // Mouse operations
    static nlohmann::json click(int x, int y, const std::string& button = "left", int clicks = 1);
    static nlohmann::json moveMouse(int x, int y);
    static nlohmann::json scroll(int x, int y, int deltaX, int deltaY);

    // Keyboard operations
    static nlohmann::json typeText(const std::string& text);
    static nlohmann::json pressKey(const std::string& key, const std::vector<std::string>& modifiers = {});

    // Cursor position
    static nlohmann::json getCursorPosition();

private:
    static bool isWayland();
    static nlohmann::json screenshotX11(int quality);
    static nlohmann::json screenshotWayland(int quality);
    static std::string encodeBase64(const unsigned char* data, size_t length);
};

} // namespace ScreenControl
