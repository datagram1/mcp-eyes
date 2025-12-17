/**
 * Filesystem Tools Implementation
 *
 * Cross-platform using C++17 filesystem with protected paths security.
 */

#include "filesystem_tools.h"
#include "../core/logger.h"
#include "security.h"
#include <filesystem>
#include <fstream>
#include <sstream>
#include <regex>
#include <algorithm>
#include <mutex>

#if PLATFORM_WINDOWS
    #include <windows.h>
    #include <shlwapi.h>
    #pragma comment(lib, "shlwapi.lib")
#else
    #include <fnmatch.h>
    #include <glob.h>
#endif

namespace fs = std::filesystem;
using json = nlohmann::json;

namespace ScreenControl
{

// Use centralized security module for protected paths
namespace ProtectedPaths
{
    bool isProtected(const std::string& path)
    {
        auto& protectedPaths = security::ProtectedPaths::getInstance();
        auto result = protectedPaths.checkPath(path);
        if (!result.allowed)
        {
            security::SecurityLogger::getInstance().logBlockedFileAccess(path, result.reason);
            return true;
        }
        return false;
    }

    bool shouldHide(const std::string& path)
    {
        auto& protectedPaths = security::ProtectedPaths::getInstance();
        return protectedPaths.shouldHidePath(path);
    }
}

// Simple cross-platform glob matching
bool FilesystemTools::matchGlob(const std::string& pattern, const std::string& text)
{
#if PLATFORM_WINDOWS
    // Windows: Use PathMatchSpec
    return PathMatchSpecA(text.c_str(), pattern.c_str()) == TRUE;
#else
    // POSIX: Use fnmatch
    return fnmatch(pattern.c_str(), text.c_str(), FNM_CASEFOLD) == 0;
#endif
}

json FilesystemTools::list(const std::string& path, bool recursive, int maxDepth)
{
    // Security check
    if (ProtectedPaths::isProtected(path))
    {
        return {{"success", false}, {"error", "Access denied: protected path"}};
    }

    try
    {
        json entries = json::array();
        fs::path fsPath(path);

        if (!fs::exists(fsPath))
        {
            return {{"success", false}, {"error", "Path does not exist: " + path}};
        }

        auto addEntry = [&entries](const fs::directory_entry& entry) {
            // Skip protected paths in listings
            if (ProtectedPaths::isProtected(entry.path().string()))
            {
                return;
            }

            json item = {
                {"name", entry.path().filename().string()},
                {"path", entry.path().string()},
                {"isDirectory", entry.is_directory()},
                {"isFile", entry.is_regular_file()},
                {"isSymlink", entry.is_symlink()}
            };

            if (entry.is_regular_file())
            {
                try
                {
                    item["size"] = entry.file_size();
                }
                catch (...) {}
            }

            entries.push_back(item);
        };

        if (recursive)
        {
            for (const auto& entry : fs::recursive_directory_iterator(fsPath,
                fs::directory_options::skip_permission_denied))
            {
                addEntry(entry);
                if (entries.size() >= 1000) break;
            }
        }
        else
        {
            for (const auto& entry : fs::directory_iterator(fsPath,
                fs::directory_options::skip_permission_denied))
            {
                addEntry(entry);
            }
        }

        return {{"success", true}, {"path", path}, {"entries", entries}};
    }
    catch (const std::exception& e)
    {
        return {{"success", false}, {"error", e.what()}};
    }
}

json FilesystemTools::read(const std::string& path, size_t maxBytes)
{
    // Security check
    if (ProtectedPaths::isProtected(path))
    {
        return {{"success", false}, {"error", "Access denied: protected path"}};
    }

    try
    {
        std::ifstream file(path, std::ios::binary);
        if (!file)
        {
            return {{"success", false}, {"error", "Cannot open file: " + path}};
        }

        file.seekg(0, std::ios::end);
        size_t fileSize = static_cast<size_t>(file.tellg());
        file.seekg(0, std::ios::beg);

        size_t readSize = std::min(fileSize, maxBytes);
        std::string content(readSize, '\0');
        file.read(&content[0], readSize);

        bool truncated = fileSize > maxBytes;

        return {
            {"success", true},
            {"path", path},
            {"content", content},
            {"size", fileSize},
            {"truncated", truncated}
        };
    }
    catch (const std::exception& e)
    {
        return {{"success", false}, {"error", e.what()}};
    }
}

json FilesystemTools::readRange(const std::string& path, int startLine, int endLine)
{
    // Security check
    if (ProtectedPaths::isProtected(path))
    {
        return {{"success", false}, {"error", "Access denied: protected path"}};
    }

    try
    {
        std::ifstream file(path);
        if (!file)
        {
            return {{"success", false}, {"error", "Cannot open file: " + path}};
        }

        std::vector<std::string> lines;
        std::string line;
        int lineNum = 0;

        while (std::getline(file, line))
        {
            lineNum++;
            if (lineNum >= startLine && (endLine < 0 || lineNum <= endLine))
            {
                lines.push_back(line);
            }
            if (endLine >= 0 && lineNum > endLine) break;
        }

        std::ostringstream content;
        for (const auto& l : lines)
        {
            content << l << "\n";
        }

        return {
            {"success", true},
            {"path", path},
            {"content", content.str()},
            {"startLine", startLine},
            {"endLine", endLine < 0 ? lineNum : endLine},
            {"lineCount", lines.size()}
        };
    }
    catch (const std::exception& e)
    {
        return {{"success", false}, {"error", e.what()}};
    }
}

json FilesystemTools::write(const std::string& path, const std::string& content,
                            const std::string& mode, bool createDirs)
{
    // Security check (allow writes to protected paths for legitimate service use)
    // The protection is mainly for reads to prevent exfiltration

    try
    {
        if (createDirs)
        {
            fs::path fsPath(path);
            fs::create_directories(fsPath.parent_path());
        }

        std::ios_base::openmode openMode = std::ios::out;
        if (mode == "append")
        {
            openMode |= std::ios::app;
        }
        else
        {
            openMode |= std::ios::trunc;
        }

        std::ofstream file(path, openMode);
        if (!file)
        {
            return {{"success", false}, {"error", "Cannot write to file: " + path}};
        }

        file << content;
        file.close();

        return {
            {"success", true},
            {"path", path},
            {"bytesWritten", content.size()},
            {"mode", mode}
        };
    }
    catch (const std::exception& e)
    {
        return {{"success", false}, {"error", e.what()}};
    }
}

json FilesystemTools::remove(const std::string& path, bool recursive)
{
    // Security check - don't allow deleting protected paths
    if (ProtectedPaths::isProtected(path))
    {
        return {{"success", false}, {"error", "Access denied: protected path"}};
    }

    try
    {
        fs::path fsPath(path);

        if (!fs::exists(fsPath))
        {
            return {{"success", false}, {"error", "Path does not exist: " + path}};
        }

        if (fs::is_directory(fsPath))
        {
            if (recursive)
            {
                auto removed = fs::remove_all(fsPath);
                return {{"success", true}, {"path", path}, {"removed", removed}};
            }
            else
            {
                fs::remove(fsPath);
                return {{"success", true}, {"path", path}};
            }
        }
        else
        {
            fs::remove(fsPath);
            return {{"success", true}, {"path", path}};
        }
    }
    catch (const std::exception& e)
    {
        return {{"success", false}, {"error", e.what()}};
    }
}

json FilesystemTools::move(const std::string& source, const std::string& destination)
{
    // Security check
    if (ProtectedPaths::isProtected(source))
    {
        return {{"success", false}, {"error", "Access denied: protected source path"}};
    }

    try
    {
        fs::rename(source, destination);
        return {{"success", true}, {"source", source}, {"destination", destination}};
    }
    catch (const std::exception& e)
    {
        return {{"success", false}, {"error", e.what()}};
    }
}

json FilesystemTools::search(const std::string& basePath, const std::string& globPattern, int maxResults)
{
    // Security check
    if (ProtectedPaths::isProtected(basePath))
    {
        return {{"success", false}, {"error", "Access denied: protected path"}};
    }

    try
    {
        json matches = json::array();
        fs::path base(basePath);

        if (!fs::exists(base))
        {
            return {{"success", false}, {"error", "Path does not exist: " + basePath}};
        }

        bool recursive = globPattern.find("**") != std::string::npos;
        std::string pattern = globPattern;

        // Remove ** prefix for matching
        if (pattern.substr(0, 3) == "**/")
        {
            pattern = pattern.substr(3);
        }

        auto searchDir = [&](auto&& iter) {
            for (const auto& entry : iter)
            {
                if (matches.size() >= static_cast<size_t>(maxResults)) break;

                // Skip protected paths
                if (ProtectedPaths::isProtected(entry.path().string()))
                {
                    continue;
                }

                std::string filename = entry.path().filename().string();
                if (matchGlob(pattern, filename))
                {
                    matches.push_back(entry.path().string());
                }
            }
        };

        try
        {
            if (recursive)
            {
                searchDir(fs::recursive_directory_iterator(base,
                    fs::directory_options::skip_permission_denied));
            }
            else
            {
                searchDir(fs::directory_iterator(base,
                    fs::directory_options::skip_permission_denied));
            }
        }
        catch (const fs::filesystem_error& e)
        {
            Logger::warn("Filesystem error during search: " + std::string(e.what()));
        }

        return {{"success", true}, {"matches", matches}, {"count", matches.size()}};
    }
    catch (const std::exception& e)
    {
        return {{"success", false}, {"error", e.what()}};
    }
}

json FilesystemTools::grep(const std::string& basePath, const std::string& pattern,
                           const std::string& globPattern, int maxMatches)
{
    // Security check
    if (ProtectedPaths::isProtected(basePath))
    {
        return {{"success", false}, {"error", "Access denied: protected path"}};
    }

    try
    {
        json matches = json::array();
        std::regex rx(pattern);

        // Build list of files to search
        std::vector<std::string> filesToSearch;

        fs::path fsPath(basePath);
        if (fs::is_regular_file(fsPath))
        {
            // If path is a file, search directly in it
            filesToSearch.push_back(basePath);
        }
        else
        {
            // If path is a directory, search for files matching glob
            auto filesResult = search(basePath, globPattern, 1000);
            if (!filesResult["success"])
            {
                return filesResult;
            }
            for (const auto& fp : filesResult["matches"])
            {
                filesToSearch.push_back(fp.get<std::string>());
            }
        }

        for (const auto& pathStr : filesToSearch)
        {
            if (matches.size() >= static_cast<size_t>(maxMatches)) break;

            // Double-check protected paths
            if (ProtectedPaths::isProtected(pathStr))
            {
                continue;
            }

            std::ifstream file(pathStr);
            if (!file) continue;

            std::string line;
            int lineNum = 0;

            while (std::getline(file, line))
            {
                lineNum++;
                try
                {
                    if (std::regex_search(line, rx))
                    {
                        matches.push_back({
                            {"file", pathStr},
                            {"line", lineNum},
                            {"content", line}
                        });

                        if (matches.size() >= static_cast<size_t>(maxMatches)) break;
                    }
                }
                catch (const std::regex_error&)
                {
                    // Skip invalid regex matches
                }
            }
        }

        return {{"success", true}, {"matches", matches}, {"count", matches.size()}};
    }
    catch (const std::exception& e)
    {
        return {{"success", false}, {"error", e.what()}};
    }
}

json FilesystemTools::patch(const std::string& path, const json& operations, bool dryRun)
{
    // Security check
    if (ProtectedPaths::isProtected(path))
    {
        return {{"success", false}, {"error", "Access denied: protected path"}};
    }

    try
    {
        std::ifstream file(path);
        if (!file)
        {
            return {{"success", false}, {"error", "Cannot open file: " + path}};
        }

        std::stringstream buffer;
        buffer << file.rdbuf();
        std::string content = buffer.str();
        file.close();

        std::string original = content;

        for (const auto& op : operations)
        {
            std::string type = op.value("type", "");
            std::string patternStr = op.value("pattern", "");
            std::string replacement = op.value("replacement", "");

            if (type == "replace_first" || type == "replace")
            {
                size_t pos = content.find(patternStr);
                if (pos != std::string::npos)
                {
                    content.replace(pos, patternStr.length(), replacement);
                }
            }
            else if (type == "replace_all")
            {
                size_t pos = 0;
                while ((pos = content.find(patternStr, pos)) != std::string::npos)
                {
                    content.replace(pos, patternStr.length(), replacement);
                    pos += replacement.length();
                }
            }
            else if (type == "insert_after")
            {
                std::string match = op.value("match", "");
                std::string insert = op.value("insert", "");
                size_t pos = content.find(match);
                if (pos != std::string::npos)
                {
                    content.insert(pos + match.length(), insert);
                }
            }
            else if (type == "insert_before")
            {
                std::string match = op.value("match", "");
                std::string insert = op.value("insert", "");
                size_t pos = content.find(match);
                if (pos != std::string::npos)
                {
                    content.insert(pos, insert);
                }
            }
        }

        if (!dryRun && content != original)
        {
            std::ofstream outFile(path, std::ios::trunc);
            outFile << content;
            outFile.close();
        }

        return {
            {"success", true},
            {"path", path},
            {"modified", content != original},
            {"dryRun", dryRun}
        };
    }
    catch (const std::exception& e)
    {
        return {{"success", false}, {"error", e.what()}};
    }
}

} // namespace ScreenControl
