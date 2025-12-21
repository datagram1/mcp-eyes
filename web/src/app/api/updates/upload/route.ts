/**
 * Update Upload API Route
 *
 * POST /api/updates/upload
 *
 * Uploads a new build to the update server
 * RESTRICTED TO INTERNAL NETWORK ONLY (192.168.10.x, 192.168.11.x)
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

export const dynamic = 'force-dynamic';

// Maximum upload size (500MB)
export const maxDuration = 300; // 5 minutes timeout for large uploads

// Builds storage directory (configurable via env)
const BUILDS_DIR = process.env.BUILDS_DIR || '/var/www/screencontrol/builds';

// Internal network prefixes
const INTERNAL_NETWORKS = ['192.168.10.', '192.168.11.', '127.0.0.1', '::1'];

// Map platform values to Prisma enum
const platformMap: Record<string, 'WINDOWS' | 'MACOS' | 'LINUX'> = {
  windows: 'WINDOWS',
  macos: 'MACOS',
  linux: 'LINUX',
};

/**
 * Check if request comes from internal network
 */
function isInternalNetwork(request: NextRequest): boolean {
  // Get client IP from various headers (in order of preference)
  const forwardedFor = request.headers.get('x-forwarded-for');
  const realIp = request.headers.get('x-real-ip');
  const cfConnectingIp = request.headers.get('cf-connecting-ip');

  // Use the most reliable IP source
  let clientIp = cfConnectingIp || realIp || (forwardedFor?.split(',')[0].trim());

  // In development, also check the request IP
  if (!clientIp) {
    // Next.js doesn't expose raw IP in request, would need middleware
    // For now, check if behind reverse proxy by looking at headers
    const host = request.headers.get('host');
    if (host?.includes('localhost') || host?.includes('127.0.0.1')) {
      return true;
    }
  }

  if (!clientIp) {
    return false;
  }

  // Check against internal network prefixes
  return INTERNAL_NETWORKS.some((prefix) => clientIp.startsWith(prefix));
}

export async function POST(request: NextRequest) {
  // Check internal network restriction
  if (!isInternalNetwork(request)) {
    console.warn(
      `[Updates] Upload rejected from external IP: ${request.headers.get('x-forwarded-for') || 'unknown'}`
    );
    return NextResponse.json(
      { error: 'Upload restricted to internal network (192.168.10.x, 192.168.11.x)' },
      { status: 403 }
    );
  }

  try {
    const formData = await request.formData();

    // Required fields
    const version = formData.get('version') as string;
    const platform = (formData.get('platform') as string)?.toLowerCase();
    const arch = (formData.get('arch') as string)?.toLowerCase();
    const file = formData.get('file') as File;

    // Optional fields
    const releaseNotes = formData.get('releaseNotes') as string | null;
    const channel = ((formData.get('channel') as string) || 'STABLE').toUpperCase() as 'STABLE' | 'BETA' | 'DEV';
    const minVersion = formData.get('minVersion') as string | null;

    // Validate required fields
    if (!version || !platform || !arch || !file) {
      return NextResponse.json(
        { error: 'Missing required fields: version, platform, arch, file' },
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

    // Validate channel
    if (!['STABLE', 'BETA', 'DEV'].includes(channel)) {
      return NextResponse.json(
        { error: `Invalid channel: ${channel}. Must be STABLE, BETA, or DEV` },
        { status: 400 }
      );
    }

    // Read file content
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // Calculate SHA256 hash
    const sha256 = crypto.createHash('sha256').update(buffer).digest('hex');

    // Create storage directory structure
    const platformDir = `${platform}-${arch}`;
    const storagePath = path.join(platformDir, file.name);
    const fullDir = path.join(BUILDS_DIR, platformDir);

    // Ensure directory exists
    if (!fs.existsSync(fullDir)) {
      fs.mkdirSync(fullDir, { recursive: true });
    }

    // Write file
    const fullPath = path.join(BUILDS_DIR, storagePath);
    fs.writeFileSync(fullPath, buffer);

    console.log(`[Updates] Uploaded: ${storagePath} (${buffer.length} bytes, SHA256: ${sha256})`);

    // Create or update version record
    let agentVersion = await prisma.agentVersion.findUnique({
      where: { version },
    });

    if (!agentVersion) {
      agentVersion = await prisma.agentVersion.create({
        data: {
          version,
          channel,
          releaseNotes,
          minVersion,
        },
      });
      console.log(`[Updates] Created new version: ${version}`);
    } else {
      // Update release notes and channel if provided
      agentVersion = await prisma.agentVersion.update({
        where: { version },
        data: {
          releaseNotes: releaseNotes || agentVersion.releaseNotes,
          channel,
          minVersion: minVersion || agentVersion.minVersion,
        },
      });
    }

    // Check if build already exists
    const existingBuild = await prisma.agentBuild.findFirst({
      where: {
        versionId: agentVersion.id,
        platform: prismaPlatform,
        arch,
      },
    });

    if (existingBuild) {
      // Update existing build
      await prisma.agentBuild.update({
        where: { id: existingBuild.id },
        data: {
          filename: file.name,
          fileSize: buffer.length,
          sha256,
          storagePath,
        },
      });
      console.log(`[Updates] Updated build: ${platform}-${arch} v${version}`);
    } else {
      // Create new build
      await prisma.agentBuild.create({
        data: {
          versionId: agentVersion.id,
          platform: prismaPlatform,
          arch,
          filename: file.name,
          fileSize: buffer.length,
          sha256,
          storagePath,
        },
      });
      console.log(`[Updates] Created build: ${platform}-${arch} v${version}`);
    }

    return NextResponse.json({
      success: true,
      version,
      platform,
      arch,
      filename: file.name,
      fileSize: buffer.length,
      sha256,
      storagePath,
    });
  } catch (error) {
    console.error('[Updates] Upload error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
