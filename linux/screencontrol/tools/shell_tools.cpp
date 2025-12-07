/**
 * Shell Tools Implementation
 *
 * Uses fork/exec for command execution with pipe-based I/O.
 */

#include "shell_tools.h"
#include "../core/logger.h"
#include <unistd.h>
#include <sys/wait.h>
#include <sys/select.h>
#include <signal.h>
#include <fcntl.h>
#include <map>
#include <mutex>
#include <random>
#include <cstring>
#include <cerrno>

using json = nlohmann::json;

namespace ScreenControl
{

struct ShellSession
{
    pid_t pid;
    int stdinFd;
    int stdoutFd;
    int stderrFd;
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

static void setNonBlocking(int fd)
{
    int flags = fcntl(fd, F_GETFL, 0);
    fcntl(fd, F_SETFL, flags | O_NONBLOCK);
}

json ShellTools::exec(const std::string& command, const std::string& cwd, int timeout)
{
    int stdoutPipe[2];
    int stderrPipe[2];

    if (pipe(stdoutPipe) < 0 || pipe(stderrPipe) < 0)
    {
        return {{"success", false}, {"error", "Failed to create pipes"}};
    }

    pid_t pid = fork();

    if (pid < 0)
    {
        close(stdoutPipe[0]); close(stdoutPipe[1]);
        close(stderrPipe[0]); close(stderrPipe[1]);
        return {{"success", false}, {"error", "Failed to fork"}};
    }

    if (pid == 0)
    {
        // Child process
        close(stdoutPipe[0]);
        close(stderrPipe[0]);

        dup2(stdoutPipe[1], STDOUT_FILENO);
        dup2(stderrPipe[1], STDERR_FILENO);

        close(stdoutPipe[1]);
        close(stderrPipe[1]);

        if (!cwd.empty())
        {
            if (chdir(cwd.c_str()) != 0)
            {
                _exit(1);
            }
        }

        execl("/bin/sh", "sh", "-c", command.c_str(), nullptr);
        _exit(127);
    }

    // Parent process
    close(stdoutPipe[1]);
    close(stderrPipe[1]);

    setNonBlocking(stdoutPipe[0]);
    setNonBlocking(stderrPipe[0]);

    std::string stdoutStr;
    std::string stderrStr;
    char buffer[4096];

    // Wait with timeout
    int elapsed = 0;
    int status = 0;
    bool timedOut = false;

    while (elapsed < timeout * 1000)
    {
        fd_set readfds;
        FD_ZERO(&readfds);
        FD_SET(stdoutPipe[0], &readfds);
        FD_SET(stderrPipe[0], &readfds);

        int maxfd = std::max(stdoutPipe[0], stderrPipe[0]) + 1;

        struct timeval tv;
        tv.tv_sec = 0;
        tv.tv_usec = 100000;  // 100ms

        int ready = select(maxfd, &readfds, nullptr, nullptr, &tv);

        if (ready > 0)
        {
            if (FD_ISSET(stdoutPipe[0], &readfds))
            {
                ssize_t n = read(stdoutPipe[0], buffer, sizeof(buffer) - 1);
                if (n > 0)
                {
                    buffer[n] = '\0';
                    stdoutStr += buffer;
                }
            }
            if (FD_ISSET(stderrPipe[0], &readfds))
            {
                ssize_t n = read(stderrPipe[0], buffer, sizeof(buffer) - 1);
                if (n > 0)
                {
                    buffer[n] = '\0';
                    stderrStr += buffer;
                }
            }
        }

        // Check if process has exited
        int waitResult = waitpid(pid, &status, WNOHANG);
        if (waitResult == pid)
        {
            // Read remaining output
            while (true)
            {
                ssize_t n = read(stdoutPipe[0], buffer, sizeof(buffer) - 1);
                if (n <= 0) break;
                buffer[n] = '\0';
                stdoutStr += buffer;
            }
            while (true)
            {
                ssize_t n = read(stderrPipe[0], buffer, sizeof(buffer) - 1);
                if (n <= 0) break;
                buffer[n] = '\0';
                stderrStr += buffer;
            }
            break;
        }

        elapsed += 100;
    }

    if (elapsed >= timeout * 1000)
    {
        timedOut = true;
        kill(pid, SIGKILL);
        waitpid(pid, &status, 0);
    }

    close(stdoutPipe[0]);
    close(stderrPipe[0]);

    if (timedOut)
    {
        return {
            {"success", false},
            {"error", "Command timed out"},
            {"timeout", timeout},
            {"stdout", stdoutStr},
            {"stderr", stderrStr}
        };
    }

    int exitCode = WIFEXITED(status) ? WEXITSTATUS(status) : -1;

    return {
        {"success", true},
        {"stdout", stdoutStr},
        {"stderr", stderrStr},
        {"exit_code", exitCode},
        {"command", command}
    };
}

json ShellTools::startSession(const std::string& command, const std::string& cwd)
{
    int stdinPipe[2];
    int stdoutPipe[2];
    int stderrPipe[2];

    if (pipe(stdinPipe) < 0 || pipe(stdoutPipe) < 0 || pipe(stderrPipe) < 0)
    {
        return {{"success", false}, {"error", "Failed to create pipes"}};
    }

    pid_t pid = fork();

    if (pid < 0)
    {
        close(stdinPipe[0]); close(stdinPipe[1]);
        close(stdoutPipe[0]); close(stdoutPipe[1]);
        close(stderrPipe[0]); close(stderrPipe[1]);
        return {{"success", false}, {"error", "Failed to fork"}};
    }

    if (pid == 0)
    {
        // Child process
        close(stdinPipe[1]);
        close(stdoutPipe[0]);
        close(stderrPipe[0]);

        dup2(stdinPipe[0], STDIN_FILENO);
        dup2(stdoutPipe[1], STDOUT_FILENO);
        dup2(stderrPipe[1], STDERR_FILENO);

        close(stdinPipe[0]);
        close(stdoutPipe[1]);
        close(stderrPipe[1]);

        if (!cwd.empty())
        {
            chdir(cwd.c_str());
        }

        std::string shell = command.empty() ? "/bin/bash" : command;
        execl("/bin/sh", "sh", "-c", shell.c_str(), nullptr);
        _exit(127);
    }

    // Parent process
    close(stdinPipe[0]);
    close(stdoutPipe[1]);
    close(stderrPipe[1]);

    setNonBlocking(stdoutPipe[0]);
    setNonBlocking(stderrPipe[0]);

    std::string sessionId = generateSessionId();

    {
        std::lock_guard<std::mutex> lock(g_sessionMutex);
        g_sessions[sessionId] = {
            pid,
            stdinPipe[1],
            stdoutPipe[0],
            stderrPipe[0]
        };
    }

    return {
        {"success", true},
        {"session_id", sessionId},
        {"pid", static_cast<int>(pid)}
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

    ssize_t written = write(it->second.stdinFd, input.c_str(), input.size());

    if (written < 0)
    {
        return {{"success", false}, {"error", "Failed to write to session: " + std::string(strerror(errno))}};
    }

    return {{"success", true}, {"session_id", sessionId}, {"bytes_written", static_cast<int>(written)}};
}

json ShellTools::stopSession(const std::string& sessionId, const std::string& signal)
{
    std::lock_guard<std::mutex> lock(g_sessionMutex);

    auto it = g_sessions.find(sessionId);
    if (it == g_sessions.end())
    {
        return {{"success", false}, {"error", "Session not found: " + sessionId}};
    }

    int sig = SIGTERM;
    if (signal == "KILL" || signal == "9")
    {
        sig = SIGKILL;
    }
    else if (signal == "INT" || signal == "2")
    {
        sig = SIGINT;
    }
    else if (signal == "HUP" || signal == "1")
    {
        sig = SIGHUP;
    }

    kill(it->second.pid, sig);

    // Wait for process to exit
    int status;
    waitpid(it->second.pid, &status, WNOHANG);

    // Cleanup
    close(it->second.stdinFd);
    close(it->second.stdoutFd);
    close(it->second.stderrFd);

    g_sessions.erase(it);

    return {{"success", true}, {"session_id", sessionId}, {"signal", signal}};
}

} // namespace ScreenControl
