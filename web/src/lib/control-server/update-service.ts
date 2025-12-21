/**
 * Update Service
 *
 * Provides update availability checking for agents
 * Used by WebSocket handler to include update flag in heartbeat_ack
 */

import { prisma } from '@/lib/prisma';
import { compareVersions } from './version-utils';

// Cache latest versions for each channel (refreshed every 60 seconds)
interface VersionCache {
  version: string;
  minVersion: string | null;
  rolloutPercent: number;
  builds: Map<string, boolean>; // platform-arch -> hasUpdate
  cachedAt: number;
}

const versionCache: Map<string, VersionCache> = new Map();
const CACHE_TTL = 60 * 1000; // 60 seconds

/**
 * Check if an update is available for an agent
 *
 * @param agentVersion Current agent version
 * @param platform Agent platform (WINDOWS, MACOS, LINUX)
 * @param arch Agent architecture (x64, arm64)
 * @param machineId Agent machine ID (for rollout calculation)
 * @param channel Update channel (STABLE, BETA, DEV)
 * @returns Object with update availability info
 */
export async function checkUpdateAvailable(
  agentVersion: string,
  platform: 'WINDOWS' | 'MACOS' | 'LINUX',
  arch: string,
  machineId?: string,
  channel: 'STABLE' | 'BETA' | 'DEV' = 'STABLE'
): Promise<{
  hasUpdate: boolean;
  version?: string;
  isForced?: boolean;
}> {
  try {
    // Get cached or fresh version info
    const latestInfo = await getLatestVersion(channel);

    if (!latestInfo) {
      return { hasUpdate: false };
    }

    // Check if this platform/arch has a build
    const buildKey = `${platform}-${arch}`;
    if (!latestInfo.builds.has(buildKey)) {
      return { hasUpdate: false };
    }

    // Compare versions
    const comparison = compareVersions(agentVersion, latestInfo.version);

    if (comparison >= 0) {
      return { hasUpdate: false };
    }

    // Check if forced update (below minimum version)
    const isForced = latestInfo.minVersion
      ? compareVersions(agentVersion, latestInfo.minVersion) < 0
      : false;

    // Check rollout percentage (consistent per machine)
    if (latestInfo.rolloutPercent < 100 && machineId && !isForced) {
      const hash = hashCode(machineId);
      const assignedPercent = Math.abs(hash) % 100;
      if (assignedPercent >= latestInfo.rolloutPercent) {
        return { hasUpdate: false };
      }
    }

    return {
      hasUpdate: true,
      version: latestInfo.version,
      isForced,
    };
  } catch (error) {
    console.error('[UpdateService] Error checking update:', error);
    return { hasUpdate: false };
  }
}

/**
 * Get latest version info from cache or database
 */
async function getLatestVersion(channel: string): Promise<VersionCache | null> {
  const cached = versionCache.get(channel);
  const now = Date.now();

  if (cached && now - cached.cachedAt < CACHE_TTL) {
    return cached;
  }

  // Fetch from database
  const latestVersion = await prisma.agentVersion.findFirst({
    where: {
      isActive: true,
      channel: channel as 'STABLE' | 'BETA' | 'DEV',
    },
    orderBy: { releaseDate: 'desc' },
    include: {
      builds: {
        select: {
          platform: true,
          arch: true,
        },
      },
    },
  });

  if (!latestVersion) {
    return null;
  }

  // Build platform-arch map
  const builds = new Map<string, boolean>();
  for (const build of latestVersion.builds) {
    builds.set(`${build.platform}-${build.arch}`, true);
  }

  const cacheEntry: VersionCache = {
    version: latestVersion.version,
    minVersion: latestVersion.minVersion,
    rolloutPercent: latestVersion.rolloutPercent,
    builds,
    cachedAt: now,
  };

  versionCache.set(channel, cacheEntry);

  return cacheEntry;
}

/**
 * Clear version cache (call when new version is uploaded)
 */
export function clearVersionCache(): void {
  versionCache.clear();
}

/**
 * Get update info for multiple agents efficiently (batch operation)
 */
export async function getUpdateFlags(
  agents: Array<{
    id: string;
    agentVersion?: string;
    osType: 'WINDOWS' | 'MACOS' | 'LINUX';
    arch?: string;
    machineId?: string;
  }>
): Promise<Map<string, boolean>> {
  const results = new Map<string, boolean>();

  // Get latest stable version once
  const latestInfo = await getLatestVersion('STABLE');

  if (!latestInfo) {
    // No updates available
    for (const agent of agents) {
      results.set(agent.id, false);
    }
    return results;
  }

  for (const agent of agents) {
    if (!agent.agentVersion || !agent.arch) {
      results.set(agent.id, false);
      continue;
    }

    // Check if build exists for this platform/arch
    const buildKey = `${agent.osType}-${agent.arch}`;
    if (!latestInfo.builds.has(buildKey)) {
      results.set(agent.id, false);
      continue;
    }

    // Compare versions
    const comparison = compareVersions(agent.agentVersion, latestInfo.version);

    if (comparison >= 0) {
      results.set(agent.id, false);
      continue;
    }

    // Check rollout
    if (latestInfo.rolloutPercent < 100 && agent.machineId) {
      const isForced = latestInfo.minVersion
        ? compareVersions(agent.agentVersion, latestInfo.minVersion) < 0
        : false;

      if (!isForced) {
        const hash = hashCode(agent.machineId);
        const assignedPercent = Math.abs(hash) % 100;
        if (assignedPercent >= latestInfo.rolloutPercent) {
          results.set(agent.id, false);
          continue;
        }
      }
    }

    results.set(agent.id, true);
  }

  return results;
}

// Simple hash function for rollout assignment
function hashCode(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash;
  }
  return hash;
}
