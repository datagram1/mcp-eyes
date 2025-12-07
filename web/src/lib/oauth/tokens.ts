/**
 * OAuth Token Utilities
 *
 * Handles token generation, hashing, and validation.
 * Tokens are always stored as SHA256 hashes, never in plain text.
 */

import crypto from 'crypto';

// Token configuration
export const TOKEN_CONFIG = {
  // Token lengths (in bytes, before encoding)
  ACCESS_TOKEN_BYTES: 32, // 256 bits
  REFRESH_TOKEN_BYTES: 32, // 256 bits
  AUTH_CODE_BYTES: 32, // 256 bits
  CLIENT_ID_BYTES: 16, // 128 bits (UUID-like)

  // Token lifetimes (in seconds)
  ACCESS_TOKEN_LIFETIME: 3600, // 1 hour
  REFRESH_TOKEN_LIFETIME: 30 * 24 * 3600, // 30 days
  AUTH_CODE_LIFETIME: 600, // 10 minutes

  // Token prefixes for identification
  ACCESS_TOKEN_PREFIX: 'sc_at_',
  REFRESH_TOKEN_PREFIX: 'sc_rt_',
  AUTH_CODE_PREFIX: 'sc_ac_',
} as const;

/**
 * Token types
 */
export type TokenType = 'access' | 'refresh' | 'authorization_code';

/**
 * Generated token with metadata
 */
export interface GeneratedToken {
  /** The raw token value (to be sent to client) */
  token: string;
  /** SHA256 hash of the token (for storage) */
  hash: string;
  /** Expiration timestamp */
  expiresAt: Date;
  /** Token type */
  type: TokenType;
}

/**
 * Generate a secure random access token
 */
export function generateAccessToken(): GeneratedToken {
  return generateToken('access', TOKEN_CONFIG.ACCESS_TOKEN_BYTES, TOKEN_CONFIG.ACCESS_TOKEN_LIFETIME);
}

/**
 * Generate a secure random refresh token
 */
export function generateRefreshToken(): GeneratedToken {
  return generateToken('refresh', TOKEN_CONFIG.REFRESH_TOKEN_BYTES, TOKEN_CONFIG.REFRESH_TOKEN_LIFETIME);
}

/**
 * Generate a secure random authorization code
 */
export function generateAuthorizationCode(): GeneratedToken {
  return generateToken('authorization_code', TOKEN_CONFIG.AUTH_CODE_BYTES, TOKEN_CONFIG.AUTH_CODE_LIFETIME);
}

/**
 * Generate a token with the given parameters
 */
function generateToken(type: TokenType, bytes: number, lifetimeSeconds: number): GeneratedToken {
  const prefix = getTokenPrefix(type);
  const randomPart = crypto.randomBytes(bytes).toString('base64url');
  const token = `${prefix}${randomPart}`;

  return {
    token,
    hash: hashToken(token),
    expiresAt: new Date(Date.now() + lifetimeSeconds * 1000),
    type,
  };
}

/**
 * Get the prefix for a token type
 */
function getTokenPrefix(type: TokenType): string {
  switch (type) {
    case 'access':
      return TOKEN_CONFIG.ACCESS_TOKEN_PREFIX;
    case 'refresh':
      return TOKEN_CONFIG.REFRESH_TOKEN_PREFIX;
    case 'authorization_code':
      return TOKEN_CONFIG.AUTH_CODE_PREFIX;
  }
}

/**
 * Generate a client ID (UUID-like identifier)
 */
export function generateClientId(): string {
  // Generate a UUID v4-like string
  const bytes = crypto.randomBytes(TOKEN_CONFIG.CLIENT_ID_BYTES);
  const hex = bytes.toString('hex');

  // Format as UUID: 8-4-4-4-12
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join('-');
}

/**
 * Hash a token using SHA256 for secure storage
 *
 * @param token - The raw token value
 * @returns Hex-encoded SHA256 hash
 */
export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/**
 * Verify a token against a stored hash
 *
 * @param token - The raw token value
 * @param storedHash - The stored SHA256 hash
 * @returns true if the token matches the hash
 */
