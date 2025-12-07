import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { generateEmailVerificationToken } from '@/lib/auth';
import { sendVerificationEmail } from '@/lib/email';

export async function POST(request: Request) {
  try {
    const { email } = await request.json();

    if (!email) {
      return NextResponse.json(
        { error: 'Email is required' },
        { status: 400 }
      );
    }

    // Find user
    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    });

    // Always return success to prevent email enumeration
    if (!user || user.emailVerified) {
      return NextResponse.json({
        success: true,
        message: 'If an unverified account exists, a verification email has been sent.',
      });
    }

    // Generate new verification token
    const { token, expires } = generateEmailVerificationToken();

    // Update user with new token
    await prisma.user.update({
      where: { id: user.id },
      data: {
        emailVerificationToken: token,
        emailVerificationExpires: expires,
      },
    });

    // Send verification email
    await sendVerificationEmail(user.email, token, user.name || undefined);

    return NextResponse.json({
      success: true,
      message: 'Verification email sent.',
    });
  } catch (error) {
    console.error('Resend verification error:', error);
    return NextResponse.json(
      { error: 'Failed to send verification email' },
      { status: 500 }
    );
  }
}
