/**
 * Email Task Detail API
 *
 * GET    - Get details of a specific email task
 * POST   - Retry a failed/skipped task
 * DELETE - Delete a task
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import { processEmail } from '@/lib/email-agent/processor';
import { getLLMConfigFromEnv } from '@/lib/llm';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Check authentication
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;

    const task = await prisma.emailTask.findUnique({
      where: { id },
      include: {
        attachments: true,
      },
    });

    if (!task) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }

    return NextResponse.json(task);
  } catch (error) {
    console.error('[API] Get email task error:', error);
    return NextResponse.json(
      { error: 'Failed to get email task' },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();
    const { action } = body;

    if (action !== 'retry') {
      return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
    }

    // Get the task
    const task = await prisma.emailTask.findUnique({
      where: { id },
    });

    if (!task) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }

    // Only allow retrying failed or skipped tasks
    if (!['FAILED', 'SKIPPED'].includes(task.status)) {
      return NextResponse.json(
        { error: 'Can only retry failed or skipped tasks' },
        { status: 400 }
      );
    }

    // Reset task status to PENDING (processor will handle duplicate reply prevention)
    await prisma.emailTask.update({
      where: { id },
      data: {
        status: 'PENDING',
        errorMessage: null,
        processedAt: null,
        executedAt: null,
        completedAt: null,
        // Note: responseSent is preserved so processor can check it
        llmAnalysis: null,
        llmActions: Prisma.JsonNull,
        executionLog: null,
      },
    });

    // Get LLM config from database or environment
    const settings = await prisma.emailAgentSettings.findFirst();
    let llmConfig;

    if (settings) {
      if (settings.llmProvider === 'claude-code-managed') {
        // Claude Code Managed needs supervisorConfig
        llmConfig = {
          provider: 'claude-code-managed' as const,
          baseUrl: settings.llmBaseUrl || undefined,
          apiKey: settings.llmApiKey || undefined,
          model: settings.llmModel || undefined,
          supervisorConfig: {
            provider: (settings.supervisorProvider as 'vllm' | 'claude' | 'openai') || 'vllm',
            baseUrl: settings.supervisorBaseUrl || settings.llmBaseUrl || undefined,
            apiKey: settings.supervisorApiKey || undefined,
            model: settings.supervisorModel || undefined,
          },
        };
      } else {
        llmConfig = {
          provider: settings.llmProvider as 'vllm' | 'claude' | 'openai',
          baseUrl: settings.llmBaseUrl || undefined,
          apiKey: settings.llmApiKey || undefined,
          model: settings.llmModel || undefined,
        };
      }
    } else {
      llmConfig = getLLMConfigFromEnv();
    }

    if (!llmConfig) {
      return NextResponse.json(
        { error: 'No LLM configured' },
        { status: 500 }
      );
    }

    // Reconstruct the parsed email format
    const parsedEmail = {
      uid: task.emailUid,
      messageId: task.messageId || undefined,
      from: task.fromName || task.fromAddress,
      fromAddress: task.fromAddress,
      to: task.toAddresses,
      subject: task.subject,
      textBody: task.body,
      htmlBody: '',
      date: task.receivedAt,
      attachments: [],
      inReplyTo: undefined,
      references: [],
    };

    // Process in background (don't await to return quickly)
    // Pass the existing task ID to update it instead of creating a new one
    processEmail(parsedEmail, llmConfig, id).catch((err) => {
      console.error('[API] Retry processing failed:', err);
    });

    return NextResponse.json({
      success: true,
      message: 'Task queued for retry',
    });
  } catch (error) {
    console.error('[API] Retry task error:', error);
    return NextResponse.json(
      { error: 'Failed to retry task' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;

    // Get the task first to check it exists
    const task = await prisma.emailTask.findUnique({
      where: { id },
    });

    if (!task) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }

    // Delete attachments first (cascade)
    await prisma.emailAttachment.deleteMany({
      where: { taskId: id },
    });

    // Delete the task
    await prisma.emailTask.delete({
      where: { id },
    });

    return NextResponse.json({
      success: true,
      message: 'Task deleted',
    });
  } catch (error) {
    console.error('[API] Delete task error:', error);
    return NextResponse.json(
      { error: 'Failed to delete task' },
      { status: 500 }
    );
  }
}
