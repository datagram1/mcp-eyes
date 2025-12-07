/**
 * Configuration Implementation
 */

#include "config.h"
#include "logger.h"
#include "../libs/json.hpp"
#include <fstream>
#include <sstream>
#include <cstdlib>
#include <unistd.h>
#include <sys/stat.h>

using json = nlohmann::json;

namespace ScreenControl
{

Config& Config::getInstance()
{
    static Config instance;
    return instance;
}

void Config::load(const std::string& path)
{
    m_configPath = path;

    std::ifstream file(path);
    if (!file)
    {
        Logger::info("No config file found at " + path + ", using defaults");
        return;
    }

    try
    {
        json config;
        file >> config;

        if (config.contains("port"))
            m_port = config["port"];
        if (config.contains("controlServerUrl"))
            m_controlServerUrl = config["controlServerUrl"];
        if (config.contains("autoStart"))
            m_autoStart = config["autoStart"];
        if (config.contains("enableLogging"))
            m_loggingEnabled = config["enableLogging"];
        if (config.contains("licensed"))
            m_licensed = config["licensed"];
        if (config.contains("licenseStatus"))
            m_licenseStatus = config["licenseStatus"];

        Logger::info("Configuration loaded from " + path);
    }
    catch (const std::exception& e)
    {
        Logger::error("Failed to parse config: " + std::string(e.what()));
    }
}

void Config::save()
{
    if (m_configPath.empty())
    {
        m_configPath = "/etc/screencontrol/config.json";
    }

    // Ensure directory exists
    std::string dir = m_configPath.substr(0, m_configPath.find_last_of('/'));
    mkdir(dir.c_str(), 0755);

    json config = {
        {"port", m_port},
        {"controlServerUrl", m_controlServerUrl},
        {"autoStart", m_autoStart},
        {"enableLogging", m_loggingEnabled},
        {"licensed", m_licensed},
        {"licenseStatus", m_licenseStatus}
    };

    std::ofstream file(m_configPath);
    if (file)
    {
        file << config.dump(2);
        Logger::info("Configuration saved to " + m_configPath);
    }
    else
    {
        Logger::error("Failed to save configuration to " + m_configPath);
    }
}

std::string Config::getMachineId() const
{
    if (!m_machineId.empty())
    {
        return m_machineId;
    }

    m_machineId = generateMachineId();
    return m_machineId;
}

std::string Config::generateMachineId() const
{
    // Try to read machine-id (standard on systemd systems)
    std::ifstream machineIdFile("/etc/machine-id");
    if (machineIdFile)
    {
        std::string id;
        std::getline(machineIdFile, id);
        if (!id.empty())
        {
            return id;
        }
    }

    // Fallback: try /var/lib/dbus/machine-id
    std::ifstream dbusIdFile("/var/lib/dbus/machine-id");
    if (dbusIdFile)
    {
        std::string id;
        std::getline(dbusIdFile, id);
        if (!id.empty())
        {
            return id;
        }
    }

    // Last fallback: generate from hostname + boot time
    char hostname[256];
    gethostname(hostname, sizeof(hostname));

    std::ifstream uptimeFile("/proc/uptime");
    std::string uptime;
    if (uptimeFile)
    {
        uptimeFile >> uptime;
    }

    // Simple hash
    std::string combined = std::string(hostname) + uptime;
    size_t hash = std::hash<std::string>{}(combined);

    std::stringstream ss;
    ss << std::hex << hash;
    return ss.str();
}

} // namespace ScreenControl
