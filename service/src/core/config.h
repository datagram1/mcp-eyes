/**
 * Configuration
 *
 * Cross-platform configuration management for ScreenControl Service.
 */

#pragma once

#include "platform.h"
#include <string>

namespace ScreenControl
{

class Config
{
public:
    static Config& getInstance();

    void load(const std::string& path = "");
    void save();

    // Server ports and host
    int getHttpPort() const { return m_httpPort; }
    void setHttpPort(int port) { m_httpPort = port; }

    std::string getHttpHost() const { return m_httpHost; }
    void setHttpHost(const std::string& host) { m_httpHost = host; }

    int getGuiBridgePort() const { return m_guiBridgePort; }
    void setGuiBridgePort(int port) { m_guiBridgePort = port; }

    int getWebSocketPort() const { return m_webSocketPort; }
    void setWebSocketPort(int port) { m_webSocketPort = port; }

    // Control server
    std::string getControlServerUrl() const { return m_controlServerUrl; }
    void setControlServerUrl(const std::string& url) { m_controlServerUrl = url; }

    // Agent identification
    std::string getAgentName() const { return m_agentName; }
    void setAgentName(const std::string& name) { m_agentName = name; }

    std::string getCustomerId() const { return m_customerId; }
    void setCustomerId(const std::string& id) { m_customerId = id; }

    std::string getLicenseUuid() const { return m_licenseUuid; }
    void setLicenseUuid(const std::string& uuid) { m_licenseUuid = uuid; }

    // Machine identification
    std::string getMachineId() const;

    // Feature flags
    bool isAutoStartEnabled() const { return m_autoStart; }
    void setAutoStart(bool value) { m_autoStart = value; }

    bool isLoggingEnabled() const { return m_loggingEnabled; }
    void setLoggingEnabled(bool value) { m_loggingEnabled = value; }

    bool isLicensed() const { return m_licensed; }
    std::string getLicenseStatus() const { return m_licenseStatus; }

    // Security settings
    bool hasStoredCredentials() const { return m_hasStoredCredentials; }

    // Config path
    std::string getConfigPath() const { return m_configPath; }

private:
    Config() = default;
    std::string generateMachineId() const;
    std::string getDefaultConfigPath() const;

    std::string m_configPath;

    // Server ports and host
    int m_httpPort = HTTP_SERVER_PORT;
    std::string m_httpHost = "127.0.0.1";  // Default to localhost for security
    int m_guiBridgePort = GUI_BRIDGE_PORT;
    int m_webSocketPort = WEBSOCKET_SERVER_PORT;

    // Control server
    std::string m_controlServerUrl = "wss://screencontrol.knws.co.uk/ws";

    // Agent identification
    std::string m_agentName;
    std::string m_customerId;
    std::string m_licenseUuid;

    // Machine identification (cached)
    mutable std::string m_machineId;

    // Feature flags
    bool m_autoStart = true;
    bool m_loggingEnabled = true;
    bool m_licensed = false;
    std::string m_licenseStatus = "Not Licensed";

    // Security
    bool m_hasStoredCredentials = false;
};

} // namespace ScreenControl
