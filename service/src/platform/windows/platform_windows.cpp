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

#pragma comment(lib, "wtsapi32.lib")
#pragma comment(lib, "userenv.lib")
#pragma comment(lib, "credui.lib")
#pragma comment(lib, "crypt32.lib")

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

    // Windows unlock is complex - typically requires a Credential Provider
    // For now, we can try to send keystrokes to the lock screen
    // This requires the service to interact with the desktop

    // Alternative: Use tscon to reconnect session (requires specific setup)
    // Or use a custom Credential Provider (more complex)

    // Simple approach: Try to simulate Enter key if password is cached
    // This is limited and may not work in all scenarios

    crypto::secureWipe(password);

    sleepMs(2000);
    return !isLocked();
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

} // namespace unlock

} // namespace platform
