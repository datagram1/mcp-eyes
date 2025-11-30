#include "AppDelegate.h"
#include "resource.h"
#include "WindowsPlatform.h"
#include <windows.h>
#include <shellapi.h>
#include <commctrl.h>
#include <shlobj.h>
#include <sstream>
#include <iomanip>
#include <random>
#include <fstream>
#include <nlohmann/json.hpp>
#include <ctime>

#pragma comment(lib, "user32.lib")
#pragma comment(lib, "shell32.lib")
#pragma comment(lib, "advapi32.lib")

using json = nlohmann::json;

// Registry key for settings
#define REGISTRY_KEY "Software\\MCPEyes"

AppDelegate::AppDelegate(HINSTANCE hInstance)
    : hInstance_(hInstance)
    , hwnd_(nullptr)
    , hMenu_(nullptr)
    , trayIconCreated_(false)
    , port_(3456)
    , startAtLogin_(false)
    , isRemoteMode_(false)
    , startTime_(GetTickCount())
    , statusTimer_(0)
{
    memset(&nid_, 0, sizeof(nid_));
    nid_.cbSize = sizeof(NOTIFYICONDATA);
    nid_.uFlags = NIF_ICON | NIF_MESSAGE | NIF_TIP;
    nid_.uCallbackMessage = WM_USER + 1;
    nid_.hIcon = LoadIcon(hInstance_, MAKEINTRESOURCE(IDI_TRAY_ICON));
    strcpy_s(nid_.szTip, "MCP-Eyes Agent");
}

AppDelegate::~AppDelegate() {
    shutdown();
}

bool AppDelegate::initialize() {
    // Create hidden window for tray app
    WNDCLASSEX wc = {};
    wc.cbSize = sizeof(WNDCLASSEX);
    wc.lpfnWndProc = WindowProc;
    wc.hInstance = hInstance_;
    wc.lpszClassName = "MCPEyesWindowClass";
    wc.hIcon = LoadIcon(hInstance_, MAKEINTRESOURCE(IDI_APP_ICON));
    wc.hCursor = LoadCursor(nullptr, IDC_ARROW);

    if (!RegisterClassEx(&wc)) {
        return false;
    }

    hwnd_ = CreateWindowEx(
        0,
        "MCPEyesWindowClass",
        "MCP-Eyes",
        0,
        0, 0, 0, 0,
        nullptr, nullptr, hInstance_, this
    );

    if (!hwnd_) {
        return false;
    }

    // Load settings
    loadSettings();

    // Create platform
    platform_ = std::make_unique<mcp_eyes::WindowsPlatform>();

    // Create server
    mcpServer_ = std::make_unique<mcp_eyes::MCPServer>(port_, apiKey_);
    mcpServer_->setDelegate(this);
    mcpServer_->setPlatform(platform_.get());

    // Create tray icon
    createTrayIcon();

    // Create context menu
    createContextMenu();

    // Start server
    startServer();

    // Start status update timer
    statusTimer_ = SetTimer(hwnd_, 1, 5000, nullptr);  // 5 seconds

    // Initial status update
    updateStatus();

    return true;
}

void AppDelegate::run() {
    MSG msg;
    while (GetMessage(&msg, nullptr, 0, 0)) {
        TranslateMessage(&msg);
        DispatchMessage(&msg);
    }
}

void AppDelegate::shutdown() {
    if (statusTimer_) {
        KillTimer(hwnd_, statusTimer_);
        statusTimer_ = 0;
    }

    stopServer();
    removeTrayIcon();

    if (hMenu_) {
        DestroyMenu(hMenu_);
        hMenu_ = nullptr;
    }

    if (hwnd_) {
        DestroyWindow(hwnd_);
        hwnd_ = nullptr;
    }
}

LRESULT CALLBACK AppDelegate::WindowProc(HWND hwnd, UINT uMsg, WPARAM wParam, LPARAM lParam) {
    AppDelegate* app = nullptr;

    if (uMsg == WM_NCCREATE) {
        CREATESTRUCT* cs = (CREATESTRUCT*)lParam;
        app = (AppDelegate*)cs->lpCreateParams;
        SetWindowLongPtr(hwnd, GWLP_USERDATA, (LONG_PTR)app);
    } else {
        app = (AppDelegate*)GetWindowLongPtr(hwnd, GWLP_USERDATA);
    }

    if (app) {
        return app->handleMessage(uMsg, wParam, lParam);
    }

    return DefWindowProc(hwnd, uMsg, wParam, lParam);
}

