/**
 * Agent Events SSE API
 *
 * GET /api/agents/events - Server-Sent Events for real-time agent updates
 */

import { NextRequest } from 'next/server';
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

/**
 * GET /api/agents/events
 * Server-Sent Events endpoint for real-time agent status updates
 *
 * Events sent:
 * - agent:status - When an agent comes online/offline
 * - agent:state - When an agent's state changes (PENDING/ACTIVE/BLOCKED/EXPIRED)
 * - agent:power - When an agent's power state changes (ACTIVE/PASSIVE/SLEEP)
 * - heartbeat - Periodic keepalive (every 30s)
 */
export async function GET(request: NextRequest) {
  const session = await getServerSession();
  if (!session?.user?.email) {
    return new Response('Unauthorized', { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    select: { id: true },
  });

  if (!user) {
    return new Response('User not found', { status: 404 });
  }

  // Create a readable stream for SSE
  const encoder = new TextEncoder();
  let intervalId: NodeJS.Timeout | null = null;
  let lastAgentStates = new Map<string, { status: string; state: string; powerState: string }>();

  const stream = new ReadableStream({
    async start(controller) {
      // Send initial connection message
      controller.enqueue(
        encoder.encode(`event: connected\ndata: ${JSON.stringify({ userId: user.id })}\n\n`)
      );

      // Get initial agent states
      const agents = await prisma.agent.findMany({
        where: { ownerUserId: user.id },
        select: { id: true, status: true, state: true, powerState: true },
      });

      for (const agent of agents) {
        lastAgentStates.set(agent.id, {
          status: agent.status,
          state: agent.state,
          powerState: agent.powerState,
        });
      }

      // Send initial state
      controller.enqueue(
        encoder.encode(`event: initial\ndata: ${JSON.stringify({
          agents: agents.map(a => ({
            id: a.id,
            status: a.status,
            state: a.state,
            powerState: a.powerState,
          })),
        })}\n\n`)
      );

      // Poll for changes every 5 seconds
      intervalId = setInterval(async () => {
        try {
          const currentAgents = await prisma.agent.findMany({
            where: { ownerUserId: user.id },
            select: { id: true, hostname: true, status: true, state: true, powerState: true },
          });

          const events: string[] = [];

          for (const agent of currentAgents) {
            const lastState = lastAgentStates.get(agent.id);

            if (!lastState) {
              // New agent
              events.push(`event: agent:new\ndata: ${JSON.stringify({
                id: agent.id,
                hostname: agent.hostname,
                status: agent.status,
                state: agent.state,
                powerState: agent.powerState,
              })}\n\n`);
              lastAgentStates.set(agent.id, {
                status: agent.status,
                state: agent.state,
                powerState: agent.powerState,
              });
              continue;
            }

            // Check for status change
            if (lastState.status !== agent.status) {
              events.push(`event: agent:status\ndata: ${JSON.stringify({
                id: agent.id,
                hostname: agent.hostname,
                oldStatus: lastState.status,
                newStatus: agent.status,
              })}\n\n`);
            }

            // Check for state change
            if (lastState.state !== agent.state) {
              events.push(`event: agent:state\ndata: ${JSON.stringify({
                id: agent.id,
                hostname: agent.hostname,
                oldState: lastState.state,
                newState: agent.state,
              })}\n\n`);
            }

            // Check for power state change
            if (lastState.powerState !== agent.powerState) {
              events.push(`event: agent:power\ndata: ${JSON.stringify({
                id: agent.id,
                hostname: agent.hostname,
                oldPowerState: lastState.powerState,
                newPowerState: agent.powerState,
              })}\n\n`);
            }

            // Update last known state
            lastAgentStates.set(agent.id, {
              status: agent.status,
              state: agent.state,
              powerState: agent.powerState,
            });
          }

          // Check for deleted agents
          for (const [agentId] of lastAgentStates) {
            if (!currentAgents.find(a => a.id === agentId)) {
              events.push(`event: agent:deleted\ndata: ${JSON.stringify({
                id: agentId,
              })}\n\n`);
              lastAgentStates.delete(agentId);
            }
          }

          // Send all events
          for (const event of events) {
            controller.enqueue(encoder.encode(event));
          }

          // Send heartbeat every 30 seconds (handled by counter)
        } catch (error) {
          console.error('[SSE] Error polling agents:', error);
        }
      }, 5000);

      // Send heartbeat every 30 seconds
      const heartbeatId = setInterval(() => {
        try {
          controller.enqueue(
            encoder.encode(`event: heartbeat\ndata: ${JSON.stringify({ time: Date.now() })}\n\n`)
          );
        } catch {
          // Stream might be closed
        }
      }, 30000);

      // Cleanup function stored for cancel
      (controller as unknown as { cleanup?: () => void }).cleanup = () => {
        if (intervalId) clearInterval(intervalId);
        clearInterval(heartbeatId);
      };
    },

    cancel() {
      if (intervalId) clearInterval(intervalId);
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}
