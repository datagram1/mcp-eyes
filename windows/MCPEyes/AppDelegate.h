#pragma once

#include <windows.h>
#include <string>
#include <memory>
#include <vector>
#include "MCPServer.h"
#include "SettingsWindow.h"

class AppDelegate {
public:
    AppDelegate(HINSTANCE hInstance);
    ~AppDelegate();

    bool initialize();
    void run();
    void shutdown();

    // Tray icon
    void createTrayIcon();
    void updateTrayIcon(bool locked = false);
    void removeTrayIcon();
    void updateStatusMenu();

    // Settings
    void openSettings();
    void closeSettings();
    SettingsWindow* getSettingsWindow() { return settingsWindow_.get(); }

    // Server
    void startServer();
    void stopServer();
    void restartServer();
    bool isServerRunning() const { return mcpServer_ && mcpServer_->isRunning(); }

    // Actions
    void copyApiKey();
    void toggleStartAtLogin();
    void openAccessibilitySettings();
    void openScreenRecordingSettings();
    void quit();
    std::string generateApiKey();

    // Settings persistence
    void loadSettings();
    void saveSettings();
    void saveTokenFile();

    // Status
    void updateStatus();
    bool isScreenLocked() const;

    // Getters
    std::string getAgentName() const { return agentName_; }
    std::string getNetworkMode() const { return networkMode_; }
    unsigned int getPort() const { return port_; }
    std::string getApiKey() const { return apiKey_; }
    std::string getControlServerMode() const { return controlServerMode_; }
    std::string getControlServerAddress() const { return controlServerAddress_; }
    std::string getControlServerKey() const { return controlServerKey_; }

    // Setters
    void setAgentName(const std::string& name) { agentName_ = name; }
    void setNetworkMode(const std::string& mode) { networkMode_ = mode; }
    void setPort(unsigned int port) { port_ = port; }
    void setApiKey(const std::string& key) { apiKey_ = key; }
    void setControlServerMode(const std::string& mode) { controlServerMode_ = mode; }
    void setControlServerAddress(const std::string& address) { controlServerAddress_ = address; }
    void setControlServerKey(const std::string& key) { controlServerKey_ = key; }

    // MCPServerDelegate
    void serverDidStart(unsigned int port);
    void serverDidStop();
    void serverDidReceiveRequest(const std::string& path);

private:
    HINSTANCE hInstance_;
    HWND hwnd_;  // Hidden window for tray app
    
    // Tray icon
    NOTIFYICONDATA nid_;
    HMENU hMenu_;
    bool trayIconCreated_;

    // Settings
    std::unique_ptr<SettingsWindow> settingsWindow_;
    
    // Server
    std::unique_ptr<mcp_eyes::MCPServer> mcpServer_;
    std::unique_ptr<mcp_eyes::Platform> platform_;

    // Configuration
    std::string agentName_;
    std::string networkMode_;
    unsigned int port_;
    std::string apiKey_;
    std::string controlServerMode_;
    std::string controlServerAddress_;
    std::string controlServerKey_;
    bool startAtLogin_;
    bool isRemoteMode_;

    // Status
    std::string currentStatus_;
    DWORD startTime_;

    // Timer
    UINT_PTR statusTimer_;

    // Window procedure
    static LRESULT CALLBACK WindowProc(HWND hwnd, UINT uMsg, WPARAM wParam, LPARAM lParam);
    LRESULT handleMessage(UINT uMsg, WPARAM wParam, LPARAM lParam);

    // Menu handling
    void createContextMenu();
    void updateContextMenu();
    void handleMenuCommand(WPARAM wParam);

    // Registry operations
    void saveSetting(const std::string& key, const std::string& value);
    std::string loadSetting(const std::string& key, const std::string& defaultValue = "");
    std::string generateApiKey();
    std::string loadOrGenerateApiKey();

    // Startup
    bool isStartAtLoginEnabled() const;
    void enableStartAtLogin(bool enable);
};

