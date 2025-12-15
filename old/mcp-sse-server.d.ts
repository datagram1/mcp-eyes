#!/usr/bin/env node
/**
 * MCP-Eyes SSE Server
 *
 * Provides Server-Sent Events (SSE) transport for MCP protocol.
 * Compatible with Open WebUI and other HTTP-based MCP clients.
 *
 * Supports:
 * - Direct connections from Open WebUI
 * - Proxied connections via Control Server
 * - API key authentication
 * - CORS for cross-origin requests
 *
 * Architecture:
 *
 * Simple (Direct):
 *   Open WebUI ──SSE──► MCP-Eyes Agent
 *
 * Complex (Via Control Server):
 *   Open WebUI ──SSE──► Control Server ──SSE──► MCP-Eyes Agent
 */
export {};
//# sourceMappingURL=mcp-sse-server.d.ts.map