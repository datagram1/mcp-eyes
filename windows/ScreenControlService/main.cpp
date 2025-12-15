/**
 * ScreenControl Windows Service
 *
 * Main entry point for the Windows service.
 * Handles both service mode and console mode for debugging.
 */

#include <windows.h>
#include <iostream>
#include <string>
#include <thread>
#include <cstdio>  // for fprintf
#include <atomic>
#include "service.h"
#include "server/http_server.h"
#include "core/logger.h"
#include "core/config.h"
#include "control_server/websocket_client.h"
#include "tools/system_tools.h"
#include "tools/filesystem_tools.h"
#include "tools/shell_tools.h"
#include "tools/gui_tools.h"
#include "libs/json.hpp"

// Service name - note: SERVICE_DESC_STR used instead of SERVICE_DESCRIPTION to avoid Windows typedef conflict
constexpr const wchar_t* SERVICE_NAME = L"ScreenControlService";
constexpr const wchar_t* SERVICE_DISPLAY_NAME = L"ScreenControl Service";
constexpr const wchar_t* SERVICE_DESC_STR = L"ScreenControl agent service for AI/LLM computer control";

// Global service status handle
SERVICE_STATUS_HANDLE g_serviceStatusHandle = nullptr;
SERVICE_STATUS g_serviceStatus = {};
HANDLE g_stopEvent = nullptr;
static ScreenControl::WebSocketClient* g_wsClient = nullptr;
static std::atomic<bool> g_running{true};

using json = nlohmann::json;

// Get list of available tools in MCP format
json getAvailableTools()
{
    json tools = json::array();

    // System tools
    tools.push_back({
        {"name", "system_info"},
        {"description", "Get system information (OS, CPU, memory, hostname, uptime)"},
        {"inputSchema", {{"type", "object"}, {"properties", json::object()}}}
    });

    tools.push_back({
        {"name", "wait"},
        {"description", "Wait for specified milliseconds"},
        {"inputSchema", {
            {"type", "object"},
            {"properties", {{"milliseconds", {{"type", "number"}}}}},
            {"required", json::array({"milliseconds"})}
        }}
    });

    tools.push_back({
        {"name", "clipboard_read"},
        {"description", "Read content from clipboard"},
        {"inputSchema", {{"type", "object"}, {"properties", json::object()}}}
    });

    tools.push_back({
        {"name", "clipboard_write"},
        {"description", "Write content to clipboard"},
        {"inputSchema", {
            {"type", "object"},
            {"properties", {{"text", {{"type", "string"}}}}},
            {"required", json::array({"text"})}
        }}
    });

    tools.push_back({
        {"name", "window_list"},
        {"description", "List all open windows"},
        {"inputSchema", {{"type", "object"}, {"properties", json::object()}}}
    });

    // Filesystem tools
    tools.push_back({
        {"name", "fs_list"},
        {"description", "List directory contents"},
        {"inputSchema", {
            {"type", "object"},
            {"properties", {{"path", {{"type", "string"}}}}},
            {"required", json::array({"path"})}
        }}
    });

    tools.push_back({
        {"name", "fs_read"},
        {"description", "Read file contents"},
        {"inputSchema", {
            {"type", "object"},
            {"properties", {{"path", {{"type", "string"}}}}},
            {"required", json::array({"path"})}
        }}
    });

    tools.push_back({
        {"name", "fs_write"},
        {"description", "Write content to file"},
        {"inputSchema", {
            {"type", "object"},
            {"properties", {
                {"path", {{"type", "string"}}},
                {"content", {{"type", "string"}}},
                {"create_directories", {{"type", "boolean"}}}
            }},
            {"required", json::array({"path", "content"})}
        }}
    });

    tools.push_back({
        {"name", "fs_search"},
        {"description", "Search for files using glob pattern"},
        {"inputSchema", {
            {"type", "object"},
            {"properties", {
                {"path", {{"type", "string"}}},
                {"pattern", {{"type", "string"}}}
            }},
            {"required", json::array({"path", "pattern"})}
        }}
    });

    tools.push_back({
        {"name", "fs_grep"},
        {"description", "Search file contents using regex"},
        {"inputSchema", {
            {"type", "object"},
            {"properties", {
                {"path", {{"type", "string"}}},
                {"pattern", {{"type", "string"}}}
            }},
            {"required", json::array({"path", "pattern"})}
        }}
    });

    tools.push_back({
        {"name", "fs_delete"},
        {"description", "Delete a file or directory"},
        {"inputSchema", {
            {"type", "object"},
            {"properties", {
                {"path", {{"type", "string"}}},
                {"recursive", {{"type", "boolean"}}}
            }},
            {"required", json::array({"path"})}
        }}
    });

    tools.push_back({
        {"name", "fs_move"},
        {"description", "Move/rename a file or directory"},
        {"inputSchema", {
            {"type", "object"},
            {"properties", {
                {"source", {{"type", "string"}}},
                {"destination", {{"type", "string"}}}
            }},
            {"required", json::array({"source", "destination"})}
        }}
    });

    // Shell tools
    tools.push_back({
        {"name", "shell_exec"},
        {"description", "Execute a shell command"},
        {"inputSchema", {
            {"type", "object"},
            {"properties", {
                {"command", {{"type", "string"}}},
                {"cwd", {{"type", "string"}}},
                {"timeout_seconds", {{"type", "number"}}}
            }},
            {"required", json::array({"command"})}
        }}
    });

    // Screenshot
    tools.push_back({
        {"name", "screenshot"},
        {"description", "Take a screenshot of the desktop"},
        {"inputSchema", {{"type", "object"}, {"properties", json::object()}}}
    });

    return tools;
}

