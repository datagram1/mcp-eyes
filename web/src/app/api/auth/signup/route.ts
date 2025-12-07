import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { hashPassword, generateEmailVerificationToken, generateLicenseKey, validatePasswordStrength } from '@/lib/auth';
import { sendVerificationEmail } from '@/lib/email';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { name, email, password, plan } = body;

    // Validate required fields
    if (!email || !password) {
      return NextResponse.json(
        { error: 'Email and password are required' },
        { status: 400 }
      );
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json(
        { error: 'Invalid email address' },
        { status: 400 }
      );
    }

    // Validate password strength
    const passwordValidation = validatePasswordStrength(password);
    if (!passwordValidation.valid) {
      return NextResponse.json(
        { error: passwordValidation.message },
        { status: 400 }
      );
    }

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    });

    if (existingUser) {
      return NextResponse.json(
        { error: 'An account with this email already exists' },
        { status: 400 }
      );
    }

    // Hash password
    const passwordHash = await hashPassword(password);

    // Generate verification token
    const { token: verificationToken, expires: verificationExpires } = generateEmailVerificationToken();

    // Generate license key
    const licenseKey = generateLicenseKey();

    // Calculate trial end date (30 days from now)
    const trialEnds = new Date();
    trialEnds.setDate(trialEnds.getDate() + 30);

    // Create user and license in a transaction
    const user = await prisma.$transaction(async (tx) => {
      // Create user
      const newUser = await tx.user.create({
        data: {
          email: email.toLowerCase(),
          name,
          passwordHash,
          oauthProvider: 'local',
          accountStatus: 'PENDING_VERIFICATION',
          emailVerificationToken: verificationToken,
          emailVerificationExpires: verificationExpires,
        },
      });

      // Create trial license
      await tx.license.create({
        data: {
          userId: newUser.id,
          licenseKey,
          productType: 'AGENT',
          maxConcurrentAgents: 1,
          status: 'ACTIVE',
          isTrial: true,
          trialStarted: new Date(),
          trialEnds,
        },
      });

      // Log the signup
      await tx.auditLog.create({
        data: {
          userId: newUser.id,
          action: 'user_signup',
          details: { plan: plan || 'trial', email: email.toLowerCase() },
        },
      });

      return newUser;
    });

    // Send verification email
    await sendVerificationEmail(email, verificationToken, name);

    return NextResponse.json({
      success: true,
      message: 'Account created. Please check your email to verify your account.',
      userId: user.id,
    });
  } catch (error) {
    console.error('Signup error:', error);
    return NextResponse.json(
      { error: 'Failed to create account. Please try again.' },
      { status: 500 }
    );
  }
}
