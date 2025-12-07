/**
 * Database Service for Control Server
 *
 * Handles database operations for agents, connections, and command logging.
 */

import { prisma } from '@/lib/db';
import {
  ConnectedAgent,
  AgentMessage,
  PowerState,
  AgentState,
  OSType,
} from './types';
import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';

// ═══════════════════════════════════════════════════════════════════════════
// Agent Database Operations
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Find or create an agent record in the database
 */
export async function findOrCreateAgent(
  msg: AgentMessage,
  remoteAddress: string
): Promise<{
  agentDbId: string;
  licenseStatus: 'active' | 'pending' | 'expired' | 'blocked';
  licenseUuid: string | null;
  isNew: boolean;
}> {
  // First, try to find existing agent by customerId + machineId
  let agent = await prisma.agent.findFirst({
    where: {
      customerId: msg.customerId || undefined,
      machineId: msg.machineId || undefined,
    },
    include: {
      license: true,
    },
  });

  let isNew = false;

  if (!agent) {
    // Create new agent - need a license first
    // For now, create a default license for the agent
    // In production, this would be tied to the customer's subscription

    // First, we need a user. For development, use or create a default user
    let defaultUser = await prisma.user.findFirst({
      where: { email: 'system@screencontrol.local' },
    });

    if (!defaultUser) {
      defaultUser = await prisma.user.create({
        data: {
          email: 'system@screencontrol.local',
          name: 'System User',
          accountStatus: 'ACTIVE',
        },
      });
    }

    // Create a license for the new agent
    const license = await prisma.license.create({
      data: {
        userId: defaultUser.id,
        licenseKey: generateLicenseKey(),
        productType: 'AGENT',
        status: 'ACTIVE',
        isTrial: true,
        trialStarted: new Date(),
        trialEnds: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000), // 14 days
      },
    });

    // Create the agent
    agent = await prisma.agent.create({
      data: {
        licenseId: license.id,
        agentKey: `agent_${uuidv4()}`,
        ownerUserId: defaultUser.id,
        customerId: msg.customerId,
        machineId: msg.machineId,
        machineFingerprint: computeFingerprint(msg.fingerprint),
        fingerprintRaw: msg.fingerprint as object,
        hostname: msg.machineName || msg.fingerprint?.hostname,
        localUsername: msg.fingerprint?.username,
        osType: parseOSType(msg.osType),
        osVersion: msg.osVersion,
        arch: msg.arch,
        agentVersion: msg.agentVersion,
        cpuModel: msg.fingerprint?.cpuModel,
        ipAddress: remoteAddress,
        status: 'ONLINE',
        state: 'PENDING',
        powerState: 'PASSIVE',
        firstSeenAt: new Date(),
        lastSeenAt: new Date(),
      },
      include: {
        license: true,
      },
    });

    isNew = true;
  } else {
    // Update existing agent with new connection info
    agent = await prisma.agent.update({
      where: { id: agent.id },
      data: {
        hostname: msg.machineName || msg.fingerprint?.hostname || agent.hostname,
        osVersion: msg.osVersion || agent.osVersion,
        arch: msg.arch || agent.arch,
        agentVersion: msg.agentVersion || agent.agentVersion,
        ipAddress: remoteAddress,
        status: 'ONLINE',
        lastSeenAt: new Date(),
      },
      include: {
        license: true,
      },
    });

    // Check for fingerprint changes
    const newFingerprint = computeFingerprint(msg.fingerprint);
    if (agent.machineFingerprint !== newFingerprint && newFingerprint) {
      await logFingerprintChange(agent.id, {
        changeType: 'hardware_change',
        previousValue: agent.machineFingerprint,
        newValue: newFingerprint,
        actionTaken: 'logged',
      });

      await prisma.agent.update({
        where: { id: agent.id },
        data: {
          machineFingerprint: newFingerprint,
          fingerprintRaw: msg.fingerprint as object,
        },
      });
    }
  }

  // Determine license status
  let licenseStatus: 'active' | 'pending' | 'expired' | 'blocked' = 'pending';

  if (agent.state === 'BLOCKED') {
    licenseStatus = 'blocked';
  } else if (agent.state === 'EXPIRED') {
    licenseStatus = 'expired';
  } else if (agent.state === 'ACTIVE') {
    licenseStatus = 'active';
  } else if (agent.license) {
    // Check license validity
    if (agent.license.status === 'ACTIVE') {
      if (agent.license.validUntil && agent.license.validUntil < new Date()) {
        licenseStatus = 'expired';
      } else if (agent.license.isTrial && agent.license.trialEnds && agent.license.trialEnds < new Date()) {
        licenseStatus = 'expired';
      } else {
        licenseStatus = 'active';
      }
    } else if (agent.license.status === 'EXPIRED') {
      licenseStatus = 'expired';
    } else if (agent.license.status === 'SUSPENDED') {
      licenseStatus = 'blocked';
    }
  }

  return {
    agentDbId: agent.id,
    licenseStatus,
    licenseUuid: agent.licenseUuid,
    isNew,
  };
}

