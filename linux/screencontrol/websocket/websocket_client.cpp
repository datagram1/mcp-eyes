/**
 * WebSocket Client Implementation
 *
 * Uses POSIX sockets with OpenSSL for secure WebSocket connections.
 * Implements RFC 6455 WebSocket protocol basics.
 */

#include "websocket_client.h"
#include "../libs/json.hpp"
#include "../core/logger.h"

#include <iostream>
#include <fstream>
#include <sstream>
#include <cstring>
#include <ctime>
#include <random>
#include <chrono>

#include <sys/socket.h>
#include <sys/types.h>
#include <netinet/in.h>
#include <arpa/inet.h>
#include <netdb.h>
#include <unistd.h>
#include <fcntl.h>

#include <openssl/ssl.h>
#include <openssl/err.h>
#include <openssl/bio.h>
#include <openssl/evp.h>
#include <openssl/buffer.h>

using json = nlohmann::json;

namespace ScreenControl
{

// DebugConfig implementation
bool DebugConfig::load(const std::string& path)
{
    try
    {
        std::ifstream file(path);
        if (!file.is_open()) return false;

        json j;
        file >> j;

        if (j.contains("serverUrl")) serverUrl = j["serverUrl"];
        if (j.contains("endpointUuid")) endpointUuid = j["endpointUuid"];
        if (j.contains("customerId")) customerId = j["customerId"];
        if (j.contains("connectOnStartup")) connectOnStartup = j["connectOnStartup"];

        return true;
    }
    catch (...)
    {
        return false;
    }
}

bool DebugConfig::save(const std::string& path) const
{
    try
    {
        json j;
        j["serverUrl"] = serverUrl;
        j["endpointUuid"] = endpointUuid;
        j["customerId"] = customerId;
        j["connectOnStartup"] = connectOnStartup;

        std::ofstream file(path);
        if (!file.is_open()) return false;

        file << j.dump(2);
        return true;
    }
    catch (...)
    {
        return false;
    }
}

// WebSocket helpers
static std::string base64Encode(const unsigned char* data, size_t len)
{
    BIO* bio = BIO_new(BIO_f_base64());
    BIO* bmem = BIO_new(BIO_s_mem());
    bio = BIO_push(bio, bmem);
    BIO_set_flags(bio, BIO_FLAGS_BASE64_NO_NL);
    BIO_write(bio, data, len);
    BIO_flush(bio);

    BUF_MEM* bptr;
    BIO_get_mem_ptr(bio, &bptr);

    std::string result(bptr->data, bptr->length);
    BIO_free_all(bio);
    return result;
}

static std::string generateWebSocketKey()
{
    unsigned char key[16];
    std::random_device rd;
    std::mt19937 gen(rd());
    std::uniform_int_distribution<> dist(0, 255);

    for (int i = 0; i < 16; i++)
    {
        key[i] = static_cast<unsigned char>(dist(gen));
    }

    return base64Encode(key, 16);
}

// WebSocketClient implementation
WebSocketClient::WebSocketClient()
{
    SSL_library_init();
    SSL_load_error_strings();
    OpenSSL_add_all_algorithms();
}

WebSocketClient::~WebSocketClient()
{
    disconnect();
}

void WebSocketClient::log(const std::string& message)
{
    auto now = std::time(nullptr);
    char timeBuf[32];
    std::strftime(timeBuf, sizeof(timeBuf), "%H:%M:%S", std::localtime(&now));

    std::string fullMsg = "[" + std::string(timeBuf) + "] " + message;

    if (m_logCallback)
    {
        m_logCallback(fullMsg);
    }

    Logger::info(message);
}

bool WebSocketClient::connect(const DebugConfig& config)
{
    if (m_connected) return true;

    log("Connecting to " + config.serverUrl + "...");

    // Parse URL
    std::string host, path;
    int port = 443;
    bool useSSL = true;

    std::string url = config.serverUrl;
    if (url.find("wss://") == 0)
    {
        url = url.substr(6);
        useSSL = true;
        port = 443;
    }
    else if (url.find("ws://") == 0)
    {
        url = url.substr(5);
        useSSL = false;
        port = 80;
    }

    size_t pathPos = url.find('/');
    if (pathPos != std::string::npos)
    {
        host = url.substr(0, pathPos);
        path = url.substr(pathPos);
    }
    else
    {
        host = url;
        path = "/";
    }

    size_t portPos = host.find(':');
    if (portPos != std::string::npos)
    {
        port = std::stoi(host.substr(portPos + 1));
        host = host.substr(0, portPos);
    }

    // Resolve hostname
    struct addrinfo hints = {}, *addrs;
    hints.ai_family = AF_UNSPEC;
    hints.ai_socktype = SOCK_STREAM;

    int err = getaddrinfo(host.c_str(), std::to_string(port).c_str(), &hints, &addrs);
    if (err != 0)
    {
        log("ERROR: Failed to resolve hostname: " + std::string(gai_strerror(err)));
        return false;
    }

    // Create socket
    m_socket = socket(addrs->ai_family, addrs->ai_socktype, addrs->ai_protocol);
    if (m_socket < 0)
    {
        log("ERROR: Failed to create socket");
        freeaddrinfo(addrs);
        return false;
    }

    // Connect
    if (::connect(m_socket, addrs->ai_addr, addrs->ai_addrlen) < 0)
    {
        log("ERROR: Failed to connect");
        close(m_socket);
        m_socket = -1;
        freeaddrinfo(addrs);
        return false;
    }

    freeaddrinfo(addrs);

    // Setup SSL
    if (useSSL)
    {
        m_sslCtx = SSL_CTX_new(TLS_client_method());
        if (!m_sslCtx)
        {
            log("ERROR: Failed to create SSL context");
            close(m_socket);
            m_socket = -1;
            return false;
        }

        m_ssl = SSL_new(static_cast<SSL_CTX*>(m_sslCtx));
        SSL_set_fd(static_cast<SSL*>(m_ssl), m_socket);
        SSL_set_tlsext_host_name(static_cast<SSL*>(m_ssl), host.c_str());

        if (SSL_connect(static_cast<SSL*>(m_ssl)) <= 0)
        {
            log("ERROR: SSL handshake failed");
            SSL_free(static_cast<SSL*>(m_ssl));
            SSL_CTX_free(static_cast<SSL_CTX*>(m_sslCtx));
            close(m_socket);
            m_ssl = nullptr;
            m_sslCtx = nullptr;
            m_socket = -1;
            return false;
        }
    }

    // WebSocket handshake
    std::string wsKey = generateWebSocketKey();
    std::ostringstream request;
    request << "GET " << path << " HTTP/1.1\r\n"
            << "Host: " << host << "\r\n"
            << "Upgrade: websocket\r\n"
            << "Connection: Upgrade\r\n"
            << "Sec-WebSocket-Key: " << wsKey << "\r\n"
            << "Sec-WebSocket-Version: 13\r\n"
            << "\r\n";

    std::string reqStr = request.str();
    int written;
    if (m_ssl)
    {
        written = SSL_write(static_cast<SSL*>(m_ssl), reqStr.c_str(), reqStr.size());
    }
    else
    {
        written = write(m_socket, reqStr.c_str(), reqStr.size());
    }

    if (written <= 0)
    {
        log("ERROR: Failed to send WebSocket handshake");
        disconnect();
        return false;
    }

    // Read response
    char buffer[4096];
    int bytesRead;
    if (m_ssl)
    {
        bytesRead = SSL_read(static_cast<SSL*>(m_ssl), buffer, sizeof(buffer) - 1);
    }
    else
    {
        bytesRead = read(m_socket, buffer, sizeof(buffer) - 1);
    }

    if (bytesRead <= 0)
    {
        log("ERROR: No response to WebSocket handshake");
        disconnect();
        return false;
    }

    buffer[bytesRead] = '\0';
    std::string response(buffer);

    if (response.find("101") == std::string::npos)
    {
        log("ERROR: WebSocket handshake rejected");
        disconnect();
        return false;
    }

    log("WebSocket connected");
    m_connected = true;
    m_running = true;

    if (m_connectionCallback)
    {
        m_connectionCallback(true);
    }

    // Send registration
    sendRegistration(config);

    // Start receive loop
    m_receiveThread = std::thread(&WebSocketClient::receiveLoop, this);

    return true;
}

void WebSocketClient::disconnect()
{
    if (!m_connected && m_socket < 0) return;

    log("Disconnecting...");

    m_running = false;
    m_connected = false;
    stopHeartbeat();

    if (m_receiveThread.joinable())
    {
        m_receiveThread.join();
    }

    if (m_ssl)
    {
        SSL_shutdown(static_cast<SSL*>(m_ssl));
        SSL_free(static_cast<SSL*>(m_ssl));
        m_ssl = nullptr;
    }

    if (m_sslCtx)
    {
        SSL_CTX_free(static_cast<SSL_CTX*>(m_sslCtx));
        m_sslCtx = nullptr;
    }

    if (m_socket >= 0)
    {
        close(m_socket);
        m_socket = -1;
    }

    if (m_connectionCallback)
    {
        m_connectionCallback(false);
    }

    log("Disconnected");
}

void WebSocketClient::sendRegistration(const DebugConfig& config)
{
    json message;
    message["type"] = "register";
    message["machineId"] = getMachineId();
    message["machineName"] = getHostname();
    message["osType"] = "linux";
    message["osVersion"] = getOsVersion();

#if defined(__x86_64__)
    message["arch"] = "x64";
#elif defined(__aarch64__)
    message["arch"] = "arm64";
#else
    message["arch"] = "unknown";
#endif

    message["agentVersion"] = "1.0.0-debug";

    if (!config.endpointUuid.empty())
    {
        message["licenseUuid"] = config.endpointUuid;
    }
    if (!config.customerId.empty())
    {
        message["customerId"] = config.customerId;
    }

    message["fingerprint"] = {
        {"hostname", getHostname()},
        {"cpuModel", getCpuModel()},
        {"macAddresses", json::array({"debug-mode"})}
    };

    log("→ REGISTER: " + getHostname());

    std::string jsonStr = message.dump();

    // Send as WebSocket text frame
    std::vector<uint8_t> frame;
    frame.push_back(0x81); // FIN + text opcode

    size_t len = jsonStr.size();
    if (len <= 125)
    {
        frame.push_back(0x80 | len); // Mask bit + length
    }
    else if (len <= 65535)
    {
        frame.push_back(0x80 | 126);
        frame.push_back((len >> 8) & 0xFF);
        frame.push_back(len & 0xFF);
    }
    else
    {
        frame.push_back(0x80 | 127);
        for (int i = 7; i >= 0; i--)
        {
            frame.push_back((len >> (i * 8)) & 0xFF);
        }
    }

    // Masking key
    uint8_t mask[4];
    std::random_device rd;
    std::mt19937 gen(rd());
    std::uniform_int_distribution<> dist(0, 255);
    for (int i = 0; i < 4; i++)
    {
        mask[i] = dist(gen);
        frame.push_back(mask[i]);
    }

    // Masked payload
    for (size_t i = 0; i < jsonStr.size(); i++)
    {
        frame.push_back(jsonStr[i] ^ mask[i % 4]);
    }

    std::lock_guard<std::mutex> lock(m_sendMutex);
    if (m_ssl)
    {
        SSL_write(static_cast<SSL*>(m_ssl), frame.data(), frame.size());
    }
    else
    {
        write(m_socket, frame.data(), frame.size());
    }
}

void WebSocketClient::sendHeartbeat()
{
    if (!m_connected) return;

    json message;
    message["type"] = "heartbeat";
    message["timestamp"] = std::chrono::duration_cast<std::chrono::milliseconds>(
        std::chrono::system_clock::now().time_since_epoch()
    ).count();
    message["powerState"] = "ACTIVE";
    message["isScreenLocked"] = isScreenLocked();

    std::string jsonStr = message.dump();

    // Send as WebSocket text frame (same as registration)
    std::vector<uint8_t> frame;
    frame.push_back(0x81);

    size_t len = jsonStr.size();
    if (len <= 125)
    {
        frame.push_back(0x80 | len);
    }
    else
    {
        frame.push_back(0x80 | 126);
        frame.push_back((len >> 8) & 0xFF);
        frame.push_back(len & 0xFF);
    }

    uint8_t mask[4];
    std::random_device rd;
    std::mt19937 gen(rd());
    std::uniform_int_distribution<> dist(0, 255);
    for (int i = 0; i < 4; i++)
    {
        mask[i] = dist(gen);
        frame.push_back(mask[i]);
    }

    for (size_t i = 0; i < jsonStr.size(); i++)
    {
        frame.push_back(jsonStr[i] ^ mask[i % 4]);
    }

    std::lock_guard<std::mutex> lock(m_sendMutex);
    if (m_ssl)
    {
        SSL_write(static_cast<SSL*>(m_ssl), frame.data(), frame.size());
    }
    else
    {
        write(m_socket, frame.data(), frame.size());
    }

    log("→ HEARTBEAT");
}

void WebSocketClient::startHeartbeat(int intervalMs)
{
    stopHeartbeat();
    m_heartbeatInterval = intervalMs;

    m_heartbeatThread = std::thread([this]() {
        while (m_running && m_connected)
        {
            std::this_thread::sleep_for(std::chrono::milliseconds(m_heartbeatInterval));
            if (m_running && m_connected)
            {
                sendHeartbeat();
            }
        }
    });
}

void WebSocketClient::stopHeartbeat()
{
    if (m_heartbeatThread.joinable())
    {
        m_heartbeatThread.join();
    }
}

void WebSocketClient::receiveLoop()
{
    std::vector<uint8_t> buffer(8192);

    while (m_running && m_connected)
    {
        int bytesRead;
        if (m_ssl)
        {
            bytesRead = SSL_read(static_cast<SSL*>(m_ssl), buffer.data(), buffer.size());
        }
        else
        {
            bytesRead = read(m_socket, buffer.data(), buffer.size());
        }

        if (bytesRead <= 0)
        {
            if (m_running)
            {
                log("Connection closed by server");
            }
            break;
        }

        // Parse WebSocket frame
        if (bytesRead < 2) continue;

        uint8_t opcode = buffer[0] & 0x0F;
        bool masked = (buffer[1] & 0x80) != 0;
        uint64_t payloadLen = buffer[1] & 0x7F;

        size_t headerLen = 2;
        if (payloadLen == 126)
        {
            if (bytesRead < 4) continue;
            payloadLen = (buffer[2] << 8) | buffer[3];
            headerLen = 4;
        }
        else if (payloadLen == 127)
        {
            if (bytesRead < 10) continue;
            payloadLen = 0;
            for (int i = 0; i < 8; i++)
            {
                payloadLen = (payloadLen << 8) | buffer[2 + i];
            }
            headerLen = 10;
        }

        size_t maskOffset = headerLen;
        if (masked)
        {
            headerLen += 4;
        }

        if (bytesRead < static_cast<int>(headerLen + payloadLen)) continue;

        std::string payload;
        payload.reserve(payloadLen);

        for (size_t i = 0; i < payloadLen; i++)
        {
            uint8_t byte = buffer[headerLen + i];
            if (masked)
            {
                byte ^= buffer[maskOffset + (i % 4)];
            }
            payload.push_back(byte);
        }

        if (opcode == 0x01) // Text frame
        {
            handleMessage(payload);
        }
        else if (opcode == 0x08) // Close frame
        {
            log("Received close frame");
            break;
        }
    }

    m_connected = false;
    if (m_connectionCallback)
    {
        m_connectionCallback(false);
    }
}

void WebSocketClient::handleMessage(const std::string& message)
{
    try
    {
        json j = json::parse(message);

        std::string type = j.value("type", "");

        if (type == "registered")
        {
            handleRegistered(message);
        }
        else if (type == "heartbeat_ack")
        {
            handleHeartbeatAck(message);
        }
        else if (type == "request")
        {
            handleRequest(message);
        }
        else
        {
            log("← Unknown message type: " + type);
        }
    }
    catch (const std::exception& e)
    {
        log("ERROR: Failed to parse message: " + std::string(e.what()));
    }
}

void WebSocketClient::handleRegistered(const std::string& jsonStr)
{
    json j = json::parse(jsonStr);

    m_licenseStatus = j.value("licenseStatus", "unknown");
    m_agentId = j.value("agentId", "");

    log("← REGISTERED: license=" + m_licenseStatus + ", agentId=" + m_agentId);

    if (m_statusCallback)
    {
        m_statusCallback(m_agentId, m_licenseStatus);
    }

    // Start heartbeat
    int interval = 5000;
    if (j.contains("config") && j["config"].contains("heartbeatInterval"))
    {
        interval = j["config"]["heartbeatInterval"];
    }
    startHeartbeat(interval);
}

void WebSocketClient::handleHeartbeatAck(const std::string& jsonStr)
{
    json j = json::parse(jsonStr);
    m_licenseStatus = j.value("licenseStatus", "unknown");

    if (m_statusCallback)
    {
        m_statusCallback(m_agentId, m_licenseStatus);
    }
}

void WebSocketClient::handleRequest(const std::string& jsonStr)
{
    json j = json::parse(jsonStr);

    std::string requestId = j.value("id", "");
    std::string method = j.value("method", "");
    std::string params = j.contains("params") ? j["params"].dump() : "{}";

    log("← REQUEST: " + method);

    if (m_commandCallback)
    {
        m_commandCallback(requestId, method, params);
    }
}

void WebSocketClient::sendResponse(const std::string& requestId, const std::string& result)
{
    json message;
    message["type"] = "response";
    message["id"] = requestId;
    message["result"] = json::parse(result);

    std::string jsonStr = message.dump();

    // Send as WebSocket text frame
    std::vector<uint8_t> frame;
    frame.push_back(0x81);

    size_t len = jsonStr.size();
    if (len <= 125)
    {
        frame.push_back(0x80 | len);
    }
    else
    {
        frame.push_back(0x80 | 126);
        frame.push_back((len >> 8) & 0xFF);
        frame.push_back(len & 0xFF);
    }

    uint8_t mask[4];
    std::random_device rd;
    std::mt19937 gen(rd());
    std::uniform_int_distribution<> dist(0, 255);
    for (int i = 0; i < 4; i++)
    {
        mask[i] = dist(gen);
        frame.push_back(mask[i]);
    }

    for (size_t i = 0; i < jsonStr.size(); i++)
    {
        frame.push_back(jsonStr[i] ^ mask[i % 4]);
    }

    std::lock_guard<std::mutex> lock(m_sendMutex);
    if (m_ssl)
    {
        SSL_write(static_cast<SSL*>(m_ssl), frame.data(), frame.size());
    }
    else
    {
        write(m_socket, frame.data(), frame.size());
    }

    log("→ RESPONSE: " + requestId);
}

// System info helpers
std::string WebSocketClient::getMachineId()
{
    // Try to read machine-id
    std::ifstream file("/etc/machine-id");
    if (file.is_open())
    {
        std::string id;
        std::getline(file, id);
        return id;
    }

    // Fallback to hostname
    return getHostname();
}

std::string WebSocketClient::getCpuModel()
{
    std::ifstream file("/proc/cpuinfo");
    std::string line;
    while (std::getline(file, line))
    {
        if (line.find("model name") != std::string::npos)
        {
            size_t pos = line.find(':');
            if (pos != std::string::npos)
            {
                return line.substr(pos + 2);
            }
        }
    }
    return "Unknown CPU";
}

std::string WebSocketClient::getHostname()
{
    char hostname[256];
    if (gethostname(hostname, sizeof(hostname)) == 0)
    {
        return hostname;
    }
    return "unknown";
}

std::string WebSocketClient::getOsVersion()
{
    // Try to read from os-release
    std::ifstream file("/etc/os-release");
    std::string line;
    while (std::getline(file, line))
    {
        if (line.find("PRETTY_NAME=") == 0)
        {
            std::string name = line.substr(12);
            if (!name.empty() && name[0] == '"')
            {
                name = name.substr(1, name.size() - 2);
            }
            return name;
        }
    }
    return "Linux";
}

bool WebSocketClient::isScreenLocked()
{
    // Check for common screen lock processes
    FILE* fp = popen("pgrep -x 'gnome-screensaver|xscreensaver|i3lock|swaylock' 2>/dev/null", "r");
    if (fp)
    {
        char buf[16];
        bool locked = fgets(buf, sizeof(buf), fp) != nullptr;
        pclose(fp);
        return locked;
    }
    return false;
}

} // namespace ScreenControl
