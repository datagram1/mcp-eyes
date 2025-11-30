#include "SettingsWindow.h"
#include "AppDelegate.h"
#include "resource.h"
#include <windows.h>
#include <commctrl.h>
#include <sstream>
#include <iomanip>

SettingsWindow::SettingsWindow(HINSTANCE hInstance, AppDelegate* appDelegate)
    : hInstance_(hInstance)
    , hwnd_(nullptr)
    , appDelegate_(appDelegate)
{
    memset(&hAgentName_, 0, sizeof(hAgentName_));
}

SettingsWindow::~SettingsWindow() {
    if (hwnd_) {
        DestroyWindow(hwnd_);
    }
}

bool SettingsWindow::create() {
    hwnd_ = CreateDialogParam(
        hInstance_,
        MAKEINTRESOURCE(IDD_SETTINGS),
        nullptr,
        DialogProc,
        reinterpret_cast<LPARAM>(this)
    );

    if (!hwnd_) {
        // If dialog resource doesn't exist, create window manually
        hwnd_ = CreateWindowEx(
            WS_EX_DLGMODALFRAME,
            "STATIC",
            "MCP-Eyes Settings",
            WS_POPUP | WS_CAPTION | WS_SYSMENU | DS_MODALFRAME,
            CW_USEDEFAULT, CW_USEDEFAULT,
            480, 670,
            nullptr, nullptr, hInstance_, this
        );

        if (hwnd_) {
            SetWindowLongPtr(hwnd_, GWLP_USERDATA, reinterpret_cast<LONG_PTR>(this));
            createControls();
            layoutControls();
        }
    }

    return hwnd_ != nullptr;
}

void SettingsWindow::show() {
    if (hwnd_) {
        ShowWindow(hwnd_, SW_SHOW);
        UpdateWindow(hwnd_);
        SetForegroundWindow(hwnd_);
    }
}

void SettingsWindow::hide() {
    if (hwnd_) {
        ShowWindow(hwnd_, SW_HIDE);
    }
}

INT_PTR CALLBACK SettingsWindow::DialogProc(HWND hwnd, UINT uMsg, WPARAM wParam, LPARAM lParam) {
    SettingsWindow* window = nullptr;

    if (uMsg == WM_INITDIALOG) {
        window = reinterpret_cast<SettingsWindow*>(lParam);
        SetWindowLongPtr(hwnd, GWLP_USERDATA, reinterpret_cast<LONG_PTR>(window));
        window->hwnd_ = hwnd;
    } else {
        window = reinterpret_cast<SettingsWindow*>(GetWindowLongPtr(hwnd, GWLP_USERDATA));
    }

    if (window) {
        return window->handleMessage(uMsg, wParam, lParam);
    }

    return FALSE;
}

INT_PTR SettingsWindow::handleMessage(UINT uMsg, WPARAM wParam, LPARAM lParam) {
    switch (uMsg) {
        case WM_INITDIALOG:
            createControls();
            layoutControls();
            loadSettings();
            return TRUE;

        case WM_COMMAND:
            switch (LOWORD(wParam)) {
                case IDC_SAVE:
                    saveSettings();
                    if (appDelegate_) {
                        appDelegate_->restartServer();
                    }
                    hide();
                    return TRUE;

                case IDC_COPY_KEY:
                    if (OpenClipboard(hwnd_)) {
                        EmptyClipboard();
                        std::string key = getApiKey();
                        HGLOBAL hMem = GlobalAlloc(GMEM_MOVEABLE, key.length() + 1);
                        if (hMem) {
                            memcpy(GlobalLock(hMem), key.c_str(), key.length() + 1);
                            GlobalUnlock(hMem);
                            SetClipboardData(CF_TEXT, hMem);
                        }
                        CloseClipboard();
                    }
                    return TRUE;

                case IDC_REGENERATE_KEY:
                    if (appDelegate_) {
                        std::string newKey = appDelegate_->generateApiKey();
                        setApiKey(newKey);
                        appDelegate_->setApiKey(newKey);
                        appDelegate_->saveSettings();
                    }
                    return TRUE;

                case IDC_TEST_CONNECTION:
                    // TODO: Implement connection test
                    return TRUE;

                case IDC_ACCESSIBILITY_BTN:
                    if (appDelegate_) {
                        appDelegate_->openAccessibilitySettings();
                    }
                    return TRUE;

                case IDC_SCREEN_BTN:
                    if (appDelegate_) {
                        appDelegate_->openScreenRecordingSettings();
                    }
                    return TRUE;

                case IDCANCEL:
                case WM_CLOSE:
                    hide();
                    return TRUE;
            }
            break;
    }

    return FALSE;
}

