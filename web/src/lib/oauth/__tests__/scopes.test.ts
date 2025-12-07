/**
 * OAuth Scopes Tests
 *
 * Tests for scope validation and management.
 */

import {
  validateScopes,
  isValidScope,
  parseScopes,
  scopesToString,
  getScopeDescriptions,
  isMcpMethodAllowed,
  getRequiredScopes,
  hasRequiredScopes,
  getMissingScopes,
  DEFAULT_SCOPES,
  ALL_SCOPE_NAMES,
  SCOPES,
  type ScopeName,
} from '../scopes';

describe('Scope Utilities', () => {
  describe('isValidScope', () => {
    it('should return true for valid scope names', () => {
      expect(isValidScope('mcp:tools')).toBe(true);
      expect(isValidScope('mcp:resources')).toBe(true);
      expect(isValidScope('mcp:prompts')).toBe(true);
      expect(isValidScope('mcp:agents:read')).toBe(true);
      expect(isValidScope('mcp:agents:write')).toBe(true);
    });

    it('should return false for invalid scope names', () => {
      expect(isValidScope('invalid:scope')).toBe(false);
      expect(isValidScope('mcp:invalid')).toBe(false);
      expect(isValidScope('')).toBe(false);
    });
  });

  describe('validateScopes', () => {
    it('should accept valid scope string', () => {
      const result = validateScopes('mcp:tools mcp:resources');
      expect(result.valid).toBe(true);
      expect(result.scopes).toEqual(['mcp:tools', 'mcp:resources']);
      expect(result.invalidScopes).toEqual([]);
    });

    it('should accept valid scope array', () => {
      const result = validateScopes(['mcp:tools', 'mcp:resources']);
      expect(result.valid).toBe(true);
      expect(result.scopes).toEqual(['mcp:tools', 'mcp:resources']);
    });

    it('should identify invalid scopes', () => {
      const result = validateScopes('mcp:tools invalid:scope');
      expect(result.valid).toBe(false);
      expect(result.scopes).toEqual(['mcp:tools']);
      expect(result.invalidScopes).toEqual(['invalid:scope']);
    });

    it('should handle empty input', () => {
      const result = validateScopes('');
      expect(result.valid).toBe(true);
      expect(result.scopes).toEqual([]);
    });

    it('should handle whitespace-only input', () => {
      const result = validateScopes('   ');
      expect(result.valid).toBe(true);
      expect(result.scopes).toEqual([]);
    });

    it('should handle multiple whitespace separators', () => {
      const result = validateScopes('mcp:tools   mcp:resources');
      expect(result.valid).toBe(true);
      expect(result.scopes).toEqual(['mcp:tools', 'mcp:resources']);
    });
  });

  describe('parseScopes', () => {
    it('should parse valid scopes', () => {
      const scopes = parseScopes('mcp:tools mcp:resources');
      expect(scopes).toEqual(['mcp:tools', 'mcp:resources']);
    });

    it('should filter out invalid scopes', () => {
      const scopes = parseScopes('mcp:tools invalid mcp:resources');
      expect(scopes).toEqual(['mcp:tools', 'mcp:resources']);
    });

    it('should return empty array for no valid scopes', () => {
      const scopes = parseScopes('invalid scope');
      expect(scopes).toEqual([]);
    });
  });

  describe('scopesToString', () => {
    it('should convert scope array to space-separated string', () => {
      const str = scopesToString(['mcp:tools', 'mcp:resources']);
      expect(str).toBe('mcp:tools mcp:resources');
    });

    it('should handle empty array', () => {
      const str = scopesToString([]);
      expect(str).toBe('');
    });

    it('should handle single scope', () => {
      const str = scopesToString(['mcp:tools']);
      expect(str).toBe('mcp:tools');
    });
  });

  describe('getScopeDescriptions', () => {
    it('should return descriptions for scopes', () => {
      const descriptions = getScopeDescriptions(['mcp:tools', 'mcp:resources']);
      expect(descriptions).toHaveLength(2);
      expect(descriptions[0]).toEqual({
        scope: 'mcp:tools',
        name: 'MCP Tools',
        description: expect.any(String),
      });
    });

    it('should handle empty array', () => {
      const descriptions = getScopeDescriptions([]);
      expect(descriptions).toEqual([]);
    });
  });

  describe('isMcpMethodAllowed', () => {
    it('should allow tools/list with mcp:tools scope', () => {
      expect(isMcpMethodAllowed(['mcp:tools'], 'tools/list')).toBe(true);
    });

    it('should allow tools/call with mcp:tools scope', () => {
      expect(isMcpMethodAllowed(['mcp:tools'], 'tools/call')).toBe(true);
    });

    it('should allow resources/list with mcp:resources scope', () => {
      expect(isMcpMethodAllowed(['mcp:resources'], 'resources/list')).toBe(true);
    });

    it('should allow resources/read with mcp:resources scope', () => {
      expect(isMcpMethodAllowed(['mcp:resources'], 'resources/read')).toBe(true);
    });

    it('should allow prompts/list with mcp:prompts scope', () => {
      expect(isMcpMethodAllowed(['mcp:prompts'], 'prompts/list')).toBe(true);
    });

    it('should deny tools/call without mcp:tools scope', () => {
      expect(isMcpMethodAllowed(['mcp:resources'], 'tools/call')).toBe(false);
    });

    it('should deny unknown methods', () => {
      expect(isMcpMethodAllowed(['mcp:tools'], 'unknown/method')).toBe(false);
    });

    it('should work with multiple scopes', () => {
      expect(isMcpMethodAllowed(['mcp:tools', 'mcp:resources'], 'tools/call')).toBe(true);
      expect(isMcpMethodAllowed(['mcp:tools', 'mcp:resources'], 'resources/read')).toBe(true);
    });
  });

  describe('getRequiredScopes', () => {
    it('should return required scope for tools method', () => {
      const scopes = getRequiredScopes(['tools/call']);
      expect(scopes).toContain('mcp:tools');
    });

    it('should return required scope for resources method', () => {
      const scopes = getRequiredScopes(['resources/list']);
      expect(scopes).toContain('mcp:resources');
    });

    it('should return multiple scopes for multiple methods', () => {
      const scopes = getRequiredScopes(['tools/call', 'resources/list']);
      expect(scopes).toContain('mcp:tools');
      expect(scopes).toContain('mcp:resources');
    });

    it('should deduplicate scopes', () => {
      const scopes = getRequiredScopes(['tools/list', 'tools/call']);
      expect(scopes.filter(s => s === 'mcp:tools')).toHaveLength(1);
    });

    it('should return empty array for unknown methods', () => {
      const scopes = getRequiredScopes(['unknown/method']);
      expect(scopes).toEqual([]);
    });
  });

  describe('hasRequiredScopes', () => {
    it('should return true when all required scopes are granted', () => {
      expect(hasRequiredScopes(
        ['mcp:tools', 'mcp:resources'],
        ['mcp:tools']
      )).toBe(true);
    });

    it('should return false when missing required scope', () => {
      expect(hasRequiredScopes(
        ['mcp:tools'],
        ['mcp:tools', 'mcp:resources']
      )).toBe(false);
    });

    it('should return true for empty required scopes', () => {
      expect(hasRequiredScopes(['mcp:tools'], [])).toBe(true);
    });

    it('should return true for equal scope sets', () => {
      expect(hasRequiredScopes(
        ['mcp:tools', 'mcp:resources'],
        ['mcp:tools', 'mcp:resources']
      )).toBe(true);
    });
  });

  describe('getMissingScopes', () => {
    it('should return missing scopes', () => {
      const missing = getMissingScopes(
        ['mcp:tools'],
        ['mcp:tools', 'mcp:resources']
      );
      expect(missing).toEqual(['mcp:resources']);
    });

    it('should return empty array when all scopes granted', () => {
      const missing = getMissingScopes(
        ['mcp:tools', 'mcp:resources'],
        ['mcp:tools']
      );
      expect(missing).toEqual([]);
    });

    it('should return all required scopes if none granted', () => {
      const missing = getMissingScopes(
        [],
        ['mcp:tools', 'mcp:resources']
      );
      expect(missing).toEqual(['mcp:tools', 'mcp:resources']);
    });
  });

  describe('Constants', () => {
    it('should have default scopes defined', () => {
      expect(DEFAULT_SCOPES).toBeDefined();
      expect(DEFAULT_SCOPES.length).toBeGreaterThan(0);
    });

    it('should have all scope names match SCOPES keys', () => {
      expect(ALL_SCOPE_NAMES).toEqual(Object.keys(SCOPES));
    });

    it('should have valid structure for each scope', () => {
      for (const [key, value] of Object.entries(SCOPES)) {
        expect(value).toHaveProperty('name');
        expect(value).toHaveProperty('description');
        expect(value).toHaveProperty('includes');
        expect(Array.isArray(value.includes)).toBe(true);
      }
    });
  });
});
