#!/usr/bin/env node
/**
 * ScreenControl MCP Server
 *
 * This is a lightweight MCP server that proxies requests to the HTTP server.
 * The HTTP server runs with proper accessibility permissions (macOS app or LaunchAgent).
 * This proxy reads the API token from ~/.screencontrol-token and forwards requests.
 *
 * ARCHITECTURE:
 *   Cursor/Claude Desktop (stdio) → screencontrol-mcp (stdio) → macOS App HTTP Server (port 3456)
 *
 * CONFIGURATION OPTIONS:
 *
 * 1. NPX (Recommended - auto-updates):
 *    {
 *      "mcpServers": {
 *        "screencontrol": {
 *          "command": "npx",
 *          "args": ["-y", "screencontrol@latest", "screencontrol-mcp"]
 *        }
 *      }
 *    }
 *
 * 2. Local File Installation (for Cursor):
 *    {
 *      "mcpServers": {
 *        "screencontrol": {
 *          "command": "node",
 *          "args": ["/absolute/path/to/screen_control/dist/screencontrol-mcp.js"]
 *        }
 *      }
 *    }
 *
 * 3. Claude Desktop (local file):
 *    {
 *      "mcpServers": {
 *        "screencontrol": {
 *          "command": "node",
 *          "args": ["/path/to/screen_control/dist/screencontrol-mcp.js"]
 *        }
 *      }
 *    }
 *
 * PREREQUISITES:
 * - macOS App (ScreenControl.app) must be running and serving HTTP on port 3456
 * - OR Node.js HTTP server must be running (via LaunchAgent or manually)
 * - Token file ~/.screencontrol-token must exist (created by the HTTP server)
 *
 * The proxy automatically reads the token file to authenticate with the HTTP backend.
 */
export {};
//# sourceMappingURL=screencontrol-mcp.d.ts.map