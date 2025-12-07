# ScreenControl (formerly MCP-Eyes)

**Multi-tenant SaaS platform enabling AI/LLM systems to control remote computers through a centralized control server.**

[![npm version](https://img.shields.io/npm/v/mcp-eyes.svg?cache=1)](https://www.npmjs.com/package/mcp-eyes)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D20.0.0-brightgreen.svg)](https://nodejs.org/)

> **Provider**: Key Network Services Ltd

## Overview

ScreenControl is an enterprise platform that connects AI assistants (Claude.ai, local LLMs, OpenAI, etc.) to remote computers for automation tasks. The platform consists of:

- **Control Server**: Public-facing router/hub that manages agent connections and AI authorization
- **Agents**: Native apps (macOS, Windows, Linux) with full desktop automation capabilities
- **Web Platform**: Customer portal for licensing, billing, agent management, and AI configuration
- **MCP Protocol**: Industry-standard Model Context Protocol for AI tool integration

## Platform Architecture

### Full Platform Architecture

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              AI / LLM (The Brain)                                │
│                     Claude.ai, OpenAI, Ollama, Local LLM, etc.                   │
└─────────────────────────────────────────┬───────────────────────────────────────┘
                                          │
        ┌─────────────────────────────────┼─────────────────────────────────┐
        │                                 │                                 │
        ▼                                 ▼                                 ▼
┌───────────────────┐           ┌───────────────────┐             ┌─────────────────┐
│   MASTER AGENT    │           │   MASTER AGENT    │             │  Claude.ai      │
│   (Customer A)    │           │   (Customer B)    │             │  (Direct)       │
│                   │           │                   │             │                 │
│ ┌───────────────┐ │           │ ┌───────────────┐ │             │ Streamable HTTP │
│ │ Local LLM     │ │           │ │ OpenAI API    │ │             │ (no agent)      │
│ │ (Ollama)      │ │           │ │ Claude API    │ │             │                 │
│ └───────────────┘ │           │ └───────────────┘ │             │                 │
│                   │           │                   │             │                 │
│ MCPEyes.app       │           │ ScreenControl.exe │             │                 │
│ + AI Integration  │           │ + AI Integration  │             │                 │
└─────────┬─────────┘           └─────────┬─────────┘             └────────┬────────┘
          │                               │                                │
          │ WebSocket                     │ WebSocket                      │ Streamable HTTP
          │                               │                                │
          ▼                               ▼                                ▼
┌──────────────────────────────────────────────────────────────────────────────────┐
│                           CONTROL SERVER (Edge Router)                            │
│                           control.yourcompany.com                                 │
│                                                                                   │
│  ┌─────────────────────────────────────────────────────────────────────────────┐ │
│  │                              DATABASE                                        │ │
│  │  PostgreSQL + Prisma                                                         │ │
│  │  • Customers/Users        • AI Connections       • Command Logs              │ │
│  │  • Licenses               • Agent Permissions    • Audit Trail               │ │
│  │  • Agents (master/worker) • Sessions             • Billing                   │ │
│  └─────────────────────────────────────────────────────────────────────────────┘ │
│                                                                                   │
│  Transports:                          Authorization:                              │
│  • Streamable HTTP (/mcp)             • Validate AI-backed connections           │
│  • SSE (/mcp/sse) - legacy            • Check license status & limits            │
│  • WebSocket (/ws) - agents           • Route commands to licensed agents        │
│                                                                                   │
│  Routing:                             Licensing:                                  │
│  • Master → Worker command relay      • Trial/Active/Expired                     │
│  • Cross-network agent routing        • Concurrent agent limits                  │
│  • Status aggregation                 • Phone-home validation                    │
└──────────────────────────────────────────┬───────────────────────────────────────┘
                                           │
                           WebSocket (all agents connect outbound)
                                           │
          ┌────────────────────────────────┼────────────────────────────────┐
          ▼                                ▼                                ▼
┌─────────────────┐              ┌─────────────────┐              ┌─────────────────┐
│  WORKER AGENT   │              │  WORKER AGENT   │              │  WORKER AGENT   │
│   (macOS)       │              │   (Windows)     │              │   (Linux)       │
│                 │              │                 │              │                 │
│ MCPEyes.app     │              │ ScreenControl   │              │ ScreenControl   │
│                 │              │     .exe        │              │   (GUI/CLI)     │
│ All Tools:      │              │                 │              │                 │
│ • GUI           │              │ All Tools       │              │ All Tools       │
│ • Browser       │              │                 │              │ + Headless      │
│ • Filesystem    │              │                 │              │   Server Mode   │
│ • Shell         │              │                 │              │                 │
└─────────────────┘              └─────────────────┘              └─────────────────┘
```

### Control Server: WAN Bridge for Firewall Traversal

The control server is essential for remote/WAN access - it bridges commands to worker agents behind firewalls:

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                           REMOTE / WAN SCENARIO                                  │
│                                                                                  │
│  ┌─────────────────┐                              ┌─────────────────────────┐   │
│  │  Claude.ai      │                              │  CORPORATE NETWORK      │   │
│  │  (or Master     │     Cannot reach directly    │  (Behind Firewall/NAT)  │   │
│  │   Agent)        │ ─ ─ ─ ─ ─ ─ ✗ ─ ─ ─ ─ ─ ─ ─►│  Worker Agents          │   │
│  └────────┬────────┘                              └────────────┬────────────┘   │
│           │ HTTPS (443)                   WebSocket (outbound) │                │
│           ▼                                                    ▼                │
│  ┌──────────────────────────────────────────────────────────────────────────┐   │
│  │                        CONTROL SERVER (Public Internet)                   │   │
│  │  • Workers connect OUTBOUND (no firewall issues)                          │   │
│  │  • Bridges commands to connected workers                                  │   │
│  │  • Solves NAT traversal problem                                           │   │
│  └──────────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### Bonjour Local Network Discovery (Port 3456)

For same-network scenarios, master agents communicate **directly** with workers on port 3456:

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                           LOCAL LAN SCENARIO                                     │
│                                                                                  │
│  ┌─────────────────┐         Bonjour mDNS          ┌─────────────────┐          │
│  │  MASTER AGENT   │◄─────── _screencontrol._tcp ──│  WORKER AGENT   │          │
│  │  + AI/LLM       │                               │  :3456          │          │
│  └────────┬────────┘                               └────────┬────────┘          │
│           │◄──────────── Port 3456 (Direct) ────────────────┘                   │
│                                                                                  │
│  Control Server: Still receives heartbeats for licensing/status (async)        │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### Key Concepts

| Term | Description |
|------|-------------|
| **Master Agent** | Agent with AI/LLM connected (local or API). Issues commands to workers. |
| **Worker Agent** | Executes commands from master. No AI - just receives and runs tasks. |
| **Control Server** | WAN bridge for firewall traversal. Routes commands, validates licenses, tracks status. |
| **Bonjour Discovery** | LAN optimization. Master talks directly to local workers on port 3456. |

### Port Summary

| Port | Protocol | Scope | Purpose |
|------|----------|-------|---------|
| **443** | HTTPS/WSS | WAN | Control server - AI connections, agent WebSockets |
| **3456** | HTTP | LAN | Direct master→worker communication (Bonjour) |
| **3457** | HTTP | localhost | Agent tools server (browser, fs, shell) |

### Connection Modes

| Mode | Path | Port | Use Case |
|------|------|------|----------|
| **Direct Cloud** | Claude.ai → Control Server → Workers | 443 | Workers behind firewalls |
| **Master via WAN** | Master → Control Server → Workers | 443 | Remote networks |
| **Master via LAN** | Master → Bonjour → Workers | 3456 | Same network, direct |
| **Hybrid** | LAN (3456) + WAN (443) | Both | Multi-site enterprise |

## Features

### Core Capabilities

- **Multi-Agent Management**: Control multiple computers from a single AI connection
- **Cross-Platform Agents**: macOS (now), Windows (planned), Linux with headless mode (planned)
- **Native Desktop Automation**: Apple Accessibility, Windows UI Automation, X11/Wayland
- **Browser Extension Integration**: Direct DOM manipulation via Chrome, Firefox, Edge, Safari
- **Filesystem & Shell Tools**: Full file system access and command execution
- **Licensing & Billing**: Stripe integration, trial periods, concurrent agent limits
- **Audit Logging**: Full command history and audit trail

### Security

- **AI Authorization**: Only authenticated AI connections can send commands
- **License Validation**: Agents phone home to verify license status
- **Agent Permissions**: Fine-grained control over which AI can access which agents
- **Tool Restrictions**: Allow/deny specific tools per agent
- **TLS Encryption**: All connections encrypted in transit

### Transports

| Transport | Use Case | Status |
|-----------|----------|--------|
| **Streamable HTTP** | Claude.ai, modern MCP clients | Implementing |
| **SSE** | Open WebUI, legacy clients | Supported |
| **stdio** | Local LLMs (Ollama, LM Studio) | Supported |
| **WebSocket** | Agent connections | Supported |

## Quick Start (Local Development)

For local development without the control server, agents can run standalone:

### Prerequisites

1. **MCPEyes.app** must be running (macOS agent)
2. **Browser extension** installed and enabled (for browser tools)

## Quick Start

### Claude Desktop / Claude Code Configuration

Add to your MCP client configuration (`~/.config/claude/claude_desktop_config.json` or similar):

```json
{
  "mcpServers": {
    "mcp-eyes": {
      "command": "node",
      "args": ["/path/to/mcp-eyes/dist/mcp-proxy-server.js"]
    }
  }
}
```

**Before using MCP-Eyes, ensure:**

```bash
# 1. Start the macOS native app (automatically starts browser bridge too!)
open /path/to/mcp-eyes/macos/MCPEyes.app

# 2. Install and enable the browser extension in Firefox/Chrome
```

> **Note**: As of v1.1.16, MCPEyes.app automatically spawns and manages the browser bridge server. No need to start it separately!

### Option 1: NPX (Recommended for npm package)

```json
{
  "mcpServers": {
    "mcp-eyes": {
      "command": "npx",
      "args": ["-y", "mcp-eyes@latest", "mcp"]
    }
  }
}
```

### Option 2: Global Installation

```bash
npm install -g mcp-eyes
mcp-eyes mcp
```

### Option 3: Local Development

```bash
# Clone and build
git clone https://github.com/datagram1/mcp-eyes.git
cd mcp-eyes
npm install
npm run build

# Configure Claude to use local build
# In claude_desktop_config.json:
{
  "mcpServers": {
    "mcp-eyes": {
      "command": "node",
      "args": ["/Users/you/mcp-eyes/dist/mcp-proxy-server.js"]
    }
  }
}
```

## Server Variants

| Variant | Command | Transport | Description |
|---------|---------|-----------|-------------|
| **Advanced** | `mcp-eyes` | stdio | All features: AI, OCR, browser integration |
| **Basic** | `mcp-eyes-basic` | stdio | Essential Apple Accessibility + screenshots |
| **Claude** | `mcp-eyes-claude` | stdio | Optimized for Claude Desktop |
| **SSE** | `mcp-eyes-sse` | HTTP/SSE | Open WebUI compatible, LAN accessible |
| **Bridge** | `mcp-eyes-bridge` | WebSocket | Browser extension bridge server |

## Available Tools

### Native macOS Tools

| Tool | Description |
|------|-------------|
| `listApplications` | List all running applications with window bounds |
| `focusApplication` | Focus on a specific application by bundle ID or name |
| `launchApplication` | Launch or activate an application by bundle ID or name |
| `closeApp` | Close an application (optionally force quit) |
| `currentApp` | Get info about the currently focused application |
| `screenshot` | Take a full-screen screenshot |
| `screenshot_app` | Take a screenshot of the focused or specified application |
| `click` | Click at normalized coordinates (0-1) relative to window |
| `click_absolute` | Click at absolute screen coordinates (in pixels) |
| `doubleClick` | Double-click at normalized coordinates |
| `clickElement` | Click an element by index from getClickableElements |
| `moveMouse` | Move mouse to normalized coordinates without clicking |
| `scroll` | Scroll with deltaX/deltaY values |
| `scrollMouse` | Scroll up or down by amount |
| `drag` | Drag from one position to another |
| `getClickableElements` | Get all clickable UI elements via Accessibility API |
| `getUIElements` | Get full accessibility tree (clickable + non-clickable elements) |
| `getMousePosition` | Get current mouse position in screen coordinates |
| `typeText` | Type text into the focused application |
| `pressKey` | Press keyboard keys with modifiers (Command+L, etc.) |
| `analyzeWithOCR` | Analyze screen content using Vision framework OCR |
| `checkPermissions` | Check accessibility and screen recording permission status |
| `wait` | Wait for specified milliseconds |

### Filesystem Tools (New in v1.1.16)

| Tool | Description |
|------|-------------|
| `fs_list` | List files and directories at or under a given path (supports recursive listing) |
| `fs_read` | Read file contents with optional size limit (default 128KB) |
| `fs_read_range` | Read a file segment by line range (1-based, inclusive) |
| `fs_write` | Create or overwrite a file (supports append mode, auto-creates directories) |
| `fs_delete` | Delete a file or directory (optional recursive delete) |
| `fs_move` | Move or rename a file or directory |
| `fs_search` | Find files by glob pattern (e.g., `**/*.ts`, `*.json`) |
| `fs_grep` | Search within files using regex (ripgrep wrapper with grep fallback) |
| `fs_patch` | Apply focused transformations to a file (replace, insert_after, insert_before) |

### Shell Tools (New in v1.1.16)

| Tool | Description |
|------|-------------|
| `shell_exec` | Run a command and return output when finished (with timeout support) |
| `shell_start_session` | Start an interactive or long-running command session |
| `shell_send_input` | Send input to a running shell session |
| `shell_stop_session` | Stop/terminate a running session (supports signals) |

**Shell Session Example:**
```javascript
// Start a long-running process
const { session_id } = await mcpClient.callTool('shell_start_session', {
  command: 'python server.py',
  cwd: '/path/to/project'
});

// Send input to the session
await mcpClient.callTool('shell_send_input', {
  session_id,
  input: 'quit\n'
});

// Stop the session
await mcpClient.callTool('shell_stop_session', {
  session_id,
  signal: 'TERM'
});
```

### Browser Extension Tools

#### Navigation & Discovery
| Tool | Description |
|------|-------------|
| `browser_listConnected` | List connected browser extensions |
| `browser_setDefaultBrowser` | Set default browser for commands |
| `browser_getTabs` | List all open browser tabs |
| `browser_getActiveTab` | Get active tab info |
| `browser_focusTab` | Focus a specific tab by ID |
| `browser_findTabByUrl` | Find tab by URL pattern match |

#### Page Inspection
| Tool | Description |
|------|-------------|
| `browser_getPageInfo` | Get page URL, title, and metadata |
| `browser_getInteractiveElements` | **Primary discovery tool** - Get all buttons, links, inputs with selectors |
| `browser_inspectCurrentPage` | **Enhanced inspection** - Page info + UI elements + screenshot in one call |
| `browser_getUIElements` | Get enhanced UI elements with 14 specific types (email-input, password-input, etc.) |
| `browser_getPageContext` | Combined page info and elements (convenience tool) |
| `browser_getVisibleText` | Read all visible text content (for parsing, not clicking) |
| `browser_isElementVisible` | Check if element is visible on page |

#### Form Automation
| Tool | Description |
|------|-------------|
| `browser_fillElement` | Fill form field by CSS selector (from discovery) |
| `browser_fillFormField` | **Smart fill** - Fill field by label with fuzzy matching (easiest method) |
| `browser_selectOption` | Select dropdown option by value or text |
| `browser_getFormData` | Get all form data from page |
| `browser_getFormStructure` | Get detailed form structure with field metadata |
| `browser_answerQuestions` | Auto-fill form questions with provided answers |

#### User Interaction
| Tool | Description |
|------|-------------|
| `browser_clickElement` | Click element by CSS selector (from discovery) |
| `browser_clickByText` | Click element by visible text content (fuzzy match) |
| `browser_clickMultiple` | Click multiple elements in sequence with delay |
| `browser_scrollTo` | Scroll to position or element |

#### JavaScript & Advanced
| Tool | Description |
|------|-------------|
| `browser_executeScript` | Execute JavaScript with return support - **primary use: extract data, URLs, computed values** |
| `browser_getConsoleLogs` | Retrieve browser console logs (errors, warnings, info) |
| `browser_getNetworkRequests` | Get network requests (for debugging API calls) |
| `browser_getLocalStorage` | Read localStorage data from page |
| `browser_getCookies` | Read cookies from current page |

#### Timing & Synchronization
| Tool | Description |
|------|-------------|
| `browser_waitForSelector` | Wait for element to appear (after dynamic content) |
| `browser_waitForPageLoad` | Wait for page to load (after navigation) |
| `browser_setWatchMode` | Enable DOM change watching |

#### Browser Automation (Playwright-style)
| Tool | Description |
|------|-------------|
| `browser_navigate` | Navigate to a URL in the browser (supports waitUntil conditions) |
| `browser_screenshot` | Take a screenshot of the current page or a specific element |
| `browser_go_back` | Navigate back in browser history |
| `browser_go_forward` | Navigate forward in browser history |
| `browser_get_visible_html` | Get the HTML content of the page (with cleaning options) |
| `browser_hover` | Hover over an element (triggers hover states, tooltips, dropdowns) |
| `browser_drag` | Drag an element to a target location |
| `browser_press_key` | Press keyboard keys with modifier support (Enter, Tab, Ctrl+a, etc.) |
| `browser_upload_file` | Upload a file to a file input (requires native interaction fallback) |
| `browser_save_as_pdf` | Save the current page as a PDF (requires browser print API) |

### LLM-Friendly Web Automation Workflows

MCP-Eyes tool descriptions are designed to teach LLMs proper automation patterns:

**Core Workflow Pattern:**
1. **Discover** → Use `browser_getInteractiveElements` to see all clickable elements
2. **Select** → Find the element you need by text/description
3. **Copy Selector** → Use the selector from discovery (never guess)
4. **Interact** → Use `browser_clickElement` or `browser_fillElement` with the selector
5. **Wait** → Use `browser_waitForPageLoad` (navigation) or `browser_waitForSelector` (dynamic content)
6. **Rediscover** → Call `browser_getInteractiveElements` again to see new elements

**Enhanced Inspection Pattern (NEW):**
1. **Single Call** → Use `browser_inspectCurrentPage` to get page info, UI elements, and screenshot
2. **Parse Results** → Find elements by label, type, or coordinates
3. **Interact** → Use `browser_fillFormField` for smart label-based filling

**Smart Form Filling Pattern (NEW):**
1. `browser_inspectCurrentPage` → Get all form fields with labels
2. `browser_fillFormField` → Fill by label (fuzzy matching): `fillFormField("Email", "user@example.com")`
3. `browser_fillFormField` → Fill next field: `fillFormField("Password", "secret123")`
4. `browser_clickByText` → Click submit button: `clickByText("Submit")`
5. `browser_waitForPageLoad` → Wait for result

**Link Extraction Pattern:**
1. Use `browser_getInteractiveElements` to find links
2. Match link by text content
3. Use `browser_executeScript` with `return document.querySelector('SELECTOR').href` to extract URL
4. Use the URL without clicking

**Debugging Pattern (NEW):**
1. `browser_getConsoleLogs` → Check for JavaScript errors
2. `browser_getNetworkRequests` → Inspect failed API calls
3. `browser_getLocalStorage` → Check stored data
4. `browser_executeScript` → Extract computed values or test DOM queries

**Traditional Form Automation Pattern:**
1. `browser_getInteractiveElements` → Find input fields
2. `browser_fillElement` → Fill each field (using selectors from step 1)
3. `browser_getInteractiveElements` → Find submit button
4. `browser_clickElement` → Click submit
5. `browser_waitForPageLoad` → Wait for result

All tool descriptions include:
- **When to use** guidance
- **Typical workflow** steps
- **Typical next tools** suggestions
- **Important** warnings (e.g., "Do not guess selectors")

## Browser Extension Setup

### Installation

**Chrome/Edge:**
1. Open `chrome://extensions` (or `edge://extensions`)
2. Enable "Developer mode"
3. Click "Load unpacked"
4. Select the `extension/chrome` folder

**Firefox:**
1. Open `about:debugging`
2. Click "This Firefox"
3. Click "Load Temporary Add-on"
4. Select `extension/firefox/manifest.json`

### Native Messaging Host

```bash
cd extension/native-host
./install.sh all <chrome-extension-id>
```

For detailed setup instructions, see [extension/README.md](extension/README.md).

## Open WebUI Integration

MCP-Eyes includes an SSE (Server-Sent Events) transport server for compatibility with Open WebUI and other HTTP-based MCP clients. This enables LLM control panels like Open WebUI to drive GUI automation across your network.

### Why SSE?

| Client | Transport | How it works |
|--------|-----------|--------------|
| Claude Code | stdio | Spawns MCP server as child process |
| Claude Desktop | stdio | Spawns MCP server as child process |
| **Open WebUI** | **HTTP/SSE** | **Connects to network server** |
| Custom clients | HTTP/SSE | Connects to network server |

The SSE server bridges this gap, allowing Open WebUI to control MCP-Eyes agents over the network.

### Architecture

#### Single Agent (Direct Connection)

```
┌─────────────────────────────────────────────────────────────────┐
│                 Open WebUI (192.168.11.26)                      │
└───────────────────────────────┬─────────────────────────────────┘
                                │ HTTP/SSE + API Key
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│              MCP-Eyes SSE Server (192.168.11.10:3458)           │
│                                                                 │
│   ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐│
│   │ SSE Handler │  │ Tool Router │  │ Native + Browser Tools  ││
│   └─────────────┘  └─────────────┘  └─────────────────────────┘│
└─────────────────────────────────────────────────────────────────┘
```

#### Multi-Agent (Via Control Server)

```
┌─────────────────────────────────────────────────────────────────┐
│                 Open WebUI (192.168.11.26)                      │
└───────────────────────────────┬─────────────────────────────────┘
                                │ HTTP/SSE
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                     Control Server                               │
│   - Agent registry & discovery (Bonjour)                        │
│   - Request routing to correct agent                            │
│   - Unified API for all agents                                  │
└───────┬─────────────────────┬─────────────────────┬─────────────┘
        │ SSE                 │ SSE                 │ SSE
        ▼                     ▼                     ▼
┌───────────────┐     ┌───────────────┐     ┌───────────────┐
│   Agent 1     │     │   Agent 2     │     │   Agent 3     │
│   MacBook Pro │     │   Mac Mini    │     │   Windows PC  │
│   :3458       │     │   :3458       │     │   :3458       │
└───────────────┘     └───────────────┘     └───────────────┘
```

### Starting the SSE Server

```bash
# Start SSE server (LAN accessible on 0.0.0.0:3458)
npm run start:sse

# Or run directly
node dist/mcp-sse-server.js

# With custom settings
MCP_SSE_PORT=3458 \
MCP_SSE_HOST=0.0.0.0 \
MCP_AGENT_NAME="My MacBook Pro" \
MCP_API_KEY="my-secret-key" \
npm run start:sse
```

On startup, you'll see:

```
[SSE Server] MCP-Eyes SSE Server running on http://0.0.0.0:3458
[SSE Server] Agent: mcp-eyes-MacBook-Pro
[SSE Server] API Key: mcp_abc123...

[SSE Server] Endpoints:
  SSE:      GET  http://0.0.0.0:3458/mcp/sse
  Messages: POST http://0.0.0.0:3458/mcp/messages
  Tools:    GET  http://0.0.0.0:3458/mcp/tools
  Health:   GET  http://0.0.0.0:3458/health
  Info:     GET  http://0.0.0.0:3458/info

[SSE Server] For Open WebUI, configure MCP server with:
  URL: http://<this-machine-ip>:3458/mcp/sse
  API Key: mcp_abc123def456...
```

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `MCP_SSE_PORT` | `3458` | Server port |
| `MCP_SSE_HOST` | `0.0.0.0` | Bind address (0.0.0.0 = all interfaces) |
| `MCP_API_KEY` | auto-generated | API key for authentication |
| `MCP_AGENT_NAME` | hostname | Agent display name |

### Open WebUI Configuration

Configure MCP-Eyes as an MCP server in Open WebUI:

```yaml
# Open WebUI MCP configuration
mcp_servers:
  - name: "MCP-Eyes Agent"
    url: "http://192.168.11.10:3458/mcp/sse"
    api_key: "mcp_xxxxxxxxxxxxxxxx"
```

The API key is saved to `~/.mcp-eyes-sse-token` for reference:

```json
{
  "apiKey": "mcp_abc123...",
  "port": 3458,
  "host": "0.0.0.0",
  "agentName": "mcp-eyes-MacBook-Pro",
  "sseEndpoint": "http://localhost:3458/mcp/sse",
  "messagesEndpoint": "http://localhost:3458/mcp/messages"
}
```

### SSE Server Endpoints

| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `/mcp/sse` | GET | Yes | SSE connection for real-time events |
| `/mcp/messages` | POST | Yes | Send MCP JSON-RPC messages |
| `/mcp/tools` | GET | Yes | List available tools |
| `/health` | GET | No | Health check (for load balancers) |
| `/info` | GET | No | Agent info (for discovery) |

### Authentication

The SSE server supports three authentication methods:

```bash
# 1. Authorization header (recommended)
curl -H "Authorization: Bearer mcp_abc123..." http://host:3458/mcp/tools

# 2. X-API-Key header
curl -H "X-API-Key: mcp_abc123..." http://host:3458/mcp/tools

# 3. Query parameter (for SSE connections)
curl "http://host:3458/mcp/sse?api_key=mcp_abc123..."
```

### Via Control Server

For distributed setups with multiple agents, the control server acts as a router. The SSE server automatically detects proxied requests:

**Headers set by control server:**
- `X-Forwarded-For`: Original client IP
- `X-Client-Id`: Session identifier from Open WebUI

**Example control server routing:**

```javascript
// Control server receives request from Open WebUI
// Routes to appropriate agent based on target

app.post('/mcp/messages', async (req, res) => {
  const targetAgent = req.body.agent || defaultAgent;
  const agent = agents.get(targetAgent);

  // Forward with tracking headers
  const response = await fetch(`${agent.url}/mcp/messages`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${agent.apiKey}`,
      'X-Forwarded-For': req.ip,
      'X-Client-Id': req.headers['x-client-id'],
    },
    body: JSON.stringify(req.body),
  });

  res.json(await response.json());
});
```

### Testing the SSE Server

```bash
# Health check
curl http://192.168.11.10:3458/health

# Agent info
curl http://192.168.11.10:3458/info

# List tools (requires auth)
curl -H "Authorization: Bearer mcp_abc123..." \
  http://192.168.11.10:3458/mcp/tools

# Call a tool
curl -X POST \
  -H "Authorization: Bearer mcp_abc123..." \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"listApplications","arguments":{}}}' \
  http://192.168.11.10:3458/mcp/messages
```

## Control Server (Multi-Agent Management)

The MCP-Eyes Control Server enables centralized management of multiple agents across the internet. It acts as a hub that accepts WebSocket connections from remote agents, routes commands, and provides a unified API for managing distributed automation infrastructure.

### Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    MCP Client / Open WebUI                      │
│                    (Claude, Cursor, etc.)                       │
└───────────────────────────────┬─────────────────────────────────┘
                                │ HTTP/SSE
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Control Server (Port 3457)                  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  Agent Registry                                           │  │
│  │  - WebSocket connections from agents                      │  │
│  │  - Agent authentication & token validation               │  │
│  │  - Bonjour/mDNS service discovery                        │  │
│  └──────────────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  HTTP API                                                 │  │
│  │  - List agents: GET /api/agents                          │  │
│  │  - Execute commands: POST /api/agents/:id/:method        │  │
│  │  - Agent status: GET /api/agents/:id/status              │  │
│  └──────────────────────────────────────────────────────────┘  │
└───────┬─────────────────────┬─────────────────────┬─────────────┘
        │ WebSocket (wss://) │ WebSocket (wss://) │ WebSocket
        │                    │                    │
        ▼                    ▼                    ▼
┌───────────────┐     ┌───────────────┐     ┌───────────────┐
│   Agent 1     │     │   Agent 2     │     │   Agent 3     │
│   MacBook Pro │     │   Mac Mini    │     │   Windows PC  │
│   (Office)    │     │   (Home)      │     │   (Cloud VM)  │
│               │     │               │     │               │
│  - SSE Server │     │  - SSE Server │     │  - SSE Server │
│  - Native API │     │  - Native API │     │  - Native API │
│  - Browser    │     │  - Browser    │     │  - Browser    │
└───────────────┘     └───────────────┘     └───────────────┘
```

### Features

- **Multi-Agent Management**: Connect and manage unlimited agents from a single control server
- **Internet-Scale**: Agents can connect from anywhere (office, home, cloud VMs)
- **Service Discovery**: Automatic agent discovery via Bonjour/mDNS
- **Unified API**: Single HTTP endpoint to control all agents
- **Agent Authentication**: Token-based authentication for secure connections
- **Real-Time Status**: Live agent health monitoring and ping tracking
- **Command Routing**: Automatic routing of commands to the correct agent

### Installation

The control server is located in the `control_server/` directory:

```bash
cd control_server
npm install
npm run build
npm start
```

### Starting the Control Server

```bash
# Default port 3457
cd control_server
npm start

# Custom port
PORT=8080 npm start

# Development mode with auto-reload
npm run dev
```

On startup, you'll see:

```
╔═══════════════════════════════════════════════════════════════╗
║              MCP-Eyes Control Server v1.0.0                   ║
╠═══════════════════════════════════════════════════════════════╣
║  HTTP API:    http://localhost:3457                          ║
║  WebSocket:   ws://localhost:3457/ws                          ║
║  Bonjour:     Enabled                                         ║
╚═══════════════════════════════════════════════════════════════╝
```

### Agent Registration

Agents connect to the control server via WebSocket and register with authentication tokens:

**Agent Registration Message:**
```json
{
  "type": "register",
  "agent": "My MacBook Pro",
  "token": "agt_xxxxxxxxxxxxxxxx",
  "os": "darwin",
  "osVersion": "25.1.0",
  "arch": "arm64"
}
```

**Control Server Response:**
```json
{
  "type": "registered",
  "id": "550e8400-e29b-41d4-a716-446655440000"
}
```

### Agent Token Format

Agent tokens must start with `agt_` prefix. In production, implement proper token validation against a database or authentication service.

**Example tokens:**
- `agt_abc123def456...` ✅ Valid
- `agt_production_key_2024` ✅ Valid
- `mcp_xyz789` ❌ Invalid (wrong prefix)

### HTTP API Endpoints

#### List All Agents

```bash
GET /api/agents
```

**Response:**
```json
[
  {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "name": "My MacBook Pro",
    "os": "darwin",
    "osVersion": "25.1.0",
    "arch": "arm64",
    "connectedAt": "2024-01-15T10:30:00.000Z",
    "lastPing": "2024-01-15T10:35:00.000Z"
  },
  {
    "id": "660e8400-e29b-41d4-a716-446655440001",
    "name": "Home Mac Mini",
    "os": "darwin",
    "osVersion": "24.0.0",
    "arch": "x64",
    "connectedAt": "2024-01-15T09:15:00.000Z",
    "lastPing": "2024-01-15T10:35:00.000Z"
  }
]
```

#### Get Agent Status

```bash
GET /api/agents/:id/status
```

**Response:**
```json
{
  "status": "online",
  "uptime": 3600,
  "tools": ["listApplications", "screenshot", "click", ...]
}
```

#### Execute Command on Agent

```bash
POST /api/agents/:id/:method
Content-Type: application/json

{
  "x": 0.5,
  "y": 0.3
}
```

**Example: Click on agent**
```bash
curl -X POST http://control-server:3457/api/agents/550e8400.../click \
  -H "Content-Type: application/json" \
  -d '{"x": 0.5, "y": 0.3}'
```

#### Execute Command by Agent Name

```bash
POST /api/agents/by-name/:name/:method
```

**Example:**
```bash
curl -X POST http://control-server:3457/api/agents/by-name/My-MacBook-Pro/screenshot \
  -H "Content-Type: application/json" \
  -d '{}'
```

#### Health Check

```bash
GET /health
```

**Response:**
```json
{
  "status": "ok",
  "agents": 3
}
```

### WebSocket Protocol

Agents connect to `ws://control-server:3457/ws` and communicate using JSON messages:

**Message Types:**

1. **Register** (Agent → Server)
   ```json
   {
     "type": "register",
     "agent": "Agent Name",
     "token": "agt_...",
     "os": "darwin",
     "osVersion": "25.1.0",
     "arch": "arm64"
   }
   ```

2. **Request** (Server → Agent)
   ```json
   {
     "type": "request",
     "id": "request-uuid",
     "method": "screenshot",
     "params": {}
   }
   ```

3. **Response** (Agent → Server)
   ```json
   {
     "type": "response",
     "id": "request-uuid",
     "result": { ... }
   }
   ```

4. **Error** (Agent → Server)
   ```json
   {
     "type": "error",
     "id": "request-uuid",
     "error": "Error message"
   }
   ```

5. **Ping/Pong** (Keep-alive)
   ```json
   {
     "type": "ping",
     "id": "ping-uuid"
   }
   ```
   ```json
   {
     "type": "pong",
     "id": "ping-uuid"
   }
   ```

### Bonjour/mDNS Discovery

The control server automatically announces connected agents via Bonjour/mDNS:

- **Service Type**: `mcp-eyes`
- **Service Name**: `mcp-eyes-{agent-name}`
- **Port**: Control server port (default 3457)
- **TXT Records**:
  - `id`: Agent UUID
  - `name`: Agent display name
  - `os`: Operating system
  - `osVersion`: OS version
  - `arch`: Architecture
  - `remote`: `"true"`

**Discovery Example:**
```bash
# Using dns-sd (macOS)
dns-sd -B _mcp-eyes._tcp

# Using avahi-browse (Linux)
avahi-browse -r _mcp-eyes._tcp
```

### Agent Connection Example

Here's how an agent would connect to the control server:

```javascript
import WebSocket from 'ws';

const ws = new WebSocket('wss://control.example.com/ws');

ws.on('open', () => {
  // Register agent
  ws.send(JSON.stringify({
    type: 'register',
    agent: 'My MacBook Pro',
    token: 'agt_abc123def456...',
    os: 'darwin',
    osVersion: '25.1.0',
    arch: 'arm64'
  }));
});

ws.on('message', (data) => {
  const msg = JSON.parse(data.toString());
  
  if (msg.type === 'request') {
    // Execute command
    const result = await executeCommand(msg.method, msg.params);
    
    // Send response
    ws.send(JSON.stringify({
      type: 'response',
      id: msg.id,
      result
    }));
  }
});
```

### Deployment Scenarios

#### Scenario 1: Single Control Server, Multiple Agents

```
Control Server (cloud.example.com:3457)
    ├── Agent 1 (office-mac.local)
    ├── Agent 2 (home-mac.local)
    └── Agent 3 (cloud-vm.example.com)
```

#### Scenario 2: Control Server Behind Reverse Proxy

```nginx
# nginx.conf
location /ws {
    proxy_pass http://localhost:3457;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
}

location /api {
    proxy_pass http://localhost:3457;
}
```

#### Scenario 3: Docker Deployment

```dockerfile
# Dockerfile
FROM node:20-alpine
WORKDIR /app
COPY control_server/package*.json ./
RUN npm install
COPY control_server/ .
RUN npm run build
EXPOSE 3457
CMD ["npm", "start"]
```

```bash
docker build -t mcp-eyes-control .
docker run -p 3457:3457 mcp-eyes-control
```

### Security Considerations

1. **Token Validation**: Implement proper token validation (database, JWT, etc.)
2. **TLS/SSL**: Use `wss://` for production WebSocket connections
3. **Firewall**: Restrict access to control server port
4. **Rate Limiting**: Implement rate limiting on HTTP API
5. **Authentication**: Add API key authentication for HTTP endpoints

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3457` | Control server HTTP/WebSocket port |

### Integration with MCP-Eyes Agents

To connect an MCP-Eyes agent to the control server, configure the agent's remote client:

```json
{
  "remote": {
    "enabled": true,
    "serverUrl": "wss://control.example.com/ws",
    "agentToken": "agt_abc123def456...",
    "agentName": "My MacBook Pro"
  }
}
```

The agent will automatically:
1. Connect to the control server via WebSocket
2. Register with authentication token
3. Accept and execute commands from the control server
4. Send responses back through the WebSocket connection

## Remote MCP (OAuth 2.1 for AI Tools)

ScreenControl supports the MCP Authorization specification, allowing external AI tools like Claude.ai, Claude Code, and Cursor to securely connect and control your agents via OAuth 2.1.

### How It Works

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  AI CLIENT (Claude.ai / Claude Code / Cursor)                               │
└─────────────────────────────────────────────────────────────────────────────┘
       │
       │ 1. User adds MCP URL: https://screencontrol.knws.co.uk/mcp/{uuid}
       │
       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  DISCOVERY                                                                   │
│  GET /.well-known/oauth-protected-resource/{uuid}                           │
│  GET /.well-known/oauth-authorization-server                                │
└─────────────────────────────────────────────────────────────────────────────┘
       │
       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  AUTHORIZATION                                                               │
│  • Dynamic Client Registration (POST /api/oauth/register)                   │
│  • User Login & Consent Screen                                              │
│  • Authorization Code with PKCE (S256)                                      │
│  • Token Exchange (POST /api/oauth/token)                                   │
└─────────────────────────────────────────────────────────────────────────────┘
       │
       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  MCP COMMUNICATION                                                           │
│  POST /mcp/{uuid}  (JSON-RPC with Bearer token)                             │
│  GET /mcp/{uuid}   (SSE stream with Bearer token)                           │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Connecting Claude.ai

1. **Create a Connection** in the ScreenControl dashboard:
   - Go to Dashboard → Connections → Add Connection
   - Give it a name (e.g., "My Claude.ai")
   - Copy the MCP URL: `https://screencontrol.knws.co.uk/mcp/{your-uuid}`

2. **Add to Claude.ai**:
   - Go to Claude.ai Settings → Integrations → MCP Servers
   - Click "Add MCP Server"
   - Paste your MCP URL
   - Complete the OAuth authorization flow

3. **Authorize Access**:
   - You'll be redirected to ScreenControl login
   - Review the requested permissions (scopes)
   - Click "Allow" to grant access

4. **Start Using**:
   - Claude.ai can now use your ScreenControl tools
   - Available tools: screenshot, click, type, list agents, etc.

### Connecting Claude Code / Claude Desktop

Add to your MCP client configuration (`~/.config/claude/claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "screencontrol": {
      "url": "https://screencontrol.knws.co.uk/mcp/{your-uuid}",
      "transport": "streamable-http"
    }
  }
}
```

On first connection, Claude Code will:
1. Discover the OAuth server metadata
2. Register as a client (Dynamic Client Registration)
3. Open a browser for you to authorize
4. Store tokens for future sessions

### Connecting Cursor

Similar to Claude Code, add to Cursor's MCP configuration:

```json
{
  "mcpServers": {
    "screencontrol": {
      "url": "https://screencontrol.knws.co.uk/mcp/{your-uuid}",
      "transport": "streamable-http"
    }
  }
}
```

### OAuth Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/.well-known/oauth-authorization-server` | GET | OAuth server metadata (RFC 8414) |
| `/.well-known/oauth-protected-resource/{uuid}` | GET | Resource metadata (RFC 9728) |
| `/api/oauth/register` | POST | Dynamic Client Registration (RFC 7591) |
| `/api/oauth/authorize` | GET | Authorization endpoint |
| `/api/oauth/token` | POST | Token exchange |
| `/api/oauth/revoke` | POST | Token revocation |
| `/mcp/{uuid}` | POST/GET | MCP endpoint (requires Bearer token) |

### Scopes

| Scope | Description |
|-------|-------------|
| `mcp:tools` | Access to list and call tools on agents |
| `mcp:resources` | Access to list and read resources |
| `mcp:prompts` | Access to list and use prompts |
| `mcp:agents:read` | Read agent status and metadata |
| `mcp:agents:write` | Modify agent settings |

**Default scopes**: `mcp:tools mcp:resources mcp:agents:read`

### Security Features

- **OAuth 2.1 with PKCE**: S256 code challenge required (no plain method)
- **Token Hashing**: Tokens stored as SHA256 hashes, never in plain text
- **Short-lived Tokens**: Access tokens expire in 1 hour
- **Refresh Token Rotation**: New refresh token issued on each refresh
- **Audience Validation**: Tokens are bound to specific MCP endpoints
- **Rate Limiting**:
  - Registration: 10/hour per IP
  - Token endpoint: 60/minute per IP
  - MCP requests: 100/minute per connection

### Managing Connections

In the ScreenControl dashboard, you can:
- **View** all your MCP connections
- **Create** new connections with unique UUIDs
- **Pause** connections temporarily
- **Revoke** connections permanently
- **View** request logs and usage statistics

### Troubleshooting

**"Invalid token" or 401 errors**:
- Token may have expired - the AI client should automatically refresh
- Connection may have been revoked - check Dashboard → Connections
- Verify you're using the correct MCP URL

**"Insufficient scope" errors**:
- The token doesn't have permission for the requested operation
- Re-authorize with the required scopes

**Rate limit errors (429)**:
- Wait for the `Retry-After` header duration
- Check `X-RateLimit-Reset` header for reset time

**Connection not working after authorization**:
- Ensure your agents are online and connected
- Check the connection status in the dashboard
- Verify the connection is not paused or revoked

## Configuration Examples

### With LM Studio (Local LLM)

```json
{
  "mcpServers": {
    "mcp-eyes": {
      "command": "npx",
      "args": ["-y", "mcp-eyes@latest", "mcp"],
      "env": {
        "LLM_PROVIDER": "lm-studio",
        "LLM_BASE_URL": "http://127.0.0.1:1234",
        "LLM_MODEL": "openai/gpt-oss-20b"
      }
    }
  }
}
```

### With OpenAI API

```json
{
  "mcpServers": {
    "mcp-eyes": {
      "command": "npx",
      "args": ["-y", "mcp-eyes@latest", "mcp"],
      "env": {
        "LLM_PROVIDER": "openai",
        "OPENAI_API_KEY": "sk-your-api-key-here",
        "LLM_MODEL": "gpt-4o-mini"
      }
    }
  }
}
```

### With Claude API

```json
{
  "mcpServers": {
    "mcp-eyes": {
      "command": "npx",
      "args": ["-y", "mcp-eyes@latest", "mcp"],
      "env": {
        "LLM_PROVIDER": "anthropic",
        "ANTHROPIC_API_KEY": "sk-ant-your-api-key-here",
        "LLM_MODEL": "claude-3-5-sonnet-20241022"
      }
    }
  }
}
```

## Platform Support

### macOS (MCPEyes.app)

- **Native Objective-C**: All tools compiled to machine code
- **Apple Accessibility API**: Native UI element detection
- **Screen Recording**: Screenshot capture via CGWindowListCreateImage
- **Menu Bar App**: Status icon with settings window
- **Bonjour**: Local network discovery via mDNS
- **Browser Bridge**: Node.js WebSocket server for browser extensions

### Windows (ScreenControl - C++ Service + C# Tray)

**Hybrid Architecture for Security + Development Speed:**

```
┌─────────────────────────────────────────────────────────────┐
│  ScreenControlService.exe (C++ Win32)                       │
│  ├── Windows Service (runs as SYSTEM)                       │
│  ├── HTTP Server :3456 (cpp-httplib)                        │
│  ├── All tools (screenshot, click, fs, shell)              │
│  ├── Control Server WebSocket client                        │
│  ├── License cache & fingerprinting                         │
│  └── Spawns browser-bridge Node.js                          │
│                                                              │
│  PROTECTED: All business logic, licensing, anti-piracy      │
├──────────────────────────────────────────────────────────────┤
│  ScreenControlTray.exe (C# WinForms .NET 8)                 │
│  ├── NotifyIcon (system tray)                               │
│  ├── ContextMenuStrip (status, settings, restart)          │
│  ├── SettingsForm (TabControl)                              │
│  └── HttpClient to localhost:3456/status                    │
│                                                              │
│  UNPROTECTED: Just UI, easy to update, no secrets           │
└─────────────────────────────────────────────────────────────┘
```

**Key Components:**
- **C++ Service**: Runs independently of user login, starts at boot
- **C# Tray App**: User-friendly status display and settings
- **Named Pipe/HTTP**: Service ↔ Tray communication
- **UI Automation**: Windows accessibility tree inspection
- **Desktop Duplication API**: High-performance screenshots (captures DRM)
- **SendInput API**: Native mouse/keyboard simulation

**Why This Architecture:**
- Service protects all IP (licensing, fingerprinting, tools)
- Tray app has no secrets - safe if reversed
- C# WinForms: Much faster UI development than Win32 DialogBox
- Self-contained: No .NET runtime required (single-file publish)

### Linux (Planned)

- **C/C++ Native**: Same protection as Windows/macOS
- **GUI Mode**: GTK system tray for desktop environments
- **Headless Mode**: CLI/systemd service for servers
- **X11/Wayland**: Support for both display servers
- **xdotool/ydotool**: Input simulation

## Tech Stack

### Core Technologies

- **TypeScript 5.0+**: Type-safe development
- **Node.js 20+**: Modern JavaScript runtime
- **Model Context Protocol (MCP)**: Anthropic's SDK for AI tool integration

### GUI Automation

- **@nut-tree-fork/nut-js 4.2.6**: Cross-platform desktop automation
- **screenshot-desktop 1.15.0**: Multi-platform screenshot capture
- **Sharp 0.33.5**: High-performance image processing
- **@jxa/run 1.4.0**: macOS AppleScript bridge

### AI & Computer Vision

- **Tesseract.js 6.0.1**: OCR text detection
- **fastest-levenshtein 1.0.16**: String similarity matching
- **node-mac-permissions 1.0.0**: macOS permission management

### Browser Integration

- **ws 8.18.3**: WebSocket server for browser bridge
- **Chrome Extension (MV3)**: Manifest V3 extension
- **Firefox Extension (MV2)**: Firefox-compatible extension

## Development

### Prerequisites

- Node.js >= 20.0.0
- TypeScript >= 5.0.0
- Platform-specific dependencies (see platform sections)

### Installation

```bash
git clone https://github.com/datagram1/mcp-eyes.git
cd mcp-eyes
npm install
```

### Building

```bash
# Clean build
npm run build:clean

# Standard build
npm run build

# Development mode
npm run dev
```

### Rebuilding the MCP Proxy Tool

The proxy that Cursor/Claude launch (`dist/mcp-proxy-server.js`) is compiled from `src/mcp-proxy-server.ts`. Rebuild it any time you change the TypeScript source or pull new changes:

1. **Install dependencies** (only needed once per checkout):
   ```bash
   npm install
   ```
2. **Run the standard build**:
   ```bash
   npm run build
   ```
   - The `build` script first runs `scripts/update-version.js` and then executes `tsc` with `tsconfig.json`, compiling every file under `src/` into `dist/`, including `mcp-proxy-server.ts → dist/mcp-proxy-server.js`.
   - After TypeScript finishes, `scripts/set-executable.js` runs automatically (npm `postbuild`) so the generated proxy stays executable when you call it via `node dist/mcp-proxy-server.js`.
3. **Point your MCP client at the rebuilt file**, for example:
   ```json
   {
     "mcpServers": {
       "mcp-eyes": {
         "command": "node",
         "args": ["/Users/you/path/mcp-eyes/dist/mcp-proxy-server.js"]
       }
     }
   }
   ```
   Using a local absolute path keeps Cursor/Claude on the latest code you just compiled. (If you publish to npm, the same file is bundled inside the package.)

### Native Mouse / Multi-Screen Workflow

When browser automation hits CAPTCHAs, file pickers, or anything that insists on “real” user input, drive the Mac exactly like a person:

1. **Discover windows** – Call `listApplications` to get every running app and its window bounds (including Finder and macOS file pickers on secondary displays). The MCP proxy now returns both human-readable text *and* JSON with each app’s coordinates.
2. **Focus the target** – Use `focusApplication` with the bundle or name from step 1 (e.g., `Finder`, `Firefox`, or `Open`). This ensures mouse/keyboard events go to the right window even on another monitor.
3. **See the UI** – Capture it with `screenshot_app` to confirm which display the window is on. For dialogs on far-right monitors, this is the fastest way to verify their location.
4. **Map clickable elements** – Run `getClickableElements`. Need more context? Use the new `getUIElements` tool to dump the full Apple Accessibility tree (Finder rows, file icons, static labels) with coordinates. Combine either response with `screenshot_app` for easy visual matching. If you just need to read text that isn’t exposed via accessibility (e.g., captcha prompts or rendered previews), call `analyzeWithOCR` to get every detected string plus absolute pixel bounds.
5. **Act like a human** – Feed those coordinates into `click`, `moveMouse`, `drag`, `scroll`, `typeText`, `pressKey`, or the new `click_absolute`. Use `click_absolute` when you need to bring a different window/dialog to the front using absolute screen pixels (e.g., two Finder windows side-by-side). Once focused, keep using normalized `click`/`drag` for precision.

This workflow lets the LLM complete file uploads (including Finder navigation), drag-and-drop flows, slider CAPTCHAs, and any other interaction that DOM-level tools can’t reach. Always rediscover (`getClickableElements`) after the UI changes so the coordinates stay accurate.

### Testing

MCP-Eyes includes a comprehensive automated test suite:

```bash
# Run all unit tests (recommended)
npm test

# Run specific test suites
npm run test:fs        # Filesystem tools tests
npm run test:shell     # Shell tools tests
npm run test:registry  # Tool registry tests

# Run with integration tests (requires running server)
npm run test:integration

# Full test suite with build
npm run test:all       # Build + unit tests + validation
npm run test:ci        # Build + unit tests (for CI pipelines)

# Validation tests
npm run test:validate  # MCP structure validation
npm run test:startup   # Server startup tests
```

**Test Coverage:**
- **Filesystem Tools**: 21 tests covering all 9 fs_* operations
- **Shell Tools**: 20 tests for command execution and session management
- **Tool Registry**: 17 tests for profile and configuration management

### Agent Test Server (Debug Builds)

Debug builds of the native agents (macOS, Windows, Linux) include an embedded **Test Server** that enables fully automated end-to-end testing without manual interaction.

**Key Features:**
- **Localhost Only**: Binds exclusively to `127.0.0.1:3456` for security
- **Debug Only**: Completely absent from release/production builds
- **Full UI Control**: Set fields, click buttons, read logs programmatically
- **CI/CD Ready**: Perfect for automated testing pipelines

**Quick Test:**
```bash
# Check if test server is running (debug builds only)
curl http://localhost:3456/ping
# {"pong":true,"version":"1.0.0","debug":true,"port":3456}

# Configure and connect
curl -X POST http://localhost:3456 \
  -H "Content-Type: application/json" \
  -d '{"method":"setField","params":{"field":"serverUrl","value":"ws://localhost:3000/ws"}}'

curl -X POST http://localhost:3456 \
  -H "Content-Type: application/json" \
  -d '{"method":"clickButton","params":{"button":"connect"}}'

# Check connection state
curl -X POST http://localhost:3456 \
  -H "Content-Type: application/json" \
  -d '{"method":"getState"}'
```

**Available Methods:**
| Method | Description |
|--------|-------------|
| `ping` | Health check |
| `getState` | Get connection status |
| `getFields` | Get all UI field values |
| `setField` | Set a field value |
| `clickButton` | Click connect/disconnect/save |
| `getLogs` | Get debug log entries |
| `restart` | Restart the agent |
| `quit` | Quit the agent |

For complete documentation, test scripts, and CI/CD examples, see [docs/AGENT_TEST_SERVER.md](docs/AGENT_TEST_SERVER.md).

### Tool Registry (New in v1.1.16)

The tool registry system allows you to enable/disable tools by category or individually:

**Configuration Location:**
- macOS: `~/Library/Application Support/MCPEyes/tools.json`
- Other: `~/.mcp-eyes-tools.json`

**Configuration Structure:**
```json
{
  "version": 1,
  "activeProfile": "default",
  "profiles": [
    {
      "id": "default",
      "label": "Default",
      "enabled": true,
      "categories": [
        {
          "id": "filesystem",
          "label": "Filesystem Tools",
          "enabled": true,
          "tools": [
            { "id": "fs_read", "enabled": true },
            { "id": "fs_write", "enabled": false }
          ]
        }
      ]
    }
  ]
}
```

**Use Cases:**
- Disable filesystem tools in production environments
- Create restricted profiles for specific workflows
- Enable/disable shell tools based on security requirements

### Project Structure

```
mcp-eyes/
├── src/                    # TypeScript source files
│   ├── mcp-proxy-server.ts        # MCP proxy with all tools (main entry)
│   ├── mcp-sse-server.ts          # SSE server for Open WebUI
│   ├── browser-bridge-server.ts   # WebSocket bridge for browser extensions
│   ├── filesystem-tools.ts        # Filesystem tools implementation
│   ├── shell-tools.ts             # Shell tools implementation
│   ├── tool-registry.ts           # Tool registry and profile management
│   ├── basic-server.ts            # Basic MCP server (stdio)
│   └── advanced-server-simple.ts  # Advanced MCP server (stdio)
├── test/                   # Test suites
│   ├── run-all-tests.js           # Main test runner
│   ├── test-filesystem-tools.js   # Filesystem tools tests (21 tests)
│   ├── test-shell-tools.js        # Shell tools tests (20 tests)
│   ├── test-tool-registry.js      # Tool registry tests (17 tests)
│   └── test-mcp-tools.js          # MCP integration tests
├── tests/                  # Validation tests
│   ├── validate-mcp-structure.js  # MCP structure validation
│   └── test-server-startup.js     # Server startup tests
├── extension/              # Browser extensions
│   ├── chrome/            # Chrome/Edge extension (MV3)
│   ├── firefox/           # Firefox extension (MV2)
│   ├── shared/            # Shared extension code
│   └── native-host/       # Native messaging host
├── macos/                  # Native macOS app
│   └── MCPEyes/           # Xcode project
├── native/                 # Native C++ components
│   └── src/               # HTTP server, discovery, web UI
├── web/                    # Web UI dashboard
│   └── index.html         # Configuration interface
├── docs/                   # Documentation
│   ├── CONTRIBUTING.md
│   ├── LOGGING_SYSTEM.md
│   ├── LOCAL_DEVELOPMENT.md
│   └── ...
└── dist/                   # Compiled JavaScript
```

## macOS Permissions

MCP-Eyes requires specific permissions on macOS:

### Screen Recording (Required)
```bash
open "x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture"
```

### Accessibility (Required for advanced features)
```bash
open "x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility"
```

> **Note**: Grant permissions to your MCP client (Claude, Cursor, VS Code), not to Node.js directly.

## Logging & Debugging

Logs are stored at `~/.mcp-eyes/mcp_eyes.log`:

```bash
# Tail logs in real-time
tail -f ~/.mcp-eyes/mcp_eyes.log

# Set log level
export MCP_EYES_LOG_LEVEL=debug  # DEBUG, INFO, WARN, ERROR, FATAL
```

## Usage Examples

### Filesystem Operations (New in v1.1.16)

```javascript
// List directory contents
const files = await mcpClient.callTool('fs_list', {
  path: '/Users/me/projects',
  recursive: true,
  max_depth: 2
});

// Read file content
const content = await mcpClient.callTool('fs_read', {
  path: '/Users/me/config.json',
  max_bytes: 65536  // Optional limit
});

// Read specific lines (great for large files)
const lines = await mcpClient.callTool('fs_read_range', {
  path: '/Users/me/logs/app.log',
  start_line: 100,
  end_line: 150
});

// Write file (creates directories automatically)
await mcpClient.callTool('fs_write', {
  path: '/Users/me/output/result.txt',
  content: 'Hello World',
  mode: 'overwrite',  // or 'append', 'create_if_missing'
  create_dirs: true
});

// Search for files
const matches = await mcpClient.callTool('fs_search', {
  base: '/Users/me/projects',
  glob: '**/*.ts',
  max_results: 100
});

