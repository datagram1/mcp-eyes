/**
 * Dynamic Client Registration (RFC 7591)
 *
 * Handles OAuth client registration for AI tools like Claude, Cursor, etc.
 * These are public clients (no client_secret) using PKCE for security.
 */

import { v4 as uuidv4 } from 'uuid';
import { prisma } from '@/lib/prisma';
import crypto from 'crypto';

export interface ClientRegistrationRequest {
  client_name: string;
  redirect_uris: string[];
  client_uri?: string;
  logo_uri?: string;
  contacts?: string[];
  grant_types?: string[];
  response_types?: string[];
  token_endpoint_auth_method?: string;
}

export interface ClientRegistrationResponse {
  client_id: string;
  client_secret?: string; // Only for confidential clients
  client_name: string;
  redirect_uris: string[];
  client_uri?: string;
  logo_uri?: string;
  contacts?: string[];
  grant_types: string[];
  response_types: string[];
  token_endpoint_auth_method: string;
  registration_client_uri?: string;
  registration_access_token?: string;
  client_id_issued_at: number;
}

export interface ClientRegistrationError {
  error: string;
  error_description?: string;
}

const ALLOWED_GRANT_TYPES = ['authorization_code', 'refresh_token'];
const ALLOWED_RESPONSE_TYPES = ['code'];
const ALLOWED_TOKEN_AUTH_METHODS = ['none', 'client_secret_post']; // Public and confidential clients

/**
 * Validate redirect URI.
 * - HTTPS required (except localhost for development)
 * - No fragments allowed
 */
export function isValidRedirectUri(uri: string): boolean {
  try {
    const parsed = new URL(uri);

    // No fragments allowed
    if (parsed.hash) {
      return false;
    }

    // HTTPS required, except for localhost
    const isLocalhost = parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1';
    if (!isLocalhost && parsed.protocol !== 'https:') {
      return false;
    }

    return true;
  } catch {
    return false;
  }
}

/**
 * Validate client registration request.
 */
export function validateRegistrationRequest(
  request: ClientRegistrationRequest
): ClientRegistrationError | null {
  // client_name is required
  if (!request.client_name || typeof request.client_name !== 'string') {
    return {
      error: 'invalid_client_metadata',
      error_description: 'client_name is required',
    };
  }

  // redirect_uris is required and must be non-empty array
  if (!Array.isArray(request.redirect_uris) || request.redirect_uris.length === 0) {
    return {
      error: 'invalid_redirect_uri',
      error_description: 'redirect_uris must be a non-empty array',
    };
  }

  // Validate each redirect URI
  for (const uri of request.redirect_uris) {
    if (!isValidRedirectUri(uri)) {
      return {
        error: 'invalid_redirect_uri',
        error_description: `Invalid redirect_uri: ${uri}. HTTPS required (except localhost), no fragments allowed.`,
      };
    }
  }

  // Validate grant_types if provided
  if (request.grant_types) {
    for (const gt of request.grant_types) {
      if (!ALLOWED_GRANT_TYPES.includes(gt)) {
        return {
          error: 'invalid_client_metadata',
          error_description: `Unsupported grant_type: ${gt}`,
        };
      }
    }
  }

  // Validate response_types if provided
  if (request.response_types) {
    for (const rt of request.response_types) {
      if (!ALLOWED_RESPONSE_TYPES.includes(rt)) {
        return {
          error: 'invalid_client_metadata',
          error_description: `Unsupported response_type: ${rt}`,
        };
      }
    }
  }

  // Validate token_endpoint_auth_method if provided
  if (request.token_endpoint_auth_method) {
    if (!ALLOWED_TOKEN_AUTH_METHODS.includes(request.token_endpoint_auth_method)) {
      return {
        error: 'invalid_client_metadata',
        error_description: `Unsupported token_endpoint_auth_method: ${request.token_endpoint_auth_method}. Supported: ${ALLOWED_TOKEN_AUTH_METHODS.join(', ')}`,
      };
    }
  }

  return null;
}

