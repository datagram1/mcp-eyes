/**
 * Linux Cryptographic Utilities - Stub Implementation
 *
 * Minimal implementation for cross-compilation without OpenSSL.
 * Uses /dev/urandom for random bytes, basic XOR for encryption.
 * This is NOT cryptographically secure - only for basic operation.
 * For production, build natively on Linux with OpenSSL.
 */

#include "crypto.h"

#if PLATFORM_LINUX

#include <cstring>
#include <fstream>
#include <stdexcept>
#include <random>

namespace crypto {

// Constants
constexpr size_t KEY_SIZE = 32;
constexpr size_t IV_SIZE = 12;
constexpr size_t TAG_SIZE = 16;

// ============================================================================
// EncryptedData serialization
// ============================================================================

std::vector<uint8_t> EncryptedData::serialize() const
{
    if (!isValid()) return {};

    std::vector<uint8_t> result;
    result.reserve(2 + iv.size() + authTag.size() + ciphertext.size());

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

    // Read auth tag
    if (pos >= blob.size()) return data;
    uint8_t tagLen = blob[pos++];
    if (pos + tagLen > blob.size()) return data;
    data.authTag.assign(blob.begin() + pos, blob.begin() + pos + tagLen);
    pos += tagLen;

    // Read ciphertext
    data.ciphertext.assign(blob.begin() + pos, blob.end());

    return data;
}

bool EncryptedData::isValid() const
{
    return !iv.empty() && !authTag.empty() && !ciphertext.empty();
}

// ============================================================================
// Key generation and management
// ============================================================================

std::vector<uint8_t> generateKey()
{
    std::vector<uint8_t> key(KEY_SIZE);

    // Try /dev/urandom first
    std::ifstream urandom("/dev/urandom", std::ios::binary);
    if (urandom) {
        urandom.read(reinterpret_cast<char*>(key.data()), KEY_SIZE);
        if (urandom.gcount() == KEY_SIZE) {
            return key;
        }
    }

    // Fallback to C++ random (not cryptographically secure)
    std::random_device rd;
    std::mt19937_64 gen(rd());
    std::uniform_int_distribution<uint8_t> dist(0, 255);
    for (size_t i = 0; i < KEY_SIZE; i++) {
        key[i] = dist(gen);
    }

    return key;
}

SplitKey splitKey(const std::vector<uint8_t>& key)
{
    if (key.size() != KEY_SIZE) {
        throw std::runtime_error("Invalid key size");
    }

    SplitKey result;
    result.k1 = generateKey();
    result.k2.resize(KEY_SIZE);

    // k2 = key XOR k1
    for (size_t i = 0; i < KEY_SIZE; i++) {
        result.k2[i] = key[i] ^ result.k1[i];
    }

    return result;
}

std::vector<uint8_t> combineKey(const std::vector<uint8_t>& k1, const std::vector<uint8_t>& k2)
{
    if (k1.size() != KEY_SIZE || k2.size() != KEY_SIZE) {
        throw std::runtime_error("Invalid key component size");
    }

    std::vector<uint8_t> key(KEY_SIZE);
    for (size_t i = 0; i < KEY_SIZE; i++) {
        key[i] = k1[i] ^ k2[i];
    }

    return key;
}

// ============================================================================
// Simple XOR-based encryption (NOT SECURE - stub only)
// ============================================================================

EncryptedData encrypt(const std::vector<uint8_t>& key, const std::vector<uint8_t>& plaintext,
                      const std::vector<uint8_t>& aad)
{
    if (key.size() != KEY_SIZE) {
        throw std::runtime_error("Invalid key size");
    }

    EncryptedData result;

    // Generate random IV
    result.iv.resize(IV_SIZE);
    std::ifstream urandom("/dev/urandom", std::ios::binary);
    if (urandom) {
        urandom.read(reinterpret_cast<char*>(result.iv.data()), IV_SIZE);
    } else {
        std::random_device rd;
        std::mt19937_64 gen(rd());
        for (size_t i = 0; i < IV_SIZE; i++) {
            result.iv[i] = gen() & 0xFF;
        }
    }

    // Simple XOR encryption (repeating key+IV)
    result.ciphertext.resize(plaintext.size());
    for (size_t i = 0; i < plaintext.size(); i++) {
        uint8_t keyByte = key[i % KEY_SIZE] ^ result.iv[i % IV_SIZE];
        result.ciphertext[i] = plaintext[i] ^ keyByte;
    }

    // Generate simple checksum as "auth tag"
    result.authTag.resize(TAG_SIZE);
    uint64_t checksum = 0;
    for (size_t i = 0; i < plaintext.size(); i++) {
        checksum = (checksum * 31 + plaintext[i]) ^ key[i % KEY_SIZE];
    }
    for (size_t i = 0; i < TAG_SIZE; i++) {
        result.authTag[i] = (checksum >> (i * 4)) & 0xFF;
    }

    return result;
}

EncryptedData encrypt(const std::vector<uint8_t>& key, const std::string& plaintext,
                      const std::vector<uint8_t>& aad)
{
    std::vector<uint8_t> data(plaintext.begin(), plaintext.end());
    return encrypt(key, data, aad);
}

std::vector<uint8_t> decrypt(const std::vector<uint8_t>& key, const EncryptedData& encrypted,
                              const std::vector<uint8_t>& aad)
{
    if (key.size() != KEY_SIZE) {
        throw std::runtime_error("Invalid key size");
    }

    if (!encrypted.isValid()) {
        throw std::runtime_error("Invalid encrypted data");
    }

    // Simple XOR decryption
    std::vector<uint8_t> plaintext(encrypted.ciphertext.size());
    for (size_t i = 0; i < encrypted.ciphertext.size(); i++) {
        uint8_t keyByte = key[i % KEY_SIZE] ^ encrypted.iv[i % IV_SIZE];
        plaintext[i] = encrypted.ciphertext[i] ^ keyByte;
    }

    // Verify checksum
    uint64_t checksum = 0;
    for (size_t i = 0; i < plaintext.size(); i++) {
        checksum = (checksum * 31 + plaintext[i]) ^ key[i % KEY_SIZE];
    }
    std::vector<uint8_t> expectedTag(TAG_SIZE);
    for (size_t i = 0; i < TAG_SIZE; i++) {
        expectedTag[i] = (checksum >> (i * 4)) & 0xFF;
    }

    if (expectedTag != encrypted.authTag) {
        throw std::runtime_error("Authentication failed");
    }

    return plaintext;
}

// ============================================================================
// Secure memory wiping
// ============================================================================

void secureWipe(std::vector<uint8_t>& data)
{
    volatile uint8_t* ptr = data.data();
    for (size_t i = 0; i < data.size(); i++) {
        ptr[i] = 0;
    }
    data.clear();
}

void secureWipe(std::string& str)
{
    volatile char* ptr = &str[0];
    for (size_t i = 0; i < str.size(); i++) {
        ptr[i] = 0;
    }
    str.clear();
}

} // namespace crypto

#endif // PLATFORM_LINUX