// Search within files (like grep)
const results = await mcpClient.callTool('fs_grep', {
  base: '/Users/me/projects',
  pattern: 'TODO:',
  glob: '*.ts',
  max_matches: 50
});

// Patch file (safe find-replace)
await mcpClient.callTool('fs_patch', {
  path: '/Users/me/config.json',
  operations: [
    { type: 'replace_first', pattern: '"debug": false', replacement: '"debug": true' },
    { type: 'insert_after', match: '"version"', insert: '  "updated": "2024-01-15",' }
  ],
  dry_run: false  // Set true to preview changes
});
```

### Shell Command Execution (New in v1.1.16)

```javascript
// Simple command execution
const result = await mcpClient.callTool('shell_exec', {
  command: 'npm run build',
  cwd: '/Users/me/project',
  timeout_seconds: 300,
  capture_stderr: true
});
console.log(result.stdout, result.exit_code);

// Start long-running process
const session = await mcpClient.callTool('shell_start_session', {
  command: 'npm run dev',
  cwd: '/Users/me/project'
});

// Monitor session output (streamed via SSE events)
// Session emits 'shell_session_output' events

// Send input to running session
await mcpClient.callTool('shell_send_input', {
  session_id: session.session_id,
  input: 'rs\n'  // Restart command for nodemon
});

