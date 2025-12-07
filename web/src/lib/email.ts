import nodemailer from 'nodemailer';

const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_SERVER_HOST,
  port: parseInt(process.env.EMAIL_SERVER_PORT || '25'),
  secure: false, // true for 465, false for other ports
  // No auth needed for direct SMTP relay
  ...(process.env.EMAIL_SERVER_USER && {
    auth: {
      user: process.env.EMAIL_SERVER_USER,
      pass: process.env.EMAIL_SERVER_PASSWORD,
    },
  }),
});

const FROM_EMAIL = process.env.EMAIL_FROM || 'noreply@screencontrol.knws.co.uk';
const APP_URL = process.env.APP_URL || 'http://localhost:3000';

interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

export async function sendEmail({ to, subject, html, text }: SendEmailOptions) {
  try {
    const info = await transporter.sendMail({
      from: `"ScreenControl" <${FROM_EMAIL}>`,
      to,
      subject,
      html,
      text: text || html.replace(/<[^>]*>/g, ''),
    });
    console.log('Email sent:', info.messageId);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('Failed to send email:', error);
    return { success: false, error };
  }
}

export async function sendVerificationEmail(email: string, token: string, name?: string) {
  const verifyUrl = `${APP_URL}/auth/verify-email?token=${token}`;

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f4f4f5; margin: 0; padding: 20px;">
      <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
        <div style="background: linear-gradient(135deg, #3b82f6, #8b5cf6); padding: 32px; text-align: center;">
          <h1 style="color: #ffffff; margin: 0; font-size: 24px;">ScreenControl</h1>
        </div>
        <div style="padding: 32px;">
          <h2 style="color: #1f2937; margin: 0 0 16px;">Verify your email address</h2>
          <p style="color: #4b5563; line-height: 1.6; margin: 0 0 24px;">
            Hi${name ? ` ${name}` : ''},<br><br>
            Thanks for signing up for ScreenControl! Please verify your email address by clicking the button below.
          </p>
          <div style="text-align: center; margin: 32px 0;">
            <a href="${verifyUrl}" style="display: inline-block; background-color: #3b82f6; color: #ffffff; padding: 14px 32px; text-decoration: none; border-radius: 6px; font-weight: 600;">
              Verify Email Address
            </a>
          </div>
          <p style="color: #6b7280; font-size: 14px; line-height: 1.6;">
            Or copy and paste this link into your browser:<br>
            <a href="${verifyUrl}" style="color: #3b82f6; word-break: break-all;">${verifyUrl}</a>
          </p>
          <p style="color: #6b7280; font-size: 14px; margin-top: 24px;">
            This link will expire in 24 hours. If you didn't create an account, you can safely ignore this email.
          </p>
        </div>
        <div style="background-color: #f9fafb; padding: 24px; text-align: center; border-top: 1px solid #e5e7eb;">
          <p style="color: #9ca3af; font-size: 12px; margin: 0;">
            &copy; ${new Date().getFullYear()} Key Network Services Ltd. All rights reserved.
          </p>
        </div>
      </div>
    </body>
    </html>
  `;

  return sendEmail({
    to: email,
    subject: 'Verify your ScreenControl account',
    html,
  });
}

export async function sendPasswordResetEmail(email: string, token: string, name?: string) {
  const resetUrl = `${APP_URL}/auth/reset-password?token=${token}`;

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f4f4f5; margin: 0; padding: 20px;">
      <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
        <div style="background: linear-gradient(135deg, #3b82f6, #8b5cf6); padding: 32px; text-align: center;">
          <h1 style="color: #ffffff; margin: 0; font-size: 24px;">ScreenControl</h1>
        </div>
        <div style="padding: 32px;">
          <h2 style="color: #1f2937; margin: 0 0 16px;">Reset your password</h2>
          <p style="color: #4b5563; line-height: 1.6; margin: 0 0 24px;">
            Hi${name ? ` ${name}` : ''},<br><br>
            We received a request to reset your password. Click the button below to choose a new password.
          </p>
          <div style="text-align: center; margin: 32px 0;">
            <a href="${resetUrl}" style="display: inline-block; background-color: #3b82f6; color: #ffffff; padding: 14px 32px; text-decoration: none; border-radius: 6px; font-weight: 600;">
              Reset Password
            </a>
          </div>
          <p style="color: #6b7280; font-size: 14px; line-height: 1.6;">
            Or copy and paste this link into your browser:<br>
            <a href="${resetUrl}" style="color: #3b82f6; word-break: break-all;">${resetUrl}</a>
          </p>
          <p style="color: #6b7280; font-size: 14px; margin-top: 24px;">
            This link will expire in 1 hour. If you didn't request a password reset, you can safely ignore this email.
          </p>
        </div>
        <div style="background-color: #f9fafb; padding: 24px; text-align: center; border-top: 1px solid #e5e7eb;">
          <p style="color: #9ca3af; font-size: 12px; margin: 0;">
            &copy; ${new Date().getFullYear()} Key Network Services Ltd. All rights reserved.
          </p>
        </div>
      </div>
    </body>
    </html>
  `;

  return sendEmail({
    to: email,
    subject: 'Reset your ScreenControl password',
    html,
  });
}

