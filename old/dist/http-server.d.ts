#!/usr/bin/env node
/**
 * HTTP Server wrapper for MCP-Eyes
 *
 * Run this directly from your terminal to inherit accessibility permissions.
 * Usage: npx ts-node src/http-server.ts
 * Or after build: node dist/http-server.js
 *
 * SECURITY:
 * - Requires API key authentication via MCP_EYES_API_KEY environment variable
 * - Binds to localhost only by default (set MCP_EYES_HOST=0.0.0.0 to expose)
 * - All requests must include Authorization: Bearer <api-key> header
 *
 * This server exposes MCP-Eyes functionality via HTTP endpoints,
 * bypassing the permission issues when running as an MCP subprocess.
 */
export {};
//# sourceMappingURL=http-server.d.ts.map