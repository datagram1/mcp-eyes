/**
 * Security Module
 *
 * Protected paths, command filtering, and exfiltration prevention.
 * Prevents AI/agent from accessing or leaking sensitive data.
 */

#ifndef SCREENCONTROL_SECURITY_H
#define SCREENCONTROL_SECURITY_H

#include "platform.h"
#include <string>
#include <vector>
#include <set>
#include <regex>

namespace security {

/**
 * Security check result
 */
struct SecurityCheckResult {
    bool allowed;
    std::string reason;
    std::string matchedRule;

    static SecurityCheckResult allow() {
        return {true, "", ""};
    }

    static SecurityCheckResult deny(const std::string& reason, const std::string& rule = "") {
        return {false, reason, rule};
    }
};

/**
 * Protected Paths Module
 *
 * Blocks access to sensitive files and directories.
 */
class ProtectedPaths {
public:
    static ProtectedPaths& getInstance();

    // Check if a path is protected (blocked)
    SecurityCheckResult checkPath(const std::string& path) const;

    // Check if path should be hidden from directory listings
    bool shouldHidePath(const std::string& path) const;

    // Add custom protected path pattern
    void addProtectedPattern(const std::string& pattern);

    // Load additional patterns from config file
    void loadConfig(const std::string& configPath);

private:
    ProtectedPaths();

    std::vector<std::string> m_exactPaths;      // Exact path matches
    std::vector<std::string> m_prefixPaths;     // Path prefix matches
    std::vector<std::regex> m_regexPatterns;    // Regex patterns
    std::vector<std::string> m_patternStrings;  // Original pattern strings for logging

    bool matchesExact(const std::string& path) const;
    bool matchesPrefix(const std::string& path) const;
    bool matchesRegex(const std::string& path) const;
    std::string normalizePath(const std::string& path) const;
};

/**
 * Command Filter Module
 *
 * Blocks dangerous shell commands and exfiltration attempts.
 */
class CommandFilter {
public:
    static CommandFilter& getInstance();

    // Check if a command is allowed
    SecurityCheckResult checkCommand(const std::string& command) const;

    // Add custom blocked command pattern
    void addBlockedPattern(const std::string& pattern);

    // Load additional patterns from config
    void loadConfig(const std::string& configPath);

private:
    CommandFilter();

    std::vector<std::string> m_blockedCommands;   // Exact command names
    std::vector<std::regex> m_blockedPatterns;    // Regex patterns
    std::vector<std::string> m_patternStrings;    // Original patterns for logging

    // Check for credential/keychain dump commands
    bool isCredentialDumpCommand(const std::string& command) const;

    // Check for exfiltration patterns (curl upload, base64, etc.)
    bool isExfiltrationAttempt(const std::string& command) const;

    // Check for commands targeting protected paths
    bool targetsProtectedPath(const std::string& command) const;
};

/**
 * Security Logger
 *
 * Logs all security events for audit trail.
 */
class SecurityLogger {
public:
    static SecurityLogger& getInstance();

    void logBlockedFileAccess(const std::string& path, const std::string& reason);
    void logBlockedCommand(const std::string& command, const std::string& reason);
    void logSecurityEvent(const std::string& event, const std::string& details);

private:
    SecurityLogger() = default;
};

// ============================================================================
// Default Protected Paths (Platform-specific)
// ============================================================================

// These paths are ALWAYS protected and cannot be overridden
inline std::vector<std::string> getDefaultProtectedPaths() {
    return {
        // Credential storage
        CREDENTIAL_FILE_PATH,
        CREDENTIAL_KEY_PATH,
        std::string(SERVICE_CONFIG_DIR) + "/credentials",
        std::string(SERVICE_CONFIG_DIR) + "/.credentials",

        // macOS Keychain (can't be accessed directly anyway, but block attempts)
#if PLATFORM_MACOS
        "/Library/Keychains",
        "~/Library/Keychains",
        "/System/Library/Keychains",
#endif

        // SSH keys
        "~/.ssh",
        "/etc/ssh/ssh_host_*",

        // GPG keys
        "~/.gnupg",

        // Browser credentials
        "~/Library/Application Support/Google/Chrome/Default/Login Data",
        "~/Library/Application Support/Firefox/Profiles/*/logins.json",
        "~/Library/Safari/Passwords",

        // Password managers
        "~/.password-store",
        "~/Library/Application Support/1Password",

        // AWS/Cloud credentials
        "~/.aws/credentials",
        "~/.azure/credentials",
        "~/.config/gcloud/credentials.db",

        // Environment files with secrets
        ".env",
        ".env.local",
        ".env.production",
        "*.env",

        // Private keys
        "*.pem",
        "*.key",
        "*_rsa",
        "*_dsa",
        "*_ecdsa",
        "*_ed25519",

        // System password files
        "/etc/shadow",
        "/etc/master.passwd",
    };
}

// ============================================================================
// Default Blocked Commands
// ============================================================================

inline std::vector<std::string> getDefaultBlockedCommands() {
    return {
        // Credential dumping tools
        "security find-generic-password",
        "security find-internet-password",
        "security dump-keychain",
        "security export",
        "dscl . -read /Users/",
        "defaults read com.apple.loginwindow",

        // Password/hash extraction
        "hashdump",
        "mimikatz",
        "pwdump",
        "fgdump",
        "secretsdump",

        // Keychain tools
        "chainbreaker",
        "keychaindump",

        // Network exfiltration patterns (with sensitive data)
        // These are regex patterns checked against commands
    };
}

// ============================================================================
// Exfiltration Detection Patterns
// ============================================================================

inline std::vector<std::string> getExfiltrationPatterns() {
    return {
        // Upload commands with credential-like arguments
        R"(curl.*(-d|--data|--data-binary|--data-urlencode|--upload-file).*(/Library/Application Support/ScreenControl|\.ssh|\.gnupg|\.aws|credentials|\.key|\.pem))",
        R"(wget.*--post-file.*(/Library/Application Support/ScreenControl|\.ssh|\.gnupg|\.aws|credentials|\.key|\.pem))",

        // Base64 encoding of credential files
        R"(base64.*(/Library/Application Support/ScreenControl|\.ssh|\.gnupg|\.aws|credentials|\.key|\.pem))",
        R"(openssl.*enc.*(/Library/Application Support/ScreenControl|\.ssh|\.gnupg|\.aws|credentials))",

        // Archive commands with credential paths
        R"((tar|zip|gzip|7z).*(/Library/Application Support/ScreenControl|\.ssh|\.gnupg|\.aws|credentials))",

        // Cat/read with redirect (piping credentials somewhere)
        R"(cat.*(/Library/Application Support/ScreenControl|\.ssh/id_|\.gnupg/|\.aws/credentials).*\|)",

        // Network transfer with credential paths
        R"((nc|netcat|ncat|socat).*(/Library/Application Support/ScreenControl|\.ssh|credentials))",
        R"(rsync.*(/Library/Application Support/ScreenControl|\.ssh|\.gnupg|\.aws/credentials).*:)",
        R"(scp.*(/Library/Application Support/ScreenControl|\.ssh/id_|\.aws/credentials))",
    };
}

} // namespace security

#endif // SCREENCONTROL_SECURITY_H