// Handle tool execution from control server
void handleToolCommand(const std::string& requestId, const std::string& method, const std::string& paramsJson)
{
    auto& logger = ScreenControl::Logger::getInstance();
    logger.info(L"[Tool] Executing: " + std::wstring(method.begin(), method.end()));

    json result;
    try
    {
        // Handle MCP protocol methods
        if (method == "tools/list")
        {
            result = {{"tools", getAvailableTools()}};
            if (g_wsClient) g_wsClient->sendResponse(requestId, result.dump());
            return;
        }
        else if (method == "prompts/list")
        {
            result = {{"prompts", json::array()}};
            if (g_wsClient) g_wsClient->sendResponse(requestId, result.dump());
            return;
        }
        else if (method == "resources/list")
        {
            result = {{"resources", json::array()}};
            if (g_wsClient) g_wsClient->sendResponse(requestId, result.dump());
            return;
        }

        // Parse params for tools/call
        json params = json::parse(paramsJson);
        std::string toolName = params.value("name", "");
        json args = params.value("arguments", json::object());

        // Route to appropriate tool
        if (toolName == "system_info")
        {
            result = ScreenControl::SystemTools::getSystemInfo();
        }
        else if (toolName == "clipboard_read")
        {
            result = ScreenControl::SystemTools::clipboardRead();
        }
        else if (toolName == "clipboard_write")
        {
            result = ScreenControl::SystemTools::clipboardWrite(args.value("text", ""));
        }
        else if (toolName == "wait")
        {
            result = ScreenControl::SystemTools::wait(args.value("milliseconds", 1000));
        }
        else if (toolName == "window_list")
        {
            result = ScreenControl::SystemTools::getWindowList();
        }
        else if (toolName == "fs_list")
        {
            result = ScreenControl::FilesystemTools::list(args.value("path", "."), false, 1);
        }
        else if (toolName == "fs_read")
        {
            result = ScreenControl::FilesystemTools::read(args.value("path", ""), 1024 * 1024);  // 1MB max
        }
        else if (toolName == "fs_write")
        {
            result = ScreenControl::FilesystemTools::write(
                args.value("path", ""),
                args.value("content", ""),
                "overwrite",
                args.value("create_directories", false)
            );
        }
        else if (toolName == "fs_search")
        {
            result = ScreenControl::FilesystemTools::search(
                args.value("path", "."),
                args.value("pattern", "*"),
                100
            );
        }
        else if (toolName == "fs_grep")
        {
            result = ScreenControl::FilesystemTools::grep(
                args.value("path", "."),
                args.value("pattern", ""),
                "*",
                100
            );
        }
        else if (toolName == "fs_delete")
        {
            result = ScreenControl::FilesystemTools::remove(
                args.value("path", ""),
                args.value("recursive", false)
            );
        }
        else if (toolName == "fs_move")
        {
            result = ScreenControl::FilesystemTools::move(
                args.value("source", ""),
                args.value("destination", "")
            );
        }
        else if (toolName == "shell_exec")
        {
            result = ScreenControl::ShellTools::exec(
                args.value("command", ""),
                args.value("cwd", ""),
                args.value("timeout_seconds", 30)
            );
        }
        else if (toolName == "screenshot")
        {
            result = ScreenControl::GuiTools::screenshot();
        }
        else
        {
            result = {{"success", false}, {"error", "Unknown tool: " + toolName}};
        }
    }
    catch (const std::exception& e)
    {
        result = {{"success", false}, {"error", std::string("Tool execution failed: ") + e.what()}};
    }

    if (g_wsClient)
    {
        g_wsClient->sendResponse(requestId, result.dump());
    }
}

