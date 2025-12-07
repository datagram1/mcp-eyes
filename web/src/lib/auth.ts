import * as argon2 from 'argon2';
import crypto from 'crypto';

/**
 * Hash a password using Argon2id (recommended for password hashing)
 * Argon2id is resistant to both side-channel and GPU-based attacks
 */
export async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 65536,    // 64 MB
    timeCost: 3,          // 3 iterations
    parallelism: 4,       // 4 parallel threads
  });
}

/**
 * Verify a password against an Argon2 hash
 */
export async function verifyPassword(password: string, hashedPassword: string): Promise<boolean> {
  return argon2.verify(hashedPassword, password);
}

/**
 * Generate a secure random token
 */
export function generateToken(length: number = 32): string {
  return crypto.randomBytes(length).toString('hex');
}

/**
 * Generate a URL-safe token
 */
export function generateUrlSafeToken(length: number = 32): string {
  return crypto.randomBytes(length).toString('base64url');
}

/**
 * Generate a license key in format: SC-XXXX-XXXX-XXXX-XXXX
 */
export function generateLicenseKey(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Removed confusing chars (0,O,1,I)
  const segments: string[] = [];

  for (let s = 0; s < 4; s++) {
    let segment = '';
    for (let i = 0; i < 4; i++) {
      segment += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    segments.push(segment);
  }

  return `SC-${segments.join('-')}`;
}

/**
 * Validate license key format
 */
export function isValidLicenseKeyFormat(key: string): boolean {
  const pattern = /^SC-[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/;
  return pattern.test(key);
}

/**
 * Generate email verification token with expiry (24 hours)
 */
export function generateEmailVerificationToken(): { token: string; expires: Date } {
  return {
    token: generateUrlSafeToken(),
    expires: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
  };
}

/**
 * Generate password reset token with expiry (1 hour)
 */
export function generatePasswordResetToken(): { token: string; expires: Date } {
  return {
    token: generateUrlSafeToken(),
    expires: new Date(Date.now() + 60 * 60 * 1000), // 1 hour
  };
}

/**
 * Validate password strength
 */
export function validatePasswordStrength(password: string): { valid: boolean; message?: string } {
  if (password.length < 8) {
    return { valid: false, message: 'Password must be at least 8 characters long' };
  }

  if (!/[A-Z]/.test(password)) {
    return { valid: false, message: 'Password must contain at least one uppercase letter' };
  }

  if (!/[a-z]/.test(password)) {
    return { valid: false, message: 'Password must contain at least one lowercase letter' };
  }

  if (!/[0-9]/.test(password)) {
    return { valid: false, message: 'Password must contain at least one number' };
  }

  return { valid: true };
}

/**
 * Generate agent key (unique identifier for agent instances)
 */
export function generateAgentKey(): string {
  return `agent_${crypto.randomBytes(16).toString('hex')}`;
}

/**
 * Hash machine fingerprint for privacy
 */
export function hashMachineFingerprint(fingerprint: string): string {
  return crypto.createHash('sha256').update(fingerprint).digest('hex');
}
