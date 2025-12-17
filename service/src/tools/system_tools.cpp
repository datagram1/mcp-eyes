/**
 * System Tools Implementation
 *
 * Cross-platform system utilities.
 */

#include "system_tools.h"
#include "../core/logger.h"
#include <fstream>
#include <sstream>
#include <iomanip>
#include <thread>
#include <chrono>
#include <cstdlib>
#include <cstring>
#include <array>
#include <memory>
#include <ctime>

#if PLATFORM_WINDOWS
    #include <windows.h>
    #include <psapi.h>
    #include <lmcons.h>
#elif PLATFORM_MACOS
    #include <sys/sysctl.h>
    #include <sys/types.h>
    #include <mach/mach.h>
    #include <mach/mach_host.h>
    #include <unistd.h>
#else
    #include <sys/sysinfo.h>
    #include <sys/utsname.h>
    #include <unistd.h>
#endif

using json = nlohmann::json;

namespace ScreenControl
{

// Helper to execute a command and capture output
static std::string execCommand(const std::string& cmd)
{
#if PLATFORM_WINDOWS
    std::array<char, 128> buffer;
    std::string result;
    std::unique_ptr<FILE, decltype(&_pclose)> pipe(_popen(cmd.c_str(), "r"), _pclose);
    if (!pipe)
    {
        return "";
    }
    while (fgets(buffer.data(), static_cast<int>(buffer.size()), pipe.get()) != nullptr)
    {
        result += buffer.data();
    }
#else
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
#endif
    // Trim trailing newlines
    while (!result.empty() && (result.back() == '\n' || result.back() == '\r'))
    {
        result.pop_back();
    }
    return result;
}

json SystemTools::getSystemInfo()
{
#if PLATFORM_WINDOWS
    // Get Windows system info
    SYSTEM_INFO sysInfo;
    GetSystemInfo(&sysInfo);

    // Get hostname
    char hostname[MAX_COMPUTERNAME_LENGTH + 1];
    DWORD size = sizeof(hostname);
    GetComputerNameA(hostname, &size);

    // Get OS version
    std::string osVersion = "Windows";
    std::string osType = "Windows";

    // Get memory info
    MEMORYSTATUSEX memStatus;
    memStatus.dwLength = sizeof(memStatus);
    GlobalMemoryStatusEx(&memStatus);

    unsigned long long totalMemMB = memStatus.ullTotalPhys / (1024 * 1024);
    unsigned long long availMemMB = memStatus.ullAvailPhys / (1024 * 1024);
    unsigned long long usedMemMB = totalMemMB - availMemMB;

    // Get CPU info
    std::string cpuModel = "Unknown CPU";
    int cpuCores = sysInfo.dwNumberOfProcessors;

    // Get uptime
    ULONGLONG uptimeMs = GetTickCount64();
    long uptimeSeconds = static_cast<long>(uptimeMs / 1000);
    int uptimeDays = uptimeSeconds / 86400;
    int uptimeHours = (uptimeSeconds % 86400) / 3600;
    int uptimeMinutes = (uptimeSeconds % 3600) / 60;

    std::ostringstream uptimeStr;
    if (uptimeDays > 0)
    {
        uptimeStr << uptimeDays << " day" << (uptimeDays != 1 ? "s" : "") << ", ";
    }
    uptimeStr << uptimeHours << ":" << std::setfill('0') << std::setw(2) << uptimeMinutes;

    // Architecture
    std::string arch;
    switch (sysInfo.wProcessorArchitecture)
    {
        case PROCESSOR_ARCHITECTURE_AMD64: arch = "x86_64"; break;
        case PROCESSOR_ARCHITECTURE_ARM: arch = "arm"; break;
        case PROCESSOR_ARCHITECTURE_ARM64: arch = "arm64"; break;
        case PROCESSOR_ARCHITECTURE_INTEL: arch = "x86"; break;
        default: arch = "unknown"; break;
    }

    return {
        {"success", true},
        {"os", osVersion},
        {"osType", osType},
        {"osVersion", "10+"},
        {"architecture", arch},
        {"hostname", hostname},
        {"cpu", cpuModel},
        {"cpuCores", cpuCores},
        {"memoryTotal", totalMemMB},
        {"memoryUsed", usedMemMB},
        {"memoryFree", availMemMB},
        {"uptime", uptimeStr.str()},
        {"uptimeSeconds", uptimeSeconds}
    };

#elif PLATFORM_MACOS
    // Get macOS system info
    char hostname[256];
    gethostname(hostname, sizeof(hostname));

    // Get OS version
    std::string osVersion = execCommand("sw_vers -productVersion");
    std::string osName = "macOS " + osVersion;

    // Get CPU info
    char cpuModel[256] = "Unknown CPU";
    size_t cpuModelSize = sizeof(cpuModel);
    sysctlbyname("machdep.cpu.brand_string", cpuModel, &cpuModelSize, nullptr, 0);

    int cpuCores = 0;
    size_t cpuCoresSize = sizeof(cpuCores);
    sysctlbyname("hw.ncpu", &cpuCores, &cpuCoresSize, nullptr, 0);

    // Get memory info
    int64_t totalMem = 0;
    size_t totalMemSize = sizeof(totalMem);
    sysctlbyname("hw.memsize", &totalMem, &totalMemSize, nullptr, 0);
    unsigned long totalMemMB = totalMem / (1024 * 1024);

    // Get free memory using vm_statistics
    vm_size_t pageSize;
    vm_statistics64_data_t vmStats;
    mach_msg_type_number_t count = HOST_VM_INFO64_COUNT;

    host_page_size(mach_host_self(), &pageSize);
    host_statistics64(mach_host_self(), HOST_VM_INFO64, (host_info64_t)&vmStats, &count);

    unsigned long freeMemMB = (vmStats.free_count + vmStats.inactive_count) * pageSize / (1024 * 1024);
    unsigned long usedMemMB = totalMemMB - freeMemMB;

    // Get uptime
    struct timeval bootTime;
    size_t bootTimeSize = sizeof(bootTime);
    int mib[2] = {CTL_KERN, KERN_BOOTTIME};
    sysctl(mib, 2, &bootTime, &bootTimeSize, nullptr, 0);

    time_t now = time(nullptr);
    long uptimeSeconds = now - bootTime.tv_sec;
    int uptimeDays = uptimeSeconds / 86400;
    int uptimeHours = (uptimeSeconds % 86400) / 3600;
    int uptimeMinutes = (uptimeSeconds % 3600) / 60;

    std::ostringstream uptimeStr;
    if (uptimeDays > 0)
    {
        uptimeStr << uptimeDays << " day" << (uptimeDays != 1 ? "s" : "") << ", ";
    }
    uptimeStr << uptimeHours << ":" << std::setfill('0') << std::setw(2) << uptimeMinutes;

    // Get architecture
    std::string arch = execCommand("uname -m");

    return {
        {"success", true},
        {"os", osName},
        {"osType", "macOS"},
        {"osVersion", osVersion},
        {"architecture", arch},
        {"hostname", hostname},
        {"cpu", cpuModel},
        {"cpuCores", cpuCores},
        {"memoryTotal", totalMemMB},
        {"memoryUsed", usedMemMB},
        {"memoryFree", freeMemMB},
        {"uptime", uptimeStr.str()},
        {"uptimeSeconds", uptimeSeconds}
    };

#else
    // Linux implementation
    struct utsname unameData;
    if (uname(&unameData) != 0)
    {
        return {{"success", false}, {"error", "Failed to get system info"}};
    }

    struct sysinfo si;
    if (sysinfo(&si) != 0)
    {
        return {{"success", false}, {"error", "Failed to get memory info"}};
    }

    char hostname[256];
    gethostname(hostname, sizeof(hostname));

    unsigned long totalMemMB = si.totalram * si.mem_unit / (1024 * 1024);
    unsigned long freeMemMB = si.freeram * si.mem_unit / (1024 * 1024);
    unsigned long usedMemMB = totalMemMB - freeMemMB;

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
            distro = line.substr(13);
            if (!distro.empty() && distro.back() == '"')
            {
                distro.pop_back();
            }
            break;
        }
    }

    // Get CPU info
    std::string cpuModel = "Unknown CPU";
    std::ifstream cpuinfo("/proc/cpuinfo");
    while (std::getline(cpuinfo, line))
    {
        if (line.find("model name") != std::string::npos)
        {
            size_t pos = line.find(':');
            if (pos != std::string::npos)
            {
                cpuModel = line.substr(pos + 2);
            }
            break;
        }
    }

    int cpuCores = sysconf(_SC_NPROCESSORS_ONLN);

    return {
        {"success", true},
        {"os", distro},
        {"osType", "Linux"},
        {"osVersion", unameData.release},
        {"kernelVersion", unameData.release},
        {"architecture", unameData.machine},
        {"hostname", hostname},
        {"cpu", cpuModel},
        {"cpuCores", cpuCores},
        {"memoryTotal", totalMemMB},
        {"memoryUsed", usedMemMB},
        {"memoryFree", freeMemMB},
        {"uptime", uptimeStr.str()},
        {"uptimeSeconds", uptimeSeconds}
    };
