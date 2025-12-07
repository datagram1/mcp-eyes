/**
 * PKCE (Proof Key for Code Exchange) Utilities
 *
 * Implements RFC 7636 for OAuth 2.1 PKCE verification.
 * Only S256 method is supported per OAuth 2.1 requirements.
 */

import crypto from 'crypto';

/**
 * Supported code challenge methods
 * OAuth 2.1 requires S256 only (plain is disallowed)
 */
export type CodeChallengeMethod = 'S256';

/**
 * Verify a PKCE code verifier against a stored code challenge
 *
 * @param codeVerifier - The code_verifier from the token request
 * @param codeChallenge - The stored code_challenge from the authorization request
 * @param method - The code_challenge_method (must be S256)
 * @returns true if verification passes
 * @throws Error if method is not S256 or verification fails
 */
export function verifyCodeChallenge(
  codeVerifier: string,
  codeChallenge: string,
  method: string
): boolean {
  // OAuth 2.1 requires S256 only
  if (method !== 'S256') {
    throw new Error('Invalid code_challenge_method: only S256 is supported');
  }

  // Validate code_verifier format (RFC 7636 Section 4.1)
  // Must be 43-128 characters from [A-Z] / [a-z] / [0-9] / "-" / "." / "_" / "~"
  if (!isValidCodeVerifier(codeVerifier)) {
    throw new Error('Invalid code_verifier format');
  }

  // Calculate S256 challenge from verifier
  const calculatedChallenge = generateS256Challenge(codeVerifier);

  // Compare using timing-safe comparison
  return timingSafeEqual(calculatedChallenge, codeChallenge);
}

/**
 * Generate an S256 code challenge from a code verifier
 *
 * S256: BASE64URL(SHA256(code_verifier))
 *
 * @param codeVerifier - The code verifier string
 * @returns Base64URL-encoded SHA256 hash
 */
export function generateS256Challenge(codeVerifier: string): string {
  const hash = crypto.createHash('sha256').update(codeVerifier).digest();
  return base64UrlEncode(hash);
}

/**
 * Generate a cryptographically secure code verifier
 *
 * @param length - Length of the verifier (43-128, default 64)
 * @returns A random code verifier string
 */
export function generateCodeVerifier(length: number = 64): string {
  if (length < 43 || length > 128) {
    throw new Error('Code verifier length must be between 43 and 128');
  }

  // Generate random bytes and encode to base64url alphabet
  const randomBytes = crypto.randomBytes(length);
  return base64UrlEncode(randomBytes).slice(0, length);
}

/**
 * Validate a code verifier format per RFC 7636 Section 4.1
 *
 * code-verifier = 43*128unreserved
 * unreserved = ALPHA / DIGIT / "-" / "." / "_" / "~"
 */
export function isValidCodeVerifier(codeVerifier: string): boolean {
  if (!codeVerifier || codeVerifier.length < 43 || codeVerifier.length > 128) {
    return false;
  }

  // RFC 7636 unreserved characters
  const validPattern = /^[A-Za-z0-9\-._~]+$/;
  return validPattern.test(codeVerifier);
}

/**
 * Validate a code challenge format
 *
 * For S256, this is a base64url-encoded SHA256 hash (43 characters)
 */
export function isValidCodeChallenge(codeChallenge: string): boolean {
  if (!codeChallenge) {
    return false;
  }

  // S256 produces 43 character base64url string (256 bits / 6 bits per char)
  // But we allow some variance for different implementations
  if (codeChallenge.length < 43 || codeChallenge.length > 128) {
    return false;
  }

  // Base64URL characters only
  const validPattern = /^[A-Za-z0-9\-_]+$/;
  return validPattern.test(codeChallenge);
}

/**
 * Base64URL encode a buffer (no padding)
 */
function base64UrlEncode(buffer: Buffer): string {
  return buffer
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/**
 * Timing-safe string comparison to prevent timing attacks
 */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    // Still do a comparison to prevent timing attack on length check
    crypto.timingSafeEqual(Buffer.from(a), Buffer.from(a));
    return false;
  }

  return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
}
