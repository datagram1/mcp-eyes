/**
 * System Tools Implementation
 *
 * Linux-specific implementations using /proc, sysinfo, and X11 clipboard.
 */

#include "system_tools.h"
#include "../core/logger.h"
#include <sys/sysinfo.h>
#include <sys/utsname.h>
#include <unistd.h>
#include <fstream>
#include <sstream>
#include <iomanip>
#include <thread>
#include <chrono>
#include <cstdlib>
#include <cstring>
#include <array>
#include <memory>

// X11 for clipboard
#include <X11/Xlib.h>
#include <X11/Xatom.h>

using json = nlohmann::json;

namespace ScreenControl
{

static std::string execCommand(const std::string& cmd)
{
    std::array<char, 128> buffer;
    std::string result;
    std::unique_ptr<FILE, decltype(&pclose)> pipe(popen(cmd.c_str(), "r"), pclose);
    if (!pipe)
    {
        return "";
    }
    while (fgets(buffer.data(), buffer.size(), pipe.get()) != nullptr)
    {
        result += buffer.data();
    }
    // Trim trailing newline
    while (!result.empty() && (result.back() == '\n' || result.back() == '\r'))
    {
        result.pop_back();
    }
    return result;
}

static std::string getCpuModel()
{
    std::ifstream cpuinfo("/proc/cpuinfo");
    std::string line;
    while (std::getline(cpuinfo, line))
    {
        if (line.find("model name") != std::string::npos)
        {
            size_t pos = line.find(':');
            if (pos != std::string::npos)
            {
                std::string model = line.substr(pos + 1);
                // Trim leading whitespace
                size_t start = model.find_first_not_of(" \t");
                if (start != std::string::npos)
                {
                    return model.substr(start);
                }
            }
        }
    }
    return "Unknown CPU";
}

static int getCpuCores()
{
    return sysconf(_SC_NPROCESSORS_ONLN);
}

json SystemTools::getSystemInfo()
{
    // Get system name and version
    struct utsname unameData;
    if (uname(&unameData) != 0)
    {
        return {{"success", false}, {"error", "Failed to get system info"}};
    }

    // Get memory info
    struct sysinfo si;
    if (sysinfo(&si) != 0)
    {
        return {{"success", false}, {"error", "Failed to get memory info"}};
    }

    // Get hostname
    char hostname[256];
    gethostname(hostname, sizeof(hostname));

    // Calculate memory in MB
    unsigned long totalMemMB = si.totalram * si.mem_unit / (1024 * 1024);
    unsigned long freeMemMB = si.freeram * si.mem_unit / (1024 * 1024);
    unsigned long usedMemMB = totalMemMB - freeMemMB;

    // Get uptime
    long uptimeSeconds = si.uptime;
    int uptimeDays = uptimeSeconds / 86400;
    int uptimeHours = (uptimeSeconds % 86400) / 3600;
    int uptimeMinutes = (uptimeSeconds % 3600) / 60;

    std::ostringstream uptimeStr;
    if (uptimeDays > 0)
    {
        uptimeStr << uptimeDays << " day" << (uptimeDays != 1 ? "s" : "") << ", ";
    }
    uptimeStr << uptimeHours << ":" << std::setfill('0') << std::setw(2) << uptimeMinutes;

    // Get distro info
    std::string distro = "Linux";
    std::ifstream osRelease("/etc/os-release");
    std::string line;
    while (std::getline(osRelease, line))
    {
        if (line.find("PRETTY_NAME=") == 0)
        {
            distro = line.substr(13);  // Skip PRETTY_NAME="
            if (!distro.empty() && distro.back() == '"')
            {
                distro.pop_back();
            }
            break;
        }
    }

    return {
        {"success", true},
        {"os", distro},
        {"osType", "Linux"},
        {"osVersion", unameData.release},
        {"kernelVersion", unameData.release},
        {"architecture", unameData.machine},
        {"hostname", hostname},
        {"cpu", getCpuModel()},
        {"cpuCores", getCpuCores()},
        {"memoryTotal", totalMemMB},
        {"memoryUsed", usedMemMB},
        {"memoryFree", freeMemMB},
        {"uptime", uptimeStr.str()},
        {"uptimeSeconds", uptimeSeconds}
    };
}

json SystemTools::clipboardRead()
{
    // Try xclip first, then xsel
    std::string content = execCommand("xclip -selection clipboard -o 2>/dev/null");
    if (content.empty())
    {
        content = execCommand("xsel --clipboard --output 2>/dev/null");
    }

    // If external tools fail, try X11 directly
    if (content.empty())
    {
        Display* display = XOpenDisplay(nullptr);
        if (!display)
        {
            return {{"success", false}, {"error", "Cannot open X display and no clipboard tool available (xclip/xsel)"}};
        }

        Atom clipboard = XInternAtom(display, "CLIPBOARD", False);
        Atom utf8String = XInternAtom(display, "UTF8_STRING", False);
        Atom target = XInternAtom(display, "SCREENCONTROL_CLIP", False);

        Window owner = XGetSelectionOwner(display, clipboard);
        if (owner == None)
        {
            XCloseDisplay(display);
            return {{"success", true}, {"text", ""}};
        }

        Window window = XCreateSimpleWindow(display, DefaultRootWindow(display), 0, 0, 1, 1, 0, 0, 0);
        XConvertSelection(display, clipboard, utf8String, target, window, CurrentTime);
        XFlush(display);

        // Wait for SelectionNotify event with timeout
        XEvent event;
        bool received = false;
        for (int i = 0; i < 100 && !received; i++)  // 1 second timeout
        {
            if (XPending(display) > 0)
            {
                XNextEvent(display, &event);
                if (event.type == SelectionNotify)
                {
                    received = true;
                }
            }
            else
            {
                usleep(10000);  // 10ms
            }
        }

        if (received && event.xselection.property != None)
        {
            Atom actualType;
            int actualFormat;
            unsigned long nItems, bytesAfter;
            unsigned char* data = nullptr;

            if (XGetWindowProperty(display, window, target, 0, 1024*1024, False,
                                   AnyPropertyType, &actualType, &actualFormat,
                                   &nItems, &bytesAfter, &data) == Success && data)
            {
                content = std::string(reinterpret_cast<char*>(data), nItems);
                XFree(data);
            }
        }

        XDestroyWindow(display, window);
        XCloseDisplay(display);
    }

    return {{"success", true}, {"text", content}};
}

json SystemTools::clipboardWrite(const std::string& text)
{
    // Use xclip or xsel
    std::string escaped = text;
    // Escape for shell
    size_t pos = 0;
    while ((pos = escaped.find("'", pos)) != std::string::npos)
    {
        escaped.replace(pos, 1, "'\\''");
        pos += 4;
    }

    // Try xclip first
    std::string cmd = "echo -n '" + escaped + "' | xclip -selection clipboard 2>/dev/null";
    int result = system(cmd.c_str());

    if (result != 0)
    {
        // Try xsel
        cmd = "echo -n '" + escaped + "' | xsel --clipboard --input 2>/dev/null";
        result = system(cmd.c_str());
    }

    if (result != 0)
    {
        return {{"success", false}, {"error", "No clipboard tool available (xclip/xsel)"}};
    }

    return {{"success", true}, {"bytesWritten", text.size()}};
}

json SystemTools::wait(int milliseconds)
{
    if (milliseconds < 0)
    {
        return {{"success", false}, {"error", "Invalid wait time"}};
    }

    if (milliseconds > 60000)
    {
        return {{"success", false}, {"error", "Maximum wait time is 60 seconds"}};
    }

    std::this_thread::sleep_for(std::chrono::milliseconds(milliseconds));

    return {{"success", true}, {"waited", milliseconds}};
}

} // namespace ScreenControl
