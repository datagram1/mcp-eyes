/**
 * Shell Tools
 *
 * Cross-platform command execution with security hardening.
 * Includes blocking of credential dump commands and exfiltration patterns.
 */

#pragma once

#include "platform.h"
#include "../libs/json.hpp"
#include <string>
#include <vector>

namespace ScreenControl
{

// Command security validation
namespace CommandSecurity
{
    // Check if a command is blocked (credential access, exfiltration, etc.)
    bool isBlocked(const std::string& command);

    // Get list of blocked patterns (for logging/debugging)
    std::vector<std::string> getBlockedPatterns();

    // Add custom blocked pattern (from security.json config)
    void addBlockedPattern(const std::string& pattern);

    // Clear custom patterns (for testing)
    void clearCustomPatterns();

    // Detect exfiltration patterns in command
    bool detectsExfiltration(const std::string& command);
}

class ShellTools
{
public:
    // Execute a command and wait for completion
    static nlohmann::json exec(const std::string& command, const std::string& cwd = "",
                               int timeout = 30);

    // Start an interactive shell session
    static nlohmann::json startSession(const std::string& command = "",
                                        const std::string& cwd = "");

    // Send input to a running session
    static nlohmann::json sendInput(const std::string& sessionId, const std::string& input);

    // Stop a running session
    static nlohmann::json stopSession(const std::string& sessionId,
                                       const std::string& signal = "TERM");

    // Read output from a session
    static nlohmann::json readOutput(const std::string& sessionId);

    // List active sessions
    static nlohmann::json listSessions();
};

} // namespace ScreenControl
