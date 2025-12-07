/**
 * Agent Download API
 *
 * GET /api/connections/[id]/download?platform=macos
 * Download a tenant-tagged agent installer for a specific connection
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/prisma';
import {
  loadAndPatchBuild,
  PLATFORM_INFO,
  Platform,
  generateSalt,
  loadManifest,
} from '@/lib/patch-service';

export const dynamic = 'force-dynamic';

interface RouteContext {
  params: Promise<{ id: string }>;
}

// Rate limiting: track downloads per user
const downloadCounts = new Map<string, { count: number; resetAt: number }>();
const MAX_DOWNLOADS_PER_HOUR = 10;

function checkRateLimit(userId: string): boolean {
  const now = Date.now();
  const hourMs = 60 * 60 * 1000;

  let userData = downloadCounts.get(userId);

  if (!userData || userData.resetAt < now) {
    userData = { count: 0, resetAt: now + hourMs };
    downloadCounts.set(userId, userData);
  }

  if (userData.count >= MAX_DOWNLOADS_PER_HOUR) {
    return false;
  }

  userData.count++;
  return true;
}

/**
 * GET /api/connections/[id]/download
 * Download a patched agent installer
 *
 * Query params:
 * - platform: macos | windows | linux-gui | linux-headless
 * - version: (optional) specific version to download
 */
export async function GET(
  request: NextRequest,
  context: RouteContext
) {
  const session = await getServerSession();
  if (!session?.user?.email) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    );
  }

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    select: { id: true },
  });

  if (!user) {
    return NextResponse.json(
      { error: 'User not found' },
      { status: 404 }
    );
  }

  // Rate limiting
  if (!checkRateLimit(user.id)) {
    return NextResponse.json(
      { error: 'Rate limit exceeded. Maximum 10 downloads per hour.' },
      { status: 429 }
    );
  }

  const { id } = await context.params;

  // Verify connection belongs to user
  const connection = await prisma.mcpConnection.findFirst({
    where: {
      id,
      userId: user.id,
    },
    select: {
      id: true,
      endpointUuid: true,
      name: true,
    },
  });

  if (!connection) {
    return NextResponse.json(
      { error: 'Connection not found' },
      { status: 404 }
    );
  }

  // Parse query params
  const searchParams = request.nextUrl.searchParams;
  const platformParam = searchParams.get('platform');
  const versionParam = searchParams.get('version') || undefined;

  // Validate platform
  const validPlatforms: Platform[] = ['macos', 'windows', 'linux-gui', 'linux-headless'];
  if (!platformParam || !validPlatforms.includes(platformParam as Platform)) {
    return NextResponse.json(
      {
        error: 'Invalid platform. Must be one of: macos, windows, linux-gui, linux-headless',
        validPlatforms,
      },
      { status: 400 }
    );
  }

  const platform = platformParam as Platform;
  const platformInfo = PLATFORM_INFO[platform];

  // Get client info for logging
  const clientIP = request.headers.get('x-forwarded-for')?.split(',')[0] ||
    request.headers.get('x-real-ip') ||
    'unknown';
  const userAgent = request.headers.get('user-agent') || 'unknown';

  try {
    // Load and patch the build
    const result = await loadAndPatchBuild(
      platform,
      {
        endpointUuid: connection.endpointUuid,
      },
      versionParam
    );

    if (!result.success || !result.data) {
      // In development, return info about what would be downloaded
      if (process.env.NODE_ENV === 'development') {
        const manifest = await loadManifest();
        return NextResponse.json({
          message: 'Development mode - build files not available',
          wouldDownload: {
            platform,
            version: result.version || manifest.latest,
            filename: platformInfo.filename,
            endpointUuid: connection.endpointUuid,
          },
          error: result.error,
        });
      }

      return NextResponse.json(
        { error: result.error || 'Failed to prepare download' },
        { status: 500 }
      );
    }

    // Generate tracking salt
    const checksumSalt = generateSalt();

    // Log the download
    await prisma.installerDownload.create({
      data: {
        userId: user.id,
        platform: platform === 'macos' ? 'MACOS' :
                  platform === 'windows' ? 'WINDOWS' : 'LINUX',
        variant: platform.includes('headless') ? 'headless' : 'gui',
        version: result.version || '1.0.0',
        customerId: connection.endpointUuid,
        checksumSalt,
        ipAddress: clientIP,
        userAgent,
      },
    });

    // Generate filename for download
    const filename = `ScreenControl-${connection.name.replace(/[^a-zA-Z0-9]/g, '-')}${platformInfo.extension}`;

    // Return the patched binary (convert Buffer to Uint8Array for Response)
    return new Response(new Uint8Array(result.data), {
      headers: {
        'Content-Type': platformInfo.contentType,
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': result.data.length.toString(),
        'X-Agent-Version': result.version || '1.0.0',
        'X-Endpoint-UUID': connection.endpointUuid,
      },
    });
  } catch (error) {
    console.error('[Download] Error:', error);
    return NextResponse.json(
      { error: 'Failed to prepare download' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/connections/[id]/download/info
 * Get download info without actually downloading
 */
export async function HEAD(
  request: NextRequest,
  context: RouteContext
) {
  const session = await getServerSession();
  if (!session?.user?.email) {
    return new Response(null, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
  });

  if (!user) {
    return new Response(null, { status: 404 });
  }

  const { id } = await context.params;

  const connection = await prisma.mcpConnection.findFirst({
    where: {
      id,
      userId: user.id,
    },
  });

  if (!connection) {
    return new Response(null, { status: 404 });
  }

  // Return available downloads info in headers
  const manifest = await loadManifest();

  return new Response(null, {
    headers: {
      'X-Latest-Version': manifest.latest,
      'X-Available-Platforms': Object.keys(PLATFORM_INFO).join(','),
      'X-Endpoint-UUID': connection.endpointUuid,
    },
  });
}
