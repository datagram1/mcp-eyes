/**
 * Cryptographic Utilities
 *
 * AES-256-GCM encryption/decryption for secure credential storage.
 * Uses OpenSSL for cross-platform support.
 */

#ifndef SCREENCONTROL_CRYPTO_H
#define SCREENCONTROL_CRYPTO_H

#include <string>
#include <vector>
#include <cstdint>

namespace crypto {

/**
 * Encryption result containing ciphertext, IV, and auth tag
 */
struct EncryptedData {
    std::vector<uint8_t> ciphertext;
    std::vector<uint8_t> iv;        // 12 bytes for GCM
    std::vector<uint8_t> authTag;   // 16 bytes for GCM

    // Serialize to single blob: [iv_len(1)][iv][tag_len(1)][tag][ciphertext]
    std::vector<uint8_t> serialize() const;

    // Deserialize from blob
    static EncryptedData deserialize(const std::vector<uint8_t>& blob);

    bool isValid() const;
};

/**
 * Key split result for split-key architecture
 */
struct SplitKey {
    std::vector<uint8_t> k1;  // Local fragment (32 bytes)
    std::vector<uint8_t> k2;  // Server fragment (32 bytes)
};

/**
 * Generate cryptographically secure random bytes
 */
std::vector<uint8_t> randomBytes(size_t length);

/**
 * Generate a random AES-256 key (32 bytes)
 */
std::vector<uint8_t> generateKey();

/**
 * Split a key into two fragments using XOR
 * K = K1 XOR K2, where K1 is random
 */
SplitKey splitKey(const std::vector<uint8_t>& key);

/**
 * Reconstruct a key from two fragments
 * K = K1 XOR K2
 */
std::vector<uint8_t> combineKey(const std::vector<uint8_t>& k1,
                                 const std::vector<uint8_t>& k2);

/**
 * Encrypt data using AES-256-GCM
 * @param key 32-byte encryption key
 * @param plaintext Data to encrypt
 * @param aad Optional additional authenticated data
 * @return EncryptedData containing ciphertext, IV, and auth tag
 */
EncryptedData encrypt(const std::vector<uint8_t>& key,
                      const std::vector<uint8_t>& plaintext,
                      const std::vector<uint8_t>& aad = {});

/**
 * Encrypt string data
 */
EncryptedData encrypt(const std::vector<uint8_t>& key,
                      const std::string& plaintext,
                      const std::vector<uint8_t>& aad = {});

/**
 * Decrypt data using AES-256-GCM
 * @param key 32-byte decryption key
 * @param data EncryptedData containing ciphertext, IV, and auth tag
 * @param aad Optional additional authenticated data (must match encryption)
 * @return Decrypted plaintext, or empty vector on failure
 */
std::vector<uint8_t> decrypt(const std::vector<uint8_t>& key,
                              const EncryptedData& data,
                              const std::vector<uint8_t>& aad = {});

/**
 * Decrypt to string
 */
std::string decryptToString(const std::vector<uint8_t>& key,
                            const EncryptedData& data,
                            const std::vector<uint8_t>& aad = {});

/**
 * Securely wipe memory
 * Uses platform-specific secure zeroing to prevent optimization
 */
void secureWipe(void* ptr, size_t len);
void secureWipe(std::vector<uint8_t>& data);
void secureWipe(std::string& str);

/**
 * Base64 encoding/decoding
 */
std::string base64Encode(const std::vector<uint8_t>& data);
std::vector<uint8_t> base64Decode(const std::string& encoded);

/**
 * Constant-time comparison to prevent timing attacks
 */
bool constantTimeCompare(const std::vector<uint8_t>& a,
                         const std::vector<uint8_t>& b);

} // namespace crypto

#endif // SCREENCONTROL_CRYPTO_H