/**
 * Register a new OAuth client.
 */
export async function registerClient(
  request: ClientRegistrationRequest,
  context: { ipAddress?: string; userAgent?: string }
): Promise<ClientRegistrationResponse | ClientRegistrationError> {
  // Validate request
  const validationError = validateRegistrationRequest(request);
  if (validationError) {
    return validationError;
  }

  // Generate unique client ID
  const clientId = uuidv4();

  // Determine if this is a confidential client (needs client_secret)
  const tokenEndpointAuth = request.token_endpoint_auth_method || 'none';
  const isConfidentialClient = tokenEndpointAuth === 'client_secret_post';

  // Generate client_secret for confidential clients
  let clientSecret: string | undefined;
  let clientSecretHash: string | undefined;
  if (isConfidentialClient) {
    clientSecret = crypto.randomBytes(32).toString('hex');
    clientSecretHash = crypto.createHash('sha256').update(clientSecret).digest('hex');
  }

  // Create client in database
  const client = await prisma.oAuthClient.create({
    data: {
      clientId,
      clientSecretHash, // Will be null for public clients
      clientName: request.client_name,
      clientUri: request.client_uri,
      logoUri: request.logo_uri,
      redirectUris: request.redirect_uris,
      grantTypes: request.grant_types || ALLOWED_GRANT_TYPES,
      responseTypes: request.response_types || ALLOWED_RESPONSE_TYPES,
      tokenEndpointAuth,
      contacts: request.contacts || [],
      registeredByIp: context.ipAddress,
      registeredByAgent: context.userAgent,
    },
  });

  const response: ClientRegistrationResponse = {
    client_id: client.clientId,
    client_name: client.clientName,
    redirect_uris: client.redirectUris,
    client_uri: client.clientUri || undefined,
    logo_uri: client.logoUri || undefined,
    contacts: client.contacts.length > 0 ? client.contacts : undefined,
    grant_types: client.grantTypes,
    response_types: client.responseTypes,
    token_endpoint_auth_method: client.tokenEndpointAuth,
    client_id_issued_at: Math.floor(client.createdAt.getTime() / 1000),
  };

  // Include client_secret in response for confidential clients
  if (clientSecret) {
    response.client_secret = clientSecret;
  }

  return response;
}

/**
 * Get a registered client by client_id.
 */
export async function getClient(clientId: string): Promise<{
  id: string;
  clientId: string;
  clientName: string;
  clientUri: string | null;
  logoUri: string | null;
  redirectUris: string[];
  grantTypes: string[];
  responseTypes: string[];
  tokenEndpointAuth: string;
} | null> {
  const client = await prisma.oAuthClient.findUnique({
    where: { clientId },
  });

  if (!client) {
    return null;
  }

  return {
    id: client.id,
    clientId: client.clientId,
    clientName: client.clientName,
    clientUri: client.clientUri,
    logoUri: client.logoUri,
    redirectUris: client.redirectUris,
    grantTypes: client.grantTypes,
    responseTypes: client.responseTypes,
    tokenEndpointAuth: client.tokenEndpointAuth,
  };
}

/**
 * Validate a redirect URI against a client's registered URIs.
 * Exact match required per OAuth 2.1.
 */
export function validateClientRedirectUri(
  clientRedirectUris: string[],
  requestedUri: string
): boolean {
  return clientRedirectUris.includes(requestedUri);
}

/**
 * Check if client supports a grant type.
 */
export function clientSupportsGrantType(
  clientGrantTypes: string[],
  grantType: string
): boolean {
  return clientGrantTypes.includes(grantType);
}

/**
 * Generate a secure hash for client secret if we ever need confidential clients.
 * Currently unused since we only support public clients.
 */
export function hashClientSecret(secret: string): string {
  return crypto.createHash('sha256').update(secret).digest('hex');
}
