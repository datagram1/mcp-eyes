/**
 * Filesystem Tools
 *
 * File operations using POSIX APIs - matches macOS/Windows API.
 */

#pragma once

#include <string>
#include "../libs/json.hpp"

namespace ScreenControl
{

class FilesystemTools
{
public:
    static nlohmann::json list(const std::string& path, bool recursive, int maxDepth);
    static nlohmann::json read(const std::string& path, size_t maxBytes);
    static nlohmann::json readRange(const std::string& path, int startLine, int endLine);
    static nlohmann::json write(const std::string& path, const std::string& content,
                                const std::string& mode, bool createDirs);
    static nlohmann::json remove(const std::string& path, bool recursive);
    static nlohmann::json move(const std::string& source, const std::string& destination);
    static nlohmann::json search(const std::string& basePath, const std::string& glob, int maxResults);
    static nlohmann::json grep(const std::string& basePath, const std::string& pattern,
                               const std::string& glob, int maxMatches);
    static nlohmann::json patch(const std::string& path, const nlohmann::json& operations, bool dryRun);
};

} // namespace ScreenControl
