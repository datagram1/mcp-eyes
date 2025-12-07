/**
 * Configuration
 *
 * Settings management for Linux agent.
 */

#pragma once

#include <string>

namespace ScreenControl
{

class Config
{
public:
    static Config& getInstance();

    void load(const std::string& path);
    void save();

    int getPort() const { return m_port; }
    void setPort(int port) { m_port = port; }

    std::string getControlServerUrl() const { return m_controlServerUrl; }
    void setControlServerUrl(const std::string& url) { m_controlServerUrl = url; }

    bool getAutoStart() const { return m_autoStart; }
    void setAutoStart(bool value) { m_autoStart = value; }

    bool getLoggingEnabled() const { return m_loggingEnabled; }
    void setLoggingEnabled(bool value) { m_loggingEnabled = value; }

    bool isLicensed() const { return m_licensed; }
    std::string getLicenseStatus() const { return m_licenseStatus; }
    std::string getMachineId() const;

private:
    Config() = default;
    std::string generateMachineId() const;

    std::string m_configPath;
    int m_port = 3456;
    std::string m_controlServerUrl;
    bool m_autoStart = true;
    bool m_loggingEnabled = true;
    bool m_licensed = false;
    std::string m_licenseStatus = "Not Licensed";
    mutable std::string m_machineId;
};

} // namespace ScreenControl
