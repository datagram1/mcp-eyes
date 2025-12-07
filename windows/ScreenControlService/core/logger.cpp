/**
 * Logger
 *
 * Simple logging implementation.
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

    // Get log directory
    std::wstring logDir = getProgramDataPath() + L"\\" + LOG_DIR;

    // Create directory if needed
    std::filesystem::create_directories(logDir);

    // Open log file
    std::wstring logPath = logDir + L"\\service.log";
    m_file.open(logPath, std::ios::app);

    m_initialized = true;
    info(L"Logger initialized");
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
    std::wstring logLine = timestamp + L" [" + level + L"] " + message + L"\n";

    // Write to file
    if (m_file.is_open())
    {
        m_file << logLine;
        m_file.flush();
    }

    // Write to debug output
    OutputDebugStringW(logLine.c_str());
}

std::wstring Logger::getTimestamp()
{
    auto now = std::chrono::system_clock::now();
    auto time = std::chrono::system_clock::to_time_t(now);
    auto ms = std::chrono::duration_cast<std::chrono::milliseconds>(
        now.time_since_epoch()) % 1000;

    std::tm tm;
    localtime_s(&tm, &time);

    std::wostringstream oss;
    oss << std::put_time(&tm, L"%Y-%m-%d %H:%M:%S")
        << L"." << std::setfill(L'0') << std::setw(3) << ms.count();

    return oss.str();
}

} // namespace ScreenControl
