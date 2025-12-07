/**
 * Shell Tools
 *
 * Command execution using fork/exec - matches macOS/Windows API.
 */

#pragma once

#include <string>
#include "../libs/json.hpp"

namespace ScreenControl
{

class ShellTools
{
public:
    static nlohmann::json exec(const std::string& command, const std::string& cwd, int timeout);
    static nlohmann::json startSession(const std::string& command, const std::string& cwd);
    static nlohmann::json sendInput(const std::string& sessionId, const std::string& input);
    static nlohmann::json stopSession(const std::string& sessionId, const std::string& signal);
};

} // namespace ScreenControl