// Forward declarations
void WINAPI ServiceMain(DWORD argc, LPWSTR* argv);
void WINAPI ServiceCtrlHandler(DWORD ctrlCode);
void RunService();
void RunConsole();
bool InstallService();
bool UninstallService();

// Use wmain for MSVC, main for MinGW (with argc/argv conversion)
#ifdef _MSC_VER
int wmain(int argc, wchar_t* argv[])
#else
int main(int argc, char* argvA[])
#endif
{
    // Initialize logger
    ScreenControl::Logger::getInstance().init();

    // Parse command line arguments
    if (argc > 1)
    {
#ifdef _MSC_VER
        std::wstring arg = argv[1];
#else
        // MinGW: convert char* to wstring
        std::string argStr(argvA[1]);
        std::wstring arg(argStr.begin(), argStr.end());
#endif

        if (arg == L"--install" || arg == L"-i")
        {
            if (InstallService())
            {
                std::wcout << L"Service installed successfully." << std::endl;
                return 0;
            }
            else
            {
                std::wcerr << L"Failed to install service." << std::endl;
                return 1;
            }
        }
        else if (arg == L"--uninstall" || arg == L"-u")
        {
            if (UninstallService())
            {
                std::wcout << L"Service uninstalled successfully." << std::endl;
                return 0;
            }
            else
            {
                std::wcerr << L"Failed to uninstall service." << std::endl;
                return 1;
            }
        }
        else if (arg == L"--console" || arg == L"-c")
        {
            // Run in console mode for debugging
            std::wcout << L"Running in console mode..." << std::endl;
            RunConsole();
            return 0;
        }
        else if (arg == L"--help" || arg == L"-h")
        {
            std::wcout << L"ScreenControl Service" << std::endl;
            std::wcout << L"Usage: ScreenControlService.exe [options]" << std::endl;
            std::wcout << L"Options:" << std::endl;
            std::wcout << L"  --install, -i    Install the service" << std::endl;
            std::wcout << L"  --uninstall, -u  Uninstall the service" << std::endl;
            std::wcout << L"  --console, -c    Run in console mode (for debugging)" << std::endl;
            std::wcout << L"  --help, -h       Show this help" << std::endl;
            return 0;
        }
    }

    // Run as service
    SERVICE_TABLE_ENTRYW serviceTable[] =
    {
        { const_cast<LPWSTR>(SERVICE_NAME), ServiceMain },
        { nullptr, nullptr }
    };

    if (!StartServiceCtrlDispatcherW(serviceTable))
    {
        DWORD error = GetLastError();
        if (error == ERROR_FAILED_SERVICE_CONTROLLER_CONNECT)
        {
            // Not started by SCM, run in console mode
            std::wcout << L"Not running as service. Use --console for console mode." << std::endl;
            std::wcout << L"Use --install to install as a Windows service." << std::endl;
            return 1;
        }
        ScreenControl::Logger::getInstance().error(L"StartServiceCtrlDispatcher failed: " + std::to_wstring(error));
        return 1;
    }

    return 0;
}