void SettingsWindow::createControls() {
    if (!hwnd_) return;

    // Agent Configuration Group
    CreateWindow("BUTTON", "Agent Configuration", WS_VISIBLE | BS_GROUPBOX,
        20, 20, 440, 150, hwnd_, (HMENU)IDC_GROUP_CONFIG, hInstance_, nullptr);

    CreateWindow("STATIC", "Agent Name:", WS_VISIBLE | SS_LEFT,
        35, 45, 120, 20, hwnd_, nullptr, hInstance_, nullptr);
    hAgentName_ = CreateWindow("EDIT", "", WS_VISIBLE | WS_BORDER | ES_LEFT,
        155, 43, 290, 24, hwnd_, (HMENU)IDC_AGENT_NAME, hInstance_, nullptr);

    CreateWindow("STATIC", "Network Mode:", WS_VISIBLE | SS_LEFT,
        35, 75, 120, 20, hwnd_, nullptr, hInstance_, nullptr);
    hNetworkMode_ = CreateWindow("COMBOBOX", "", WS_VISIBLE | WS_BORDER | CBS_DROPDOWNLIST,
        155, 73, 290, 200, hwnd_, (HMENU)IDC_NETWORK_MODE, hInstance_, nullptr);
    SendMessage(hNetworkMode_, CB_ADDSTRING, 0, (LPARAM)"Localhost Only");
    SendMessage(hNetworkMode_, CB_ADDSTRING, 0, (LPARAM)"Local Network (LAN)");
    SendMessage(hNetworkMode_, CB_ADDSTRING, 0, (LPARAM)"Internet (WAN)");

    CreateWindow("STATIC", "Port:", WS_VISIBLE | SS_LEFT,
        35, 105, 120, 20, hwnd_, nullptr, hInstance_, nullptr);
    hPort_ = CreateWindow("EDIT", "", WS_VISIBLE | WS_BORDER | ES_LEFT | ES_NUMBER,
        155, 103, 80, 24, hwnd_, (HMENU)IDC_PORT, hInstance_, nullptr);

    // Security Group
    CreateWindow("BUTTON", "Security", WS_VISIBLE | BS_GROUPBOX,
        20, 180, 440, 100, hwnd_, (HMENU)IDC_GROUP_SECURITY, hInstance_, nullptr);

    CreateWindow("STATIC", "API Key:", WS_VISIBLE | SS_LEFT,
        35, 205, 120, 20, hwnd_, nullptr, hInstance_, nullptr);
    hApiKey_ = CreateWindow("EDIT", "", WS_VISIBLE | WS_BORDER | ES_LEFT | ES_READONLY,
        155, 203, 250, 24, hwnd_, (HMENU)IDC_API_KEY, hInstance_, nullptr);
    SendMessage(hApiKey_, EM_SETREADONLY, TRUE, 0);

    hCopyKey_ = CreateWindow("BUTTON", "Copy", WS_VISIBLE | BS_PUSHBUTTON,
        410, 203, 40, 24, hwnd_, (HMENU)IDC_COPY_KEY, hInstance_, nullptr);

    hRegenerateKey_ = CreateWindow("BUTTON", "Regenerate", WS_VISIBLE | BS_PUSHBUTTON,
        155, 233, 100, 24, hwnd_, (HMENU)IDC_REGENERATE_KEY, hInstance_, nullptr);

    // Control Server Group
    CreateWindow("BUTTON", "Control Server (Remote Mode)", WS_VISIBLE | BS_GROUPBOX,
        20, 290, 440, 150, hwnd_, (HMENU)IDC_GROUP_CONTROL, hInstance_, nullptr);

    CreateWindow("STATIC", "Mode:", WS_VISIBLE | SS_LEFT,
        35, 315, 120, 20, hwnd_, nullptr, hInstance_, nullptr);
    hControlMode_ = CreateWindow("COMBOBOX", "", WS_VISIBLE | WS_BORDER | CBS_DROPDOWNLIST,
        155, 313, 290, 200, hwnd_, (HMENU)IDC_CONTROL_MODE, hInstance_, nullptr);
    SendMessage(hControlMode_, CB_ADDSTRING, 0, (LPARAM)"Disabled");
    SendMessage(hControlMode_, CB_ADDSTRING, 0, (LPARAM)"Auto (Bonjour)");
    SendMessage(hControlMode_, CB_ADDSTRING, 0, (LPARAM)"Manual (WAN)");

    CreateWindow("STATIC", "Server Address:", WS_VISIBLE | SS_LEFT,
        35, 345, 120, 20, hwnd_, nullptr, hInstance_, nullptr);
    hControlAddress_ = CreateWindow("EDIT", "", WS_VISIBLE | WS_BORDER | ES_LEFT,
        155, 343, 290, 24, hwnd_, (HMENU)IDC_CONTROL_ADDRESS, hInstance_, nullptr);

    CreateWindow("STATIC", "Secure Key:", WS_VISIBLE | SS_LEFT,
        35, 375, 120, 20, hwnd_, nullptr, hInstance_, nullptr);
    hControlKey_ = CreateWindow("EDIT", "", WS_VISIBLE | WS_BORDER | ES_LEFT | ES_PASSWORD,
        155, 373, 200, 24, hwnd_, (HMENU)IDC_CONTROL_KEY, hInstance_, nullptr);

    hTestConnection_ = CreateWindow("BUTTON", "Test", WS_VISIBLE | BS_PUSHBUTTON,
        360, 373, 85, 24, hwnd_, (HMENU)IDC_TEST_CONNECTION, hInstance_, nullptr);

    hConnectionStatus_ = CreateWindow("STATIC", "Status: Not connected", WS_VISIBLE | SS_LEFT,
        155, 403, 290, 20, hwnd_, (HMENU)IDC_CONNECTION_STATUS, hInstance_, nullptr);

    // Permissions Group
    CreateWindow("BUTTON", "Permissions", WS_VISIBLE | BS_GROUPBOX,
        20, 450, 440, 100, hwnd_, (HMENU)IDC_GROUP_PERMISSIONS, hInstance_, nullptr);

    hAccessibilityInd_ = CreateWindow("STATIC", "", WS_VISIBLE | SS_ICON,
        35, 475, 20, 20, hwnd_, (HMENU)IDC_ACCESSIBILITY_IND, hInstance_, nullptr);
    hAccessibilityLabel_ = CreateWindow("STATIC", "Accessibility", WS_VISIBLE | SS_LEFT,
        60, 477, 150, 20, hwnd_, (HMENU)IDC_ACCESSIBILITY_LABEL, hInstance_, nullptr);
    hAccessibilityBtn_ = CreateWindow("BUTTON", "Grant", WS_VISIBLE | BS_PUSHBUTTON,
        360, 475, 80, 24, hwnd_, (HMENU)IDC_ACCESSIBILITY_BTN, hInstance_, nullptr);

    hScreenInd_ = CreateWindow("STATIC", "", WS_VISIBLE | SS_ICON,
        35, 505, 20, 20, hwnd_, (HMENU)IDC_SCREEN_IND, hInstance_, nullptr);
    hScreenLabel_ = CreateWindow("STATIC", "Screen Recording", WS_VISIBLE | SS_LEFT,
        60, 507, 150, 20, hwnd_, (HMENU)IDC_SCREEN_LABEL, hInstance_, nullptr);
    hScreenBtn_ = CreateWindow("BUTTON", "Grant", WS_VISIBLE | BS_PUSHBUTTON,
        360, 505, 80, 24, hwnd_, (HMENU)IDC_SCREEN_BTN, hInstance_, nullptr);

    // Status Group
    CreateWindow("BUTTON", "Status", WS_VISIBLE | BS_GROUPBOX,
        20, 560, 440, 70, hwnd_, (HMENU)IDC_GROUP_STATUS, hInstance_, nullptr);

    hStatusLabel_ = CreateWindow("STATIC", "Server: Starting...", WS_VISIBLE | SS_LEFT,
        35, 580, 400, 20, hwnd_, (HMENU)IDC_STATUS_LABEL, hInstance_, nullptr);
    hUptimeLabel_ = CreateWindow("STATIC", "Uptime: 0s", WS_VISIBLE | SS_LEFT,
        35, 605, 400, 20, hwnd_, (HMENU)IDC_UPTIME_LABEL, hInstance_, nullptr);

    // Save Button
    hSave_ = CreateWindow("BUTTON", "Save", WS_VISIBLE | BS_DEFPUSHBUTTON,
        370, 630, 90, 32, hwnd_, (HMENU)IDC_SAVE, hInstance_, nullptr);
}

