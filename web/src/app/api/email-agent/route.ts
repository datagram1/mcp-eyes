/**
 * Email Agent API
 *
 * GET  - Get email agent status and recent tasks
 * POST - Process a test email manually
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/prisma';
import { getEmailAgentService } from '@/lib/email-agent';

export async function GET(request: NextRequest) {
  try {
    // Check authentication
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get email agent status
    const service = getEmailAgentService();
    const status = service.getStatus();

    // Get recent email tasks
    const recentTasks = await prisma.emailTask.findMany({
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: {
        id: true,
        fromAddress: true,
        fromName: true,
        subject: true,
        status: true,
        priority: true,
        llmProvider: true,
        createdAt: true,
        processedAt: true,
        completedAt: true,
        errorMessage: true,
      },
    });

    // Get task statistics
    const stats = await prisma.emailTask.groupBy({
      by: ['status'],
      _count: true,
    });

    return NextResponse.json({
      service: status,
      recentTasks,
      stats: stats.reduce(
        (acc, s) => {
          acc[s.status] = s._count;
          return acc;
        },
        {} as Record<string, number>
      ),
    });
  } catch (error) {
    console.error('[API] Email agent error:', error);
    return NextResponse.json(
      { error: 'Failed to get email agent status' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    // Check authentication
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { action } = body;

    const service = getEmailAgentService();

    switch (action) {
      case 'start':
        // User clicked Start button - userInitiated=true clears stoppedByUser flag
        const started = await service.start(true);
        return NextResponse.json({ success: started, status: service.getStatus() });

      case 'stop':
        // User clicked Stop button - userInitiated=true sets stoppedByUser flag
        service.stop(true);
        return NextResponse.json({ success: true, status: service.getStatus() });

      case 'status':
        return NextResponse.json({ status: service.getStatus() });

      default:
        return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
    }
  } catch (error) {
    console.error('[API] Email agent action error:', error);
    return NextResponse.json(
      { error: 'Failed to perform action' },
      { status: 500 }
    );
  }
}
