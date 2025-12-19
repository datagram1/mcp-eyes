/**
 * Windows Platform Implementation
 *
 * Implements platform-specific functions for Windows including:
 * - DPAPI integration for secure credential storage
 * - Session lock detection via WTS API
 * - Windows Service management
 * - Credential Provider integration for unlock
 */

#include "platform.h"

#if !PLATFORM_WINDOWS
#error "This file should only be compiled for Windows"
#endif

#include "crypto.h"
#include "../../core/config.h"
#include "../../core/logger.h"
#include "../../libs/httplib.h"
#include "../../libs/json.hpp"
#include <winsock2.h>
#include <ws2tcpip.h>
#include <windows.h>
#include <wtsapi32.h>
#include <userenv.h>
#include <lmcons.h>
#include <wincred.h>
#include <dpapi.h>
#include <shlobj.h>
#include <process.h>
#include <fstream>
#include <array>
#include <thread>
#include <chrono>
#include <cstring>
#include <atomic>
#include <mutex>

#pragma comment(lib, "wtsapi32.lib")
#pragma comment(lib, "userenv.lib")
#pragma comment(lib, "credui.lib")
#pragma comment(lib, "crypt32.lib")
#pragma comment(lib, "ws2_32.lib")

using ScreenControl::Logger;

namespace platform {

// ============================================================================
// Basic Platform Functions
// ============================================================================

std::string getCurrentUsername()
{
    char username[UNLEN + 1];
    DWORD usernameLen = UNLEN + 1;

    if (GetUserNameA(username, &usernameLen))
    {
        return username;
    }

    // Try WTS for session username
    LPSTR sessionUsername = nullptr;
    DWORD bytesReturned = 0;

    if (WTSQuerySessionInformationA(
            WTS_CURRENT_SERVER_HANDLE,
            WTS_CURRENT_SESSION,
            WTSUserName,
            &sessionUsername,
            &bytesReturned))
    {
        std::string result(sessionUsername);
        WTSFreeMemory(sessionUsername);
        return result;
    }

    return "";
}

std::string getUserHomeDir(const std::string& username)
{
    if (username.empty())
    {
        // Current user - try USERPROFILE first
        char* userProfile = nullptr;
        size_t len = 0;
        if (_dupenv_s(&userProfile, &len, "USERPROFILE") == 0 && userProfile)
        {
            std::string result(userProfile);
            free(userProfile);
            return result;
        }

        // Fall back to SHGetFolderPath
        char path[MAX_PATH];
        if (SUCCEEDED(SHGetFolderPathA(nullptr, CSIDL_PROFILE, nullptr, 0, path)))
        {
            return path;
        }
        return "";
    }

    // For specific user, construct path
    return "C:\\Users\\" + username;
}

std::string getUserConfigDir(const std::string& username)
{
    std::string home = getUserHomeDir(username);
    if (home.empty())
    {
        return "";
    }
    return home + "\\AppData\\Local\\ScreenControl";
}

bool isRunningAsRoot()
{
    // Check if running as SYSTEM or Administrator
    BOOL isAdmin = FALSE;
    PSID adminGroup = nullptr;

    SID_IDENTIFIER_AUTHORITY ntAuthority = SECURITY_NT_AUTHORITY;
    if (AllocateAndInitializeSid(
            &ntAuthority, 2,
            SECURITY_BUILTIN_DOMAIN_RID,
            DOMAIN_ALIAS_RID_ADMINS,
            0, 0, 0, 0, 0, 0,
            &adminGroup))
    {
        CheckTokenMembership(nullptr, adminGroup, &isAdmin);
        FreeSid(adminGroup);
    }

    return isAdmin != FALSE;
}

int getProcessId()
{
    return static_cast<int>(GetCurrentProcessId());
}

void sleepMs(int milliseconds)
{
    Sleep(static_cast<DWORD>(milliseconds));
}

CommandResult executeCommand(const std::string& command, int timeoutMs)
{
    CommandResult result;
    result.exitCode = -1;

    // Create pipes for stdout and stderr
    SECURITY_ATTRIBUTES sa;
    sa.nLength = sizeof(SECURITY_ATTRIBUTES);
    sa.bInheritHandle = TRUE;
    sa.lpSecurityDescriptor = nullptr;

    HANDLE stdoutRead, stdoutWrite;
    HANDLE stderrRead, stderrWrite;

    if (!CreatePipe(&stdoutRead, &stdoutWrite, &sa, 0) ||
        !CreatePipe(&stderrRead, &stderrWrite, &sa, 0))
    {
        result.stderrData = "Failed to create pipes";
        return result;
    }

    // Don't inherit read handles
    SetHandleInformation(stdoutRead, HANDLE_FLAG_INHERIT, 0);
    SetHandleInformation(stderrRead, HANDLE_FLAG_INHERIT, 0);

    // Setup process info
    STARTUPINFOA si;
    PROCESS_INFORMATION pi;
    ZeroMemory(&si, sizeof(si));
    ZeroMemory(&pi, sizeof(pi));

    si.cb = sizeof(si);
    si.hStdOutput = stdoutWrite;
    si.hStdError = stderrWrite;
    si.dwFlags |= STARTF_USESTDHANDLES;

    // Build command line
    std::string cmdLine = "cmd.exe /c " + command;
    std::vector<char> cmdBuf(cmdLine.begin(), cmdLine.end());
    cmdBuf.push_back('\0');

    // Create process
    BOOL success = CreateProcessA(
        nullptr,
        cmdBuf.data(),
        nullptr,
        nullptr,
        TRUE,
        CREATE_NO_WINDOW,
        nullptr,
        nullptr,
        &si,
        &pi
    );

    // Close write ends of pipes
    CloseHandle(stdoutWrite);
    CloseHandle(stderrWrite);

    if (!success)
    {
        result.stderrData = "Failed to create process";
        CloseHandle(stdoutRead);
        CloseHandle(stderrRead);
        return result;
    }

    // Read output with timeout
    auto startTime = std::chrono::steady_clock::now();
    std::array<char, 4096> buffer;
    DWORD bytesRead;
    bool timedOut = false;

    while (true)
    {
        auto elapsed = std::chrono::duration_cast<std::chrono::milliseconds>(
            std::chrono::steady_clock::now() - startTime).count();

        if (elapsed >= timeoutMs)
        {
            timedOut = true;
            TerminateProcess(pi.hProcess, 1);
            break;
        }

        // Check if process has exited
        DWORD exitCode;
        if (GetExitCodeProcess(pi.hProcess, &exitCode) && exitCode != STILL_ACTIVE)
        {
            // Read remaining data
            DWORD available;
            while (PeekNamedPipe(stdoutRead, nullptr, 0, nullptr, &available, nullptr) && available > 0)
            {
                if (ReadFile(stdoutRead, buffer.data(), static_cast<DWORD>(buffer.size()), &bytesRead, nullptr))
                {
                    result.stdoutData.append(buffer.data(), bytesRead);
                }
            }
            while (PeekNamedPipe(stderrRead, nullptr, 0, nullptr, &available, nullptr) && available > 0)
            {
                if (ReadFile(stderrRead, buffer.data(), static_cast<DWORD>(buffer.size()), &bytesRead, nullptr))
                {
                    result.stderrData.append(buffer.data(), bytesRead);
                }
            }
            result.exitCode = static_cast<int>(exitCode);
            break;
        }

        // Read available data
        DWORD available;
        if (PeekNamedPipe(stdoutRead, nullptr, 0, nullptr, &available, nullptr) && available > 0)
        {
            if (ReadFile(stdoutRead, buffer.data(), static_cast<DWORD>(buffer.size()), &bytesRead, nullptr))
            {
                result.stdoutData.append(buffer.data(), bytesRead);
            }
        }
        if (PeekNamedPipe(stderrRead, nullptr, 0, nullptr, &available, nullptr) && available > 0)
        {
            if (ReadFile(stderrRead, buffer.data(), static_cast<DWORD>(buffer.size()), &bytesRead, nullptr))
            {
                result.stderrData.append(buffer.data(), bytesRead);
            }
        }

        Sleep(100);
    }

    CloseHandle(stdoutRead);
    CloseHandle(stderrRead);
    CloseHandle(pi.hProcess);
    CloseHandle(pi.hThread);

    if (timedOut)
    {
        result.exitCode = -1;
        result.stderrData = "Command timed out after " + std::to_string(timeoutMs) + "ms";
    }

    return result;
}

// ============================================================================
// Service Lifecycle (Windows Service)
// ============================================================================

namespace service {

bool install()
{
    // Service installation handled by installer or sc.exe
    return true;
}

bool uninstall()
{
    // Service uninstallation handled by installer or sc.exe
    return true;
}

bool start()
{
    auto result = executeCommand("sc start ScreenControlService", 10000);
    return result.exitCode == 0;
}

bool stop()
{
    auto result = executeCommand("sc stop ScreenControlService", 10000);
    return result.exitCode == 0;
}

bool isRunning()
{
    auto result = executeCommand("sc query ScreenControlService | findstr RUNNING", 5000);
    return result.exitCode == 0;
}

} // namespace service

// ============================================================================
// Secure Storage (DPAPI + Windows Credential Manager)
// ============================================================================

namespace secure_storage {

static const wchar_t* CREDENTIAL_PREFIX = L"ScreenControl_";

bool storeKey(const std::string& keyId, const std::vector<uint8_t>& keyData)
{
    // Use Windows Credential Manager with DPAPI encryption
    std::wstring targetName = CREDENTIAL_PREFIX + std::wstring(keyId.begin(), keyId.end());

    // DPAPI encrypt the data first for extra protection
    DATA_BLOB inputBlob;
    DATA_BLOB outputBlob;
    inputBlob.pbData = const_cast<BYTE*>(keyData.data());
    inputBlob.cbData = static_cast<DWORD>(keyData.size());

    if (!CryptProtectData(&inputBlob, L"ScreenControl Key", nullptr, nullptr, nullptr,
                          CRYPTPROTECT_LOCAL_MACHINE, &outputBlob))
    {
        return false;
    }

    // Store in Credential Manager
    CREDENTIALW cred;
    ZeroMemory(&cred, sizeof(cred));
    cred.Type = CRED_TYPE_GENERIC;
    cred.TargetName = const_cast<LPWSTR>(targetName.c_str());
    cred.CredentialBlobSize = outputBlob.cbData;
    cred.CredentialBlob = outputBlob.pbData;
    cred.Persist = CRED_PERSIST_LOCAL_MACHINE;

    BOOL success = CredWriteW(&cred, 0);

    LocalFree(outputBlob.pbData);

    return success != FALSE;
}

std::vector<uint8_t> retrieveKey(const std::string& keyId)
{
    std::vector<uint8_t> result;

    std::wstring targetName = CREDENTIAL_PREFIX + std::wstring(keyId.begin(), keyId.end());

    PCREDENTIALW pCred = nullptr;
    if (!CredReadW(targetName.c_str(), CRED_TYPE_GENERIC, 0, &pCred))
    {
        return result;
    }

    // DPAPI decrypt
    DATA_BLOB inputBlob;
    DATA_BLOB outputBlob;
    inputBlob.pbData = pCred->CredentialBlob;
    inputBlob.cbData = pCred->CredentialBlobSize;

    if (CryptUnprotectData(&inputBlob, nullptr, nullptr, nullptr, nullptr, 0, &outputBlob))
    {
        result.assign(outputBlob.pbData, outputBlob.pbData + outputBlob.cbData);
        LocalFree(outputBlob.pbData);
    }

    CredFree(pCred);

    return result;
}

bool deleteKey(const std::string& keyId)
{
    std::wstring targetName = CREDENTIAL_PREFIX + std::wstring(keyId.begin(), keyId.end());
    return CredDeleteW(targetName.c_str(), CRED_TYPE_GENERIC, 0) != FALSE;
}

bool keyExists(const std::string& keyId)
{
    std::wstring targetName = CREDENTIAL_PREFIX + std::wstring(keyId.begin(), keyId.end());

    PCREDENTIALW pCred = nullptr;
    if (CredReadW(targetName.c_str(), CRED_TYPE_GENERIC, 0, &pCred))
    {
        CredFree(pCred);
        return true;
    }
    return false;
}

} // namespace secure_storage

// ============================================================================
// Machine Unlock
// ============================================================================

namespace unlock {

// Key IDs for stored credentials
static const char* CRED_KEY_ID = "unlock_credentials";
static const char* CRED_K1_KEY_ID = "unlock_k1";

bool isLocked()
{
    // Method 1: Check if workstation is locked via WTS
    DWORD sessionId = WTSGetActiveConsoleSessionId();
    if (sessionId == 0xFFFFFFFF)
    {
        return true;  // No active console session
    }

    // Check session state
    WTS_CONNECTSTATE_CLASS* pState = nullptr;
    DWORD bytesReturned = 0;

    if (WTSQuerySessionInformationW(
            WTS_CURRENT_SERVER_HANDLE,
            sessionId,
            WTSConnectState,
            reinterpret_cast<LPWSTR*>(&pState),
            &bytesReturned))
    {
        WTS_CONNECTSTATE_CLASS state = *pState;
        WTSFreeMemory(pState);

        // Session is locked or disconnected
        if (state == WTSDisconnected || state == WTSListen)
        {
            return true;
        }
    }

    // Method 2: Check for LogonUI (lock screen process)
    auto result = executeCommand("tasklist | findstr LogonUI.exe", 5000);
    if (result.exitCode == 0 && !result.stdoutData.empty())
    {
        return true;
    }

    return false;
}

bool unlockWithStoredCredentials()
{
    // Check if we have stored credentials
    if (!hasStoredCredentials())
    {
        return false;
    }

    // Retrieve encrypted credentials and K1
    std::vector<uint8_t> encryptedBlob = secure_storage::retrieveKey(CRED_KEY_ID);
    std::vector<uint8_t> k1 = secure_storage::retrieveKey(CRED_K1_KEY_ID);

    if (encryptedBlob.empty() || k1.empty())
    {
        return false;
    }

    // Read K2 from file
    std::ifstream keyFile(CREDENTIAL_KEY_PATH, std::ios::binary);
    if (!keyFile)
    {
        return false;
    }

    std::vector<uint8_t> k2((std::istreambuf_iterator<char>(keyFile)),
                             std::istreambuf_iterator<char>());
    keyFile.close();

    if (k2.size() != 32)
    {
        crypto::secureWipe(k2);
        return false;
    }

    // Reconstruct the full encryption key
    std::vector<uint8_t> fullKey;
    try
    {
        fullKey = crypto::combineKey(k1, k2);
    }
    catch (...)
    {
        crypto::secureWipe(k2);
        return false;
    }

    crypto::secureWipe(k2);

    // Decrypt
    crypto::EncryptedData encData = crypto::EncryptedData::deserialize(encryptedBlob);
    if (!encData.isValid())
    {
        crypto::secureWipe(fullKey);
        return false;
    }

    std::vector<uint8_t> decrypted;
    try
    {
        decrypted = crypto::decrypt(fullKey, encData);
    }
    catch (...)
    {
        crypto::secureWipe(fullKey);
        return false;
    }

    crypto::secureWipe(fullKey);

    if (decrypted.empty())
    {
        return false;
    }

    // Parse username and password
    std::string username;
    std::string password;
    bool foundNull = false;

    for (size_t i = 0; i < decrypted.size(); i++)
    {
        if (decrypted[i] == '\0')
        {
            foundNull = true;
            continue;
        }
        if (!foundNull)
        {
            username += static_cast<char>(decrypted[i]);
        }
        else
        {
            password += static_cast<char>(decrypted[i]);
        }
    }

    crypto::secureWipe(decrypted);

    if (username.empty() || password.empty())
    {
        return false;
    }

    // Unlock approach: Use VNC protocol to send keystrokes to the lock screen
    // VNC (TightVNC) can inject keystrokes to the secure desktop because it operates
    // at a lower level than SendInput, bypassing UIPI restrictions

    std::string pwd = password;
    crypto::secureWipe(password);

    Logger::info("Unlock: Using VNC protocol to type password...");

    // Connect to local VNC server (TightVNC on port 5900)
    SOCKET sock = socket(AF_INET, SOCK_STREAM, IPPROTO_TCP);
    if (sock == INVALID_SOCKET)
    {
        Logger::error("Unlock: Failed to create socket, error=" + std::to_string(WSAGetLastError()));
        crypto::secureWipe(pwd);
        return false;
    }

    // Set socket timeout
    DWORD timeout = 10000; // 10 seconds
    setsockopt(sock, SOL_SOCKET, SO_RCVTIMEO, (char*)&timeout, sizeof(timeout));
    setsockopt(sock, SOL_SOCKET, SO_SNDTIMEO, (char*)&timeout, sizeof(timeout));

    sockaddr_in addr = {};
    addr.sin_family = AF_INET;
    addr.sin_port = htons(5900);
    addr.sin_addr.s_addr = htonl(INADDR_LOOPBACK); // localhost

    if (connect(sock, (sockaddr*)&addr, sizeof(addr)) == SOCKET_ERROR)
    {
        Logger::error("Unlock: Failed to connect to VNC server, error=" + std::to_string(WSAGetLastError()));
        closesocket(sock);
        crypto::secureWipe(pwd);
        return false;
    }
    Logger::info("Unlock: Connected to VNC server on localhost:5900");

    // Helper to receive exact bytes
    auto recvExact = [&sock](int n) -> std::vector<uint8_t> {
        std::vector<uint8_t> data(n);
        int received = 0;
        while (received < n)
        {
            int r = recv(sock, (char*)data.data() + received, n - received, 0);
            if (r <= 0) break;
            received += r;
        }
        return received == n ? data : std::vector<uint8_t>();
    };

    // RFB Protocol handshake
    // 1. Read server version (12 bytes)
    auto serverVersion = recvExact(12);
    if (serverVersion.empty())
    {
        Logger::error("Unlock: Failed to read VNC server version");
        closesocket(sock);
        crypto::secureWipe(pwd);
        return false;
    }
    Logger::info("Unlock: VNC server version: " + std::string(serverVersion.begin(), serverVersion.end()));

    // 2. Send client version
    const char* clientVersion = "RFB 003.008\n";
    send(sock, clientVersion, 12, 0);
    sleepMs(100);

    // 3. Read security types
    auto numTypesData = recvExact(1);
    if (numTypesData.empty() || numTypesData[0] == 0)
    {
        Logger::error("Unlock: VNC security negotiation failed");
        closesocket(sock);
        crypto::secureWipe(pwd);
        return false;
    }

    int numTypes = numTypesData[0];
    auto secTypes = recvExact(numTypes);
    Logger::info("Unlock: VNC security types available: " + std::to_string(numTypes));

    // Choose security type 1 (None) if available
    bool hasNone = false;
    for (uint8_t t : secTypes) if (t == 1) hasNone = true;

    if (!hasNone)
    {
        Logger::error("Unlock: VNC server does not support None security type");
        closesocket(sock);
        crypto::secureWipe(pwd);
        return false;
    }

    // 4. Select None security (type 1)
    uint8_t secChoice = 1;
    send(sock, (char*)&secChoice, 1, 0);
    sleepMs(100);

    // 5. Send ClientInit (shared=1)
    uint8_t sharedFlag = 1;
    send(sock, (char*)&sharedFlag, 1, 0);
    sleepMs(100);

    // 6. Read ServerInit (24 bytes + name)
    auto serverInit = recvExact(24);
    if (serverInit.size() < 24)
    {
        Logger::error("Unlock: Failed to read VNC ServerInit");
        closesocket(sock);
        crypto::secureWipe(pwd);
        return false;
    }

    uint16_t width = (serverInit[0] << 8) | serverInit[1];
    uint16_t height = (serverInit[2] << 8) | serverInit[3];
    uint32_t nameLen = (serverInit[20] << 24) | (serverInit[21] << 16) | (serverInit[22] << 8) | serverInit[23];
    Logger::info("Unlock: VNC screen " + std::to_string(width) + "x" + std::to_string(height));

    if (nameLen > 0 && nameLen < 1000)
    {
        recvExact(nameLen); // Read and discard desktop name
    }

    Logger::info("Unlock: VNC handshake complete, sending keystrokes...");

    // Helper to send VNC key event
    // Key event format: type(1) + down(1) + padding(2) + keysym(4) = 8 bytes
    auto sendVncKey = [&sock](uint32_t keysym, bool down) {
        uint8_t packet[8] = {};
        packet[0] = 4;  // Key event type
        packet[1] = down ? 1 : 0;
        // packet[2-3] = padding
        packet[4] = (keysym >> 24) & 0xFF;
        packet[5] = (keysym >> 16) & 0xFF;
        packet[6] = (keysym >> 8) & 0xFF;
        packet[7] = keysym & 0xFF;
        send(sock, (char*)packet, 8, 0);
    };

    // Step 1: Press Space to dismiss Windows 11 lock screen widgets
    Logger::info("Unlock: Pressing Space to dismiss widgets...");
    sendVncKey(0x20, true);  // Space down
    sleepMs(50);
    sendVncKey(0x20, false); // Space up
    sleepMs(1000); // Wait for password field to appear

    // Step 2: Type the password
    Logger::info("Unlock: Typing password via VNC...");
    for (char c : pwd)
    {
        uint32_t keysym = static_cast<uint8_t>(c);
        sendVncKey(keysym, true);   // Key down
        sleepMs(30);
        sendVncKey(keysym, false);  // Key up
        sleepMs(30);
    }

    sleepMs(300);

    // Step 3: Press Enter to submit
    Logger::info("Unlock: Pressing Enter to submit...");
    sendVncKey(0xff0d, true);  // Enter down (XK_Return = 0xff0d)
    sleepMs(50);
    sendVncKey(0xff0d, false); // Enter up

    closesocket(sock);
    crypto::secureWipe(pwd);

    // Check if unlock succeeded
    sleepMs(2000);
    bool stillLocked = isLocked();
    Logger::info("Unlock: Complete via VNC, stillLocked=" + std::to_string(stillLocked));
    return !stillLocked;
}

bool storeUnlockCredentials(const std::string& username, const std::string& password)
{
    // Create credential data
    std::vector<uint8_t> credData;
    credData.insert(credData.end(), username.begin(), username.end());
    credData.push_back('\0');
    credData.insert(credData.end(), password.begin(), password.end());

    // Generate encryption key
    std::vector<uint8_t> encryptionKey;
    try
    {
        encryptionKey = crypto::generateKey();
    }
    catch (...)
    {
        crypto::secureWipe(credData);
        return false;
    }

    // Split the key
    crypto::SplitKey splitKey;
    try
    {
        splitKey = crypto::splitKey(encryptionKey);
    }
    catch (...)
    {
        crypto::secureWipe(credData);
        crypto::secureWipe(encryptionKey);
        return false;
    }

    crypto::secureWipe(encryptionKey);

    // Create config directory
    CreateDirectoryA(SERVICE_CONFIG_DIR, nullptr);

    // Write K2 to file
    std::ofstream keyFile(CREDENTIAL_KEY_PATH, std::ios::binary | std::ios::trunc);
    if (!keyFile)
    {
        crypto::secureWipe(credData);
        crypto::secureWipe(splitKey.k1);
        crypto::secureWipe(splitKey.k2);
        return false;
    }
    keyFile.write(reinterpret_cast<const char*>(splitKey.k2.data()), splitKey.k2.size());
    keyFile.close();

    // Reconstruct key for encryption
    std::vector<uint8_t> fullKey;
    try
    {
        fullKey = crypto::combineKey(splitKey.k1, splitKey.k2);
    }
    catch (...)
    {
        crypto::secureWipe(credData);
        crypto::secureWipe(splitKey.k1);
        crypto::secureWipe(splitKey.k2);
        DeleteFileA(CREDENTIAL_KEY_PATH);
        return false;
    }

    crypto::secureWipe(splitKey.k2);

    // Encrypt
    crypto::EncryptedData encData;
    try
    {
        encData = crypto::encrypt(fullKey, credData);
    }
    catch (...)
    {
        crypto::secureWipe(credData);
        crypto::secureWipe(fullKey);
        crypto::secureWipe(splitKey.k1);
        DeleteFileA(CREDENTIAL_KEY_PATH);
        return false;
    }

    crypto::secureWipe(credData);
    crypto::secureWipe(fullKey);

    // Serialize and store
    std::vector<uint8_t> encryptedBlob = encData.serialize();

    bool success = secure_storage::storeKey(CRED_KEY_ID, encryptedBlob) &&
                   secure_storage::storeKey(CRED_K1_KEY_ID, splitKey.k1);

    crypto::secureWipe(splitKey.k1);

    if (!success)
    {
        secure_storage::deleteKey(CRED_KEY_ID);
        secure_storage::deleteKey(CRED_K1_KEY_ID);
        DeleteFileA(CREDENTIAL_KEY_PATH);
    }

    return success;
}

bool clearStoredCredentials()
{
    secure_storage::deleteKey(CRED_KEY_ID);
    secure_storage::deleteKey(CRED_K1_KEY_ID);
    DeleteFileA(CREDENTIAL_KEY_PATH);
    return true;
}

bool hasStoredCredentials()
{
    return secure_storage::keyExists(CRED_KEY_ID) &&
           secure_storage::keyExists(CRED_K1_KEY_ID);
}

// VNC password functions - not implemented on Windows
// (macOS-specific feature for login window unlock)
bool storeVncPassword(const std::string& /* vncPassword */)
{
    return false;
}

bool clearVncPassword()
{
    return true;
}

bool hasVncPassword()
{
    return false;
}

// ============================================================================
// Credential Provider Support
// These functions support the Windows Credential Provider for automatic unlock
// ============================================================================

// Global state for credential provider communication
static std::atomic<bool> g_unlockPending{false};
static std::mutex g_unlockResultMutex;
static bool g_lastUnlockSuccess = false;
static std::string g_lastUnlockError;

void setUnlockPending(bool pending)
{
    g_unlockPending.store(pending);
    if (pending)
    {
        Logger::info("Unlock pending flag set - credential provider will auto-unlock");
    }
}

bool isUnlockPending()
{
    return g_unlockPending.load();
}

bool getCredentialsForProvider(std::string& username, std::string& password, std::string& domain)
{
    // Security: Only return credentials if unlock is pending
    // This prevents unauthorized credential retrieval
    if (!isUnlockPending())
    {
        Logger::warn("Credential request denied - unlock not pending");
        return false;
    }

    // Check if we have stored credentials
    if (!hasStoredCredentials())
    {
        Logger::warn("Credential request failed - no stored credentials");
        return false;
    }

    // Retrieve encrypted credentials and K1
    std::vector<uint8_t> encryptedBlob = secure_storage::retrieveKey(CRED_KEY_ID);
    std::vector<uint8_t> k1 = secure_storage::retrieveKey(CRED_K1_KEY_ID);

    if (encryptedBlob.empty() || k1.empty())
    {
        Logger::error("Failed to retrieve encrypted credentials from storage");
        return false;
    }

    // Read K2 from file
    std::ifstream keyFile(CREDENTIAL_KEY_PATH, std::ios::binary);
    if (!keyFile)
    {
        Logger::error("Failed to read K2 key file");
        return false;
    }

    std::vector<uint8_t> k2((std::istreambuf_iterator<char>(keyFile)),
                             std::istreambuf_iterator<char>());
    keyFile.close();

    if (k2.size() != 32)
    {
        crypto::secureWipe(k2);
        Logger::error("Invalid K2 key file size");
        return false;
    }

    // Reconstruct the full encryption key
    std::vector<uint8_t> fullKey;
    try
    {
        fullKey = crypto::combineKey(k1, k2);
    }
    catch (...)
    {
        crypto::secureWipe(k2);
        Logger::error("Failed to combine encryption keys");
        return false;
    }

    crypto::secureWipe(k2);

    // Decrypt
    crypto::EncryptedData encData = crypto::EncryptedData::deserialize(encryptedBlob);
    if (!encData.isValid())
    {
        crypto::secureWipe(fullKey);
        Logger::error("Invalid encrypted data format");
        return false;
    }

    std::vector<uint8_t> decrypted;
    try
    {
        decrypted = crypto::decrypt(fullKey, encData);
    }
    catch (...)
    {
        crypto::secureWipe(fullKey);
        Logger::error("Failed to decrypt credentials");
        return false;
    }

    crypto::secureWipe(fullKey);

    if (decrypted.empty())
    {
        Logger::error("Decrypted credentials are empty");
        return false;
    }

    // Parse username and password (format: username\0password)
    std::string user;
    std::string pass;
    bool foundNull = false;

    for (size_t i = 0; i < decrypted.size(); i++)
    {
        if (decrypted[i] == '\0')
        {
            foundNull = true;
            continue;
        }
        if (!foundNull)
        {
            user += static_cast<char>(decrypted[i]);
        }
        else
        {
            pass += static_cast<char>(decrypted[i]);
        }
    }

    crypto::secureWipe(decrypted);

    if (user.empty() || pass.empty())
    {
        Logger::error("Parsed credentials are empty");
        return false;
    }

    // Check if username contains domain (DOMAIN\username or username@domain)
    size_t backslashPos = user.find('\\');
    size_t atPos = user.find('@');

    if (backslashPos != std::string::npos)
    {
        // DOMAIN\username format
        domain = user.substr(0, backslashPos);
        username = user.substr(backslashPos + 1);
    }
    else if (atPos != std::string::npos)
    {
        // username@domain format (UPN)
        username = user;  // Keep full UPN for authentication
        domain = "";      // Empty domain for UPN
    }
    else
    {
        // Local account - use computer name as domain
        username = user;
        char computerName[MAX_COMPUTERNAME_LENGTH + 1];
        DWORD size = sizeof(computerName);
        if (GetComputerNameA(computerName, &size))
        {
            domain = computerName;
        }
        else
        {
            domain = ".";  // Local machine indicator
        }
    }

    password = pass;
    crypto::secureWipe(pass);

    Logger::info("Credentials retrieved for credential provider, user: " + username);
    return true;
}

void reportUnlockResult(bool success, const std::string& errorMessage)
{
    std::lock_guard<std::mutex> lock(g_unlockResultMutex);
    g_lastUnlockSuccess = success;
    g_lastUnlockError = errorMessage;

    if (success)
    {
        Logger::info("Credential provider unlock succeeded");
    }
    else
    {
        Logger::warn("Credential provider unlock failed: " + errorMessage);
    }
}

std::string getLastUnlockError()
{
    std::lock_guard<std::mutex> lock(g_unlockResultMutex);
    return g_lastUnlockError;
}

} // namespace unlock

} // namespace platform