LRESULT AppDelegate::handleMessage(UINT uMsg, WPARAM wParam, LPARAM lParam) {
    switch (uMsg) {
        case WM_USER + 1:  // Tray icon message
            if (lParam == WM_RBUTTONUP || lParam == WM_LBUTTONUP) {
                POINT pt;
                GetCursorPos(&pt);
                SetForegroundWindow(hwnd_);
                TrackPopupMenu(hMenu_, TPM_RIGHTBUTTON, pt.x, pt.y, 0, hwnd_, nullptr);
                PostMessage(hwnd_, WM_NULL, 0, 0);
            }
            return 0;

        case WM_COMMAND:
            handleMenuCommand(wParam);
            return 0;

        case WM_TIMER:
            if (wParam == 1) {
                updateStatus();
            }
            return 0;

        case WM_DESTROY:
            PostQuitMessage(0);
            return 0;
    }

    return DefWindowProc(hwnd_, uMsg, wParam, lParam);
}

void AppDelegate::createTrayIcon() {
    nid_.hWnd = hwnd_;
    Shell_NotifyIcon(NIM_ADD, &nid_);
    trayIconCreated_ = true;
}

void AppDelegate::updateTrayIcon(bool locked) {
    // Update icon if needed (locked state)
    // For now, just update tooltip
    if (isServerRunning()) {
        strcpy_s(nid_.szTip, "MCP-Eyes Agent - Running");
    } else {
        strcpy_s(nid_.szTip, "MCP-Eyes Agent - Stopped");
    }
    Shell_NotifyIcon(NIM_MODIFY, &nid_);
}

void AppDelegate::removeTrayIcon() {
    if (trayIconCreated_) {
        Shell_NotifyIcon(NIM_DELETE, &nid_);
        trayIconCreated_ = false;
    }
}

void AppDelegate::createContextMenu() {
    hMenu_ = CreatePopupMenu();

    // Header
    AppendMenu(hMenu_, MF_STRING | MF_DISABLED, IDM_STATUS, "MCP-Eyes Agent");
    AppendMenu(hMenu_, MF_SEPARATOR, 0, nullptr);

    // Status
    AppendMenu(hMenu_, MF_STRING | MF_DISABLED, IDM_STATUS, "Starting...");
    AppendMenu(hMenu_, MF_SEPARATOR, 0, nullptr);

    // Settings
    AppendMenu(hMenu_, MF_STRING, IDM_SETTINGS, "Settings...\tCtrl+,");
    AppendMenu(hMenu_, MF_STRING, IDM_COPY_API_KEY, "Copy API Key\tCtrl+K");
    AppendMenu(hMenu_, MF_SEPARATOR, 0, nullptr);

    // Permissions submenu
    HMENU hPermMenu = CreatePopupMenu();
    AppendMenu(hPermMenu, MF_STRING, IDM_ACCESSIBILITY, "Accessibility: Checking...");
    AppendMenu(hPermMenu, MF_STRING, IDM_SCREEN_RECORDING, "Screen Recording: Checking...");
    AppendMenu(hMenu_, MF_STRING | MF_POPUP, (UINT_PTR)hPermMenu, "Permissions");
    AppendMenu(hMenu_, MF_SEPARATOR, 0, nullptr);

    // Start at login
    AppendMenu(hMenu_, MF_STRING | (startAtLogin_ ? MF_CHECKED : 0), IDM_START_AT_LOGIN, "Start at Login");
    AppendMenu(hMenu_, MF_SEPARATOR, 0, nullptr);

    // Quit
    AppendMenu(hMenu_, MF_STRING, IDM_QUIT, "Quit MCP-Eyes\tCtrl+Q");
}

void AppDelegate::updateContextMenu() {
    if (!hMenu_) return;

    DestroyMenu(hMenu_);
    createContextMenu();
}

void AppDelegate::updateStatusMenu() {
    updateContextMenu();
}

void AppDelegate::handleMenuCommand(WPARAM wParam) {
    switch (LOWORD(wParam)) {
        case IDM_SETTINGS:
            openSettings();
            break;
        case IDM_COPY_API_KEY:
            copyApiKey();
            break;
        case IDM_ACCESSIBILITY:
            openAccessibilitySettings();
            break;
        case IDM_SCREEN_RECORDING:
            openScreenRecordingSettings();
            break;
        case IDM_START_AT_LOGIN:
            toggleStartAtLogin();
            break;
        case IDM_QUIT:
            quit();
            break;
    }
}

void AppDelegate::openSettings() {
    if (!settingsWindow_) {
        settingsWindow_ = std::make_unique<SettingsWindow>(hInstance_, this);
        settingsWindow_->create();
    }
    settingsWindow_->loadSettings();
    settingsWindow_->show();
}

void AppDelegate::closeSettings() {
    if (settingsWindow_) {
        settingsWindow_->hide();
    }
}

