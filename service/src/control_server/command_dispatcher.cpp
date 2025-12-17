/**
 * Command Dispatcher Implementation
 *
 * Routes commands to appropriate tool handlers.
 * GUI operations are proxied to the tray app, while
 * system operations are handled directly by the service.
 */

#include "command_dispatcher.h"
#include "platform.h"
#include "../core/logger.h"
#include "../tools/filesystem_tools.h"
#include "../tools/shell_tools.h"
#include "../tools/system_tools.h"
#include <thread>
#include <chrono>

#if PLATFORM_MACOS || PLATFORM_LINUX
#include <unistd.h>
#endif

using json = nlohmann::json;

namespace ScreenControl
{

// Methods that require GUI proxy (must be forwarded to tray app)
const std::vector<std::string> CommandDispatcher::GUI_METHODS = {
    "screenshot",
    "screenshot_app",
    "desktop_screenshot",
    "click",
    "click_absolute",
    "mouse_click",
    "doubleClick",
    "clickElement",
    "moveMouse",
    "mouse_move",
    "scroll",
    "scrollMouse",
    "mouse_scroll",
    "drag",
    "mouse_drag",
    "typeText",
    "keyboard_type",
    "pressKey",
    "keyboard_press",
    "keyboard_shortcut",
    "getClickableElements",
    "getUIElements",
    "getMousePosition",
    "analyzeWithOCR",
    "listApplications",
    "focusApplication",
    "launchApplication",
    "app_launch",
    "closeApp",
    "app_quit",
    "window_list",
    "window_focus",
    "window_move",
    "window_resize"
};

CommandDispatcher::CommandDispatcher()
{
}

CommandDispatcher& CommandDispatcher::getInstance()
{
    static CommandDispatcher instance;
    return instance;
}

json CommandDispatcher::dispatch(const std::string& method, const json& params)
{
    Logger::info("Dispatching command: " + method);

    try
    {
        // Check if this is a GUI method that needs proxy
        for (const auto& guiMethod : GUI_METHODS)
        {
            if (method == guiMethod)
            {
                if (m_guiProxy)
                {
                    return m_guiProxy(method, params);
                }
                else
                {
                    Logger::warn("GUI proxy not available for: " + method);
                    return errorResponse("GUI operations unavailable - tray app not connected");
                }
            }
        }

        // Filesystem operations
        if (method == "fs_list" || method == "listDirectory")
        {
            return handleFilesystemTool("list", params);
        }
        else if (method == "fs_read" || method == "readFile")
        {
            return handleFilesystemTool("read", params);
        }
        else if (method == "fs_read_range")
        {
            return handleFilesystemTool("read_range", params);
        }
        else if (method == "fs_write" || method == "writeFile")
        {
            return handleFilesystemTool("write", params);
        }
        else if (method == "fs_delete" || method == "deleteFile")
        {
            return handleFilesystemTool("delete", params);
        }
        else if (method == "fs_move" || method == "moveFile")
        {
            return handleFilesystemTool("move", params);
        }
        else if (method == "fs_search")
        {
            return handleFilesystemTool("search", params);
        }
        else if (method == "fs_grep")
        {
            return handleFilesystemTool("grep", params);
        }
        else if (method == "fs_patch")
        {
            return handleFilesystemTool("patch", params);
        }

        // Shell operations
        else if (method == "shell_exec" || method == "executeCommand")
        {
            return handleShellTool("exec", params);
        }
        else if (method == "shell_start_session")
        {
            return handleShellTool("start_session", params);
        }
        else if (method == "shell_send_input")
        {
            return handleShellTool("send_input", params);
        }
        else if (method == "shell_stop_session")
        {
            return handleShellTool("stop_session", params);
        }
        else if (method == "shell_read_output")
        {
            return handleShellTool("read_output", params);
        }

        // System operations
        else if (method == "system_info")
        {
            return handleSystemTool("info", params);
        }
        else if (method == "clipboard_read")
        {
            return handleSystemTool("clipboard_read", params);
        }
        else if (method == "clipboard_write")
        {
            return handleSystemTool("clipboard_write", params);
        }

        // Machine control (service handles directly - critical for locked state)
        else if (method == "machine_unlock" || method == "unlockMachine")
        {
            return handleMachineUnlock(params);
        }
        else if (method == "machine_lock" || method == "lockMachine")
        {
            return handleMachineLock();
        }
        else if (method == "machine_info" || method == "getMachineInfo")
        {
            return handleMachineInfo();
        }

        // Wait/delay
        else if (method == "wait")
        {
            int ms = params.value("milliseconds", 0);
            if (ms > 0)
            {
                std::this_thread::sleep_for(std::chrono::milliseconds(ms));
            }
            return {{"success", true}, {"waited_ms", ms}};
        }

        // Tools discovery (MCP protocol)
        else if (method == "tools/list")
        {
            return handleToolsList();
        }

        // Health check
        else if (method == "health" || method == "ping")
        {
            return {{"status", "ok"}, {"service", true}};
        }

        // Unknown method
        else
        {
            Logger::warn("Unknown method: " + method);
            return errorResponse("Unknown method: " + method);
        }
    }
    catch (const std::exception& e)
    {
        Logger::error("Command dispatch error: " + std::string(e.what()));
        return errorResponse(e.what());
    }
}

json CommandDispatcher::handleFilesystemTool(const std::string& method, const json& params)
{
    std::string path = params.value("path", "");

    if (method == "list")
    {
        bool recursive = params.value("recursive", false);
        int maxDepth = params.value("max_depth", 1);
        return FilesystemTools::list(path, recursive, maxDepth);
    }
    else if (method == "read")
    {
        size_t maxBytes = params.value("max_bytes", 1048576);
        return FilesystemTools::read(path, maxBytes);
    }
    else if (method == "read_range")
    {
        int startLine = params.value("start_line", 1);
        int endLine = params.value("end_line", -1);
        return FilesystemTools::readRange(path, startLine, endLine);
    }
    else if (method == "write")
    {
        std::string content = params.value("content", "");
        std::string mode = params.value("mode", "overwrite");
        bool createDirs = params.value("create_directories", false);
        return FilesystemTools::write(path, content, mode, createDirs);
    }
    else if (method == "delete")
    {
        bool recursive = params.value("recursive", false);
        return FilesystemTools::remove(path, recursive);
    }
    else if (method == "move")
    {
        std::string source = params.value("source", "");
        std::string destination = params.value("destination", "");
        return FilesystemTools::move(source, destination);
    }
    else if (method == "search")
    {
        std::string pattern = params.value("pattern", "*");
        int maxResults = params.value("max_results", 100);
        return FilesystemTools::search(path, pattern, maxResults);
    }
    else if (method == "grep")
    {
        std::string pattern = params.value("pattern", "");
        std::string glob = params.value("glob", "*");
        int maxMatches = params.value("max_matches", 100);
        return FilesystemTools::grep(path, pattern, glob, maxMatches);
    }
    else if (method == "patch")
    {
        json operations = params.value("operations", json::array());
        bool dryRun = params.value("dry_run", false);
        return FilesystemTools::patch(path, operations, dryRun);
    }

    return errorResponse("Unknown filesystem method");
}

json CommandDispatcher::handleShellTool(const std::string& method, const json& params)
{
    if (method == "exec")
    {
        std::string command = params.value("command", "");
        std::string cwd = params.value("cwd", "");
        int timeout = params.value("timeout_seconds", 30);
        return ShellTools::exec(command, cwd, timeout);
    }
    else if (method == "start_session")
    {
        std::string command = params.value("command", "");
        std::string cwd = params.value("cwd", "");
        return ShellTools::startSession(command, cwd);
    }
    else if (method == "send_input")
    {
        std::string sessionId = params.value("session_id", "");
        std::string input = params.value("input", "");
        return ShellTools::sendInput(sessionId, input);
    }
    else if (method == "stop_session")
    {
        std::string sessionId = params.value("session_id", "");
        std::string signal = params.value("signal", "TERM");
        return ShellTools::stopSession(sessionId, signal);
    }
    else if (method == "read_output")
    {
        std::string sessionId = params.value("session_id", "");
        return ShellTools::readOutput(sessionId);
    }

    return errorResponse("Unknown shell method");
}

json CommandDispatcher::handleSystemTool(const std::string& method, const json& params)
{
    if (method == "info")
    {
        return SystemTools::getSystemInfo();
    }
    else if (method == "clipboard_read")
    {
        return SystemTools::clipboardRead();
    }
    else if (method == "clipboard_write")
    {
        std::string text = params.value("text", "");
        return SystemTools::clipboardWrite(text);
    }

    return errorResponse("Unknown system method");
}

json CommandDispatcher::handleMachineUnlock(const json& params)
{
    // Machine unlock is handled directly by the service (runs as root)
    // This is critical functionality that works even when machine is locked

    std::string password = params.value("password", "");
    std::string username = params.value("username", "");

    if (password.empty())
    {
        return errorResponse("Password is required for unlock");
    }

    Logger::info("Attempting machine unlock...");

#if PLATFORM_MACOS
    // macOS: Use System Events to unlock
    // This requires running as root (LaunchDaemon)

    if (username.empty())
    {
        // Get current console user
        FILE* fp = popen("stat -f '%Su' /dev/console", "r");
        if (fp)
        {
            char buf[128];
            if (fgets(buf, sizeof(buf), fp))
            {
                username = buf;
                while (!username.empty() && (username.back() == '\n' || username.back() == '\r'))
                {
                    username.pop_back();
                }
            }
            pclose(fp);
        }
    }

    if (username.empty())
    {
        return errorResponse("Could not determine username");
    }

    // First, wake the display
    system("caffeinate -u -t 1");

    // Small delay for display to wake
    usleep(500000);

    // Use osascript with System Events to unlock
    // This requires accessibility permissions
    std::string unlockCmd = "osascript -e 'tell application \"System Events\" to keystroke \"" +
                            password + "\"' -e 'tell application \"System Events\" to keystroke return'";

    int result = system(unlockCmd.c_str());

    if (result == 0)
    {
        Logger::info("Machine unlock command sent");
        return {{"success", true}, {"message", "Unlock command sent"}};
    }
    else
    {
        Logger::error("Machine unlock failed with code: " + std::to_string(result));
        return errorResponse("Unlock command failed");
    }

#elif PLATFORM_WINDOWS
    // Windows: Use LockWorkStation API (reverse is more complex)
    // For unlock, we'd need to interface with credential providers
    return errorResponse("Windows unlock not yet implemented");

#elif PLATFORM_LINUX
    // Linux: Various methods depending on display manager
    return errorResponse("Linux unlock not yet implemented");

#else
    return errorResponse("Unlock not supported on this platform");
#endif
}

json CommandDispatcher::handleMachineLock()
{
    Logger::info("Locking machine...");

#if PLATFORM_MACOS
    // macOS: Use CGSession to lock
    int result = system("/System/Library/CoreServices/Menu\\ Extras/User.menu/Contents/Resources/CGSession -suspend");
    if (result == 0)
    {
        return {{"success", true}, {"message", "Machine locked"}};
    }
    return errorResponse("Failed to lock machine");

#elif PLATFORM_WINDOWS
    // Windows: Use LockWorkStation
    int result = system("rundll32.exe user32.dll,LockWorkStation");
    if (result == 0)
    {
        return {{"success", true}, {"message", "Machine locked"}};
    }
    return errorResponse("Failed to lock machine");

#elif PLATFORM_LINUX
    // Linux: Try common methods
    int result = system("loginctl lock-session 2>/dev/null || xdg-screensaver lock 2>/dev/null || gnome-screensaver-command -l 2>/dev/null");
    if (result == 0)
    {
        return {{"success", true}, {"message", "Machine locked"}};
    }
    return errorResponse("Failed to lock machine");

#else
    return errorResponse("Lock not supported on this platform");
#endif
}

json CommandDispatcher::handleMachineInfo()
{
    // Get base system info
    json info = SystemTools::getSystemInfo();

    // Add screen lock status
#if PLATFORM_MACOS
    // Check if screen is locked using CGSession
    FILE* fp = popen("python3 -c \"import Quartz; print(Quartz.CGSessionCopyCurrentDictionary().get('CGSSessionScreenIsLocked', False))\" 2>/dev/null", "r");
    bool isLocked = false;
    if (fp)
    {
        char buf[32];
        if (fgets(buf, sizeof(buf), fp))
        {
            isLocked = (strncmp(buf, "True", 4) == 0);
        }
        pclose(fp);
    }
    info["isScreenLocked"] = isLocked;
#else
    info["isScreenLocked"] = false;  // TODO: Implement for other platforms
#endif

    // Add service info
    info["serviceVersion"] = "1.2.0";
#if PLATFORM_MACOS || PLATFORM_LINUX
    info["serviceRunningAsRoot"] = (geteuid() == 0);
#else
    info["serviceRunningAsRoot"] = false;  // Windows: check differently
#endif

    return info;
}

json CommandDispatcher::handleToolsList()
{
    // Return list of available tools in MCP format
    json tools = json::array();

    // Helper to create tool definition
    auto addTool = [&tools](const std::string& name, const std::string& description,
                            const json& properties = json::object(),
                            const json& required = json::array()) {
        json tool = {
            {"name", name},
            {"description", description},
            {"inputSchema", {
                {"type", "object"},
                {"properties", properties},
                {"required", required}
            }}
        };
        tools.push_back(tool);
    };

    // Common property for optional agentId
    json agentIdProp = {{"type", "string"}, {"description", "Target agent ID (optional)"}};

    // ============ DESKTOP/GUI TOOLS ============
    addTool("desktop_screenshot", "Take a screenshot of the entire desktop",
        {{"format", {{"type", "string"}, {"enum", {"png", "jpeg"}}}},
         {"quality", {{"type", "number"}, {"description", "JPEG quality (0-100)"}}},
         {"agentId", agentIdProp}});

    addTool("mouse_click", "Click at specific screen coordinates",
        {{"x", {{"type", "number"}, {"description", "X coordinate"}}},
         {"y", {{"type", "number"}, {"description", "Y coordinate"}}},
         {"button", {{"type", "string"}, {"enum", {"left", "right", "middle"}}}},
         {"clickCount", {{"type", "number"}, {"description", "1 for single, 2 for double"}}},
         {"agentId", agentIdProp}},
        {"x", "y"});

    addTool("mouse_move", "Move mouse to specific screen coordinates",
        {{"x", {{"type", "number"}}},
         {"y", {{"type", "number"}}},
         {"agentId", agentIdProp}},
        {"x", "y"});

    addTool("mouse_drag", "Drag mouse from one position to another",
        {{"x1", {{"type", "number"}, {"description", "Start X"}}},
         {"y1", {{"type", "number"}, {"description", "Start Y"}}},
         {"x2", {{"type", "number"}, {"description", "End X"}}},
         {"y2", {{"type", "number"}, {"description", "End Y"}}},
         {"agentId", agentIdProp}},
        {"x1", "y1", "x2", "y2"});

    addTool("mouse_scroll", "Scroll the mouse wheel",
        {{"deltaX", {{"type", "number"}, {"description", "Horizontal scroll amount"}}},
         {"deltaY", {{"type", "number"}, {"description", "Vertical scroll amount"}}},
         {"agentId", agentIdProp}});

    addTool("keyboard_type", "Type text using the keyboard",
        {{"text", {{"type", "string"}, {"description", "Text to type"}}},
         {"agentId", agentIdProp}},
        {"text"});

    addTool("keyboard_press", "Press a specific key",
        {{"key", {{"type", "string"}, {"description", "Key to press (e.g., enter, tab, escape)"}}},
         {"agentId", agentIdProp}},
        {"key"});

    addTool("keyboard_shortcut", "Execute a keyboard shortcut",
        {{"shortcut", {{"type", "string"}, {"description", "Shortcut to execute (e.g., ctrl+c, cmd+v)"}}},
         {"agentId", agentIdProp}},
        {"shortcut"});

    // ============ WINDOW/APP TOOLS ============
    addTool("window_list", "List all open windows",
        {{"agentId", agentIdProp}});

    addTool("window_focus", "Focus a specific window",
        {{"windowId", {{"type", "string"}, {"description", "Window identifier"}}},
         {"title", {{"type", "string"}, {"description", "Window title (partial match)"}}},
         {"agentId", agentIdProp}});

    addTool("app_launch", "Launch an application",
        {{"identifier", {{"type", "string"}, {"description", "App name or bundle ID"}}},
         {"agentId", agentIdProp}},
        {"identifier"});

    addTool("app_quit", "Quit an application",
        {{"identifier", {{"type", "string"}, {"description", "App name or bundle ID"}}},
         {"force", {{"type", "boolean"}, {"description", "Force quit"}}},
         {"agentId", agentIdProp}},
        {"identifier"});

    // ============ SYSTEM TOOLS ============
    addTool("system_info", "Get system information (OS, CPU, memory, etc.)",
        {{"agentId", agentIdProp}});

    addTool("clipboard_read", "Read text from clipboard",
        {{"agentId", agentIdProp}});

    addTool("clipboard_write", "Write text to clipboard",
        {{"text", {{"type", "string"}, {"description", "Text to write to clipboard"}}},
         {"agentId", agentIdProp}},
        {"text"});

    addTool("wait", "Wait for specified milliseconds",
        {{"milliseconds", {{"type", "number"}, {"description", "Time to wait in milliseconds"}}},
         {"agentId", agentIdProp}},
        {"milliseconds"});

    // ============ FILESYSTEM TOOLS ============
    addTool("fs_list", "List directory contents",
        {{"path", {{"type", "string"}, {"description", "Directory path"}}},
         {"recursive", {{"type", "boolean"}, {"description", "List recursively"}}},
         {"max_depth", {{"type", "number"}, {"description", "Max recursion depth"}}},
         {"agentId", agentIdProp}},
        {"path"});

    addTool("fs_read", "Read file contents",
        {{"path", {{"type", "string"}, {"description", "File path"}}},
         {"max_bytes", {{"type", "number"}, {"description", "Maximum bytes to read"}}},
         {"agentId", agentIdProp}},
        {"path"});

    addTool("fs_read_range", "Read specific line range from file",
        {{"path", {{"type", "string"}, {"description", "File path"}}},
         {"start_line", {{"type", "number"}, {"description", "Start line (1-indexed)"}}},
         {"end_line", {{"type", "number"}, {"description", "End line (-1 for EOF)"}}},
         {"agentId", agentIdProp}},
        {"path"});

    addTool("fs_write", "Write content to file",
        {{"path", {{"type", "string"}, {"description", "File path"}}},
         {"content", {{"type", "string"}, {"description", "Content to write"}}},
         {"mode", {{"type", "string"}, {"enum", {"overwrite", "append"}}}},
         {"create_directories", {{"type", "boolean"}, {"description", "Create parent directories"}}},
         {"agentId", agentIdProp}},
        {"path", "content"});

    addTool("fs_delete", "Delete file or directory",
        {{"path", {{"type", "string"}, {"description", "Path to delete"}}},
         {"recursive", {{"type", "boolean"}, {"description", "Delete recursively"}}},
         {"agentId", agentIdProp}},
        {"path"});

    addTool("fs_move", "Move or rename files",
        {{"source", {{"type", "string"}, {"description", "Source path"}}},
         {"destination", {{"type", "string"}, {"description", "Destination path"}}},
         {"agentId", agentIdProp}},
        {"source", "destination"});

    addTool("fs_search", "Search files by glob pattern",
        {{"path", {{"type", "string"}, {"description", "Base path"}}},
         {"pattern", {{"type", "string"}, {"description", "Glob pattern (e.g., *.txt)"}}},
         {"max_results", {{"type", "number"}, {"description", "Maximum results"}}},
         {"agentId", agentIdProp}},
        {"path", "pattern"});

    addTool("fs_grep", "Search file contents with regex",
        {{"path", {{"type", "string"}, {"description", "Base path"}}},
         {"pattern", {{"type", "string"}, {"description", "Regex pattern"}}},
         {"glob", {{"type", "string"}, {"description", "File glob filter"}}},
         {"max_matches", {{"type", "number"}, {"description", "Maximum matches"}}},
         {"agentId", agentIdProp}},
        {"path", "pattern"});

    addTool("fs_patch", "Apply patches to files",
        {{"path", {{"type", "string"}, {"description", "File path"}}},
         {"operations", {{"type", "array"}, {"description", "Patch operations"}}},
         {"dry_run", {{"type", "boolean"}, {"description", "Preview without applying"}}},
         {"agentId", agentIdProp}},
        {"path", "operations"});

    // ============ SHELL TOOLS ============
    addTool("shell_exec", "Execute a shell command",
        {{"command", {{"type", "string"}, {"description", "Command to execute"}}},
         {"cwd", {{"type", "string"}, {"description", "Working directory"}}},
         {"timeout_seconds", {{"type", "number"}, {"description", "Timeout in seconds"}}},
         {"agentId", agentIdProp}},
        {"command"});

    addTool("shell_start_session", "Start an interactive shell session",
        {{"command", {{"type", "string"}, {"description", "Initial command (optional)"}}},
         {"cwd", {{"type", "string"}, {"description", "Working directory"}}},
         {"agentId", agentIdProp}});

    addTool("shell_send_input", "Send input to a shell session",
        {{"session_id", {{"type", "string"}, {"description", "Session ID"}}},
         {"input", {{"type", "string"}, {"description", "Input to send"}}},
         {"agentId", agentIdProp}},
        {"session_id", "input"});

    addTool("shell_read_output", "Read output from a shell session",
        {{"session_id", {{"type", "string"}, {"description", "Session ID"}}},
         {"agentId", agentIdProp}},
        {"session_id"});

    addTool("shell_stop_session", "Stop a shell session",
        {{"session_id", {{"type", "string"}, {"description", "Session ID"}}},
         {"signal", {{"type", "string"}, {"description", "Signal to send (TERM, KILL)"}}},
         {"agentId", agentIdProp}},
        {"session_id"});

    Logger::info("Returning " + std::to_string(tools.size()) + " tools");
    return {{"tools", tools}};
}

json CommandDispatcher::errorResponse(const std::string& message)
{
    return {{"error", message}};
}

} // namespace ScreenControl
