/**
 * System Tools
 *
 * System information, clipboard, and utility functions.
 * Matches macOS/Windows API.
 */

#pragma once

#include <string>
#include "../libs/json.hpp"

namespace ScreenControl
{

class SystemTools
{
public:
    // System information
    static nlohmann::json getSystemInfo();

    // Clipboard operations
    static nlohmann::json clipboardRead();
    static nlohmann::json clipboardWrite(const std::string& text);

    // Utility
    static nlohmann::json wait(int milliseconds);
};

} // namespace ScreenControl
