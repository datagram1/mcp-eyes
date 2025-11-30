#pragma once

#include <windows.h>
#include <string>
#include <memory>

class AppDelegate;

class SettingsWindow {
public:
    SettingsWindow(HINSTANCE hInstance, AppDelegate* appDelegate);
    ~SettingsWindow();

    bool create();
    void show();
    void hide();
    bool isVisible() const { return hwnd_ != nullptr && IsWindowVisible(hwnd_); }
    HWND getHandle() const { return hwnd_; }

    void updateStatus(const std::string& status, const std::string& uptime);
    void updatePermissionIndicators(bool accessibility, bool screenRecording);
    void updateConnectionStatus(const std::string& status, bool connected);

    // Settings getters
    std::string getAgentName() const;
    std::string getNetworkMode() const;
    unsigned int getPort() const;
    std::string getApiKey() const;
    std::string getControlServerMode() const;
    std::string getControlServerAddress() const;
    std::string getControlServerKey() const;

    // Settings setters
    void setAgentName(const std::string& name);
    void setNetworkMode(const std::string& mode);
    void setPort(unsigned int port);
    void setApiKey(const std::string& key);
    void setControlServerMode(const std::string& mode);
    void setControlServerAddress(const std::string& address);
    void setControlServerKey(const std::string& key);

    // Load/Save from registry
    void loadSettings();
    void saveSettings();

private:
    HINSTANCE hInstance_;
    HWND hwnd_;
    AppDelegate* appDelegate_;

    // Control handles
    HWND hAgentName_;
    HWND hNetworkMode_;
    HWND hPort_;
    HWND hApiKey_;
    HWND hCopyKey_;
    HWND hRegenerateKey_;
    HWND hControlMode_;
    HWND hControlAddress_;
    HWND hControlKey_;
    HWND hTestConnection_;
    HWND hConnectionStatus_;
    HWND hAccessibilityInd_;
    HWND hAccessibilityLabel_;
    HWND hAccessibilityBtn_;
    HWND hScreenInd_;
    HWND hScreenLabel_;
    HWND hScreenBtn_;
    HWND hStatusLabel_;
    HWND hUptimeLabel_;

    static INT_PTR CALLBACK DialogProc(HWND hwnd, UINT uMsg, WPARAM wParam, LPARAM lParam);
    INT_PTR handleMessage(UINT uMsg, WPARAM wParam, LPARAM lParam);
    
    void createControls();
    void layoutControls();
    void updateControlStates();
    
    std::string getControlText(int controlId) const;
    void setControlText(int controlId, const std::string& text);
    int getComboBoxSelection(int controlId) const;
    void setComboBoxSelection(int controlId, int index);
};

