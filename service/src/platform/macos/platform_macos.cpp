/**
 * macOS Platform Implementation
 *
 * Implements platform-specific functions for macOS including:
 * - Keychain integration for secure credential storage
 * - Machine lock/unlock using IOKit and CGSession
 * - User session management
 */

#include "platform.h"

#if !PLATFORM_MACOS
#error "This file should only be compiled for macOS"
#endif

#include "crypto.h"
#include <Security/Security.h>
#include <CoreFoundation/CoreFoundation.h>
#include <IOKit/IOKitLib.h>
#include <IOKit/pwr_mgt/IOPMLib.h>
#include <ApplicationServices/ApplicationServices.h>
#include <pwd.h>
#include <unistd.h>
#include <sys/types.h>
#include <sys/sysctl.h>
#include <sys/stat.h>
#include <sys/wait.h>
#include <thread>
#include <chrono>
#include <array>
#include <fstream>
#include <cstring>

namespace platform {

// ============================================================================
// Basic Platform Functions
// ============================================================================

std::string getCurrentUsername()
{
    // Try getlogin first (active console user)
    const char* login = getlogin();
    if (login && strlen(login) > 0)
    {
        return login;
    }

    // Fall back to passwd entry
    struct passwd* pw = getpwuid(getuid());
    if (pw)
    {
        return pw->pw_name;
    }

    // Last resort - try SCDynamicStoreCopyConsoleUser (requires linking with SystemConfiguration)
    // For now, return empty string if we can't determine
    return "";
}

std::string getUserHomeDir(const std::string& username)
{
    if (username.empty())
    {
        // Current user
        const char* home = getenv("HOME");
        if (home)
        {
            return home;
        }

        struct passwd* pw = getpwuid(getuid());
        if (pw)
        {
            return pw->pw_dir;
        }
        return "";
    }

    // Specific user
    struct passwd* pw = getpwnam(username.c_str());
    if (pw)
    {
        return pw->pw_dir;
    }
    return "";
}

std::string getUserConfigDir(const std::string& username)
{
    std::string home = getUserHomeDir(username);
    if (home.empty())
    {
        return "";
    }
    return home + "/Library/Application Support/ScreenControl";
}

bool isRunningAsRoot()
{
    return geteuid() == 0;
}

int getProcessId()
{
    return static_cast<int>(getpid());
}

void sleepMs(int milliseconds)
{
    std::this_thread::sleep_for(std::chrono::milliseconds(milliseconds));
}

CommandResult executeCommand(const std::string& command, int timeoutMs)
{
    CommandResult result;
    result.exitCode = -1;

    // Create pipes for stdout and stderr
    int stdoutPipe[2];
    int stderrPipe[2];

    if (pipe(stdoutPipe) != 0 || pipe(stderrPipe) != 0)
    {
        result.stderrData = "Failed to create pipes";
        return result;
    }

    pid_t pid = fork();
    if (pid == -1)
    {
        result.stderrData = "Failed to fork process";
        close(stdoutPipe[0]);
        close(stdoutPipe[1]);
        close(stderrPipe[0]);
        close(stderrPipe[1]);
        return result;
    }

    if (pid == 0)
    {
        // Child process
        close(stdoutPipe[0]);
        close(stderrPipe[0]);

        dup2(stdoutPipe[1], STDOUT_FILENO);
        dup2(stderrPipe[1], STDERR_FILENO);

        close(stdoutPipe[1]);
        close(stderrPipe[1]);

        execl("/bin/sh", "sh", "-c", command.c_str(), nullptr);
        _exit(127);
    }

    // Parent process
    close(stdoutPipe[1]);
    close(stderrPipe[1]);

    // Read output with timeout
    auto startTime = std::chrono::steady_clock::now();
    std::array<char, 4096> buffer;
    bool timedOut = false;

    fd_set readSet;
    struct timeval tv;

    while (true)
    {
        auto elapsed = std::chrono::duration_cast<std::chrono::milliseconds>(
            std::chrono::steady_clock::now() - startTime).count();

        if (elapsed >= timeoutMs)
        {
            timedOut = true;
            kill(pid, SIGKILL);
            break;
        }

        FD_ZERO(&readSet);
        FD_SET(stdoutPipe[0], &readSet);
        FD_SET(stderrPipe[0], &readSet);

        int maxFd = std::max(stdoutPipe[0], stderrPipe[0]) + 1;
        tv.tv_sec = 0;
        tv.tv_usec = 100000;  // 100ms

        int ready = select(maxFd, &readSet, nullptr, nullptr, &tv);
        if (ready > 0)
        {
            if (FD_ISSET(stdoutPipe[0], &readSet))
            {
                ssize_t n = read(stdoutPipe[0], buffer.data(), buffer.size());
                if (n > 0)
                {
                    result.stdoutData.append(buffer.data(), n);
                }
            }
            if (FD_ISSET(stderrPipe[0], &readSet))
            {
                ssize_t n = read(stderrPipe[0], buffer.data(), buffer.size());
                if (n > 0)
                {
                    result.stderrData.append(buffer.data(), n);
                }
            }
        }

        // Check if child exited
        int status;
        pid_t w = waitpid(pid, &status, WNOHANG);
        if (w == pid)
        {
            // Read any remaining data
            ssize_t n;
            while ((n = read(stdoutPipe[0], buffer.data(), buffer.size())) > 0)
            {
                result.stdoutData.append(buffer.data(), n);
            }
            while ((n = read(stderrPipe[0], buffer.data(), buffer.size())) > 0)
            {
                result.stderrData.append(buffer.data(), n);
            }

            if (WIFEXITED(status))
            {
                result.exitCode = WEXITSTATUS(status);
            }
            break;
        }
    }

    close(stdoutPipe[0]);
    close(stderrPipe[0]);

    if (timedOut)
    {
        result.exitCode = -1;
        result.stderrData = "Command timed out after " + std::to_string(timeoutMs) + "ms";
        waitpid(pid, nullptr, 0);  // Reap the child
    }

    return result;
}

// ============================================================================
// Service Lifecycle
// ============================================================================

namespace service {

bool install()
{
    // Service installation is handled by the installer/launchctl
    // This is a no-op for macOS as LaunchDaemon handles it
    return true;
}

bool uninstall()
{
    // Service uninstallation is handled by the uninstaller
    return true;
}

bool start()
{
    auto result = executeCommand("launchctl load " SERVICE_PLIST_PATH, 10000);
    return result.exitCode == 0;
}

bool stop()
{
    auto result = executeCommand("launchctl unload " SERVICE_PLIST_PATH, 10000);
    return result.exitCode == 0;
}

bool isRunning()
{
    auto result = executeCommand("launchctl list | grep com.screencontrol.service", 5000);
    return result.exitCode == 0 && !result.stdoutData.empty();
}

} // namespace service

// ============================================================================
// Secure Storage (Keychain)
// ============================================================================

namespace secure_storage {

static const char* KEYCHAIN_SERVICE = "com.screencontrol.service";

bool storeKey(const std::string& keyId, const std::vector<uint8_t>& keyData)
{
    // Delete existing key if present
    deleteKey(keyId);

    // Create keychain item
    CFMutableDictionaryRef query = CFDictionaryCreateMutable(
        kCFAllocatorDefault,
        0,
        &kCFTypeDictionaryKeyCallBacks,
        &kCFTypeDictionaryValueCallBacks
    );

    CFDictionarySetValue(query, kSecClass, kSecClassGenericPassword);

    CFStringRef serviceRef = CFStringCreateWithCString(
        kCFAllocatorDefault,
        KEYCHAIN_SERVICE,
        kCFStringEncodingUTF8
    );
    CFDictionarySetValue(query, kSecAttrService, serviceRef);

    CFStringRef accountRef = CFStringCreateWithCString(
        kCFAllocatorDefault,
        keyId.c_str(),
        kCFStringEncodingUTF8
    );
    CFDictionarySetValue(query, kSecAttrAccount, accountRef);

    CFDataRef dataRef = CFDataCreate(
        kCFAllocatorDefault,
        keyData.data(),
        static_cast<CFIndex>(keyData.size())
    );
    CFDictionarySetValue(query, kSecValueData, dataRef);

    // Set access control - this key should only be accessible by this process
    CFDictionarySetValue(query, kSecAttrAccessible, kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly);

    OSStatus status = SecItemAdd(query, nullptr);

    CFRelease(serviceRef);
    CFRelease(accountRef);
    CFRelease(dataRef);
    CFRelease(query);

    return status == errSecSuccess;
}

std::vector<uint8_t> retrieveKey(const std::string& keyId)
{
    std::vector<uint8_t> result;

    CFMutableDictionaryRef query = CFDictionaryCreateMutable(
        kCFAllocatorDefault,
        0,
        &kCFTypeDictionaryKeyCallBacks,
        &kCFTypeDictionaryValueCallBacks
    );

    CFDictionarySetValue(query, kSecClass, kSecClassGenericPassword);

    CFStringRef serviceRef = CFStringCreateWithCString(
        kCFAllocatorDefault,
        KEYCHAIN_SERVICE,
        kCFStringEncodingUTF8
    );
    CFDictionarySetValue(query, kSecAttrService, serviceRef);

    CFStringRef accountRef = CFStringCreateWithCString(
        kCFAllocatorDefault,
        keyId.c_str(),
        kCFStringEncodingUTF8
    );
    CFDictionarySetValue(query, kSecAttrAccount, accountRef);

    CFDictionarySetValue(query, kSecReturnData, kCFBooleanTrue);
    CFDictionarySetValue(query, kSecMatchLimit, kSecMatchLimitOne);

    CFTypeRef resultData = nullptr;
    OSStatus status = SecItemCopyMatching(query, &resultData);

    if (status == errSecSuccess && resultData != nullptr)
    {
        CFDataRef dataRef = (CFDataRef)resultData;
        const UInt8* bytes = CFDataGetBytePtr(dataRef);
        CFIndex length = CFDataGetLength(dataRef);
        result.assign(bytes, bytes + length);
        CFRelease(resultData);
    }

    CFRelease(serviceRef);
    CFRelease(accountRef);
    CFRelease(query);

    return result;
}

bool deleteKey(const std::string& keyId)
{
    CFMutableDictionaryRef query = CFDictionaryCreateMutable(
        kCFAllocatorDefault,
        0,
        &kCFTypeDictionaryKeyCallBacks,
        &kCFTypeDictionaryValueCallBacks
    );

    CFDictionarySetValue(query, kSecClass, kSecClassGenericPassword);

    CFStringRef serviceRef = CFStringCreateWithCString(
        kCFAllocatorDefault,
        KEYCHAIN_SERVICE,
        kCFStringEncodingUTF8
    );
    CFDictionarySetValue(query, kSecAttrService, serviceRef);

    CFStringRef accountRef = CFStringCreateWithCString(
        kCFAllocatorDefault,
        keyId.c_str(),
        kCFStringEncodingUTF8
    );
    CFDictionarySetValue(query, kSecAttrAccount, accountRef);

    OSStatus status = SecItemDelete(query);

    CFRelease(serviceRef);
    CFRelease(accountRef);
    CFRelease(query);

    return status == errSecSuccess || status == errSecItemNotFound;
}

bool keyExists(const std::string& keyId)
{
    CFMutableDictionaryRef query = CFDictionaryCreateMutable(
        kCFAllocatorDefault,
        0,
        &kCFTypeDictionaryKeyCallBacks,
        &kCFTypeDictionaryValueCallBacks
    );

    CFDictionarySetValue(query, kSecClass, kSecClassGenericPassword);

    CFStringRef serviceRef = CFStringCreateWithCString(
        kCFAllocatorDefault,
        KEYCHAIN_SERVICE,
        kCFStringEncodingUTF8
    );
    CFDictionarySetValue(query, kSecAttrService, serviceRef);

    CFStringRef accountRef = CFStringCreateWithCString(
        kCFAllocatorDefault,
        keyId.c_str(),
        kCFStringEncodingUTF8
    );
    CFDictionarySetValue(query, kSecAttrAccount, accountRef);

    CFDictionarySetValue(query, kSecReturnRef, kCFBooleanFalse);
    CFDictionarySetValue(query, kSecMatchLimit, kSecMatchLimitOne);

    OSStatus status = SecItemCopyMatching(query, nullptr);

    CFRelease(serviceRef);
    CFRelease(accountRef);
    CFRelease(query);

    return status == errSecSuccess;
}

} // namespace secure_storage

// ============================================================================
// Machine Unlock
// ============================================================================

namespace unlock {

// Key IDs for stored credentials
static const char* CRED_KEY_ID = "unlock_credentials";
static const char* CRED_K1_KEY_ID = "unlock_k1";
static const char* VNC_PASSWORD_KEY_ID = "vnc_password";

// Path to VNC unlock script (installed by service)
static const char* VNC_UNLOCK_SCRIPT = "/usr/local/share/screencontrol/vnc_unlock.py";

// Helper to get console user
static std::string getConsoleUser()
{
    // Use CGSessionCopyCurrentDictionary to get console user info
    CFDictionaryRef sessionDict = CGSessionCopyCurrentDictionary();
    if (!sessionDict)
    {
        return "";
    }

    std::string username;
    CFStringRef userRef = (CFStringRef)CFDictionaryGetValue(sessionDict, kCGSessionUserNameKey);
    if (userRef)
    {
        char buffer[256];
        if (CFStringGetCString(userRef, buffer, sizeof(buffer), kCFStringEncodingUTF8))
        {
            username = buffer;
        }
    }

    CFRelease(sessionDict);
    return username;
}

bool isLocked()
{
    // Method 1: Check CGSession dictionary for screen lock status
    CFDictionaryRef sessionDict = CGSessionCopyCurrentDictionary();
    if (!sessionDict)
    {
        // No session dictionary - probably no GUI session at all
        return true;
    }

    // Check if screen is locked
    CFBooleanRef screenLockedRef = (CFBooleanRef)CFDictionaryGetValue(
        sessionDict,
        CFSTR("CGSSessionScreenIsLocked")
    );

    bool locked = false;
    if (screenLockedRef)
    {
        locked = CFBooleanGetValue(screenLockedRef);
    }

    // Also check if on login window
    if (!locked)
    {
        CFStringRef onConsole = (CFStringRef)CFDictionaryGetValue(
            sessionDict,
            kCGSessionOnConsoleKey
        );
        if (onConsole && CFStringCompare(onConsole, CFSTR("0"), 0) == kCFCompareEqualTo)
        {
            // User is not on console (probably at login window or fast user switched)
            locked = true;
        }
    }

    CFRelease(sessionDict);
    return locked;
}

// Helper to retrieve VNC password from keychain
static std::string getVncPassword()
{
    std::vector<uint8_t> vncPwData = secure_storage::retrieveKey(VNC_PASSWORD_KEY_ID);
    if (vncPwData.empty())
    {
        return "";
    }
    std::string vncPw(vncPwData.begin(), vncPwData.end());
    crypto::secureWipe(vncPwData);
    return vncPw;
}

// Helper to try VNC-based unlock (works at login window where osascript fails)
static bool tryVncUnlock(const std::string& unlockPassword)
{
    // Check if VNC unlock script exists
    struct stat st;
    if (stat(VNC_UNLOCK_SCRIPT, &st) != 0)
    {
        // Script not installed
        return false;
    }

    // Get VNC password from keychain
    std::string vncPassword = getVncPassword();
    if (vncPassword.empty())
    {
        // No VNC password stored
        return false;
    }

    // Check if Screen Sharing is available (port 5900)
    auto checkResult = executeCommand("netstat -an | grep 'LISTEN' | grep '\\.5900'", 5000);
    if (checkResult.exitCode != 0 || checkResult.stdoutData.empty())
    {
        // Screen Sharing not running
        crypto::secureWipe(vncPassword);
        return false;
    }

    // Build command to run VNC unlock script
    // Note: We use single quotes for the passwords to handle special characters
    std::string cmd = "python3 " + std::string(VNC_UNLOCK_SCRIPT) + " '" +
                      vncPassword + "' '" + unlockPassword + "'";

    // Clear VNC password
    crypto::secureWipe(vncPassword);

    // Execute VNC unlock
    auto result = executeCommand(cmd, 15000);

    // Clear command
    crypto::secureWipe(cmd);

    return result.exitCode == 0;
}

bool unlockWithStoredCredentials()
{
    // Check if we have stored credentials
    if (!hasStoredCredentials())
    {
        return false;
    }

    // Retrieve encrypted credentials and K1 from Keychain
    std::vector<uint8_t> encryptedBlob = secure_storage::retrieveKey(CRED_KEY_ID);
    std::vector<uint8_t> k1 = secure_storage::retrieveKey(CRED_K1_KEY_ID);

    if (encryptedBlob.empty() || k1.empty())
    {
        return false;
    }

    // Read K2 from file (split-key architecture)
    std::ifstream keyFile(CREDENTIAL_KEY_PATH, std::ios::binary);
    if (!keyFile)
    {
        return false;
    }

    std::vector<uint8_t> k2((std::istreambuf_iterator<char>(keyFile)),
                             std::istreambuf_iterator<char>());
    keyFile.close();

    if (k2.size() != 32)  // AES-256 key size
    {
        crypto::secureWipe(k2);
        return false;
    }

    // Reconstruct the full encryption key from K1 and K2
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

    // Securely wipe k2 (k1 is from Keychain, not sensitive here)
    crypto::secureWipe(k2);

    // Deserialize and decrypt using AES-256-GCM
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
        // Decryption failed (authentication tag mismatch)
        return false;
    }