// Stop the session
await mcpClient.callTool('shell_stop_session', {
  session_id: session.session_id,
  signal: 'TERM'  // or 'KILL', 'INT'
});
```

### Web Automation Workflow (Recommended Pattern)

```javascript
// 1. Discover available elements
const elements = await mcpClient.callTool('browser_getInteractiveElements', {});
// Returns numbered list with selectors, types, and text

// 2. Find the element you need (e.g., "Login" button)
// Look for element with text containing "Login"

// 3. Click using the selector from discovery
await mcpClient.callTool('browser_clickElement', { 
  selector: '#login-button' // From browser_getInteractiveElements
});

// 4. Wait for page to load
await mcpClient.callTool('browser_waitForPageLoad', {});

// 5. Rediscover elements on new page
const newElements = await mcpClient.callTool('browser_getInteractiveElements', {});
```

### Enhanced Page Inspection (NEW)

```javascript
// Single call to get everything
const page = await mcpClient.callTool('browser_inspectCurrentPage', {
  includeScreenshot: true,
  includeOCR: false
});

// Response includes:
// - pageInfo: { url, title, metadata }
// - elements: Array of enhanced elements with labels, types, coordinates
// - screenshot: Base64 image
// - summary: { totalElements, formCount, inputCount, buttonCount }

