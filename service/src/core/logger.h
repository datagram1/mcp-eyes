/**
 * Logger
 *
 * Cross-platform logging utility for ScreenControl Service.
 * Supports file logging, console output, and platform-specific system logs.
 */

#pragma once

#include "platform.h"
#include <string>
#include <functional>

namespace ScreenControl
{

enum class LogLevel
{
    Debug,
    Info,
    Warn,
    Error
};

class Logger
{
public:
    // Initialize logger with optional log file and verbosity
    static void init(const std::string& logFile = "", bool verbose = false);

    // Shutdown logger (cleanup resources)
    static void shutdown();

    // Log methods
    static void debug(const std::string& message);
    static void info(const std::string& message);
    static void warn(const std::string& message);
    static void error(const std::string& message);

    // Log with format string
    template<typename... Args>
    static void debugf(const char* fmt, Args... args);

    template<typename... Args>
    static void infof(const char* fmt, Args... args);

    template<typename... Args>
    static void warnf(const char* fmt, Args... args);

    template<typename... Args>
    static void errorf(const char* fmt, Args... args);

    // Set minimum log level
    static void setLevel(LogLevel level);
    static LogLevel getLevel();

    // Set callback for log relay (e.g., to control server)
    using LogCallback = std::function<void(LogLevel, const std::string&)>;
    static void setCallback(LogCallback callback);

    // Get log file path
    static std::string getLogFilePath();

private:
    static void log(LogLevel level, const std::string& message);
    static std::string format(const char* fmt, ...);
};

// Template implementations
template<typename... Args>
void Logger::debugf(const char* fmt, Args... args)
{
    debug(format(fmt, args...));
}

template<typename... Args>
void Logger::infof(const char* fmt, Args... args)
{
    info(format(fmt, args...));
}

template<typename... Args>
void Logger::warnf(const char* fmt, Args... args)
{
    warn(format(fmt, args...));
}

template<typename... Args>
void Logger::errorf(const char* fmt, Args... args)
{
    error(format(fmt, args...));
}

} // namespace ScreenControl
