/**
 * Update Check API Route
 *
 * GET /api/updates/check
 * Query params: platform, arch, currentVersion, machineId, fingerprint
 *
 * Returns update availability info for agents
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { compareVersions } from '@/lib/control-server/version-utils';

export const dynamic = 'force-dynamic';

// Map query param values to Prisma enum values
const platformMap: Record<string, 'WINDOWS' | 'MACOS' | 'LINUX'> = {
  windows: 'WINDOWS',
  macos: 'MACOS',
  linux: 'LINUX',
};

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const platform = searchParams.get('platform')?.toLowerCase();
  const arch = searchParams.get('arch')?.toLowerCase();
  const currentVersion = searchParams.get('currentVersion');
  const machineId = searchParams.get('machineId');
  const fingerprint = request.headers.get('X-Fingerprint');
  const channel = searchParams.get('channel')?.toUpperCase() || 'STABLE';

  // Validate required params
  if (!platform || !arch || !currentVersion) {
    return NextResponse.json(
      { error: 'Missing required parameters: platform, arch, currentVersion' },
      { status: 400 }
    );
  }

  // Validate platform
  const prismaPlatform = platformMap[platform];
  if (!prismaPlatform) {
    return NextResponse.json(
      { error: `Invalid platform: ${platform}. Must be windows, macos, or linux` },
      { status: 400 }
    );
  }

  // Validate arch
  if (!['x64', 'arm64'].includes(arch)) {
    return NextResponse.json(
      { error: `Invalid arch: ${arch}. Must be x64 or arm64` },
      { status: 400 }
    );
  }

  try {
    // Get agent-specific update settings if machineId provided
    let agentSettings = null;
    let effectiveChannel = channel as 'STABLE' | 'BETA' | 'DEV';

    if (machineId) {
      const agent = await prisma.agent.findFirst({
        where: { machineId },
        select: { id: true },
      });

      if (agent) {
        agentSettings = await prisma.agentUpdateSettings.findUnique({
          where: { agentId: agent.id },
        });

        if (agentSettings) {
          // Check if updates are disabled for this agent
          if (agentSettings.updateMode === 'DISABLED') {
            return NextResponse.json({
              updateAvailable: false,
              reason: 'Updates disabled for this agent',
            });
          }
          effectiveChannel = agentSettings.channel;
        }
      }
    }

    // Get latest active version for the channel
    const latestVersion = await prisma.agentVersion.findFirst({
      where: {
        isActive: true,
        channel: effectiveChannel,
      },
      orderBy: { releaseDate: 'desc' },
      include: {
        builds: {
          where: {
            platform: prismaPlatform,
            arch: arch,
          },
        },
      },
    });

    if (!latestVersion) {
      return NextResponse.json({
        updateAvailable: false,
        reason: 'No versions available',
      });
    }

    // Check if there's a build for this platform/arch
    const build = latestVersion.builds[0];
    if (!build) {
      return NextResponse.json({
        updateAvailable: false,
        reason: `No build available for ${platform}-${arch}`,
      });
    }

    // Compare versions
    const comparison = compareVersions(currentVersion, latestVersion.version);

    if (comparison >= 0) {
      return NextResponse.json({
        updateAvailable: false,
        currentVersion,
        latestVersion: latestVersion.version,
        reason: 'Already up to date',
      });
    }

    // Check if this is a forced update (current version below minimum)
    const isForced = latestVersion.minVersion
      ? compareVersions(currentVersion, latestVersion.minVersion) < 0
      : false;

    // Check rollout percentage (use machineId hash for consistent assignment)
    if (latestVersion.rolloutPercent < 100 && machineId) {
      const hash = hashCode(machineId);
      const assignedPercent = Math.abs(hash) % 100;
      if (assignedPercent >= latestVersion.rolloutPercent && !isForced) {
        return NextResponse.json({
          updateAvailable: false,
          reason: 'Not in rollout group',
          latestVersion: latestVersion.version,
        });
      }
    }

    // Update available
    return NextResponse.json({
      updateAvailable: true,
      version: latestVersion.version,
      channel: latestVersion.channel,
      size: build.fileSize,
      sha256: build.sha256,
      filename: build.filename,
      releaseNotes: latestVersion.releaseNotes,
      releaseDate: latestVersion.releaseDate,
      isForced,
      downloadUrl: `/api/updates/download/${platform}/${arch}/${latestVersion.version}`,
    });
  } catch (error) {
    console.error('[Updates] Check error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// Simple hash function for rollout assignment
function hashCode(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return hash;
}
