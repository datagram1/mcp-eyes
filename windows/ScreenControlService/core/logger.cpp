/**
 * Logger
 *
 * Simple logging implementation.
 * Uses narrow strings for MinGW compatibility.
 */

#include "logger.h"
#include "../service.h"
#include <shlobj.h>
#include <filesystem>
#include <chrono>
#include <iomanip>
#include <sstream>

namespace ScreenControl
{

// Helper to convert wstring to string (UTF-8)
static std::string wstringToString(const std::wstring& wstr)
{
    if (wstr.empty()) return std::string();
    int size = WideCharToMultiByte(CP_UTF8, 0, wstr.c_str(), -1, nullptr, 0, nullptr, nullptr);
    std::string str(size - 1, 0);
    WideCharToMultiByte(CP_UTF8, 0, wstr.c_str(), -1, &str[0], size, nullptr, nullptr);
    return str;
}

Logger::~Logger()
{
    if (m_file.is_open())
    {
        m_file.close();
    }
}

void Logger::init()
{
    std::lock_guard<std::mutex> lock(m_mutex);

    if (m_initialized)
    {
        return;
    }

    // Get log directory as narrow string
    std::wstring wLogDir = getProgramDataPath() + L"\\" + LOG_DIR;
    std::string logDir = wstringToString(wLogDir);

    // Create directory if needed
    try
    {
        std::filesystem::create_directories(logDir);
    }
    catch (...)
    {
        // Ignore directory creation errors
    }

    // Open log file with narrow string path
    std::string logPath = logDir + "\\service.log";
    m_file.open(logPath, std::ios::app);

    m_initialized = true;
    // Note: Don't call info() here - would deadlock on mutex
}

void Logger::info(const std::wstring& message)
{
    log(L"INFO", message);
}

void Logger::warn(const std::wstring& message)
{
    log(L"WARN", message);
}

void Logger::error(const std::wstring& message)
{
    log(L"ERROR", message);
}

void Logger::debug(const std::wstring& message)
{
#ifdef _DEBUG
    log(L"DEBUG", message);
#endif
}

void Logger::log(const std::wstring& level, const std::wstring& message)
{
    std::lock_guard<std::mutex> lock(m_mutex);

    std::wstring timestamp = getTimestamp();
    std::wstring wLogLine = timestamp + L" [" + level + L"] " + message + L"\n";

    // Convert to narrow string for file output
    std::string logLine = wstringToString(wLogLine);

    // Write to file
    if (m_file.is_open())
    {
        m_file << logLine;
        m_file.flush();
    }

    // Write to debug output (still uses wide string)
    OutputDebugStringW(wLogLine.c_str());
}

std::wstring Logger::getTimestamp()
{
    auto now = std::chrono::system_clock::now();
    auto time = std::chrono::system_clock::to_time_t(now);
    auto ms = std::chrono::duration_cast<std::chrono::milliseconds>(
        now.time_since_epoch()) % 1000;

    std::tm tm;
#ifdef _MSC_VER
    localtime_s(&tm, &time);
#else
    // MinGW uses localtime
    std::tm* tmp = localtime(&time);
    if (tmp) tm = *tmp;
#endif

    std::wostringstream oss;
    oss << std::put_time(&tm, L"%Y-%m-%d %H:%M:%S")
        << L"." << std::setfill(L'0') << std::setw(3) << ms.count();

    return oss.str();
}

} // namespace ScreenControl
