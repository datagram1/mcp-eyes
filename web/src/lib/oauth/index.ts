/**
 * OAuth Library Index
 *
 * Exports all OAuth utilities for use throughout the application.
 */

// PKCE utilities
export {
  verifyCodeChallenge,
  generateS256Challenge as generateCodeChallenge,
  generateCodeVerifier,
  isValidCodeChallenge,
  isValidCodeVerifier,
  type CodeChallengeMethod,
} from './pkce';

// Token utilities
export {
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
  type TokenType,
  type GeneratedToken,
  type TokenValidationResult,
} from './tokens';

// Scope utilities
export {
  SCOPES,
  DEFAULT_SCOPES,
  ALL_SCOPE_NAMES,
  validateScopes,
  isValidScope,
  parseScopes,
  scopesToString,
  getScopeDescriptions,
  isMcpMethodAllowed,
  getRequiredScopes,
  hasRequiredScopes,
  getMissingScopes,
  type ScopeName,
} from './scopes';

// Client registration utilities
export {
  isValidRedirectUri,
  validateRegistrationRequest,
  registerClient,
  getClient,
  validateClientRedirectUri,
  clientSupportsGrantType,
  type ClientRegistrationRequest,
  type ClientRegistrationResponse,
  type ClientRegistrationError,
} from './client-registration';

// OAuth configuration
export const OAUTH_CONFIG = {
  issuer: process.env.NEXT_PUBLIC_APP_URL || 'https://screencontrol.knws.co.uk',
  authorizationEndpoint: '/api/oauth/authorize',
  tokenEndpoint: '/api/oauth/token',
  registrationEndpoint: '/api/oauth/register',
  revocationEndpoint: '/api/oauth/revoke',
  responseTypesSupported: ['code'] as const,
  grantTypesSupported: ['authorization_code', 'refresh_token'] as const,
  codeChallengeMethodsSupported: ['S256'] as const,
  tokenEndpointAuthMethodsSupported: ['none', 'client_secret_post'] as const,
  scopesSupported: ['mcp:tools', 'mcp:resources', 'mcp:prompts', 'mcp:agents:read', 'mcp:agents:write'] as const,
} as const;

/**
 * Build OAuth Server Metadata response (RFC 8414)
 */
export function buildOAuthServerMetadata(issuer: string) {
  return {
    issuer,
    authorization_endpoint: `${issuer}${OAUTH_CONFIG.authorizationEndpoint}`,
    token_endpoint: `${issuer}${OAUTH_CONFIG.tokenEndpoint}`,
    registration_endpoint: `${issuer}${OAUTH_CONFIG.registrationEndpoint}`,
    revocation_endpoint: `${issuer}${OAUTH_CONFIG.revocationEndpoint}`,
    response_types_supported: OAUTH_CONFIG.responseTypesSupported,
    grant_types_supported: OAUTH_CONFIG.grantTypesSupported,
    code_challenge_methods_supported: OAUTH_CONFIG.codeChallengeMethodsSupported,
    token_endpoint_auth_methods_supported: OAUTH_CONFIG.tokenEndpointAuthMethodsSupported,
    scopes_supported: OAUTH_CONFIG.scopesSupported,
  };
}

/**
 * Build Protected Resource Metadata response (RFC 9728)
 */
export function buildProtectedResourceMetadata(resourceUrl: string, issuer: string) {
  return {
    resource: resourceUrl,
    authorization_servers: [issuer],
  };
}
