/**
 * Manifest Service
 *
 * Loads and validates the golden build manifest.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { GOLDEN_BUILDS_PATH, Platform } from './constants';

export interface PlatformBuild {
  filename: string;
  sha256: string;
  size?: number;
}

export interface VersionInfo {
  macos?: PlatformBuild;
  windows?: PlatformBuild;
  'linux-gui'?: PlatformBuild;
  'linux-headless'?: PlatformBuild;
}

export interface Manifest {
  latest: string;
  versions: Record<string, VersionInfo>;
}

let cachedManifest: Manifest | null = null;
let manifestLoadedAt: number = 0;
const MANIFEST_CACHE_TTL = 60000; // 1 minute cache

/**
 * Load the golden build manifest
 */
export async function loadManifest(): Promise<Manifest> {
  const now = Date.now();

  // Return cached if still valid
  if (cachedManifest && now - manifestLoadedAt < MANIFEST_CACHE_TTL) {
    return cachedManifest;
  }

  const manifestPath = path.join(GOLDEN_BUILDS_PATH, 'manifest.json');

  try {
    const content = await fs.readFile(manifestPath, 'utf-8');
    cachedManifest = JSON.parse(content) as Manifest;
    manifestLoadedAt = now;
    return cachedManifest;
  } catch (error) {
    console.error('[Manifest] Failed to load manifest:', error);

    // Return a default manifest for development
    if (process.env.NODE_ENV === 'development') {
      return {
        latest: '1.0.0',
        versions: {
          '1.0.0': {
            macos: { filename: 'MCPEyes.app.tar.gz', sha256: 'development' },
            windows: { filename: 'ScreenControl.exe', sha256: 'development' },
            'linux-gui': { filename: 'screencontrol-gui', sha256: 'development' },
            'linux-headless': { filename: 'screencontrol-headless', sha256: 'development' },
          },
        },
      };
    }

    throw new Error('Failed to load golden build manifest');
  }
}

/**
 * Get build info for a specific platform and version
 */
export async function getBuildInfo(
  platform: Platform,
  version?: string
): Promise<{ build: PlatformBuild; version: string; path: string } | null> {
  const manifest = await loadManifest();

  const targetVersion = version || manifest.latest;
  const versionInfo = manifest.versions[targetVersion];

  if (!versionInfo) {
    console.error(`[Manifest] Version ${targetVersion} not found`);
    return null;
  }

  const build = versionInfo[platform];
  if (!build) {
    console.error(`[Manifest] Platform ${platform} not found in version ${targetVersion}`);
    return null;
  }

  return {
    build,
    version: targetVersion,
    path: path.join(GOLDEN_BUILDS_PATH, targetVersion, build.filename),
  };
}

/**
 * Check if golden build exists on disk
 */
export async function checkBuildExists(buildPath: string): Promise<boolean> {
  try {
    await fs.access(buildPath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Get all available platforms for a version
 */
export async function getAvailablePlatforms(version?: string): Promise<Platform[]> {
  const manifest = await loadManifest();
  const targetVersion = version || manifest.latest;
  const versionInfo = manifest.versions[targetVersion];

  if (!versionInfo) {
    return [];
  }

  return Object.keys(versionInfo) as Platform[];
}