export async function sendWelcomeEmail(email: string, name?: string) {
  const loginUrl = `${APP_URL}/login`;
  const docsUrl = `${APP_URL}/docs`;

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f4f4f5; margin: 0; padding: 20px;">
      <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
        <div style="background: linear-gradient(135deg, #3b82f6, #8b5cf6); padding: 32px; text-align: center;">
          <h1 style="color: #ffffff; margin: 0; font-size: 24px;">Welcome to ScreenControl!</h1>
        </div>
        <div style="padding: 32px;">
          <h2 style="color: #1f2937; margin: 0 0 16px;">Your account is ready</h2>
          <p style="color: #4b5563; line-height: 1.6; margin: 0 0 24px;">
            Hi${name ? ` ${name}` : ''},<br><br>
            Your email has been verified and your 30-day free trial has started! You now have full access to ScreenControl.
          </p>
          <div style="background-color: #f0fdf4; border: 1px solid #86efac; border-radius: 6px; padding: 16px; margin: 24px 0;">
            <p style="color: #166534; margin: 0; font-weight: 600;">Your trial includes:</p>
            <ul style="color: #166534; margin: 8px 0 0; padding-left: 20px;">
              <li>1 concurrent agent</li>
              <li>All features unlocked</li>
              <li>30 days of full access</li>
            </ul>
          </div>
          <h3 style="color: #1f2937; margin: 24px 0 12px;">Getting Started</h3>
          <ol style="color: #4b5563; line-height: 1.8; padding-left: 20px;">
            <li>Download the ScreenControl Agent from your dashboard</li>
            <li>Install it on the machine you want to control</li>
            <li>Connect your agent using your license key</li>
            <li>Start automating!</li>
          </ol>
          <div style="text-align: center; margin: 32px 0;">
            <a href="${loginUrl}" style="display: inline-block; background-color: #3b82f6; color: #ffffff; padding: 14px 32px; text-decoration: none; border-radius: 6px; font-weight: 600; margin-right: 12px;">
              Go to Dashboard
            </a>
            <a href="${docsUrl}" style="display: inline-block; background-color: #ffffff; color: #3b82f6; padding: 14px 32px; text-decoration: none; border-radius: 6px; font-weight: 600; border: 1px solid #3b82f6;">
              Read the Docs
            </a>
          </div>
        </div>
        <div style="background-color: #f9fafb; padding: 24px; text-align: center; border-top: 1px solid #e5e7eb;">
          <p style="color: #9ca3af; font-size: 12px; margin: 0;">
            &copy; ${new Date().getFullYear()} Key Network Services Ltd. All rights reserved.
          </p>
        </div>
      </div>
    </body>
    </html>
  `;

  return sendEmail({
    to: email,
    subject: 'Welcome to ScreenControl - Your trial has started!',
    html,
  });
}

export async function sendTrialExpiringEmail(email: string, daysLeft: number, name?: string) {
  const upgradeUrl = `${APP_URL}/dashboard/billing`;

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f4f4f5; margin: 0; padding: 20px;">
      <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
        <div style="background: linear-gradient(135deg, #f59e0b, #ef4444); padding: 32px; text-align: center;">
          <h1 style="color: #ffffff; margin: 0; font-size: 24px;">ScreenControl</h1>
        </div>
        <div style="padding: 32px;">
          <h2 style="color: #1f2937; margin: 0 0 16px;">Your trial expires in ${daysLeft} day${daysLeft === 1 ? '' : 's'}</h2>
          <p style="color: #4b5563; line-height: 1.6; margin: 0 0 24px;">
            Hi${name ? ` ${name}` : ''},<br><br>
            Your ScreenControl trial is ending soon. Upgrade now to keep your agents running without interruption.
          </p>
          <div style="text-align: center; margin: 32px 0;">
            <a href="${upgradeUrl}" style="display: inline-block; background-color: #3b82f6; color: #ffffff; padding: 14px 32px; text-decoration: none; border-radius: 6px; font-weight: 600;">
              Upgrade Now
            </a>
          </div>
          <p style="color: #6b7280; font-size: 14px;">
            Have questions? Reply to this email and we'll be happy to help.
          </p>
        </div>
        <div style="background-color: #f9fafb; padding: 24px; text-align: center; border-top: 1px solid #e5e7eb;">
          <p style="color: #9ca3af; font-size: 12px; margin: 0;">
            &copy; ${new Date().getFullYear()} Key Network Services Ltd. All rights reserved.
          </p>
        </div>
      </div>
    </body>
    </html>
  `;

  return sendEmail({
    to: email,
    subject: `Your ScreenControl trial expires in ${daysLeft} day${daysLeft === 1 ? '' : 's'}`,
    html,
  });
}
