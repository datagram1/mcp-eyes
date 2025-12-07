/**
 * Configuration
 *
 * Service configuration management.
 */

#pragma once

#include <string>

namespace ScreenControl
{

class Config
{
public:
    static Config& getInstance()
    {
        static Config instance;
        return instance;
    }

    void load();
    void save();

    // Getters
    int getHttpPort() const { return m_httpPort; }
    int getBrowserBridgePort() const { return m_browserBridgePort; }
    std::wstring getControlServerUrl() const { return m_controlServerUrl; }
    std::wstring getCustomerId() const { return m_customerId; }
    std::wstring getLicenseUuid() const { return m_licenseUuid; }

    // Setters
    void setHttpPort(int port) { m_httpPort = port; }
    void setBrowserBridgePort(int port) { m_browserBridgePort = port; }
    void setControlServerUrl(const std::wstring& url) { m_controlServerUrl = url; }
    void setCustomerId(const std::wstring& id) { m_customerId = id; }
    void setLicenseUuid(const std::wstring& uuid) { m_licenseUuid = uuid; }

private:
    Config() = default;

    int m_httpPort{3456};
    int m_browserBridgePort{3457};
    std::wstring m_controlServerUrl{L"wss://control.knws.co.uk/ws"};
    std::wstring m_customerId;
    std::wstring m_licenseUuid;
};

} // namespace ScreenControl
