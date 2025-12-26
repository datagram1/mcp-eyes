/**
 * Claude Code Status API
 *
 * GET  - Check Claude Code configuration and login status
 */

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { checkClaudeCodeStatus } from '@/lib/llm/providers/claude-code';

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const status = await checkClaudeCodeStatus();
    return NextResponse.json(status);
  } catch (error) {
    console.error('[API] Claude Code status error:', error);
    return NextResponse.json(
      { configured: false, loggedIn: false, error: 'Failed to check status' },
      { status: 500 }
    );
  }
}
