/**
 * Logger
 *
 * Simple logging to file and debug output.
 */

#pragma once

#include <windows.h>
#include <string>
#include <fstream>
#include <mutex>

namespace ScreenControl
{

class Logger
{
public:
    static Logger& getInstance()
    {
        static Logger instance;
        return instance;
    }

    void init();
    void info(const std::wstring& message);
    void warn(const std::wstring& message);
    void error(const std::wstring& message);
    void debug(const std::wstring& message);

private:
    Logger() = default;
    ~Logger();

    void log(const std::wstring& level, const std::wstring& message);
    std::wstring getTimestamp();

    std::wofstream m_file;
    std::mutex m_mutex;
    bool m_initialized{false};
};

} // namespace ScreenControl