void AppDelegate::startServer() {
    if (mcpServer_ && !mcpServer_->isRunning()) {
        mcpServer_->start();
    }
}

void AppDelegate::stopServer() {
    if (mcpServer_ && mcpServer_->isRunning()) {
        mcpServer_->stop();
    }
}

void AppDelegate::restartServer() {
    stopServer();
    Sleep(500);
    startServer();
}

void AppDelegate::copyApiKey() {
    if (OpenClipboard(hwnd_)) {
        EmptyClipboard();
        HGLOBAL hMem = GlobalAlloc(GMEM_MOVEABLE, apiKey_.length() + 1);
        if (hMem) {
            memcpy(GlobalLock(hMem), apiKey_.c_str(), apiKey_.length() + 1);
            GlobalUnlock(hMem);
            SetClipboardData(CF_TEXT, hMem);
        }
        CloseClipboard();
    }
}

void AppDelegate::toggleStartAtLogin() {
    startAtLogin_ = !startAtLogin_;
    enableStartAtLogin(startAtLogin_);
    updateContextMenu();
}

void AppDelegate::openAccessibilitySettings() {
    // Windows doesn't have a specific accessibility settings page
    // Open Ease of Access settings
    ShellExecute(nullptr, "open", "ms-settings:easeofaccess", nullptr, nullptr, SW_SHOW);
}

void AppDelegate::openScreenRecordingSettings() {
    // Windows doesn't require explicit screen recording permission
    // Open Privacy settings
    ShellExecute(nullptr, "open", "ms-settings:privacy", nullptr, nullptr, SW_SHOW);
}

void AppDelegate::quit() {
    PostMessage(hwnd_, WM_QUIT, 0, 0);
}

void AppDelegate::loadSettings() {
    agentName_ = loadSetting("AgentName");
    if (agentName_.empty()) {
        char hostname[256];
        DWORD size = sizeof(hostname);
        if (GetComputerNameA(hostname, &size)) {
            agentName_ = hostname;
        } else {
            agentName_ = "My Windows PC";
        }
    }

    networkMode_ = loadSetting("NetworkMode", "localhost");
    std::string portStr = loadSetting("Port", "3456");
    port_ = static_cast<unsigned int>(std::stoi(portStr));

    apiKey_ = loadOrGenerateApiKey();

    controlServerMode_ = loadSetting("ControlServerMode", "disabled");
    controlServerAddress_ = loadSetting("ControlServerAddress", "");
    controlServerKey_ = loadSetting("ControlServerKey", "");

    startAtLogin_ = isStartAtLoginEnabled();
}

void AppDelegate::saveSettings() {
    saveSetting("AgentName", agentName_);
    saveSetting("NetworkMode", networkMode_);
    saveSetting("Port", std::to_string(port_));
    saveSetting("APIKey", apiKey_);
    saveSetting("ControlServerMode", controlServerMode_);
    saveSetting("ControlServerAddress", controlServerAddress_);
    saveSetting("ControlServerKey", controlServerKey_);
}

void AppDelegate::saveTokenFile() {
    char userProfile[MAX_PATH];
    if (SUCCEEDED(SHGetFolderPathA(nullptr, CSIDL_PROFILE, nullptr, SHGFP_TYPE_CURRENT, userProfile))) {
        std::string tokenPath = std::string(userProfile) + "\\.mcp-eyes-token";

        json tokenData = {
            {"apiKey", apiKey_},
            {"port", port_},
            {"host", "127.0.0.1"},
            {"createdAt", ""}  // ISO8601 timestamp
        };

        std::ofstream file(tokenPath);
        if (file.is_open()) {
            file << tokenData.dump(2);
            file.close();
        }
    }
}

void AppDelegate::updateStatus() {
    if (!hMenu_) return;

    std::string status;
    if (isScreenLocked()) {
        status = "Screen Locked - waiting...";
    } else if (isServerRunning()) {
        status = "Running on port " + std::to_string(port_);
        if (isRemoteMode_) {
            status += " (Remote)";
        }
    } else {
        status = "Stopped";
    }

    currentStatus_ = status;

    // Update menu item
    MENUITEMINFO mii = {};
    mii.cbSize = sizeof(MENUITEMINFO);
    mii.fMask = MIIM_STRING;
    mii.dwTypeData = const_cast<char*>(status.c_str());
    mii.cch = static_cast<UINT>(status.length());
    SetMenuItemInfo(hMenu_, IDM_STATUS, FALSE, &mii);

    // Update tray icon
    updateTrayIcon(isScreenLocked());

    // Update settings window if open
    if (settingsWindow_ && settingsWindow_->isVisible()) {
        DWORD uptime = (GetTickCount() - startTime_) / 1000;
        std::string uptimeStr;
        if (uptime < 60) {
            uptimeStr = std::to_string(uptime) + "s";
        } else if (uptime < 3600) {
            uptimeStr = std::to_string(uptime / 60) + "m " + std::to_string(uptime % 60) + "s";
        } else {
            uptimeStr = std::to_string(uptime / 3600) + "h " + std::to_string((uptime / 60) % 60) + "m";
        }
        settingsWindow_->updateStatus(status, uptimeStr);
    }
}

