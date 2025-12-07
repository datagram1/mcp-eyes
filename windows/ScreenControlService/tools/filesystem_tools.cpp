/**
 * Filesystem Tools
 *
 * File operations implementation using Win32 APIs and C++ filesystem.
 */

#include "filesystem_tools.h"
#include "../core/logger.h"
#include <windows.h>
#include <filesystem>
#include <fstream>
#include <sstream>
#include <regex>

namespace fs = std::filesystem;
using json = nlohmann::json;

namespace ScreenControl
{

json FilesystemTools::list(const std::string& path, bool recursive, int maxDepth)
{
    try
    {
        json entries = json::array();
        fs::path fsPath(path);

        if (!fs::exists(fsPath))
        {
            return {{"success", false}, {"error", "Path does not exist: " + path}};
        }

        auto addEntry = [&entries](const fs::directory_entry& entry) {
            json item = {
                {"name", entry.path().filename().string()},
                {"path", entry.path().string()},
                {"isDirectory", entry.is_directory()},
                {"isFile", entry.is_regular_file()}
            };

            if (entry.is_regular_file())
            {
                item["size"] = entry.file_size();
            }

            entries.push_back(item);
        };

        if (recursive)
        {
            for (const auto& entry : fs::recursive_directory_iterator(fsPath))
            {
                addEntry(entry);
                if (entries.size() >= 1000) break;  // Limit
            }
        }
        else
        {
            for (const auto& entry : fs::directory_iterator(fsPath))
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
    try
    {
        std::ifstream file(path, std::ios::binary);
        if (!file)
        {
            return {{"success", false}, {"error", "Cannot open file: " + path}};
        }

        // Get file size
        file.seekg(0, std::ios::end);
        size_t fileSize = static_cast<size_t>(file.tellg());
        file.seekg(0, std::ios::beg);

        // Read content
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

json FilesystemTools::search(const std::string& basePath, const std::string& glob, int maxResults)
{
    try
    {
        json matches = json::array();
        fs::path base(basePath);

        // Simple glob matching (convert ** to recursive)
        bool recursive = glob.find("**") != std::string::npos;

        // Convert glob to regex pattern
        std::string pattern = glob;
        // Replace . with \\.
        size_t pos = 0;
        while ((pos = pattern.find('.', pos)) != std::string::npos)
        {
            pattern.replace(pos, 1, "\\.");
            pos += 2;
        }
        // Replace * with .*
        pos = 0;
        while ((pos = pattern.find('*', pos)) != std::string::npos)
        {
            if (pos + 1 < pattern.size() && pattern[pos + 1] == '*')
            {
                pattern.replace(pos, 2, ".*");
                pos += 2;
            }
            else
            {
                pattern.replace(pos, 1, "[^/\\\\]*");
                pos += 7;
            }
        }

        std::regex rx(pattern, std::regex::icase);

        auto search_dir = [&](auto&& iter) {
            for (const auto& entry : iter)
            {
                if (matches.size() >= static_cast<size_t>(maxResults)) break;

                std::string filename = entry.path().filename().string();
                if (std::regex_match(filename, rx))
                {
                    matches.push_back(entry.path().string());
                }
            }
        };

        if (recursive)
        {
            search_dir(fs::recursive_directory_iterator(base));
        }
        else
        {
            search_dir(fs::directory_iterator(base));
        }

        return {{"success", true}, {"matches", matches}, {"count", matches.size()}};
    }
    catch (const std::exception& e)
    {
        return {{"success", false}, {"error", e.what()}};
    }
}

json FilesystemTools::grep(const std::string& basePath, const std::string& pattern,
                           const std::string& glob, int maxMatches)
{
    try
    {
        json matches = json::array();
        std::regex rx(pattern);

        // First search for files
        auto filesResult = search(basePath, glob, 1000);
        if (!filesResult["success"])
        {
            return filesResult;
        }

        for (const auto& filePath : filesResult["matches"])
        {
            if (matches.size() >= static_cast<size_t>(maxMatches)) break;

            std::ifstream file(filePath.get<std::string>());
            std::string line;
            int lineNum = 0;

            while (std::getline(file, line))
            {
                lineNum++;
                if (std::regex_search(line, rx))
                {
                    matches.push_back({
                        {"file", filePath},
                        {"line", lineNum},
                        {"content", line}
                    });

                    if (matches.size() >= static_cast<size_t>(maxMatches)) break;
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
    try
    {
        // Read file
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

        // Apply operations
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
