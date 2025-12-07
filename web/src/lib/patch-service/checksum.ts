/**
 * Checksum Service
 *
 * Generates HMAC-SHA256 checksums for patch data integrity.
 */

import crypto from 'crypto';
import { PATCH_SECRET, PATCH_OFFSETS, PATCH_FIELD_SIZES } from './constants';

/**
 * Generate HMAC-SHA256 checksum for the patch data fields
 *
 * The checksum covers:
 * - MAGIC_START
 * - ENDPOINT_UUID
 * - SERVER_URL
 *
 * This allows the agent to verify the patch data hasn't been tampered with.
 */
export function generatePatchChecksum(
  endpointUuid: string,
  serverUrl: string
): Buffer {
  const hmac = crypto.createHmac('sha256', PATCH_SECRET);

  // Include the magic marker in checksum
  hmac.update('SCPATCH\x00');

  // Include endpoint UUID (padded to field size)
  const uuidBuffer = Buffer.alloc(PATCH_FIELD_SIZES.ENDPOINT_UUID);
  Buffer.from(endpointUuid).copy(uuidBuffer);
  hmac.update(uuidBuffer);

  // Include server URL (padded to field size)
  const urlBuffer = Buffer.alloc(PATCH_FIELD_SIZES.SERVER_URL);
  Buffer.from(serverUrl).copy(urlBuffer);
  hmac.update(urlBuffer);

  return hmac.digest();
}

/**
 * Verify a patch data checksum
 */
export function verifyPatchChecksum(patchData: Buffer): boolean {
  // Extract fields
  const endpointUuid = patchData
    .subarray(PATCH_OFFSETS.ENDPOINT_UUID, PATCH_OFFSETS.SERVER_URL)
    .toString('utf-8')
    .replace(/\0+$/, '');

  const serverUrl = patchData
    .subarray(PATCH_OFFSETS.SERVER_URL, PATCH_OFFSETS.CHECKSUM)
    .toString('utf-8')
    .replace(/\0+$/, '');

  const storedChecksum = patchData.subarray(
    PATCH_OFFSETS.CHECKSUM,
    PATCH_OFFSETS.CHECKSUM + PATCH_FIELD_SIZES.CHECKSUM
  );

  // Generate expected checksum
  const expectedChecksum = generatePatchChecksum(endpointUuid, serverUrl);

  // Constant-time comparison
  return crypto.timingSafeEqual(storedChecksum, expectedChecksum);
}

/**
 * Generate a random salt for anti-piracy purposes
 */
export function generateSalt(): string {
  return crypto.randomBytes(16).toString('hex');
}

/**
 * Hash a value with a salt (for tracking purposes)
 */
export function hashWithSalt(value: string, salt: string): string {
  return crypto.createHash('sha256').update(value + salt).digest('hex');
}
