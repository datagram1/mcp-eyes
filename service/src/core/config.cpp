/**
 * Configuration Implementation
 *
 * Cross-platform configuration with JSON storage.
 */

#include "config.h"
#include "logger.h"
#include "../libs/json.hpp"
#include <fstream>
#include <sstream>
#include <cstdlib>

#if PLATFORM_WINDOWS
    #include <windows.h>
    #include <shlobj.h>
#else
    #include <unistd.h>
    #include <sys/stat.h>
    #include <sys/types.h>
    #include <pwd.h>
#endif

#if PLATFORM_MACOS
    #include <IOKit/IOKitLib.h>
    #include <CoreFoundation/CoreFoundation.h>
#endif

using json = nlohmann::json;

namespace ScreenControl
{

Config& Config::getInstance()
{
    static Config instance;
    return instance;
}

std::string Config::getDefaultConfigPath() const
{
#if PLATFORM_MACOS
    return std::string(SERVICE_CONFIG_DIR) + "/config.json";
#elif PLATFORM_WINDOWS
    return std::string(SERVICE_CONFIG_DIR) + "\\config.json";
#else
    return std::string(SERVICE_CONFIG_DIR) + "/config.json";
#endif
}

void Config::load(const std::string& path)
{
    m_configPath = path.empty() ? getDefaultConfigPath() : path;

    std::ifstream file(m_configPath);
    if (!file)
    {
        Logger::info("No config file found at " + m_configPath + ", using defaults");
        return;
    }

    try
    {
        json config;
        file >> config;

        // Server ports and host
        if (config.contains("httpPort"))
            m_httpPort = config["httpPort"];
        if (config.contains("httpHost"))
            m_httpHost = config["httpHost"];
        if (config.contains("guiBridgePort"))
            m_guiBridgePort = config["guiBridgePort"];
        if (config.contains("webSocketPort"))
            m_webSocketPort = config["webSocketPort"];

        // Control server
        if (config.contains("controlServerUrl"))
            m_controlServerUrl = config["controlServerUrl"];

        // Agent identification
        if (config.contains("agentName"))
            m_agentName = config["agentName"];
        if (config.contains("customerId"))
            m_customerId = config["customerId"];
        if (config.contains("licenseUuid"))
            m_licenseUuid = config["licenseUuid"];

        // Feature flags
        if (config.contains("autoStart"))
            m_autoStart = config["autoStart"];
        if (config.contains("enableLogging"))
            m_loggingEnabled = config["enableLogging"];
        if (config.contains("licensed"))
            m_licensed = config["licensed"];
        if (config.contains("licenseStatus"))
            m_licenseStatus = config["licenseStatus"];

        // Security (read-only flag - actual credentials stored separately)
        if (config.contains("hasStoredCredentials"))
            m_hasStoredCredentials = config["hasStoredCredentials"];

        // Browser settings
        if (config.contains("defaultBrowser"))
            m_defaultBrowser = config["defaultBrowser"];

        Logger::info("Configuration loaded from " + m_configPath);
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
        m_configPath = getDefaultConfigPath();
    }

    // Ensure directory exists
#if PLATFORM_WINDOWS
    std::string dir = m_configPath.substr(0, m_configPath.find_last_of('\\'));
    CreateDirectoryA(dir.c_str(), nullptr);
#else
    std::string dir = m_configPath.substr(0, m_configPath.find_last_of('/'));
    mkdir(dir.c_str(), 0755);
#endif

    json config = {
        {"httpPort", m_httpPort},
        {"httpHost", m_httpHost},
        {"guiBridgePort", m_guiBridgePort},
        {"webSocketPort", m_webSocketPort},
        {"controlServerUrl", m_controlServerUrl},
        {"agentName", m_agentName},
        {"customerId", m_customerId},
        {"licenseUuid", m_licenseUuid},
        {"autoStart", m_autoStart},
        {"enableLogging", m_loggingEnabled},
        {"licensed", m_licensed},
        {"licenseStatus", m_licenseStatus},
        {"hasStoredCredentials", m_hasStoredCredentials},
        {"defaultBrowser", m_defaultBrowser}
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
#if PLATFORM_MACOS
    // Use IOKit to get hardware UUID
    io_service_t platformExpert = IOServiceGetMatchingService(
        kIOMainPortDefault,
        IOServiceMatching("IOPlatformExpertDevice")
    );

    if (platformExpert)
    {
        CFTypeRef serialNumberAsCFString = IORegistryEntryCreateCFProperty(
            platformExpert,
            CFSTR("IOPlatformUUID"),
            kCFAllocatorDefault,
            0
        );

        if (serialNumberAsCFString)
        {
            char buffer[256];
            if (CFStringGetCString((CFStringRef)serialNumberAsCFString,
                                   buffer, sizeof(buffer),
                                   kCFStringEncodingUTF8))
            {
                CFRelease(serialNumberAsCFString);
                IOObjectRelease(platformExpert);
                return std::string(buffer);
            }
            CFRelease(serialNumberAsCFString);
        }
        IOObjectRelease(platformExpert);
    }

    // Fallback: use hostname
    char hostname[256];
    gethostname(hostname, sizeof(hostname));
    return std::string(hostname) + "-macos";

#elif PLATFORM_WINDOWS
    // Use Windows machine GUID from registry
    HKEY hKey;
    if (RegOpenKeyExA(HKEY_LOCAL_MACHINE,
                      "SOFTWARE\\Microsoft\\Cryptography",
                      0, KEY_READ, &hKey) == ERROR_SUCCESS)
    {
        char buffer[256];
        DWORD bufferSize = sizeof(buffer);
        if (RegQueryValueExA(hKey, "MachineGuid", nullptr, nullptr,
                             (LPBYTE)buffer, &bufferSize) == ERROR_SUCCESS)
        {
            RegCloseKey(hKey);
            return std::string(buffer);
        }
        RegCloseKey(hKey);
    }

    // Fallback: computer name
    char computerName[MAX_COMPUTERNAME_LENGTH + 1];
    DWORD size = sizeof(computerName);
    if (GetComputerNameA(computerName, &size))
    {
        return std::string(computerName) + "-windows";
    }

    return "unknown-windows";

#else
    // Linux: Try /etc/machine-id (standard on systemd systems)
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

    // Fallback: /var/lib/dbus/machine-id
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

    // Last fallback: hostname
    char hostname[256];
    gethostname(hostname, sizeof(hostname));
    return std::string(hostname) + "-linux";
#endif
}

} // namespace ScreenControl
