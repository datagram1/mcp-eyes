/**
 * OAuth Token Utilities Tests
 *
 * Tests for token generation, hashing, and validation.
 */

import {
  generateAccessToken,
  generateRefreshToken,
  generateAuthorizationCode,
  generateClientId,
  hashToken,
  verifyTokenHash,
  isTokenExpired,
  getTokenRemainingLifetime,
  validateTokenAudience,
  parseTokenType,
  validateToken,
  TOKEN_CONFIG,
} from '../tokens';

describe('Token Utilities', () => {
  describe('generateAccessToken', () => {
    it('should generate token with correct prefix', () => {
      const { token } = generateAccessToken();
      expect(token.startsWith(TOKEN_CONFIG.ACCESS_TOKEN_PREFIX)).toBe(true);
    });

    it('should generate unique tokens', () => {
      const tokens = new Set();
      for (let i = 0; i < 100; i++) {
        tokens.add(generateAccessToken().token);
      }
      expect(tokens.size).toBe(100);
    });

    it('should return hash that differs from token', () => {
      const { token, hash } = generateAccessToken();
      expect(hash).not.toBe(token);
    });

    it('should set expiration ~1 hour in future', () => {
      const { expiresAt } = generateAccessToken();
      const now = Date.now();
      const oneHour = TOKEN_CONFIG.ACCESS_TOKEN_LIFETIME * 1000;
      expect(expiresAt.getTime()).toBeGreaterThan(now);
      expect(expiresAt.getTime()).toBeLessThanOrEqual(now + oneHour + 1000);
    });

    it('should return correct type', () => {
      const { type } = generateAccessToken();
      expect(type).toBe('access');
    });
  });

  describe('generateRefreshToken', () => {
    it('should generate token with correct prefix', () => {
      const { token } = generateRefreshToken();
      expect(token.startsWith(TOKEN_CONFIG.REFRESH_TOKEN_PREFIX)).toBe(true);
    });

    it('should set expiration ~30 days in future', () => {
      const { expiresAt } = generateRefreshToken();
      const now = Date.now();
      const thirtyDays = TOKEN_CONFIG.REFRESH_TOKEN_LIFETIME * 1000;
      expect(expiresAt.getTime()).toBeGreaterThan(now);
      expect(expiresAt.getTime()).toBeLessThanOrEqual(now + thirtyDays + 1000);
    });

    it('should return correct type', () => {
      const { type } = generateRefreshToken();
      expect(type).toBe('refresh');
    });
  });

  describe('generateAuthorizationCode', () => {
    it('should generate token with correct prefix', () => {
      const { token } = generateAuthorizationCode();
      expect(token.startsWith(TOKEN_CONFIG.AUTH_CODE_PREFIX)).toBe(true);
    });

    it('should set expiration ~10 minutes in future', () => {
      const { expiresAt } = generateAuthorizationCode();
      const now = Date.now();
      const tenMinutes = TOKEN_CONFIG.AUTH_CODE_LIFETIME * 1000;
      expect(expiresAt.getTime()).toBeGreaterThan(now);
      expect(expiresAt.getTime()).toBeLessThanOrEqual(now + tenMinutes + 1000);
    });

    it('should return correct type', () => {
      const { type } = generateAuthorizationCode();
      expect(type).toBe('authorization_code');
    });
  });

  describe('generateClientId', () => {
    it('should generate UUID-like format', () => {
      const clientId = generateClientId();
      // UUID format: 8-4-4-4-12
      expect(clientId).toMatch(/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/);
    });

    it('should generate unique IDs', () => {
      const ids = new Set();
      for (let i = 0; i < 100; i++) {
        ids.add(generateClientId());
      }
      expect(ids.size).toBe(100);
    });
  });

  describe('hashToken', () => {
    it('should return hex string', () => {
      const hash = hashToken('test-token');
      expect(hash).toMatch(/^[a-f0-9]{64}$/);
    });

    it('should be deterministic', () => {
      const hash1 = hashToken('test-token');
      const hash2 = hashToken('test-token');
      expect(hash1).toBe(hash2);
    });

    it('should produce different hashes for different tokens', () => {
      const hash1 = hashToken('token-1');
      const hash2 = hashToken('token-2');
      expect(hash1).not.toBe(hash2);
    });
  });

  describe('verifyTokenHash', () => {
    it('should return true for matching token/hash', () => {
      const token = 'my-secret-token';
      const hash = hashToken(token);
      expect(verifyTokenHash(token, hash)).toBe(true);
    });

    it('should return false for non-matching token', () => {
      const hash = hashToken('correct-token');
      expect(verifyTokenHash('wrong-token', hash)).toBe(false);
    });

    it('should return false for different length hashes', () => {
      expect(verifyTokenHash('token', 'short')).toBe(false);
    });
  });

  describe('isTokenExpired', () => {
    it('should return false for future date', () => {
      const future = new Date(Date.now() + 3600000);
      expect(isTokenExpired(future)).toBe(false);
    });

    it('should return true for past date', () => {
      const past = new Date(Date.now() - 1000);
      expect(isTokenExpired(past)).toBe(true);
    });
  });

  describe('getTokenRemainingLifetime', () => {
    it('should return positive value for future expiration', () => {
      const future = new Date(Date.now() + 3600000);
      const remaining = getTokenRemainingLifetime(future);
      expect(remaining).toBeGreaterThan(3500);
      expect(remaining).toBeLessThanOrEqual(3600);
    });

    it('should return 0 for expired token', () => {
      const past = new Date(Date.now() - 1000);
      expect(getTokenRemainingLifetime(past)).toBe(0);
    });
  });

  describe('validateTokenAudience', () => {
    it('should return true for matching URLs', () => {
      expect(validateTokenAudience(
        'https://api.example.com/mcp/123',
        'https://api.example.com/mcp/123'
      )).toBe(true);
    });

    it('should normalize trailing slashes', () => {
      expect(validateTokenAudience(
        'https://api.example.com/mcp/123/',
        'https://api.example.com/mcp/123'
      )).toBe(true);
    });

    it('should return false for different URLs', () => {
      expect(validateTokenAudience(
        'https://api.example.com/mcp/123',
        'https://api.example.com/mcp/456'
      )).toBe(false);
    });
  });

  describe('parseTokenType', () => {
    it('should identify access token', () => {
      expect(parseTokenType('sc_at_some_random_string')).toBe('access');
    });

    it('should identify refresh token', () => {
      expect(parseTokenType('sc_rt_some_random_string')).toBe('refresh');
    });

    it('should identify authorization code', () => {
      expect(parseTokenType('sc_ac_some_random_string')).toBe('authorization_code');
    });

    it('should return null for unknown prefix', () => {
      expect(parseTokenType('unknown_token')).toBe(null);
    });
  });

  describe('validateToken', () => {
    it('should return valid for correct token', () => {
      const { token, hash, expiresAt } = generateAccessToken();
      const result = validateToken(token, hash, expiresAt);
      expect(result.valid).toBe(true);
    });

    it('should return invalid for wrong hash', () => {
      const { token, expiresAt } = generateAccessToken();
      const wrongHash = hashToken('different-token');
      const result = validateToken(token, wrongHash, expiresAt);
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Invalid token');
    });

    it('should return expired for old token', () => {
      const { token, hash } = generateAccessToken();
      const pastDate = new Date(Date.now() - 1000);
      const result = validateToken(token, hash, pastDate);
      expect(result.valid).toBe(false);
      expect(result.expired).toBe(true);
    });

    it('should check audience when provided', () => {
      const { token, hash, expiresAt } = generateAccessToken();
      const result = validateToken(
        token, hash, expiresAt,
        'https://expected.com',
        'https://different.com'
      );
      expect(result.valid).toBe(false);
      expect(result.audienceMismatch).toBe(true);
    });
  });
});
