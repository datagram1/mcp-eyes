/**
 * Logger Implementation
 *
 * Cross-platform logging with file, console, and system log support.
 */

#include "logger.h"
#include <iostream>
#include <fstream>
#include <ctime>
#include <cstdarg>
#include <mutex>
#include <cstring>

#if PLATFORM_WINDOWS
    #include <windows.h>
#else
    #include <unistd.h>
    #include <syslog.h>
#endif

namespace ScreenControl
{

// Static state
static std::string g_logFile;
static bool g_verbose = false;
static std::mutex g_logMutex;
static LogLevel g_minLevel = LogLevel::Info;
static Logger::LogCallback g_callback = nullptr;
static std::ofstream g_fileStream;

#if !PLATFORM_WINDOWS
static bool g_useSyslog = false;
#endif

void Logger::init(const std::string& logFile, bool verbose)
{
    std::lock_guard<std::mutex> lock(g_logMutex);

    g_logFile = logFile;
    g_verbose = verbose;

    if (verbose)
    {
        g_minLevel = LogLevel::Debug;
    }

    // Close any existing file stream
    if (g_fileStream.is_open())
    {
        g_fileStream.close();
    }

    // Open log file if specified
    if (!logFile.empty())
    {
        g_fileStream.open(logFile, std::ios::app);
        if (!g_fileStream.is_open())
        {
            std::cerr << "Failed to open log file: " << logFile << std::endl;
        }
    }

#if PLATFORM_MACOS || PLATFORM_LINUX
    // Use syslog if running as daemon (no tty)
    if (!isatty(STDOUT_FILENO))
    {
        g_useSyslog = true;
        openlog("screencontrol", LOG_PID | LOG_NDELAY, LOG_DAEMON);
    }
#endif

    // Log initialization (bypass mutex since we hold it)
    std::string msg = "Logger initialized [" PLATFORM_NAME "]";
    if (!logFile.empty())
    {
        msg += " -> " + logFile;
    }

    // Write directly to avoid recursive lock
    time_t now = time(nullptr);
    char timestamp[32];
    strftime(timestamp, sizeof(timestamp), "%Y-%m-%d %H:%M:%S", localtime(&now));

    std::string logLine = std::string(timestamp) + " [INFO] " + msg;

#if PLATFORM_WINDOWS
    OutputDebugStringA((logLine + "\n").c_str());
#endif

    std::cout << logLine << std::endl;

    if (g_fileStream.is_open())
    {
        g_fileStream << logLine << std::endl;
        g_fileStream.flush();
    }
}

void Logger::shutdown()
{
    std::lock_guard<std::mutex> lock(g_logMutex);

#if PLATFORM_MACOS || PLATFORM_LINUX
    if (g_useSyslog)
    {
        closelog();
        g_useSyslog = false;
    }
#endif

    if (g_fileStream.is_open())
    {
        g_fileStream.close();
    }

    g_callback = nullptr;
}

void Logger::log(LogLevel level, const std::string& message)
{
    if (level < g_minLevel)
    {
        return;
    }

    std::lock_guard<std::mutex> lock(g_logMutex);

    // Get timestamp
    time_t now = time(nullptr);
    char timestamp[32];
    strftime(timestamp, sizeof(timestamp), "%Y-%m-%d %H:%M:%S", localtime(&now));

    // Level string
    const char* levelStr = "INFO";
    switch (level)
    {
        case LogLevel::Debug: levelStr = "DEBUG"; break;
        case LogLevel::Info:  levelStr = "INFO";  break;
        case LogLevel::Warn:  levelStr = "WARN";  break;
        case LogLevel::Error: levelStr = "ERROR"; break;
    }

    std::string logLine = std::string(timestamp) + " [" + levelStr + "] " + message;

#if PLATFORM_MACOS || PLATFORM_LINUX
    // Syslog output
    if (g_useSyslog)
    {
        int priority = LOG_INFO;
        switch (level)
        {
            case LogLevel::Debug: priority = LOG_DEBUG;   break;
            case LogLevel::Info:  priority = LOG_INFO;    break;
            case LogLevel::Warn:  priority = LOG_WARNING; break;
            case LogLevel::Error: priority = LOG_ERR;     break;
        }
        syslog(priority, "%s", message.c_str());
    }
#endif

#if PLATFORM_WINDOWS
    // Windows debug output
    OutputDebugStringA((logLine + "\n").c_str());
#endif

    // Console output (if not daemon or verbose)
#if PLATFORM_MACOS || PLATFORM_LINUX
    if (!g_useSyslog || g_verbose)
#endif
    {
        if (level == LogLevel::Error)
        {
            std::cerr << logLine << std::endl;
        }
        else
        {
            std::cout << logLine << std::endl;
        }
    }

    // File output
    if (g_fileStream.is_open())
    {
        g_fileStream << logLine << std::endl;
        g_fileStream.flush();
    }

    // Callback (for relay to control server)
    if (g_callback)
    {
        try
        {
            g_callback(level, message);
        }
        catch (...)
        {
            // Ignore callback errors to prevent log recursion
        }
    }
}

void Logger::debug(const std::string& message)
{
    log(LogLevel::Debug, message);
}

void Logger::info(const std::string& message)
{
    log(LogLevel::Info, message);
}

void Logger::warn(const std::string& message)
{
    log(LogLevel::Warn, message);
}

void Logger::error(const std::string& message)
{
    log(LogLevel::Error, message);
}

void Logger::setLevel(LogLevel level)
{
    g_minLevel = level;
}

LogLevel Logger::getLevel()
{
    return g_minLevel;
}

void Logger::setCallback(LogCallback callback)
{
    std::lock_guard<std::mutex> lock(g_logMutex);
    g_callback = callback;
}

std::string Logger::getLogFilePath()
{
    return g_logFile;
}

std::string Logger::format(const char* fmt, ...)
{
    char buffer[4096];
    va_list args;
    va_start(args, fmt);
    vsnprintf(buffer, sizeof(buffer), fmt, args);
    va_end(args);
    return std::string(buffer);
}

} // namespace ScreenControl
