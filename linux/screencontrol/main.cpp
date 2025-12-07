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
#include <csignal>
#include <thread>
#include <atomic>
#include <getopt.h>
#include <unistd.h>
#include <sys/stat.h>

#include "server/http_server.h"
#include "core/config.h"
#include "core/logger.h"

#ifdef HAS_GTK
#include <gtk/gtk.h>
#endif

namespace ScreenControl
{

static std::atomic<bool> g_running{true};
static HttpServer* g_server = nullptr;

void signalHandler(int signum)
{
    Logger::info("Received signal " + std::to_string(signum) + ", shutting down...");
    g_running = false;
    if (g_server)
    {
        g_server->stop();
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

    // Wait for shutdown signal
    while (g_running)
    {
        std::this_thread::sleep_for(std::chrono::seconds(1));
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