void SettingsWindow::layoutControls() {
    // Controls are positioned in createControls()
    // This method can be used for dynamic layout if needed
}

void SettingsWindow::updateControlStates() {
    int controlMode = getComboBoxSelection(IDC_CONTROL_MODE);
    bool manualMode = (controlMode == 2);

    EnableWindow(hControlAddress_, manualMode);
    EnableWindow(hControlKey_, manualMode);
    EnableWindow(hTestConnection_, manualMode);
}

std::string SettingsWindow::getControlText(int controlId) const {
    HWND hControl = GetDlgItem(hwnd_, controlId);
    if (!hControl) return "";

    int length = GetWindowTextLength(hControl);
    if (length == 0) return "";

    std::vector<char> buffer(length + 1);
    GetWindowTextA(hControl, buffer.data(), length + 1);
    return std::string(buffer.data());
}

void SettingsWindow::setControlText(int controlId, const std::string& text) {
    HWND hControl = GetDlgItem(hwnd_, controlId);
    if (hControl) {
        SetWindowTextA(hControl, text.c_str());
    }
}

int SettingsWindow::getComboBoxSelection(int controlId) const {
    HWND hControl = GetDlgItem(hwnd_, controlId);
    if (!hControl) return -1;
    return static_cast<int>(SendMessage(hControl, CB_GETCURSEL, 0, 0));
}

