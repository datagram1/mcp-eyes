/**
 * System Tools Implementation
 *
 * Windows-specific implementations using Win32 API.
 */

#include "system_tools.h"
#include "../core/logger.h"

#include <windows.h>
#include <psapi.h>
#include <shlobj.h>
#include <sstream>
#include <iomanip>
#include <thread>
#include <chrono>
#include <vector>

// __cpuid is x86-only, not available on ARM64
#if defined(_M_IX86) || defined(_M_X64)
#include <intrin.h>
#define HAS_CPUID 1
#else
#define HAS_CPUID 0
#endif

// MSVC-specific pragma (ignored by MinGW which uses CMake link flags)
#ifdef _MSC_VER
#pragma comment(lib, "Psapi.lib")
#endif

using json = nlohmann::json;

namespace ScreenControl
{

static std::string getWindowsVersionString()
{
    OSVERSIONINFOEXW osvi = { sizeof(osvi) };

    // Use RtlGetVersion to get accurate version info (GetVersionEx is deprecated/shimmed)
    typedef LONG(WINAPI* RtlGetVersionPtr)(PRTL_OSVERSIONINFOW);
    HMODULE ntdll = GetModuleHandleW(L"ntdll.dll");
    if (ntdll)
    {
        RtlGetVersionPtr rtlGetVersion = (RtlGetVersionPtr)GetProcAddress(ntdll, "RtlGetVersion");
        if (rtlGetVersion)
        {
            RTL_OSVERSIONINFOW rovi = { sizeof(rovi) };
            if (rtlGetVersion(&rovi) == 0)
            {
                std::ostringstream oss;
                oss << rovi.dwMajorVersion << "." << rovi.dwMinorVersion << "." << rovi.dwBuildNumber;
                return oss.str();
            }
        }
    }

    return "Unknown";
}

static std::string getCpuModel()
{
#if HAS_CPUID
    int cpuInfo[4] = { 0 };
    char brand[49] = { 0 };

    // Get CPU brand string
    __cpuid(cpuInfo, 0x80000000);
    unsigned int nExIds = cpuInfo[0];

    if (nExIds >= 0x80000004)
    {
        __cpuid(cpuInfo, 0x80000002);
        memcpy(brand, cpuInfo, sizeof(cpuInfo));
        __cpuid(cpuInfo, 0x80000003);
        memcpy(brand + 16, cpuInfo, sizeof(cpuInfo));
        __cpuid(cpuInfo, 0x80000004);
        memcpy(brand + 32, cpuInfo, sizeof(cpuInfo));
    }

    // Trim leading/trailing spaces
    std::string result(brand);
    size_t start = result.find_first_not_of(" ");
    size_t end = result.find_last_not_of(" ");
    if (start != std::string::npos && end != std::string::npos)
    {
        return result.substr(start, end - start + 1);
    }

    return result.empty() ? "Unknown CPU" : result;
#else
    // ARM64: Use registry to get processor name
    HKEY hKey;
    if (RegOpenKeyExW(HKEY_LOCAL_MACHINE,
        L"HARDWARE\\DESCRIPTION\\System\\CentralProcessor\\0",
        0, KEY_READ, &hKey) == ERROR_SUCCESS)
    {
        wchar_t procName[256] = { 0 };
        DWORD size = sizeof(procName);
        if (RegQueryValueExW(hKey, L"ProcessorNameString", nullptr, nullptr,
            reinterpret_cast<LPBYTE>(procName), &size) == ERROR_SUCCESS)
        {
            RegCloseKey(hKey);
            // Convert to UTF-8
            int utf8Size = WideCharToMultiByte(CP_UTF8, 0, procName, -1, nullptr, 0, nullptr, nullptr);
            std::string result(utf8Size - 1, '\0');
            WideCharToMultiByte(CP_UTF8, 0, procName, -1, &result[0], utf8Size, nullptr, nullptr);
            return result;
        }
        RegCloseKey(hKey);
    }
    return "ARM64 Processor";
#endif
}

static int getCpuCores()
{
    SYSTEM_INFO sysInfo;
    GetSystemInfo(&sysInfo);
    return sysInfo.dwNumberOfProcessors;
}

static std::string formatUptime(ULONGLONG uptimeMs)
{
    ULONGLONG seconds = uptimeMs / 1000;
    int days = static_cast<int>(seconds / 86400);
    int hours = static_cast<int>((seconds % 86400) / 3600);
    int minutes = static_cast<int>((seconds % 3600) / 60);

    std::ostringstream oss;
    if (days > 0)
    {
        oss << days << " day" << (days != 1 ? "s" : "") << ", ";
    }
    oss << hours << ":" << std::setfill('0') << std::setw(2) << minutes;

    return oss.str();
}

json SystemTools::getSystemInfo()
{
    try
    {
        // Get hostname
        char hostname[256] = { 0 };
        DWORD hostnameSize = sizeof(hostname);
        GetComputerNameA(hostname, &hostnameSize);

        // Get memory info
        MEMORYSTATUSEX memStatus = { sizeof(memStatus) };
        GlobalMemoryStatusEx(&memStatus);

        DWORDLONG totalMemMB = memStatus.ullTotalPhys / (1024 * 1024);
        DWORDLONG availMemMB = memStatus.ullAvailPhys / (1024 * 1024);
        DWORDLONG usedMemMB = totalMemMB - availMemMB;

        // Get uptime
        ULONGLONG uptimeMs = GetTickCount64();

        // Get Windows version
        std::string osVersion = getWindowsVersionString();

        // Determine Windows edition
        std::string osName = "Windows";
        OSVERSIONINFOEXW osvi = { sizeof(osvi) };
        typedef LONG(WINAPI* RtlGetVersionPtr)(PRTL_OSVERSIONINFOW);
        HMODULE ntdll = GetModuleHandleW(L"ntdll.dll");
        if (ntdll)
        {
            RtlGetVersionPtr rtlGetVersion = (RtlGetVersionPtr)GetProcAddress(ntdll, "RtlGetVersion");
            if (rtlGetVersion)
            {
                RTL_OSVERSIONINFOW rovi = { sizeof(rovi) };
                if (rtlGetVersion(&rovi) == 0)
                {
                    if (rovi.dwMajorVersion == 10)
                    {
                        if (rovi.dwBuildNumber >= 22000)
                            osName = "Windows 11";
                        else
                            osName = "Windows 10";
                    }
                    else if (rovi.dwMajorVersion == 6)
                    {
                        if (rovi.dwMinorVersion == 3)
                            osName = "Windows 8.1";
                        else if (rovi.dwMinorVersion == 2)
                            osName = "Windows 8";
                        else if (rovi.dwMinorVersion == 1)
                            osName = "Windows 7";
                    }
                }
            }
        }

        // Get architecture
        SYSTEM_INFO sysInfo;
        GetNativeSystemInfo(&sysInfo);
        std::string arch;
        switch (sysInfo.wProcessorArchitecture)
        {
            case PROCESSOR_ARCHITECTURE_AMD64:
                arch = "x64";
                break;
            case PROCESSOR_ARCHITECTURE_ARM64:
                arch = "ARM64";
                break;
            case PROCESSOR_ARCHITECTURE_INTEL:
                arch = "x86";
                break;
            default:
                arch = "Unknown";
                break;
        }

        return {
            {"success", true},
            {"os", osName},
            {"osType", "Windows"},
            {"osVersion", osVersion},
            {"architecture", arch},
            {"hostname", std::string(hostname)},
            {"cpu", getCpuModel()},
            {"cpuCores", getCpuCores()},
            {"memoryTotal", totalMemMB},
            {"memoryUsed", usedMemMB},
            {"memoryFree", availMemMB},
            {"uptime", formatUptime(uptimeMs)},
            {"uptimeSeconds", uptimeMs / 1000}
        };
    }
    catch (const std::exception& e)
    {
        return {{"success", false}, {"error", std::string("Failed to get system info: ") + e.what()}};
    }
}

json SystemTools::clipboardRead()
{
    try
    {
        if (!OpenClipboard(nullptr))
        {
            return {{"success", false}, {"error", "Cannot open clipboard"}};
        }

        HANDLE hData = GetClipboardData(CF_UNICODETEXT);
        if (hData == nullptr)
        {
            // Try ANSI text
            hData = GetClipboardData(CF_TEXT);
            if (hData == nullptr)
            {
                CloseClipboard();
                return {{"success", true}, {"text", ""}};
            }

            char* pszText = static_cast<char*>(GlobalLock(hData));
            if (pszText == nullptr)
            {
                CloseClipboard();
                return {{"success", true}, {"text", ""}};
            }

            std::string text(pszText);
            GlobalUnlock(hData);
            CloseClipboard();

            return {{"success", true}, {"text", text}};
        }

        wchar_t* pwszText = static_cast<wchar_t*>(GlobalLock(hData));
        if (pwszText == nullptr)
        {
            CloseClipboard();
            return {{"success", true}, {"text", ""}};
        }

        // Convert wide string to UTF-8
        int size = WideCharToMultiByte(CP_UTF8, 0, pwszText, -1, nullptr, 0, nullptr, nullptr);
        std::string text(size - 1, 0);
        WideCharToMultiByte(CP_UTF8, 0, pwszText, -1, &text[0], size, nullptr, nullptr);

        GlobalUnlock(hData);
        CloseClipboard();

        return {{"success", true}, {"text", text}};
    }
    catch (const std::exception& e)
    {
        return {{"success", false}, {"error", std::string("Clipboard read failed: ") + e.what()}};
    }
}

json SystemTools::clipboardWrite(const std::string& text)
{
    try
    {
        if (!OpenClipboard(nullptr))
        {
            return {{"success", false}, {"error", "Cannot open clipboard"}};
        }

        EmptyClipboard();

        // Convert UTF-8 to wide string
        int wideSize = MultiByteToWideChar(CP_UTF8, 0, text.c_str(), -1, nullptr, 0);
        HGLOBAL hMem = GlobalAlloc(GMEM_MOVEABLE, wideSize * sizeof(wchar_t));
        if (hMem == nullptr)
        {
            CloseClipboard();
            return {{"success", false}, {"error", "Cannot allocate memory"}};
        }

        wchar_t* pwszDest = static_cast<wchar_t*>(GlobalLock(hMem));
        MultiByteToWideChar(CP_UTF8, 0, text.c_str(), -1, pwszDest, wideSize);
        GlobalUnlock(hMem);

        if (SetClipboardData(CF_UNICODETEXT, hMem) == nullptr)
        {
            GlobalFree(hMem);
            CloseClipboard();
            return {{"success", false}, {"error", "Failed to set clipboard data"}};
        }

        CloseClipboard();

        return {{"success", true}, {"bytesWritten", text.size()}};
    }
    catch (const std::exception& e)
    {
        return {{"success", false}, {"error", std::string("Clipboard write failed: ") + e.what()}};
    }
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

json SystemTools::getWindowList()
{
    struct EnumData
    {
        std::vector<json> windows;
    };

    EnumData data;

    EnumWindows([](HWND hwnd, LPARAM lParam) -> BOOL {
        EnumData* pData = reinterpret_cast<EnumData*>(lParam);

        // Skip invisible windows
        if (!IsWindowVisible(hwnd))
            return TRUE;

        // Get window title
        int titleLen = GetWindowTextLengthW(hwnd);
        if (titleLen == 0)
            return TRUE;

        std::wstring title(titleLen + 1, L'\0');
        GetWindowTextW(hwnd, &title[0], titleLen + 1);
        title.resize(titleLen);

        // Convert to UTF-8
        int utf8Size = WideCharToMultiByte(CP_UTF8, 0, title.c_str(), -1, nullptr, 0, nullptr, nullptr);
        std::string utf8Title(utf8Size - 1, '\0');
        WideCharToMultiByte(CP_UTF8, 0, title.c_str(), -1, &utf8Title[0], utf8Size, nullptr, nullptr);

        // Get window bounds
        RECT rect;
        GetWindowRect(hwnd, &rect);

        // Get process name
        DWORD processId;
        GetWindowThreadProcessId(hwnd, &processId);

        std::string processName = "Unknown";
        HANDLE hProcess = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, FALSE, processId);
        if (hProcess)
        {
            wchar_t exePath[MAX_PATH];
            DWORD pathSize = MAX_PATH;
            if (QueryFullProcessImageNameW(hProcess, 0, exePath, &pathSize))
            {
                std::wstring path(exePath);
                size_t lastSlash = path.find_last_of(L"\\/");
                if (lastSlash != std::wstring::npos)
                {
                    std::wstring exeName = path.substr(lastSlash + 1);
                    int nameSize = WideCharToMultiByte(CP_UTF8, 0, exeName.c_str(), -1, nullptr, 0, nullptr, nullptr);
                    processName.resize(nameSize - 1);
                    WideCharToMultiByte(CP_UTF8, 0, exeName.c_str(), -1, &processName[0], nameSize, nullptr, nullptr);
                }
            }
            CloseHandle(hProcess);
        }

        pData->windows.push_back({
            {"hwnd", reinterpret_cast<uintptr_t>(hwnd)},
            {"title", utf8Title},
            {"app", processName},
            {"processId", processId},
            {"bounds", {
                {"x", rect.left},
                {"y", rect.top},
                {"width", rect.right - rect.left},
                {"height", rect.bottom - rect.top}
            }}
        });

        return TRUE;
    }, reinterpret_cast<LPARAM>(&data));

    return {
        {"success", true},
        {"windows", data.windows},
        {"count", data.windows.size()}
    };
}

} // namespace ScreenControl
