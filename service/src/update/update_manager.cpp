/**
 * Update Manager Implementation
 *
 * Cross-platform update manager for ScreenControl Service.
 * Handles update checking, downloading, verification, and installation.
 */

#include "update_manager.h"
#include "../core/logger.h"
#include "../core/config.h"
#include "platform.h"

#include <fstream>
#include <sstream>
#include <filesystem>
#include <cstring>
#include <chrono>

#if PLATFORM_WINDOWS
    #include <windows.h>
    #include <winhttp.h>
    #pragma comment(lib, "winhttp.lib")
#else
    #include <curl/curl.h>
    #include <openssl/sha.h>
#endif

namespace fs = std::filesystem;
using json = nlohmann::json;

namespace ScreenControl
{

// CURL write callback (macOS/Linux)
#if !PLATFORM_WINDOWS
static size_t curlWriteCallback(void* contents, size_t size, size_t nmemb, void* userp)
{
    size_t totalSize = size * nmemb;
    std::string* response = static_cast<std::string*>(userp);
    response->append(static_cast<char*>(contents), totalSize);
    return totalSize;
}

static size_t curlFileWriteCallback(void* contents, size_t size, size_t nmemb, void* userp)
{
    size_t totalSize = size * nmemb;
    std::ofstream* file = static_cast<std::ofstream*>(userp);
    file->write(static_cast<char*>(contents), totalSize);
    return totalSize;
}
#endif

UpdateManager::UpdateManager()
{
#if !PLATFORM_WINDOWS
    curl_global_init(CURL_GLOBAL_DEFAULT);
#endif
}

UpdateManager::~UpdateManager()
{
    m_cancelDownload = true;
    if (m_workerThread.joinable())
    {
        m_workerThread.join();
    }

#if !PLATFORM_WINDOWS
    curl_global_cleanup();
#endif
}

UpdateManager& UpdateManager::getInstance()
{
    static UpdateManager instance;
    return instance;
}

void UpdateManager::log(const std::string& message)
{
    Logger::info("[UpdateManager] " + message);
}

void UpdateManager::configure(const UpdateConfig& config)
{
    std::lock_guard<std::mutex> lock(m_mutex);
    m_config = config;
    log("Configured: server=" + config.serverUrl + ", version=" + config.currentVersion +
        ", platform=" + config.platform + "-" + config.arch);
}

void UpdateManager::onHeartbeat(int updateFlag)
{
    m_heartbeatCount++;

    // Only check periodically (default every 60 heartbeats = ~5 minutes)
    if (m_heartbeatCount < m_config.checkIntervalHeartbeats)
    {
        return;
    }

    m_heartbeatCount = 0;

    // If server signals update available, check for it
    if (updateFlag > 0)
    {
        log("Server signaled update available (flag=" + std::to_string(updateFlag) + ")");

        // For forced updates (flag=2), auto-install even if autoInstall is false
        if (updateFlag == 2 && m_status == UpdateStatus::DOWNLOADED)
        {
            log("Forced update - applying immediately");
            applyUpdate();
            return;
        }

        // Check and download if not already done
        if (m_status == UpdateStatus::IDLE || m_status == UpdateStatus::UP_TO_DATE)
        {
            checkForUpdate();
        }
    }
}

void UpdateManager::checkForUpdate()
{
    if (m_status == UpdateStatus::CHECKING || m_status == UpdateStatus::DOWNLOADING)
    {
        return;  // Already in progress
    }

    // Start check in background thread
    if (m_workerThread.joinable())
    {
        m_workerThread.join();
    }

    m_workerThread = std::thread([this]() {
        m_status = UpdateStatus::CHECKING;

        if (m_statusCallback)
        {
            m_statusCallback(m_status, "Checking for updates...");
        }

        // Build check URL
        std::stringstream url;
        url << m_config.serverUrl << "/api/updates/check?"
            << "platform=" << m_config.platform
            << "&arch=" << m_config.arch
            << "&currentVersion=" << m_config.currentVersion
            << "&channel=" << m_config.channel;

        if (!m_config.machineId.empty())
        {
            url << "&machineId=" << m_config.machineId;
        }

        std::string response;
        if (!httpGet(url.str(), response))
        {
            log("Failed to check for updates");
            m_status = UpdateStatus::FAILED;
            if (m_statusCallback)
            {
                m_statusCallback(m_status, "Failed to check for updates");
            }
            return;
        }

        try
        {
            json j = json::parse(response);

            bool updateAvailable = j.value("updateAvailable", false);

            if (!updateAvailable)
            {
                log("No update available: " + j.value("reason", "up to date"));
                m_status = UpdateStatus::UP_TO_DATE;
                if (m_statusCallback)
                {
                    m_statusCallback(m_status, "Already up to date");
                }
                return;
            }

            // Parse update info
            m_updateInfo.version = j.value("version", "");
            m_updateInfo.channel = j.value("channel", "STABLE");
            m_updateInfo.size = j.value("size", 0ULL);
            m_updateInfo.sha256 = j.value("sha256", "");
            m_updateInfo.filename = j.value("filename", "");
            m_updateInfo.releaseNotes = j.value("releaseNotes", "");
            m_updateInfo.downloadUrl = j.value("downloadUrl", "");
            m_updateInfo.isForced = j.value("isForced", false);

            log("Update available: v" + m_updateInfo.version +
                " (" + std::to_string(m_updateInfo.size / 1024 / 1024) + " MB)");

            m_status = UpdateStatus::AVAILABLE;

            if (m_statusCallback)
            {
                m_statusCallback(m_status, "Update v" + m_updateInfo.version + " available");
            }

            // Auto-download if configured
            if (m_config.autoDownload)
            {
                downloadUpdate();
            }
        }
        catch (const std::exception& e)
        {
            log("Failed to parse update response: " + std::string(e.what()));
            m_status = UpdateStatus::FAILED;
            if (m_statusCallback)
            {
                m_statusCallback(m_status, "Failed to parse update info");
            }
        }
    });
}

void UpdateManager::downloadUpdate()
{
    if (m_status != UpdateStatus::AVAILABLE)
    {
        return;
    }

    // Start download in background
    if (m_workerThread.joinable())
    {
        m_workerThread.join();
    }

    m_cancelDownload = false;

    m_workerThread = std::thread([this]() {
        m_status = UpdateStatus::DOWNLOADING;
        m_downloaded = 0;
        m_totalSize = m_updateInfo.size;

        if (m_statusCallback)
        {
            m_statusCallback(m_status, "Downloading v" + m_updateInfo.version + "...");
        }

        // Create download directory
        std::string downloadDir = getDownloadDir();
        fs::create_directories(downloadDir);

        m_downloadPath = downloadDir + "/" + m_updateInfo.filename;

        // Build full download URL
        std::string downloadUrl = m_config.serverUrl + m_updateInfo.downloadUrl;

        log("Downloading from: " + downloadUrl);
        log("Saving to: " + m_downloadPath);

        bool success = httpDownload(
            downloadUrl,
            m_downloadPath,
            [this](uint64_t downloaded, uint64_t total) {
                m_downloaded = downloaded;
                m_totalSize = total;
                if (m_progressCallback)
                {
                    m_progressCallback(downloaded, total);
                }
            }
        );

        if (!success || m_cancelDownload)
        {
            log("Download failed or cancelled");
            m_status = UpdateStatus::FAILED;
            if (m_statusCallback)
            {
                m_statusCallback(m_status, m_cancelDownload ? "Download cancelled" : "Download failed");
            }
            return;
        }

        // Verify checksum
        log("Verifying checksum...");
        if (!verifyChecksum(m_downloadPath, m_updateInfo.sha256))
        {
            log("Checksum verification failed!");
            m_status = UpdateStatus::FAILED;
            if (m_statusCallback)
            {
                m_statusCallback(m_status, "Checksum verification failed");
            }
            return;
        }

        log("Download complete and verified");
        m_status = UpdateStatus::DOWNLOADED;

        if (m_statusCallback)
        {
            m_statusCallback(m_status, "Update v" + m_updateInfo.version + " ready to install");
        }

        // Auto-install if configured
        if (m_config.autoInstall || m_updateInfo.isForced)
        {
            applyUpdate();
        }
    });
}

void UpdateManager::applyUpdate()
{
    if (m_status != UpdateStatus::DOWNLOADED)
    {
        log("Cannot apply update - not downloaded");
        return;
    }

    log("Applying update v" + m_updateInfo.version + "...");
    m_status = UpdateStatus::INSTALLING;

    if (m_statusCallback)
    {
        m_statusCallback(m_status, "Installing v" + m_updateInfo.version + "...");
    }

    bool success = false;

#if PLATFORM_WINDOWS
    success = applyUpdateWindows();
#elif PLATFORM_MACOS
    success = applyUpdateMacOS();
#else
    success = applyUpdateLinux();
#endif

    if (!success)
    {
        log("Update installation failed");
        m_status = UpdateStatus::FAILED;
        if (m_statusCallback)
        {
            m_statusCallback(m_status, "Installation failed");
        }
    }
    // Note: If success, the process will exit and restart
}

void UpdateManager::cancelDownload()
{
    m_cancelDownload = true;
}

UpdateInfo UpdateManager::getUpdateInfo() const
{
    return m_updateInfo;
}

int UpdateManager::getDownloadProgress() const
{
    if (m_totalSize == 0) return 0;
    return static_cast<int>((m_downloaded * 100) / m_totalSize);
}

std::string UpdateManager::getDownloadDir()
{
#if PLATFORM_WINDOWS
    char tempPath[MAX_PATH];
    GetTempPathA(MAX_PATH, tempPath);
    return std::string(tempPath) + "ScreenControl-update";
#else
    return "/tmp/ScreenControl-update";
#endif
}

std::string UpdateManager::getBackupDir()
{
#if PLATFORM_WINDOWS
    char tempPath[MAX_PATH];
    GetTempPathA(MAX_PATH, tempPath);
    return std::string(tempPath) + "ScreenControl-backup";
#else
    return "/tmp/ScreenControl-backup";
#endif
}

std::string UpdateManager::getInstallDir()
{
#if PLATFORM_WINDOWS
    return "C:\\Program Files\\ScreenControl";
#elif PLATFORM_MACOS
    return "/Library/PrivilegedHelperTools";
#else
    return "/opt/screencontrol";
#endif
}

// HTTP GET implementation
bool UpdateManager::httpGet(const std::string& url, std::string& response)
{
#if PLATFORM_WINDOWS
    // Windows HTTP implementation using WinHTTP
    URL_COMPONENTSA urlComp = {0};
    urlComp.dwStructSize = sizeof(urlComp);
    char hostName[256] = {0};
    char urlPath[1024] = {0};
    urlComp.lpszHostName = hostName;
    urlComp.dwHostNameLength = sizeof(hostName);
    urlComp.lpszUrlPath = urlPath;
    urlComp.dwUrlPathLength = sizeof(urlPath);

    if (!WinHttpCrackUrl(url.c_str(), 0, 0, &urlComp))
    {
        return false;
    }

    HINTERNET hSession = WinHttpOpen(L"ScreenControl/1.0", WINHTTP_ACCESS_TYPE_DEFAULT_PROXY,
                                     WINHTTP_NO_PROXY_NAME, WINHTTP_NO_PROXY_BYPASS, 0);
    if (!hSession) return false;

    HINTERNET hConnect = WinHttpConnect(hSession, std::wstring(hostName, hostName + strlen(hostName)).c_str(),
                                        urlComp.nPort, 0);
    if (!hConnect)
    {
        WinHttpCloseHandle(hSession);
        return false;
    }

    DWORD flags = urlComp.nScheme == INTERNET_SCHEME_HTTPS ? WINHTTP_FLAG_SECURE : 0;
    HINTERNET hRequest = WinHttpOpenRequest(hConnect, L"GET",
                                            std::wstring(urlPath, urlPath + strlen(urlPath)).c_str(),
                                            NULL, WINHTTP_NO_REFERER, WINHTTP_DEFAULT_ACCEPT_TYPES, flags);
    if (!hRequest)
    {
        WinHttpCloseHandle(hConnect);
        WinHttpCloseHandle(hSession);
        return false;
    }

    // Add machine ID header
    if (!m_config.machineId.empty())
    {
        std::wstring header = L"X-Machine-Id: " + std::wstring(m_config.machineId.begin(), m_config.machineId.end());
        WinHttpAddRequestHeaders(hRequest, header.c_str(), -1, WINHTTP_ADDREQ_FLAG_ADD);
    }

    if (!WinHttpSendRequest(hRequest, WINHTTP_NO_ADDITIONAL_HEADERS, 0, WINHTTP_NO_REQUEST_DATA, 0, 0, 0) ||
        !WinHttpReceiveResponse(hRequest, NULL))
    {
        WinHttpCloseHandle(hRequest);
        WinHttpCloseHandle(hConnect);
        WinHttpCloseHandle(hSession);
        return false;
    }

    DWORD bytesAvailable;
    while (WinHttpQueryDataAvailable(hRequest, &bytesAvailable) && bytesAvailable > 0)
    {
        std::vector<char> buffer(bytesAvailable + 1);
        DWORD bytesRead;
        if (WinHttpReadData(hRequest, buffer.data(), bytesAvailable, &bytesRead))
        {
            response.append(buffer.data(), bytesRead);
        }
    }

    WinHttpCloseHandle(hRequest);
    WinHttpCloseHandle(hConnect);
    WinHttpCloseHandle(hSession);
    return true;
#else
    // macOS/Linux using libcurl
    CURL* curl = curl_easy_init();
    if (!curl) return false;

    curl_easy_setopt(curl, CURLOPT_URL, url.c_str());
    curl_easy_setopt(curl, CURLOPT_WRITEFUNCTION, curlWriteCallback);
    curl_easy_setopt(curl, CURLOPT_WRITEDATA, &response);
    curl_easy_setopt(curl, CURLOPT_FOLLOWLOCATION, 1L);
    curl_easy_setopt(curl, CURLOPT_SSL_VERIFYPEER, 1L);
    curl_easy_setopt(curl, CURLOPT_TIMEOUT, 30L);

    // Add headers
    struct curl_slist* headers = NULL;
    if (!m_config.machineId.empty())
    {
        headers = curl_slist_append(headers, ("X-Machine-Id: " + m_config.machineId).c_str());
    }
    if (!m_config.fingerprint.empty())
    {
        headers = curl_slist_append(headers, ("X-Fingerprint: " + m_config.fingerprint).c_str());
    }
    if (headers)
    {
        curl_easy_setopt(curl, CURLOPT_HTTPHEADER, headers);
    }

    CURLcode res = curl_easy_perform(curl);

    if (headers)
    {
        curl_slist_free_all(headers);
    }
    curl_easy_cleanup(curl);

    return res == CURLE_OK;
#endif
}

// HTTP Download implementation
bool UpdateManager::httpDownload(const std::string& url, const std::string& destPath,
                                  std::function<void(uint64_t, uint64_t)> progressCallback)
{
#if PLATFORM_WINDOWS
    // Similar to httpGet but write to file
    // ... (implementation similar to above with file writing)
    return false;  // TODO: Implement Windows download
#else
    CURL* curl = curl_easy_init();
    if (!curl) return false;

    std::ofstream file(destPath, std::ios::binary);
    if (!file.is_open())
    {
        curl_easy_cleanup(curl);
        return false;
    }

    curl_easy_setopt(curl, CURLOPT_URL, url.c_str());
    curl_easy_setopt(curl, CURLOPT_WRITEFUNCTION, curlFileWriteCallback);
    curl_easy_setopt(curl, CURLOPT_WRITEDATA, &file);
    curl_easy_setopt(curl, CURLOPT_FOLLOWLOCATION, 1L);
    curl_easy_setopt(curl, CURLOPT_SSL_VERIFYPEER, 1L);
    curl_easy_setopt(curl, CURLOPT_NOPROGRESS, 0L);

    // Progress callback
    curl_easy_setopt(curl, CURLOPT_XFERINFOFUNCTION,
        +[](void* clientp, curl_off_t dltotal, curl_off_t dlnow, curl_off_t, curl_off_t) -> int {
            auto* cb = static_cast<std::function<void(uint64_t, uint64_t)>*>(clientp);
            if (cb && *cb)
            {
                (*cb)(static_cast<uint64_t>(dlnow), static_cast<uint64_t>(dltotal));
            }
            return 0;
        });
    curl_easy_setopt(curl, CURLOPT_XFERINFODATA, &progressCallback);

    // Add headers
    struct curl_slist* headers = NULL;
    if (!m_config.machineId.empty())
    {
        headers = curl_slist_append(headers, ("X-Machine-Id: " + m_config.machineId).c_str());
    }
    if (!m_config.fingerprint.empty())
    {
        headers = curl_slist_append(headers, ("X-Fingerprint: " + m_config.fingerprint).c_str());
    }
    if (headers)
    {
        curl_easy_setopt(curl, CURLOPT_HTTPHEADER, headers);
    }

    CURLcode res = curl_easy_perform(curl);

    file.close();

    if (headers)
    {
        curl_slist_free_all(headers);
    }
    curl_easy_cleanup(curl);

    return res == CURLE_OK;
#endif
}

bool UpdateManager::verifyChecksum(const std::string& filepath, const std::string& expectedSha256)
{
    if (expectedSha256.empty())
    {
        log("Warning: No checksum provided, skipping verification");
        return true;
    }

#if PLATFORM_WINDOWS
    // Windows SHA256 implementation using CryptoAPI
    // TODO: Implement Windows checksum
    return true;
#else
    std::ifstream file(filepath, std::ios::binary);
    if (!file.is_open()) return false;

    SHA256_CTX sha256;
    SHA256_Init(&sha256);

    char buffer[8192];
    while (file.read(buffer, sizeof(buffer)))
    {
        SHA256_Update(&sha256, buffer, file.gcount());
    }
    if (file.gcount() > 0)
    {
        SHA256_Update(&sha256, buffer, file.gcount());
    }

    unsigned char hash[SHA256_DIGEST_LENGTH];
    SHA256_Final(hash, &sha256);

    // Convert to hex string
    std::stringstream ss;
    for (int i = 0; i < SHA256_DIGEST_LENGTH; i++)
    {
        ss << std::hex << std::setw(2) << std::setfill('0') << static_cast<int>(hash[i]);
    }

    std::string calculatedHash = ss.str();
    bool match = (calculatedHash == expectedSha256);

    if (!match)
    {
        log("Checksum mismatch: expected " + expectedSha256 + ", got " + calculatedHash);
    }

    return match;
#endif
}

} // namespace ScreenControl
