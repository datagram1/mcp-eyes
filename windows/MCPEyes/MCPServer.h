#pragma once

#include "../../native/include/mcp_eyes.h"
#include "../../native/include/platform.h"
#include <string>
#include <memory>
#include <functional>

namespace mcp_eyes {

class MCPServerDelegate {
public:
    virtual ~MCPServerDelegate() = default;
    virtual void serverDidStart(unsigned int port) = 0;
    virtual void serverDidStop() = 0;
    virtual void serverDidReceiveRequest(const std::string& path) = 0;
};

class MCPServer {
public:
    MCPServer(unsigned int port, const std::string& apiKey);
    ~MCPServer();

    void setDelegate(MCPServerDelegate* delegate) { delegate_ = delegate; }
    
    bool start();
    void stop();
    bool isRunning() const { return running_; }
    unsigned int port() const { return port_; }
    std::string apiKey() const { return apiKey_; }

    // Core functionality (delegated to WindowsPlatform)
    void setPlatform(Platform* platform) { platform_ = platform; }
    
    std::vector<AppInfo> listApplications();
    bool focusApplication(const std::string& identifier);
    bool launchApplication(const std::string& identifier);
    Screenshot takeScreenshot();
    Screenshot takeScreenshotOfWindow(const std::string& identifier);
    bool clickAtX(float x, float y, bool rightButton = false);
    bool typeText(const std::string& text);
    bool pressKey(const std::string& key);
    bool moveMouse(float x, float y);
    bool scroll(int deltaX, int deltaY, float x = -1, float y = -1);
    bool drag(float startX, float startY, float endX, float endY);
    std::vector<UIElement> getClickableElements();
    Permissions checkPermissions();
    AppInfo getCurrentApp();

private:
    unsigned int port_;
    std::string apiKey_;
    bool running_;
    MCPServerDelegate* delegate_;
    Platform* platform_;
    
    // HTTP server thread
    std::thread serverThread_;
    void serverLoop();
    
    // Request handling
    std::string handleRequest(const std::string& method, const std::string& path, const std::string& body);
    bool verifyApiKey(const std::string& authHeader);
    std::string sendJSONResponse(const std::string& data);
    std::string sendErrorResponse(int status, const std::string& message);
};

} // namespace mcp_eyes

