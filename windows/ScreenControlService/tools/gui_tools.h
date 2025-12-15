/**
 * GUI Tools
 *
 * Screenshot, click, keyboard - matches macOS MCPEyes.app API.
 */

#pragma once

#include <windows.h>
#include <string>
#include <vector>
#include "../libs/json.hpp"

namespace ScreenControl
{

class GuiTools
{
public:
    // Screenshot - returns base64 encoded image
    static nlohmann::json screenshot();

    // Mouse actions
    static nlohmann::json click(int x, int y);
    static nlohmann::json doubleClick(int x, int y);
    static nlohmann::json rightClick(int x, int y);
    static nlohmann::json scroll(int deltaX, int deltaY);
    static nlohmann::json drag(int startX, int startY, int endX, int endY);
    static nlohmann::json moveMouse(int x, int y);
    static nlohmann::json getCursorPosition();

    // Keyboard actions
    static nlohmann::json pressKey(const std::string& key, const std::vector<std::string>& modifiers);
    static nlohmann::json typeText(const std::string& text);

private:
    // Convert normalized (0-1) coordinates to screen pixels
    static POINT normalizedToScreen(double x, double y);

    // Get virtual key code from key name
    static WORD getVirtualKeyCode(const std::string& key);

    // Base64 encode binary data
    static std::string base64Encode(const std::vector<BYTE>& data);
};

} // namespace ScreenControl
