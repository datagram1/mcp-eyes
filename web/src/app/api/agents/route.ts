/**
 * Agents API Route
 *
 * GET /api/agents - List all connected agents
 */

import { NextResponse } from 'next/server';
import { agentRegistry } from '@/lib/control-server';

export async function GET() {
  const agents = agentRegistry.getAllAgents().map((agent) => ({
    id: agent.id,
    machineId: agent.machineId,
    machineName: agent.machineName,
    customerId: agent.customerId,
    osType: agent.osType,
    osVersion: agent.osVersion,
    arch: agent.arch,
    agentVersion: agent.agentVersion,
    state: agent.state,
    powerState: agent.powerState,
    isScreenLocked: agent.isScreenLocked,
    currentTask: agent.currentTask,
    isInternal: agent.isInternal,
    connectedAt: agent.connectedAt,
    lastPing: agent.lastPing,
    lastActivity: agent.lastActivity,
  }));

  return NextResponse.json({
    agents,
    stats: agentRegistry.getStats(),
  });
}
