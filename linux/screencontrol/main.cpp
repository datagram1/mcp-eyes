/**
 * ScreenControl Linux Agent
 *
 * Native C++ agent for Linux with dual-mode support:
 * - GUI mode: GTK system tray + X11/Wayland
 * - Service mode: Headless systemd service
 *
 * Matches API endpoints with macOS and Windows agents.
 */

#include <iostream>
#include <string>
#include <fstream>
#include <csignal>
#include <thread>
#include <atomic>
#include <getopt.h>
#include <unistd.h>
#include <sys/stat.h>

#include "server/http_server.h"
#include "core/config.h"
#include "core/logger.h"
#include "websocket/websocket_client.h"
#include "tools/system_tools.h"
#include "tools/filesystem_tools.h"
#include "tools/shell_tools.h"
#include "libs/json.hpp"

#ifdef HAS_GTK
#include <gtk/gtk.h>
#endif

namespace ScreenControl
{

using json = nlohmann::json;

static std::atomic<bool> g_running{true};
static HttpServer* g_server = nullptr;
static WebSocketClient* g_wsClient = nullptr;

// Get list of available tools in MCP format
json getAvailableTools()
{
    json tools = json::array();

    // System tools
    tools.push_back({
        {"name", "system_info"},
        {"description", "Get system information (OS, CPU, memory, hostname, uptime)"},
        {"inputSchema", {
            {"type", "object"},
            {"properties", json::object()}
        }}
    });

    tools.push_back({
        {"name", "wait"},
        {"description", "Wait for specified milliseconds"},
        {"inputSchema", {
            {"type", "object"},
            {"properties", {
                {"milliseconds", {{"type", "number"}, {"description", "Time to wait in milliseconds"}}}
            }},
            {"required", json::array({"milliseconds"})}
        }}
    });

    // Clipboard tools
    tools.push_back({
        {"name", "clipboard_read"},
        {"description", "Read content from clipboard"},
        {"inputSchema", {
            {"type", "object"},
            {"properties", json::object()}
        }}
    });

    tools.push_back({
        {"name", "clipboard_write"},
        {"description", "Write content to clipboard"},
        {"inputSchema", {
            {"type", "object"},
            {"properties", {
                {"text", {{"type", "string"}, {"description", "Text to write to clipboard"}}}
            }},
            {"required", json::array({"text"})}
        }}
    });

    // Filesystem tools
    tools.push_back({
        {"name", "fs_list"},
        {"description", "List directory contents"},
        {"inputSchema", {
            {"type", "object"},
            {"properties", {
                {"path", {{"type", "string"}, {"description", "Directory path to list"}}},
                {"maxDepth", {{"type", "number"}, {"description", "Maximum depth to recurse"}}}
            }},
            {"required", json::array({"path"})}
        }}
    });

    tools.push_back({
        {"name", "fs_read"},
        {"description", "Read file contents"},
        {"inputSchema", {
            {"type", "object"},
            {"properties", {
                {"path", {{"type", "string"}, {"description", "Path to file to read"}}}
            }},
            {"required", json::array({"path"})}
        }}
    });

    tools.push_back({
        {"name", "fs_write"},
        {"description", "Write content to file"},
        {"inputSchema", {
            {"type", "object"},
            {"properties", {
                {"path", {{"type", "string"}, {"description", "Path to file to write"}}},
                {"content", {{"type", "string"}, {"description", "Content to write"}}},
                {"create_directories", {{"type", "boolean"}, {"description", "Create parent directories if needed"}}}
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
                {"path", {{"type", "string"}, {"description", "Base path to search from"}}},
                {"pattern", {{"type", "string"}, {"description", "Glob pattern to match"}}}
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
                {"path", {{"type", "string"}, {"description", "Path to search in"}}},
                {"pattern", {{"type", "string"}, {"description", "Regex pattern to search for"}}}
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
                {"path", {{"type", "string"}, {"description", "Path to delete"}}},
                {"recursive", {{"type", "boolean"}, {"description", "Recursively delete directories"}}}
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
                {"source", {{"type", "string"}, {"description", "Source path"}}},
                {"destination", {{"type", "string"}, {"description", "Destination path"}}}
            }},
            {"required", json::array({"source", "destination"})}
        }}
    });

    tools.push_back({
        {"name", "fs_patch"},
        {"description", "Apply patches to a file"},
        {"inputSchema", {
            {"type", "object"},
            {"properties", {
                {"path", {{"type", "string"}, {"description", "File path to patch"}}},
                {"operations", {{"type", "array"}, {"description", "Array of patch operations"}}},
                {"dry_run", {{"type", "boolean"}, {"description", "Preview changes without applying"}}}
            }},
            {"required", json::array({"path", "operations"})}
        }}
    });

    tools.push_back({
        {"name", "fs_read_range"},
        {"description", "Read specific lines from a file"},
        {"inputSchema", {
            {"type", "object"},
            {"properties", {
                {"path", {{"type", "string"}, {"description", "File path to read"}}},
                {"start_line", {{"type", "number"}, {"description", "Starting line number"}}},
                {"end_line", {{"type", "number"}, {"description", "Ending line number"}}}
            }},
            {"required", json::array({"path"})}
        }}
    });

    // Shell tools
    tools.push_back({
        {"name", "shell_exec"},
        {"description", "Execute a shell command"},
        {"inputSchema", {
            {"type", "object"},
            {"properties", {
                {"command", {{"type", "string"}, {"description", "Command to execute"}}},
                {"cwd", {{"type", "string"}, {"description", "Working directory"}}},
                {"timeout_seconds", {{"type", "number"}, {"description", "Timeout in seconds"}}}
            }},
            {"required", json::array({"command"})}
        }}
    });

    return tools;
}

// Handle tool execution from control server
void handleToolCommand(const std::string& requestId, const std::string& method, const std::string& paramsJson)
{
    Logger::info("[Tool] Executing: " + method);

    json result;
    try
    {
        // Handle MCP protocol methods first
        if (method == "tools/list")
        {
            json tools = getAvailableTools();
            Logger::info("[Tool] Advertising " + std::to_string(tools.size()) + " tools");
            result = {{"tools", tools}};

            if (g_wsClient)
            {
                g_wsClient->sendResponse(requestId, result.dump());
            }
            return;
        }
        else if (method == "prompts/list")
        {
            result = {{"prompts", json::array()}};
            if (g_wsClient)
            {
                g_wsClient->sendResponse(requestId, result.dump());
            }
            return;
        }
        else if (method == "resources/list")
        {
            result = {{"resources", json::array()}};
            if (g_wsClient)
            {
                g_wsClient->sendResponse(requestId, result.dump());
            }
            return;
        }

        // Handle tools/call
        json params = json::parse(paramsJson);
        std::string toolName = params.value("name", "");
        json args = params.value("arguments", json::object());

        // Route to appropriate tool
        if (toolName == "system_info")
        {
            result = SystemTools::getSystemInfo();
        }
        else if (toolName == "clipboard_read")
        {
            result = SystemTools::clipboardRead();
        }
        else if (toolName == "clipboard_write")
        {
            std::string text = args.value("text", "");
            result = SystemTools::clipboardWrite(text);
        }
        else if (toolName == "wait")
        {
            int ms = args.value("milliseconds", 1000);
            result = SystemTools::wait(ms);
        }
        else if (toolName == "fs_list" || toolName == "file_list")
        {
            std::string path = args.value("path", ".");
            int maxDepth = args.value("maxDepth", 1);
            result = FilesystemTools::list(path, false, maxDepth);
        }
        else if (toolName == "fs_read" || toolName == "file_read")
        {
            std::string path = args.value("path", "");
            size_t maxBytes = args.value("max_bytes", 1024 * 1024);  // Default 1MB
            result = FilesystemTools::read(path, maxBytes);
        }
        else if (toolName == "fs_write" || toolName == "file_write")
        {
            std::string path = args.value("path", "");
            std::string content = args.value("content", "");
            bool createDirs = args.value("create_directories", false);
            result = FilesystemTools::write(path, content, "w", createDirs);
        }
        else if (toolName == "shell_exec")
        {
            std::string command = args.value("command", "");
            std::string cwd = args.value("cwd", "");
            int timeout = args.value("timeout_seconds", 30);
            result = ShellTools::exec(command, cwd, timeout);
        }
        else if (toolName == "fs_search")
        {
            std::string path = args.value("path", ".");
            std::string pattern = args.value("pattern", "*");
            result = FilesystemTools::search(path, pattern, 100);
        }
        else if (toolName == "fs_grep")
        {
            std::string path = args.value("path", ".");
            std::string pattern = args.value("pattern", "");
            std::string glob = args.value("glob", "*");
            result = FilesystemTools::grep(path, pattern, glob, 100);
        }
        else if (toolName == "fs_delete")
        {
            std::string path = args.value("path", "");
            bool recursive = args.value("recursive", false);
            result = FilesystemTools::remove(path, recursive);
        }
        else if (toolName == "fs_move")
        {
            std::string source = args.value("source", "");
            std::string destination = args.value("destination", "");
            result = FilesystemTools::move(source, destination);
        }
        else if (toolName == "fs_patch")
        {
            std::string path = args.value("path", "");
            json operations = args.value("operations", json::array());
            bool dryRun = args.value("dry_run", false);
            result = FilesystemTools::patch(path, operations, dryRun);
        }
        else if (toolName == "fs_read_range")
        {
            std::string path = args.value("path", "");
            int startLine = args.value("start_line", 1);
            int endLine = args.value("end_line", -1);
            result = FilesystemTools::readRange(path, startLine, endLine);
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

    Logger::info("[Tool] Result: " + result.dump().substr(0, 100) + "...");

    // Send response back through WebSocket
    if (g_wsClient)
    {
        g_wsClient->sendResponse(requestId, result.dump());
    }
}

void signalHandler(int signum)
{
    Logger::info("Received signal " + std::to_string(signum) + ", shutting down...");
    g_running = false;
    if (g_server)
    {
        g_server->stop();
    }
    if (g_wsClient)
    {
        g_wsClient->disconnect();
    }
}

void printUsage(const char* programName)
{
    std::cout << "ScreenControl Linux Agent v1.0.0\n\n"
              << "Usage: " << programName << " [OPTIONS]\n\n"
              << "Options:\n"
              << "  -d, --daemon      Run as background daemon\n"
              << "  -p, --port PORT   HTTP server port (default: 3456)\n"
              << "  -c, --config FILE Configuration file path\n"
              << "  -l, --log FILE    Log file path\n"
              << "  -v, --verbose     Verbose logging\n"
              << "  -h, --help        Show this help message\n"
              << "  --version         Show version information\n"
              << "\n"
              << "Service commands:\n"
              << "  --install         Install systemd service\n"
              << "  --uninstall       Remove systemd service\n"
              << "\n";
}

void daemonize()
{
    pid_t pid = fork();

    if (pid < 0)
    {
        Logger::error("Failed to fork daemon process");
        exit(EXIT_FAILURE);
    }

    if (pid > 0)
    {
        // Parent exits
        exit(EXIT_SUCCESS);
    }

    // Child becomes session leader
    if (setsid() < 0)
    {
        Logger::error("Failed to create new session");
        exit(EXIT_FAILURE);
    }

    // Fork again to prevent terminal acquisition
    pid = fork();
    if (pid < 0)
    {
        exit(EXIT_FAILURE);
    }
    if (pid > 0)
    {
        exit(EXIT_SUCCESS);
    }

    // Set file permissions
    umask(0);

    // Change to root directory
    chdir("/");

    // Close standard file descriptors
    close(STDIN_FILENO);
    close(STDOUT_FILENO);
    close(STDERR_FILENO);

    Logger::info("Daemonized successfully, PID: " + std::to_string(getpid()));
}

bool installService()
{
    const char* serviceContent = R"([Unit]
Description=ScreenControl Agent
After=network.target

[Service]
Type=simple
ExecStart=/usr/local/bin/screencontrol --daemon
Restart=always
RestartSec=5
User=root

[Install]
WantedBy=multi-user.target
)";

    std::ofstream file("/etc/systemd/system/screencontrol.service");
    if (!file)
    {
        std::cerr << "Error: Cannot write service file. Run as root.\n";
        return false;
    }

    file << serviceContent;
    file.close();

    system("systemctl daemon-reload");
    system("systemctl enable screencontrol");

    std::cout << "Service installed. Start with: sudo systemctl start screencontrol\n";
    return true;
}

bool uninstallService()
{
    system("systemctl stop screencontrol 2>/dev/null");
    system("systemctl disable screencontrol 2>/dev/null");

    if (unlink("/etc/systemd/system/screencontrol.service") != 0)
    {
        std::cerr << "Warning: Could not remove service file\n";
    }

    system("systemctl daemon-reload");

    std::cout << "Service uninstalled.\n";
    return true;
}

#ifdef HAS_GTK
// GTK tray icon callbacks
GtkStatusIcon* g_trayIcon = nullptr;
GtkWidget* g_menu = nullptr;

void onTrayActivate(GtkStatusIcon* icon, gpointer data)
{
    // Show menu on click
    gtk_menu_popup_at_pointer(GTK_MENU(g_menu), nullptr);
}

void onQuit(GtkMenuItem* item, gpointer data)
{
    g_running = false;
    if (g_server)
    {
        g_server->stop();
    }
    gtk_main_quit();
}

void onSettings(GtkMenuItem* item, gpointer data)
{
    // Open settings dialog (placeholder)
    GtkWidget* dialog = gtk_message_dialog_new(
        nullptr,
        GTK_DIALOG_MODAL,
        GTK_MESSAGE_INFO,
        GTK_BUTTONS_OK,
        "ScreenControl Settings\n\nPort: %d\nStatus: Running",
        Config::getInstance().getPort()
    );
    gtk_dialog_run(GTK_DIALOG(dialog));
    gtk_widget_destroy(dialog);
}

void setupTrayIcon()
{
    g_trayIcon = gtk_status_icon_new_from_icon_name("computer");
    gtk_status_icon_set_tooltip_text(g_trayIcon, "ScreenControl - Running");
    gtk_status_icon_set_visible(g_trayIcon, TRUE);

    // Create context menu
    g_menu = gtk_menu_new();

    GtkWidget* statusItem = gtk_menu_item_new_with_label("Status: Running");
    gtk_widget_set_sensitive(statusItem, FALSE);
    gtk_menu_shell_append(GTK_MENU_SHELL(g_menu), statusItem);

    gtk_menu_shell_append(GTK_MENU_SHELL(g_menu), gtk_separator_menu_item_new());

    GtkWidget* settingsItem = gtk_menu_item_new_with_label("Settings...");
    g_signal_connect(settingsItem, "activate", G_CALLBACK(onSettings), nullptr);
    gtk_menu_shell_append(GTK_MENU_SHELL(g_menu), settingsItem);

    gtk_menu_shell_append(GTK_MENU_SHELL(g_menu), gtk_separator_menu_item_new());

    GtkWidget* quitItem = gtk_menu_item_new_with_label("Quit");
    g_signal_connect(quitItem, "activate", G_CALLBACK(onQuit), nullptr);
    gtk_menu_shell_append(GTK_MENU_SHELL(g_menu), quitItem);

    gtk_widget_show_all(g_menu);

    g_signal_connect(g_trayIcon, "activate", G_CALLBACK(onTrayActivate), nullptr);
}

int runGtkMode(int port)
{
    gtk_init(nullptr, nullptr);

    setupTrayIcon();

    // Start HTTP server in background thread
    g_server = new HttpServer(port);
    std::thread serverThread([&]() {
        g_server->start();
    });

    Logger::info("GTK mode started, HTTP server on port " + std::to_string(port));

    // Run GTK main loop
    gtk_main();

    // Cleanup
    g_server->stop();
    serverThread.join();
    delete g_server;

    return 0;
}
#endif

int runHeadlessMode(int port, bool daemonMode)
{
    if (daemonMode)
    {
        daemonize();
    }

    // Setup signal handlers
    signal(SIGINT, signalHandler);
    signal(SIGTERM, signalHandler);
    signal(SIGHUP, signalHandler);

    Logger::info("Starting ScreenControl in headless mode on port " + std::to_string(port));

    g_server = new HttpServer(port);

    std::thread serverThread([&]() {
        g_server->start();
    });

    // Connect to control server if configured
    DebugConfig wsConfig;
    std::string configPath = "/etc/screencontrol/debug-config.json";
    if (wsConfig.load(configPath) && !wsConfig.serverUrl.empty())
    {
        Logger::info("Control server configured: " + wsConfig.serverUrl);
        g_wsClient = new WebSocketClient();

        g_wsClient->setLogCallback([](const std::string& msg) {
            Logger::info("[WS] " + msg);
        });

        g_wsClient->setConnectionCallback([](bool connected) {
            if (connected)
            {
                Logger::info("[WS] Connected to control server");
            }
            else
            {
                Logger::warn("[WS] Disconnected from control server");
            }
        });

        g_wsClient->setStatusCallback([](const std::string& agentId, const std::string& status) {
            Logger::info("[WS] Agent registered: " + agentId + ", status: " + status);
        });

        g_wsClient->setCommandCallback([](const std::string& requestId, const std::string& method, const std::string& params) {
            Logger::info("[WS] Command received: " + method);
            handleToolCommand(requestId, method, params);
        });

        // Connect in background thread with retry
        std::thread wsThread([&wsConfig]() {
            while (g_running)
            {
                if (g_wsClient && !g_wsClient->isConnected())
                {
                    Logger::info("[WS] Attempting to connect to control server...");
                    if (g_wsClient->connect(wsConfig))
                    {
                        Logger::info("[WS] Connected successfully");
                    }
                    else
                    {
                        Logger::warn("[WS] Connection failed, will retry in 10 seconds");
                    }
                }
                // Check connection every 10 seconds
                for (int i = 0; i < 10 && g_running; i++)
                {
                    std::this_thread::sleep_for(std::chrono::seconds(1));
                }
            }
        });
        wsThread.detach();
    }
    else
    {
        Logger::info("No control server configured. Running in local-only mode.");
        Logger::info("To connect to control server, create /etc/screencontrol/debug-config.json");
    }

    // Wait for shutdown signal
    while (g_running)
    {
        std::this_thread::sleep_for(std::chrono::seconds(1));
    }

    if (g_wsClient)
    {
        g_wsClient->disconnect();
        delete g_wsClient;
        g_wsClient = nullptr;
    }

    g_server->stop();
    serverThread.join();
    delete g_server;

    Logger::info("ScreenControl shutdown complete");
    return 0;
}

} // namespace ScreenControl

int main(int argc, char* argv[])
{
    using namespace ScreenControl;

    int port = 3456;
    bool daemonMode = false;
    bool verbose = false;
    std::string configFile;
    std::string logFile;

    static struct option longOptions[] = {
        {"daemon",    no_argument,       nullptr, 'd'},
        {"port",      required_argument, nullptr, 'p'},
        {"config",    required_argument, nullptr, 'c'},
        {"log",       required_argument, nullptr, 'l'},
        {"verbose",   no_argument,       nullptr, 'v'},
        {"help",      no_argument,       nullptr, 'h'},
        {"version",   no_argument,       nullptr, 'V'},
        {"install",   no_argument,       nullptr, 'I'},
        {"uninstall", no_argument,       nullptr, 'U'},
        {nullptr,     0,                 nullptr, 0}
    };

    int opt;
    while ((opt = getopt_long(argc, argv, "dp:c:l:vh", longOptions, nullptr)) != -1)
    {
        switch (opt)
        {
            case 'd':
                daemonMode = true;
                break;
            case 'p':
                port = std::stoi(optarg);
                break;
            case 'c':
                configFile = optarg;
                break;
            case 'l':
                logFile = optarg;
                break;
            case 'v':
                verbose = true;
                break;
            case 'h':
                printUsage(argv[0]);
                return 0;
            case 'V':
                std::cout << "ScreenControl v1.0.0\n";
                return 0;
            case 'I':
                return installService() ? 0 : 1;
            case 'U':
                return uninstallService() ? 0 : 1;
            default:
                printUsage(argv[0]);
                return 1;
        }
    }

    // Initialize logger
    Logger::init(logFile.empty() ? "/var/log/screencontrol.log" : logFile, verbose);

    // Load configuration
    if (!configFile.empty())
    {
        Config::getInstance().load(configFile);
    }
    else
    {
        Config::getInstance().load("/etc/screencontrol/config.json");
    }

    // Override port from config if not specified on command line
    if (port == 3456)
    {
        port = Config::getInstance().getPort();
    }

#ifdef HAS_GTK
    // Check if we have a display
    const char* display = getenv("DISPLAY");
    const char* wayland = getenv("WAYLAND_DISPLAY");

    if (!daemonMode && (display || wayland))
    {
        return runGtkMode(port);
    }
#endif

    return runHeadlessMode(port, daemonMode);
}
