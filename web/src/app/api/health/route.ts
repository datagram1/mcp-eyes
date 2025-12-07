/**
 * Health Check API Route
 *
 * GET /api/health - Server health check
 */

import { NextResponse } from 'next/server';
import { agentRegistry } from '@/lib/control-server';

export async function GET() {
  const stats = agentRegistry.getStats();

  return NextResponse.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    agents: stats.totalConnected,
    stats,
  });
}
