/**
 * Debug mode utilities
 *
 * Debug mode enables testing features:
 * - Mock agent management (create test agents)
 * - License state testing (manual state changes)
 * - Billing simulation
 * - MCP connection testing
 *
 * Enable via DEBUG_MODE=true in .env
 */

/**
 * Check if debug mode is enabled
 */
export function isDebugMode(): boolean {
  return process.env.DEBUG_MODE === 'true' || process.env.NODE_ENV === 'development';
}

/**
 * Check if current user is an admin (can access debug features)
 * For now, all users can access debug in development mode
 */
export function isDebugUser(email?: string): boolean {
  // In development, everyone is a debug user
  if (process.env.NODE_ENV === 'development') {
    return true;
  }

  // In production with DEBUG_MODE, check for specific admin emails
  const adminEmails = process.env.DEBUG_ADMIN_EMAILS?.split(',') || [];
  if (email && adminEmails.includes(email)) {
    return true;
  }

  return false;
}

/**
 * Generate a test machine ID for mock agents
 */
export function generateMockMachineId(): string {
  const chars = 'abcdef0123456789';
  let id = '';
  for (let i = 0; i < 32; i++) {
    id += chars[Math.floor(Math.random() * chars.length)];
  }
  return `mock-${id}`;
}

/**
 * Generate a test fingerprint for mock agents
 */
export function generateMockFingerprint(): Record<string, unknown> {
  return {
    hostname: `test-machine-${Date.now()}`,
    cpuModel: 'Test CPU (Mock)',
    cpuCores: 8,
    memoryTotal: 16 * 1024 * 1024 * 1024, // 16GB
    macAddresses: [`00:00:00:00:00:${Math.floor(Math.random() * 100).toString(16).padStart(2, '0')}`],
    diskSerial: `MOCK-DISK-${Date.now()}`,
    mock: true,
  };
}

/**
 * Pre-defined test agent configurations
 */
export const TEST_AGENT_CONFIGS = {
  macOS: {
    osType: 'macos' as const,
    osVersion: 'Darwin 23.0.0',
    arch: 'arm64',
    agentVersion: '2.0.0-test',
  },
  windows: {
    osType: 'windows' as const,
    osVersion: 'Windows 11 Pro',
    arch: 'x64',
    agentVersion: '2.0.0-test',
  },
  linux: {
    osType: 'linux' as const,
    osVersion: 'Ubuntu 22.04 LTS',
    arch: 'x64',
    agentVersion: '2.0.0-test',
  },
};