// Find login form fields
const emailField = page.elements.find(el =>
  el.label?.toLowerCase().includes('email')
);
const passwordField = page.elements.find(el =>
  el.type === 'password-input'
);
```

### Smart Form Filling (NEW)

```javascript
// Fill form using fuzzy label matching - no selectors needed!
await mcpClient.callTool('browser_fillFormField', {
  label: 'Email',  // Matches "Email Address", "Email:", "Enter your email"
  value: 'user@example.com'
});

await mcpClient.callTool('browser_fillFormField', {
  label: 'Password',  // Matches "Password", "Your Password", etc.
  value: 'secret123'
});

// Click submit button by text
await mcpClient.callTool('browser_clickByText', {
  text: 'Sign In'  // Fuzzy matches "Sign In", "Sign in", "SIGN IN"
});
```

### Link Extraction (Without Clicking)

```javascript
// 1. Discover links
const elements = await mcpClient.callTool('browser_getInteractiveElements', {});
// Find link by text (e.g., "About Us")

// 2. Extract href URL without clicking (NEW: return statements work!)
const result = await mcpClient.callTool('browser_executeScript', {
  script: "return document.querySelector('#about-link').href;"
});
// Returns: { success: true, result: "https://example.com/about" }
```

### Debugging & Diagnostics (NEW)

```javascript
// Check for JavaScript errors
const logs = await mcpClient.callTool('browser_getConsoleLogs', {
  filter: 'error',  // 'error', 'warning', 'log', 'info', 'debug', or 'all'
  clear: false
});
// Returns: Array of console messages with type, timestamp, and content

