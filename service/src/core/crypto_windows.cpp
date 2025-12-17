/**
 * Windows Cryptographic Utilities Implementation
 *
 * AES-256-GCM encryption using Windows bcrypt API.
 */

#include "crypto.h"

#if PLATFORM_WINDOWS

#include <windows.h>
#include <bcrypt.h>
#include <wincrypt.h>
#include <cstring>
#include <stdexcept>
#include <random>

#pragma comment(lib, "bcrypt.lib")

namespace crypto {

// Constants
constexpr size_t AES_KEY_SIZE = 32;      // 256 bits
constexpr size_t GCM_IV_SIZE = 12;       // 96 bits (recommended for GCM)
constexpr size_t GCM_TAG_SIZE = 16;      // 128 bits

// ============================================================================
// EncryptedData serialization
// ============================================================================

std::vector<uint8_t> EncryptedData::serialize() const
{
    if (!isValid()) return {};

    std::vector<uint8_t> result;
    result.reserve(2 + iv.size() + authTag.size() + ciphertext.size());

    // Format: [iv_len(1)][iv][tag_len(1)][tag][ciphertext]
    result.push_back(static_cast<uint8_t>(iv.size()));
    result.insert(result.end(), iv.begin(), iv.end());

    result.push_back(static_cast<uint8_t>(authTag.size()));
    result.insert(result.end(), authTag.begin(), authTag.end());

    result.insert(result.end(), ciphertext.begin(), ciphertext.end());

    return result;
}

EncryptedData EncryptedData::deserialize(const std::vector<uint8_t>& blob)
{
    EncryptedData data;

    if (blob.size() < 2) return data;

    size_t pos = 0;

    // Read IV
    uint8_t ivLen = blob[pos++];
    if (pos + ivLen > blob.size()) return data;
    data.iv.assign(blob.begin() + pos, blob.begin() + pos + ivLen);
    pos += ivLen;

    // Read tag
    if (pos >= blob.size()) return data;
    uint8_t tagLen = blob[pos++];
    if (pos + tagLen > blob.size()) return data;
    data.authTag.assign(blob.begin() + pos, blob.begin() + pos + tagLen);
    pos += tagLen;

    // Rest is ciphertext
    data.ciphertext.assign(blob.begin() + pos, blob.end());

    return data;
}

bool EncryptedData::isValid() const
{
    return !iv.empty() && !authTag.empty() && !ciphertext.empty();
}

// ============================================================================
// Random generation
// ============================================================================

std::vector<uint8_t> randomBytes(size_t length)
{
    std::vector<uint8_t> bytes(length);

    BCRYPT_ALG_HANDLE hAlg = nullptr;
    NTSTATUS status = BCryptOpenAlgorithmProvider(&hAlg, BCRYPT_RNG_ALGORITHM, nullptr, 0);

    if (BCRYPT_SUCCESS(status))
    {
        status = BCryptGenRandom(hAlg, bytes.data(), static_cast<ULONG>(length), 0);
        BCryptCloseAlgorithmProvider(hAlg, 0);
    }

    if (!BCRYPT_SUCCESS(status))
    {
        // Fallback to CryptoAPI
        HCRYPTPROV hProv = 0;
        if (CryptAcquireContext(&hProv, nullptr, nullptr, PROV_RSA_AES, CRYPT_VERIFYCONTEXT))
        {
            CryptGenRandom(hProv, static_cast<DWORD>(length), bytes.data());
            CryptReleaseContext(hProv, 0);
        }
        else
        {
            throw std::runtime_error("Failed to generate random bytes");
        }
    }

    return bytes;
}

std::vector<uint8_t> generateKey()
{
    return randomBytes(AES_KEY_SIZE);
}

// ============================================================================
// Key splitting
// ============================================================================

SplitKey splitKey(const std::vector<uint8_t>& key)
{
    if (key.size() != AES_KEY_SIZE)
    {
        throw std::invalid_argument("Key must be 32 bytes for AES-256");
    }

    SplitKey split;
    split.k1 = randomBytes(AES_KEY_SIZE);
    split.k2.resize(AES_KEY_SIZE);

    // K2 = K XOR K1, so K = K1 XOR K2
    for (size_t i = 0; i < AES_KEY_SIZE; i++)
    {
        split.k2[i] = key[i] ^ split.k1[i];
    }

    return split;
}

std::vector<uint8_t> combineKey(const std::vector<uint8_t>& k1,
                                 const std::vector<uint8_t>& k2)
{
    if (k1.size() != AES_KEY_SIZE || k2.size() != AES_KEY_SIZE)
    {
        throw std::invalid_argument("Key fragments must be 32 bytes each");
    }

    std::vector<uint8_t> key(AES_KEY_SIZE);
    for (size_t i = 0; i < AES_KEY_SIZE; i++)
    {
        key[i] = k1[i] ^ k2[i];
    }
    return key;
}

// ============================================================================
// AES-256-GCM Encryption
// ============================================================================

EncryptedData encrypt(const std::vector<uint8_t>& key,
                      const std::vector<uint8_t>& plaintext,
                      const std::vector<uint8_t>& aad)
{
    if (key.size() != AES_KEY_SIZE)
    {
        throw std::invalid_argument("Key must be 32 bytes for AES-256");
    }

    EncryptedData result;
    result.iv = randomBytes(GCM_IV_SIZE);
    result.authTag.resize(GCM_TAG_SIZE);
    result.ciphertext.resize(plaintext.size());

    BCRYPT_ALG_HANDLE hAlg = nullptr;
    BCRYPT_KEY_HANDLE hKey = nullptr;

    try
    {
        // Open algorithm provider
        NTSTATUS status = BCryptOpenAlgorithmProvider(&hAlg, BCRYPT_AES_ALGORITHM, nullptr, 0);
        if (!BCRYPT_SUCCESS(status))
        {
            throw std::runtime_error("Failed to open AES algorithm provider");
        }

        // Set chaining mode to GCM
        status = BCryptSetProperty(hAlg, BCRYPT_CHAINING_MODE,
                                   (PUCHAR)BCRYPT_CHAIN_MODE_GCM,
                                   sizeof(BCRYPT_CHAIN_MODE_GCM), 0);
        if (!BCRYPT_SUCCESS(status))
        {
            throw std::runtime_error("Failed to set GCM mode");
        }

        // Generate key
        status = BCryptGenerateSymmetricKey(hAlg, &hKey, nullptr, 0,
                                             (PUCHAR)key.data(), static_cast<ULONG>(key.size()), 0);
        if (!BCRYPT_SUCCESS(status))
        {
            throw std::runtime_error("Failed to generate symmetric key");
        }

        // Set up auth info
        BCRYPT_AUTHENTICATED_CIPHER_MODE_INFO authInfo;
        BCRYPT_INIT_AUTH_MODE_INFO(authInfo);
        authInfo.pbNonce = result.iv.data();
        authInfo.cbNonce = static_cast<ULONG>(result.iv.size());
        authInfo.pbTag = result.authTag.data();
        authInfo.cbTag = static_cast<ULONG>(result.authTag.size());

        if (!aad.empty())
        {
            authInfo.pbAuthData = const_cast<PUCHAR>(aad.data());
            authInfo.cbAuthData = static_cast<ULONG>(aad.size());
        }

        // Encrypt
        ULONG cbResult = 0;
        status = BCryptEncrypt(hKey,
                               (PUCHAR)plaintext.data(), static_cast<ULONG>(plaintext.size()),
                               &authInfo,
                               nullptr, 0,
                               result.ciphertext.data(), static_cast<ULONG>(result.ciphertext.size()),
                               &cbResult, 0);
        if (!BCRYPT_SUCCESS(status))
        {
            throw std::runtime_error("Encryption failed");
        }
        result.ciphertext.resize(cbResult);

        BCryptDestroyKey(hKey);
        BCryptCloseAlgorithmProvider(hAlg, 0);
    }
    catch (...)
    {
        if (hKey) BCryptDestroyKey(hKey);
        if (hAlg) BCryptCloseAlgorithmProvider(hAlg, 0);
        throw;
    }

    return result;
}

EncryptedData encrypt(const std::vector<uint8_t>& key,
                      const std::string& plaintext,
                      const std::vector<uint8_t>& aad)
{
    std::vector<uint8_t> data(plaintext.begin(), plaintext.end());
    auto result = encrypt(key, data, aad);
    secureWipe(data);
    return result;
}

// ============================================================================
// AES-256-GCM Decryption
// ============================================================================

std::vector<uint8_t> decrypt(const std::vector<uint8_t>& key,
                              const EncryptedData& data,
                              const std::vector<uint8_t>& aad)
{
    if (key.size() != AES_KEY_SIZE)
    {
        throw std::invalid_argument("Key must be 32 bytes for AES-256");
    }

    if (!data.isValid())
    {
        return {};
    }

    std::vector<uint8_t> plaintext(data.ciphertext.size());

    BCRYPT_ALG_HANDLE hAlg = nullptr;
    BCRYPT_KEY_HANDLE hKey = nullptr;

    try
    {
        // Open algorithm provider
        NTSTATUS status = BCryptOpenAlgorithmProvider(&hAlg, BCRYPT_AES_ALGORITHM, nullptr, 0);
        if (!BCRYPT_SUCCESS(status))
        {
            throw std::runtime_error("Failed to open AES algorithm provider");
        }

        // Set chaining mode to GCM
        status = BCryptSetProperty(hAlg, BCRYPT_CHAINING_MODE,
                                   (PUCHAR)BCRYPT_CHAIN_MODE_GCM,
                                   sizeof(BCRYPT_CHAIN_MODE_GCM), 0);
        if (!BCRYPT_SUCCESS(status))
        {
            throw std::runtime_error("Failed to set GCM mode");
        }

        // Generate key
        status = BCryptGenerateSymmetricKey(hAlg, &hKey, nullptr, 0,
                                             (PUCHAR)key.data(), static_cast<ULONG>(key.size()), 0);
        if (!BCRYPT_SUCCESS(status))
        {
            throw std::runtime_error("Failed to generate symmetric key");
        }

        // Set up auth info
        BCRYPT_AUTHENTICATED_CIPHER_MODE_INFO authInfo;
        BCRYPT_INIT_AUTH_MODE_INFO(authInfo);
        authInfo.pbNonce = const_cast<PUCHAR>(data.iv.data());
        authInfo.cbNonce = static_cast<ULONG>(data.iv.size());
        authInfo.pbTag = const_cast<PUCHAR>(data.authTag.data());
        authInfo.cbTag = static_cast<ULONG>(data.authTag.size());

        if (!aad.empty())
        {
            authInfo.pbAuthData = const_cast<PUCHAR>(aad.data());
            authInfo.cbAuthData = static_cast<ULONG>(aad.size());
        }

        // Decrypt
        ULONG cbResult = 0;
        status = BCryptDecrypt(hKey,
                               (PUCHAR)data.ciphertext.data(), static_cast<ULONG>(data.ciphertext.size()),
                               &authInfo,
                               nullptr, 0,
                               plaintext.data(), static_cast<ULONG>(plaintext.size()),
                               &cbResult, 0);

        BCryptDestroyKey(hKey);
        BCryptCloseAlgorithmProvider(hAlg, 0);

        if (!BCRYPT_SUCCESS(status))
        {
            // Authentication failed
            secureWipe(plaintext);
            return {};
        }
        plaintext.resize(cbResult);
    }
    catch (...)
    {
        if (hKey) BCryptDestroyKey(hKey);
        if (hAlg) BCryptCloseAlgorithmProvider(hAlg, 0);
        secureWipe(plaintext);
        throw;
    }

    return plaintext;
}

std::string decryptToString(const std::vector<uint8_t>& key,
                            const EncryptedData& data,
                            const std::vector<uint8_t>& aad)
{
    auto plaintext = decrypt(key, data, aad);
    if (plaintext.empty()) return "";

    std::string result(plaintext.begin(), plaintext.end());
    secureWipe(plaintext);
    return result;
}

// ============================================================================
// Secure memory wiping
// ============================================================================

void secureWipe(void* ptr, size_t len)
{
    if (ptr && len > 0)
    {
        SecureZeroMemory(ptr, len);
    }
}

void secureWipe(std::vector<uint8_t>& data)
{
    if (!data.empty())
    {
        SecureZeroMemory(data.data(), data.size());
        data.clear();
    }
}

void secureWipe(std::string& str)
{
    if (!str.empty())
    {
        SecureZeroMemory(&str[0], str.size());
        str.clear();
    }
}

// ============================================================================
// Base64 encoding/decoding
// ============================================================================

std::string base64Encode(const std::vector<uint8_t>& data)
{
    if (data.empty()) return "";

    DWORD encodedLen = 0;
    CryptBinaryToStringA(data.data(), static_cast<DWORD>(data.size()),
                         CRYPT_STRING_BASE64 | CRYPT_STRING_NOCRLF,
                         nullptr, &encodedLen);

    std::string result(encodedLen, '\0');
    CryptBinaryToStringA(data.data(), static_cast<DWORD>(data.size()),
                         CRYPT_STRING_BASE64 | CRYPT_STRING_NOCRLF,
                         &result[0], &encodedLen);

    // Remove null terminator if present
    while (!result.empty() && result.back() == '\0')
    {
        result.pop_back();
    }

    return result;
}

std::vector<uint8_t> base64Decode(const std::string& encoded)
{
    if (encoded.empty()) return {};

    DWORD decodedLen = 0;
    CryptStringToBinaryA(encoded.c_str(), static_cast<DWORD>(encoded.size()),
                         CRYPT_STRING_BASE64,
                         nullptr, &decodedLen, nullptr, nullptr);

    std::vector<uint8_t> result(decodedLen);
    CryptStringToBinaryA(encoded.c_str(), static_cast<DWORD>(encoded.size()),
                         CRYPT_STRING_BASE64,
                         result.data(), &decodedLen, nullptr, nullptr);

    result.resize(decodedLen);
    return result;
}

// ============================================================================
// Constant-time comparison
// ============================================================================

bool constantTimeCompare(const std::vector<uint8_t>& a,
                         const std::vector<uint8_t>& b)
{
    if (a.size() != b.size()) return false;

    volatile uint8_t result = 0;
    for (size_t i = 0; i < a.size(); i++)
    {
        result |= a[i] ^ b[i];
    }
    return result == 0;
}

} // namespace crypto

#endif // PLATFORM_WINDOWS
