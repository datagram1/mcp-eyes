/**
 * Debug Agents API Route
 *
 * POST /api/debug/agents - Create mock agent
 * DELETE /api/debug/agents - Delete all mock agents
 *
 * Only available in debug mode (development or DEBUG_MODE=true)
 * SECURITY: Only accessible from LAN networks (192.168.10.x, 192.168.11.x)
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/prisma';
import { isDebugMode, isDebugUser, generateMockMachineId, generateMockFingerprint, TEST_AGENT_CONFIGS } from '@/lib/debug';
import { isLANRequest, getClientIP } from '@/lib/ip-security';
import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';

export const dynamic = 'force-dynamic';

/**
 * Generate a license key format: SC-XXXX-XXXX-XXXX-XXXX
 */
function generateLicenseKey(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const segments = [];
  for (let i = 0; i < 4; i++) {
    let segment = '';
    for (let j = 0; j < 4; j++) {
      segment += chars[Math.floor(Math.random() * chars.length)];
    }
    segments.push(segment);
  }
  return `SC-${segments.join('-')}`;
}

/**
 * Find or create a debug license for mock agents
 */
async function getOrCreateDebugLicense(userId: string) {
  // Look for existing debug license
  let license = await prisma.license.findFirst({
    where: {
      userId,
      productType: 'AGENT',
      status: 'ACTIVE',
    },
    orderBy: { createdAt: 'desc' },
  });

  // Create one if not found
  if (!license) {
    license = await prisma.license.create({
      data: {
        userId,
        licenseKey: generateLicenseKey(),
        productType: 'AGENT',
        status: 'ACTIVE',
        maxConcurrentAgents: 100, // High limit for debug
        isTrial: false,
      },
    });
  }

  return license;
}

/**
 * POST /api/debug/agents - Create mock agent
 */
export async function POST(request: NextRequest) {
  // Security: Check IP address first
  if (!isLANRequest(request)) {
    const clientIP = getClientIP(request);
    console.warn(`[Debug API] Blocked request from non-LAN IP: ${clientIP}`);
    return NextResponse.json(
      { error: 'Access denied - debug API only accessible from LAN (192.168.10.x, 192.168.11.x)' },
      { status: 403 }
    );
  }

  // Check debug mode
  if (!isDebugMode()) {
    return NextResponse.json(
      { error: 'Debug mode not enabled' },
      { status: 403 }
    );
  }

  const session = await getServerSession();
  if (!session?.user?.email) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    );
  }

  // Check if user is allowed to use debug features
  if (!isDebugUser(session.user.email)) {
    return NextResponse.json(
      { error: 'Debug access not allowed for this user' },
      { status: 403 }
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

  try {
    const body = await request.json();
    const { hostname, osType = 'macos', state = 'PENDING' } = body;

    if (!hostname || typeof hostname !== 'string') {
      return NextResponse.json(
        { error: 'Hostname is required' },
        { status: 400 }
      );
    }

    // Get OS config
    const osKey = osType.toLowerCase() as keyof typeof TEST_AGENT_CONFIGS;
    const osConfig = TEST_AGENT_CONFIGS[osKey] || TEST_AGENT_CONFIGS.macOS;

    // Validate state
    const validStates = ['PENDING', 'ACTIVE', 'BLOCKED', 'EXPIRED'];
    if (!validStates.includes(state)) {
      return NextResponse.json(
        { error: 'Invalid state' },
        { status: 400 }
      );
    }

    // Get or create debug license
    const license = await getOrCreateDebugLicense(user.id);

    // Generate fingerprint data
    const fingerprintRaw = generateMockFingerprint();
    const machineFingerprint = crypto
      .createHash('sha256')
      .update(JSON.stringify(fingerprintRaw))
      .digest('hex');

    // Create mock agent
    const agent = await prisma.agent.create({
      data: {
        licenseId: license.id,
        agentKey: uuidv4(),
        machineId: generateMockMachineId(),
        machineFingerprint,
        fingerprintRaw: fingerprintRaw as object,
        hostname,
        osType: osConfig.osType.toUpperCase() as 'MACOS' | 'WINDOWS' | 'LINUX',
        osVersion: osConfig.osVersion,
        arch: osConfig.arch,
        agentVersion: osConfig.agentVersion,
        state: state as 'PENDING' | 'ACTIVE' | 'BLOCKED' | 'EXPIRED',
        status: 'OFFLINE',
        powerState: 'ACTIVE',
        ownerUserId: user.id,
        activatedAt: state === 'ACTIVE' ? new Date() : null,
        isMock: true,
      },
    });

    return NextResponse.json({
      success: true,
      agent: {
        id: agent.id,
        hostname: agent.hostname,
        osType: agent.osType,
        state: agent.state,
        status: agent.status,
      },
    });
  } catch (err) {
    console.error('[Debug] Error creating mock agent:', err);
    return NextResponse.json(
      { error: 'Failed to create mock agent' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/debug/agents - Delete all mock agents
 */
export async function DELETE(request: NextRequest) {
  // Security: Check IP address first
  if (!isLANRequest(request)) {
    const clientIP = getClientIP(request);
    console.warn(`[Debug API] Blocked request from non-LAN IP: ${clientIP}`);
    return NextResponse.json(
      { error: 'Access denied - debug API only accessible from LAN (192.168.10.x, 192.168.11.x)' },
      { status: 403 }
    );
  }

  // Check debug mode
  if (!isDebugMode()) {
    return NextResponse.json(
      { error: 'Debug mode not enabled' },
      { status: 403 }
    );
  }

  const session = await getServerSession();
  if (!session?.user?.email) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    );
  }

  if (!isDebugUser(session.user.email)) {
    return NextResponse.json(
      { error: 'Debug access not allowed for this user' },
      { status: 403 }
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

  try {
    // Delete all mock agents for this user
    const result = await prisma.agent.deleteMany({
      where: {
        ownerUserId: user.id,
        isMock: true,
      },
    });

    return NextResponse.json({
      success: true,
      deleted: result.count,
    });
  } catch (err) {
    console.error('[Debug] Error deleting mock agents:', err);
    return NextResponse.json(
      { error: 'Failed to delete mock agents' },
      { status: 500 }
    );
  }
}
