# ScreenControl Web

Next.js web portal and control server for the ScreenControl platform. Provides agent management, MCP endpoints, OAuth authentication, and AI-powered email automation.

## Features

- **Agent Management**: Monitor and control connected ScreenControl agents
- **MCP Server**: Model Context Protocol endpoints for AI integration (Claude, Cursor, etc.)
- **OAuth 2.0**: Secure authentication with PKCE support
- **Real-time Streaming**: WebSocket connections for live agent communication
- **Email Agent**: AI-powered email automation with LLM integration
- **Toast Notifications**: Non-intrusive fixed-position notifications that don't shift page content
- **Auto-Start Services**: Email agent auto-starts when valid configuration exists

## Getting Started

```bash
# Install dependencies
npm install

# Set up environment variables
cp .env.example .env
# Edit .env with your configuration

# Push database schema
npx prisma db push

# Start development server
npm run dev
```

Open http://localhost:3000 to access the portal.

## Environment Variables

```bash
# Database
DATABASE_URL="postgresql://user:pass@host:5432/screencontrol"

# NextAuth
NEXTAUTH_URL="https://your-domain.com"
NEXTAUTH_SECRET="your-secret-key"

# Email (SMTP for outbound)
EMAIL_SERVER_HOST="mail.example.com"
EMAIL_SERVER_PORT="25"
EMAIL_FROM="noreply@example.com"

# IMAP (for Email Agent)
IMAP_HOST="mail.example.com"
IMAP_PORT="143"
IMAP_USER="agent@example.com"
IMAP_PASSWORD="your-password"
IMAP_TLS="false"

# LLM Provider (choose one)
# Option 1: vLLM / Open WebUI
VLLM_BASE_URL="http://your-vllm-server:8080"
VLLM_MODEL="default"

# Option 2: Claude
ANTHROPIC_API_KEY="sk-ant-..."
CLAUDE_MODEL="claude-sonnet-4-20250514"

# Option 3: OpenAI
OPENAI_API_KEY="sk-..."
OPENAI_MODEL="gpt-4o"
```

## Email Agent

The Email Agent enables AI-powered automation triggered by incoming emails. When an email arrives, it's analyzed by an LLM which decides what ScreenControl actions to take.

### How It Works

```
Email Inbox (IMAP) → Email Watcher → LLM Analysis → ScreenControl Actions → Reply Email
```

1. **IMAP Watcher**: Monitors an email inbox for new messages
2. **LLM Analysis**: Sends email content to configured LLM (vLLM, Claude, or OpenAI)
3. **Action Execution**: LLM determines actions (screenshots, commands, diagnostics)
4. **Reply**: Sends email response with results

### Configuration

Configure via the web UI at `/dashboard/email-agent` or set environment variables:

**IMAP Settings**:
- `IMAP_HOST`: Email server hostname
- `IMAP_PORT`: IMAP port (143 for plain, 993 for TLS)
- `IMAP_USER`: Email address to monitor
- `IMAP_PASSWORD`: Email password
- `IMAP_TLS`: Enable TLS (`true`/`false`)

**LLM Provider**:
- vLLM/Open WebUI: Set `VLLM_BASE_URL` (OpenAI-compatible API)
- Claude: Set `ANTHROPIC_API_KEY`
- OpenAI: Set `OPENAI_API_KEY`

### Supported LLM Providers

| Provider | Config | Notes |
|----------|--------|-------|
| vLLM / Open WebUI | `VLLM_BASE_URL` | OpenAI-compatible API, self-hosted |
| Claude (Anthropic) | `ANTHROPIC_API_KEY` | Cloud API |
| OpenAI / ChatGPT | `OPENAI_API_KEY` | Cloud API |
| Claude Code | CLI installed | Uses local Claude Code CLI for agentic tasks |
| Claude Code Managed (with Supervisor) | CLI + Supervisor LLM | Autonomous mode with supervisor LLM answering questions |

### Claude Code Integration

The Email Agent supports Claude Code for advanced agentic capabilities:

- **Claude Code**: Runs tasks via the Claude Code CLI (`npx @anthropic-ai/claude-code`)
- **Claude Code Managed (with Supervisor)**: Autonomous mode where a supervisor LLM automatically answers Claude Code's questions, enabling fully unattended operation

To use Claude Code providers:
1. Ensure Claude Code CLI is installed and authenticated on the server
2. Select "Claude Code" or "Claude Code Managed (with Supervisor)" from the Provider dropdown
3. For Managed mode, configure a Supervisor LLM (vLLM, Claude, or OpenAI) to handle questions

### Example Use Cases

- **Incident Response**: Forward alert emails, AI investigates and reports findings
- **Remote Diagnostics**: "Check why Agent 6 is offline" → takes screenshots, runs commands
- **Automated Tasks**: "Take a screenshot of the dashboard" → executes and replies with image
- **System Monitoring**: Periodic status reports triggered by scheduled emails

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    ScreenControl Web                         │
├─────────────────────────────────────────────────────────────┤
│  Next.js App (Port 3000/3002)                               │
│  ├── /dashboard        - Web UI                             │
│  ├── /api              - REST APIs                          │
│  ├── /api/mcp          - MCP endpoints                      │
│  └── /ws               - WebSocket (agent connections)      │
├─────────────────────────────────────────────────────────────┤
│  Services                                                    │
│  ├── Agent Registry    - Connected agent management         │
│  ├── Stream Manager    - Real-time screen streaming         │
│  ├── Email Agent       - AI email automation                │
│  └── OAuth Server      - Authentication                     │
├─────────────────────────────────────────────────────────────┤
│  Database (PostgreSQL)                                       │
│  └── Users, Agents, Licenses, EmailTasks, OAuth tokens      │
└─────────────────────────────────────────────────────────────┘
```

## API Endpoints

### Email Agent

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/email-agent` | Get status and recent tasks |
| POST | `/api/email-agent` | Start/stop service |
| GET | `/api/email-agent/settings` | Get configuration |
| PUT | `/api/email-agent/settings` | Update configuration |
| GET | `/api/email-agent/tasks/[id]` | Get task details |

### Agents

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/agents` | List all agents |
| GET | `/api/agents/[id]` | Get agent details |
| POST | `/api/agents/[id]/wake` | Wake sleeping agent |
| POST | `/api/agents/[id]/block` | Block/unblock agent |

### MCP

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/mcp` | MCP server info |
| POST | `/api/mcp` | MCP JSON-RPC |
| GET | `/api/mcp/sse` | SSE for notifications |

## MCP Dynamic Tool Refresh

- MCP capabilities advertise `tools: { listChanged: true }` for live tool updates
- SSE connections emit `notifications/tools/list_changed` on connect
- Tool advertisements from agents trigger broadcasts via SSE manager
- Logs: `SSE CONNECTED`, `SSE PUSH LIST_CHANGED`, `[MCP SSE] Broadcast...`

## Scripts

```bash
npm run dev      # Development server
npm run build    # Production build
npm run start    # Start production server
npm test         # Run tests
npx prisma studio    # Database browser
npx prisma db push   # Push schema changes
```

## Deployment

The server runs as a custom Next.js server (`server.ts`) to support WebSocket connections:

```bash
# Build and start
npm run build
node server.js

# Or with PM2
pm2 start server.js --name screencontrol-web
```

## License

Proprietary - Key Network Services Ltd.
