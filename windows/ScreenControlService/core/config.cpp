/**
 * Configuration
 *
 * Service configuration implementation.
 */

#include "config.h"
#include "../service.h"
#include "../libs/json.hpp"
#include "logger.h"
#include <fstream>
#include <filesystem>

using json = nlohmann::json;

namespace ScreenControl
{

// Helper to convert wstring to UTF-8 string
static std::string wstringToUtf8(const std::wstring& wstr)
{
    if (wstr.empty()) return std::string();
    int size = WideCharToMultiByte(CP_UTF8, 0, wstr.c_str(), -1, nullptr, 0, nullptr, nullptr);
    std::string str(size - 1, '\0');
    WideCharToMultiByte(CP_UTF8, 0, wstr.c_str(), -1, &str[0], size, nullptr, nullptr);
    return str;
}

// Helper to convert UTF-8 string to wstring
static std::wstring utf8ToWstring(const std::string& str)
{
    if (str.empty()) return std::wstring();
    int size = MultiByteToWideChar(CP_UTF8, 0, str.c_str(), -1, nullptr, 0);
    std::wstring wstr(size - 1, L'\0');
    MultiByteToWideChar(CP_UTF8, 0, str.c_str(), -1, &wstr[0], size);
    return wstr;
}

void Config::load()
{
    std::wstring configPath = getProgramDataPath() + L"\\" + CONFIG_FILE;

    // Create directory if needed
    std::filesystem::create_directories(getProgramDataPath());

    // Check if config file exists
    if (!std::filesystem::exists(configPath))
    {
        Logger::getInstance().info(L"Config file not found, using defaults");
        save();  // Create default config
        return;
    }

    try
    {
        // MinGW doesn't support wstring paths directly - use c_str()
        std::ifstream file(configPath.c_str());
        json config = json::parse(file);

        m_httpPort = config.value("httpPort", 3456);
        m_browserBridgePort = config.value("browserBridgePort", 3457);

        if (config.contains("controlServerUrl"))
        {
            std::string url = config["controlServerUrl"];
            m_controlServerUrl = utf8ToWstring(url);
        }

        if (config.contains("customerId"))
        {
            std::string id = config["customerId"];
            m_customerId = utf8ToWstring(id);
        }

        if (config.contains("licenseUuid"))
        {
            std::string uuid = config["licenseUuid"];
            m_licenseUuid = utf8ToWstring(uuid);
        }

        Logger::getInstance().info(L"Configuration loaded");
    }
    catch (const std::exception& e)
    {
        Logger::getInstance().error(L"Failed to load config: " +
            std::wstring(e.what(), e.what() + strlen(e.what())));
    }
}

void Config::save()
{
    std::wstring configPath = getProgramDataPath() + L"\\" + CONFIG_FILE;

    try
    {
        // Create directory if needed
        std::filesystem::create_directories(getProgramDataPath());

        json config = {
            {"httpPort", m_httpPort},
            {"browserBridgePort", m_browserBridgePort},
            {"controlServerUrl", wstringToUtf8(m_controlServerUrl)},
            {"customerId", wstringToUtf8(m_customerId)},
            {"licenseUuid", wstringToUtf8(m_licenseUuid)}
        };

        // MinGW doesn't support wstring paths directly - use c_str()
        std::ofstream file(configPath.c_str());
        file << config.dump(2);

        Logger::getInstance().info(L"Configuration saved");
    }
    catch (const std::exception& e)
    {
        Logger::getInstance().error(L"Failed to save config: " +
            std::wstring(e.what(), e.what() + strlen(e.what())));
    }
}

} // namespace ScreenControl
