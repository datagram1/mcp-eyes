/**
 * ScreenControl Windows Service
 *
 * Main entry point for the Windows service.
 * Handles both service mode and console mode for debugging.
 */

#include <windows.h>
#include <iostream>
#include <string>
#include "service.h"
#include "server/http_server.h"
#include "core/logger.h"
#include "core/config.h"

// Service name
constexpr const wchar_t* SERVICE_NAME = L"ScreenControlService";
constexpr const wchar_t* SERVICE_DISPLAY_NAME = L"ScreenControl Service";
constexpr const wchar_t* SERVICE_DESCRIPTION = L"ScreenControl agent service for AI/LLM computer control";

// Global service status handle
SERVICE_STATUS_HANDLE g_serviceStatusHandle = nullptr;
SERVICE_STATUS g_serviceStatus = {};
HANDLE g_stopEvent = nullptr;

// Forward declarations
void WINAPI ServiceMain(DWORD argc, LPWSTR* argv);
void WINAPI ServiceCtrlHandler(DWORD ctrlCode);
void RunService();
void RunConsole();
bool InstallService();
bool UninstallService();

int wmain(int argc, wchar_t* argv[])
{
    // Initialize logger
    ScreenControl::Logger::getInstance().init();

    // Parse command line arguments
    if (argc > 1)
    {
        std::wstring arg = argv[1];

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
    // Load configuration
    auto& config = ScreenControl::Config::getInstance();
    config.load();

    // Start HTTP server
    ScreenControl::HttpServer server;
    if (!server.start(config.getHttpPort()))
    {
        ScreenControl::Logger::getInstance().error(L"Failed to start HTTP server");
        return;
    }

    ScreenControl::Logger::getInstance().info(L"HTTP server listening on port " + std::to_wstring(config.getHttpPort()));

    // TODO: Start WebSocket client to control server
    // TODO: Start named pipe server for tray app communication

    // Wait for stop signal
    WaitForSingleObject(g_stopEvent, INFINITE);

    // Stop HTTP server
    server.stop();
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
    desc.lpDescription = const_cast<LPWSTR>(SERVICE_DESCRIPTION);
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
