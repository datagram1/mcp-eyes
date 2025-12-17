/**
 * Filesystem Tools
 *
 * Cross-platform file operations with security hardening.
 * Includes protected paths to prevent credential exfiltration.
 */

#pragma once

#include "platform.h"
#include "../libs/json.hpp"
#include <string>
#include <vector>

namespace ScreenControl
{

// Protected paths that cannot be read/listed (security hardening)
namespace ProtectedPaths
{
    // Check if a path is protected (credential files, keychains, etc.)
    bool isProtected(const std::string& path);

    // Get list of protected patterns (for logging/debugging)
    std::vector<std::string> getProtectedPatterns();

    // Add custom protected path (from security.json config)
    void addProtectedPattern(const std::string& pattern);

    // Clear custom patterns (for testing)
    void clearCustomPatterns();
}

class FilesystemTools
{
public:
    // List directory contents
    static nlohmann::json list(const std::string& path, bool recursive = false, int maxDepth = 1);

    // Read file contents
    static nlohmann::json read(const std::string& path, size_t maxBytes = 1048576);

    // Read specific line range
    static nlohmann::json readRange(const std::string& path, int startLine, int endLine = -1);

    // Write file contents
    static nlohmann::json write(const std::string& path, const std::string& content,
                                const std::string& mode = "overwrite", bool createDirs = false);

    // Delete file or directory
    static nlohmann::json remove(const std::string& path, bool recursive = false);

    // Move/rename file or directory
    static nlohmann::json move(const std::string& source, const std::string& destination);

    // Search for files using glob pattern
    static nlohmann::json search(const std::string& basePath, const std::string& glob, int maxResults = 100);

    // Search file contents using regex pattern
    static nlohmann::json grep(const std::string& basePath, const std::string& pattern,
                               const std::string& glob = "*", int maxMatches = 100);

    // Apply patch operations to a file
    static nlohmann::json patch(const std::string& path, const nlohmann::json& operations, bool dryRun = false);

private:
    // Internal glob matching (cross-platform)
    static bool matchGlob(const std::string& pattern, const std::string& text);
};

} // namespace ScreenControl
