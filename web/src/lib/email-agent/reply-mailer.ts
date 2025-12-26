/**
 * Reply Mailer
 *
 * Handles sending reply emails via the dedicated reply SMTP server.
 * This is separate from the main email transporter used for auth emails.
 */

import * as nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';

export interface ReplySmtpConfig {
  host: string;
  port: number;
  user?: string | null;
  password?: string | null;
  tls: boolean;
  fromEmail?: string | null;
  fromName: string;
}

export interface ReplyEmailOptions {
  to: string;
  subject: string;
  body: string;
  inReplyTo?: string;
  references?: string;
}

/**
 * Create a nodemailer transporter for reply emails
 */
function createReplyTransporter(config: ReplySmtpConfig): Transporter {
  const transportConfig: nodemailer.TransportOptions = {
    host: config.host,
    port: config.port,
    secure: config.tls,
  } as nodemailer.TransportOptions;

  // Only add auth if credentials are provided
  if (config.user && config.password) {
    (transportConfig as Record<string, unknown>).auth = {
      user: config.user,
      pass: config.password,
    };
  }

  return nodemailer.createTransport(transportConfig);
}

/**
 * Send a reply email using the dedicated reply SMTP server
 */
export async function sendReplyEmail(
  config: ReplySmtpConfig,
  options: ReplyEmailOptions
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  try {
    const transporter = createReplyTransporter(config);

    const fromEmail = config.fromEmail || `screencontrol@${config.host}`;
    const fromAddress = `"${config.fromName}" <${fromEmail}>`;

    const mailOptions: nodemailer.SendMailOptions = {
      from: fromAddress,
      to: options.to,
      subject: options.subject,
      text: options.body,
      html: formatHtmlReply(options.body),
    };

    // Add threading headers if replying to a specific message
    if (options.inReplyTo) {
      mailOptions.inReplyTo = options.inReplyTo;
    }
    if (options.references) {
      mailOptions.references = options.references;
    }

    const info = await transporter.sendMail(mailOptions);

    console.log(`[ReplyMailer] Sent reply to ${options.to}: ${info.messageId}`);

    return {
      success: true,
      messageId: info.messageId,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[ReplyMailer] Failed to send reply:`, errorMessage);

    return {
      success: false,
      error: errorMessage,
    };
  }
}

/**
 * Format plain text body as HTML for the reply
 */
function formatHtmlReply(body: string): string {
  // Escape HTML entities and preserve formatting
  const escapedBody = body
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n/g, '<br>');

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f4f4f5; margin: 0; padding: 20px;">
  <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
    <div style="background: linear-gradient(135deg, #3b82f6, #8b5cf6); padding: 16px 24px;">
      <h1 style="color: #ffffff; margin: 0; font-size: 18px;">ScreenControl AI</h1>
    </div>
    <div style="padding: 24px;">
      <div style="color: #374151; line-height: 1.6; white-space: pre-wrap;">${escapedBody}</div>
    </div>
    <div style="background-color: #f9fafb; padding: 16px 24px; text-align: center; border-top: 1px solid #e5e7eb;">
      <p style="color: #9ca3af; font-size: 12px; margin: 0;">
        This is an automated response from ScreenControl AI
      </p>
    </div>
  </div>
</body>
</html>
  `.trim();
}
