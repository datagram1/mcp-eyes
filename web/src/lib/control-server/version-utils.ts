/**
 * Version Utilities
 *
 * Functions for comparing semantic versions
 */

/**
 * Compare two semantic versions
 * @returns negative if a < b, 0 if a == b, positive if a > b
 */
export function compareVersions(a: string, b: string): number {
  const partsA = parseVersion(a);
  const partsB = parseVersion(b);

  for (let i = 0; i < 3; i++) {
    const diff = partsA[i] - partsB[i];
    if (diff !== 0) return diff;
  }

  return 0;
}

/**
 * Parse a version string into [major, minor, patch]
 */
export function parseVersion(version: string): [number, number, number] {
  // Remove any leading 'v' or 'V'
  const cleaned = version.replace(/^v/i, '');

  // Split by dots and parse
  const parts = cleaned.split('.').map((p) => {
    // Handle pre-release versions like "1.2.3-beta.1"
    const numPart = p.split('-')[0];
    return parseInt(numPart, 10) || 0;
  });

  return [parts[0] || 0, parts[1] || 0, parts[2] || 0];
}

/**
 * Check if version a is newer than version b
 */
export function isNewerVersion(a: string, b: string): boolean {
  return compareVersions(a, b) > 0;
}

/**
 * Check if version a is at least version b
 */
export function isAtLeastVersion(a: string, b: string): boolean {
  return compareVersions(a, b) >= 0;
}

/**
 * Format version parts back to string
 */
export function formatVersion(major: number, minor: number, patch: number): string {
  return `${major}.${minor}.${patch}`;
}

/**
 * Increment version
 */
export function incrementVersion(
  version: string,
  part: 'major' | 'minor' | 'patch'
): string {
  const [major, minor, patch] = parseVersion(version);

  switch (part) {
    case 'major':
      return formatVersion(major + 1, 0, 0);
    case 'minor':
      return formatVersion(major, minor + 1, 0);
    case 'patch':
      return formatVersion(major, minor, patch + 1);
  }
}
