/**
 * ScreenControl Windows Service
 *
 * Service definitions and utilities.
 */

#pragma once

#include <windows.h>
#include <string>

namespace ScreenControl
{

// Service configuration
constexpr int DEFAULT_HTTP_PORT = 3456;
constexpr int DEFAULT_BROWSER_BRIDGE_PORT = 3457;
constexpr const wchar_t* CONFIG_DIR = L"ScreenControl";
constexpr const wchar_t* CONFIG_FILE = L"config.json";
constexpr const wchar_t* LICENSE_FILE = L"license.dat";
constexpr const wchar_t* LOG_DIR = L"logs";

// Get ProgramData path for service configuration
inline std::wstring getProgramDataPath()
{
    wchar_t path[MAX_PATH];
    if (SUCCEEDED(SHGetFolderPathW(nullptr, CSIDL_COMMON_APPDATA, nullptr, 0, path)))
    {
        return std::wstring(path) + L"\\" + CONFIG_DIR;
    }
    return L"C:\\ProgramData\\" + std::wstring(CONFIG_DIR);
}

} // namespace ScreenControl