void WINAPI ServiceMain(DWORD argc, LPWSTR* argv)
{
    // Register service control handler
    g_serviceStatusHandle = RegisterServiceCtrlHandlerW(SERVICE_NAME, ServiceCtrlHandler);
    if (!g_serviceStatusHandle)
    {
        ScreenControl::Logger::getInstance().error(L"RegisterServiceCtrlHandler failed");
        return;
    }

    // Initialize service status
    g_serviceStatus.dwServiceType = SERVICE_WIN32_OWN_PROCESS;
    g_serviceStatus.dwControlsAccepted = 0;
    g_serviceStatus.dwCurrentState = SERVICE_START_PENDING;
    g_serviceStatus.dwWin32ExitCode = 0;
    g_serviceStatus.dwServiceSpecificExitCode = 0;
    g_serviceStatus.dwCheckPoint = 0;
    g_serviceStatus.dwWaitHint = 3000;

    SetServiceStatus(g_serviceStatusHandle, &g_serviceStatus);

    // Create stop event
    g_stopEvent = CreateEventW(nullptr, TRUE, FALSE, nullptr);
    if (!g_stopEvent)
    {
        g_serviceStatus.dwCurrentState = SERVICE_STOPPED;
        g_serviceStatus.dwWin32ExitCode = GetLastError();
        SetServiceStatus(g_serviceStatusHandle, &g_serviceStatus);
        return;
    }

    // Report running
    g_serviceStatus.dwCurrentState = SERVICE_RUNNING;
    g_serviceStatus.dwControlsAccepted = SERVICE_ACCEPT_STOP | SERVICE_ACCEPT_SHUTDOWN;
    SetServiceStatus(g_serviceStatusHandle, &g_serviceStatus);

    ScreenControl::Logger::getInstance().info(L"Service started");

    // Run the service
    RunService();

    // Cleanup
    CloseHandle(g_stopEvent);

    g_serviceStatus.dwCurrentState = SERVICE_STOPPED;
    SetServiceStatus(g_serviceStatusHandle, &g_serviceStatus);

    ScreenControl::Logger::getInstance().info(L"Service stopped");
}

void WINAPI ServiceCtrlHandler(DWORD ctrlCode)
{
    switch (ctrlCode)
    {
    case SERVICE_CONTROL_STOP:
    case SERVICE_CONTROL_SHUTDOWN:
        g_serviceStatus.dwCurrentState = SERVICE_STOP_PENDING;
        SetServiceStatus(g_serviceStatusHandle, &g_serviceStatus);

        // Signal stop
        SetEvent(g_stopEvent);
        break;

    case SERVICE_CONTROL_INTERROGATE:
        break;

    default:
        break;
    }

    SetServiceStatus(g_serviceStatusHandle, &g_serviceStatus);
}

void RunService()
{
    auto& logger = ScreenControl::Logger::getInstance();

    // Load configuration
    auto& config = ScreenControl::Config::getInstance();
    config.load();

    // Start HTTP server
    ScreenControl::HttpServer server;
    if (!server.start(config.getHttpPort()))
    {
        logger.error(L"Failed to start HTTP server");
        return;
    }

    logger.info(L"HTTP server listening on port " + std::to_wstring(config.getHttpPort()));

    // Load WebSocket configuration
    ScreenControl::DebugConfig wsConfig;
    std::string configPath = "C:\\ProgramData\\ScreenControl\\debug-config.json";

    // Also check local directory for config
    if (!wsConfig.load(configPath))
    {
        // Try current directory
        wsConfig.load("debug-config.json");
    }

    // Connect to control server if configured
    std::thread wsThread;
    if (!wsConfig.serverUrl.empty())
    {
        logger.info(L"Control server configured: " + std::wstring(wsConfig.serverUrl.begin(), wsConfig.serverUrl.end()));

        g_wsClient = new ScreenControl::WebSocketClient();

        g_wsClient->setLogCallback([](const std::string& msg) {
            ScreenControl::Logger::getInstance().info(std::wstring(msg.begin(), msg.end()));
        });

        g_wsClient->setConnectionCallback([](bool connected) {
            auto& log = ScreenControl::Logger::getInstance();
            if (connected)
            {
                log.info(L"[WS] Connected to control server");
            }
            else
            {
                log.info(L"[WS] Disconnected from control server");
            }
        });

        g_wsClient->setStatusCallback([](const std::string& agentId, const std::string& status) {
            auto& log = ScreenControl::Logger::getInstance();
            log.info(L"[WS] Agent registered: " + std::wstring(agentId.begin(), agentId.end()) +
                     L", license: " + std::wstring(status.begin(), status.end()));
        });

        g_wsClient->setCommandCallback([](const std::string& requestId, const std::string& method, const std::string& params) {
            handleToolCommand(requestId, method, params);
        });

        // Connect in background thread with retry
        wsThread = std::thread([&wsConfig]() {
            while (g_running && WaitForSingleObject(g_stopEvent, 0) == WAIT_TIMEOUT)
            {
                if (g_wsClient && !g_wsClient->isConnected())
                {
                    ScreenControl::Logger::getInstance().info(L"[WS] Attempting to connect...");
                    if (g_wsClient->connect(wsConfig))
                    {
                        ScreenControl::Logger::getInstance().info(L"[WS] Connected successfully");
                    }
                    else
                    {
                        ScreenControl::Logger::getInstance().info(L"[WS] Connection failed, will retry in 10 seconds");
                    }
                }
                // Check connection every 10 seconds
                for (int i = 0; i < 10 && g_running && WaitForSingleObject(g_stopEvent, 0) == WAIT_TIMEOUT; i++)
                {
                    Sleep(1000);
                }
            }
        });
    }
    else
    {
        logger.info(L"No control server configured. Running in local-only mode.");
        logger.info(L"To connect, create C:\\ProgramData\\ScreenControl\\debug-config.json");
    }

    // Wait for stop signal
    WaitForSingleObject(g_stopEvent, INFINITE);

    // Cleanup
    g_running = false;

    if (g_wsClient)
    {
        g_wsClient->disconnect();
        if (wsThread.joinable())
        {
            wsThread.join();
        }
        delete g_wsClient;
        g_wsClient = nullptr;
    }

    // Stop HTTP server
    server.stop();

    logger.info(L"Service shutdown complete");
}