export function verifyTokenHash(token: string, storedHash: string): boolean {
  const calculatedHash = hashToken(token);

  // Use timing-safe comparison
  if (calculatedHash.length !== storedHash.length) {
    return false;
  }

  return crypto.timingSafeEqual(
    Buffer.from(calculatedHash),
    Buffer.from(storedHash)
  );
}

/**
 * Check if a token has expired
 *
 * @param expiresAt - The expiration timestamp
 * @returns true if the token has expired
 */
export function isTokenExpired(expiresAt: Date): boolean {
  return new Date() > expiresAt;
}

/**
 * Calculate remaining lifetime of a token in seconds
 *
 * @param expiresAt - The expiration timestamp
 * @returns Remaining seconds (0 if expired)
 */
export function getTokenRemainingLifetime(expiresAt: Date): number {
  const remaining = Math.floor((expiresAt.getTime() - Date.now()) / 1000);
  return Math.max(0, remaining);
}

/**
 * Validate token audience matches expected resource
 *
 * The audience can be:
 * 1. Exact match (e.g., both are https://example.com/mcp/uuid)
 * 2. Base path match (token audience is https://example.com/mcp,
 *    resource is https://example.com/mcp/uuid)
 *
 * This allows tokens issued for the base MCP path to access specific endpoints.
 *
 * @param tokenAudience - The audience claim from the token
 * @param expectedResource - The expected resource URL
 * @returns true if audience matches
 */
export function validateTokenAudience(tokenAudience: string, expectedResource: string): boolean {
  // Normalize URLs for comparison (remove trailing slashes)
  const normalizedAudience = tokenAudience.replace(/\/+$/, '');
  const normalizedExpected = expectedResource.replace(/\/+$/, '');

  // Exact match
  if (normalizedAudience === normalizedExpected) {
    return true;
  }

  // Allow parent resource to match child resource
  // e.g., token for "/mcp" can access "/mcp/{uuid}"
  // This is useful when a token is issued for the generic MCP service
  // and should work for any specific MCP endpoint
  if (normalizedExpected.startsWith(normalizedAudience + '/')) {
    return true;
  }

  return false;
}

/**
 * Parse token type from token string (based on prefix)
 *
 * @param token - The token string
 * @returns The token type or null if unknown
 */
export function parseTokenType(token: string): TokenType | null {
  if (token.startsWith(TOKEN_CONFIG.ACCESS_TOKEN_PREFIX)) {
    return 'access';
  }
  if (token.startsWith(TOKEN_CONFIG.REFRESH_TOKEN_PREFIX)) {
    return 'refresh';
  }
  if (token.startsWith(TOKEN_CONFIG.AUTH_CODE_PREFIX)) {
    return 'authorization_code';
  }
  return null;
}

/**
 * Token validation result
 */
export interface TokenValidationResult {
  valid: boolean;
  error?: string;
  expired?: boolean;
  audienceMismatch?: boolean;
}

/**
 * Validate a token for use
 *
 * @param token - The raw token value
 * @param storedHash - The stored hash
 * @param expiresAt - The expiration timestamp
 * @param expectedAudience - The expected audience (optional)
 * @param tokenAudience - The token's audience claim (optional)
 * @returns Validation result
 */
export function validateToken(
  token: string,
  storedHash: string,
  expiresAt: Date,
  expectedAudience?: string,
  tokenAudience?: string
): TokenValidationResult {
  // Verify hash
  if (!verifyTokenHash(token, storedHash)) {
    return { valid: false, error: 'Invalid token' };
  }

  // Check expiration
  if (isTokenExpired(expiresAt)) {
    return { valid: false, error: 'Token expired', expired: true };
  }

  // Check audience if provided
  if (expectedAudience && tokenAudience) {
    if (!validateTokenAudience(tokenAudience, expectedAudience)) {
      return { valid: false, error: 'Token audience mismatch', audienceMismatch: true };
    }
  }

  return { valid: true };
}