/**
 * Update agent status when connection is established
 */
export async function markAgentOnline(
  agentDbId: string,
  sessionInfo: {
    ipAddress: string;
    powerState?: PowerState;
  }
): Promise<string> {
  // Create a new session
  const session = await prisma.agentSession.create({
    data: {
      agentId: agentDbId,
      ipAddress: sessionInfo.ipAddress,
    },
  });

  // Update agent status
  await prisma.agent.update({
    where: { id: agentDbId },
    data: {
      status: 'ONLINE',
      powerState: sessionInfo.powerState || 'PASSIVE',
      lastSeenAt: new Date(),
    },
  });

  return session.id;
}

/**
 * Update agent status when connection is lost
 */
export async function markAgentOffline(
  agentDbId: string,
  sessionId?: string
): Promise<void> {
  // Update agent status
  await prisma.agent.update({
    where: { id: agentDbId },
    data: {
      status: 'OFFLINE',
      currentTask: null,
    },
  });

  // Close the session if we have one
  if (sessionId) {
    const session = await prisma.agentSession.findUnique({
      where: { id: sessionId },
    });

    if (session) {
      const durationMs = Date.now() - session.sessionStart.getTime();
      await prisma.agentSession.update({
        where: { id: sessionId },
        data: {
          sessionEnd: new Date(),
          durationMinutes: Math.round(durationMs / 60000),
        },
      });
    }
  }
}

/**
 * Update agent heartbeat
 */
export async function updateAgentHeartbeat(
  agentDbId: string,
  status: {
    powerState?: PowerState;
    isScreenLocked?: boolean;
    currentTask?: string | null;
  }
): Promise<void> {
  await prisma.agent.update({
    where: { id: agentDbId },
    data: {
      lastSeenAt: new Date(),
      lastActivity: new Date(),
      powerState: status.powerState,
      isScreenLocked: status.isScreenLocked,
      currentTask: status.currentTask,
    },
  });
}

/**
 * Activate an agent (move from PENDING to ACTIVE)
 */
export async function activateAgent(agentDbId: string): Promise<string> {
  const licenseUuid = `lic_${uuidv4()}`;

  await prisma.agent.update({
    where: { id: agentDbId },
    data: {
      state: 'ACTIVE',
      licenseUuid,
      activatedAt: new Date(),
    },
  });

  return licenseUuid;
}

// ═══════════════════════════════════════════════════════════════════════════
// Command Logging
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Log a command being sent to an agent
 */
export async function logCommand(data: {
  agentId: string;
  aiConnectionId?: string;
  method: string;
  params?: Record<string, unknown>;
  toolName?: string;
  ipAddress?: string;
}): Promise<string> {
  const log = await prisma.commandLog.create({
    data: {
      agentId: data.agentId,
      aiConnectionId: data.aiConnectionId,
      method: data.method,
      params: data.params as object,
      toolName: data.toolName,
      status: 'SENT',
      ipAddress: data.ipAddress,
    },
  });

  return log.id;
}

/**
 * Update command log with result
 */