void RunConsole()
{
    // Console mode for debugging
    std::wcout << L"ScreenControl Service - Console Mode" << std::endl;
    std::wcout << L"Press Ctrl+C to stop" << std::endl;

    // Create console stop event
    g_stopEvent = CreateEventW(nullptr, TRUE, FALSE, nullptr);

    // Set console control handler
    SetConsoleCtrlHandler([](DWORD ctrlType) -> BOOL {
        if (ctrlType == CTRL_C_EVENT || ctrlType == CTRL_BREAK_EVENT)
        {
            std::wcout << L"\nStopping..." << std::endl;
            SetEvent(g_stopEvent);
            return TRUE;
        }
        return FALSE;
    }, TRUE);

    // Run same as service
    RunService();

    CloseHandle(g_stopEvent);
}

bool InstallService()
{
    wchar_t path[MAX_PATH];
    if (!GetModuleFileNameW(nullptr, path, MAX_PATH))
    {
        return false;
    }

    SC_HANDLE scManager = OpenSCManagerW(nullptr, nullptr, SC_MANAGER_CREATE_SERVICE);
    if (!scManager)
    {
        std::wcerr << L"OpenSCManager failed: " << GetLastError() << std::endl;
        return false;
    }

    SC_HANDLE service = CreateServiceW(
        scManager,
        SERVICE_NAME,
        SERVICE_DISPLAY_NAME,
        SERVICE_ALL_ACCESS,
        SERVICE_WIN32_OWN_PROCESS,
        SERVICE_AUTO_START,
        SERVICE_ERROR_NORMAL,
        path,
        nullptr,
        nullptr,
        nullptr,
        nullptr,  // LocalSystem account
        nullptr
    );

    if (!service)
    {
        DWORD error = GetLastError();
        CloseServiceHandle(scManager);
        if (error == ERROR_SERVICE_EXISTS)
        {
            std::wcerr << L"Service already exists." << std::endl;
        }
        else
        {
            std::wcerr << L"CreateService failed: " << error << std::endl;
        }
        return false;
    }

    // Set service description
    SERVICE_DESCRIPTIONW desc = {};
    desc.lpDescription = const_cast<LPWSTR>(SERVICE_DESC_STR);
    ChangeServiceConfig2W(service, SERVICE_CONFIG_DESCRIPTION, &desc);

    CloseServiceHandle(service);
    CloseServiceHandle(scManager);
    return true;
}

bool UninstallService()
{
    SC_HANDLE scManager = OpenSCManagerW(nullptr, nullptr, SC_MANAGER_CONNECT);
    if (!scManager)
    {
        std::wcerr << L"OpenSCManager failed: " << GetLastError() << std::endl;
        return false;
    }

    SC_HANDLE service = OpenServiceW(scManager, SERVICE_NAME, SERVICE_STOP | DELETE);
    if (!service)
    {
        DWORD error = GetLastError();
        CloseServiceHandle(scManager);
        if (error == ERROR_SERVICE_DOES_NOT_EXIST)
        {
            std::wcerr << L"Service does not exist." << std::endl;
        }
        else
        {
            std::wcerr << L"OpenService failed: " << error << std::endl;
        }
        return false;
    }

    // Stop service if running
    SERVICE_STATUS status;
    ControlService(service, SERVICE_CONTROL_STOP, &status);

    // Delete service
    BOOL result = DeleteService(service);

    CloseServiceHandle(service);
    CloseServiceHandle(scManager);

    return result != FALSE;
}