bool AppDelegate::isScreenLocked() const {
    // Check if screen is locked (simplified check)
    // Windows doesn't have a direct API like macOS
    // Could check for lock screen process or use SystemParametersInfo
    return false;  // TODO: Implement proper check
}

void AppDelegate::saveSetting(const std::string& key, const std::string& value) {
    HKEY hKey;
    if (RegCreateKeyExA(HKEY_CURRENT_USER, REGISTRY_KEY, 0, nullptr, 0, KEY_WRITE, nullptr, &hKey, nullptr) == ERROR_SUCCESS) {
        RegSetValueExA(hKey, key.c_str(), 0, REG_SZ, (const BYTE*)value.c_str(), static_cast<DWORD>(value.length() + 1));
        RegCloseKey(hKey);
    }
}

std::string AppDelegate::loadSetting(const std::string& key, const std::string& defaultValue) {
    HKEY hKey;
    if (RegOpenKeyExA(HKEY_CURRENT_USER, REGISTRY_KEY, 0, KEY_READ, &hKey) == ERROR_SUCCESS) {
        char buffer[1024];
        DWORD size = sizeof(buffer);
        if (RegQueryValueExA(hKey, key.c_str(), nullptr, nullptr, (LPBYTE)buffer, &size) == ERROR_SUCCESS) {
            RegCloseKey(hKey);
            return std::string(buffer);
        }
        RegCloseKey(hKey);
    }
    return defaultValue;
}

std::string AppDelegate::generateApiKey() {
    std::random_device rd;
    std::mt19937 gen(rd());
    std::uniform_int_distribution<> dis(0, 255);

    std::stringstream ss;
    ss << std::hex << std::setfill('0');
    for (int i = 0; i < 32; ++i) {
        ss << std::setw(2) << dis(gen);
    }
    return ss.str();
}

std::string AppDelegate::loadOrGenerateApiKey() {
    std::string key = loadSetting("APIKey");
    if (key.empty()) {
        key = generateApiKey();
        saveSetting("APIKey", key);
    }
    return key;
}

bool AppDelegate::isStartAtLoginEnabled() const {
    HKEY hKey;
    if (RegOpenKeyExA(HKEY_CURRENT_USER, "Software\\Microsoft\\Windows\\CurrentVersion\\Run", 0, KEY_READ, &hKey) == ERROR_SUCCESS) {
        char buffer[MAX_PATH];
        DWORD size = sizeof(buffer);
        if (RegQueryValueExA(hKey, "MCPEyes", nullptr, nullptr, (LPBYTE)buffer, &size) == ERROR_SUCCESS) {
            RegCloseKey(hKey);
            return true;
        }
        RegCloseKey(hKey);
    }
    return false;
}

void AppDelegate::enableStartAtLogin(bool enable) {
    HKEY hKey;
    if (RegOpenKeyExA(HKEY_CURRENT_USER, "Software\\Microsoft\\Windows\\CurrentVersion\\Run", 0, KEY_WRITE, &hKey) == ERROR_SUCCESS) {
        if (enable) {
            char exePath[MAX_PATH];
            GetModuleFileNameA(nullptr, exePath, MAX_PATH);
            RegSetValueExA(hKey, "MCPEyes", 0, REG_SZ, (const BYTE*)exePath, static_cast<DWORD>(strlen(exePath) + 1));
        } else {
            RegDeleteValueA(hKey, "MCPEyes");
        }
        RegCloseKey(hKey);
    }
}

void AppDelegate::serverDidStart(unsigned int port) {
    port_ = port;
    saveTokenFile();
    updateStatus();
}

void AppDelegate::serverDidStop() {
    updateStatus();
}

void AppDelegate::serverDidReceiveRequest(const std::string& path) {
    // Log request if needed
}

std::string AppDelegate::generateApiKey() {
    std::random_device rd;
    std::mt19937 gen(rd());
    std::uniform_int_distribution<> dis(0, 255);

    std::stringstream ss;
    ss << std::hex << std::setfill('0');
    for (int i = 0; i < 32; ++i) {
        ss << std::setw(2) << dis(gen);
    }
    return ss.str();
}

