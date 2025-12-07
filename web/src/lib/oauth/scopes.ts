/**
 * OAuth Scope Definitions and Validation
 *
 * Defines the available scopes for MCP OAuth connections
 * and provides utilities for scope validation.
 */

/**
 * Available OAuth scopes for ScreenControl MCP
 */
export const SCOPES = {
  // Tool access
  'mcp:tools': {
    name: 'MCP Tools',
    description: 'Access to list and call tools on your agents',
    includes: ['tools/list', 'tools/call'],
  },

  // Resource access
  'mcp:resources': {
    name: 'MCP Resources',
    description: 'Access to list and read resources from your agents',
    includes: ['resources/list', 'resources/read', 'resources/subscribe'],
  },

  // Prompt access
  'mcp:prompts': {
    name: 'MCP Prompts',
    description: 'Access to list and use prompts from your agents',
    includes: ['prompts/list', 'prompts/get'],
  },

  // Agent read access
  'mcp:agents:read': {
    name: 'Agent Status',
    description: 'Read agent status, connection state, and metadata',
    includes: ['agents/list', 'agents/status'],
  },

  // Agent write access
  'mcp:agents:write': {
    name: 'Agent Management',
    description: 'Modify agent settings and configuration',
    includes: ['agents/configure', 'agents/restart'],
  },
} as const;

/**
 * Scope name type
 */
export type ScopeName = keyof typeof SCOPES;

/**
 * Default scopes granted for new connections
 */
export const DEFAULT_SCOPES: ScopeName[] = [
  'mcp:tools',
  'mcp:resources',
  'mcp:agents:read',
];

/**
 * All available scope names
 */
export const ALL_SCOPE_NAMES: ScopeName[] = Object.keys(SCOPES) as ScopeName[];

/**
 * Validate a list of requested scopes
 *
 * @param requestedScopes - Space-separated scope string or array
 * @returns Validation result with valid scopes and any invalid ones
 */
export function validateScopes(requestedScopes: string | string[]): {
  valid: boolean;
  scopes: ScopeName[];
  invalidScopes: string[];
} {
  // Parse scope string if needed
  const scopeList = Array.isArray(requestedScopes)
    ? requestedScopes
    : requestedScopes.split(/\s+/).filter(Boolean);

  const validScopes: ScopeName[] = [];
  const invalidScopes: string[] = [];

  for (const scope of scopeList) {
    if (isValidScope(scope)) {
      validScopes.push(scope as ScopeName);
    } else {
      invalidScopes.push(scope);
    }
  }

  return {
    valid: invalidScopes.length === 0,
    scopes: validScopes,
    invalidScopes,
  };
}

/**
 * Check if a scope name is valid
 */
export function isValidScope(scope: string): scope is ScopeName {
  return scope in SCOPES;
}

/**
 * Parse a scope string into an array of scope names
 *
 * @param scopeString - Space-separated scope string
 * @returns Array of valid scope names (invalid ones are filtered out)
 */
export function parseScopes(scopeString: string): ScopeName[] {
  return scopeString
    .split(/\s+/)
    .filter(Boolean)
    .filter(isValidScope);
}

/**
 * Convert scope array to space-separated string
 */
export function scopesToString(scopes: ScopeName[]): string {
  return scopes.join(' ');
}

/**
 * Get human-readable scope descriptions for consent screen
 *
 * @param scopes - Array of scope names
 * @returns Array of scope info objects
 */
export function getScopeDescriptions(scopes: ScopeName[]): Array<{
  scope: ScopeName;
  name: string;
  description: string;
}> {
  return scopes.map((scope) => ({
    scope,
    name: SCOPES[scope].name,
    description: SCOPES[scope].description,
  }));
}

/**
 * Check if a set of granted scopes allows a specific MCP method
 *
 * @param grantedScopes - The scopes granted to the token
 * @param method - The MCP method being called (e.g., 'tools/call')
 * @returns true if the method is allowed
 */
export function isMcpMethodAllowed(grantedScopes: ScopeName[], method: string): boolean {
  for (const scope of grantedScopes) {
    const scopeInfo = SCOPES[scope];
    if (scopeInfo.includes.some((allowed) => method.startsWith(allowed))) {
      return true;
    }
  }
  return false;
}

/**
 * Get the minimum required scopes for a set of MCP methods
 *
 * @param methods - Array of MCP methods
 * @returns Array of required scope names
 */
export function getRequiredScopes(methods: string[]): ScopeName[] {
  const requiredScopes = new Set<ScopeName>();

  for (const method of methods) {
    for (const [scopeName, scopeInfo] of Object.entries(SCOPES)) {
      if (scopeInfo.includes.some((allowed) => method.startsWith(allowed))) {
        requiredScopes.add(scopeName as ScopeName);
      }
    }
  }

  return Array.from(requiredScopes);
}

/**
 * Check if scopes A include all scopes in B (subset check)
 *
 * @param grantedScopes - The granted scopes
 * @param requiredScopes - The required scopes
 * @returns true if all required scopes are granted
 */
export function hasRequiredScopes(
  grantedScopes: ScopeName[],
  requiredScopes: ScopeName[]
): boolean {
  const grantedSet = new Set(grantedScopes);
  return requiredScopes.every((scope) => grantedSet.has(scope));
}

/**
 * Get missing scopes (scopes in required but not in granted)
 */
export function getMissingScopes(
  grantedScopes: ScopeName[],
  requiredScopes: ScopeName[]
): ScopeName[] {
  const grantedSet = new Set(grantedScopes);
  return requiredScopes.filter((scope) => !grantedSet.has(scope));
}
