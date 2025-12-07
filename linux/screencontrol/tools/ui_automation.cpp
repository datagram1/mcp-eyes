/**
 * UI Automation Implementation
 *
 * Uses X11 for window enumeration and management.
 * Note: Full UI element discovery requires AT-SPI (accessibility).
 */

#include "ui_automation.h"
#include "../core/logger.h"
#include <X11/Xlib.h>
#include <X11/Xatom.h>
#include <X11/Xutil.h>
#include <cstring>
#include <vector>
#include <algorithm>

using json = nlohmann::json;

namespace ScreenControl
{

static Display* openDisplay()
{
    return XOpenDisplay(nullptr);
}

static std::string getWindowName(Display* display, Window window)
{
    char* name = nullptr;
    if (XFetchName(display, window, &name) && name)
    {
        std::string result(name);
        XFree(name);
        return result;
    }

    // Try _NET_WM_NAME (UTF-8)
    Atom utf8String = XInternAtom(display, "UTF8_STRING", False);
    Atom netWmName = XInternAtom(display, "_NET_WM_NAME", False);

    Atom actualType;
    int actualFormat;
    unsigned long nItems, bytesAfter;
    unsigned char* prop = nullptr;

    if (XGetWindowProperty(display, window, netWmName, 0, 1024, False,
                           utf8String, &actualType, &actualFormat,
                           &nItems, &bytesAfter, &prop) == Success && prop)
    {
        std::string result(reinterpret_cast<char*>(prop));
        XFree(prop);
        return result;
    }

    return "";
}

static std::string getWindowClass(Display* display, Window window)
{
    XClassHint classHint;
    if (XGetClassHint(display, window, &classHint))
    {
        std::string result;
        if (classHint.res_class)
        {
            result = classHint.res_class;
            XFree(classHint.res_class);
        }
        if (classHint.res_name)
        {
            XFree(classHint.res_name);
        }
        return result;
    }
    return "";
}

static std::vector<Window> getClientList(Display* display)
{
    std::vector<Window> windows;

    Atom netClientList = XInternAtom(display, "_NET_CLIENT_LIST", False);
    Window root = DefaultRootWindow(display);

    Atom actualType;
    int actualFormat;
    unsigned long nItems, bytesAfter;
    unsigned char* prop = nullptr;

    if (XGetWindowProperty(display, root, netClientList, 0, 1024, False,
                           XA_WINDOW, &actualType, &actualFormat,
                           &nItems, &bytesAfter, &prop) == Success && prop)
    {
        Window* windowList = reinterpret_cast<Window*>(prop);
        for (unsigned long i = 0; i < nItems; i++)
        {
            windows.push_back(windowList[i]);
        }
        XFree(prop);
    }

    return windows;
}

json UIAutomation::getWindowList()
{
    Display* display = openDisplay();
    if (!display)
    {
        return {{"success", false}, {"error", "Cannot open X display"}};
    }

    json windowList = json::array();

    auto windows = getClientList(display);

    for (Window window : windows)
    {
        XWindowAttributes attrs;
        if (!XGetWindowAttributes(display, window, &attrs))
        {
            continue;
        }

        std::string name = getWindowName(display, window);
        std::string className = getWindowClass(display, window);

        // Skip windows without names
        if (name.empty())
        {
            continue;
        }

        windowList.push_back({
            {"windowId", static_cast<unsigned long>(window)},
            {"title", name},
            {"className", className},
            {"x", attrs.x},
            {"y", attrs.y},
            {"width", attrs.width},
            {"height", attrs.height},
            {"visible", attrs.map_state == IsViewable}
        });
    }

    XCloseDisplay(display);

    return {{"success", true}, {"windows", windowList}};
}

json UIAutomation::getClickableElements()
{
    // X11 doesn't have native UI automation like Windows or macOS
    // For full accessibility support, would need AT-SPI/ATK
    // Return empty list with note

    return {
        {"success", true},
        {"elements", json::array()},
        {"note", "UI element discovery requires AT-SPI accessibility support"}
    };
}

json UIAutomation::getUIElements()
{
    return getClickableElements();
}

json UIAutomation::focusWindow(const std::string& title, unsigned long windowId)
{
    Display* display = openDisplay();
    if (!display)
    {
        return {{"success", false}, {"error", "Cannot open X display"}};
    }

    Window target = None;

    if (windowId != 0)
    {
        target = static_cast<Window>(windowId);
    }
    else if (!title.empty())
    {
        // Find window by title
        auto windows = getClientList(display);
        for (Window window : windows)
        {
            std::string name = getWindowName(display, window);
            if (name.find(title) != std::string::npos)
            {
                target = window;
                break;
            }
        }
    }

    if (target == None)
    {
        XCloseDisplay(display);
        return {{"success", false}, {"error", "Window not found"}};
    }

    // Raise and focus the window
    XRaiseWindow(display, target);

    // Send _NET_ACTIVE_WINDOW message
    Atom netActiveWindow = XInternAtom(display, "_NET_ACTIVE_WINDOW", False);
    Window root = DefaultRootWindow(display);

    XEvent event;
    memset(&event, 0, sizeof(event));
    event.type = ClientMessage;
    event.xclient.window = target;
    event.xclient.message_type = netActiveWindow;
    event.xclient.format = 32;
    event.xclient.data.l[0] = 1;  // Source indication (1 = application)
    event.xclient.data.l[1] = CurrentTime;
    event.xclient.data.l[2] = None;

    XSendEvent(display, root, False,
               SubstructureRedirectMask | SubstructureNotifyMask, &event);

    XFlush(display);
    XCloseDisplay(display);

    std::string foundTitle = title.empty() ? std::to_string(windowId) : title;
    return {
        {"success", true},
        {"title", foundTitle},
        {"windowId", static_cast<unsigned long>(target)}
    };
}

json UIAutomation::minimizeWindow(unsigned long windowId)
{
    Display* display = openDisplay();
    if (!display)
    {
        return {{"success", false}, {"error", "Cannot open X display"}};
    }

    Window window = static_cast<Window>(windowId);
    XIconifyWindow(display, window, DefaultScreen(display));
    XFlush(display);
    XCloseDisplay(display);

    return {{"success", true}, {"windowId", windowId}};
}

json UIAutomation::maximizeWindow(unsigned long windowId)
{
    Display* display = openDisplay();
    if (!display)
    {
        return {{"success", false}, {"error", "Cannot open X display"}};
    }

    Window window = static_cast<Window>(windowId);
    Window root = DefaultRootWindow(display);

    // Send _NET_WM_STATE message to toggle maximize
    Atom wmState = XInternAtom(display, "_NET_WM_STATE", False);
    Atom maxH = XInternAtom(display, "_NET_WM_STATE_MAXIMIZED_HORZ", False);
    Atom maxV = XInternAtom(display, "_NET_WM_STATE_MAXIMIZED_VERT", False);

    XEvent event;
    memset(&event, 0, sizeof(event));
    event.type = ClientMessage;
    event.xclient.window = window;
    event.xclient.message_type = wmState;
    event.xclient.format = 32;
    event.xclient.data.l[0] = 1;  // _NET_WM_STATE_ADD
    event.xclient.data.l[1] = maxH;
    event.xclient.data.l[2] = maxV;
    event.xclient.data.l[3] = 1;  // Source indication

    XSendEvent(display, root, False,
               SubstructureRedirectMask | SubstructureNotifyMask, &event);

    XFlush(display);
    XCloseDisplay(display);

    return {{"success", true}, {"windowId", windowId}};
}

json UIAutomation::closeWindow(unsigned long windowId)
{
    Display* display = openDisplay();
    if (!display)
    {
        return {{"success", false}, {"error", "Cannot open X display"}};
    }

    Window window = static_cast<Window>(windowId);
    Window root = DefaultRootWindow(display);

    // Try _NET_CLOSE_WINDOW first
    Atom netCloseWindow = XInternAtom(display, "_NET_CLOSE_WINDOW", False);

    XEvent event;
    memset(&event, 0, sizeof(event));
    event.type = ClientMessage;
    event.xclient.window = window;
    event.xclient.message_type = netCloseWindow;
    event.xclient.format = 32;
    event.xclient.data.l[0] = CurrentTime;
    event.xclient.data.l[1] = 1;  // Source indication

    XSendEvent(display, root, False,
               SubstructureRedirectMask | SubstructureNotifyMask, &event);

    XFlush(display);
    XCloseDisplay(display);

    return {{"success", true}, {"windowId", windowId}};
}

json UIAutomation::getActiveWindow()
{
    Display* display = openDisplay();
    if (!display)
    {
        return {{"success", false}, {"error", "Cannot open X display"}};
    }

    Atom netActiveWindow = XInternAtom(display, "_NET_ACTIVE_WINDOW", False);
    Window root = DefaultRootWindow(display);

    Atom actualType;
    int actualFormat;
    unsigned long nItems, bytesAfter;
    unsigned char* prop = nullptr;

    Window activeWindow = None;

    if (XGetWindowProperty(display, root, netActiveWindow, 0, 1, False,
                           XA_WINDOW, &actualType, &actualFormat,
                           &nItems, &bytesAfter, &prop) == Success && prop)
    {
        activeWindow = *reinterpret_cast<Window*>(prop);
        XFree(prop);
    }

    if (activeWindow == None)
    {
        XCloseDisplay(display);
        return {{"success", false}, {"error", "No active window"}};
    }

    XWindowAttributes attrs;
    XGetWindowAttributes(display, activeWindow, &attrs);

    std::string name = getWindowName(display, activeWindow);
    std::string className = getWindowClass(display, activeWindow);

    XCloseDisplay(display);

    return {
        {"success", true},
        {"windowId", static_cast<unsigned long>(activeWindow)},
        {"title", name},
        {"className", className},
        {"x", attrs.x},
        {"y", attrs.y},
        {"width", attrs.width},
        {"height", attrs.height}
    };
}

} // namespace ScreenControl