    // Parse username and password (format: "username\0password")
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

    // Clear decrypted data
    crypto::secureWipe(decrypted);

    if (username.empty() || password.empty())
    {
        return false;
    }

    // Method 1: Attempt unlock using osascript (works for screensaver lock)
    // This simulates keystrokes at the login window
    std::string script = R"(
        tell application "System Events"
            keystroke ")" + password + R"("
            keystroke return
        end tell
    )";

    // Execute unlock script
    executeCommand("osascript -e '" + script + "'", 10000);

    // Clear script
    crypto::secureWipe(script);

    // Wait a moment and check if unlock succeeded
    sleepMs(2000);

    if (!isLocked())
    {
        crypto::secureWipe(password);
        return true;
    }

    // Method 2: Fall back to VNC-based unlock (works at login window)
    // osascript fails at the actual login screen due to macOS Secure Input mode
    // VNC operates at RFB protocol level and can bypass this restriction
    bool vncSuccess = tryVncUnlock(password);

    // Clear password
    crypto::secureWipe(password);

    if (vncSuccess)
    {
        // Wait for unlock to take effect
        sleepMs(2000);
    }

    return !isLocked();
}

bool storeUnlockCredentials(const std::string& username, const std::string& password)
{
    // Create credential data (format: "username\0password")
    std::vector<uint8_t> credData;
    credData.insert(credData.end(), username.begin(), username.end());
    credData.push_back('\0');
    credData.insert(credData.end(), password.begin(), password.end());

    // Generate a random AES-256 encryption key
    std::vector<uint8_t> encryptionKey;
    try
    {
        encryptionKey = crypto::generateKey();  // 32 bytes for AES-256
    }
    catch (...)
    {
        crypto::secureWipe(credData);
        return false;
    }

    // Split the key into K1 (Keychain) and K2 (file)
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

    // Wipe the original key - we only need K1 and K2 now
    crypto::secureWipe(encryptionKey);

    // Write K2 to protected file
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

    // Set restrictive permissions on K2 file
    chmod(CREDENTIAL_KEY_PATH, 0600);

    // Reconstruct key for encryption (need both halves)
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
        unlink(CREDENTIAL_KEY_PATH);
        return false;
    }

    // Wipe K2 from memory (it's now stored in file)
    crypto::secureWipe(splitKey.k2);

    // Encrypt credentials using AES-256-GCM
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
        unlink(CREDENTIAL_KEY_PATH);
        return false;
    }

    // Wipe plaintext credentials and full key
    crypto::secureWipe(credData);
    crypto::secureWipe(fullKey);

    // Serialize encrypted data for storage
    std::vector<uint8_t> encryptedBlob = encData.serialize();

    // Store encrypted credentials and K1 in Keychain
    bool success = secure_storage::storeKey(CRED_KEY_ID, encryptedBlob) &&
                   secure_storage::storeKey(CRED_K1_KEY_ID, splitKey.k1);

    // Wipe K1
    crypto::secureWipe(splitKey.k1);

    if (!success)
    {
        // Cleanup on failure
        secure_storage::deleteKey(CRED_KEY_ID);
        secure_storage::deleteKey(CRED_K1_KEY_ID);
        unlink(CREDENTIAL_KEY_PATH);
    }

    return success;
}

