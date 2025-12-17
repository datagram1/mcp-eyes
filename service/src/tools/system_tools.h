/**
 * System Tools
 *
 * Cross-platform system utilities (clipboard, system info, wait).
 */

#pragma once

#include "platform.h"
#include "../libs/json.hpp"
#include <string>

namespace ScreenControl
{

class SystemTools
{
public:
    // Get system information (OS, CPU, memory, hostname)
    static nlohmann::json getSystemInfo();

    // Read from clipboard
    static nlohmann::json clipboardRead();

    // Write to clipboard
    static nlohmann::json clipboardWrite(const std::string& text);

    // Wait for specified milliseconds
    static nlohmann::json wait(int milliseconds);

    // Get current time
    static nlohmann::json getCurrentTime();

    // Get environment variable
    static nlohmann::json getEnv(const std::string& name);

    // Set environment variable
    static nlohmann::json setEnv(const std::string& name, const std::string& value);
};

} // namespace ScreenControl
