/**
 * Binary Patcher
 *
 * Patches golden build binaries with tenant-specific configuration.
 */

import * as fs from 'fs/promises';
import {
  PATCH_MAGIC_START,
  PATCH_MAGIC_END,
  PATCH_DATA_SIZE,
  PATCH_OFFSETS,
  PATCH_FIELD_SIZES,
  DEFAULT_SERVER_URL,
  Platform,
} from './constants';
import { generatePatchChecksum } from './checksum';
import { getBuildInfo, checkBuildExists } from './manifest';

export interface PatchConfig {
  endpointUuid: string;
  serverUrl?: string;
}

export interface PatchResult {
  success: boolean;
  data?: Buffer;
  error?: string;
  version?: string;
  originalSize?: number;
  patchedSize?: number;
}

/**
 * Create a 256-byte patch data block
 */
export function createPatchData(config: PatchConfig): Buffer {
  const serverUrl = config.serverUrl || DEFAULT_SERVER_URL;
  const patchData = Buffer.alloc(PATCH_DATA_SIZE);

  // Write magic start
  PATCH_MAGIC_START.copy(patchData, PATCH_OFFSETS.MAGIC_START);

  // Write endpoint UUID (null-terminated, padded)
  const uuidBuffer = Buffer.from(config.endpointUuid);
  uuidBuffer.copy(patchData, PATCH_OFFSETS.ENDPOINT_UUID);

  // Write server URL (null-terminated, padded)
  const urlBuffer = Buffer.from(serverUrl);
  urlBuffer.copy(patchData, PATCH_OFFSETS.SERVER_URL);

  // Generate and write checksum
  const checksum = generatePatchChecksum(config.endpointUuid, serverUrl);
  checksum.copy(patchData, PATCH_OFFSETS.CHECKSUM);

  // Reserved area is already zeros from alloc

  // Write magic end
  PATCH_MAGIC_END.copy(patchData, PATCH_OFFSETS.MAGIC_END);

  return patchData;
}

/**
 * Find the patch placeholder in a binary
 *
 * The golden build should contain a placeholder patch block
 * with magic markers that we can locate and replace.
 */
export function findPatchOffset(data: Buffer): number {
  // Search for the magic start marker
  const magicIndex = data.indexOf(PATCH_MAGIC_START);

  if (magicIndex === -1) {
    return -1;
  }

  // Verify magic end is at the expected position
  const expectedEndOffset = magicIndex + PATCH_DATA_SIZE - PATCH_FIELD_SIZES.MAGIC_END;
  const actualEnd = data.subarray(expectedEndOffset, expectedEndOffset + PATCH_FIELD_SIZES.MAGIC_END);

  if (!actualEnd.equals(PATCH_MAGIC_END)) {
    console.error('[Patcher] Magic end marker not found at expected offset');
    return -1;
  }

  return magicIndex;
}

/**
 * Patch a binary buffer with tenant configuration
 */
export function patchBinary(data: Buffer, config: PatchConfig): Buffer {
  const patchOffset = findPatchOffset(data);

  if (patchOffset === -1) {
    // No placeholder found - append patch data to end
    console.log('[Patcher] No placeholder found, appending patch data');
    const patchData = createPatchData(config);
    return Buffer.concat([data, patchData]);
  }

  // Replace the placeholder with actual patch data
  const patchData = createPatchData(config);
  const result = Buffer.from(data);
  patchData.copy(result, patchOffset);

  return result;
}

/**
 * Load and patch a golden build
 */
export async function loadAndPatchBuild(
  platform: Platform,
  config: PatchConfig,
  version?: string
): Promise<PatchResult> {
  // Get build info
  const buildInfo = await getBuildInfo(platform, version);
  if (!buildInfo) {
    return {
      success: false,
      error: `Build not found for platform ${platform}`,
    };
  }

  // Check if file exists
  const exists = await checkBuildExists(buildInfo.path);
  if (!exists) {
    return {
      success: false,
      error: `Build file not found: ${buildInfo.path}`,
    };
  }

  try {
    // Read the golden build
    const originalData = await fs.readFile(buildInfo.path);

    // Patch it
    const patchedData = patchBinary(originalData, config);

    return {
      success: true,
      data: patchedData,
      version: buildInfo.version,
      originalSize: originalData.length,
      patchedSize: patchedData.length,
    };
  } catch (error) {
    console.error('[Patcher] Error loading/patching build:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Validate a patched binary
 */
export function validatePatchedBinary(data: Buffer): {
  valid: boolean;
  endpointUuid?: string;
  serverUrl?: string;
  error?: string;
} {
  const patchOffset = findPatchOffset(data);

  if (patchOffset === -1) {
    // Check if patch data is appended at the end
    const possiblePatchStart = data.length - PATCH_DATA_SIZE;
    if (possiblePatchStart < 0) {
      return { valid: false, error: 'Binary too small to contain patch data' };
    }

    const endCheck = data.subarray(possiblePatchStart, possiblePatchStart + PATCH_FIELD_SIZES.MAGIC_START);
    if (!endCheck.equals(PATCH_MAGIC_START)) {
      return { valid: false, error: 'No patch data found' };
    }

    // Use appended patch data
    const patchData = data.subarray(possiblePatchStart);
    return extractPatchInfo(patchData);
  }

  // Extract embedded patch data
  const patchData = data.subarray(patchOffset, patchOffset + PATCH_DATA_SIZE);
  return extractPatchInfo(patchData);
}

/**
 * Extract patch info from a patch data block
 */
function extractPatchInfo(patchData: Buffer): {
  valid: boolean;
  endpointUuid?: string;
  serverUrl?: string;
  error?: string;
} {
  // Verify magic markers
  const magicStart = patchData.subarray(0, PATCH_FIELD_SIZES.MAGIC_START);
  const magicEnd = patchData.subarray(PATCH_OFFSETS.MAGIC_END);

  if (!magicStart.equals(PATCH_MAGIC_START) || !magicEnd.equals(PATCH_MAGIC_END)) {
    return { valid: false, error: 'Invalid magic markers' };
  }

  // Extract fields
  const endpointUuid = patchData
    .subarray(PATCH_OFFSETS.ENDPOINT_UUID, PATCH_OFFSETS.SERVER_URL)
    .toString('utf-8')
    .replace(/\0+$/, '');

  const serverUrl = patchData
    .subarray(PATCH_OFFSETS.SERVER_URL, PATCH_OFFSETS.CHECKSUM)
    .toString('utf-8')
    .replace(/\0+$/, '');

  // Check for empty placeholder
  if (!endpointUuid || endpointUuid === '\x00'.repeat(40)) {
    return { valid: false, error: 'Patch data contains empty placeholder' };
  }

  return {
    valid: true,
    endpointUuid,
    serverUrl,
  };
}