void SettingsWindow::setComboBoxSelection(int controlId, int index) {
    HWND hControl = GetDlgItem(hwnd_, controlId);
    if (hControl) {
        SendMessage(hControl, CB_SETCURSEL, index, 0);
    }
}

void SettingsWindow::loadSettings() {
    if (!appDelegate_) return;

    setAgentName(appDelegate_->getAgentName());
    
    std::string mode = appDelegate_->getNetworkMode();
    if (mode == "lan") {
        setComboBoxSelection(IDC_NETWORK_MODE, 1);
    } else if (mode == "wan") {
        setComboBoxSelection(IDC_NETWORK_MODE, 2);
    } else {
        setComboBoxSelection(IDC_NETWORK_MODE, 0);
    }

    setPort(appDelegate_->getPort());
    setApiKey(appDelegate_->getApiKey());

    std::string controlMode = appDelegate_->getControlServerMode();
    if (controlMode == "auto") {
        setComboBoxSelection(IDC_CONTROL_MODE, 1);
    } else if (controlMode == "manual") {
        setComboBoxSelection(IDC_CONTROL_MODE, 2);
    } else {
        setComboBoxSelection(IDC_CONTROL_MODE, 0);
    }

    setControlServerAddress(appDelegate_->getControlServerAddress());
    setControlServerKey(appDelegate_->getControlServerKey());

    updateControlStates();
}