export async function updateCommandLog(
  logId: string,
  result: {
    status: 'COMPLETED' | 'FAILED' | 'TIMEOUT';
    result?: unknown;
    errorMessage?: string;
  }
): Promise<void> {
  const log = await prisma.commandLog.findUnique({
    where: { id: logId },
  });

  if (log) {
    const durationMs = Date.now() - log.startedAt.getTime();

    await prisma.commandLog.update({
      where: { id: logId },
      data: {
        status: result.status,
        result: result.result as object,
        errorMessage: result.errorMessage,
        completedAt: new Date(),
        durationMs,
      },
    });
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// AI Connection Tracking
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Create or update an AI connection
 */
export async function trackAIConnection(data: {
  sessionId: string;
  userId?: string;
  clientName?: string;
  clientVersion?: string;
  ipAddress?: string;
  userAgent?: string;
}): Promise<string> {
  // Find existing by session ID
  let connection = await prisma.aIConnection.findUnique({
    where: { sessionId: data.sessionId },
  });

  if (connection) {
    // Update existing
    await prisma.aIConnection.update({
      where: { id: connection.id },
      data: {
        lastActivityAt: new Date(),
        isActive: true,
      },
    });
    return connection.id;
  }

  // Need a user ID - for now use system user
  let userId = data.userId;
  if (!userId) {
    const systemUser = await prisma.user.findFirst({
      where: { email: 'system@screencontrol.local' },
    });
    userId = systemUser?.id;
  }

  if (!userId) {
    throw new Error('No user available for AI connection');
  }

  // Create new connection
  connection = await prisma.aIConnection.create({
    data: {
      sessionId: data.sessionId,
      userId,
      clientName: data.clientName,
      clientVersion: data.clientVersion,
      ipAddress: data.ipAddress,
      userAgent: data.userAgent,
      isAuthorized: true, // Auto-authorize for now
      authorizedAt: new Date(),
    },
  });

  return connection.id;
}

/**
 * Mark AI connection as disconnected
 */
export async function closeAIConnection(sessionId: string): Promise<void> {
  await prisma.aIConnection.updateMany({
    where: { sessionId },
    data: {
      isActive: false,
      disconnectedAt: new Date(),
    },
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// Fingerprint Change Logging
// ═══════════════════════════════════════════════════════════════════════════

async function logFingerprintChange(
  agentId: string,
  data: {
    changeType: string;
    previousValue?: string;
    newValue?: string;
    actionTaken: string;
    details?: Record<string, unknown>;
  }
): Promise<void> {
  await prisma.fingerprintChange.create({
    data: {
      agentId,
      changeType: data.changeType,
      previousValue: data.previousValue,
      newValue: data.newValue,
      actionTaken: data.actionTaken,
      details: data.details as object,
    },
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// Utility Functions
// ═══════════════════════════════════════════════════════════════════════════

function generateLicenseKey(): string {
  const segments = [];
  for (let i = 0; i < 4; i++) {
    segments.push(
      crypto.randomBytes(2).toString('hex').toUpperCase()
    );
  }
  return `SC-${segments.join('-')}`;
}

function computeFingerprint(data?: AgentMessage['fingerprint']): string {
  if (!data) return '';

  const parts = [
    data.cpuModel || '',
    data.diskSerial || '',
    data.motherboardUuid || '',
    ...(data.macAddresses || []).sort(),
  ].filter(Boolean);

  if (parts.length === 0) return '';

  return crypto
    .createHash('sha256')
    .update(parts.join('|'))
    .digest('hex');
}

function parseOSType(osType?: string): 'WINDOWS' | 'MACOS' | 'LINUX' {
  if (!osType) return 'MACOS';

  const lower = osType.toLowerCase();
  if (lower.includes('windows') || lower === 'win32') return 'WINDOWS';
  if (lower.includes('linux')) return 'LINUX';
  return 'MACOS';
}

// ═══════════════════════════════════════════════════════════════════════════
// Activity Pattern Tracking
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Record activity for power state prediction
 */
export async function recordActivity(userId: string): Promise<void> {
  const hour = new Date().getHours();

  // Find or create pattern record
  let pattern = await prisma.customerActivityPattern.findUnique({
    where: { userId },
  });

  if (!pattern) {
    pattern = await prisma.customerActivityPattern.create({
      data: { userId },
    });
  }

  // Increment the hour counter
  const hourlyActivity = [...pattern.hourlyActivity];
  hourlyActivity[hour] = (hourlyActivity[hour] || 0) + 1;

  // Update and recalculate quiet hours
  const quietHours = detectQuietHours(hourlyActivity);

  await prisma.customerActivityPattern.update({
    where: { userId },
    data: {
      hourlyActivity,
      quietHoursStart: quietHours.start,
      quietHoursEnd: quietHours.end,
    },
  });
}

/**
 * Detect quiet hours from activity pattern
 */
function detectQuietHours(hourlyActivity: number[]): {
  start: number | null;
  end: number | null;
} {
  const total = hourlyActivity.reduce((a, b) => a + b, 0);
  if (total < 100) {
    // Not enough data yet
    return { start: null, end: null };
  }

  // Find the longest consecutive stretch of low activity
  const threshold = total / 24 / 4; // 25% of average
  let longestStart = -1;
  let longestEnd = -1;
  let longestLength = 0;

  let currentStart = -1;
  let currentLength = 0;

  for (let i = 0; i < 48; i++) {
    // Loop twice to handle wrap-around
    const hour = i % 24;
    if (hourlyActivity[hour] < threshold) {
      if (currentStart === -1) {
        currentStart = hour;
      }
      currentLength++;
    } else {
      if (currentLength > longestLength) {
        longestStart = currentStart;
        longestEnd = (currentStart + currentLength - 1) % 24;
        longestLength = currentLength;
      }
      currentStart = -1;
      currentLength = 0;
    }
  }

  // Check final stretch
  if (currentLength > longestLength) {
    longestStart = currentStart;
    longestEnd = (currentStart + currentLength - 1) % 24;
  }

  if (longestLength >= 4) {
    // At least 4 hours of quiet time
    return { start: longestStart, end: longestEnd };
  }

  return { start: null, end: null };
}
