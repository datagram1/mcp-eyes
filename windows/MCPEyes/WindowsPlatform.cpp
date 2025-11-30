#include "WindowsPlatform.h"
#include "../../native/include/mcp_eyes.h"
#include <windows.h>
#include <psapi.h>
#include <uiautomation.h>
#include <gdiplus.h>
#include <comdef.h>
#include <shlwapi.h>
#include <tlhelp32.h>
#include <sstream>
#include <algorithm>
#include <map>
#include <set>
#include <vector>

#pragma comment(lib, "user32.lib")
#pragma comment(lib, "gdi32.lib")
#pragma comment(lib, "psapi.lib")
#pragma comment(lib, "uiautomationcore.lib")
#pragma comment(lib, "gdiplus.lib")
#pragma comment(lib, "shlwapi.lib")

using namespace Gdiplus;

namespace mcp_eyes {

// GDI+ initialization
static ULONG_PTR gdiplusToken = 0;
static int gdiplusRefCount = 0;

static void InitGDIPlus() {
    if (gdiplusRefCount++ == 0) {
        GdiplusStartupInput gdiplusStartupInput;
        GdiplusStartup(&gdiplusToken, &gdiplusStartupInput, nullptr);
    }
}

static void ShutdownGDIPlus() {
    if (--gdiplusRefCount == 0) {
        GdiplusShutdown(gdiplusToken);
    }
}

WindowsPlatform::WindowsPlatform() : focused_hwnd_(nullptr) {
    InitGDIPlus();
}

WindowsPlatform::~WindowsPlatform() {
    ShutdownGDIPlus();
}

std::string WindowsPlatform::os_name() const {
    return "windows";
}

std::string WindowsPlatform::os_version() const {
    OSVERSIONINFOEX osvi = {};
    osvi.dwOSVersionInfoSize = sizeof(OSVERSIONINFOEX);
    if (GetVersionEx((OSVERSIONINFO*)&osvi)) {
        std::ostringstream ss;
        ss << osvi.dwMajorVersion << "." << osvi.dwMinorVersion << "." << osvi.dwBuildNumber;
        return ss.str();
    }
    return "unknown";
}

std::string WindowsPlatform::arch() const {
    SYSTEM_INFO si;
    GetNativeSystemInfo(&si);
    switch (si.wProcessorArchitecture) {
        case PROCESSOR_ARCHITECTURE_AMD64:
            return "x64";
        case PROCESSOR_ARCHITECTURE_ARM64:
            return "arm64";
        case PROCESSOR_ARCHITECTURE_INTEL:
            return "x86";
        default:
            return "unknown";
    }
}

std::string WindowsPlatform::hostname() const {
    char hostname[256];
    DWORD size = sizeof(hostname);
    if (GetComputerNameA(hostname, &size)) {
        return std::string(hostname);
    }
    return "unknown";
}

Permissions WindowsPlatform::check_permissions() const {
    Permissions perms;
    // Windows doesn't require explicit permissions like macOS
    // UI Automation should work without special permissions
    perms.accessibility = true;
    perms.screen_recording = true;
    perms.automation = true;
    return perms;
}

bool WindowsPlatform::request_accessibility_permission() {
    // Windows doesn't require explicit permission
    return true;
}

bool WindowsPlatform::request_screen_recording_permission() {
    // Windows doesn't require explicit permission
    return true;
}

std::vector<AppInfo> WindowsPlatform::list_applications() const {
    std::vector<AppInfo> apps;
    auto windows = enumerate_windows();

    std::set<std::string> seenProcesses;

    for (const auto& win : windows) {
        if (!is_main_window(win.hwnd) || !is_window_visible(win.hwnd)) {
            continue;
        }

        std::string processKey = win.processName + ":" + std::to_string(win.pid);
        if (seenProcesses.find(processKey) != seenProcesses.end()) {
            continue;
        }
        seenProcesses.insert(processKey);

        AppInfo info;
        info.name = win.title.empty() ? win.processName : win.title;
        info.bundle_id = win.processName;  // Use process name as bundle ID equivalent
        info.pid = win.pid;
        info.bounds.x = win.bounds.left;
        info.bounds.y = win.bounds.top;
        info.bounds.width = win.bounds.right - win.bounds.left;
        info.bounds.height = win.bounds.bottom - win.bounds.top;

        apps.push_back(info);
    }

    return apps;
}

bool WindowsPlatform::focus_application(const std::string& identifier) {
    WindowInfo win = find_window_by_identifier(identifier);
    if (win.hwnd == nullptr) {
        return false;
    }

    // Restore if minimized
    if (IsIconic(win.hwnd)) {
        ShowWindow(win.hwnd, SW_RESTORE);
    }

    // Bring to foreground
    SetForegroundWindow(win.hwnd);
    BringWindowToTop(win.hwnd);
    SetFocus(win.hwnd);

    focused_hwnd_ = win.hwnd;

    // Update focused app info
    AppInfo info;
    info.name = win.title.empty() ? win.processName : win.title;
    info.bundle_id = win.processName;
    info.pid = win.pid;
    info.bounds.x = win.bounds.left;
    info.bounds.y = win.bounds.top;
    info.bounds.width = win.bounds.right - win.bounds.left;
    info.bounds.height = win.bounds.bottom - win.bounds.top;
    focused_app_ = info;

    return true;
}

AppInfo* WindowsPlatform::get_focused_app() {
    if (focused_app_.has_value()) {
        return &focused_app_.value();
    }
    return nullptr;
}

Screenshot WindowsPlatform::take_screenshot(const AppInfo* app, int padding) {
    Screenshot screenshot;

    if (app && focused_hwnd_) {
        screenshot.png_data = capture_window_to_png(focused_hwnd_);
    } else {
        screenshot.png_data = capture_screen_to_png();
    }

    // Get dimensions from image data
    if (!screenshot.png_data.empty()) {
        IStream* stream = nullptr;
        HGLOBAL hMem = GlobalAlloc(GMEM_MOVEABLE, screenshot.png_data.size());
        if (hMem) {
            void* pMem = GlobalLock(hMem);
            memcpy(pMem, screenshot.png_data.data(), screenshot.png_data.size());
            GlobalUnlock(hMem);

            CreateStreamOnHGlobal(hMem, TRUE, &stream);
            if (stream) {
                Bitmap* bitmap = Bitmap::FromStream(stream);
                if (bitmap) {
                    screenshot.width = bitmap->GetWidth();
                    screenshot.height = bitmap->GetHeight();
                    delete bitmap;
                }
                stream->Release();
            }
        }
    }

    return screenshot;
}

bool WindowsPlatform::click(int x, int y, bool right_button) {
    convert_to_absolute(x, y);

    INPUT input = {};
    input.type = INPUT_MOUSE;
    input.mi.dx = x;
    input.mi.dy = y;
    input.mi.dwFlags = MOUSEEVENTF_ABSOLUTE | MOUSEEVENTF_MOVE;

    if (right_button) {
        input.mi.dwFlags |= MOUSEEVENTF_RIGHTDOWN;
        SendInput(1, &input, sizeof(INPUT));
        input.mi.dwFlags = MOUSEEVENTF_RIGHTUP;
    } else {
        input.mi.dwFlags |= MOUSEEVENTF_LEFTDOWN;
        SendInput(1, &input, sizeof(INPUT));
        input.mi.dwFlags = MOUSEEVENTF_LEFTUP;
    }

    SendInput(1, &input, sizeof(INPUT));
    return true;
}

bool WindowsPlatform::move_mouse(int x, int y) {
    convert_to_absolute(x, y);

    INPUT input = {};
    input.type = INPUT_MOUSE;
    input.mi.dx = x;
    input.mi.dy = y;
    input.mi.dwFlags = MOUSEEVENTF_ABSOLUTE | MOUSEEVENTF_MOVE;

    SendInput(1, &input, sizeof(INPUT));
    return true;
}

bool WindowsPlatform::type_text(const std::string& text) {
    for (char c : text) {
        INPUT input = {};
        input.type = INPUT_KEYBOARD;
        input.ki.wVk = 0;
        input.ki.wScan = c;
        input.ki.dwFlags = KEYEVENTF_UNICODE;
        SendInput(1, &input, sizeof(INPUT));

        input.ki.dwFlags = KEYEVENTF_UNICODE | KEYEVENTF_KEYUP;
        SendInput(1, &input, sizeof(INPUT));

        Sleep(10);  // Small delay between keystrokes
    }
    return true;
}

bool WindowsPlatform::press_key(const std::string& key) {
    // Map key names to virtual key codes
    static std::map<std::string, WORD> keyMap = {
        {"return", VK_RETURN}, {"enter", VK_RETURN},
        {"tab", VK_TAB},
        {"space", VK_SPACE},
        {"delete", VK_DELETE}, {"backspace", VK_BACK},
        {"escape", VK_ESCAPE}, {"esc", VK_ESCAPE},
        {"left", VK_LEFT}, {"arrowleft", VK_LEFT},
        {"right", VK_RIGHT}, {"arrowright", VK_RIGHT},
        {"down", VK_DOWN}, {"arrowdown", VK_DOWN},
        {"up", VK_UP}, {"arrowup", VK_UP},
        {"f1", VK_F1}, {"f2", VK_F2}, {"f3", VK_F3}, {"f4", VK_F4},
        {"f5", VK_F5}, {"f6", VK_F6}, {"f7", VK_F7}, {"f8", VK_F8},
        {"f9", VK_F9}, {"f10", VK_F10}, {"f11", VK_F11}, {"f12", VK_F12},
    };

    // Handle modifier combinations
    WORD vk = 0;
    DWORD flags = 0;

    size_t plusPos = key.find('+');
    if (plusPos != std::string::npos) {
        std::string modifiers = key.substr(0, plusPos);
        std::string mainKey = key.substr(plusPos + 1);

        if (modifiers.find("ctrl") != std::string::npos || modifiers.find("control") != std::string::npos) {
            flags |= MOD_CONTROL;
        }
        if (modifiers.find("shift") != std::string::npos) {
            flags |= MOD_SHIFT;
        }
        if (modifiers.find("alt") != std::string::npos) {
            flags |= MOD_ALT;
        }
        if (modifiers.find("win") != std::string::npos || modifiers.find("command") != std::string::npos) {
            flags |= MOD_WIN;
        }

        auto it = keyMap.find(mainKey);
        if (it != keyMap.end()) {
            vk = it->second;
        }
    } else {
        auto it = keyMap.find(key);
        if (it != keyMap.end()) {
            vk = it->second;
        }
    }

    if (vk == 0) {
        return false;
    }

    // Press modifiers
    if (flags & MOD_CONTROL) {
        keybd_event(VK_CONTROL, 0, 0, 0);
    }
    if (flags & MOD_SHIFT) {
        keybd_event(VK_SHIFT, 0, 0, 0);
    }
    if (flags & MOD_ALT) {
        keybd_event(VK_MENU, 0, 0, 0);
    }
    if (flags & MOD_WIN) {
        keybd_event(VK_LWIN, 0, 0, 0);
    }

    // Press main key
    keybd_event(vk, 0, 0, 0);
    keybd_event(vk, 0, KEYEVENTF_KEYUP, 0);

    // Release modifiers
    if (flags & MOD_WIN) {
        keybd_event(VK_LWIN, 0, KEYEVENTF_KEYUP, 0);
    }
    if (flags & MOD_ALT) {
        keybd_event(VK_MENU, 0, KEYEVENTF_KEYUP, 0);
    }
    if (flags & MOD_SHIFT) {
        keybd_event(VK_SHIFT, 0, KEYEVENTF_KEYUP, 0);
    }
    if (flags & MOD_CONTROL) {
        keybd_event(VK_CONTROL, 0, KEYEVENTF_KEYUP, 0);
    }

    return true;
}

std::vector<UIElement> WindowsPlatform::get_clickable_elements(const std::string& app_name) {
    std::vector<UIElement> elements;

    if (!focused_hwnd_) {
        return elements;
    }

    // Initialize COM for UI Automation
    CoInitializeEx(nullptr, COINIT_APARTMENTTHREADED);

    IUIAutomation* automation = nullptr;
    CoCreateInstance(CLSID_CUIAutomation, nullptr, CLSCTX_INPROC_SERVER, IID_PPV_ARGS(&automation));

    if (!automation) {
        CoUninitialize();
        return elements;
    }

    IUIAutomationElement* root = nullptr;
    automation->ElementFromHandle(focused_hwnd_, &root);

    if (root) {
        // Find all clickable elements
        IUIAutomationCondition* condition = nullptr;
        VARIANT controlType;
        VariantInit(&controlType);
        controlType.vt = VT_I4;
        controlType.lVal = UIA_ButtonControlTypeId;
        automation->CreatePropertyCondition(UIA_ControlTypePropertyId, controlType, &condition);

        IUIAutomationElementArray* found = nullptr;
        root->FindAll(TreeScope_Descendants, condition, &found);

        if (found) {
            int count = 0;
            found->get_Length(&count);

            RECT windowRect;
            GetWindowRect(focused_hwnd_, &windowRect);
            int windowWidth = windowRect.right - windowRect.left;
            int windowHeight = windowRect.bottom - windowRect.top;

            for (int i = 0; i < count; ++i) {
                IUIAutomationElement* element = nullptr;
                found->GetElement(i, &element);

                if (element) {
                    UIElement uiElement;
                    uiElement.is_clickable = true;
                    uiElement.is_enabled = true;
                    uiElement.type = "button";

                    // Get bounds
                    RECT bounds;
                    element->get_CurrentBoundingRectangle(&bounds);
                    uiElement.bounds.x = bounds.left;
                    uiElement.bounds.y = bounds.top;
                    uiElement.bounds.width = bounds.right - bounds.left;
                    uiElement.bounds.height = bounds.bottom - bounds.top;

                    // Calculate normalized position
                    if (windowWidth > 0 && windowHeight > 0) {
                        uiElement.normalized_position.x = (bounds.left + bounds.right) / 2.0f - windowRect.left;
                        uiElement.normalized_position.x /= windowWidth;
                        uiElement.normalized_position.y = (bounds.top + bounds.bottom) / 2.0f - windowRect.top;
                        uiElement.normalized_position.y /= windowHeight;
                    }

                    // Get name
                    BSTR name;
                    element->get_CurrentName(&name);
                    if (name) {
                        _bstr_t bstrName(name, false);
                        uiElement.text = std::string((char*)bstrName);
                    }

                    elements.push_back(uiElement);
                    element->Release();
                }
            }
            found->Release();
        }

        if (condition) condition->Release();
        root->Release();
    }

    automation->Release();
    CoUninitialize();

    return elements;
}

std::vector<OCRResult> WindowsPlatform::perform_ocr(const Screenshot& screenshot) {
    // OCR not implemented in Windows version yet
    // Would require Tesseract or Windows OCR API
    return {};
}

// Helper methods

std::vector<WindowsPlatform::WindowInfo> WindowsPlatform::enumerate_windows() const {
    std::vector<WindowInfo> windows;

    struct EnumData {
        std::vector<WindowInfo>* windows;
        const WindowsPlatform* platform;
    } data = {&windows, this};

    EnumWindows([](HWND hwnd, LPARAM lParam) -> BOOL {
        EnumData* data = reinterpret_cast<EnumData*>(lParam);
        WindowInfo info;
        info.hwnd = hwnd;
        GetWindowThreadProcessId(hwnd, &info.pid);
        info.processName = data->platform->get_process_name(info.pid);
        info.bounds = data->platform->get_window_bounds(hwnd);

        char title[256];
        GetWindowTextA(hwnd, title, sizeof(title));
        info.title = title;

        data->windows->push_back(info);
        return TRUE;
    }, reinterpret_cast<LPARAM>(&data));

    return windows;
}

WindowsPlatform::WindowInfo WindowsPlatform::find_window_by_identifier(const std::string& identifier) const {
    WindowInfo result = {};

    // Try to find by process name
    auto windows = enumerate_windows();
    for (const auto& win : windows) {
        if (win.processName == identifier || win.title == identifier) {
            return win;
        }
    }

    // Try to find by PID
    try {
        DWORD pid = static_cast<DWORD>(std::stoi(identifier));
        for (const auto& win : windows) {
            if (win.pid == pid) {
                return win;
            }
        }
    } catch (...) {
        // Not a valid PID
    }

    return result;
}

std::string WindowsPlatform::get_process_name(DWORD pid) const {
    HANDLE hProcess = OpenProcess(PROCESS_QUERY_INFORMATION | PROCESS_VM_READ, FALSE, pid);
    if (!hProcess) {
        return "";
    }

    char processName[MAX_PATH];
    DWORD size = MAX_PATH;
    if (QueryFullProcessImageNameA(hProcess, 0, processName, &size)) {
        CloseHandle(hProcess);
        PathStripPathA(processName);
        return std::string(processName);
    }

    CloseHandle(hProcess);
    return "";
}

RECT WindowsPlatform::get_window_bounds(HWND hwnd) const {
    RECT rect = {};
    GetWindowRect(hwnd, &rect);
    return rect;
}

bool WindowsPlatform::is_window_visible(HWND hwnd) const {
    return IsWindowVisible(hwnd) != FALSE;
}

bool WindowsPlatform::is_main_window(HWND hwnd) const {
    return GetWindow(hwnd, GW_OWNER) == nullptr && IsWindowVisible(hwnd);
}

std::vector<uint8_t> WindowsPlatform::capture_screen_to_png() const {
    int width = GetSystemMetrics(SM_CXSCREEN);
    int height = GetSystemMetrics(SM_CYSCREEN);

    HDC hScreenDC = GetDC(nullptr);
    HDC hMemoryDC = CreateCompatibleDC(hScreenDC);
    HBITMAP hBitmap = CreateCompatibleBitmap(hScreenDC, width, height);
    SelectObject(hMemoryDC, hBitmap);
    BitBlt(hMemoryDC, 0, 0, width, height, hScreenDC, 0, 0, SRCCOPY);

    // Convert to PNG using GDI+
    std::vector<uint8_t> pngData;
    Bitmap* bitmap = Bitmap::FromHBITMAP(hBitmap, nullptr);
    if (bitmap) {
        IStream* stream = nullptr;
        CreateStreamOnHGlobal(nullptr, TRUE, &stream);
        if (stream) {
            CLSID clsid;
            GetEncoderClsid(L"image/png", &clsid);
            bitmap->Save(stream, &clsid, nullptr);
            
            STATSTG stat;
            stream->Stat(&stat, STATFLAG_NONAME);
            pngData.resize(stat.cbSize.LowPart);
            LARGE_INTEGER li = {};
            stream->Seek(li, STREAM_SEEK_SET, nullptr);
            stream->Read(pngData.data(), stat.cbSize.LowPart, nullptr);
            stream->Release();
        }
        delete bitmap;
    }

    DeleteObject(hBitmap);
    DeleteDC(hMemoryDC);
    ReleaseDC(nullptr, hScreenDC);

    return pngData;
}

std::vector<uint8_t> WindowsPlatform::capture_window_to_png(HWND hwnd) const {
    RECT rect;
    GetWindowRect(hwnd, &rect);
    int width = rect.right - rect.left;
    int height = rect.bottom - rect.top;

    HDC hWindowDC = GetWindowDC(hwnd);
    HDC hMemoryDC = CreateCompatibleDC(hWindowDC);
    HBITMAP hBitmap = CreateCompatibleBitmap(hWindowDC, width, height);
    SelectObject(hMemoryDC, hBitmap);
    PrintWindow(hwnd, hMemoryDC, 0);

    // Convert to PNG
    std::vector<uint8_t> pngData;
    Bitmap* bitmap = Bitmap::FromHBITMAP(hBitmap, nullptr);
    if (bitmap) {
        IStream* stream = nullptr;
        CreateStreamOnHGlobal(nullptr, TRUE, &stream);
        if (stream) {
            CLSID clsid;
            GetEncoderClsid(L"image/png", &clsid);
            bitmap->Save(stream, &clsid, nullptr);
            
            STATSTG stat;
            stream->Stat(&stat, STATFLAG_NONAME);
            pngData.resize(stat.cbSize.LowPart);
            LARGE_INTEGER li = {};
            stream->Seek(li, STREAM_SEEK_SET, nullptr);
            stream->Read(pngData.data(), stat.cbSize.LowPart, nullptr);
            stream->Release();
        }
        delete bitmap;
    }

    DeleteObject(hBitmap);
    DeleteDC(hMemoryDC);
    ReleaseDC(hwnd, hWindowDC);

    return pngData;
}

void WindowsPlatform::convert_to_absolute(int& x, int& y) const {
    if (focused_app_.has_value() && focused_hwnd_) {
        RECT rect;
        GetWindowRect(focused_hwnd_, &rect);
        int windowWidth = rect.right - rect.left;
        int windowHeight = rect.bottom - rect.top;

        // Assume x, y are normalized (0-1)
        x = rect.left + static_cast<int>(x * windowWidth);
        y = rect.top + static_cast<int>(y * windowHeight);
    }
}

// Helper to get PNG encoder CLSID
static int GetEncoderClsid(const WCHAR* format, CLSID* pClsid) {
    UINT num = 0;
    UINT size = 0;
    GetImageEncodersSize(&num, &size);
    if (size == 0) return -1;

    ImageCodecInfo* pImageCodecInfo = (ImageCodecInfo*)(malloc(size));
    if (pImageCodecInfo == nullptr) return -1;

    GetImageEncoders(num, size, pImageCodecInfo);

    for (UINT j = 0; j < num; ++j) {
        if (wcscmp(pImageCodecInfo[j].MimeType, format) == 0) {
            *pClsid = pImageCodecInfo[j].Clsid;
            free(pImageCodecInfo);
            return j;
        }
    }

    free(pImageCodecInfo);
    return -1;
}

} // namespace mcp_eyes