#endif
}

json SystemTools::clipboardRead()
{
#if PLATFORM_WINDOWS
    if (!OpenClipboard(nullptr))
    {
        return {{"success", false}, {"error", "Failed to open clipboard"}};
    }

    std::string text;
    HANDLE hData = GetClipboardData(CF_TEXT);
    if (hData != nullptr)
    {
        char* pszText = static_cast<char*>(GlobalLock(hData));
        if (pszText != nullptr)
        {
            text = pszText;
            GlobalUnlock(hData);
        }
    }

    CloseClipboard();
    return {{"success", true}, {"text", text}};

#elif PLATFORM_MACOS
    // Use pbpaste
    std::string content = execCommand("pbpaste 2>/dev/null");
    return {{"success", true}, {"text", content}};

#else
    // Linux - try xclip first, then xsel
    std::string content = execCommand("xclip -selection clipboard -o 2>/dev/null");
    if (content.empty())
    {
        content = execCommand("xsel --clipboard --output 2>/dev/null");
    }
    return {{"success", true}, {"text", content}};
#endif
}

json SystemTools::clipboardWrite(const std::string& text)
{
#if PLATFORM_WINDOWS
    if (!OpenClipboard(nullptr))
    {
        return {{"success", false}, {"error", "Failed to open clipboard"}};
    }

    EmptyClipboard();

    HGLOBAL hGlob = GlobalAlloc(GMEM_FIXED, text.size() + 1);
    if (hGlob == nullptr)
    {
        CloseClipboard();
        return {{"success", false}, {"error", "Failed to allocate memory"}};
    }

    memcpy(hGlob, text.c_str(), text.size() + 1);
    SetClipboardData(CF_TEXT, hGlob);
    CloseClipboard();

    return {{"success", true}, {"bytesWritten", text.size()}};

#elif PLATFORM_MACOS
    // Use pbcopy
    std::string escaped = text;
    size_t pos = 0;
    while ((pos = escaped.find("'", pos)) != std::string::npos)
    {
        escaped.replace(pos, 1, "'\\''");
        pos += 4;
    }

    std::string cmd = "echo -n '" + escaped + "' | pbcopy 2>/dev/null";
    int result = system(cmd.c_str());

    if (result != 0)
    {
        return {{"success", false}, {"error", "Failed to write to clipboard"}};
    }

    return {{"success", true}, {"bytesWritten", text.size()}};

#else
    // Linux - use xclip or xsel
    std::string escaped = text;
    size_t pos = 0;
    while ((pos = escaped.find("'", pos)) != std::string::npos)
    {
        escaped.replace(pos, 1, "'\\''");
        pos += 4;
    }

    std::string cmd = "echo -n '" + escaped + "' | xclip -selection clipboard 2>/dev/null";
    int result = system(cmd.c_str());

    if (result != 0)
    {
        cmd = "echo -n '" + escaped + "' | xsel --clipboard --input 2>/dev/null";
        result = system(cmd.c_str());
    }

    if (result != 0)
    {
        return {{"success", false}, {"error", "No clipboard tool available (xclip/xsel)"}};
    }

    return {{"success", true}, {"bytesWritten", text.size()}};
#endif
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

json SystemTools::getCurrentTime()
{
    auto now = std::chrono::system_clock::now();
    auto epoch = now.time_since_epoch();
    auto millis = std::chrono::duration_cast<std::chrono::milliseconds>(epoch).count();

    time_t nowTime = std::chrono::system_clock::to_time_t(now);
    struct tm* timeInfo = localtime(&nowTime);

    char buffer[64];
    strftime(buffer, sizeof(buffer), "%Y-%m-%dT%H:%M:%S", timeInfo);

    return {
        {"success", true},
        {"timestamp", millis},
        {"iso", buffer}
    };
}

json SystemTools::getEnv(const std::string& name)
{
    const char* value = std::getenv(name.c_str());
    if (value == nullptr)
    {
        return {{"success", true}, {"name", name}, {"value", nullptr}, {"exists", false}};
    }
    return {{"success", true}, {"name", name}, {"value", value}, {"exists", true}};
}

json SystemTools::setEnv(const std::string& name, const std::string& value)
{
#if PLATFORM_WINDOWS
    int result = _putenv_s(name.c_str(), value.c_str());
#else
    int result = setenv(name.c_str(), value.c_str(), 1);
#endif

    if (result != 0)
    {
        return {{"success", false}, {"error", "Failed to set environment variable"}};
    }

    return {{"success", true}, {"name", name}, {"value", value}};
}

} // namespace ScreenControl
