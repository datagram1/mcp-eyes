/**
 * TestServer Implementation
 *
 * Simple HTTP server using POSIX sockets for automated testing.
 */

#include "test_server.h"
#include "core/logger.h"
#include "libs/json.hpp"

#include <iostream>
#include <sstream>
#include <cstring>
#include <ctime>
#include <chrono>

#include <sys/socket.h>
#include <sys/types.h>
#include <netinet/in.h>
#include <arpa/inet.h>
#include <unistd.h>
#include <fcntl.h>
#include <sys/stat.h>
#include <sys/utsname.h>

using json = nlohmann::json;

namespace ScreenControl
{

static std::chrono::steady_clock::time_point g_startTime;

TestServer::TestServer()
{
    g_startTime = std::chrono::steady_clock::now();
}

TestServer::~TestServer()
{
    stop();
}

bool TestServer::start(uint16_t port)
{
    if (m_running) return true;

    // Try primary port, then fallback
    uint16_t ports[] = { port, static_cast<uint16_t>(port + 1) };

    for (auto p : ports)
    {
        m_serverSocket = socket(AF_INET, SOCK_STREAM, 0);
        if (m_serverSocket < 0)
        {
            Logger::error("TestServer: Failed to create socket");
            continue;
        }

        // Allow address reuse
        int optval = 1;
        setsockopt(m_serverSocket, SOL_SOCKET, SO_REUSEADDR, &optval, sizeof(optval));

        // Bind to localhost ONLY
        struct sockaddr_in addr;
        memset(&addr, 0, sizeof(addr));
        addr.sin_family = AF_INET;
        addr.sin_port = htons(p);
        addr.sin_addr.s_addr = inet_addr("127.0.0.1");

        if (bind(m_serverSocket, reinterpret_cast<struct sockaddr*>(&addr), sizeof(addr)) < 0)
        {
            Logger::error("TestServer: Failed to bind to port " + std::to_string(p));
            close(m_serverSocket);
            m_serverSocket = -1;
            continue;
        }

        if (listen(m_serverSocket, 5) < 0)
        {
            Logger::error("TestServer: Failed to listen");
            close(m_serverSocket);
            m_serverSocket = -1;
            continue;
        }

        m_port = p;
        m_running = true;

        Logger::info("TestServer: Started on localhost:" + std::to_string(m_port) + " (DEBUG BUILD ONLY)");

        m_listenThread = std::thread(&TestServer::listenLoop, this);
        return true;
    }

    Logger::error("TestServer: Failed to bind to any port");
    return false;
}

void TestServer::stop()
{
    if (!m_running) return;

    Logger::info("TestServer: Stopping...");

    m_running = false;

    if (m_serverSocket >= 0)
    {
        shutdown(m_serverSocket, SHUT_RDWR);
        close(m_serverSocket);
        m_serverSocket = -1;
    }

    if (m_listenThread.joinable())
    {
        m_listenThread.join();
    }

    m_port = 0;
}

void TestServer::listenLoop()
{
    while (m_running)
    {
        struct sockaddr_in clientAddr;
        socklen_t clientLen = sizeof(clientAddr);

        int clientSocket = accept(m_serverSocket, reinterpret_cast<struct sockaddr*>(&clientAddr), &clientLen);

        if (clientSocket < 0)
        {
            if (m_running)
            {
                Logger::error("TestServer: Accept failed");
            }
            continue;
        }

        // Handle in same thread (simple approach)
        handleClient(clientSocket);
    }
}

void TestServer::handleClient(int clientSocket)
{
    char buffer[4096];
    ssize_t bytesRead = recv(clientSocket, buffer, sizeof(buffer) - 1, 0);

    if (bytesRead <= 0)
    {
        close(clientSocket);
        return;
    }

    buffer[bytesRead] = '\0';
    std::string request(buffer);

    std::string responseBody = handleRequest(request);

    std::ostringstream httpResponse;
    httpResponse << "HTTP/1.1 200 OK\r\n"
                 << "Content-Type: application/json\r\n"
                 << "Access-Control-Allow-Origin: *\r\n"
                 << "Connection: close\r\n"
                 << "Content-Length: " << responseBody.size() << "\r\n"
                 << "\r\n"
                 << responseBody;

    std::string response = httpResponse.str();
    send(clientSocket, response.c_str(), response.size(), 0);

    close(clientSocket);
}

std::string TestServer::handleRequest(const std::string& httpRequest)
{
    // Find body
    size_t bodyPos = httpRequest.find("\r\n\r\n");
    if (bodyPos == std::string::npos)
    {
        // Check for GET /ping
        if (httpRequest.find("GET /ping") == 0)
        {
            return handleMethod("ping", "{}");
        }
        return R"({"error":"Invalid request"})";
    }

    // Handle OPTIONS (CORS preflight)
    if (httpRequest.find("OPTIONS") == 0)
    {
        return "{}";
    }

    std::string body = httpRequest.substr(bodyPos + 4);
    if (body.empty())
    {
        return R"({"error":"Empty body"})";
    }

    try
    {
        json j = json::parse(body);

        if (!j.contains("method"))
        {
            return R"({"error":"Missing method"})";
        }

        std::string method = j["method"];
        std::string params = j.contains("params") ? j["params"].dump() : "{}";

        return handleMethod(method, params);
    }
    catch (const std::exception& e)
    {
        return R"({"error":"Invalid JSON: )" + std::string(e.what()) + R"("})";
    }
}

std::string TestServer::handleMethod(const std::string& method, const std::string& params)
{
    if (method == "ping") return handlePing();
    if (method == "getState") return handleGetState();
    if (method == "getFields") return handleGetFields();
    if (method == "setField") return handleSetField(params);
    if (method == "clickButton") return handleClickButton(params);
    if (method == "getLogs") return handleGetLogs(params);
    if (method == "getVersion") return handleGetVersion();
    if (method == "quit") return handleQuit();
    if (method == "restart") return handleRestart();

    return R"({"error":"Unknown method: )" + method + R"("})";
}

std::string TestServer::handlePing()
{
    json result;
    result["pong"] = true;
    result["version"] = VERSION;
    result["debug"] = true;
    result["port"] = m_port;
    return result.dump();
}

std::string TestServer::handleGetState()
{
    json result;

    if (m_getStatusCallback)
    {
        auto [connected, status] = m_getStatusCallback();
        result["connected"] = connected;
        result["connectionStatus"] = status;
    }
    else
    {
        result["connected"] = false;
        result["connectionStatus"] = "Unknown";
    }

    if (m_getFieldCallback)
    {
        result["serverUrl"] = m_getFieldCallback("serverUrl");
        result["endpointUuid"] = m_getFieldCallback("endpointUuid");
        result["customerId"] = m_getFieldCallback("customerId");
    }

    return result.dump();
}

std::string TestServer::handleGetFields()
{
    json result;

    if (m_getFieldCallback)
    {
        result["serverUrl"] = m_getFieldCallback("serverUrl");
        result["endpointUuid"] = m_getFieldCallback("endpointUuid");
        result["customerId"] = m_getFieldCallback("customerId");
        result["connectOnStartup"] = m_getFieldCallback("connectOnStartup") == "true";
    }

    return result.dump();
}

std::string TestServer::handleSetField(const std::string& params)
{
    try
    {
        json j = json::parse(params);

        std::string field = j.value("field", "");
        std::string value = j.value("value", "");

        if (field.empty())
        {
            return R"({"error":"Missing field"})";
        }

        if (m_setFieldCallback && m_setFieldCallback(field, value))
        {
            json result;
            result["success"] = true;
            result["field"] = field;
            result["value"] = value;
            return result.dump();
        }

        return R"({"error":"Unknown field: )" + field + R"("})";
    }
    catch (...)
    {
        return R"({"error":"Invalid params"})";
    }
}

std::string TestServer::handleClickButton(const std::string& params)
{
    try
    {
        json j = json::parse(params);
        std::string button = j.value("button", "");

        if (button.empty())
        {
            return R"({"error":"Missing button parameter"})";
        }

        if (m_clickButtonCallback && m_clickButtonCallback(button))
        {
            json result;
            result["success"] = true;
            result["action"] = button;
            return result.dump();
        }

        return R"({"error":"Unknown or disabled button: )" + button + R"("})";
    }
    catch (...)
    {
        return R"({"error":"Invalid params"})";
    }
}

std::string TestServer::handleGetLogs(const std::string& params)
{
    int limit = 50;
    try
    {
        json j = json::parse(params);
        limit = j.value("limit", 50);
    }
    catch (...) {}

    json result;
    result["logs"] = json::array();

    if (m_getLogsCallback)
    {
        auto logs = m_getLogsCallback(limit);
        result["logs"] = logs;
        result["total"] = logs.size();
        result["returned"] = logs.size();
    }
    else
    {
        result["total"] = 0;
        result["returned"] = 0;
    }

    return result.dump();
}

std::string TestServer::handleGetVersion()
{
    json result;
    result["version"] = VERSION;
    result["build"] = "1";

    // Get build date from executable
    struct stat attr;
    if (stat("/proc/self/exe", &attr) == 0)
    {
        char dateBuf[32];
        strftime(dateBuf, sizeof(dateBuf), "%Y-%m-%d", localtime(&attr.st_mtime));
        result["buildDate"] = dateBuf;
    }
    else
    {
        result["buildDate"] = "unknown";
    }

    result["gitCommit"] = "unknown";
    result["platform"] = "linux";

#if defined(__x86_64__)
    result["arch"] = "x64";
#elif defined(__aarch64__)
    result["arch"] = "arm64";
#else
    result["arch"] = "unknown";
#endif

    auto now = std::chrono::steady_clock::now();
    auto uptime = std::chrono::duration_cast<std::chrono::seconds>(now - g_startTime).count();
    result["uptime"] = uptime;

    return result.dump();
}

std::string TestServer::handleQuit()
{
    Logger::info("TestServer: Quit requested via test server");

    if (m_quitCallback)
    {
        m_quitCallback();
    }

    json result;
    result["success"] = true;
    result["action"] = "quit";
    return result.dump();
}

std::string TestServer::handleRestart()
{
    Logger::info("TestServer: Restart requested via test server");

    // Get path to current executable
    char exePath[1024];
    ssize_t len = readlink("/proc/self/exe", exePath, sizeof(exePath) - 1);
    if (len > 0)
    {
        exePath[len] = '\0';

        // Fork and exec
        pid_t pid = fork();
        if (pid == 0)
        {
            // Child - wait a bit then exec
            usleep(500000);
            execl(exePath, exePath, nullptr);
            exit(1);
        }
    }

    // Quit this instance
    if (m_quitCallback)
    {
        m_quitCallback();
    }

    json result;
    result["success"] = true;
    result["action"] = "restart";
    return result.dump();
}

} // namespace ScreenControl
