/**
 * System Tools Header
 *
 * Windows-specific system utilities: system info, clipboard, wait.
 */

#pragma once

#include <string>
#include "../libs/json.hpp"

namespace ScreenControl
{

class SystemTools
{
public:
    /**
     * Get system information (OS, CPU, memory, hostname, uptime)
     */
    static nlohmann::json getSystemInfo();

    /**
     * Read content from Windows clipboard
     */
    static nlohmann::json clipboardRead();

    /**
     * Write content to Windows clipboard
     */
    static nlohmann::json clipboardWrite(const std::string& text);

    /**
     * Wait for specified milliseconds
     */
    static nlohmann::json wait(int milliseconds);

    /**
     * Get list of all open windows with titles and bounds
     */
    static nlohmann::json getWindowList();
};

} // namespace ScreenControl