// Inspect network requests
const requests = await mcpClient.callTool('browser_getNetworkRequests', {
  filter: 'failed',  // Filter for failed requests
  clear: false
});

// Check localStorage data
const storage = await mcpClient.callTool('browser_getLocalStorage', {});
// Returns: Object with all localStorage key-value pairs

// Read cookies
const cookies = await mcpClient.callTool('browser_getCookies', {});
// Returns: Array of cookie objects

// Execute diagnostic script
const diagnostic = await mcpClient.callTool('browser_executeScript', {
  script: `
    return {
      userAgent: navigator.userAgent,
      viewport: { width: window.innerWidth, height: window.innerHeight },
      cookies: document.cookie,
      localStorage: Object.keys(localStorage).length
    };
  `
});
```

### Form Automation

```javascript
// 1. Discover form fields
const elements = await mcpClient.callTool('browser_getInteractiveElements', {});

// 2. Fill fields using selectors from discovery
await mcpClient.callTool('browser_fillElement', {
  selector: '#email', // From discovery
  value: 'user@example.com'
});

await mcpClient.callTool('browser_fillElement', {
  selector: '#password', // From discovery
  value: 'secret123'
});

// 3. Find and click submit button
await mcpClient.callTool('browser_clickElement', {
  selector: '#submit-btn' // From discovery
});