bool clearStoredCredentials()
{
    // Delete from keychain
    secure_storage::deleteKey(CRED_KEY_ID);
    secure_storage::deleteKey(CRED_K1_KEY_ID);

    // Delete key file
    unlink(CREDENTIAL_KEY_PATH);

    return true;
}

bool hasStoredCredentials()
{
    return secure_storage::keyExists(CRED_KEY_ID) &&
           secure_storage::keyExists(CRED_K1_KEY_ID);
}

bool storeVncPassword(const std::string& vncPassword)
{
    if (vncPassword.empty() || vncPassword.length() > 8)
    {
        // VNC passwords are limited to 8 characters
        return false;
    }

    std::vector<uint8_t> pwData(vncPassword.begin(), vncPassword.end());
    bool success = secure_storage::storeKey(VNC_PASSWORD_KEY_ID, pwData);
    crypto::secureWipe(pwData);
    return success;
}

bool clearVncPassword()
{
    return secure_storage::deleteKey(VNC_PASSWORD_KEY_ID);
}

bool hasVncPassword()
{
    return secure_storage::keyExists(VNC_PASSWORD_KEY_ID);
}

// Credential Provider functions - Windows only, stubs for macOS
void setUnlockPending(bool /* pending */)
{
    // Not implemented on macOS - uses VNC-based unlock instead
}

bool isUnlockPending()
{
    return false;
}

bool getCredentialsForProvider(std::string& /* username */, std::string& /* password */, std::string& /* domain */)
{
    return false;
}

void reportUnlockResult(bool /* success */, const std::string& /* errorMessage */)
{
    // Not implemented on macOS
}

std::string getLastUnlockError()
{
    return "";
}

} // namespace unlock

} // namespace platform
