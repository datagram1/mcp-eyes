/**
 * Logger
 *
 * Simple logging utility for Linux agent.
 */

#pragma once

#include <string>

namespace ScreenControl
{

class Logger
{
public:
    static void init(const std::string& logFile, bool verbose = false);
    static void info(const std::string& message);
    static void warn(const std::string& message);
    static void error(const std::string& message);
    static void debug(const std::string& message);

private:
    static void log(const std::string& level, const std::string& message);
};

} // namespace ScreenControl
