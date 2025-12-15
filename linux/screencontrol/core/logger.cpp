/**
 * Logger Implementation
 */

#include "logger.h"
#include <iostream>
#include <fstream>
#include <ctime>
#include <mutex>
#include <syslog.h>
#include <unistd.h>

namespace ScreenControl
{

static std::string g_logFile;
static bool g_verbose = false;
static std::mutex g_logMutex;
static bool g_useSyslog = false;

void Logger::init(const std::string& logFile, bool verbose)
{
    g_logFile = logFile;
    g_verbose = verbose;

    // Use syslog if running as daemon (no tty)
    if (!isatty(STDOUT_FILENO))
    {
        g_useSyslog = true;
        openlog("screencontrol", LOG_PID | LOG_NDELAY, LOG_DAEMON);
    }

    info("Logger initialized");
}

void Logger::log(const std::string& level, const std::string& message)
{
    std::lock_guard<std::mutex> lock(g_logMutex);

    // Get timestamp
    time_t now = time(nullptr);
    char timestamp[32];
    strftime(timestamp, sizeof(timestamp), "%Y-%m-%d %H:%M:%S", localtime(&now));

    std::string logLine = std::string(timestamp) + " [" + level + "] " + message;

    // Syslog
    if (g_useSyslog)
    {
        int priority = LOG_INFO;
        if (level == "ERROR") priority = LOG_ERR;
        else if (level == "WARN") priority = LOG_WARNING;
        else if (level == "DEBUG") priority = LOG_DEBUG;

        syslog(priority, "%s", message.c_str());
    }

    // Console output (if not daemon)
    if (!g_useSyslog || g_verbose)
    {
        if (level == "ERROR")
            std::cerr << logLine << std::endl;
        else
            std::cout << logLine << std::endl;
    }

    // File output
    if (!g_logFile.empty())
    {
        std::ofstream file(g_logFile, std::ios::app);
        if (file)
        {
            file << logLine << std::endl;
        }
    }
}

void Logger::info(const std::string& message)
{
    log("INFO", message);
}

void Logger::warn(const std::string& message)
{
    log("WARN", message);
}

void Logger::error(const std::string& message)
{
    log("ERROR", message);
}

void Logger::debug(const std::string& message)
{
    if (g_verbose)
    {
        log("DEBUG", message);
    }
}

} // namespace ScreenControl
