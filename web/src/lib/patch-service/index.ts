/**
 * Patch Service
 *
 * Exports all patch service functionality for embedding tenant
 * configuration into agent binaries.
 */

export * from './constants';
export * from './manifest';
export * from './checksum';
export * from './patcher';

// Re-export commonly used items at top level
export { loadAndPatchBuild, createPatchData, validatePatchedBinary } from './patcher';
export { loadManifest, getBuildInfo, getAvailablePlatforms } from './manifest';
export { generatePatchChecksum, generateSalt } from './checksum';
