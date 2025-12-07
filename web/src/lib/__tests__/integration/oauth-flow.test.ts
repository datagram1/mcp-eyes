/**
 * OAuth Flow Integration Tests
 *
 * Tests for the complete OAuth 2.1 authorization flow.
 * These tests verify end-to-end OAuth functionality.
 */

import {
  generateCodeVerifier,
  generateS256Challenge,
  verifyCodeChallenge,
} from '../../oauth/pkce';
import {
  generateAccessToken,
  generateRefreshToken,
  generateAuthorizationCode,
  generateClientId,
  hashToken,
  verifyTokenHash,
  validateToken,
} from '../../oauth/tokens';
import {
  validateScopes,
  parseScopes,
  isMcpMethodAllowed,
  DEFAULT_SCOPES,
} from '../../oauth/scopes';

describe('OAuth Flow Integration', () => {
  describe('Complete Authorization Code Flow', () => {
    it('should complete full PKCE flow', () => {
      // Step 1: Client generates PKCE parameters
      const codeVerifier = generateCodeVerifier();
      const codeChallenge = generateS256Challenge(codeVerifier);

      // Step 2: Client requests authorization (simulated)
      const requestedScopes = 'mcp:tools mcp:resources';
      const scopeValidation = validateScopes(requestedScopes);
      expect(scopeValidation.valid).toBe(true);

      // Step 3: Authorization server generates auth code
      const authCode = generateAuthorizationCode();
      expect(authCode.token).toBeDefined();
      expect(authCode.hash).toBeDefined();

      // Step 4: Client exchanges code for tokens with code_verifier
      const verifyResult = verifyCodeChallenge(codeVerifier, codeChallenge, 'S256');
      expect(verifyResult).toBe(true);

      // Step 5: Server generates tokens
      const accessToken = generateAccessToken();
      const refreshToken = generateRefreshToken();

      // Step 6: Verify tokens can be validated
      const accessValidation = validateToken(
        accessToken.token,
        accessToken.hash,
        accessToken.expiresAt
      );
      expect(accessValidation.valid).toBe(true);

      const refreshValidation = validateToken(
        refreshToken.token,
        refreshToken.hash,
        refreshToken.expiresAt
      );
      expect(refreshValidation.valid).toBe(true);
    });

    it('should reject invalid code verifier', () => {
      // Generate PKCE params
      const codeVerifier = generateCodeVerifier();
      const codeChallenge = generateS256Challenge(codeVerifier);

      // Try to verify with wrong verifier
      const wrongVerifier = generateCodeVerifier();
      const verifyResult = verifyCodeChallenge(wrongVerifier, codeChallenge, 'S256');
      expect(verifyResult).toBe(false);
    });

    it('should enforce scope restrictions on MCP methods', () => {
      // User grants only mcp:tools scope
      const grantedScopes = parseScopes('mcp:tools');

      // Should allow tools methods
      expect(isMcpMethodAllowed(grantedScopes, 'tools/list')).toBe(true);
      expect(isMcpMethodAllowed(grantedScopes, 'tools/call')).toBe(true);

      // Should deny resources methods
      expect(isMcpMethodAllowed(grantedScopes, 'resources/list')).toBe(false);
      expect(isMcpMethodAllowed(grantedScopes, 'resources/read')).toBe(false);

      // Should deny prompts methods
      expect(isMcpMethodAllowed(grantedScopes, 'prompts/list')).toBe(false);
    });
  });

  describe('Dynamic Client Registration Flow', () => {
    it('should generate valid client credentials', () => {
      // Simulating DCR response
      const clientId = generateClientId();

      // Verify client ID format
      expect(clientId).toMatch(/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/);

      // Client secret would be stored hashed
      const clientSecret = generateAccessToken(); // Using same secure random
      const secretHash = hashToken(clientSecret.token);

      // Verify secret can be validated later
      expect(verifyTokenHash(clientSecret.token, secretHash)).toBe(true);
    });
  });

  describe('Token Refresh Flow', () => {
    it('should generate new tokens on refresh', () => {
      // Initial tokens
      const originalAccess = generateAccessToken();
      const originalRefresh = generateRefreshToken();

      // Simulate refresh - verify refresh token first
      const refreshValid = validateToken(
        originalRefresh.token,
        originalRefresh.hash,
        originalRefresh.expiresAt
      );
      expect(refreshValid.valid).toBe(true);

      // Generate new tokens
      const newAccess = generateAccessToken();
      const newRefresh = generateRefreshToken();

      // New tokens should be different
      expect(newAccess.token).not.toBe(originalAccess.token);
      expect(newRefresh.token).not.toBe(originalRefresh.token);

      // New tokens should be valid
      expect(validateToken(newAccess.token, newAccess.hash, newAccess.expiresAt).valid).toBe(true);
      expect(validateToken(newRefresh.token, newRefresh.hash, newRefresh.expiresAt).valid).toBe(true);
    });

    it('should reject expired refresh token', () => {
      const refreshToken = generateRefreshToken();

      // Simulate expired token
      const expiredDate = new Date(Date.now() - 1000);

      const validation = validateToken(
        refreshToken.token,
        refreshToken.hash,
        expiredDate
      );

      expect(validation.valid).toBe(false);
      expect(validation.expired).toBe(true);
    });
  });

  describe('Token Revocation Flow', () => {
    it('should invalidate token after revocation (simulated)', () => {
      const accessToken = generateAccessToken();

      // Before revocation - token is valid
      expect(validateToken(
        accessToken.token,
        accessToken.hash,
        accessToken.expiresAt
      ).valid).toBe(true);

      // After revocation - hash would be deleted from DB
      // Simulating by using wrong hash
      const revokedHash = 'revoked';

      expect(validateToken(
        accessToken.token,
        revokedHash,
        accessToken.expiresAt
      ).valid).toBe(false);
    });
  });

  describe('Scope Downgrade Flow', () => {
    it('should allow requesting fewer scopes than originally granted', () => {
      // User originally granted all default scopes
      const originalScopes = DEFAULT_SCOPES;

      // Client requests subset for specific action
      const requestedScopes = validateScopes('mcp:tools');

      // All requested scopes should be in original grant
      const allGranted = requestedScopes.scopes.every(
        scope => originalScopes.includes(scope)
      );
      expect(allGranted).toBe(true);
    });
  });

  describe('Resource-Specific Tokens', () => {
    it('should validate token audience matches resource', () => {
      const accessToken = generateAccessToken();
      const resource = 'https://screencontrol.example.com/mcp/123';

      // Token bound to specific resource
      const validation = validateToken(
        accessToken.token,
        accessToken.hash,
        accessToken.expiresAt,
        resource,  // expected
        resource   // actual audience
      );

      expect(validation.valid).toBe(true);
    });

    it('should reject token for wrong resource', () => {
      const accessToken = generateAccessToken();

      const validation = validateToken(
        accessToken.token,
        accessToken.hash,
        accessToken.expiresAt,
        'https://screencontrol.example.com/mcp/123',  // expected
        'https://screencontrol.example.com/mcp/456'   // actual (different)
      );

      expect(validation.valid).toBe(false);
      expect(validation.audienceMismatch).toBe(true);
    });
  });
});

describe('MCP Request Authorization', () => {
  describe('Token-based Authorization', () => {
    it('should allow request with valid token and scope', () => {
      // Generate token for connection
      const accessToken = generateAccessToken();
      const grantedScopes = parseScopes('mcp:tools mcp:resources');

      // Verify token
      const tokenValid = validateToken(
        accessToken.token,
        accessToken.hash,
        accessToken.expiresAt
      ).valid;

      // Verify method allowed
      const methodAllowed = isMcpMethodAllowed(grantedScopes, 'tools/call');

      expect(tokenValid).toBe(true);
      expect(methodAllowed).toBe(true);
    });

    it('should deny request with expired token', () => {
      const accessToken = generateAccessToken();
      const expiredDate = new Date(Date.now() - 1000);

      const tokenValid = validateToken(
        accessToken.token,
        accessToken.hash,
        expiredDate
      ).valid;

      expect(tokenValid).toBe(false);
    });

    it('should deny request with insufficient scope', () => {
      const grantedScopes = parseScopes('mcp:tools'); // Only tools

      // Try to access resources
      const methodAllowed = isMcpMethodAllowed(grantedScopes, 'resources/read');

      expect(methodAllowed).toBe(false);
    });
  });
});