// 4. Wait for result
await mcpClient.callTool('browser_waitForPageLoad', {});
```

### Natural Mode (Real mouse movement)

```javascript
// Get element coordinates
const elements = await mcpClient.callTool('browser_getInteractiveElements', {});
// Move real mouse and click
await mcpClient.callTool('click', { x: 0.5, y: 0.3 });
```

### Advanced Automation (NEW)

```javascript
// Find tab by URL pattern
const tab = await mcpClient.callTool('browser_findTabByUrl', {
  urlPattern: 'github.com/.*'
});

// Click multiple elements in sequence
await mcpClient.callTool('browser_clickMultiple', {
  selectors: ['#step1', '#step2', '#step3'],
  delayMs: 500  // Wait 500ms between clicks
});

// Get structured form metadata
const form = await mcpClient.callTool('browser_getFormStructure', {});
// Returns: Detailed form structure with field types, labels, validation rules

// Auto-answer form questions
await mcpClient.callTool('browser_answerQuestions', {
  answers: {
    'What is your name?': 'John Doe',
    'Email address': 'john@example.com'
  },
  defaultAnswer: 'N/A'  // For unmatched questions
});
```

### Playwright-Style Browser Automation (NEW)

```javascript
// Navigate to a URL
await mcpClient.callTool('browser_navigate', {
  url: 'https://example.com',
  waitUntil: 'load'  // 'load', 'domcontentloaded', or 'networkidle'
});

