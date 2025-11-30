# MCP-Eyes

**Professional cross-platform MCP server for GUI automation with Apple Accessibility, browser extension integration, and AI-powered analysis.**

[![npm version](https://img.shields.io/npm/v/mcp-eyes.svg?cache=1)](https://www.npmjs.com/package/mcp-eyes)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D20.0.0-brightgreen.svg)](https://nodejs.org/)

## Features

### Core Capabilities

- **Native Desktop Automation**: Apple Accessibility integration for macOS, PowerShell for Windows, wmctrl for Linux
- **Browser Extension Integration**: Direct DOM manipulation via Chrome, Firefox, Edge, and Safari extensions
- **Multi-Browser Support**: Target specific browsers or use the default (most recently focused)
- **AI Assistant Integration**: Compatible with Claude, Cursor, and other MCP-compatible AI assistants
- **Cross-Platform Support**: macOS, Windows, and Linux

### New in v1.1.15

- **Open WebUI Support**: SSE transport server for HTTP-based MCP clients (Open WebUI, custom integrations)
- **Browser Bridge Server**: WebSocket-based bridge connecting MCP tools to browser extensions
- **15+ Browser Tools**: Full DOM interaction including clicking, filling forms, executing scripts
- **Native macOS App**: Menu bar app with settings UI and permission management
- **Web Configuration UI**: Browser-based dashboard for agent configuration
- **MCP Proxy Architecture**: Secure HTTP backend with API key authentication
- **Control Server**: Centralized management of multiple agents across the internet with WebSocket connections, Bonjour discovery, and unified API
- **LLM-Optimized Tool Descriptions**: Workflow-focused descriptions that teach LLMs proper automation patterns instead of just listing verbs
- **Improved Result Formatting**: Clean, direct result formats for `browser_executeScript` with better error handling

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    MCP Client (Claude, Cursor)                  │
└────────────────────────────┬────────────────────────────────────┘
                             │ MCP Protocol (stdio)
┌────────────────────────────▼────────────────────────────────────┐
│                     MCP-Eyes Proxy Server                        │
│              (mcp-proxy-server.ts / basic-server.ts)            │
└─────────┬─────────────────────────────────────────┬─────────────┘
          │                                         │
          │ HTTP (localhost:3456)                   │ HTTP (localhost:3457)
          ▼                                         ▼
┌─────────────────────────┐            ┌─────────────────────────┐
│   Native HTTP Server    │            │  Browser Bridge Server  │
│  (macOS/Windows/Linux)  │            │    (WebSocket + HTTP)   │
└─────────────────────────┘            └───────────┬─────────────┘
                                                   │ WebSocket
                                       ┌───────────▼─────────────┐
                                       │   Browser Extensions    │
                                       │ Chrome/Firefox/Edge     │
                                       └─────────────────────────┘
```

## Quick Start

### Option 1: NPX (Recommended)

Add to your MCP client configuration:

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
| `screenshot` | Take a screenshot of the focused application |
| `click` | Click at normalized coordinates (0-1) relative to window |
| `getClickableElements` | Get all clickable UI elements via Accessibility API |
| `typeText` | Type text into the focused application |
| `pressKey` | Press keyboard keys with modifiers (Command+L, etc.) |
| `analyzeWithOCR` | Analyze screen content using OCR |
| `checkPermissions` | Check accessibility permission status |

### Browser Extension Tools

| Tool | Description |
|------|-------------|
| `browser_listConnected` | List connected browser extensions |
| `browser_setDefaultBrowser` | Set default browser for commands |
| `browser_getTabs` | List all open browser tabs |
| `browser_getActiveTab` | Get active tab info |
| `browser_focusTab` | Focus a specific tab by ID |
| `browser_getPageInfo` | Get page URL, title, and metadata |
| `browser_getInteractiveElements` | **Primary discovery tool** - Get all buttons, links, inputs with selectors |
| `browser_getPageContext` | Combined page info and elements (convenience tool) |
| `browser_clickElement` | Click element by CSS selector (from discovery) |
| `browser_fillElement` | Fill form field by CSS selector (from discovery) |
| `browser_scrollTo` | Scroll to position or element |
| `browser_executeScript` | Execute JavaScript - **primary use: extract href URLs without clicking** |
| `browser_getFormData` | Get all form data from page |
| `browser_setWatchMode` | Enable DOM change watching |
| `browser_getVisibleText` | Read all visible text content (for parsing, not clicking) |
| `browser_waitForSelector` | Wait for element to appear (after dynamic content) |
| `browser_waitForPageLoad` | Wait for page to load (after navigation) |

### LLM-Friendly Web Automation Workflows

MCP-Eyes tool descriptions are designed to teach LLMs proper automation patterns:

**Core Workflow Pattern:**
1. **Discover** → Use `browser_getInteractiveElements` to see all clickable elements
2. **Select** → Find the element you need by text/description
3. **Copy Selector** → Use the selector from discovery (never guess)
4. **Interact** → Use `browser_clickElement` or `browser_fillElement` with the selector
5. **Wait** → Use `browser_waitForPageLoad` (navigation) or `browser_waitForSelector` (dynamic content)
6. **Rediscover** → Call `browser_getInteractiveElements` again to see new elements

**Link Extraction Pattern:**
1. Use `browser_getInteractiveElements` to find links
2. Match link by text content
3. Use `browser_executeScript` with `return document.querySelector('SELECTOR').href` to extract URL
4. Use the URL without clicking

**Form Automation Pattern:**
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

### macOS

- **Apple Accessibility API**: Native UI element detection
- **JXA Integration**: JavaScript for Automation
- **Screen Recording**: Screenshot capture permission
- **Native App**: Menu bar app for status and settings

### Windows

- **PowerShell Integration**: Native process management
- **Administrator Rights**: Automatic detection and handling

### Linux

- **wmctrl Integration**: X11 window management
- **X11 Support**: Native Linux GUI control

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

```bash
# Run all tests
npm run test:all

# MCP structure validation
npm run test:validate-mcp

# Server startup tests
npm run test:startup
```

### Project Structure

```
mcp-eyes/
├── src/                    # TypeScript source files
│   ├── mcp-sse-server.ts          # SSE server for Open WebUI
│   ├── mcp-proxy-server.ts        # MCP proxy with browser tools
│   ├── browser-bridge-server.ts   # WebSocket bridge for browser extensions
│   ├── basic-server.ts            # Basic MCP server (stdio)
│   └── advanced-server-simple.ts  # Advanced MCP server (stdio)
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

### Link Extraction (Without Clicking)

```javascript
// 1. Discover links
const elements = await mcpClient.callTool('browser_getInteractiveElements', {});
// Find link by text (e.g., "About Us")

// 2. Extract href URL without clicking
const url = await mcpClient.callTool('browser_executeScript', {
  script: "return document.querySelector('#about-link').href;"
});
// Returns: "https://example.com/about"
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

### Permission denied errors
- Grant Accessibility permission to your MCP client
- On Linux, ensure X11 access and wmctrl is installed

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
