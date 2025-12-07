/**
 * GUI Tools Implementation
 *
 * X11 screenshot using XGetImage, input using XTest extension.
 * Wayland screenshot using xdg-desktop-portal D-Bus interface.
 */

#include "gui_tools.h"
#include "../core/logger.h"
#include <X11/Xlib.h>
#include <X11/Xutil.h>
#include <X11/extensions/XTest.h>
#include <X11/extensions/Xrandr.h>
#include <X11/keysym.h>
#include <cstring>
#include <cstdlib>
#include <fstream>
#include <sstream>
#include <vector>
#include <map>

using json = nlohmann::json;

namespace ScreenControl
{

// Base64 encoding table
static const char base64Chars[] =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

std::string GuiTools::encodeBase64(const unsigned char* data, size_t length)
{
    std::string result;
    result.reserve(((length + 2) / 3) * 4);

    for (size_t i = 0; i < length; i += 3)
    {
        unsigned int val = data[i] << 16;
        if (i + 1 < length) val |= data[i + 1] << 8;
        if (i + 2 < length) val |= data[i + 2];

        result += base64Chars[(val >> 18) & 0x3F];
        result += base64Chars[(val >> 12) & 0x3F];
        result += (i + 1 < length) ? base64Chars[(val >> 6) & 0x3F] : '=';
        result += (i + 2 < length) ? base64Chars[val & 0x3F] : '=';
    }

    return result;
}

bool GuiTools::isWayland()
{
    const char* waylandDisplay = getenv("WAYLAND_DISPLAY");
    const char* xdgSessionType = getenv("XDG_SESSION_TYPE");

    if (waylandDisplay != nullptr)
        return true;

    if (xdgSessionType != nullptr && strcmp(xdgSessionType, "wayland") == 0)
        return true;

    return false;
}

json GuiTools::screenshot(int quality)
{
    if (isWayland())
    {
        return screenshotWayland(quality);
    }
    return screenshotX11(quality);
}

json GuiTools::screenshotX11(int quality)
{
    Display* display = XOpenDisplay(nullptr);
    if (!display)
    {
        return {{"success", false}, {"error", "Cannot open X display"}};
    }

    Window root = DefaultRootWindow(display);
    XWindowAttributes attrs;
    XGetWindowAttributes(display, root, &attrs);

    int width = attrs.width;
    int height = attrs.height;

    XImage* image = XGetImage(display, root, 0, 0, width, height, AllPlanes, ZPixmap);
    if (!image)
    {
        XCloseDisplay(display);
        return {{"success", false}, {"error", "Failed to capture screen"}};
    }

    // Convert to PPM format (simple, then we'd convert to PNG/JPEG)
    // For now, create raw RGB data and base64 encode
    std::vector<unsigned char> rgbData;
    rgbData.reserve(width * height * 3);

    for (int y = 0; y < height; y++)
    {
        for (int x = 0; x < width; x++)
        {
            unsigned long pixel = XGetPixel(image, x, y);

            unsigned char r = (pixel >> 16) & 0xFF;
            unsigned char g = (pixel >> 8) & 0xFF;
            unsigned char b = pixel & 0xFF;

            rgbData.push_back(r);
            rgbData.push_back(g);
            rgbData.push_back(b);
        }
    }

    XDestroyImage(image);
    XCloseDisplay(display);

    // Create simple BMP header + data (easier than PNG without external libs)
    // In production, use libpng or stb_image_write
    std::vector<unsigned char> bmpData;

    // BMP header (54 bytes)
    int rowSize = (width * 3 + 3) & ~3;  // Row size padded to 4 bytes
    int dataSize = rowSize * height;
    int fileSize = 54 + dataSize;

    // File header (14 bytes)
    bmpData.push_back('B');
    bmpData.push_back('M');
    bmpData.push_back(fileSize & 0xFF);
    bmpData.push_back((fileSize >> 8) & 0xFF);
    bmpData.push_back((fileSize >> 16) & 0xFF);
    bmpData.push_back((fileSize >> 24) & 0xFF);
    bmpData.push_back(0); bmpData.push_back(0);  // Reserved
    bmpData.push_back(0); bmpData.push_back(0);  // Reserved
    bmpData.push_back(54); bmpData.push_back(0); bmpData.push_back(0); bmpData.push_back(0);  // Offset

    // DIB header (40 bytes)
    bmpData.push_back(40); bmpData.push_back(0); bmpData.push_back(0); bmpData.push_back(0);
    bmpData.push_back(width & 0xFF);
    bmpData.push_back((width >> 8) & 0xFF);
    bmpData.push_back((width >> 16) & 0xFF);
    bmpData.push_back((width >> 24) & 0xFF);
    bmpData.push_back(height & 0xFF);
    bmpData.push_back((height >> 8) & 0xFF);
    bmpData.push_back((height >> 16) & 0xFF);
    bmpData.push_back((height >> 24) & 0xFF);
    bmpData.push_back(1); bmpData.push_back(0);  // Planes
    bmpData.push_back(24); bmpData.push_back(0);  // Bits per pixel
    for (int i = 0; i < 24; i++) bmpData.push_back(0);  // Rest of header

    // Pixel data (bottom-up, BGR)
    for (int y = height - 1; y >= 0; y--)
    {
        for (int x = 0; x < width; x++)
        {
            int idx = (y * width + x) * 3;
            bmpData.push_back(rgbData[idx + 2]);  // B
            bmpData.push_back(rgbData[idx + 1]);  // G
            bmpData.push_back(rgbData[idx]);      // R
        }
        // Padding
        int padding = rowSize - width * 3;
        for (int p = 0; p < padding; p++)
        {
            bmpData.push_back(0);
        }
    }

    std::string base64 = encodeBase64(bmpData.data(), bmpData.size());

    return {
        {"success", true},
        {"width", width},
        {"height", height},
        {"format", "bmp"},
        {"data", base64}
    };
}

json GuiTools::screenshotWayland(int quality)
{
    // For Wayland, use xdg-desktop-portal via D-Bus or gnome-screenshot as fallback
    // This is a simplified implementation using gnome-screenshot

    std::string tempFile = "/tmp/screencontrol_screenshot_" + std::to_string(getpid()) + ".png";

    std::string cmd = "gnome-screenshot -f " + tempFile + " 2>/dev/null || " +
                      "grim " + tempFile + " 2>/dev/null || " +
                      "spectacle -b -n -o " + tempFile + " 2>/dev/null";

    int result = system(cmd.c_str());
    if (result != 0)
    {
        return {{"success", false}, {"error", "No screenshot tool available (gnome-screenshot, grim, or spectacle)"}};
    }

    // Read the file
    std::ifstream file(tempFile, std::ios::binary);
    if (!file)
    {
        return {{"success", false}, {"error", "Failed to read screenshot file"}};
    }

    std::vector<unsigned char> data((std::istreambuf_iterator<char>(file)),
                                     std::istreambuf_iterator<char>());
    file.close();

    // Clean up temp file
    unlink(tempFile.c_str());

    std::string base64 = encodeBase64(data.data(), data.size());

    return {
        {"success", true},
        {"format", "png"},
        {"data", base64}
    };
}

json GuiTools::click(int x, int y, const std::string& button, int clicks)
{
    Display* display = XOpenDisplay(nullptr);
    if (!display)
    {
        return {{"success", false}, {"error", "Cannot open X display"}};
    }

    // Move mouse
    Window root = DefaultRootWindow(display);
    XWarpPointer(display, None, root, 0, 0, 0, 0, x, y);
    XFlush(display);

    // Determine button
    unsigned int btn = Button1;  // Left
    if (button == "right") btn = Button3;
    else if (button == "middle") btn = Button2;

    // Click
    for (int i = 0; i < clicks; i++)
    {
        XTestFakeButtonEvent(display, btn, True, CurrentTime);
        XFlush(display);
        usleep(50000);  // 50ms
        XTestFakeButtonEvent(display, btn, False, CurrentTime);
        XFlush(display);
        if (i < clicks - 1) usleep(100000);  // 100ms between clicks
    }

    XCloseDisplay(display);

    return {
        {"success", true},
        {"x", x},
        {"y", y},
        {"button", button},
        {"clicks", clicks}
    };
}

json GuiTools::moveMouse(int x, int y)
{
    Display* display = XOpenDisplay(nullptr);
    if (!display)
    {
        return {{"success", false}, {"error", "Cannot open X display"}};
    }

    Window root = DefaultRootWindow(display);
    XWarpPointer(display, None, root, 0, 0, 0, 0, x, y);
    XFlush(display);
    XCloseDisplay(display);

    return {{"success", true}, {"x", x}, {"y", y}};
}

json GuiTools::scroll(int x, int y, int deltaX, int deltaY)
{
    Display* display = XOpenDisplay(nullptr);
    if (!display)
    {
        return {{"success", false}, {"error", "Cannot open X display"}};
    }

    Window root = DefaultRootWindow(display);
    XWarpPointer(display, None, root, 0, 0, 0, 0, x, y);
    XFlush(display);

    // Scroll (button 4 = up, 5 = down, 6 = left, 7 = right)
    if (deltaY != 0)
    {
        unsigned int btn = (deltaY < 0) ? Button4 : Button5;
        int count = abs(deltaY);
        for (int i = 0; i < count; i++)
        {
            XTestFakeButtonEvent(display, btn, True, CurrentTime);
            XTestFakeButtonEvent(display, btn, False, CurrentTime);
        }
    }

    if (deltaX != 0)
    {
        unsigned int btn = (deltaX < 0) ? 6 : 7;
        int count = abs(deltaX);
        for (int i = 0; i < count; i++)
        {
            XTestFakeButtonEvent(display, btn, True, CurrentTime);
            XTestFakeButtonEvent(display, btn, False, CurrentTime);
        }
    }

    XFlush(display);
    XCloseDisplay(display);

    return {{"success", true}, {"x", x}, {"y", y}, {"deltaX", deltaX}, {"deltaY", deltaY}};
}

json GuiTools::typeText(const std::string& text)
{
    Display* display = XOpenDisplay(nullptr);
    if (!display)
    {
        return {{"success", false}, {"error", "Cannot open X display"}};
    }

    for (char c : text)
    {
        KeySym keysym = XStringToKeysym(std::string(1, c).c_str());
        if (keysym == NoSymbol)
        {
            // Try direct character
            keysym = c;
        }

        KeyCode keycode = XKeysymToKeycode(display, keysym);
        if (keycode == 0) continue;

        // Check if shift is needed
        bool needShift = false;
        KeySym lower, upper;
        XConvertCase(keysym, &lower, &upper);
        if (keysym == upper && lower != upper)
        {
            needShift = true;
        }

        if (needShift)
        {
            XTestFakeKeyEvent(display, XKeysymToKeycode(display, XK_Shift_L), True, 0);
        }

        XTestFakeKeyEvent(display, keycode, True, 0);
        XTestFakeKeyEvent(display, keycode, False, 0);

        if (needShift)
        {
            XTestFakeKeyEvent(display, XKeysymToKeycode(display, XK_Shift_L), False, 0);
        }

        XFlush(display);
        usleep(10000);  // 10ms between keys
    }

    XCloseDisplay(display);

    return {{"success", true}, {"text", text}};
}

json GuiTools::pressKey(const std::string& key, const std::vector<std::string>& modifiers)
{
    Display* display = XOpenDisplay(nullptr);
    if (!display)
    {
        return {{"success", false}, {"error", "Cannot open X display"}};
    }

    // Map key names to KeySyms
    static std::map<std::string, KeySym> keyMap = {
        {"return", XK_Return}, {"enter", XK_Return},
        {"tab", XK_Tab}, {"space", XK_space},
        {"backspace", XK_BackSpace}, {"delete", XK_Delete},
        {"escape", XK_Escape}, {"esc", XK_Escape},
        {"up", XK_Up}, {"down", XK_Down},
        {"left", XK_Left}, {"right", XK_Right},
        {"home", XK_Home}, {"end", XK_End},
        {"pageup", XK_Page_Up}, {"pagedown", XK_Page_Down},
        {"f1", XK_F1}, {"f2", XK_F2}, {"f3", XK_F3}, {"f4", XK_F4},
        {"f5", XK_F5}, {"f6", XK_F6}, {"f7", XK_F7}, {"f8", XK_F8},
        {"f9", XK_F9}, {"f10", XK_F10}, {"f11", XK_F11}, {"f12", XK_F12}
    };

    static std::map<std::string, KeySym> modMap = {
        {"ctrl", XK_Control_L}, {"control", XK_Control_L},
        {"alt", XK_Alt_L},
        {"shift", XK_Shift_L},
        {"super", XK_Super_L}, {"meta", XK_Super_L}, {"cmd", XK_Super_L}
    };

    // Press modifiers
    for (const auto& mod : modifiers)
    {
        std::string modLower = mod;
        std::transform(modLower.begin(), modLower.end(), modLower.begin(), ::tolower);
        auto it = modMap.find(modLower);
        if (it != modMap.end())
        {
            XTestFakeKeyEvent(display, XKeysymToKeycode(display, it->second), True, 0);
        }
    }

    // Press key
    std::string keyLower = key;
    std::transform(keyLower.begin(), keyLower.end(), keyLower.begin(), ::tolower);

    KeySym keysym;
    auto it = keyMap.find(keyLower);
    if (it != keyMap.end())
    {
        keysym = it->second;
    }
    else if (key.length() == 1)
    {
        keysym = XStringToKeysym(key.c_str());
        if (keysym == NoSymbol)
        {
            keysym = key[0];
        }
    }
    else
    {
        keysym = XStringToKeysym(key.c_str());
    }

    KeyCode keycode = XKeysymToKeycode(display, keysym);
    if (keycode != 0)
    {
        XTestFakeKeyEvent(display, keycode, True, 0);
        XTestFakeKeyEvent(display, keycode, False, 0);
    }

    // Release modifiers (reverse order)
    for (auto it = modifiers.rbegin(); it != modifiers.rend(); ++it)
    {
        std::string modLower = *it;
        std::transform(modLower.begin(), modLower.end(), modLower.begin(), ::tolower);
        auto modIt = modMap.find(modLower);
        if (modIt != modMap.end())
        {
            XTestFakeKeyEvent(display, XKeysymToKeycode(display, modIt->second), False, 0);
        }
    }

    XFlush(display);
    XCloseDisplay(display);

    return {{"success", true}, {"key", key}, {"modifiers", modifiers}};
}

json GuiTools::getCursorPosition()
{
    Display* display = XOpenDisplay(nullptr);
    if (!display)
    {
        return {{"success", false}, {"error", "Cannot open X display"}};
    }

    Window root = DefaultRootWindow(display);
    Window child;
    int rootX, rootY, winX, winY;
    unsigned int mask;

    XQueryPointer(display, root, &root, &child, &rootX, &rootY, &winX, &winY, &mask);
    XCloseDisplay(display);

    return {{"success", true}, {"x", rootX}, {"y", rootY}};
}

} // namespace ScreenControl