// Take a screenshot
const screenshot = await mcpClient.callTool('browser_screenshot', {
  fullPage: false,  // Set true for full scrollable page
  selector: '#main-content'  // Optional: screenshot specific element
});
// Returns: { screenshot: 'base64-encoded-png' }

// Browser history navigation
await mcpClient.callTool('browser_go_back', {});
await mcpClient.callTool('browser_go_forward', {});

// Get page HTML content
const html = await mcpClient.callTool('browser_get_visible_html', {
  selector: '#content',  // Optional: limit to specific container
  removeScripts: true,   // Remove script tags (default: true)
  removeStyles: false,   // Remove style tags (default: false)
  cleanHtml: true,       // Comprehensive cleaning
  maxLength: 50000       // Truncate if needed
});

// Hover over element (triggers tooltips, dropdowns)
await mcpClient.callTool('browser_hover', {
  selector: '.dropdown-trigger'
});

// Drag and drop
await mcpClient.callTool('browser_drag', {
  sourceSelector: '.draggable-item',
  targetSelector: '.drop-zone'
});

// Press keyboard keys with modifiers
await mcpClient.callTool('browser_press_key', {
  key: 'Enter'
});
await mcpClient.callTool('browser_press_key', {
  key: 'Ctrl+a',  // Select all
  selector: '#text-input'  // Optional: focus element first
});
await mcpClient.callTool('browser_press_key', {
  key: 'ArrowDown'
});
```

### Multi-Browser Targeting

```javascript
// List connected browsers
await mcpClient.callTool('browser_listConnected', {});