void SettingsWindow::saveSettings() {
    if (!appDelegate_) return;

    appDelegate_->setAgentName(getAgentName());
    
    int modeIndex = getComboBoxSelection(IDC_NETWORK_MODE);
    std::string mode = "localhost";
    if (modeIndex == 1) mode = "lan";
    else if (modeIndex == 2) mode = "wan";
    appDelegate_->setNetworkMode(mode);

    appDelegate_->setPort(getPort());
    appDelegate_->setApiKey(getApiKey());

    int controlModeIndex = getComboBoxSelection(IDC_CONTROL_MODE);
    std::string controlMode = "disabled";
    if (controlModeIndex == 1) controlMode = "auto";
    else if (controlModeIndex == 2) controlMode = "manual";
    appDelegate_->setControlServerMode(controlMode);

    appDelegate_->setControlServerAddress(getControlServerAddress());
    appDelegate_->setControlServerKey(getControlServerKey());

    appDelegate_->saveSettings();
}

void SettingsWindow::updateStatus(const std::string& status, const std::string& uptime) {
    setControlText(IDC_STATUS_LABEL, "Server: " + status);
    setControlText(IDC_UPTIME_LABEL, "Uptime: " + uptime);
}

void SettingsWindow::updatePermissionIndicators(bool accessibility, bool screenRecording) {
    // Update icons (simplified - would need actual icon resources)
    // For now, just update text
    if (accessibility) {
        SetWindowTextA(hAccessibilityLabel_, "Accessibility: Granted ✓");
    } else {
        SetWindowTextA(hAccessibilityLabel_, "Accessibility: Not Granted ✗");
    }

    if (screenRecording) {
        SetWindowTextA(hScreenLabel_, "Screen Recording: Granted ✓");
    } else {
        SetWindowTextA(hScreenLabel_, "Screen Recording: Not Granted ✗");
    }
}

void SettingsWindow::updateConnectionStatus(const std::string& status, bool connected) {
    setControlText(IDC_CONNECTION_STATUS, "Status: " + status);
}

// Getters
std::string SettingsWindow::getAgentName() const { return getControlText(IDC_AGENT_NAME); }
std::string SettingsWindow::getNetworkMode() const {
    int index = getComboBoxSelection(IDC_NETWORK_MODE);
    if (index == 1) return "lan";
    if (index == 2) return "wan";
    return "localhost";
}
unsigned int SettingsWindow::getPort() const {
    std::string portStr = getControlText(IDC_PORT);
    if (portStr.empty()) return 3456;
    return static_cast<unsigned int>(std::stoi(portStr));
}
std::string SettingsWindow::getApiKey() const { return getControlText(IDC_API_KEY); }
std::string SettingsWindow::getControlServerMode() const {
    int index = getComboBoxSelection(IDC_CONTROL_MODE);
    if (index == 1) return "auto";
    if (index == 2) return "manual";
    return "disabled";
}
std::string SettingsWindow::getControlServerAddress() const { return getControlText(IDC_CONTROL_ADDRESS); }
std::string SettingsWindow::getControlServerKey() const { return getControlText(IDC_CONTROL_KEY); }

// Setters
void SettingsWindow::setAgentName(const std::string& name) { setControlText(IDC_AGENT_NAME, name); }
void SettingsWindow::setNetworkMode(const std::string& mode) {
    if (mode == "lan") setComboBoxSelection(IDC_NETWORK_MODE, 1);
    else if (mode == "wan") setComboBoxSelection(IDC_NETWORK_MODE, 2);
    else setComboBoxSelection(IDC_NETWORK_MODE, 0);
}
void SettingsWindow::setPort(unsigned int port) { setControlText(IDC_PORT, std::to_string(port)); }
void SettingsWindow::setApiKey(const std::string& key) { setControlText(IDC_API_KEY, key); }
void SettingsWindow::setControlServerMode(const std::string& mode) {
    if (mode == "auto") setComboBoxSelection(IDC_CONTROL_MODE, 1);
    else if (mode == "manual") setComboBoxSelection(IDC_CONTROL_MODE, 2);
    else setComboBoxSelection(IDC_CONTROL_MODE, 0);
    updateControlStates();
}
void SettingsWindow::setControlServerAddress(const std::string& address) { setControlText(IDC_CONTROL_ADDRESS, address); }
void SettingsWindow::setControlServerKey(const std::string& key) { setControlText(IDC_CONTROL_KEY, key); }

