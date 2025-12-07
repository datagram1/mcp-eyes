/**
 * Patch Service Constants
 *
 * Defines the binary patch format for embedding tenant configuration
 * into agent executables.
 */

// Magic markers for finding/validating patch data
export const PATCH_MAGIC_START = Buffer.from('SCPATCH\x00'); // 8 bytes
export const PATCH_MAGIC_END = Buffer.from('SCEND\x00\x00\x00'); // 8 bytes

// PatchData structure (256 bytes total)
export const PATCH_DATA_SIZE = 256;
export const PATCH_FIELD_SIZES = {
  MAGIC_START: 8,      // "SCPATCH\0"
  ENDPOINT_UUID: 40,   // MCP connection UUID (36 chars + padding)
  SERVER_URL: 128,     // Server URL with null terminator
  CHECKSUM: 32,        // HMAC-SHA256 of the above fields
  RESERVED: 40,        // Reserved for future use
  MAGIC_END: 8,        // "SCEND\0\0\0"
} as const;

// Field offsets within the 256-byte patch data block
export const PATCH_OFFSETS = {
  MAGIC_START: 0,
  ENDPOINT_UUID: 8,
  SERVER_URL: 48,
  CHECKSUM: 176,
  RESERVED: 208,
  MAGIC_END: 248,
} as const;

// Supported platforms
export type Platform = 'macos' | 'windows' | 'linux-gui' | 'linux-headless';

export const PLATFORM_INFO: Record<Platform, { filename: string; contentType: string; extension: string }> = {
  'macos': {
    filename: 'MCPEyes.app.tar.gz',
    contentType: 'application/gzip',
    extension: '.app.tar.gz',
  },
  'windows': {
    filename: 'ScreenControl.exe',
    contentType: 'application/octet-stream',
    extension: '.exe',
  },
  'linux-gui': {
    filename: 'screencontrol-gui',
    contentType: 'application/octet-stream',
    extension: '',
  },
  'linux-headless': {
    filename: 'screencontrol-headless',
    contentType: 'application/octet-stream',
    extension: '',
  },
};

// Default server URL
export const DEFAULT_SERVER_URL = process.env.APP_URL || 'https://screencontrol.knws.co.uk';

// Golden builds storage path
export const GOLDEN_BUILDS_PATH = process.env.GOLDEN_BUILDS_PATH || '/var/www/html/screencontrol/golden';

// HMAC secret for patch checksum
export const PATCH_SECRET = process.env.PATCH_SECRET || 'screencontrol-patch-secret-change-in-production';
