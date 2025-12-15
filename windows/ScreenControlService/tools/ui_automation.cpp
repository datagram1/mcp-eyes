/**
 * UI Automation Tools
 *
 * Windows UI Automation implementation.
 * Note: Full UIAutomation COM interfaces require MSVC. MinGW builds use limited functionality.
 */

#include "ui_automation.h"
#include "../core/logger.h"
#include <windows.h>
#include <vector>

// UIAutomation COM interfaces have header conflicts in newer Windows SDKs
// Disable for now - use screenshot-based element detection instead
// TODO: Re-enable once header conflicts are resolved
#define HAS_UIAUTOMATION 0

#if 0  // Disabled due to SDK header conflicts
#ifdef _MSC_VER
#include <uiautomation.h>
#include <comdef.h>
#pragma comment(lib, "uiautomationcore.lib")
#undef HAS_UIAUTOMATION
#define HAS_UIAUTOMATION 1
#endif
#endif

using json = nlohmann::json;

namespace ScreenControl
{

// Helper to convert wstring to UTF-8 string
static std::string wstringToUtf8(const std::wstring& wstr)
{
    if (wstr.empty()) return std::string();
    int size = WideCharToMultiByte(CP_UTF8, 0, wstr.c_str(), -1, nullptr, 0, nullptr, nullptr);
    std::string str(size - 1, '\0');
    WideCharToMultiByte(CP_UTF8, 0, wstr.c_str(), -1, &str[0], size, nullptr, nullptr);
    return str;
}

struct WindowInfo
{
    HWND hwnd;
    std::wstring title;
    std::wstring className;
    RECT rect;
    bool visible;
    bool minimized;
};

BOOL CALLBACK UIAutomation::EnumWindowsProc(HWND hwnd, LPARAM lParam)
{
    auto* windows = reinterpret_cast<std::vector<WindowInfo>*>(lParam);

    if (!IsWindowVisible(hwnd))
        return TRUE;

    wchar_t title[256] = {};
    GetWindowTextW(hwnd, title, 256);

    if (wcslen(title) == 0)
        return TRUE;

    wchar_t className[256] = {};
    GetClassNameW(hwnd, className, 256);

    WindowInfo info;
    info.hwnd = hwnd;
    info.title = title;
    info.className = className;
    GetWindowRect(hwnd, &info.rect);
    info.visible = IsWindowVisible(hwnd) != FALSE;
    info.minimized = IsIconic(hwnd) != FALSE;

    windows->push_back(info);

    return TRUE;
}

json UIAutomation::getWindowList()
{
    std::vector<WindowInfo> windows;
    EnumWindows(EnumWindowsProc, reinterpret_cast<LPARAM>(&windows));

    json windowList = json::array();

    for (const auto& win : windows)
    {
        windowList.push_back({
            {"hwnd", reinterpret_cast<uintptr_t>(win.hwnd)},
            {"title", wstringToUtf8(win.title)},
            {"className", wstringToUtf8(win.className)},
            {"x", win.rect.left},
            {"y", win.rect.top},
            {"width", win.rect.right - win.rect.left},
            {"height", win.rect.bottom - win.rect.top},
            {"visible", win.visible},
            {"minimized", win.minimized}
        });
    }

    return {{"success", true}, {"windows", windowList}};
}

json UIAutomation::getClickableElements()
{
#if HAS_UIAUTOMATION
    CoInitializeEx(nullptr, COINIT_MULTITHREADED);

    IUIAutomation* pAutomation = nullptr;
    HRESULT hr = CoCreateInstance(
        __uuidof(CUIAutomation),
        nullptr,
        CLSCTX_INPROC_SERVER,
        __uuidof(IUIAutomation),
        reinterpret_cast<void**>(&pAutomation)
    );

    if (FAILED(hr) || !pAutomation)
    {
        CoUninitialize();
        return {{"success", false}, {"error", "Failed to initialize UI Automation"}};
    }

    IUIAutomationElement* pRoot = nullptr;
    hr = pAutomation->GetRootElement(&pRoot);

    if (FAILED(hr) || !pRoot)
    {
        pAutomation->Release();
        CoUninitialize();
        return {{"success", false}, {"error", "Failed to get root element"}};
    }

    // Get foreground window for focused elements
    HWND hwndFocus = GetForegroundWindow();
    IUIAutomationElement* pFocusWindow = nullptr;
    pAutomation->ElementFromHandle(hwndFocus, &pFocusWindow);

    // Create condition for clickable elements (buttons, links, etc.)
    IUIAutomationCondition* pCondition = nullptr;
    VARIANT var;
    var.vt = VT_I4;
    var.lVal = UIA_ButtonControlTypeId;

    pAutomation->CreatePropertyCondition(UIA_ControlTypePropertyId, var, &pCondition);

    json elements = json::array();

    // Find all matching elements
    if (pFocusWindow)
    {
        IUIAutomationElementArray* pElements = nullptr;
        hr = pFocusWindow->FindAll(TreeScope_Descendants, pCondition, &pElements);

        if (SUCCEEDED(hr) && pElements)
        {
            int count = 0;
            pElements->get_Length(&count);

            for (int i = 0; i < count && i < 100; ++i)  // Limit to 100 elements
            {
                IUIAutomationElement* pElement = nullptr;
                pElements->GetElement(i, &pElement);

                if (pElement)
                {
                    BSTR name = nullptr;
                    RECT rect = {};

                    pElement->get_CurrentName(&name);
                    pElement->get_CurrentBoundingRectangle(&rect);

                    if (name)
                    {
                        std::wstring wname(name);
                        elements.push_back({
                            {"index", i},
                            {"name", wstringToUtf8(wname)},
                            {"x", rect.left},
                            {"y", rect.top},
                            {"width", rect.right - rect.left},
                            {"height", rect.bottom - rect.top},
                            {"centerX", (rect.left + rect.right) / 2},
                            {"centerY", (rect.top + rect.bottom) / 2}
                        });
                        SysFreeString(name);
                    }

                    pElement->Release();
                }
            }

            pElements->Release();
        }

        pFocusWindow->Release();
    }

    if (pCondition) pCondition->Release();
    pRoot->Release();
    pAutomation->Release();
    CoUninitialize();

    return {{"success", true}, {"elements", elements}};
#else
    // MinGW build - UIAutomation not available
    return {
        {"success", false},
        {"error", "UIAutomation not available in this build. Use screenshot-based element detection."},
        {"elements", json::array()}
    };
#endif
}

json UIAutomation::getUIElements()
{
    // Similar to getClickableElements but returns all elements
    // For now, return the clickable elements
    return getClickableElements();
}

json UIAutomation::focusWindow(const std::string& title, HWND hwnd)
{
    if (hwnd)
    {
        SetForegroundWindow(hwnd);
        return {{"success", true}, {"hwnd", reinterpret_cast<uintptr_t>(hwnd)}};
    }

    // Find window by title
    std::wstring wtitle(title.begin(), title.end());
    HWND found = FindWindowW(nullptr, wtitle.c_str());

    if (found)
    {
        SetForegroundWindow(found);
        return {{"success", true}, {"title", title}, {"hwnd", reinterpret_cast<uintptr_t>(found)}};
    }

    // Try partial match
    std::vector<WindowInfo> windows;
    EnumWindows(EnumWindowsProc, reinterpret_cast<LPARAM>(&windows));

    for (const auto& win : windows)
    {
        std::string winTitle = wstringToUtf8(win.title);
        if (winTitle.find(title) != std::string::npos)
        {
            SetForegroundWindow(win.hwnd);
            return {{"success", true}, {"title", winTitle}, {"hwnd", reinterpret_cast<uintptr_t>(win.hwnd)}};
        }
    }

    return {{"success", false}, {"error", "Window not found: " + title}};
}

json UIAutomation::minimizeWindow(HWND hwnd)
{
    if (hwnd && IsWindow(hwnd))
    {
        ShowWindow(hwnd, SW_MINIMIZE);
        return {{"success", true}};
    }
    return {{"success", false}, {"error", "Invalid window handle"}};
}

json UIAutomation::maximizeWindow(HWND hwnd)
{
    if (hwnd && IsWindow(hwnd))
    {
        ShowWindow(hwnd, SW_MAXIMIZE);
        return {{"success", true}};
    }
    return {{"success", false}, {"error", "Invalid window handle"}};
}

json UIAutomation::closeWindow(HWND hwnd)
{
    if (hwnd && IsWindow(hwnd))
    {
        PostMessageW(hwnd, WM_CLOSE, 0, 0);
        return {{"success", true}};
    }
    return {{"success", false}, {"error", "Invalid window handle"}};
}

json UIAutomation::getActiveWindow()
{
    HWND hwnd = GetForegroundWindow();

    if (!hwnd)
    {
        return {{"success", false}, {"error", "No active window"}};
    }

    wchar_t title[256] = {};
    GetWindowTextW(hwnd, title, 256);

    wchar_t className[256] = {};
    GetClassNameW(hwnd, className, 256);

    RECT rect;
    GetWindowRect(hwnd, &rect);

    std::wstring wtitle(title);
    std::wstring wclassName(className);

    return {
        {"success", true},
        {"hwnd", reinterpret_cast<uintptr_t>(hwnd)},
        {"title", wstringToUtf8(wtitle)},
        {"className", wstringToUtf8(wclassName)},
        {"x", rect.left},
        {"y", rect.top},
        {"width", rect.right - rect.left},
        {"height", rect.bottom - rect.top}
    };
}

} // namespace ScreenControl
