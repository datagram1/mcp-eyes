/**
 * Email Agent Settings API
 *
 * GET  - Get current settings
 * PUT  - Update settings
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

    // Get settings from database (there should be only one record)
    let settings = await prisma.emailAgentSettings.findFirst();

    // If no settings exist, return defaults from env
    if (!settings) {
      return NextResponse.json({
        id: null,
        imapHost: process.env.IMAP_HOST || '',
        imapPort: parseInt(process.env.IMAP_PORT || '143', 10),
        imapUser: process.env.IMAP_USER || '',
        imapPassword: '', // Don't expose password
        imapTls: process.env.IMAP_TLS === 'true',
        imapMailbox: 'INBOX',
        llmProvider: 'vllm',
        llmBaseUrl: process.env.VLLM_BASE_URL || '',
        llmApiKey: '', // Don't expose API key
        llmModel: process.env.VLLM_MODEL || '',
        supervisorProvider: 'vllm',
        supervisorBaseUrl: process.env.VLLM_BASE_URL || '',
        supervisorApiKey: '',
        supervisorModel: '',
        isEnabled: false,
        processInterval: 60,
        autoReply: true,
        replySmtpHost: process.env.REPLY_SMTP_HOST || '',
        replySmtpPort: parseInt(process.env.REPLY_SMTP_PORT || '25', 10),
        replySmtpUser: '',
        replySmtpPass: '',
        replySmtpTls: false,
        replyFromEmail: process.env.REPLY_FROM_EMAIL || '',
        replyFromName: 'ScreenControl AI',
        allowedSenders: [],
        systemPrompt: null,
      });
    }

    // Mask sensitive fields
    return NextResponse.json({
      ...settings,
      imapPassword: settings.imapPassword ? '********' : '',
      llmApiKey: settings.llmApiKey ? '********' : '',
      replySmtpPass: settings.replySmtpPass ? '********' : '',
      supervisorApiKey: settings.supervisorApiKey ? '********' : '',
    });
  } catch (error) {
    console.error('[API] Get email settings error:', error);
    return NextResponse.json(
      { error: 'Failed to get settings' },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    // Check authentication
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();

    // Validate required fields
    if (!body.imapHost || !body.imapUser) {
      return NextResponse.json(
        { error: 'IMAP host and user are required' },
        { status: 400 }
      );
    }

    // Check if settings already exist
    const existing = await prisma.emailAgentSettings.findFirst();

    // Prepare data, preserving existing passwords if not changed
    const data = {
      imapHost: body.imapHost,
      imapPort: body.imapPort || 143,
      imapUser: body.imapUser,
      imapPassword:
        body.imapPassword && body.imapPassword !== '********'
          ? body.imapPassword
          : existing?.imapPassword || '',
      imapTls: body.imapTls ?? false,
      imapMailbox: body.imapMailbox || 'INBOX',
      llmProvider: body.llmProvider || 'vllm',
      llmBaseUrl: body.llmBaseUrl || null,
      llmApiKey:
        body.llmApiKey && body.llmApiKey !== '********'
          ? body.llmApiKey
          : existing?.llmApiKey || null,
      llmModel: body.llmModel || null,
      // Supervisor configuration for managed claude-code mode
      supervisorProvider: body.supervisorProvider || 'vllm',
      supervisorBaseUrl: body.supervisorBaseUrl || null,
      supervisorApiKey:
        body.supervisorApiKey && body.supervisorApiKey !== '********'
          ? body.supervisorApiKey
          : existing?.supervisorApiKey || null,
      supervisorModel: body.supervisorModel || null,
      isEnabled: body.isEnabled ?? false,
      processInterval: body.processInterval || 60,
      autoReply: body.autoReply ?? true,
      replySmtpHost: body.replySmtpHost || null,
      replySmtpPort: body.replySmtpPort || 25,
      replySmtpUser: body.replySmtpUser || null,
      replySmtpPass:
        body.replySmtpPass && body.replySmtpPass !== '********'
          ? body.replySmtpPass
          : existing?.replySmtpPass || null,
      replySmtpTls: body.replySmtpTls ?? false,
      replyFromEmail: body.replyFromEmail || null,
      replyFromName: body.replyFromName || 'ScreenControl AI',
      allowedSenders: body.allowedSenders || [],
      systemPrompt: body.systemPrompt || null,
    };

    let settings;
    if (existing) {
      settings = await prisma.emailAgentSettings.update({
        where: { id: existing.id },
        data,
      });
    } else {
      settings = await prisma.emailAgentSettings.create({
        data,
      });
    }

    // Restart email agent with new settings if enabled
    const service = getEmailAgentService();
    if (settings.isEnabled) {
      service.stop();
      // Update LLM config
      service.setLLMConfig({
        provider: settings.llmProvider as 'vllm' | 'claude' | 'openai',
        baseUrl: settings.llmBaseUrl || undefined,
        apiKey: settings.llmApiKey || undefined,
        model: settings.llmModel || undefined,
      });
      await service.start();
    } else {
      service.stop();
    }

    return NextResponse.json({
      success: true,
      settings: {
        ...settings,
        imapPassword: '********',
        llmApiKey: settings.llmApiKey ? '********' : '',
        replySmtpPass: settings.replySmtpPass ? '********' : '',
      },
    });
  } catch (error) {
    console.error('[API] Update email settings error:', error);
    return NextResponse.json(
      { error: 'Failed to update settings' },
      { status: 500 }
    );
  }
}
