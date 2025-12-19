/**
 * Linux Platform Implementation
 *
 * Implements platform-specific functions for Linux including:
 * - libsecret integration for secure credential storage
 * - D-Bus/loginctl for session lock detection
 * - systemd service management
 * - PAM for authentication
 */

#include "platform.h"

#if !PLATFORM_LINUX
#error "This file should only be compiled for Linux"
#endif

#include "crypto.h"
#include <pwd.h>
#include <unistd.h>
#include <sys/types.h>
#include <sys/stat.h>
#include <sys/wait.h>
#include <thread>
#include <chrono>
#include <array>
#include <fstream>
#include <cstring>
#include <cstdlib>

// Optional libsecret support
#ifdef HAVE_LIBSECRET
#include <libsecret/secret.h>
#endif

namespace platform {

// ============================================================================
// Basic Platform Functions
// ============================================================================

std::string getCurrentUsername()
{
    // Try LOGNAME first (common on Linux)
    const char* logname = getenv("LOGNAME");
    if (logname && strlen(logname) > 0)
    {
        return logname;
    }

    // Try USER
    const char* user = getenv("USER");
    if (user && strlen(user) > 0)
    {
        return user;
    }

    // Fall back to passwd entry
    struct passwd* pw = getpwuid(getuid());
    if (pw)
    {
        return pw->pw_name;
    }

    // Last resort - try loginctl to get active session user
    auto result = executeCommand("loginctl list-sessions --no-legend | head -1 | awk '{print $3}'", 5000);
    if (result.exitCode == 0 && !result.stdoutData.empty())
    {
        // Trim whitespace
        std::string username = result.stdoutData;
        username.erase(username.find_last_not_of(" \n\r\t") + 1);
        if (!username.empty())
        {
            return username;
        }
    }

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
    return home + "/.config/screencontrol";
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
// Service Lifecycle (systemd)
// ============================================================================

namespace service {

bool install()
{
    // Service installation handled by installer script
    // Copy systemd unit file to /etc/systemd/system/
    return true;
}

bool uninstall()
{
    // Service uninstallation handled by uninstaller script
    return true;
}

bool start()
{
    auto result = executeCommand("systemctl start screencontrol", 10000);
    return result.exitCode == 0;
}

bool stop()
{
    auto result = executeCommand("systemctl stop screencontrol", 10000);
    return result.exitCode == 0;
}

bool isRunning()
{
    auto result = executeCommand("systemctl is-active screencontrol", 5000);
    return result.exitCode == 0 && result.stdoutData.find("active") != std::string::npos;
}

} // namespace service

// ============================================================================
// Secure Storage (libsecret or file-based fallback)
// ============================================================================

namespace secure_storage {

#ifdef HAVE_LIBSECRET

// libsecret schema for ScreenControl
static const SecretSchema SCREENCONTROL_SCHEMA = {
    "com.screencontrol.service",
    SECRET_SCHEMA_NONE,
    {
        {"key_id", SECRET_SCHEMA_ATTRIBUTE_STRING},
        {NULL, SECRET_SCHEMA_ATTRIBUTE_STRING}
    }
};

bool storeKey(const std::string& keyId, const std::vector<uint8_t>& keyData)
{
    // Encode key data as base64 for storage
    std::string encodedData;
    static const char* base64_chars =
        "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

    size_t i = 0;
    size_t j = 0;
    uint8_t array3[3];
    uint8_t array4[4];

    for (uint8_t byte : keyData)
    {
        array3[i++] = byte;
        if (i == 3)
        {
            array4[0] = (array3[0] & 0xfc) >> 2;
            array4[1] = ((array3[0] & 0x03) << 4) + ((array3[1] & 0xf0) >> 4);
            array4[2] = ((array3[1] & 0x0f) << 2) + ((array3[2] & 0xc0) >> 6);
            array4[3] = array3[2] & 0x3f;
            for (i = 0; i < 4; i++)
                encodedData += base64_chars[array4[i]];
            i = 0;
        }
    }

    if (i)
    {
        for (j = i; j < 3; j++)
            array3[j] = 0;
        array4[0] = (array3[0] & 0xfc) >> 2;
        array4[1] = ((array3[0] & 0x03) << 4) + ((array3[1] & 0xf0) >> 4);
        array4[2] = ((array3[1] & 0x0f) << 2) + ((array3[2] & 0xc0) >> 6);
        for (j = 0; j < i + 1; j++)
            encodedData += base64_chars[array4[j]];
        while (i++ < 3)
            encodedData += '=';
    }

    GError* error = nullptr;
    bool success = secret_password_store_sync(
        &SCREENCONTROL_SCHEMA,
        SECRET_COLLECTION_DEFAULT,
        ("ScreenControl: " + keyId).c_str(),
        encodedData.c_str(),
        nullptr,  // GCancellable
        &error,
        "key_id", keyId.c_str(),
        NULL
    );

    if (error)
    {
        g_error_free(error);
        return false;
    }

    return success;
}

std::vector<uint8_t> retrieveKey(const std::string& keyId)
{
    std::vector<uint8_t> result;

    GError* error = nullptr;
    gchar* password = secret_password_lookup_sync(
        &SCREENCONTROL_SCHEMA,
        nullptr,  // GCancellable
        &error,
        "key_id", keyId.c_str(),
        NULL
    );

    if (error)
    {
        g_error_free(error);
        return result;
    }

    if (!password)
    {
        return result;
    }

    // Decode base64
    std::string encoded(password);
    secret_password_free(password);

    static const std::string base64_chars =
        "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

    auto is_base64 = [](unsigned char c) { return (isalnum(c) || c == '+' || c == '/'); };

    size_t in_len = encoded.size();
    size_t i = 0;
    size_t in_ = 0;
    uint8_t array4[4], array3[3];

    while (in_len-- && encoded[in_] != '=' && is_base64(encoded[in_]))
    {
        array4[i++] = encoded[in_++];
        if (i == 4)
        {
            for (i = 0; i < 4; i++)
                array4[i] = base64_chars.find(array4[i]);
            array3[0] = (array4[0] << 2) + ((array4[1] & 0x30) >> 4);
            array3[1] = ((array4[1] & 0xf) << 4) + ((array4[2] & 0x3c) >> 2);
            array3[2] = ((array4[2] & 0x3) << 6) + array4[3];
            for (i = 0; i < 3; i++)
                result.push_back(array3[i]);
            i = 0;
        }
    }

    if (i)
    {
        for (size_t j = i; j < 4; j++)
            array4[j] = 0;
        for (size_t j = 0; j < 4; j++)
            array4[j] = base64_chars.find(array4[j]);
        array3[0] = (array4[0] << 2) + ((array4[1] & 0x30) >> 4);
        array3[1] = ((array4[1] & 0xf) << 4) + ((array4[2] & 0x3c) >> 2);
        for (size_t j = 0; j < i - 1; j++)
            result.push_back(array3[j]);
    }

    return result;
}

bool deleteKey(const std::string& keyId)
{
    GError* error = nullptr;
    bool success = secret_password_clear_sync(
        &SCREENCONTROL_SCHEMA,
        nullptr,  // GCancellable
        &error,
        "key_id", keyId.c_str(),
        NULL
    );

    if (error)
    {
        g_error_free(error);
        return false;
    }

    return success;
}

bool keyExists(const std::string& keyId)
{
    GError* error = nullptr;
    gchar* password = secret_password_lookup_sync(
        &SCREENCONTROL_SCHEMA,
        nullptr,
        &error,
        "key_id", keyId.c_str(),
        NULL
    );

    if (error)
    {
        g_error_free(error);
        return false;
    }

    bool exists = (password != nullptr);
    if (password)
    {
        secret_password_free(password);
    }

    return exists;
}

#else  // Fallback without libsecret - use protected files

// File-based secure storage (less secure, but works without libsecret)
static std::string getSecureStoragePath(const std::string& keyId)
{
    return std::string(SERVICE_CONFIG_DIR) + "/keys/" + keyId + ".key";
}

bool storeKey(const std::string& keyId, const std::vector<uint8_t>& keyData)
{
    std::string dir = std::string(SERVICE_CONFIG_DIR) + "/keys";
    mkdir(dir.c_str(), 0700);

    std::string path = getSecureStoragePath(keyId);
    std::ofstream file(path, std::ios::binary | std::ios::trunc);
    if (!file)
    {
        return false;
    }

    file.write(reinterpret_cast<const char*>(keyData.data()), keyData.size());
    file.close();

    // Set restrictive permissions (owner only)
    chmod(path.c_str(), 0600);

    return true;
}

std::vector<uint8_t> retrieveKey(const std::string& keyId)
{
    std::vector<uint8_t> result;

    std::string path = getSecureStoragePath(keyId);
    std::ifstream file(path, std::ios::binary);
    if (!file)
    {
        return result;
    }

    result.assign((std::istreambuf_iterator<char>(file)),
                   std::istreambuf_iterator<char>());

    return result;
}

bool deleteKey(const std::string& keyId)
{
    std::string path = getSecureStoragePath(keyId);
    return unlink(path.c_str()) == 0 || errno == ENOENT;
}

bool keyExists(const std::string& keyId)
{
    std::string path = getSecureStoragePath(keyId);
    struct stat st;
    return stat(path.c_str(), &st) == 0;
}

#endif  // HAVE_LIBSECRET

} // namespace secure_storage

// ============================================================================
// Machine Unlock
// ============================================================================

namespace unlock {

// Key IDs for stored credentials
static const char* CRED_KEY_ID = "unlock_credentials";
static const char* CRED_K1_KEY_ID = "unlock_k1";

// Get active graphical session (for lock detection)
static std::string getActiveSession()
{
    // Try to get active session from loginctl
    auto result = executeCommand(
        "loginctl list-sessions --no-legend | grep -E '(seat|tty)' | head -1 | awk '{print $1}'",
        5000
    );

    if (result.exitCode == 0 && !result.stdoutData.empty())
    {
        std::string session = result.stdoutData;
        session.erase(session.find_last_not_of(" \n\r\t") + 1);
        return session;
    }

    return "";
}

bool isLocked()
{
    // Method 1: Check loginctl for session lock state
    std::string session = getActiveSession();
    if (!session.empty())
    {
        auto result = executeCommand(
            "loginctl show-session " + session + " -p LockedHint --value",
            5000
        );
        if (result.exitCode == 0)
        {
            std::string locked = result.stdoutData;
            locked.erase(locked.find_last_not_of(" \n\r\t") + 1);
            if (locked == "yes")
            {
                return true;
            }
        }
    }

    // Method 2: Check D-Bus screensaver status (GNOME)
    auto gnomeResult = executeCommand(
        "dbus-send --session --dest=org.gnome.ScreenSaver --type=method_call "
        "--print-reply /org/gnome/ScreenSaver org.gnome.ScreenSaver.GetActive 2>/dev/null | grep boolean",
        5000
    );
    if (gnomeResult.exitCode == 0 && gnomeResult.stdoutData.find("true") != std::string::npos)
    {
        return true;
    }

    // Method 3: Check D-Bus screensaver status (KDE)
    auto kdeResult = executeCommand(
        "dbus-send --session --dest=org.freedesktop.ScreenSaver --type=method_call "
        "--print-reply /ScreenSaver org.freedesktop.ScreenSaver.GetActive 2>/dev/null | grep boolean",
        5000
    );
    if (kdeResult.exitCode == 0 && kdeResult.stdoutData.find("true") != std::string::npos)
    {
        return true;
    }

    // Method 4: Check if login screen is active (gdm, lightdm, etc.)
    auto dmResult = executeCommand(
        "who | grep -E '(:0|tty[0-9])' | wc -l",
        5000
    );
    if (dmResult.exitCode == 0)
    {
        std::string count = dmResult.stdoutData;
        count.erase(count.find_last_not_of(" \n\r\t") + 1);
        if (count == "0")
        {
            return true;  // No active graphical sessions
        }
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

    // Securely wipe k2
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

    // Attempt unlock using loginctl
    std::string session = getActiveSession();
    if (!session.empty())
    {
        // Unlock the session (requires appropriate privileges)
        auto result = executeCommand("loginctl unlock-session " + session, 5000);

        // Also try to deactivate screensaver via D-Bus
        executeCommand(
            "dbus-send --session --dest=org.gnome.ScreenSaver --type=method_call "
            "/org/gnome/ScreenSaver org.gnome.ScreenSaver.SetActive boolean:false 2>/dev/null",
            5000
        );
        executeCommand(
            "dbus-send --session --dest=org.freedesktop.ScreenSaver --type=method_call "
            "/ScreenSaver org.freedesktop.ScreenSaver.SetActive boolean:false 2>/dev/null",
            5000
        );
    }

    // Clear password
    crypto::secureWipe(password);

    // Wait a moment and check if unlock succeeded
    sleepMs(2000);

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

    // Split the key into K1 (secure storage) and K2 (file)
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

    // Wipe the original key
    crypto::secureWipe(encryptionKey);

    // Write K2 to protected file
    std::string configDir = SERVICE_CONFIG_DIR;
    mkdir(configDir.c_str(), 0755);

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
        unlink(CREDENTIAL_KEY_PATH);
        return false;
    }

    // Wipe K2 from memory
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

    // Store encrypted credentials and K1 in secure storage
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
    // Delete from secure storage
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

// VNC password functions - not implemented on Linux
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

// Credential Provider functions - Windows only, stubs for Linux
void setUnlockPending(bool /* pending */)
{
    // Not implemented on Linux
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
    // Not implemented on Linux
}

std::string getLastUnlockError()
{
    return "";
}

} // namespace unlock

} // namespace platform
