/**
 * Shell Tools
 *
 * Command execution implementation using CreateProcess.
 */

#include "shell_tools.h"
#include "../core/logger.h"
#include <windows.h>
#include <map>
#include <mutex>
#include <random>

using json = nlohmann::json;

namespace ScreenControl
{

// Session management
struct ShellSession
{
    HANDLE hProcess;
    HANDLE hStdinWrite;
    HANDLE hStdoutRead;
    HANDLE hStderrRead;
    DWORD processId;
};

static std::map<std::string, ShellSession> g_sessions;
static std::mutex g_sessionMutex;

static std::string generateSessionId()
{
    static std::random_device rd;
    static std::mt19937 gen(rd());
    static std::uniform_int_distribution<> dis(0, 15);

    const char* hex = "0123456789abcdef";
    std::string id = "session_";
    for (int i = 0; i < 16; ++i)
    {
        id += hex[dis(gen)];
    }
    return id;
}

json ShellTools::exec(const std::string& command, const std::string& cwd, int timeout)
{
    SECURITY_ATTRIBUTES sa = {};
    sa.nLength = sizeof(sa);
    sa.bInheritHandle = TRUE;

    // Create pipes for stdout and stderr
    HANDLE hStdoutRead, hStdoutWrite;
    HANDLE hStderrRead, hStderrWrite;

    CreatePipe(&hStdoutRead, &hStdoutWrite, &sa, 0);
    SetHandleInformation(hStdoutRead, HANDLE_FLAG_INHERIT, 0);

    CreatePipe(&hStderrRead, &hStderrWrite, &sa, 0);
    SetHandleInformation(hStderrRead, HANDLE_FLAG_INHERIT, 0);

    // Setup startup info
    STARTUPINFOA si = {};
    si.cb = sizeof(si);
    si.dwFlags = STARTF_USESTDHANDLES;
    si.hStdOutput = hStdoutWrite;
    si.hStdError = hStderrWrite;
    si.hStdInput = GetStdHandle(STD_INPUT_HANDLE);

    PROCESS_INFORMATION pi = {};

    // Build command line (use PowerShell for complex commands)
    std::string cmdLine = "powershell.exe -NoLogo -NoProfile -NonInteractive -Command \"" + command + "\"";

    // Create process
    BOOL created = CreateProcessA(
        nullptr,
        const_cast<char*>(cmdLine.c_str()),
        nullptr,
        nullptr,
        TRUE,
        CREATE_NO_WINDOW,
        nullptr,
        cwd.empty() ? nullptr : cwd.c_str(),
        &si,
        &pi
    );

    // Close write handles in parent
    CloseHandle(hStdoutWrite);
    CloseHandle(hStderrWrite);

    if (!created)
    {
        CloseHandle(hStdoutRead);
        CloseHandle(hStderrRead);
        return {{"success", false}, {"error", "Failed to create process"}};
    }

    // Wait for process with timeout
    DWORD waitResult = WaitForSingleObject(pi.hProcess, timeout * 1000);

    if (waitResult == WAIT_TIMEOUT)
    {
        TerminateProcess(pi.hProcess, 1);
        CloseHandle(pi.hProcess);
        CloseHandle(pi.hThread);
        CloseHandle(hStdoutRead);
        CloseHandle(hStderrRead);
        return {{"success", false}, {"error", "Command timed out"}, {"timeout", timeout}};
    }

    // Get exit code
    DWORD exitCode = 0;
    GetExitCodeProcess(pi.hProcess, &exitCode);

    // Read stdout
    std::string stdoutStr;
    char buffer[4096];
    DWORD bytesRead;
    while (ReadFile(hStdoutRead, buffer, sizeof(buffer) - 1, &bytesRead, nullptr) && bytesRead > 0)
    {
        buffer[bytesRead] = '\0';
        stdoutStr += buffer;
    }

    // Read stderr
    std::string stderrStr;
    while (ReadFile(hStderrRead, buffer, sizeof(buffer) - 1, &bytesRead, nullptr) && bytesRead > 0)
    {
        buffer[bytesRead] = '\0';
        stderrStr += buffer;
    }

    // Cleanup
    CloseHandle(pi.hProcess);
    CloseHandle(pi.hThread);
    CloseHandle(hStdoutRead);
    CloseHandle(hStderrRead);

    return {
        {"success", true},
        {"stdout", stdoutStr},
        {"stderr", stderrStr},
        {"exit_code", static_cast<int>(exitCode)},
        {"command", command}
    };
}

json ShellTools::startSession(const std::string& command, const std::string& cwd)
{
    SECURITY_ATTRIBUTES sa = {};
    sa.nLength = sizeof(sa);
    sa.bInheritHandle = TRUE;

    // Create pipes
    HANDLE hStdinRead, hStdinWrite;
    HANDLE hStdoutRead, hStdoutWrite;
    HANDLE hStderrRead, hStderrWrite;

    CreatePipe(&hStdinRead, &hStdinWrite, &sa, 0);
    SetHandleInformation(hStdinWrite, HANDLE_FLAG_INHERIT, 0);

    CreatePipe(&hStdoutRead, &hStdoutWrite, &sa, 0);
    SetHandleInformation(hStdoutRead, HANDLE_FLAG_INHERIT, 0);

    CreatePipe(&hStderrRead, &hStderrWrite, &sa, 0);
    SetHandleInformation(hStderrRead, HANDLE_FLAG_INHERIT, 0);

    STARTUPINFOA si = {};
    si.cb = sizeof(si);
    si.dwFlags = STARTF_USESTDHANDLES;
    si.hStdInput = hStdinRead;
    si.hStdOutput = hStdoutWrite;
    si.hStdError = hStderrWrite;

    PROCESS_INFORMATION pi = {};

    std::string cmdLine = command.empty() ? "powershell.exe -NoLogo -NoProfile" : command;

    BOOL created = CreateProcessA(
        nullptr,
        const_cast<char*>(cmdLine.c_str()),
        nullptr,
        nullptr,
        TRUE,
        CREATE_NO_WINDOW,
        nullptr,
        cwd.empty() ? nullptr : cwd.c_str(),
        &si,
        &pi
    );

    CloseHandle(hStdinRead);
    CloseHandle(hStdoutWrite);
    CloseHandle(hStderrWrite);

    if (!created)
    {
        CloseHandle(hStdinWrite);
        CloseHandle(hStdoutRead);
        CloseHandle(hStderrRead);
        return {{"success", false}, {"error", "Failed to start session"}};
    }

    std::string sessionId = generateSessionId();

    {
        std::lock_guard<std::mutex> lock(g_sessionMutex);
        g_sessions[sessionId] = {
            pi.hProcess,
            hStdinWrite,
            hStdoutRead,
            hStderrRead,
            pi.dwProcessId
        };
    }

    CloseHandle(pi.hThread);

    return {
        {"success", true},
        {"session_id", sessionId},
        {"pid", static_cast<int>(pi.dwProcessId)}
    };
}

json ShellTools::sendInput(const std::string& sessionId, const std::string& input)
{
    std::lock_guard<std::mutex> lock(g_sessionMutex);

    auto it = g_sessions.find(sessionId);
    if (it == g_sessions.end())
    {
        return {{"success", false}, {"error", "Session not found: " + sessionId}};
    }

    DWORD bytesWritten;
    BOOL result = WriteFile(it->second.hStdinWrite, input.c_str(),
                           static_cast<DWORD>(input.size()), &bytesWritten, nullptr);

    if (!result)
    {
        return {{"success", false}, {"error", "Failed to write to session"}};
    }

    return {{"success", true}, {"session_id", sessionId}, {"bytes_written", bytesWritten}};
}

json ShellTools::stopSession(const std::string& sessionId, const std::string& signal)
{
    std::lock_guard<std::mutex> lock(g_sessionMutex);

    auto it = g_sessions.find(sessionId);
    if (it == g_sessions.end())
    {
        return {{"success", false}, {"error", "Session not found: " + sessionId}};
    }

    // Try graceful close first
    if (signal == "TERM" || signal == "INT")
    {
        // Send Ctrl+C
        GenerateConsoleCtrlEvent(CTRL_C_EVENT, it->second.processId);
        Sleep(500);
    }

    // Check if still running
    DWORD exitCode;
    if (GetExitCodeProcess(it->second.hProcess, &exitCode) && exitCode == STILL_ACTIVE)
    {
        // Force kill
        TerminateProcess(it->second.hProcess, 1);
    }

    // Cleanup
    CloseHandle(it->second.hProcess);
    CloseHandle(it->second.hStdinWrite);
    CloseHandle(it->second.hStdoutRead);
    CloseHandle(it->second.hStderrRead);

    g_sessions.erase(it);

    return {{"success", true}, {"session_id", sessionId}, {"signal", signal}};
}

} // namespace ScreenControl
