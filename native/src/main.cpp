/**
 * MCP-Eyes Agent - Main Entry Point
 *
 * Standalone executable for testing without Xcode.
 * In production, use the Xcode-built app bundle for proper permissions.
 */

#include "mcp_eyes.h"
#include "platform.h"
#include <iostream>
#include <csignal>
#include <atomic>
#include <thread>
#include <chrono>

static std::atomic<bool> g_running{true};

void signal_handler(int signal) {
    std::cout << "\nShutting down..." << std::endl;
    g_running = false;
}

int main(int argc, char* argv[]) {
    std::cout << R"(
╔═══════════════════════════════════════════════════════════════╗
║               MCP-Eyes Agent v)" << mcp_eyes::VERSION << R"(                       ║
╚═══════════════════════════════════════════════════════════════╝
)" << std::endl;

    // Set up signal handlers
    std::signal(SIGINT, signal_handler);
    std::signal(SIGTERM, signal_handler);

    // Create agent
    mcp_eyes::Agent agent;

    // Load config
    if (!agent.load_config()) {
        std::cerr << "Warning: Could not load config, using defaults" << std::endl;
    }

    // Check permissions
    auto perms = agent.check_permissions();
    std::cout << "Permissions:" << std::endl;
    std::cout << "  Accessibility:    " << (perms.accessibility ? "✅" : "❌") << std::endl;
    std::cout << "  Screen Recording: " << (perms.screen_recording ? "✅" : "❌") << std::endl;
    std::cout << "  Automation:       " << (perms.automation ? "✅" : "❌") << std::endl;
    std::cout << std::endl;

    if (!perms.accessibility || !perms.screen_recording) {
        std::cout << "⚠️  Missing permissions! Grant them in System Settings → Privacy & Security" << std::endl;
        std::cout << std::endl;
    }

    // Get config
    const auto& config = agent.config();
    std::cout << "Configuration:" << std::endl;
    std::cout << "  Name:         " << config.name << std::endl;
    std::cout << "  Network Mode: " << config.network_mode << std::endl;
    std::cout << "  Port:         " << config.port << std::endl;
    std::cout << "  API Key:      " << config.api_key.substr(0, 8) << "..." << std::endl;
    std::cout << std::endl;

    // Start server
    if (!agent.start()) {
        std::cerr << "Failed to start server!" << std::endl;
        return 1;
    }

    auto status = agent.status();
    std::cout << "🚀 Server running at http://";
    if (config.network_mode == "localhost") {
        std::cout << "127.0.0.1";
    } else {
        std::cout << "0.0.0.0";
    }
    std::cout << ":" << config.port << std::endl;
    std::cout << std::endl;
    std::cout << "Open http://localhost:" << config.port << " in your browser to configure." << std::endl;
    std::cout << "Press Ctrl+C to stop." << std::endl;
    std::cout << std::endl;

    // Wait for shutdown signal
    while (g_running && agent.is_running()) {
        std::this_thread::sleep_for(std::chrono::milliseconds(100));
    }

    agent.stop();
    std::cout << "Server stopped." << std::endl;

    return 0;
}
