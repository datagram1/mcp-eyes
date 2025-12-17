/**
 * Security Module Implementation
 *
 * Protected paths, command filtering, and exfiltration prevention.
 */

#include "security.h"
#include "../core/logger.h"
#include <algorithm>
#include <fstream>
#include <sstream>
#include <cstdlib>

namespace security {

// ============================================================================
// ProtectedPaths Implementation
// ============================================================================

ProtectedPaths& ProtectedPaths::getInstance()
{
    static ProtectedPaths instance;
    return instance;
}

ProtectedPaths::ProtectedPaths()
{
    // Initialize with default protected paths
    auto defaults = getDefaultProtectedPaths();

    for (const auto& path : defaults)
    {
        if (path.find('*') != std::string::npos || path.find('?') != std::string::npos)
        {
            // Convert glob to regex
            std::string regexStr = path;

            // Escape special regex chars first
            for (size_t i = 0; i < regexStr.length(); i++)
            {
                char c = regexStr[i];
                if (c == '.' || c == '+' || c == '^' || c == '$' ||
                    c == '(' || c == ')' || c == '[' || c == ']' ||
                    c == '{' || c == '}' || c == '|' || c == '\\')
                {
                    regexStr.insert(i, "\\");
                    i++;
                }
            }

            // Convert glob wildcards
            size_t pos = 0;
            while ((pos = regexStr.find("\\*", pos)) != std::string::npos)
            {
                regexStr.replace(pos, 2, ".*");
                pos += 2;
            }
            pos = 0;
            while ((pos = regexStr.find("\\?", pos)) != std::string::npos)
            {
                regexStr.replace(pos, 2, ".");
                pos += 1;
            }

            try
            {
                m_regexPatterns.emplace_back(regexStr, std::regex::icase);
                m_patternStrings.push_back(path);
            }
            catch (...)
            {
                // Invalid regex, skip
            }
        }
        else if (path.back() == '/')
        {
            m_prefixPaths.push_back(normalizePath(path));
        }
        else
        {
            m_exactPaths.push_back(normalizePath(path));
            // Also add as prefix for directory protection
            m_prefixPaths.push_back(normalizePath(path) + "/");
        }
    }
}

std::string ProtectedPaths::normalizePath(const std::string& path) const
{
    std::string normalized = path;

    // Expand ~ to home directory
    if (!normalized.empty() && normalized[0] == '~')
    {
        const char* home = getenv("HOME");
        if (home)
        {
            normalized = std::string(home) + normalized.substr(1);
        }
    }

    // Remove trailing slashes for consistency (except root)
    while (normalized.size() > 1 && normalized.back() == '/')
    {
        normalized.pop_back();
    }

    return normalized;
}

bool ProtectedPaths::matchesExact(const std::string& path) const
{
    std::string normalized = normalizePath(path);
    for (const auto& p : m_exactPaths)
    {
        if (normalized == p)
        {
            return true;
        }
    }
    return false;
}

bool ProtectedPaths::matchesPrefix(const std::string& path) const
{
    std::string normalized = normalizePath(path);
    for (const auto& prefix : m_prefixPaths)
    {
        if (normalized.find(prefix) == 0)
        {
            return true;
        }
    }
    return false;
}

bool ProtectedPaths::matchesRegex(const std::string& path) const
{
    std::string normalized = normalizePath(path);
    for (const auto& pattern : m_regexPatterns)
    {
        if (std::regex_search(normalized, pattern))
        {
            return true;
        }
    }
    return false;
}

SecurityCheckResult ProtectedPaths::checkPath(const std::string& path) const
{
    std::string normalized = normalizePath(path);

    // Check exact matches
    if (matchesExact(normalized))
    {
        return SecurityCheckResult::deny("Access to protected file blocked", normalized);
    }

    // Check prefix matches (directory protection)
    if (matchesPrefix(normalized))
    {
        return SecurityCheckResult::deny("Access to protected directory blocked", normalized);
    }

    // Check regex patterns
    if (matchesRegex(normalized))
    {
        return SecurityCheckResult::deny("Access to protected path pattern blocked", normalized);
    }

    return SecurityCheckResult::allow();
}

bool ProtectedPaths::shouldHidePath(const std::string& path) const
{
    auto result = checkPath(path);
    return !result.allowed;
}

void ProtectedPaths::addProtectedPattern(const std::string& pattern)
{
    if (pattern.find('*') != std::string::npos)
    {
        // Glob pattern
        std::string regexStr = pattern;
        // Simple glob to regex conversion
        for (size_t i = 0; i < regexStr.length(); i++)
        {
            if (regexStr[i] == '.')
            {
                regexStr.insert(i, "\\");
                i++;
            }
        }
        size_t pos = 0;
        while ((pos = regexStr.find("*", pos)) != std::string::npos)
        {
            regexStr.replace(pos, 1, ".*");
            pos += 2;
        }
        try
        {
            m_regexPatterns.emplace_back(regexStr, std::regex::icase);
            m_patternStrings.push_back(pattern);
        }
        catch (...) {}
    }
    else
    {
        m_exactPaths.push_back(normalizePath(pattern));
    }
}

void ProtectedPaths::loadConfig(const std::string& configPath)
{
    std::ifstream file(configPath);
    if (!file.is_open()) return;

    std::string line;
    while (std::getline(file, line))
    {
        // Skip comments and empty lines
        if (line.empty() || line[0] == '#') continue;

        // Trim whitespace
        size_t start = line.find_first_not_of(" \t");
        size_t end = line.find_last_not_of(" \t");
        if (start != std::string::npos)
        {
            line = line.substr(start, end - start + 1);
            addProtectedPattern(line);
        }
    }
}

// ============================================================================
// CommandFilter Implementation
// ============================================================================

CommandFilter& CommandFilter::getInstance()
{
    static CommandFilter instance;
    return instance;
}

CommandFilter::CommandFilter()
{
    // Initialize with default blocked commands
    m_blockedCommands = getDefaultBlockedCommands();

    // Initialize exfiltration patterns
    auto exfilPatterns = getExfiltrationPatterns();
    for (const auto& pattern : exfilPatterns)
    {
        try
        {
            m_blockedPatterns.emplace_back(pattern, std::regex::icase);
            m_patternStrings.push_back(pattern);
        }
        catch (...)
        {
            // Invalid regex, skip
        }
    }
}

bool CommandFilter::isCredentialDumpCommand(const std::string& command) const
{
    // Check for keychain/credential dump commands
    static const std::vector<std::string> dumpCommands = {
        "security find-generic-password",
        "security find-internet-password",
        "security dump-keychain",
        "security export",
        "dscl . -read",
        "defaults read com.apple.loginwindow",
        "hashdump",
        "mimikatz",
        "pwdump",
        "secretsdump",
        "chainbreaker",
        "keychaindump"
    };

    std::string lowerCmd = command;
    std::transform(lowerCmd.begin(), lowerCmd.end(), lowerCmd.begin(), ::tolower);

    for (const auto& dumpCmd : dumpCommands)
    {
        if (lowerCmd.find(dumpCmd) != std::string::npos)
        {
            return true;
        }
    }

    return false;
}

bool CommandFilter::isExfiltrationAttempt(const std::string& command) const
{
    for (const auto& pattern : m_blockedPatterns)
    {
        if (std::regex_search(command, pattern))
        {
            return true;
        }
    }
    return false;
}

bool CommandFilter::targetsProtectedPath(const std::string& command) const
{
    auto& protectedPaths = ProtectedPaths::getInstance();

    // Extract potential file paths from command
    // Look for patterns like absolute paths or relative paths
    std::regex pathRegex(R"((/[^\s'"]+|~/[^\s'"]+|\./[^\s'"]+))");
    std::sregex_iterator iter(command.begin(), command.end(), pathRegex);
    std::sregex_iterator end;

    while (iter != end)
    {
        std::string path = (*iter)[0].str();
        auto result = protectedPaths.checkPath(path);
        if (!result.allowed)
        {
            return true;
        }
        ++iter;
    }

    return false;
}

SecurityCheckResult CommandFilter::checkCommand(const std::string& command) const
{
    // Check for credential dump commands
    if (isCredentialDumpCommand(command))
    {
        return SecurityCheckResult::deny(
            "Credential dump command blocked",
            "credential_dump_detection"
        );
    }

    // Check for exfiltration attempts
    if (isExfiltrationAttempt(command))
    {
        return SecurityCheckResult::deny(
            "Potential data exfiltration blocked",
            "exfiltration_pattern_match"
        );
    }

    // Check if command targets protected paths
    if (targetsProtectedPath(command))
    {
        return SecurityCheckResult::deny(
            "Command targets protected path",
            "protected_path_in_command"
        );
    }

    // Check exact blocked commands
    std::string lowerCmd = command;
    std::transform(lowerCmd.begin(), lowerCmd.end(), lowerCmd.begin(), ::tolower);

    for (const auto& blocked : m_blockedCommands)
    {
        std::string lowerBlocked = blocked;
        std::transform(lowerBlocked.begin(), lowerBlocked.end(), lowerBlocked.begin(), ::tolower);

        if (lowerCmd.find(lowerBlocked) != std::string::npos)
        {
            return SecurityCheckResult::deny(
                "Blocked command pattern detected",
                blocked
            );
        }
    }

    return SecurityCheckResult::allow();
}

void CommandFilter::addBlockedPattern(const std::string& pattern)
{
    try
    {
        m_blockedPatterns.emplace_back(pattern, std::regex::icase);
        m_patternStrings.push_back(pattern);
    }
    catch (...) {}
}

void CommandFilter::loadConfig(const std::string& configPath)
{
    std::ifstream file(configPath);
    if (!file.is_open()) return;

    std::string line;
    while (std::getline(file, line))
    {
        if (line.empty() || line[0] == '#') continue;

        size_t start = line.find_first_not_of(" \t");
        size_t end = line.find_last_not_of(" \t");
        if (start != std::string::npos)
        {
            line = line.substr(start, end - start + 1);
            addBlockedPattern(line);
        }
    }
}

// ============================================================================
// SecurityLogger Implementation
// ============================================================================

SecurityLogger& SecurityLogger::getInstance()
{
    static SecurityLogger instance;
    return instance;
}

void SecurityLogger::logBlockedFileAccess(const std::string& path, const std::string& reason)
{
    std::string msg = "[SECURITY] Blocked file access: " + path + " - " + reason;
    ScreenControl::Logger::warn(msg);
}

void SecurityLogger::logBlockedCommand(const std::string& command, const std::string& reason)
{
    // Truncate command for logging (avoid logging sensitive data)
    std::string truncated = command.substr(0, std::min(command.size(), size_t(100)));
    if (command.size() > 100) truncated += "...";

    std::string msg = "[SECURITY] Blocked command: " + truncated + " - " + reason;
    ScreenControl::Logger::warn(msg);
}

void SecurityLogger::logSecurityEvent(const std::string& event, const std::string& details)
{
    std::string msg = "[SECURITY] " + event + ": " + details;
    ScreenControl::Logger::info(msg);
}

} // namespace security
