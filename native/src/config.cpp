#include "mcp_eyes.h"
#include <nlohmann/json.hpp>
#include <fstream>
#include <random>
#include <sstream>
#include <iomanip>
#include <cstdlib>

#ifdef _WIN32
#include <windows.h>
#include <shlobj.h>
#else
#include <unistd.h>
#include <pwd.h>
#include <sys/stat.h>
#endif

namespace mcp_eyes {

using json = nlohmann::json;

namespace {

std::string get_home_dir() {
#ifdef _WIN32
    char path[MAX_PATH];
    if (SUCCEEDED(SHGetFolderPathA(NULL, CSIDL_PROFILE, NULL, 0, path))) {
        return std::string(path);
    }
    return "C:\\";
#else
    const char* home = std::getenv("HOME");
    if (home) return std::string(home);

    struct passwd* pw = getpwuid(getuid());
    if (pw) return std::string(pw->pw_dir);

    return "/tmp";
#endif
}

std::string get_config_dir() {
    std::string home = get_home_dir();
#ifdef _WIN32
    return home + "\\AppData\\Local\\MCPEyes";
#elif __APPLE__
    return home + "/Library/Application Support/MCPEyes";
#else
    return home + "/.config/mcp-eyes";
#endif
}

std::string get_default_config_path() {
    return get_config_dir() + "/config.json";
}

void ensure_dir_exists(const std::string& path) {
#ifdef _WIN32
    CreateDirectoryA(path.c_str(), NULL);
#else
    mkdir(path.c_str(), 0755);
#endif
}

std::string generate_api_key() {
    std::random_device rd;
    std::mt19937 gen(rd());
    std::uniform_int_distribution<> dis(0, 255);

    std::stringstream ss;
    ss << std::hex << std::setfill('0');
    for (int i = 0; i < 32; ++i) {
        ss << std::setw(2) << dis(gen);
    }
    return ss.str();
}

std::string get_hostname() {
    char hostname[256];
#ifdef _WIN32
    DWORD size = sizeof(hostname);
    GetComputerNameA(hostname, &size);
#else
    gethostname(hostname, sizeof(hostname));
#endif
    return std::string(hostname);
}

} // anonymous namespace

// Config JSON serialization
void to_json(json& j, const AgentConfig& c) {
    j = json{
        {"name", c.name},
        {"network_mode", c.network_mode},
        {"port", c.port},
        {"tls_enabled", c.tls_enabled},
        {"api_key", c.api_key},
        {"allowed_ips", c.allowed_ips}
    };
}

void from_json(const json& j, AgentConfig& c) {
    j.at("name").get_to(c.name);
    j.at("network_mode").get_to(c.network_mode);
    j.at("port").get_to(c.port);
    j.at("tls_enabled").get_to(c.tls_enabled);
    j.at("api_key").get_to(c.api_key);
    j.at("allowed_ips").get_to(c.allowed_ips);
}

// Config loading/saving implementation
class ConfigManager {
public:
    static AgentConfig load(const std::string& path) {
        std::string config_path = path.empty() ? get_default_config_path() : path;

        AgentConfig config;

        // Set defaults
        config.name = get_hostname();
        config.network_mode = "localhost";
        config.port = 3456;
        config.tls_enabled = false;
        config.api_key = generate_api_key();

        // Try to load existing config
        std::ifstream file(config_path);
        if (file.is_open()) {
            try {
                json j;
                file >> j;
                config = j.get<AgentConfig>();
            } catch (const std::exception& e) {
                // Use defaults on parse error
            }
        }

        return config;
    }

    static bool save(const AgentConfig& config, const std::string& path) {
        std::string config_path = path.empty() ? get_default_config_path() : path;

        // Ensure directory exists
        ensure_dir_exists(get_config_dir());

        std::ofstream file(config_path);
        if (!file.is_open()) {
            return false;
        }

        json j = config;
        file << j.dump(2);
        return true;
    }
};

} // namespace mcp_eyes
