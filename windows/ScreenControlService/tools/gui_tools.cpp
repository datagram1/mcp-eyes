/**
 * GUI Tools
 *
 * Screenshot, click, keyboard implementation using Win32 APIs.
 */

#include "gui_tools.h"
#include "../core/logger.h"
#include <vector>
#include <map>
#include <objidl.h>  // For IStream (needed by MinGW)
#include <gdiplus.h>

// MSVC-specific pragma (ignored by MinGW which uses CMake link flags)
#ifdef _MSC_VER
#pragma comment(lib, "gdiplus.lib")
#endif

// Define MOUSEEVENTF_HWHEEL if not available (older MinGW)
#ifndef MOUSEEVENTF_HWHEEL
#define MOUSEEVENTF_HWHEEL 0x01000
#endif

using json = nlohmann::json;

namespace ScreenControl
{

// Base64 encoding table
static const char base64_chars[] =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

std::string GuiTools::base64Encode(const std::vector<BYTE>& data)
{
    std::string result;
    size_t len = data.size();
    result.reserve(((len + 2) / 3) * 4);

    for (size_t i = 0; i < len; i += 3)
    {
        BYTE b1 = data[i];
        BYTE b2 = (i + 1 < len) ? data[i + 1] : 0;
        BYTE b3 = (i + 2 < len) ? data[i + 2] : 0;

        result.push_back(base64_chars[b1 >> 2]);
        result.push_back(base64_chars[((b1 & 0x03) << 4) | (b2 >> 4)]);
        result.push_back((i + 1 < len) ? base64_chars[((b2 & 0x0F) << 2) | (b3 >> 6)] : '=');
        result.push_back((i + 2 < len) ? base64_chars[b3 & 0x3F] : '=');
    }

    return result;
}

json GuiTools::screenshot()
{
    // Initialize GDI+
    Gdiplus::GdiplusStartupInput gdiplusStartupInput;
    ULONG_PTR gdiplusToken;
    Gdiplus::GdiplusStartup(&gdiplusToken, &gdiplusStartupInput, nullptr);

    // Get screen dimensions
    int screenWidth = GetSystemMetrics(SM_CXVIRTUALSCREEN);
    int screenHeight = GetSystemMetrics(SM_CYVIRTUALSCREEN);
    int screenX = GetSystemMetrics(SM_XVIRTUALSCREEN);
    int screenY = GetSystemMetrics(SM_YVIRTUALSCREEN);

    // Create device contexts
    HDC hdcScreen = GetDC(nullptr);
    HDC hdcMem = CreateCompatibleDC(hdcScreen);
    HBITMAP hBitmap = CreateCompatibleBitmap(hdcScreen, screenWidth, screenHeight);
    SelectObject(hdcMem, hBitmap);

    // Capture screen
    BitBlt(hdcMem, 0, 0, screenWidth, screenHeight, hdcScreen, screenX, screenY, SRCCOPY);

    // Convert to PNG using GDI+
    Gdiplus::Bitmap bitmap(hBitmap, nullptr);

    // Get PNG encoder CLSID
    CLSID pngClsid;
    {
        UINT num = 0, size = 0;
        Gdiplus::GetImageEncodersSize(&num, &size);
        std::vector<BYTE> buffer(size);
        auto pEncoders = reinterpret_cast<Gdiplus::ImageCodecInfo*>(buffer.data());
        Gdiplus::GetImageEncoders(num, size, pEncoders);

        for (UINT i = 0; i < num; ++i)
        {
            if (wcscmp(pEncoders[i].MimeType, L"image/png") == 0)
            {
                pngClsid = pEncoders[i].Clsid;
                break;
            }
        }
    }

    // Save to memory stream
    IStream* pStream = nullptr;
    CreateStreamOnHGlobal(nullptr, TRUE, &pStream);
    bitmap.Save(pStream, &pngClsid, nullptr);

    // Get stream size
    STATSTG stat;
    pStream->Stat(&stat, STATFLAG_NONAME);
    ULONG size = static_cast<ULONG>(stat.cbSize.QuadPart);

    // Read stream to vector
    std::vector<BYTE> pngData(size);
    LARGE_INTEGER li = {};
    pStream->Seek(li, STREAM_SEEK_SET, nullptr);
    ULONG bytesRead = 0;
    pStream->Read(pngData.data(), size, &bytesRead);

    // Cleanup
    pStream->Release();
    DeleteObject(hBitmap);
    DeleteDC(hdcMem);
    ReleaseDC(nullptr, hdcScreen);
    Gdiplus::GdiplusShutdown(gdiplusToken);

    // Base64 encode
    std::string base64 = base64Encode(pngData);

    return {
        {"success", true},
        {"image", "data:image/png;base64," + base64},
        {"width", screenWidth},
        {"height", screenHeight}
    };
}

POINT GuiTools::normalizedToScreen(double x, double y)
{
    int screenWidth = GetSystemMetrics(SM_CXVIRTUALSCREEN);
    int screenHeight = GetSystemMetrics(SM_CYVIRTUALSCREEN);
    int screenX = GetSystemMetrics(SM_XVIRTUALSCREEN);
    int screenY = GetSystemMetrics(SM_YVIRTUALSCREEN);

    POINT pt;
    pt.x = screenX + static_cast<int>(x * screenWidth);
    pt.y = screenY + static_cast<int>(y * screenHeight);
    return pt;
}

json GuiTools::click(int x, int y)
{
    // Move mouse
    SetCursorPos(x, y);

    // Simulate click
    INPUT input[2] = {};

    input[0].type = INPUT_MOUSE;
    input[0].mi.dwFlags = MOUSEEVENTF_LEFTDOWN;

    input[1].type = INPUT_MOUSE;
    input[1].mi.dwFlags = MOUSEEVENTF_LEFTUP;

    SendInput(2, input, sizeof(INPUT));

    return {{"success", true}, {"x", x}, {"y", y}};
}

json GuiTools::doubleClick(int x, int y)
{
    SetCursorPos(x, y);

    INPUT input[4] = {};

    for (int i = 0; i < 4; i += 2)
    {
        input[i].type = INPUT_MOUSE;
        input[i].mi.dwFlags = MOUSEEVENTF_LEFTDOWN;

        input[i + 1].type = INPUT_MOUSE;
        input[i + 1].mi.dwFlags = MOUSEEVENTF_LEFTUP;
    }

    SendInput(4, input, sizeof(INPUT));

    return {{"success", true}, {"x", x}, {"y", y}};
}

json GuiTools::rightClick(int x, int y)
{
    SetCursorPos(x, y);

    INPUT input[2] = {};

    input[0].type = INPUT_MOUSE;
    input[0].mi.dwFlags = MOUSEEVENTF_RIGHTDOWN;

    input[1].type = INPUT_MOUSE;
    input[1].mi.dwFlags = MOUSEEVENTF_RIGHTUP;

    SendInput(2, input, sizeof(INPUT));

    return {{"success", true}, {"x", x}, {"y", y}};
}

json GuiTools::scroll(int deltaX, int deltaY)
{
    INPUT input = {};
    input.type = INPUT_MOUSE;

    if (deltaY != 0)
    {
        input.mi.dwFlags = MOUSEEVENTF_WHEEL;
        input.mi.mouseData = static_cast<DWORD>(deltaY * WHEEL_DELTA);
        SendInput(1, &input, sizeof(INPUT));
    }

    if (deltaX != 0)
    {
        input.mi.dwFlags = MOUSEEVENTF_HWHEEL;
        input.mi.mouseData = static_cast<DWORD>(deltaX * WHEEL_DELTA);
        SendInput(1, &input, sizeof(INPUT));
    }

    return {{"success", true}, {"deltaX", deltaX}, {"deltaY", deltaY}};
}

json GuiTools::drag(int startX, int startY, int endX, int endY)
{
    // Move to start
    SetCursorPos(startX, startY);
    Sleep(50);

    // Mouse down
    INPUT input = {};
    input.type = INPUT_MOUSE;
    input.mi.dwFlags = MOUSEEVENTF_LEFTDOWN;
    SendInput(1, &input, sizeof(INPUT));

    // Move to end (smooth)
    int steps = 20;
    for (int i = 1; i <= steps; ++i)
    {
        int x = startX + (endX - startX) * i / steps;
        int y = startY + (endY - startY) * i / steps;
        SetCursorPos(x, y);
        Sleep(10);
    }

    // Mouse up
    input.mi.dwFlags = MOUSEEVENTF_LEFTUP;
    SendInput(1, &input, sizeof(INPUT));

    return {
        {"success", true},
        {"startX", startX}, {"startY", startY},
        {"endX", endX}, {"endY", endY}
    };
}

json GuiTools::moveMouse(int x, int y)
{
    SetCursorPos(x, y);
    return {{"success", true}, {"x", x}, {"y", y}};
}

json GuiTools::getCursorPosition()
{
    POINT pt;
    if (GetCursorPos(&pt))
    {
        return {{"success", true}, {"x", pt.x}, {"y", pt.y}};
    }
    return {{"success", false}, {"error", "Failed to get cursor position"}};
}

WORD GuiTools::getVirtualKeyCode(const std::string& key)
{
    // Map key names to virtual key codes
    static const std::map<std::string, WORD> keyMap = {
        {"Enter", VK_RETURN}, {"Return", VK_RETURN},
        {"Tab", VK_TAB},
        {"Escape", VK_ESCAPE}, {"Esc", VK_ESCAPE},
        {"Backspace", VK_BACK},
        {"Delete", VK_DELETE}, {"Del", VK_DELETE},
        {"Insert", VK_INSERT}, {"Ins", VK_INSERT},
        {"Home", VK_HOME},
        {"End", VK_END},
        {"PageUp", VK_PRIOR}, {"PgUp", VK_PRIOR},
        {"PageDown", VK_NEXT}, {"PgDn", VK_NEXT},
        {"ArrowUp", VK_UP}, {"Up", VK_UP},
        {"ArrowDown", VK_DOWN}, {"Down", VK_DOWN},
        {"ArrowLeft", VK_LEFT}, {"Left", VK_LEFT},
        {"ArrowRight", VK_RIGHT}, {"Right", VK_RIGHT},
        {"Space", VK_SPACE},
        {"F1", VK_F1}, {"F2", VK_F2}, {"F3", VK_F3}, {"F4", VK_F4},
        {"F5", VK_F5}, {"F6", VK_F6}, {"F7", VK_F7}, {"F8", VK_F8},
        {"F9", VK_F9}, {"F10", VK_F10}, {"F11", VK_F11}, {"F12", VK_F12},
        {"Control", VK_CONTROL}, {"Ctrl", VK_CONTROL},
        {"Alt", VK_MENU},
        {"Shift", VK_SHIFT},
        {"Win", VK_LWIN}, {"Windows", VK_LWIN}, {"Command", VK_LWIN}, {"Cmd", VK_LWIN},
    };

    auto it = keyMap.find(key);
    if (it != keyMap.end())
    {
        return it->second;
    }

    // Single character
    if (key.length() == 1)
    {
        return VkKeyScanA(key[0]) & 0xFF;
    }

    return 0;
}

json GuiTools::pressKey(const std::string& key, const std::vector<std::string>& modifiers)
{
    std::vector<INPUT> inputs;

    // Press modifiers
    for (const auto& mod : modifiers)
    {
        INPUT input = {};
        input.type = INPUT_KEYBOARD;
        input.ki.wVk = getVirtualKeyCode(mod);
        inputs.push_back(input);
    }

    // Press main key
    {
        INPUT input = {};
        input.type = INPUT_KEYBOARD;
        input.ki.wVk = getVirtualKeyCode(key);
        inputs.push_back(input);
    }

    // Release main key
    {
        INPUT input = {};
        input.type = INPUT_KEYBOARD;
        input.ki.wVk = getVirtualKeyCode(key);
        input.ki.dwFlags = KEYEVENTF_KEYUP;
        inputs.push_back(input);
    }

    // Release modifiers (reverse order)
    for (auto it = modifiers.rbegin(); it != modifiers.rend(); ++it)
    {
        INPUT input = {};
        input.type = INPUT_KEYBOARD;
        input.ki.wVk = getVirtualKeyCode(*it);
        input.ki.dwFlags = KEYEVENTF_KEYUP;
        inputs.push_back(input);
    }

    SendInput(static_cast<UINT>(inputs.size()), inputs.data(), sizeof(INPUT));

    return {{"success", true}, {"key", key}, {"modifiers", modifiers}};
}

json GuiTools::typeText(const std::string& text)
{
    std::vector<INPUT> inputs;

    for (char c : text)
    {
        // Key down
        INPUT input = {};
        input.type = INPUT_KEYBOARD;
        input.ki.wScan = c;
        input.ki.dwFlags = KEYEVENTF_UNICODE;
        inputs.push_back(input);

        // Key up
        input.ki.dwFlags = KEYEVENTF_UNICODE | KEYEVENTF_KEYUP;
        inputs.push_back(input);
    }

    SendInput(static_cast<UINT>(inputs.size()), inputs.data(), sizeof(INPUT));

    return {{"success", true}, {"text", text}, {"length", text.length()}};
}

} // namespace ScreenControl
