/**
 * Cryptographic Utilities Implementation
 *
 * AES-256-GCM encryption using OpenSSL.
 */

#include "crypto.h"
#include <openssl/evp.h>
#include <openssl/rand.h>
#include <openssl/bio.h>
#include <openssl/buffer.h>
#include <cstring>
#include <stdexcept>

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
    if (RAND_bytes(bytes.data(), static_cast<int>(length)) != 1)
    {
        throw std::runtime_error("Failed to generate random bytes");
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

    EVP_CIPHER_CTX* ctx = EVP_CIPHER_CTX_new();
    if (!ctx)
    {
        throw std::runtime_error("Failed to create cipher context");
    }

    int len = 0;
    int ciphertextLen = 0;

    try
    {
        // Initialize encryption
        if (EVP_EncryptInit_ex(ctx, EVP_aes_256_gcm(), nullptr, nullptr, nullptr) != 1)
        {
            throw std::runtime_error("Failed to initialize encryption");
        }

        // Set IV length
        if (EVP_CIPHER_CTX_ctrl(ctx, EVP_CTRL_GCM_SET_IVLEN, GCM_IV_SIZE, nullptr) != 1)
        {
            throw std::runtime_error("Failed to set IV length");
        }

        // Initialize key and IV
        if (EVP_EncryptInit_ex(ctx, nullptr, nullptr, key.data(), result.iv.data()) != 1)
        {
            throw std::runtime_error("Failed to set key and IV");
        }

        // Provide AAD if present
        if (!aad.empty())
        {
            if (EVP_EncryptUpdate(ctx, nullptr, &len, aad.data(), static_cast<int>(aad.size())) != 1)
            {
                throw std::runtime_error("Failed to set AAD");
            }
        }

        // Encrypt plaintext
        if (EVP_EncryptUpdate(ctx, result.ciphertext.data(), &len,
                              plaintext.data(), static_cast<int>(plaintext.size())) != 1)
        {
            throw std::runtime_error("Failed to encrypt");
        }
        ciphertextLen = len;

        // Finalize encryption
        if (EVP_EncryptFinal_ex(ctx, result.ciphertext.data() + len, &len) != 1)
        {
            throw std::runtime_error("Failed to finalize encryption");
        }
        ciphertextLen += len;
        result.ciphertext.resize(ciphertextLen);

        // Get auth tag
        if (EVP_CIPHER_CTX_ctrl(ctx, EVP_CTRL_GCM_GET_TAG, GCM_TAG_SIZE, result.authTag.data()) != 1)
        {
            throw std::runtime_error("Failed to get auth tag");
        }

        EVP_CIPHER_CTX_free(ctx);
    }
    catch (...)
    {
        EVP_CIPHER_CTX_free(ctx);
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

    EVP_CIPHER_CTX* ctx = EVP_CIPHER_CTX_new();
    if (!ctx)
    {
        throw std::runtime_error("Failed to create cipher context");
    }

    int len = 0;
    int plaintextLen = 0;

    try
    {
        // Initialize decryption
        if (EVP_DecryptInit_ex(ctx, EVP_aes_256_gcm(), nullptr, nullptr, nullptr) != 1)
        {
            throw std::runtime_error("Failed to initialize decryption");
        }

        // Set IV length
        if (EVP_CIPHER_CTX_ctrl(ctx, EVP_CTRL_GCM_SET_IVLEN, static_cast<int>(data.iv.size()), nullptr) != 1)
        {
            throw std::runtime_error("Failed to set IV length");
        }

        // Initialize key and IV
        if (EVP_DecryptInit_ex(ctx, nullptr, nullptr, key.data(), data.iv.data()) != 1)
        {
            throw std::runtime_error("Failed to set key and IV");
        }

        // Provide AAD if present
        if (!aad.empty())
        {
            if (EVP_DecryptUpdate(ctx, nullptr, &len, aad.data(), static_cast<int>(aad.size())) != 1)
            {
                throw std::runtime_error("Failed to set AAD");
            }
        }

        // Decrypt ciphertext
        if (EVP_DecryptUpdate(ctx, plaintext.data(), &len,
                              data.ciphertext.data(), static_cast<int>(data.ciphertext.size())) != 1)
        {
            throw std::runtime_error("Failed to decrypt");
        }
        plaintextLen = len;

        // Set expected tag
        if (EVP_CIPHER_CTX_ctrl(ctx, EVP_CTRL_GCM_SET_TAG, static_cast<int>(data.authTag.size()),
                                const_cast<uint8_t*>(data.authTag.data())) != 1)
        {
            throw std::runtime_error("Failed to set auth tag");
        }

        // Verify tag and finalize - this will fail if tag doesn't match
        int ret = EVP_DecryptFinal_ex(ctx, plaintext.data() + len, &len);
        EVP_CIPHER_CTX_free(ctx);

        if (ret <= 0)
        {
            // Authentication failed - data tampered or wrong key
            secureWipe(plaintext);
            return {};
        }

        plaintextLen += len;
        plaintext.resize(plaintextLen);
    }
    catch (...)
    {
        EVP_CIPHER_CTX_free(ctx);
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
        OPENSSL_cleanse(ptr, len);
    }
}

void secureWipe(std::vector<uint8_t>& data)
{
    if (!data.empty())
    {
        OPENSSL_cleanse(data.data(), data.size());
        data.clear();
    }
}

void secureWipe(std::string& str)
{
    if (!str.empty())
    {
        OPENSSL_cleanse(&str[0], str.size());
        str.clear();
    }
}

// ============================================================================
// Base64 encoding/decoding
// ============================================================================

std::string base64Encode(const std::vector<uint8_t>& data)
{
    if (data.empty()) return "";

    BIO* bio = BIO_new(BIO_s_mem());
    BIO* b64 = BIO_new(BIO_f_base64());
    BIO_set_flags(b64, BIO_FLAGS_BASE64_NO_NL);
    bio = BIO_push(b64, bio);

    BIO_write(bio, data.data(), static_cast<int>(data.size()));
    BIO_flush(bio);

    BUF_MEM* bufPtr;
    BIO_get_mem_ptr(bio, &bufPtr);

    std::string result(bufPtr->data, bufPtr->length);
    BIO_free_all(bio);

    return result;
}

std::vector<uint8_t> base64Decode(const std::string& encoded)
{
    if (encoded.empty()) return {};

    // Calculate decoded length (approximate)
    size_t decodedLen = (encoded.size() * 3) / 4;
    std::vector<uint8_t> result(decodedLen);

    BIO* bio = BIO_new_mem_buf(encoded.data(), static_cast<int>(encoded.size()));
    BIO* b64 = BIO_new(BIO_f_base64());
    BIO_set_flags(b64, BIO_FLAGS_BASE64_NO_NL);
    bio = BIO_push(b64, bio);

    int len = BIO_read(bio, result.data(), static_cast<int>(result.size()));
    BIO_free_all(bio);

    if (len > 0)
    {
        result.resize(len);
    }
    else
    {
        result.clear();
    }

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
