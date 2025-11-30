#!/usr/bin/env node
/**
 * MCP Proxy Server for MCP-Eyes
 *
 * This is a lightweight MCP server that proxies requests to the HTTP server.
 * The HTTP server runs with proper accessibility permissions (macOS app or LaunchAgent).
 * This proxy reads the API token from ~/.mcp-eyes-token and forwards requests.
 *
 * ARCHITECTURE:
 *   Cursor/Claude Desktop (stdio) → mcp-proxy-server (stdio) → macOS App HTTP Server (port 3456)
 *
 * CONFIGURATION OPTIONS:
 *
 * 1. NPX (Recommended - auto-updates):
 *    {
 *      "mcpServers": {
 *        "mcp-eyes": {
 *          "command": "npx",
 *          "args": ["-y", "mcp-eyes@latest", "mcp-proxy-server"]
 *        }
 *      }
 *    }
 *
 * 2. Local File Installation (for Cursor):
 *    {
 *      "mcpServers": {
 *        "mcp-eyes": {
 *          "command": "node",
 *          "args": ["/absolute/path/to/mcp-eyes/dist/mcp-proxy-server.js"]
 *        }
 *      }
 *    }
 *
 * 3. Claude Desktop (local file):
 *    {
 *      "mcpServers": {
 *        "mcp-eyes": {
 *          "command": "node",
 *          "args": ["/path/to/mcp-eyes/dist/mcp-proxy-server.js"]
 *        }
 *      }
 *    }
 *
 * PREREQUISITES:
 * - macOS App (MCPEyes.app) must be running and serving HTTP on port 3456
 * - OR Node.js HTTP server must be running (via LaunchAgent or manually)
 * - Token file ~/.mcp-eyes-token must exist (created by the HTTP server)
 *
 * The proxy automatically reads the token file to authenticate with the HTTP backend.
 */
export {};
//# sourceMappingURL=mcp-proxy-server.d.ts.map