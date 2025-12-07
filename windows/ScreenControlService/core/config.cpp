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
        std::ifstream file(configPath);
        json config = json::parse(file);

        m_httpPort = config.value("httpPort", 3456);
        m_browserBridgePort = config.value("browserBridgePort", 3457);

        if (config.contains("controlServerUrl"))
        {
            std::string url = config["controlServerUrl"];
            m_controlServerUrl = std::wstring(url.begin(), url.end());
        }

        if (config.contains("customerId"))
        {
            std::string id = config["customerId"];
            m_customerId = std::wstring(id.begin(), id.end());
        }

        if (config.contains("licenseUuid"))
        {
            std::string uuid = config["licenseUuid"];
            m_licenseUuid = std::wstring(uuid.begin(), uuid.end());
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
            {"controlServerUrl", std::string(m_controlServerUrl.begin(), m_controlServerUrl.end())},
            {"customerId", std::string(m_customerId.begin(), m_customerId.end())},
            {"licenseUuid", std::string(m_licenseUuid.begin(), m_licenseUuid.end())}
        };

        std::ofstream file(configPath);
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
