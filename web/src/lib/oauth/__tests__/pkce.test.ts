/**
 * PKCE (Proof Key for Code Exchange) Tests
 *
 * Tests for RFC 7636 PKCE verification implementation.
 */

import {
  verifyCodeChallenge,
  generateS256Challenge,
  generateCodeVerifier,
  isValidCodeVerifier,
  isValidCodeChallenge,
} from '../pkce';

describe('PKCE Utilities', () => {
  describe('generateCodeVerifier', () => {
    it('should generate a verifier of default length (64)', () => {
      const verifier = generateCodeVerifier();
      expect(verifier.length).toBe(64);
    });

    it('should generate a verifier of specified length', () => {
      const verifier = generateCodeVerifier(43);
      expect(verifier.length).toBe(43);
    });

    it('should throw for length less than 43', () => {
      expect(() => generateCodeVerifier(42)).toThrow('Code verifier length must be between 43 and 128');
    });

    it('should throw for length greater than 128', () => {
      expect(() => generateCodeVerifier(129)).toThrow('Code verifier length must be between 43 and 128');
    });

    it('should generate valid verifiers', () => {
      const verifier = generateCodeVerifier();
      expect(isValidCodeVerifier(verifier)).toBe(true);
    });

    it('should generate unique verifiers', () => {
      const verifiers = new Set();
      for (let i = 0; i < 100; i++) {
        verifiers.add(generateCodeVerifier());
      }
      expect(verifiers.size).toBe(100);
    });
  });

  describe('isValidCodeVerifier', () => {
    it('should accept valid verifier (43 chars)', () => {
      const verifier = 'a'.repeat(43);
      expect(isValidCodeVerifier(verifier)).toBe(true);
    });

    it('should accept valid verifier (128 chars)', () => {
      const verifier = 'a'.repeat(128);
      expect(isValidCodeVerifier(verifier)).toBe(true);
    });

    it('should accept all allowed characters', () => {
      const verifier = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnop0123456789-._~';
      expect(isValidCodeVerifier(verifier)).toBe(true);
    });

    it('should reject verifier shorter than 43 chars', () => {
      const verifier = 'a'.repeat(42);
      expect(isValidCodeVerifier(verifier)).toBe(false);
    });

    it('should reject verifier longer than 128 chars', () => {
      const verifier = 'a'.repeat(129);
      expect(isValidCodeVerifier(verifier)).toBe(false);
    });

    it('should reject empty string', () => {
      expect(isValidCodeVerifier('')).toBe(false);
    });

    it('should reject verifier with invalid characters', () => {
      const verifier = 'a'.repeat(42) + '!';
      expect(isValidCodeVerifier(verifier)).toBe(false);
    });

    it('should reject verifier with spaces', () => {
      const verifier = 'a'.repeat(42) + ' ';
      expect(isValidCodeVerifier(verifier)).toBe(false);
    });
  });

  describe('generateS256Challenge', () => {
    it('should generate consistent challenge for same verifier', () => {
      const verifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
      const challenge1 = generateS256Challenge(verifier);
      const challenge2 = generateS256Challenge(verifier);
      expect(challenge1).toBe(challenge2);
    });

    it('should generate different challenges for different verifiers', () => {
      const verifier1 = generateCodeVerifier();
      const verifier2 = generateCodeVerifier();
      const challenge1 = generateS256Challenge(verifier1);
      const challenge2 = generateS256Challenge(verifier2);
      expect(challenge1).not.toBe(challenge2);
    });

    it('should generate base64url encoded output (no +, /, =)', () => {
      const verifier = generateCodeVerifier();
      const challenge = generateS256Challenge(verifier);
      expect(challenge).not.toMatch(/[+/=]/);
    });

    // RFC 7636 Appendix B test vector
    it('should match RFC 7636 test vector', () => {
      const verifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
      const expectedChallenge = 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM';
      const challenge = generateS256Challenge(verifier);
      expect(challenge).toBe(expectedChallenge);
    });
  });

  describe('isValidCodeChallenge', () => {
    it('should accept valid base64url challenge', () => {
      const challenge = 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM';
      expect(isValidCodeChallenge(challenge)).toBe(true);
    });

    it('should reject empty string', () => {
      expect(isValidCodeChallenge('')).toBe(false);
    });

    it('should reject challenge with invalid characters', () => {
      expect(isValidCodeChallenge('invalid+challenge/with=padding')).toBe(false);
    });

    it('should reject challenge shorter than 43 chars', () => {
      expect(isValidCodeChallenge('a'.repeat(42))).toBe(false);
    });
  });

  describe('verifyCodeChallenge', () => {
    it('should verify valid verifier against challenge', () => {
      const verifier = generateCodeVerifier();
      const challenge = generateS256Challenge(verifier);
      expect(verifyCodeChallenge(verifier, challenge, 'S256')).toBe(true);
    });

    it('should reject invalid verifier', () => {
      const verifier = generateCodeVerifier();
      const challenge = generateS256Challenge(verifier);
      const wrongVerifier = generateCodeVerifier();
      expect(verifyCodeChallenge(wrongVerifier, challenge, 'S256')).toBe(false);
    });

    it('should throw for non-S256 method', () => {
      const verifier = generateCodeVerifier();
      const challenge = generateS256Challenge(verifier);
      expect(() => verifyCodeChallenge(verifier, challenge, 'plain')).toThrow(
        'Invalid code_challenge_method: only S256 is supported'
      );
    });

    it('should throw for invalid verifier format', () => {
      expect(() => verifyCodeChallenge('short', 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM', 'S256')).toThrow(
        'Invalid code_verifier format'
      );
    });

    // RFC 7636 Appendix B test vector
    it('should verify RFC 7636 test vector', () => {
      const verifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
      const challenge = 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM';
      expect(verifyCodeChallenge(verifier, challenge, 'S256')).toBe(true);
    });
  });
});