// Target specific browser
await mcpClient.callTool('browser_getTabs', { browser: 'firefox' });

// Set default browser
await mcpClient.callTool('browser_setDefaultBrowser', { browser: 'chrome' });
```

## Troubleshooting

### Screenshots return small images (20x20px)
- Ensure Screen Recording permission is granted
- Restart your MCP client after granting permissions

### Browser extension not connecting
- Verify native messaging host is installed
- Check browser console for errors
- See [extension/README.md](extension/README.md) for debugging

### Browser extension changes not taking effect
- **Firefox**: Remove extension completely from `about:debugging`, then reinstall
- **Chrome/Edge**: Extension reload is usually sufficient, but if issues persist, remove and reinstall
- **Important**: After reinstalling, refresh all browser tabs to load updated content scripts

### browser_executeScript "return not in function" error
- **Fixed in latest version**: The `browser_executeScript` tool now wraps code in an IIFE to support return statements
- Update to the latest extension version if you see this error
- Example that now works: `browser_executeScript({ script: "return document.title;" })`

### "Unknown browser action" errors
- Extension may not be fully loaded or content scripts not injected
- Refresh the target browser tab
- Check that extension is installed and enabled in browser settings
- Verify WebSocket connection in browser console (should show "MCP Eyes WebSocket connected")

### Permission denied errors
- Grant Accessibility permission to your MCP client
- On Linux, ensure X11 access and wmctrl is installed

### macOS menu bar app graphics warnings
- **Fixed in latest version**: Graphics context errors resolved with icon caching and animation batching
- Update to the latest macOS app if you see ViewBridge or CA commit warnings

## Contributing

See [docs/CONTRIBUTING.md](docs/CONTRIBUTING.md) for guidelines.

## License

MIT License - see [LICENSE](LICENSE) for details.

## Links

- **NPM Package**: [npmjs.com/package/mcp-eyes](https://www.npmjs.com/package/mcp-eyes)
- **GitHub**: [github.com/datagram1/mcp-eyes](https://github.com/datagram1/mcp-eyes)
- **Issues**: [github.com/datagram1/mcp-eyes/issues](https://github.com/datagram1/mcp-eyes/issues)

---

Made with care for the AI automation community.
