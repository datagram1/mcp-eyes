# ScreenControl Platform - Development Tasks

> **Project**: ScreenControl (formerly MCP-Eyes)
> **Provider**: Key Network Services Ltd
> **Created**: 2024-12-07
> **Status**: Planning Phase

---

## Executive Summary

ScreenControl is a multi-tenant SaaS platform that enables AI/LLM systems (Claude.ai, local LLMs, etc.) to control remote computers through a centralized control server. The platform consists of:

- **Control Server**: Public-facing router/hub that manages agent connections, AI authorization, and licensing
- **Master Agents**: Agents with an AI/LLM connected - the "brain" that issues commands to worker agents
- **Worker Agents**: Execute commands from master agents across platforms (macOS, Windows, Linux)
- **Web Platform**: Customer portal for licensing, billing, and configuration
- **Bonjour Discovery**: Local network optimization - master agents communicate directly with workers on the same LAN

---

## Phase Guide

Quick reference for all development phases, their purpose, and dependencies.

### Phase Summary Table

| Phase | Name | Purpose | Dependencies | Independent? | Status |
|-------|------|---------|--------------|--------------|--------|
| **0** | Codebase Consolidation | Merge `./web` and `./control_server` into single Next.js app | None | ✅ Yes | ✅ **17/18 DONE** |
| **1** | Control Server | Database schema, transports (Streamable HTTP, SSE, WebSocket), agent management | Phase 0 | ⚠️ Partial | 🟡 **~75% DONE** |
| **2** | Agent Consolidation (macOS) | Native Objective-C tools in MCPEyes.app, MCP proxy becomes pure relay | None | ✅ Yes | ✅ **CORE DONE** |
| **3** | Windows Agent | Native C++/C# agent (ScreenControl.exe) | Phase 2 (template) | ⚠️ Partial | 🔲 Not started |
| **4** | Linux Agent | Native C/C++ agent with GUI and headless modes | Phase 2 (template) | ⚠️ Partial | 🔲 Not started |
| **5** | Build & Patch System | Customer-stamped installers, anti-piracy, distribution | Phases 2, 3, 4 | ❌ No | 🔲 Not started |
| **6** | Web Platform | Customer portal (downloads, fleet dashboard, billing) | Phase 1 | ❌ No | 🔲 Not started |
| **7** | Dry Run | Internal testing at Key Network Services Ltd | Phases 1-6 | ❌ No | 🔲 Not started |
| **8** | Testing Infrastructure | Test suite updates, legacy cleanup, new integration tests | None | ✅ Yes | 🔲 Not started |

### Phase Descriptions

**Phase 0: Codebase Consolidation** `COMPLETE ✓`
> Merge the web portal and control server into a single Next.js application with custom server. Creates unified deployment at `app.screencontrol.knws.co.uk`.
> - ✅ Custom server.ts with WebSocket support
> - ✅ Control server logic in src/lib/control-server/
> - ✅ Portal pages (login, signup, dashboard)
> - ✅ Deleted old ./control_server directory
> - ✅ Production build tested
> - ⏳ Documentation update (0.1.14)

**Phase 1: Control Server** `IN PROGRESS (~75%)`
> The hub that all agents connect to. Implements Streamable HTTP (for Claude.ai), SSE (legacy), and WebSocket (agents). Handles licensing, authorization, and command routing.
> - ✅ Database schema complete (all models)
> - ✅ Prisma migrations applied, client generated
> - ✅ WebSocket handler with agent registry
> - ✅ MCP endpoint (/api/mcp) with JSON-RPC
> - ✅ SSE endpoint (/api/mcp/sse) for Open WebUI
> - ✅ License validation on connect (db-service.ts)
> - ✅ Command/connection logging to database
> - ✅ Activity pattern tracking & quiet hours
> - ⏳ Wake broadcasts, command queue
> - ⏳ Production deployment (TLS, rate limiting)

**Phase 2: Agent Consolidation (macOS)** `CORE COMPLETE ✓` (Control Server integration pending Phase 1)
> Move all tools (filesystem, shell, GUI, browser) into native Objective-C code within MCPEyes.app. The MCP proxy becomes a pure relay with no local execution. Required for macOS permissions (Screen Recording, Accessibility) and reverse engineering protection.
> - ✅ Native FilesystemTools.m implemented (9 methods)
> - ✅ Native ShellTools.m implemented (4 methods + session management)
> - ✅ MCPServer.m updated with /fs/* and /shell/* routes
> - ✅ MCP Proxy refactored to pure relay
> - ⏳ Control Server connection (2.4.3-2.4.10) pending Phase 1

**Phase 3: Windows Agent**
> Port the macOS agent architecture to Windows using native C++/C# (.NET). Same HTTP server structure, native tool implementations, browser bridge spawning.

**Phase 4: Linux Agent**
> Port the macOS agent architecture to Linux using native C/C++. Supports both GUI mode (X11/Wayland) and headless CLI/service mode for servers.

**Phase 5: Build & Patch System**
> Creates customer-specific installers by patching "golden" binaries with customer ID, license tier, and anti-piracy markers. Enables controlled distribution.

**Phase 6: Web Platform**
> Customer self-service portal: installer downloads, agent fleet management, real-time status, billing/subscription management.

**Phase 7: Dry Run**
> Internal testing at Key Network Services Ltd before customer rollout. Deploy complete platform, verify all integrations, fix issues.

**Phase 8: Testing Infrastructure**
> Audit existing tests, remove obsolete legacy tests, create new tests for the refactored architecture.

### Recommended Development Order

```
                    ┌─────────────────┐
                    │    Phase 0      │ ◄── Start here (merge codebase)
                    │   Consolidation │
                    └────────┬────────┘
                             │
              ┌──────────────┼──────────────┐
              │              │              │
              ▼              ▼              ▼
      ┌───────────┐   ┌───────────┐   ┌───────────┐
      │  Phase 1  │   │  Phase 2  │   │  Phase 8  │
      │  Control  │   │   macOS   │   │  Testing  │
      │  Server   │   │   Agent   │   │           │
      └─────┬─────┘   └─────┬─────┘   └───────────┘
            │               │              ▲
            │         ┌─────┴─────┐        │ (parallel)
            │         │           │        │
            │         ▼           ▼        │
            │   ┌───────────┬───────────┐  │
            │   │  Phase 3  │  Phase 4  │  │
            │   │  Windows  │   Linux   │──┘
            │   └─────┬─────┴─────┬─────┘
            │         │           │
            │         └─────┬─────┘
            │               │
            │               ▼
            │       ┌───────────┐
            │       │  Phase 5  │
            │       │   Build   │
            │       │  System   │
            │       └─────┬─────┘
            │             │
            └──────┬──────┘
                   │
                   ▼
           ┌───────────┐
           │  Phase 6  │
           │   Web     │
           │ Platform  │
           └─────┬─────┘
                 │
                 ▼
           ┌───────────┐
           │  Phase 7  │
           │  Dry Run  │
           └───────────┘
```

### Parallel Development Opportunities

1. **Phase 2 + Phase 1**: macOS agent can be developed with `STANDALONE_MODE` flag while control server is built
2. **Phase 3 + Phase 4**: Windows and Linux agents can be developed in parallel (both use Phase 2 as template)
3. **Phase 8**: Testing can run continuously alongside all other phases

---

## Architecture Overview

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
│                           control.knws.co.uk                                      │
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

### Bonjour Local Network Discovery (Bandwidth Optimization)

For large enterprise deployments, master agents can communicate **directly** with worker agents on the same network segment, bypassing the control server for command relay:

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                        SAME NETWORK SEGMENT (LAN)                                │
│                                                                                  │
│  ┌─────────────────┐                                    ┌─────────────────┐     │
│  │  MASTER AGENT   │◄─────── Bonjour mDNS ──────────────│  WORKER AGENT   │     │
│  │  + AI/LLM       │         Discovery                  │                 │     │
│  │                 │                                    │                 │     │
│  │  192.168.1.10   │         _screencontrol._tcp        │  192.168.1.20   │     │
│  └────────┬────────┘                                    └────────┬────────┘     │
│           │                                                      │              │
│           │◄──────────── Direct Commands ────────────────────────┘              │
│           │              (No control server relay)                              │
│           │                                                                     │
│           │         ┌─────────────────┐      ┌─────────────────┐               │
│           └────────►│  WORKER AGENT   │      │  WORKER AGENT   │               │
│                     │  192.168.1.21   │◄────►│  192.168.1.22   │               │
│                     └─────────────────┘      └─────────────────┘               │
│                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      │ Status & Licensing only
                                      │ (Commands bypass control server)
                                      ▼
                        ┌─────────────────────────┐
                        │    CONTROL SERVER       │
                        │                         │
                        │ • Receives heartbeats   │
                        │ • Validates licenses    │
                        │ • Tracks agent status   │
                        │ • Audit logging         │
                        │                         │
                        │ (No command relay for   │
                        │  local network traffic) │
                        └─────────────────────────┘
```

### Agent Types

| Type | Description | AI Connection | Can Command Others |
|------|-------------|---------------|-------------------|
| **Master Agent** | Has AI/LLM connected (local or API). Issues commands to workers. | Yes (required) | Yes |
| **Worker Agent** | Executes commands from master. No AI connected. | No | No |

### Connection Modes

| Mode | Path | Port | Use Case |
|------|------|------|----------|
| **Direct Cloud** | Claude.ai → Control Server → Workers | 443 (HTTPS) | Claude.ai users, workers behind firewalls |
| **Master via WAN** | Master Agent → Control Server → Workers | 443 (HTTPS) | Remote networks, firewall traversal |
| **Master via LAN** | Master Agent → Bonjour → Workers | 3456 (HTTP) | Same network, direct communication |
| **Hybrid** | LAN (3456) for local, WAN (443) for remote | Both | Enterprise with multiple sites |

### Why Control Server is Required for WAN

The control server acts as a **bridge for firewall traversal**:

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                           REMOTE / WAN SCENARIO                                  │
│                                                                                  │
│  ┌─────────────────┐                              ┌─────────────────────────┐   │
│  │  Claude.ai      │                              │  CORPORATE NETWORK      │   │
│  │  (or Master     │                              │  (Behind Firewall/NAT)  │   │
│  │   Agent on      │     Cannot reach directly    │                         │   │
│  │   remote net)   │ ─ ─ ─ ─ ─ ─ ─ ✗ ─ ─ ─ ─ ─ ─►│  Worker Agents          │   │
│  └────────┬────────┘                              │  (No inbound ports)     │   │
│           │                                       └────────────┬────────────┘   │
│           │                                                    │                │
│           │ HTTPS (443)                   WebSocket (outbound) │                │
│           │                                                    │                │
│           ▼                                                    ▼                │
│  ┌──────────────────────────────────────────────────────────────────────────┐   │
│  │                        CONTROL SERVER                                     │   │
│  │                        (Public Internet)                                  │   │
│  │                                                                           │   │
│  │  • Workers connect OUTBOUND (no firewall issues)                          │   │
│  │  • Control server bridges commands to connected workers                   │   │
│  │  • Solves NAT traversal problem                                           │   │
│  │  • Maintains persistent WebSocket connections                             │   │
│  └──────────────────────────────────────────────────────────────────────────┘   │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### Local LAN Communication (Port 3456)

For same-network scenarios, master agents communicate directly with workers:

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                           LOCAL LAN SCENARIO                                     │
│                           (Same Network Segment)                                 │
│                                                                                  │
│  ┌─────────────────┐         Bonjour mDNS          ┌─────────────────┐          │
│  │  MASTER AGENT   │◄─────── Discovery ────────────│  WORKER AGENT   │          │
│  │  + AI/LLM       │         _screencontrol._tcp   │                 │          │
│  │                 │                               │                 │          │
│  │  192.168.1.10   │                               │  192.168.1.20   │          │
│  └────────┬────────┘                               └────────┬────────┘          │
│           │                                                 │                   │
│           │◄───────────── Port 3456 (HTTP) ─────────────────┘                   │
│           │               Direct Commands                                       │
│           │               (No control server)                                   │
│           │                                                                     │
│           │         ┌─────────────────┐      ┌─────────────────┐               │
│           └────────►│  WORKER AGENT   │      │  WORKER AGENT   │               │
│                     │  192.168.1.21   │      │  192.168.1.22   │               │
│                     │  :3456          │      │  :3456          │               │
│                     └─────────────────┘      └─────────────────┘               │
│                                                                                 │
│  Control Server: Still receives heartbeats for licensing/status (async)        │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### Port Summary

| Port | Protocol | Scope | Purpose |
|------|----------|-------|---------|
| **443** | HTTPS/WSS | WAN (Internet) | Control server - AI connections, agent WebSockets |
| **3456** | HTTP | LAN only | Direct master→worker communication (Bonjour) |
| **3457** | HTTP | localhost | Agent tools server (browser bridge, fs, shell) |

### Bonjour Discovery Details

- **Service Type**: `_screencontrol._tcp`
- **Port Advertised**: 3456
- **Discovery**: Master agents query, workers respond with capabilities
- **Fallback**: If worker not on LAN or Bonjour unavailable → route through control server
- **Security**: Same license validation, different transport
- **Logging**: Commands still logged to control server asynchronously

---

## Phase 0: Codebase Consolidation (Priority: FIRST)

Merge `./web` (Next.js portal) and `./control_server` into a single combined application.

### Architecture Decision: Combined Portal + Control Server

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    WEB ARCHITECTURE                                          │
│                                                                              │
│  www.screencontrol.knws.co.uk                                               │
│  ─────────────────────────────                                               │
│  • Static marketing site (separate repo or ./marketing)                     │
│  • Landing page, pricing, features, docs                                    │
│  • "Login" → redirects to app.screencontrol.knws.co.uk                     │
│  • CDN-cached, fast                                                         │
│                                                                              │
│  app.screencontrol.knws.co.uk                                               │
│  ─────────────────────────────                                               │
│  • Combined Portal + Control Server (./web)                                 │
│  • Single Next.js application with custom server                            │
│  │                                                                          │
│  ├── Portal Routes (customer-facing)                                        │
│  │   ├── /login, /signup           → Authentication                        │
│  │   ├── /dashboard                → Main dashboard                        │
│  │   ├── /agents                   → Agent fleet management                │
│  │   ├── /downloads                → Installer downloads                   │
│  │   ├── /settings                 → Account settings                      │
│  │   └── /billing                  → Subscription management               │
│  │                                                                          │
│  ├── API Routes (portal backend)                                            │
│  │   ├── /api/auth/*               → NextAuth endpoints                    │
│  │   ├── /api/agents/*             → Agent CRUD, activation                │
│  │   ├── /api/installers/*         → Installer download/patching           │
│  │   └── /api/billing/*            → Stripe webhooks                       │
│  │                                                                          │
│  ├── Control Server Routes (agent/AI facing)                                │
│  │   ├── /ws                       → Agent WebSocket connections           │
│  │   ├── /mcp                      → AI Streamable HTTP                    │
│  │   └── /mcp/sse                  → Legacy SSE for Open WebUI             │
│  │                                                                          │
│  └── Shared                                                                 │
│      ├── Database (Prisma)         → Single connection pool                │
│      ├── Authentication            → Shared session/JWT                    │
│      └── Types                     → Shared TypeScript types               │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Why Combined?**
- No CORS complexity (same origin)
- Shared authentication (portal login = control server auth)
- Single database connection pool
- Shared TypeScript types
- One deployment to manage
- Still scales horizontally (with Redis for WebSocket coordination)

### 0.1 Directory Structure Migration

**Current:**
```
./web/                    → Next.js portal (incomplete)
./control_server/         → Express/Node control server
```

**Target:**
```
./web/                    → Combined Next.js app
├── prisma/
│   └── schema.prisma     → All models (agents, users, etc.)
├── src/
│   ├── app/              → Next.js App Router
│   │   ├── (marketing)/  → Public pages (if not separate)
│   │   ├── (portal)/     → Authenticated portal pages
│   │   │   ├── dashboard/
│   │   │   ├── agents/
│   │   │   ├── downloads/
│   │   │   └── settings/
│   │   ├── api/          → API routes
│   │   │   ├── auth/
│   │   │   ├── agents/
│   │   │   ├── installers/
│   │   │   └── mcp/      → MCP Streamable HTTP handler
│   │   └── layout.tsx
│   ├── lib/
│   │   ├── prisma.ts     → Prisma client singleton
│   │   ├── auth.ts       → NextAuth config
│   │   ├── control-server/  → Migrated from ./control_server
│   │   │   ├── agent-registry.ts
│   │   │   ├── command-router.ts
│   │   │   ├── broadcaster.ts
│   │   │   ├── heartbeat.ts
│   │   │   ├── license.ts
│   │   │   └── websocket-handler.ts
│   │   └── patch-service/   → Installer patching
│   ├── components/       → React components
│   └── types/            → Shared TypeScript types
├── server.ts             → Custom Next.js server (for WebSocket)
├── package.json
├── tsconfig.json
└── .env                  → Database URL, secrets

./control_server/         → DELETED after migration
```

**Tasks:**
- [x] 0.1.1 Audit current ./web and ./control_server code
- [x] 0.1.2 Create new directory structure in ./web (src/lib/control-server/)
- [x] 0.1.3 Migrate Prisma schema (comprehensive schema with all models)
- [x] 0.1.4 Migrate control_server logic to ./web/src/lib/control-server/
- [x] 0.1.5 Create custom Next.js server (server.ts) for WebSocket support
- [x] 0.1.6 Set up WebSocket handler on /ws route
- [x] 0.1.7 Set up MCP Streamable HTTP on /api/mcp route
- [x] 0.1.8 Set up SSE endpoint on /api/mcp/sse route
- [x] 0.1.9 Migrate any existing portal pages/components (login, signup, dashboard)
- [x] 0.1.10 Update package.json with combined dependencies
- [x] 0.1.11 Test WebSocket connections work with custom server ✓ Server running
- [x] 0.1.12 Test Next.js pages still work ✓ /api/health responds
- [x] 0.1.13 Delete ./control_server directory
- [ ] 0.1.14 Update all documentation references

### 0.2 Custom Next.js Server for WebSocket

Next.js doesn't natively support WebSocket in API routes. We need a custom server.

**server.ts (conceptual):**
```typescript
import { createServer } from 'http';
import { parse } from 'url';
import next from 'next';
import { WebSocketServer } from 'ws';
import { handleAgentConnection } from './src/lib/control-server/websocket-handler';

const dev = process.env.NODE_ENV !== 'production';
const app = next({ dev });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const server = createServer((req, res) => {
    const parsedUrl = parse(req.url!, true);
    handle(req, res, parsedUrl);
  });

  // WebSocket server for agent connections
  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (req, socket, head) => {
    const { pathname } = parse(req.url!);

    if (pathname === '/ws') {
      wss.handleUpgrade(req, socket, head, (ws) => {
        handleAgentConnection(ws, req);
      });
    } else {
      socket.destroy();
    }
  });

  server.listen(3000, () => {
    console.log('> Ready on http://localhost:3000');
  });
});
```

**Tasks:**
- [x] 0.2.1 Create server.ts with WebSocket support
- [x] 0.2.2 Update package.json scripts to use custom server
- [x] 0.2.3 Ensure hot reload still works in development ✓ tsx watch working
- [x] 0.2.4 Test production build with custom server ✓ (Build successful, server starts)

---

## Phase 1: Control Server (Priority: CRITICAL)

The control server must be operational first. All agents will connect to it.

### 1.1 Database Schema Updates

**File**: `web/prisma/schema.prisma`

Add the following models:

```prisma
// ============================================
// AGENT (with ownership and states)
// ============================================

model Agent {
  id                String      @id @default(cuid())

  // Ownership - which customer owns this agent
  ownerUserId       String      // The SaaS customer who distributed the installer
  customerId        String      // Embedded customer ID from stamped installer

  // Agent identity (from installer stamp)
  installerVersion  String?     // Version of installer used

  // License & Fingerprinting
  licenseUuid       String?     @unique  // Issued by Control Server on activation
  fingerprint       String?     // SHA256 hash of hardware+software+licenseUuid
  fingerprintRaw    Json?       // Raw fingerprint components (for debugging)
  isDuplicate       Boolean     @default(false)  // Detected as clone/duplicate

  // Machine info (reported by agent on connect)
  machineName       String?
  machineId         String?     // Hardware-derived unique ID (part of fingerprint)
  localUsername     String?
  ipAddress         String?
  localIpAddress    String?     // LAN IP for Bonjour

  // OS info
  osType            OSType
  osVersion         String?
  arch              String?     // x64, arm64, etc.

  // Hardware info (for fingerprint)
  cpuModel          String?
  cpuId             String?
  diskSerial        String?
  motherboardUuid   String?
  totalRamMb        Int?
  macAddress        String?

  // License Status
  state             AgentState  @default(PENDING)

  // Connection Status
  isOnline          Boolean     @default(false)
  isScreenLocked    Boolean     @default(false)
  powerState        PowerState  @default(PASSIVE)
  currentTask       String?     // Task ID if currently executing

  // Timestamps
  firstSeenAt       DateTime    @default(now())
  lastSeenAt        DateTime    @default(now())
  activatedAt       DateTime?   // When moved to ACTIVE
  blockedAt         DateTime?   // When moved to BLOCKED
  deactivatedAt     DateTime?   // When fingerprint mismatch detected

  // Grouping
  tags              String[]
  groupName         String?
  notes             String?

  createdAt         DateTime    @default(now())
  updatedAt         DateTime    @updatedAt

  owner             User        @relation(fields: [ownerUserId], references: [id], onDelete: Cascade)
  permissions       AgentPermission[]
  fingerprintHistory FingerprintChange[]

  @@unique([customerId, machineId])  // Same installer + same machine = same agent
  @@index([ownerUserId])
  @@index([customerId])
  @@index([licenseUuid])
  @@index([fingerprint])
  @@index([state])
  @@map("agents")
}

// Track fingerprint changes for audit
model FingerprintChange {
  id                String    @id @default(cuid())
  agentId           String

  // What changed
  changeType        String    // "ip_change", "username_change", "hardware_change", "duplicate_detected"
  previousValue     String?
  newValue          String?
  previousFingerprint String?
  newFingerprint    String?

  // Context
  ipAddress         String?

  // Action taken
  actionTaken       String    // "allowed", "logged", "deactivated"

  createdAt         DateTime  @default(now())

  agent             Agent     @relation(fields: [agentId], references: [id], onDelete: Cascade)

  @@index([agentId])
  @@index([createdAt])
  @@map("fingerprint_changes")
}

enum OSType {
  MACOS
  WINDOWS
  LINUX
}

enum AgentState {
  PENDING   // Connected but not activated (free tier)
  ACTIVE    // Activated, billable, full functionality
  BLOCKED   // Explicitly blocked by customer
  EXPIRED   // License expired
}

enum PowerState {
  ACTIVE    // High readiness, 5-10s heartbeat, instant response
  PASSIVE   // Normal mode, 30-60s heartbeat, <1s response
  SLEEP     // Low power, 5-10min heartbeat, delayed response
}

// ============================================
// CUSTOMER ACTIVITY PATTERNS (for sleep prediction)
// ============================================

model CustomerActivityPattern {
  id                String    @id @default(cuid())
  userId            String    @unique

  // Hourly activity buckets (0-23) - count of commands in each hour
  hourlyActivity    Int[]     @default([0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0])

  // Detected quiet hours (calculated from hourlyActivity)
  quietHoursStart   Int?      // e.g., 22 (10 PM)
  quietHoursEnd     Int?      // e.g., 6 (6 AM)

  // Customer preferences
  scheduleMode      ScheduleMode @default(AUTO_DETECT)
  customActiveStart Int?      // For CUSTOM mode
  customActiveEnd   Int?      // For CUSTOM mode
  timezone          String    @default("UTC")

  updatedAt         DateTime  @updatedAt

  user              User      @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@map("customer_activity_patterns")
}

enum ScheduleMode {
  ALWAYS_ACTIVE    // 24/7 high readiness
  AUTO_DETECT      // Learn from usage patterns
  CUSTOM           // Customer-defined hours
  SLEEP_OVERNIGHT  // Simple overnight sleep
}

// ============================================
// INSTALLER DOWNLOADS (tracking)
// ============================================

model InstallerDownload {
  id                String    @id @default(cuid())
  userId            String

  // What was downloaded
  platform          OSType
  variant           String?   // "gui", "headless", etc.
  version           String

  // Stamp info
  customerId        String    // The customer ID embedded in this installer
  checksumSalt      String    // Random salt for anti-piracy checksum

  // Tracking
  ipAddress         String?
  userAgent         String?

  downloadedAt      DateTime  @default(now())

  user              User      @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
  @@index([customerId])
  @@map("installer_downloads")
}

// ============================================
// AI/LLM CONNECTIONS
// ============================================

model AIConnection {
  id                String      @id @default(cuid())
  userId            String

  // Connection type
  provider          AIProvider
  name              String      // "My Claude", "Office Ollama"

  // OAuth / API credentials (encrypted at rest)
  oauthClientId     String?
  oauthClientSecret String?     // Encrypted
  apiKey            String?     // Encrypted

  // For Streamable HTTP - identifies this AI connection
  connectionToken   String      @unique @default(cuid())

  // Status
  isActive          Boolean     @default(true)
  lastConnectedAt   DateTime?

  createdAt         DateTime    @default(now())
  updatedAt         DateTime    @updatedAt

  user              User        @relation(fields: [userId], references: [id], onDelete: Cascade)
  permissions       AgentPermission[]
  commandLogs       CommandLog[]

  @@map("ai_connections")
}

// ============================================
// AGENT PERMISSIONS (which AI can control which agents)
// ============================================

model AgentPermission {
  id                String    @id @default(cuid())
  agentId           String
  aiConnectionId    String

  // Permissions
  canExecuteTools   Boolean   @default(true)
  allowedTools      String[]  // Empty = all tools allowed
  deniedTools       String[]  // Explicit denials override allowed

  createdAt         DateTime  @default(now())
  updatedAt         DateTime  @updatedAt

  agent             Agent     @relation(fields: [agentId], references: [id], onDelete: Cascade)
  aiConnection      AIConnection @relation(fields: [aiConnectionId], references: [id], onDelete: Cascade)

  @@unique([agentId, aiConnectionId])
  @@map("agent_permissions")
}

// ============================================
// COMMAND LOGGING (audit trail)
// ============================================

model CommandLog {
  id                String    @id @default(cuid())
  aiConnectionId    String?
  agentId           String

  // Request
  method            String    // "tools/call", "tools/list"
  toolName          String?
  params            Json?

  // Response
  success           Boolean
  errorMessage      String?
  durationMs        Int?

  // Context
  ipAddress         String?

  timestamp         DateTime  @default(now())

  aiConnection      AIConnection? @relation(fields: [aiConnectionId], references: [id], onDelete: SetNull)

  @@index([aiConnectionId])
  @@index([agentId])
  @@index([timestamp])
  @@map("command_logs")
}

// ============================================
// CONTROL SERVER SESSIONS
// ============================================

model ControlSession {
  id                String    @id @default(cuid())

  // Who is connected
  connectionType    ConnectionType
  aiConnectionId    String?   // If AI
  agentId           String?   // If Agent

  // Session info
  sessionToken      String    @unique
  ipAddress         String?
  userAgent         String?

  // Status
  isActive          Boolean   @default(true)
  connectedAt       DateTime  @default(now())
  lastActivityAt    DateTime  @default(now())
  disconnectedAt    DateTime?

  @@index([sessionToken])
  @@index([aiConnectionId])
  @@index([agentId])
  @@map("control_sessions")
}

// ============================================
// NEW ENUMS
// ============================================

enum AIProvider {
  CLAUDE_AI
  OPENAI
  ANTHROPIC_API
  OLLAMA
  LOCAL_LLM
  CUSTOM
}

enum ConnectionType {
  AI_STREAMABLE_HTTP
  AI_SSE
  AI_PROXY
  AGENT_WEBSOCKET
}
```

**Tasks:**
- [x] 1.1.1 Add Agent model with ownership, states, fingerprinting, and power state fields
- [x] 1.1.2 Add FingerprintChange model for audit trail
- [x] 1.1.3 Add CustomerActivityPattern model for sleep prediction
- [x] 1.1.4 Add InstallerDownload model for tracking stamped installer downloads
- [x] 1.1.5 Add AIConnection model to schema
- [x] 1.1.6 Add AgentPermission model to schema (via CommandLog)
- [x] 1.1.7 Add CommandLog model to schema
- [x] 1.1.8 Add ControlSession model to schema (AgentSession)
- [x] 1.1.9 Add new enums (OSType, AgentState, PowerState, ScheduleMode, etc.)
- [x] 1.1.10 Add relations to existing User model
- [x] 1.1.11 Run `npx prisma migrate dev --name add_control_server_models` ✓ (DB up to date)
- [x] 1.1.12 Generate Prisma client ✓ (Generated v5.22.0)

### 1.2 Agent Connection & Heartbeat Protocol

**The Core Problem:**
Agents are behind firewalls. We can't push to them. They must connect to us and stay connected for real-time commands. But we can't overload the server with 10,000 agents pinging constantly, and we can't hard-kill agents on brief network glitches.

**Solution: Persistent WebSocket + Lightweight Heartbeat + Local License Cache**

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    AGENT ←→ CONTROL SERVER PROTOCOL                         │
│                                                                              │
│  AGENT (behind firewall)                    CONTROL SERVER                  │
│  ─────────────────────                      ──────────────                  │
│                                                                              │
│  1. CONNECT (outbound WebSocket)                                             │
│     ──────────────────────────────────────────────────────────────────────► │
│     WSS://control.knws.co.uk/ws                                              │
│                                                                              │
│  2. REGISTER (once on connect)                                               │
│     ──────────────────────────────────────────────────────────────────────► │
│     {                                                                        │
│       type: "register",                                                      │
│       customerId: "...",        // From stamped installer                    │
│       licenseUuid: "...",       // From local storage (null if new)         │
│       fingerprint: "...",       // Current hardware fingerprint             │
│       machineInfo: {...},       // Name, OS, user, etc.                     │
│       status: {                                                              │
│         ready: true,                                                         │
│         screenLocked: false,                                                 │
│         currentTask: null                                                    │
│       }                                                                      │
│     }                                                                        │
│                                                                              │
│  3. REGISTER RESPONSE                                                        │
│     ◄────────────────────────────────────────────────────────────────────── │
│     {                                                                        │
│       type: "registered",                                                    │
│       agentId: "...",                                                        │
│       licenseStatus: "active",  // active, pending, expired, blocked        │
│       licenseUuid: "...",       // Issued if new activation                 │
│       licenseExpiresAt: "...",  // For local cache                          │
│       heartbeatInterval: 30000  // Server tells agent how often to ping     │
│     }                                                                        │
│                                                                              │
│  4. HEARTBEAT (every 30s, tiny payload)                                      │
│     ──────────────────────────────────────────────────────────────────────► │
│     {                                                                        │
│       type: "heartbeat",                                                     │
│       status: {                                                              │
│         ready: true,                                                         │
│         screenLocked: false,                                                 │
│         currentTask: null,                                                   │
│         cpuUsage: 15,                                                        │
│         memoryUsage: 45                                                      │
│       }                                                                      │
│     }                                                                        │
│                                                                              │
│  5. HEARTBEAT RESPONSE (tiny)                                                │
│     ◄────────────────────────────────────────────────────────────────────── │
│     {                                                                        │
│       type: "heartbeat_ack",                                                 │
│       licenseStatus: "active",  // Quick license check each heartbeat       │
│       pendingCommands: 0        // Hint if commands waiting                  │
│     }                                                                        │
│                                                                              │
│  6. COMMAND (server → agent, real-time)                                      │
│     ◄────────────────────────────────────────────────────────────────────── │
│     {                                                                        │
│       type: "command",                                                       │
│       id: "cmd-123",                                                         │
│       method: "screenshot",                                                  │
│       params: {}                                                             │
│     }                                                                        │
│                                                                              │
│  7. COMMAND RESPONSE                                                         │
│     ──────────────────────────────────────────────────────────────────────► │
│     {                                                                        │
│       type: "response",                                                      │
│       id: "cmd-123",                                                         │
│       result: {...}                                                          │
│     }                                                                        │
└─────────────────────────────────────────────────────────────────────────────┘
```

**License Enforcement with Grace Periods:**
```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    LOCAL LICENSE CACHE (Agent-side)                          │
│                                                                              │
│  Agent stores locally:                                                       │
│  ├── licenseUuid: "..."                                                      │
│  ├── licenseStatus: "active"                                                 │
│  ├── licenseExpiresAt: "2024-02-15T00:00:00Z"  // Next billing date         │
│  ├── lastServerContact: "2024-01-15T10:30:00Z"                              │
│  └── gracePeriodHours: 72  // How long to work without server contact       │
│                                                                              │
│  DECISION LOGIC:                                                             │
│  ─────────────────                                                           │
│  if (connected to Control Server) {                                          │
│    // Use real-time license status from server                               │
│    // Update local cache on each heartbeat                                   │
│  }                                                                           │
│  else if (now - lastServerContact < gracePeriodHours) {                     │
│    // Network is down, but within grace period                               │
│    // Use cached license status                                              │
│    // Continue working normally                                              │
│    // Keep trying to reconnect in background                                 │
│  }                                                                           │
│  else {                                                                      │
│    // Grace period exceeded                                                  │
│    // Enter DEGRADED mode:                                                   │
│    //   - Refuse new commands                                                │
│    //   - Complete any in-progress task                                      │
│    //   - Show warning in UI                                                 │
│    //   - Keep trying to reconnect                                           │
│  }                                                                           │
│                                                                              │
│  NEVER:                                                                      │
│  - Hard-kill mid-task                                                        │
│  - Delete local license immediately on disconnect                            │
│  - Panic on brief network glitch                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Command Execution Pre-Conditions:**
```
┌─────────────────────────────────────────────────────────────────────────────┐
│           COMMAND FLOW: AI → Control Server → Agent                          │
│                                                                              │
│  AI sends: "Execute screenshot on Worker 12 at Customer A"                   │
│                         ↓                                                    │
│  CONTROL SERVER CHECKS:                                                      │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │ ✓ License OK?        │ Agent must be ACTIVE (not pending/blocked/expired)││
│  │ ✓ Online?            │ WebSocket connected right now                     ││
│  │ ✓ Ready?             │ Not currently executing another task              ││
│  │ ✓ Screen unlocked?   │ For GUI tools (screenshot, click, etc.)          ││
│  │ ✓ AI authorized?     │ This AI connection has permission for this agent ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                         ↓                                                    │
│  ALL CHECKS PASS:                                                            │
│    → Forward command via WebSocket                                           │
│    → Agent executes immediately                                              │
│    → Result returned via WebSocket                                           │
│    → Control Server forwards to AI                                           │
│                                                                              │
│  ANY CHECK FAILS:                                                            │
│    → Return error to AI immediately                                          │
│    → Error includes: which check failed, agent status                        │
│    → AI can decide: wait, retry, choose different agent                      │
│                                                                              │
│  AGENT OFFLINE BUT LICENSED:                                                 │
│    → Option A: Return "agent offline" error immediately                      │
│    → Option B: Queue command, execute when agent reconnects                  │
│    → Option C: Return error with "last seen X minutes ago"                   │
│    (Customer configures preferred behavior in portal)                        │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Agent Power States (Bandwidth Optimization):**
```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    AGENT POWER STATES                                        │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │  ACTIVE                                                                  ││
│  │  ────────                                                                ││
│  │  Heartbeat: Every 5-10 seconds                                           ││
│  │  Response time: Instant (<100ms)                                         ││
│  │  CPU: Normal                                                             ││
│  │                                                                          ││
│  │  Triggered by:                                                           ││
│  │  • AI/Master agent connects to Control Server                           ││
│  │  • Customer logs into portal                                             ││
│  │  • Command is being executed                                             ││
│  │  • Cooldown after last command (5 minutes)                              ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                              ↓ (5 min inactivity)                           │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │  PASSIVE                                                                 ││
│  │  ────────                                                                ││
│  │  Heartbeat: Every 30-60 seconds                                          ││
│  │  Response time: <1 second (next heartbeat triggers wake)                ││
│  │  CPU: Reduced                                                            ││
│  │                                                                          ││
│  │  Default state during business hours with no active brain               ││
│  │  Ready to receive commands, just checking in less often                 ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                              ↓ (30 min inactivity OR predicted quiet time)  │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │  SLEEP                                                                   ││
│  │  ────────                                                                ││
│  │  Heartbeat: Every 5-10 minutes                                           ││
│  │  Response time: Up to 10 minutes (waits for next check-in)              ││
│  │  CPU: Minimal                                                            ││
│  │                                                                          ││
│  │  Triggered by:                                                           ││
│  │  • Extended inactivity (30+ minutes, no brain connected)                ││
│  │  • Predicted quiet hours (learned from usage patterns)                  ││
│  │  • Customer-defined schedule (e.g., "sleep 10pm-6am")                   ││
│  │                                                                          ││
│  │  Wake triggers:                                                          ││
│  │  • Next heartbeat sees "wake" flag from server                          ││
│  │  • Scheduled wake time                                                   ││
│  │  • Local activity (user unlocks screen)                                 ││
│  └─────────────────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────────────────┘
```

**State Transitions:**
```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    STATE TRANSITION TRIGGERS                                 │
│                                                                              │
│  WAKE (any state → ACTIVE):                                                  │
│  ─────────────────────────────                                               │
│  • AI connects to Control Server for this customer                          │
│  • Customer logs into web portal                                             │
│  • Command received for this agent                                           │
│  • Local screen unlock (if configured)                                       │
│                                                                              │
│  Server broadcasts to all customer's agents:                                │
│  {                                                                           │
│    type: "state_change",                                                     │
│    targetState: "active",                                                    │
│    reason: "portal_login",  // or "ai_connected", "command_pending"         │
│    heartbeatInterval: 5000  // 5 seconds                                    │
│  }                                                                           │
│                                                                              │
│  SLEEP (PASSIVE → SLEEP):                                                    │
│  ─────────────────────────────                                               │
│  • 30 min inactivity + no brain connected                                   │
│  • Predicted quiet hours (ML model)                                         │
│  • Customer schedule                                                         │
│                                                                              │
│  Server includes in heartbeat_ack:                                          │
│  {                                                                           │
│    type: "heartbeat_ack",                                                    │
│    targetState: "sleep",                                                     │
│    heartbeatInterval: 300000,  // 5 minutes                                 │
│    wakeAt: "2024-01-16T06:00:00Z"  // Optional scheduled wake              │
│  }                                                                           │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Usage Pattern Learning:**
```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    CUSTOMER ACTIVITY PATTERNS                                │
│                                                                              │
│  Control Server tracks per customer:                                         │
│  ├── command_history: timestamps of all commands                            │
│  ├── portal_logins: when customer uses web portal                           │
│  ├── ai_connections: when AI/master agent is active                         │
│  └── timezone: customer's local timezone                                    │
│                                                                              │
│  Simple heuristics (no heavy ML needed):                                    │
│  ─────────────────────────────────────────                                   │
│  • Track hourly activity buckets for last 30 days                           │
│  • Hours with <5% of activity = "quiet hours"                               │
│  • Agents can auto-sleep during predicted quiet hours                       │
│                                                                              │
│  Example pattern detected:                                                   │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │ Hour:  0  1  2  3  4  5  6  7  8  9 10 11 12 13 14 15 16 17 18 19 20  │ │
│  │ Act:   ░  ░  ░  ░  ░  ░  ░  ▓  ▓  ▓  ▓  ▓  ▓  ▓  ▓  ▓  ▓  ▓  ░  ░  ░  │ │
│  │                              └───────── ACTIVE ────────┘               │ │
│  │        └───── SLEEP ──────┘                             └─ SLEEP ──┘   │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                              │
│  Customer can override in portal:                                           │
│  • "Always active" (24/7 operation)                                          │
│  • Custom schedule ("active 6am-10pm")                                       │
│  • "Sleep overnight" (auto-detect quiet hours)                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Bandwidth Savings:**
```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    BANDWIDTH COMPARISON                                      │
│                                                                              │
│  ALWAYS ACTIVE (naive approach):                                             │
│  ─────────────────────────────────                                           │
│  Heartbeat: 5 seconds                                                        │
│  Per agent: 17,280 heartbeats/day × 200 bytes = 3.4 MB/day                  │
│  10,000 agents: 34 GB/day                                                    │
│                                                                              │
│  WITH POWER STATES (typical usage: 8hr active, 16hr sleep):                 │
│  ─────────────────────────────────────────────────────────────────────       │
│  Active 8 hours: 5,760 heartbeats × 200 bytes = 1.1 MB                      │
│  Sleep 16 hours: 192 heartbeats × 200 bytes = 38 KB                         │
│  Per agent: 1.2 MB/day (65% reduction)                                       │
│  10,000 agents: 12 GB/day (saved 22 GB/day)                                 │
│                                                                              │
│  WITH MOSTLY IDLE CUSTOMERS (portal used 1hr/day):                          │
│  ─────────────────────────────────────────────────────────────────────       │
│  Active 1 hour: 720 heartbeats = 144 KB                                     │
│  Passive 3 hours: 360 heartbeats = 72 KB                                    │
│  Sleep 20 hours: 240 heartbeats = 48 KB                                     │
│  Per agent: 264 KB/day (92% reduction!)                                      │
│  10,000 agents: 2.6 GB/day                                                   │
│                                                                              │
│  Server load also reduced proportionally:                                   │
│  • Fewer WebSocket messages to process                                       │
│  • Fewer database heartbeat updates                                          │
│  • More headroom for actual commands                                         │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Command Queueing for Sleeping Agents:**
```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    HANDLING COMMANDS TO SLEEPING AGENTS                      │
│                                                                              │
│  AI sends command to sleeping agent:                                         │
│                         ↓                                                    │
│  Control Server options (customer configures):                              │
│                                                                              │
│  OPTION A: Wait for wake (default for non-urgent)                           │
│  ├── Queue command on server                                                 │
│  ├── Set "pendingCommands" flag for agent                                   │
│  ├── Agent sees flag on next heartbeat → wakes → executes                  │
│  └── Worst case: 5-10 minute delay                                          │
│                                                                              │
│  OPTION B: Force wake (for urgent commands)                                 │
│  ├── Return "agent sleeping, will wake on next check-in (max 5 min)"       │
│  ├── AI can wait or choose different agent                                  │
│  └── Agent wakes on next heartbeat                                          │
│                                                                              │
│  OPTION C: Immediate error (for time-sensitive operations)                  │
│  ├── Return "agent sleeping" error immediately                              │
│  └── AI must choose an active agent                                          │
│                                                                              │
│  OPTION D: Wake all (for broadcast operations)                              │
│  ├── Mark all customer's agents for wake                                    │
│  └── They all wake on next heartbeat                                         │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Tasks:**
- [x] 1.2.1 Implement WebSocket connection handler with agent registry
- [x] 1.2.2 Implement REGISTER message handling (validate customer, fingerprint)
- [x] 1.2.3 Implement HEARTBEAT protocol with adaptive intervals
- [ ] 1.2.4 Implement license status check on each heartbeat (fast DB query)
- [x] 1.2.5 Implement command routing (AI → Control Server → Agent)
- [ ] 1.2.6 Implement pre-condition checks before command forwarding
- [x] 1.2.7 Implement graceful disconnect handling (mark offline, don't delete)
- [x] 1.2.8 Add Prisma client integration for agent state persistence
- [x] 1.2.9 Implement connection logging to database (via db-service.ts)
- [x] 1.2.10 Implement command logging to database (via db-service.ts)
- [x] 1.2.11 Implement power state management (ACTIVE/PASSIVE/SLEEP)
- [ ] 1.2.12 Implement "wake all" broadcast on portal login
- [ ] 1.2.13 Implement "wake all" broadcast on AI connection
- [x] 1.2.14 Implement activity-based heartbeat interval adjustment
- [x] 1.2.15 Track customer activity patterns (hourly buckets) ✓ (recordActivity in db-service.ts)
- [x] 1.2.16 Implement quiet hours prediction (simple heuristics) ✓ (detectQuietHours in db-service.ts)
- [ ] 1.2.17 Implement customer schedule overrides (always active, custom hours)
- [ ] 1.2.18 Implement command queue for sleeping agents
- [ ] 1.2.19 Implement pendingCommands flag in heartbeat_ack

### 1.3 Agent-Side Connection & License Cache

**Tasks:**
- [ ] 1.3.1 Implement WebSocket client with auto-reconnect (exponential backoff)
- [ ] 1.3.2 Implement REGISTER message on connect
- [ ] 1.3.3 Implement HEARTBEAT sending at server-specified interval
- [ ] 1.3.4 Implement local license cache (secure storage)
- [ ] 1.3.5 Implement grace period logic (72 hours default)
- [ ] 1.3.6 Implement DEGRADED mode when grace period exceeded
- [ ] 1.3.7 Implement status reporting (ready, screen locked, current task)
- [ ] 1.3.8 Implement command reception and execution
- [ ] 1.3.9 Implement response sending
- [ ] 1.3.10 Never hard-kill mid-task (complete current, then enforce)

### 1.4 Control Server Core Refactor

**File**: `web/src/lib/control-server/db-service.ts` (moved from control_server)

**Tasks:**
- [x] 1.4.1 Add Prisma client integration ✓ (db-service.ts imports prisma)
- [x] 1.4.2 Implement license validation on agent connect ✓ (findOrCreateAgent)
- [x] 1.4.3 Implement AI connection authorization ✓ (trackAIConnection)
- [x] 1.4.4 Implement trial/expired/suspended handling ✓ (licenseStatus logic)
- [x] 1.4.5 Add connection logging to database ✓ (markAgentOnline, AgentSession)
- [x] 1.4.6 Add command logging to database ✓ (logCommand, updateCommandLog)

### 1.5 Streamable HTTP Transport

**File**: `control_server/src/transports/streamable-http.ts` (new)

Implement MCP Streamable HTTP transport per spec: https://modelcontextprotocol.io/specification/2025-03-26/basic/transports

**Tasks:**
- [ ] 1.3.1 Upgrade `@modelcontextprotocol/sdk` to `^1.10.0` or latest
- [x] 1.3.2 Create `/mcp` endpoint handling POST requests (/api/mcp/route.ts)
- [ ] 1.3.3 Create `/mcp` endpoint handling GET requests (SSE streaming)
- [ ] 1.3.4 Implement `Mcp-Session-Id` header management
- [x] 1.3.5 Implement request/response JSON-RPC handling
- [ ] 1.3.6 Implement SSE streaming for server-initiated messages
- [x] 1.3.7 Add proper `Accept` and `Content-Type` header handling
- [x] 1.3.8 Forward all MCP methods to target agent
- [ ] 1.3.9 Aggregate `tools/list` from connected agents

### 1.6 SSE Transport (Legacy - Keep for Open WebUI)

**File**: `control_server/src/transports/sse.ts` (refactor from existing)

**Tasks:**
- [x] 1.4.1 Extract SSE logic to separate module (/api/mcp/sse/route.ts)
- [x] 1.4.2 Maintain `/mcp/sse` and `/mcp/messages` endpoints
- [x] 1.4.3 Ensure backward compatibility with Open WebUI

### 1.7 Agent WebSocket Handler

**File**: `control_server/src/handlers/agent-websocket.ts` (new)

**Tasks:**
- [x] 1.5.1 Extract WebSocket handler to module (websocket-handler.ts)
- [x] 1.5.2 Validate license on connect (query database)
- [ ] 1.5.3 Implement periodic license re-validation
- [ ] 1.5.4 Handle license expiry mid-session
- [ ] 1.5.5 Register agent capabilities (tool list)
- [x] 1.5.6 Forward MCP requests to agent
- [x] 1.5.7 Return responses to AI connection

### 1.8 Horizontal Scaling Architecture (Future-Proofing)

**Goal**: Ensure current design has no blockers for multiple control servers behind load balancer.

**The Challenge:**
```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    THE WEBSOCKET STATE PROBLEM                               │
│                                                                              │
│  Agent A ──WebSocket──► Control Server 1 (knows about Agent A)              │
│  Agent B ──WebSocket──► Control Server 2 (knows about Agent B)              │
│                                                                              │
│  AI sends command for Agent A:                                               │
│  AI ──HTTP──► Load Balancer ──► Control Server 2                            │
│                                                                              │
│  Problem: Server 2 doesn't have Agent A's WebSocket!                        │
│                                                                              │
│  This is the classic "sticky sessions" problem with WebSockets.             │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Solution: Redis as Coordination Layer**
```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    MULTI-SERVER ARCHITECTURE                                 │
│                                                                              │
│                      ┌─────────────────────┐                                │
│                      │   Load Balancer     │                                │
│                      │   (Round Robin DNS) │                                │
│                      └──────────┬──────────┘                                │
│                                 │                                            │
│              ┌──────────────────┼──────────────────┐                        │
│              │                  │                  │                        │
│              ▼                  ▼                  ▼                        │
│     ┌─────────────┐    ┌─────────────┐    ┌─────────────┐                  │
│     │  Server 1   │    │  Server 2   │    │  Server 3   │                  │
│     │             │    │             │    │             │                  │
│     │ Agent A ◄───┤    │ Agent C ◄───┤    │ Agent E ◄───┤                  │
│     │ Agent B ◄───┤    │ Agent D ◄───┤    │ Agent F ◄───┤                  │
│     └──────┬──────┘    └──────┬──────┘    └──────┬──────┘                  │
│            │                  │                  │                          │
│            └──────────────────┼──────────────────┘                          │
│                               │                                              │
│                               ▼                                              │
│     ┌───────────────────────────────────────────────────────────────────┐   │
│     │                         REDIS CLUSTER                              │   │
│     │                                                                    │   │
│     │  Agent Registry:                                                   │   │
│     │  ├── agent:A → {server: "server-1", status: "active"}             │   │
│     │  ├── agent:B → {server: "server-1", status: "passive"}            │   │
│     │  ├── agent:C → {server: "server-2", status: "sleep"}              │   │
│     │  └── ...                                                           │   │
│     │                                                                    │   │
│     │  Pub/Sub Channels:                                                 │   │
│     │  ├── server-1:commands  (Server 1 subscribes)                     │   │
│     │  ├── server-2:commands  (Server 2 subscribes)                     │   │
│     │  └── server-3:commands  (Server 3 subscribes)                     │   │
│     │                                                                    │   │
│     │  Broadcast Channel:                                                │   │
│     │  └── customer:{id}:wake  (All servers subscribe)                  │   │
│     └───────────────────────────────────────────────────────────────────┘   │
│                               │                                              │
│                               ▼                                              │
│     ┌───────────────────────────────────────────────────────────────────┐   │
│     │                    POSTGRESQL CLUSTER                              │   │
│     │                                                                    │   │
│     │  Primary (writes) ───► Replica 1 (reads)                          │   │
│     │                   └──► Replica 2 (reads)                          │   │
│     │                                                                    │   │
│     │  OR: CockroachDB / PlanetScale for distributed writes             │   │
│     └───────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Command Flow (Multi-Server):**
```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    COMMAND ROUTING WITH REDIS                                │
│                                                                              │
│  1. AI sends command for Agent A                                             │
│     AI ──HTTP──► Load Balancer ──► Server 2                                 │
│                                                                              │
│  2. Server 2 looks up Agent A in Redis                                       │
│     Redis: agent:A → {server: "server-1", ...}                              │
│                                                                              │
│  3. Server 2 publishes command to Server 1's channel                        │
│     PUBLISH server-1:commands {agentId: "A", command: {...}}                │
│                                                                              │
│  4. Server 1 receives, forwards to Agent A via local WebSocket             │
│     Server 1 ──WebSocket──► Agent A                                         │
│                                                                              │
│  5. Agent A responds via WebSocket to Server 1                              │
│                                                                              │
│  6. Server 1 publishes response back                                        │
│     PUBLISH responses:{requestId} {result: {...}}                           │
│                                                                              │
│  7. Server 2 receives response, returns to AI                               │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Current Design Blockers & Fixes:**

| Component | Current Design | Scaling Blocker? | Fix Required |
|-----------|---------------|------------------|--------------|
| Agent state | PostgreSQL | ✓ No blocker | Use read replicas |
| WebSocket registry | In-memory Map | ⚠️ **BLOCKER** | Add Redis registry |
| Heartbeat updates | Direct DB write | ⚠️ High write load | Batch via Redis |
| Command routing | Local lookup | ⚠️ **BLOCKER** | Add Redis Pub/Sub |
| Wake broadcast | Local only | ⚠️ **BLOCKER** | Add Redis Pub/Sub |
| Command queue | Database | ✓ No blocker | Works as-is |
| License checks | Database | ✓ No blocker | Cache in Redis |
| Activity patterns | Database | ✓ No blocker | Works as-is |
| Fingerprints | Database | ✓ No blocker | Works as-is |

**Design Principles for Scale-Ready Code:**

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    SCALE-READY DESIGN PATTERNS                               │
│                                                                              │
│  1. AGENT REGISTRY ABSTRACTION                                               │
│     ─────────────────────────────                                            │
│     interface AgentRegistry {                                                │
│       register(agentId, serverInstance, status): void                       │
│       lookup(agentId): {server, status} | null                              │
│       unregister(agentId): void                                             │
│       listByCustomer(customerId): Agent[]                                   │
│     }                                                                        │
│                                                                              │
│     // Single server: LocalAgentRegistry (in-memory Map)                    │
│     // Multi server: RedisAgentRegistry (Redis hash)                        │
│                                                                              │
│  2. COMMAND ROUTER ABSTRACTION                                               │
│     ─────────────────────────────                                            │
│     interface CommandRouter {                                                │
│       sendCommand(agentId, command): Promise<Response>                      │
│     }                                                                        │
│                                                                              │
│     // Single server: LocalCommandRouter (direct WebSocket)                 │
│     // Multi server: RedisCommandRouter (Pub/Sub)                           │
│                                                                              │
│  3. BROADCAST ABSTRACTION                                                    │
│     ─────────────────────────────                                            │
│     interface Broadcaster {                                                  │
│       wakeCustomerAgents(customerId): void                                  │
│       notifyStateChange(agentId, newState): void                            │
│     }                                                                        │
│                                                                              │
│     // Single server: LocalBroadcaster (iterate local connections)         │
│     // Multi server: RedisBroadcaster (Pub/Sub)                             │
│                                                                              │
│  4. HEARTBEAT BATCHING                                                       │
│     ─────────────────────────────                                            │
│     // Don't write every heartbeat to DB immediately                        │
│     // Batch updates every 5-10 seconds                                     │
│     // Or: Write to Redis, async worker flushes to DB                       │
│                                                                              │
│  5. LICENSE CACHE                                                            │
│     ─────────────────────────────                                            │
│     // Cache license status in Redis with TTL                               │
│     // Reduces DB reads on every heartbeat                                  │
│     // Invalidate on license change via Pub/Sub                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Phase 1 Approach (Single Server, Scale-Ready):**
```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    IMPLEMENTATION STRATEGY                                   │
│                                                                              │
│  PHASE 1 (Current): Single server, but with abstractions                   │
│  ────────────────────────────────────────────────────────────────────────── │
│  • Use LocalAgentRegistry (in-memory)                                       │
│  • Use LocalCommandRouter (direct WebSocket)                                │
│  • Use LocalBroadcaster (iterate local connections)                         │
│  • Direct DB writes for heartbeats (acceptable at low scale)               │
│  • No Redis required yet                                                    │
│                                                                              │
│  PHASE 2 (Scale): Swap implementations, add Redis                           │
│  ────────────────────────────────────────────────────────────────────────── │
│  • Swap to RedisAgentRegistry                                               │
│  • Swap to RedisCommandRouter                                               │
│  • Swap to RedisBroadcaster                                                 │
│  • Add heartbeat batching                                                   │
│  • Add license caching                                                      │
│  • Deploy multiple servers behind load balancer                             │
│                                                                              │
│  Code changes: Minimal (just swap implementations)                          │
│  Architecture changes: Add Redis, add load balancer                        │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Database Scaling Options:**
```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    DATABASE SCALING                                          │
│                                                                              │
│  OPTION 1: PostgreSQL with Read Replicas                                    │
│  ────────────────────────────────────────────────────────────────────────── │
│  • Primary handles writes (heartbeats, commands, state changes)            │
│  • Replicas handle reads (agent lists, license checks, dashboards)         │
│  • Use PgBouncer for connection pooling                                     │
│  • Works well up to ~50K agents                                             │
│                                                                              │
│  OPTION 2: CockroachDB (Distributed SQL)                                    │
│  ────────────────────────────────────────────────────────────────────────── │
│  • Fully distributed writes                                                  │
│  • Automatic sharding                                                        │
│  • PostgreSQL-compatible (Prisma works)                                     │
│  • Better for 100K+ agents                                                  │
│                                                                              │
│  OPTION 3: Hybrid (PostgreSQL + Redis)                                      │
│  ────────────────────────────────────────────────────────────────────────── │
│  • Hot data in Redis (agent status, heartbeats, online/offline)            │
│  • Cold data in PostgreSQL (history, logs, config)                          │
│  • Best performance, more complexity                                        │
│                                                                              │
│  RECOMMENDATION: Start with Option 1, evolve to Option 3 if needed         │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Scaling Philosophy: "Design for scale, build for today"**

> Cost of designing for scale now: ~2 hours (write interfaces)
> Cost of retrofitting scale later: ~2 weeks (rewrite everything)

Phase 1 gets us to a working product. When customer growth demands it, we add Redis and swap implementations with minimal code changes.

**Tasks (Scale-Ready Design):**
- [x] 1.8.1 Create AgentRegistry interface (abstraction layer - IAgentRegistry)
- [x] 1.8.2 Implement LocalAgentRegistry for single-server mode
- [ ] 1.8.3 Create CommandRouter interface (abstraction layer)
- [ ] 1.8.4 Implement LocalCommandRouter for single-server mode
- [ ] 1.8.5 Create Broadcaster interface (abstraction layer)
- [ ] 1.8.6 Implement LocalBroadcaster for single-server mode
- [ ] 1.8.7 Document Redis implementations for Phase 2 (not implement yet)
- [x] 1.8.8 Ensure all agent state is persisted to database (not just in-memory)
- [ ] 1.8.9 Design heartbeat batching strategy (implement in Phase 2)
- [ ] 1.8.10 Document database scaling path (read replicas → distributed)

### 1.9 Control Server Configuration

**Database Server (Ready):**
```
Host:     192.168.10.15
Port:     5432
User:     keynetworks
Database: screencontrol (to be created)

# Connection string (store password in environment variable, not in code!)
DATABASE_URL=postgresql://keynetworks:${DB_PASSWORD}@192.168.10.15:5432/screencontrol
```

> ⚠️ **Security Note**: Never commit database passwords to git. Store in:
> - Environment variables (`DB_PASSWORD`)
> - `.env` file (add to `.gitignore`)
> - Secrets manager (AWS Secrets Manager, HashiCorp Vault, etc.)

**Database Setup Tasks:**
- [x] 1.9.1 Create `screencontrol` database ✓ (Running on 192.168.11.3)
- [x] 1.9.2 Configure Prisma connection string ✓ (.env configured)
- [x] 1.9.3 Run `npx prisma migrate dev` to create all tables ✓ (DB up to date)
- [x] 1.9.4 Verify tables created: agents, ai_connections, command_logs, etc. ✓
- [ ] 1.9.5 Create database user with limited privileges for production (not superuser)

**Server Configuration Tasks:**
- [x] 1.9.6 Add environment variable configuration ✓ (.env exists)
- [ ] 1.9.7 Configure for Key Network Services Ltd internal DNS
- [ ] 1.9.8 Add TLS/HTTPS support (required for production)
- [ ] 1.9.9 Add CORS configuration for web platform
- [ ] 1.9.10 Add rate limiting
- [ ] 1.9.11 Add request validation

### 1.10 Control Server Testing

**Tasks:**
- [ ] 1.7.1 Create test suite for Streamable HTTP transport
- [ ] 1.7.2 Create test suite for SSE transport
- [ ] 1.7.3 Create test suite for agent WebSocket
- [ ] 1.7.4 Create test suite for license validation
- [ ] 1.7.5 Integration test: Claude.ai simulation
- [ ] 1.7.6 Integration test: Agent connect/disconnect
- [ ] 1.7.7 Load testing

---

## Phase 2: Agent Consolidation (macOS)

Move all tools into MCPEyes.app. The agent becomes the single source of all capabilities.

### Architecture Decision: Native Code for All Tools

**Why all tools must be in the native app (not spawned Node.js):**

1. **macOS Permissions**: Screen Recording and Accessibility permissions are granted to specific apps by bundle ID. A spawned Node.js process does NOT inherit these permissions from MCPEyes.app.

2. **Security (Reverse Engineering Protection)**: Native Objective-C/C++ code compiles to machine code, which is significantly harder to reverse engineer than JavaScript/TypeScript. This protects our intellectual property and licensing logic.

3. **Performance**: Native code executes faster than Node.js for system-level operations.

4. **Unified Codebase**: All tool logic in one compiled binary simplifies deployment and updates.

```
MCPEyes.app (Native Objective-C/C++)
├── HTTP Server :3456
│   ├── /screenshot, /click, /pressKey     ← GUI Tools (need permissions)
│   ├── /getClickableElements, /getUIElements
│   ├── /fs/*                              ← Filesystem Tools (native implementation)
│   ├── /shell/*                           ← Shell Tools (native implementation)
│   └── /browser/* → proxy to :3457
│
└── Spawns: browser-bridge-server.js :3457
            └── WebSocket bridge only (no permissions needed)
```

### 2.1 Browser Bridge Server (WebSocket Only)

**File**: `src/browser-bridge-server.ts` (keep existing name)

This Node.js process is spawned by MCPEyes.app and ONLY handles browser extension WebSocket connections. It contains NO tools - just a relay.

**Tasks:**
- [x] 2.1.1 Remove any filesystem tool references (if present) ✓ Already clean
- [x] 2.1.2 Remove any shell tool references (if present) ✓ Already clean
- [x] 2.1.3 Keep ONLY WebSocket server for browser extensions ✓ Already clean
- [x] 2.1.4 Keep browser action relay (`/browser/*` HTTP endpoints) ✓ Already clean
- [x] 2.1.5 Ensure clean separation - this is just a protocol bridge ✓ Already clean

### 2.2 Implement Filesystem Tools in MCPEyes.app (Native)

**Files**: `macos/MCPEyes/FilesystemTools.m` (new), `macos/MCPEyes/FilesystemTools.h` (new)

Implement all filesystem operations in native Objective-C/C++.

**Tasks:**
- [x] 2.2.1 Create FilesystemTools class with HTTP endpoint handlers
- [x] 2.2.2 Implement `fs_list` - NSFileManager directory enumeration
- [x] 2.2.3 Implement `fs_read` - NSData/NSString file reading with size limits
- [x] 2.2.4 Implement `fs_read_range` - Line-based partial file reading
- [x] 2.2.5 Implement `fs_write` - NSData file writing with modes (overwrite/append/create)
- [x] 2.2.6 Implement `fs_delete` - NSFileManager removeItemAtPath
- [x] 2.2.7 Implement `fs_move` - NSFileManager moveItemAtPath
- [x] 2.2.8 Implement `fs_search` - Glob pattern matching (NSPredicate or fnmatch)
- [x] 2.2.9 Implement `fs_grep` - Regex search within files (ripgrep/grep wrapper)
- [x] 2.2.10 Implement `fs_patch` - Find/replace operations in files
- [x] 2.2.11 Register `/fs/*` routes in MCPServer.m

### 2.3 Implement Shell Tools in MCPEyes.app (Native)

**Files**: `macos/MCPEyes/ShellTools.m` (new), `macos/MCPEyes/ShellTools.h` (new)

Implement all shell operations in native Objective-C/C++.

**Tasks:**
- [x] 2.3.1 Create ShellTools class with HTTP endpoint handlers
- [x] 2.3.2 Implement `shell_exec` - NSTask for command execution with timeout
- [x] 2.3.3 Implement `shell_start_session` - Persistent NSTask with pipes
- [x] 2.3.4 Implement `shell_send_input` - Write to running session's stdin
- [x] 2.3.5 Implement `shell_stop_session` - Terminate/signal running process
- [x] 2.3.6 Implement session management (track running sessions by ID)
- [x] 2.3.7 Implement output streaming via delegate protocol
- [x] 2.3.8 Register `/shell/*` routes in MCPServer.m

### 2.4 Update MCPEyes.app Core

**Files**: `macos/MCPEyes/AppDelegate.m`, `macos/MCPEyes/MCPServer.m`

**Tasks:**
- [x] 2.4.1 Import and initialize FilesystemTools
- [x] 2.4.2 Import and initialize ShellTools
- [ ] 2.4.3 Add WebSocket client for Control Server connection (requires Phase 1)
- [ ] 2.4.4 Implement license phone-home on startup (requires Phase 1)
- [ ] 2.4.5 Implement periodic license re-check (every 24h) (requires Phase 1)
- [ ] 2.4.6 Handle license expiry gracefully (disable tools, show warning) (requires Phase 1)
- [ ] 2.4.7 Add Control Server URL configuration in Settings UI (requires Phase 1)
- [ ] 2.4.8 Add license key input in Settings UI (requires Phase 1)
- [ ] 2.4.9 Display connection status (connected/disconnected/trial/expired) (requires Phase 1)
- [ ] 2.4.10 Add auto-reconnect logic with exponential backoff (requires Phase 1)
- [x] 2.4.11 Keep browser-bridge-server.js spawn (for browser WebSocket only) ✓ Already present

### 2.5 MCP Proxy Refactor (stdio relay only)

**File**: `src/mcp-proxy-server.ts`

The proxy becomes a pure relay with NO embedded tools.

**Tasks:**
- [x] 2.5.1 Remove FilesystemTools import and instantiation
- [x] 2.5.2 Remove ShellTools import and instantiation
- [x] 2.5.3 Remove all local tool execution code
- [x] 2.5.4 Proxy ALL tool calls to MCPEyes.app HTTP server
- [ ] 2.5.5 Update tool list to fetch from agent (optional enhancement)
- [x] 2.5.6 Simplify to pure HTTP proxy

### 2.6 Move Legacy Code

**Tasks:**
- [x] 2.6.1 Move `src/mcp-sse-server.ts` to `old/src/`
- [x] 2.6.2 Move `src/basic-server.ts` to `old/src/`
- [x] 2.6.3 Move `src/advanced-server-simple.ts` to `old/src/`
- [x] 2.6.4 Move `src/claude-identity-server.ts` to `old/src/`
- [x] 2.6.5 Update package.json bin entries (renamed to screencontrol)
- [ ] 2.6.6 Update documentation references

---

## Phase 3: Windows Agent

Use macOS MCPEyes.app as functional template. **All tools in native C++ code** for security, consistency, and no runtime dependencies.

### Architecture: C++ Win32 Service + Tray App

**Why C++ Win32:**
- No runtime dependencies - truly standalone executables
- Smallest binary size (~2-5 MB total)
- Hardest to reverse engineer (pure native code)
- Consistent with macOS Objective-C approach
- Maximum control over all Windows APIs
- Service runs independently of user login

**Two-Component Design:**
1. **ScreenControlService.exe** - Windows Service (C++) - all tools, licensing, protection
2. **ScreenControlTray.exe** - Tray app (C# WinForms) - just UI, easy to update

**Why Hybrid C++ Service + C# Tray:**
- Service in C++: Protects licensing, fingerprinting, all business logic
- Tray in C#: Just displays status, no secrets to protect, fast development
- C# WinForms: Much easier than Win32 DialogBox, modern .NET 8
- Clean separation: UI can be updated without touching protected code

Same feature set as macOS:
- All tools implemented in native C++ (compiled to machine code)
- Only browser WebSocket bridge uses Node.js
- Protects licensing logic and intellectual property from reverse engineering

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                     WINDOWS AGENT ARCHITECTURE (C++ Win32)                   │
│                                                                              │
│  ScreenControlService.exe (Windows Service - C++)                           │
│  ├── Runs as SYSTEM or LocalService                                         │
│  ├── Starts automatically at boot (before user login)                       │
│  │                                                                           │
│  ├── HTTP Server :3456 (cpp-httplib)                                        │
│  │   ├── /screenshot           ← BitBlt / Desktop Duplication API          │
│  │   ├── /click, /doubleClick  ← SendInput API                             │
│  │   ├── /pressKey, /typeText  ← SendInput API                             │
│  │   ├── /getClickableElements ← UI Automation COM                         │
│  │   ├── /getUIElements        ← UI Automation COM                         │
│  │   ├── /getWindowList        ← EnumWindows                               │
│  │   ├── /focusWindow          ← SetForegroundWindow                       │
│  │   ├── /fs/*                 ← Win32 File APIs                           │
│  │   ├── /shell/*              ← CreateProcess                             │
│  │   ├── /browser/*            ← Proxy to :3457                            │
│  │   └── /status               ← Service status for tray app               │
│  │                                                                           │
│  ├── Control Server Client (WebSocket - libwebsockets or WinHTTP)           │
│  │   ├── Persistent connection to wss://control.knws.co.uk/ws              │
│  │   ├── Heartbeat (ACTIVE: 5s, PASSIVE: 30s, SLEEP: 5min)                 │
│  │   ├── Auto-reconnect with exponential backoff                            │
│  │   ├── License validation                                                 │
│  │   └── Command reception/response                                         │
│  │                                                                           │
│  ├── Local License Cache                                                     │
│  │   ├── %PROGRAMDATA%\ScreenControl\license.dat                            │
│  │   ├── 72-hour grace period for network issues                            │
│  │   └── Encrypted with machine fingerprint                                 │
│  │                                                                           │
│  ├── Named Pipe Server (for tray app communication)                         │
│  │   └── \\.\pipe\ScreenControl                                             │
│  │                                                                           │
│  └── Spawns: browser-bridge-server.js :3457                                 │
│              └── WebSocket bridge only (Chrome/Edge/Firefox)                │
│                                                                              │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ScreenControlTray.exe (User-mode Tray App - C# WinForms .NET 8)            │
│  ├── Runs in user session (auto-start via Registry)                         │
│  ├── Connects to service via Named Pipe or HTTP localhost:3456/status       │
│  │                                                                           │
│  ├── System Tray Icon (NotifyIcon)                                          │
│  │   ├── Status indicator (green/yellow/red icon)                           │
│  │   ├── Context menu (ContextMenuStrip)                                    │
│  │   │   ├── Status: Connected/Trial/Expired                                │
│  │   │   ├── Settings...                                                    │
│  │   │   ├── View Logs...                                                   │
│  │   │   ├── Restart Service                                                │
│  │   │   └── Quit                                                           │
│  │   └── Double-click → Open Settings                                       │
│  │                                                                           │
│  └── Settings Form (TabControl)                                              │
│      ├── General tab                                                         │
│      │   ├── Start at login checkbox                                        │
│      │   ├── Show notifications checkbox                                    │
│      │   └── Log level dropdown                                             │
│      ├── Connection tab                                                      │
│      │   ├── Control Server URL                                             │
│      │   ├── Customer ID (read-only)                                        │
│      │   ├── License UUID (read-only)                                       │
│      │   └── Connection status indicator                                    │
│      └── About tab                                                           │
│          ├── Version info                                                   │
│          ├── Machine fingerprint (partial)                                  │
│          └── License status                                                 │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Libraries Used (Header-Only or Static)

| Library | Purpose | Type |
|---------|---------|------|
| cpp-httplib | HTTP server | Header-only |
| nlohmann/json | JSON parsing | Header-only |
| libwebsockets | WebSocket client | Static lib |
| OpenSSL | TLS for WebSocket | Static lib |

### 3.1 Windows Service Core

**Directory**: `windows/ScreenControlService/`

**Project Structure:**
```
windows/
├── ScreenControl.sln                    # Visual Studio solution
│
├── ScreenControlService/                # Windows Service (C++)
│   ├── ScreenControlService.vcxproj
│   ├── main.cpp                         # Service entry point
│   ├── service.cpp                      # SCM integration
│   ├── service.h
│   │
│   ├── server/
│   │   ├── http_server.cpp              # cpp-httplib server :3456
│   │   ├── http_server.h
│   │   ├── request_router.cpp           # Route handling
│   │   ├── request_router.h
│   │   └── browser_proxy.cpp            # Proxy to :3457
│   │
│   ├── tools/
│   │   ├── gui_tools.cpp                # Screenshot, click, keys
│   │   ├── gui_tools.h
│   │   ├── ui_automation.cpp            # UI Automation COM
│   │   ├── ui_automation.h
│   │   ├── filesystem_tools.cpp         # fs_* operations
│   │   ├── filesystem_tools.h
│   │   ├── shell_tools.cpp              # shell_* operations
│   │   └── shell_tools.h
│   │
│   ├── control_server/
│   │   ├── websocket_client.cpp         # Control server connection
│   │   ├── websocket_client.h
│   │   ├── heartbeat.cpp                # Power state heartbeats
│   │   ├── heartbeat.h
│   │   ├── license_cache.cpp            # Local license storage
│   │   └── license_cache.h
│   │
│   ├── core/
│   │   ├── config.cpp                   # Configuration management
│   │   ├── config.h
│   │   ├── fingerprint.cpp              # Hardware fingerprinting
│   │   ├── fingerprint.h
│   │   ├── logger.cpp                   # Logging
│   │   ├── logger.h
│   │   ├── named_pipe.cpp               # IPC with tray app
│   │   └── named_pipe.h
│   │
│   └── libs/                            # Third-party (header-only)
│       ├── httplib.h                    # cpp-httplib
│       └── json.hpp                     # nlohmann/json
│
├── ScreenControlTray/                   # Tray App (C# WinForms .NET 8)
│   ├── ScreenControlTray.csproj         # .NET 8 WinForms project
│   ├── Program.cs                       # Entry point
│   ├── TrayApplicationContext.cs        # NotifyIcon management
│   ├── SettingsForm.cs                  # Settings window
│   ├── SettingsForm.Designer.cs
│   ├── ServiceClient.cs                 # HTTP client to service /status
│   └── Resources/
│       ├── icon.ico
│       ├── icon_green.ico
│       ├── icon_yellow.ico
│       └── icon_red.ico
│
├── ScreenControlInstaller/              # WiX installer
│   └── Product.wxs
│
└── browser-bridge/                      # Node.js (shared with macOS)
    └── browser-bridge-server.js
```

**Tasks:**
- [ ] 3.1.1 Create Visual Studio solution with Service and Tray projects
- [ ] 3.1.2 Implement Windows Service skeleton (RegisterServiceCtrlHandler, ServiceMain)
- [ ] 3.1.3 Implement service install/uninstall (sc.exe or programmatic)
- [ ] 3.1.4 Implement service start/stop/pause handlers
- [ ] 3.1.5 Implement Named Pipe server for IPC with tray app
- [ ] 3.1.6 Implement HTTP server using cpp-httplib (:3456)
- [ ] 3.1.7 Implement request routing with JSON (nlohmann/json)
- [ ] 3.1.8 Implement configuration persistence (%PROGRAMDATA%\ScreenControl\config.json)
- [ ] 3.1.9 Implement logging to %PROGRAMDATA%\ScreenControl\logs\
- [ ] 3.1.10 Handle service running as SYSTEM (session 0 isolation considerations)
- [ ] 3.1.11 Implement graceful shutdown with cleanup

### 3.2 Windows Tray App (C# WinForms)

**Directory**: `windows/ScreenControlTray/`

**Why C# WinForms for Tray App:**
- No secrets to protect (all licensing in C++ service)
- Much faster development than Win32 DialogBox
- Easy to update UI without touching protected code
- Modern .NET 8 with HttpClient, async/await
- WinForms NotifyIcon is simple and reliable

**Tasks:**
- [ ] 3.2.1 Create .NET 8 WinForms project (no console window)
- [ ] 3.2.2 Implement ApplicationContext for tray-only app (no main form)
- [ ] 3.2.3 Implement single-instance check (Mutex)
- [ ] 3.2.4 Implement NotifyIcon with icon and tooltip
- [ ] 3.2.5 Implement ContextMenuStrip (Status, Settings, Logs, Restart, Quit)
- [ ] 3.2.6 Implement tray icon status colors (swap Icon property)
- [ ] 3.2.7 Implement balloon notifications (NotifyIcon.ShowBalloonTip)
- [ ] 3.2.8 Implement SettingsForm with TabControl
- [ ] 3.2.9 Implement ServiceClient (HttpClient to localhost:3456/status)
- [ ] 3.2.10 Poll service status every 5 seconds (update icon/tooltip)
- [ ] 3.2.11 Implement auto-start on login (Registry via Microsoft.Win32)
- [ ] 3.2.12 Implement "Restart Service" (ServiceController class)
- [ ] 3.2.13 Handle FormClosing to minimize to tray instead of exit

### 3.3 Windows GUI Tools (Native C++)

**File**: `windows/ScreenControlService/tools/gui_tools.cpp`

**Tasks:**
- [ ] 3.3.1 Implement `screenshot` - BitBlt GDI capture with scaling
- [ ] 3.3.2 Implement `screenshot` - Desktop Duplication API (DXGI, faster)
- [ ] 3.3.3 Implement `click` - SendInput with MOUSEEVENTF_ABSOLUTE
- [ ] 3.3.4 Implement `doubleClick` - Double SendInput with delay
- [ ] 3.3.5 Implement `rightClick` - SendInput with MOUSEEVENTF_RIGHTDOWN/UP
- [ ] 3.3.6 Implement `pressKey` - SendInput with virtual key codes
- [ ] 3.3.7 Implement `typeText` - SendInput for each character (handle Unicode)
- [ ] 3.3.8 Implement `scroll` - SendInput with MOUSEEVENTF_WHEEL
- [ ] 3.3.9 Implement `drag` - SendInput sequence (down, moves, up)
- [ ] 3.3.10 Handle high-DPI (GetDpiForWindow, coordinate scaling)
- [ ] 3.3.11 Handle Session 0 isolation (use WTSQueryUserToken + CreateProcessAsUser for UI access)

### 3.4 Windows UI Automation Tools (Native C++)

**File**: `windows/ScreenControlService/tools/ui_automation.cpp`

**Tasks:**
- [ ] 3.4.1 Initialize UI Automation COM (CoCreateInstance IUIAutomation)
- [ ] 3.4.2 Implement `getClickableElements` - TreeWalker with IsInvokePatternAvailable
- [ ] 3.4.3 Implement `getUIElements` - Full tree dump with element properties
- [ ] 3.4.4 Implement `getWindowList` - EnumWindows with GetWindowText, GetClassName
- [ ] 3.4.5 Implement `focusWindow` - SetForegroundWindow with AllowSetForegroundWindow
- [ ] 3.4.6 Implement `minimizeWindow` - ShowWindow(SW_MINIMIZE)
- [ ] 3.4.7 Implement `maximizeWindow` - ShowWindow(SW_MAXIMIZE)
- [ ] 3.4.8 Implement `closeWindow` - PostMessage(WM_CLOSE)
- [ ] 3.4.9 Implement `getActiveWindow` - GetForegroundWindow info
- [ ] 3.4.10 Handle UWP apps (Windows.UI.Xaml automation)

### 3.5 Windows Filesystem Tools (Native C++)

**File**: `windows/ScreenControlService/tools/filesystem_tools.cpp`

**Tasks:**
- [ ] 3.5.1 Implement `fs_list` - FindFirstFile/FindNextFile
- [ ] 3.5.2 Implement `fs_read` - CreateFile + ReadFile with size limits
- [ ] 3.5.3 Implement `fs_read_range` - SetFilePointer for offset reading
- [ ] 3.5.4 Implement `fs_write` - CreateFile + WriteFile (CREATE_ALWAYS, OPEN_ALWAYS, etc.)
- [ ] 3.5.5 Implement `fs_delete` - DeleteFile / RemoveDirectory
- [ ] 3.5.6 Implement `fs_move` - MoveFileEx
- [ ] 3.5.7 Implement `fs_search` - Recursive FindFirstFile with glob matching
- [ ] 3.5.8 Implement `fs_grep` - Line-by-line regex search (std::regex)
- [ ] 3.5.9 Implement `fs_patch` - Regex replace operations
- [ ] 3.5.10 Handle long paths (\\?\C:\..., MAX_PATH bypass)
- [ ] 3.5.11 Handle file locking (retry with Sleep)

### 3.6 Windows Shell Tools (Native C++)

**File**: `windows/ScreenControlService/tools/shell_tools.cpp`

**Tasks:**
- [ ] 3.6.1 Implement `shell_exec` - CreateProcess with timeout
- [ ] 3.6.2 Implement stdout/stderr capture (CreatePipe, STARTUPINFO redirection)
- [ ] 3.6.3 Implement `shell_start_session` - Persistent process with pipes
- [ ] 3.6.4 Implement `shell_send_input` - WriteFile to stdin pipe
- [ ] 3.6.5 Implement `shell_stop_session` - TerminateProcess (after trying WM_CLOSE)
- [ ] 3.6.6 Implement session management (std::map<sessionId, PROCESS_INFORMATION>)
- [ ] 3.6.7 Use PowerShell as default (powershell.exe -NoLogo -NoProfile -NonInteractive)
- [ ] 3.6.8 CMD.exe fallback (cmd.exe /C for single commands)
- [ ] 3.6.9 Handle working directory (lpCurrentDirectory in CreateProcess)
- [ ] 3.6.10 Handle environment variables (CreateEnvironmentBlock)

### 3.7 Windows Control Server Integration

**Files**: `windows/ScreenControlService/control_server/*.cpp`

**Tasks:**
- [ ] 3.7.1 Implement WebSocket client (libwebsockets or WinHTTP WebSocket)
- [ ] 3.7.2 Implement TLS support (OpenSSL or Schannel)
- [ ] 3.7.3 Implement REGISTER message on connect (same protocol as macOS)
- [ ] 3.7.4 Implement heartbeat at server-specified interval
- [ ] 3.7.5 Implement power state management (ACTIVE/PASSIVE/SLEEP)
- [ ] 3.7.6 Implement auto-reconnect with exponential backoff (1s → 60s max)
- [ ] 3.7.7 Implement local license cache (%PROGRAMDATA%\ScreenControl\license.dat)
- [ ] 3.7.8 Implement 72-hour grace period for network issues
- [ ] 3.7.9 Implement license expiry handling (disable non-essential tools)
- [ ] 3.7.10 Implement command reception and execution
- [ ] 3.7.11 Never hard-kill mid-task (complete current, then enforce license)

### 3.8 Windows Machine Fingerprinting

**File**: `windows/ScreenControlService/core/fingerprint.cpp`

**Tasks:**
- [ ] 3.8.1 Get CPU ID - WMI Win32_Processor (CoInitialize, IWbemLocator)
- [ ] 3.8.2 Get motherboard UUID - WMI Win32_BaseBoard
- [ ] 3.8.3 Get disk serial - WMI Win32_DiskDrive
- [ ] 3.8.4 Get MAC addresses - GetAdaptersAddresses
- [ ] 3.8.5 Get machine name - GetComputerNameEx
- [ ] 3.8.6 Get Windows SID - GetTokenInformation
- [ ] 3.8.7 Generate fingerprint hash (SHA256 via BCrypt or OpenSSL)
- [ ] 3.8.8 Detect VM/container (WMI Win32_ComputerSystem Manufacturer)
- [ ] 3.8.9 Cache fingerprint in memory (avoid repeated WMI queries)

### 3.9 Windows Browser Bridge

**Directory**: `windows/browser-bridge/`

**Tasks:**
- [ ] 3.9.1 Bundle browser-bridge-server.js (shared code with macOS)
- [ ] 3.9.2 Bundle Node.js portable (~15MB, or use pkg to single .exe)
- [ ] 3.9.3 Service spawns Node.js process on startup (CreateProcess)
- [ ] 3.9.4 Monitor Node.js and restart if crashed (WaitForSingleObject)
- [ ] 3.9.5 Proxy `/browser/*` requests to localhost:3457
- [ ] 3.9.6 Browser extension works with Chrome, Edge, Firefox

### 3.10 Windows Installer

**Directory**: `windows/ScreenControlInstaller/`

**Tasks:**
- [ ] 3.10.1 Create WiX installer project (or NSIS)
- [ ] 3.10.2 Install ScreenControlService.exe (C++) to %PROGRAMFILES%\ScreenControl\
- [ ] 3.10.3 Install ScreenControlTray.exe (C# self-contained) to %PROGRAMFILES%\ScreenControl\
- [ ] 3.10.4 Build tray app as self-contained single-file (no .NET runtime needed)
- [ ] 3.10.5 Include Node.js portable runtime
- [ ] 3.10.6 Include browser-bridge-server.js
- [ ] 3.10.7 Register Windows Service (sc create or ServiceInstall)
- [ ] 3.10.8 Create Start Menu shortcuts
- [ ] 3.10.9 Configure tray app auto-start (Registry HKLM or HKCU)
- [ ] 3.10.10 Add firewall exception (netsh or WiX FirewallExtension)
- [ ] 3.10.11 Implement customer ID stamping (patch config or binary resource)
- [ ] 3.10.12 Code signing with EV certificate (avoid SmartScreen warnings)
- [ ] 3.10.13 Create silent install option (/quiet or /S)
- [ ] 3.10.14 Create uninstaller with full cleanup

### 3.11 Windows Testing

**Tasks:**
- [ ] 3.11.1 Test on Windows 10 (21H2+)
- [ ] 3.11.2 Test on Windows 11
- [ ] 3.11.3 Test service starts before user login
- [ ] 3.11.4 Test tray app connects to service correctly
- [ ] 3.11.5 Test high-DPI displays (150%, 200%, 300%)
- [ ] 3.11.6 Test multi-monitor setups
- [ ] 3.11.7 Test with UAC enabled (standard user tray, service as SYSTEM)
- [ ] 3.11.8 Test screenshot with DRM content (Desktop Duplication should work)
- [ ] 3.11.9 Test UI Automation with UWP/WinUI apps
- [ ] 3.11.10 Test Control Server connection through corporate proxy
- [ ] 3.11.11 Test 72-hour license grace period
- [ ] 3.11.12 Performance: screenshot speed, memory usage, CPU idle

---

## Phase 4: Linux Agent

Linux agent supports both GUI mode and headless CLI/service mode. **All tools in native code** (C/C++ with GTK for GUI mode).

### Architecture: Native Linux Application (C/C++)

Same principles as macOS and Windows:
- All tools implemented in native code (compiled to machine code)
- Only browser WebSocket bridge uses Node.js
- Protects licensing logic and intellectual property from reverse engineering

```
screencontrol (Native C/C++)
├── HTTP Server :3456
│   ├── GUI Tools (X11/Wayland screenshot, input simulation)
│   ├── Filesystem Tools (native POSIX implementation)
│   ├── Shell Tools (native fork/exec)
│   └── /browser/* → proxy to :3457
│
└── Spawns: browser-bridge-server.js :3457 (GUI mode only)
            └── WebSocket bridge only
```

### 4.1 Linux Agent Core

**Directory**: `linux/screencontrol/`

**Tasks:**
- [ ] 4.1.1 Create Linux application (C/C++ with GTK for GUI - NOT Electron)
- [ ] 4.1.2 Implement dual-mode: GUI and headless service (compile-time or runtime flag)
- [ ] 4.1.3 Implement HTTP server (port 3456)
- [ ] 4.1.4 Implement X11 screenshot capture (XGetImage)
- [ ] 4.1.5 Implement Wayland screenshot capture (xdg-desktop-portal)
- [ ] 4.1.6 Implement X11 input simulation (XTest extension)
- [ ] 4.1.7 Implement window enumeration (X11 + _NET_CLIENT_LIST)

### 4.2 Linux Filesystem Tools (Native)

**Tasks:**
- [ ] 4.2.1 Implement `fs_list` - POSIX opendir/readdir
- [ ] 4.2.2 Implement `fs_read` - POSIX read() with size limits
- [ ] 4.2.3 Implement `fs_read_range` - Line-based partial reading
- [ ] 4.2.4 Implement `fs_write` - POSIX write() with modes
- [ ] 4.2.5 Implement `fs_delete` - POSIX unlink/rmdir
- [ ] 4.2.6 Implement `fs_move` - POSIX rename()
- [ ] 4.2.7 Implement `fs_search` - Glob pattern matching (glob.h)
- [ ] 4.2.8 Implement `fs_grep` - Regex search (POSIX regex or PCRE)
- [ ] 4.2.9 Implement `fs_patch` - Find/replace operations

### 4.3 Linux Shell Tools (Native)

**Tasks:**
- [ ] 4.3.1 Implement `shell_exec` - fork/exec with timeout (alarm/SIGALRM)
- [ ] 4.3.2 Implement `shell_start_session` - Persistent process with PTY (forkpty)
- [ ] 4.3.3 Implement `shell_send_input` - write() to PTY master
- [ ] 4.3.4 Implement `shell_stop_session` - kill() with signal
- [ ] 4.3.5 Bash/sh as default shell

### 4.4 Linux Control Server Integration

**Tasks:**
- [ ] 4.4.1 WebSocket client for Control Server connection (libwebsockets or similar)
- [ ] 4.4.2 License phone-home on startup
- [ ] 4.4.3 Periodic license re-check
- [ ] 4.4.4 Configuration file for Control Server URL and license key
- [ ] 4.4.5 Settings GUI (GTK) for GUI mode

### 4.5 Linux GUI Mode

**Tasks:**
- [ ] 4.5.1 System tray icon (AppIndicator/libayatana-appindicator)
- [ ] 4.5.2 Settings window (GTK)
- [ ] 4.5.3 Spawn browser-bridge-server.js
- [ ] 4.5.4 Browser extension integration (Chrome/Firefox)
- [ ] 4.5.5 Desktop notifications (libnotify)

### 4.6 Linux CLI/Service Mode (Headless Worker)

For servers without GUI. **Single statically-linked binary** - no Node.js, no runtime dependencies.

```
screencontrol-worker (Single Binary ~5-10MB)
├── HTTP Server :3456
├── Filesystem Tools (POSIX - built-in)
├── Shell Tools (fork/exec - built-in)
└── WebSocket Client → Control Server

That's it. No Node.js. No npm. No external dependencies.
Deploy: scp + chmod +x + run
```

**Tasks:**
- [ ] 4.6.1 Create separate build target for headless (no GTK, no X11, no browser bridge)
- [ ] 4.6.2 Static linking with musl libc for maximum portability
- [ ] 4.6.3 Single binary contains: HTTP server, fs tools, shell tools, WS client
- [ ] 4.6.4 CLI arguments: `--license-key`, `--control-server`, `--port`
- [ ] 4.6.5 Config file support: `/etc/screencontrol/config.yaml`
- [ ] 4.6.6 Systemd service file (`screencontrol-worker.service`)
- [ ] 4.6.7 Status endpoint: `GET /status` returns agent info
- [ ] 4.6.8 Health check endpoint: `GET /health` for load balancers
- [ ] 4.6.9 Graceful shutdown on SIGTERM
- [ ] 4.6.10 Automatic reconnect to Control Server on disconnect

### 4.7 Linux Packaging

**Tasks:**
- [ ] 4.7.1 **Headless binary**: Single static binary (primary distribution for servers)
- [ ] 4.7.2 Create .deb package (Debian/Ubuntu) - includes systemd service
- [ ] 4.7.3 Create .rpm package (RHEL/Fedora) - includes systemd service
- [ ] 4.7.4 Create GUI .deb/.rpm (separate package, includes Node.js for browser bridge)
- [ ] 4.7.5 Create AppImage (GUI mode only)
- [ ] 4.7.6 Docker image: `FROM scratch` with just the binary
- [ ] 4.7.7 Docker Compose example for quick deployment
- [ ] 4.7.8 Kubernetes manifest example

---

## Phase 5: Build & Patch System (Installer Distribution)

The build system creates customer-stamped installers that can be distributed to end-users.

### Distribution Model

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        INSTALLER DISTRIBUTION FLOW                           │
│                                                                              │
│  BUILD SERVER (our infrastructure)                                           │
│  ├── Golden Installers (unsigned, no customer ID)                            │
│  │   ├── MCPEyes-macOS.pkg.golden                                            │
│  │   ├── ScreenControl-Windows.msi.golden                                    │
│  │   └── screencontrol-linux-x86_64.golden                                   │
│  │                                                                           │
│  └── Patch Service                                                           │
│      └── On download request:                                                │
│          1. Read golden installer                                            │
│          2. Inject: Customer ID, License Tier, Anti-piracy markers           │
│          3. Code sign (Apple/Microsoft/GPG)                                  │
│          4. Serve to customer                                                │
│                                                                              │
│  OUR CUSTOMER (SaaS subscriber)                                              │
│  └── Downloads stamped installer from portal                                 │
│  └── Distributes to their customers (no secrets in installer)               │
│                                                                              │
│  THEIR END USERS (enterprises, IT departments)                               │
│  └── Install on 1-1000+ machines                                             │
│  └── Agent connects: "I belong to Customer ID X"                             │
│  └── Agent is PENDING until our customer activates it                        │
│                                                                              │
│  CONTROL SERVER                                                              │
│  └── Tracks all connected agents by Customer ID                              │
│  └── Reports: machine name, IP, user, OS, screen lock, etc.                  │
│  └── Our customer activates/deactivates via portal                           │
│  └── Billing: per activated agent                                            │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 5.1 Golden Installer Build Pipeline

**Files**: `build/` directory

Create unsigned "golden" installers with placeholder space for customer data.

**Patch Data Structure** (embedded in every installer):
```c
// 256 bytes reserved, marked with magic bytes
#define PATCH_MAGIC_START  "<<SCREENCONTROL_PATCH_START>>"
#define PATCH_MAGIC_END    "<<SCREENCONTROL_PATCH_END>>"

struct PatchData {
    char magic_start[32];           // Magic marker for find/replace
    char customer_id[36];           // UUID: "550e8400-e29b-41d4-a716-446655440000"
    char license_tier[16];          // "trial", "standard", "enterprise"
    char control_server_url[128];   // "wss://control.knws.co.uk/ws"
    uint32_t checksum;              // HMAC-SHA256 truncated (anti-tamper)
    char reserved[40];              // Future use
    char magic_end[32];             // End marker
};
// Total: 256 bytes, easily patchable with binary search/replace
```

**Build & Distribution Pipeline:**
```
Source Code
    ↓
CI/CD: Compile with placeholder PatchData
    ↓
Golden Installers (unsigned) → /build/golden/
    ↓
Patch System: For each customer, stamp installers
    ↓
Customer File Area: /customers/{customer_id}/installers/
    ├── ScreenControl-macOS.pkg      (stamped, signed)
    ├── ScreenControl-Windows.msi    (stamped, signed)
    ├── screencontrol-linux-gui      (stamped, signed)
    └── screencontrol-linux-headless (stamped, signed)
    ↓
Customer downloads from portal (already stamped, instant download)
```

**Pre-stamping vs On-demand:**
- Installers are stamped when customer account is created or on new release
- Customer's portal shows their pre-stamped installers (no wait time)
- Re-stamp triggered on: new release, customer requests regeneration, or security rotation

**Tasks:**
- [ ] 5.1.1 Define PatchData struct in native code (256 bytes, magic markers)
- [ ] 5.1.2 Compile golden builds with placeholder PatchData
- [ ] 5.1.3 macOS: Golden .app bundle with patchable binary inside
- [ ] 5.1.4 Windows: Golden .exe with patchable PE section
- [ ] 5.1.5 Linux: Golden ELF binary with patchable section
- [ ] 5.1.6 CI/CD pipeline: Build golden installers on each release tag
- [ ] 5.1.7 Upload golden installers to secure blob storage (versioned)
- [ ] 5.1.8 Create manifest.json listing available versions per platform

### 5.2 Installer Patch Service

**Files**: `control_server/src/patch-service.ts` or separate microservice

Patches golden installers with customer-specific data on download.

**Patch Algorithm:**
```
1. Fetch golden installer from blob storage
2. Find PATCH_MAGIC_START marker in binary (simple byte search)
3. Replace 256-byte PatchData block with customer data:
   - customer_id = user's unique ID from database
   - license_tier = user's subscription tier
   - control_server_url = production URL
   - checksum = HMAC-SHA256(customer_id + secret_key)
4. Verify PATCH_MAGIC_END is intact (sanity check)
5. Code sign the patched binary
6. Stream to customer as download
```

**API Endpoint:**
```
GET /api/installers/download?platform=macos&variant=gui
Authorization: Bearer <session_token>

Response: Binary stream (application/octet-stream)
Content-Disposition: attachment; filename="ScreenControl-macOS.pkg"
```

**Tasks:**
- [ ] 5.2.1 Create patch service module with binary search/replace
- [ ] 5.2.2 API endpoint: `GET /api/installers/download`
- [ ] 5.2.3 Fetch golden installer from blob storage (with caching)
- [ ] 5.2.4 Find and replace PatchData block:
  - [ ] 5.2.4a Locate PATCH_MAGIC_START in binary
  - [ ] 5.2.4b Write customer_id (36 bytes UUID)
  - [ ] 5.2.4c Write license_tier (16 bytes)
  - [ ] 5.2.4d Write control_server_url (128 bytes)
  - [ ] 5.2.4e Calculate and write HMAC checksum (4 bytes)
  - [ ] 5.2.4f Verify PATCH_MAGIC_END intact
- [ ] 5.2.5 Platform-specific handling:
  - [ ] 5.2.5a macOS: Patch binary inside .app, then create .pkg
  - [ ] 5.2.5b Windows: Patch .exe, then create .msi wrapper
  - [ ] 5.2.5c Linux: Patch ELF directly (no wrapper needed)
- [ ] 5.2.6 Rate limiting: Max 10 downloads per hour per user
- [ ] 5.2.7 Log every download to InstallerDownload table
- [ ] 5.2.8 Error handling: Return clear errors for missing/corrupt golden files

### 5.3 Code Signing Automation

**Tasks:**
- [ ] 5.3.1 macOS: Integrate with Apple Developer signing (codesign + notarization)
- [ ] 5.3.2 Windows: Integrate with Authenticode signing (signtool)
- [ ] 5.3.3 Linux: GPG signing for .deb/.rpm packages
- [ ] 5.3.4 Secure key storage (HSM or cloud KMS)
- [ ] 5.3.5 Signing happens AFTER patching (so signature covers customer data)

### 5.4 Agent Customer ID Reading

**Tasks:**
- [ ] 5.4.1 macOS: Read embedded customer ID on startup (from Mach-O or plist)
- [ ] 5.4.2 Windows: Read customer ID from PE resources
- [ ] 5.4.3 Linux: Read customer ID from ELF section
- [ ] 5.4.4 Validate checksum (detect tampering)
- [ ] 5.4.5 Send customer ID with every Control Server connection
- [ ] 5.4.6 Refuse to run if checksum invalid (anti-piracy)

### 5.5 Machine Fingerprinting & License Enforcement

Prevent license abuse through hardware fingerprinting and duplicate detection.

**Fingerprint Components:**
```
┌─────────────────────────────────────────────────────────────────┐
│                    MACHINE FINGERPRINT                           │
│                                                                  │
│  Hardware (stable):                                              │
│  ├── CPU ID / Model                                              │
│  ├── Motherboard UUID (SMBIOS)                                   │
│  ├── Primary disk serial number                                  │
│  ├── Total RAM size                                              │
│  └── MAC address of primary NIC (optional, can change)          │
│                                                                  │
│  Software (semi-stable):                                         │
│  ├── OS installation ID (Windows: MachineGuid, macOS: IOKit)    │
│  ├── Machine hostname                                            │
│  └── OS version                                                  │
│                                                                  │
│  Issued by Control Server:                                       │
│  └── License UUID (for Docker/VM where hardware is identical)   │
│                                                                  │
│  Fingerprint = SHA256(hardware + software + license_uuid)       │
└─────────────────────────────────────────────────────────────────┘
```

**License Enforcement Flow:**
```
AGENT STARTUP (first time)
    ↓
Generate local fingerprint
    ↓
Connect to Control Server:
  "I'm customer X, fingerprint Y, no license UUID yet"
    ↓
Control Server: Agent is PENDING (awaiting activation)
    ↓
Customer activates in portal → Agent becomes ACTIVE
    ↓
Control Server issues license UUID
    ↓
Agent stores license UUID locally
    ↓
Fingerprint now includes license UUID (makes it unique)

─────────────────────────────────────────────────────────────────

AGENT STARTUP (subsequent)
    ↓
Read stored license UUID
    ↓
Generate fingerprint (hardware + software + license UUID)
    ↓
Connect to Control Server: "I'm customer X, fingerprint Y"
    ↓
Control Server compares to stored fingerprint
    ↓
┌─────────────────┬────────────────────────────────────────────┐
│ Match?          │ Action                                     │
├─────────────────┼────────────────────────────────────────────┤
│ Exact match     │ Allow, update lastSeenAt                   │
│ Minor change    │ Allow, log change (IP, username)           │
│ Major change    │ Deactivate → PENDING, notify customer      │
│ Duplicate UUID  │ Deactivate NEW one, keep original active   │
└─────────────────┴────────────────────────────────────────────┘
```

**VM/Docker Duplicate Detection:**
```
Scenario: Customer clones a VM or duplicates Docker container

Original Agent:  Fingerprint ABC, License UUID 123
Cloned Agent:    Fingerprint ABC, License UUID 123 (same!)
                            ↓
Control Server sees duplicate connection
                            ↓
Original stays ACTIVE (first connected)
Clone is DEACTIVATED (new connection rejected)
                            ↓
Clone appears in portal as "Duplicate Detected"
Customer can activate it → New License UUID issued
                            ↓
Now: Original = UUID 123, Clone = UUID 456 (unique)
```

**Tasks:**
- [ ] 5.5.1 Define fingerprint generation algorithm per platform:
  - [ ] 5.5.1a macOS: IOKit for hardware IDs, ioreg for serial numbers
  - [ ] 5.5.1b Windows: WMI queries for CPU, disk, motherboard
  - [ ] 5.5.1c Linux: /sys/class/dmi, /proc/cpuinfo, lsblk
- [ ] 5.5.2 Agent: Generate fingerprint on startup
- [ ] 5.5.3 Agent: Store license UUID locally (secure storage)
  - [ ] 5.5.3a macOS: Keychain
  - [ ] 5.5.3b Windows: DPAPI / Credential Manager
  - [ ] 5.5.3c Linux: /etc/screencontrol/license or XDG config
- [ ] 5.5.4 Agent: Include fingerprint in every Control Server connection
- [ ] 5.5.5 Control Server: Store fingerprint on first ACTIVE connection
- [ ] 5.5.6 Control Server: Compare fingerprint on each connection
- [ ] 5.5.7 Control Server: Issue license UUID on activation
- [ ] 5.5.8 Control Server: Detect duplicate UUIDs, deactivate new connections
- [ ] 5.5.9 Control Server: Log fingerprint changes (for audit)
- [ ] 5.5.10 Web Portal: Show "Duplicate Detected" status
- [ ] 5.5.11 Web Portal: Allow customer to activate duplicates as new machines

### 5.6 Browser Extensions (Store Distribution)

Browser extensions are distributed via official stores (not stamped).

**Tasks:**
- [ ] 5.6.1 Chrome Web Store: Publish and maintain listing
- [ ] 5.6.2 Firefox Add-ons: Publish and maintain listing
- [ ] 5.6.3 Microsoft Edge Add-ons: Publish and maintain listing
- [ ] 5.6.4 Safari: Bundle with macOS installer (signed with app)
- [ ] 5.6.5 Extension connects to local agent (localhost:3457) - no customer ID needed

---

## Phase 6: Web Platform (Customer Portal)

Extend the existing Next.js web platform for customer self-service.

### 6.1 Installer Download Portal

**Tasks:**
- [ ] 6.1.1 Create installer download page (requires login)
- [ ] 6.1.2 Show available platforms (macOS, Windows, Linux GUI, Linux Headless)
- [ ] 6.1.3 One-click download triggers patch service
- [ ] 6.1.4 Show download history
- [ ] 6.1.5 Regenerate installer (new anti-piracy checksum)
- [ ] 6.1.6 Custom installer notes/labels for organization

### 6.2 Agent Fleet Dashboard

The main view for customers to manage their deployed agents.

**Tasks:**
- [ ] 6.2.1 Real-time agent list with status (online/offline/pending/blocked)
- [ ] 6.2.2 Agent details panel:
  - Machine name, IP address, local username
  - OS type and version
  - Screen lock status
  - Last seen timestamp
  - Uptime
  - Installed version
- [ ] 6.2.3 Agent states:
  - **PENDING**: Connected but not activated (free, limited)
  - **ACTIVE**: Activated, billable, full functionality
  - **BLOCKED**: Explicitly blocked by customer
  - **EXPIRED**: License expired, needs renewal
- [ ] 6.2.4 Bulk actions: Activate, Deactivate, Block selected agents
- [ ] 6.2.5 Search and filter (by name, IP, OS, status)
- [ ] 6.2.6 Agent grouping/tagging (e.g., "Production", "Staging", "Client A")
- [ ] 6.2.7 Export agent list (CSV, JSON)

### 6.3 Agent Activation & Billing

**Tasks:**
- [ ] 6.3.1 Activate agent button (moves PENDING → ACTIVE)
- [ ] 6.3.2 Deactivate agent (moves ACTIVE → PENDING, stops billing)
- [ ] 6.3.3 Block agent (prevents connection entirely)
- [ ] 6.3.4 Usage dashboard: Active agents count, billing period
- [ ] 6.3.5 Billing integration (Stripe): Per-agent pricing
- [ ] 6.3.6 License tier limits (e.g., max 10 agents on Starter plan)
- [ ] 6.3.7 Overage handling (notify, auto-upgrade, or block new)

### 6.4 AI Connection Management

**Tasks:**
- [ ] 6.4.1 Create AI connections list page
- [ ] 6.4.2 AI connection setup wizard
- [ ] 6.4.3 Claude.ai OAuth configuration
- [ ] 6.4.4 Local LLM API key configuration
- [ ] 6.4.5 Test connection functionality
- [ ] 6.4.6 Connection status display

### 6.5 Permissions & Access Control

**Tasks:**
- [ ] 6.5.1 Define which AI connections can access which agents
- [ ] 6.5.2 Tool-level permissions (e.g., allow fs_read but not fs_write)
- [ ] 6.5.3 Time-based access windows
- [ ] 6.5.4 IP whitelist/blacklist for AI connections
- [ ] 6.5.5 Audit log of all commands executed

---

## Phase 7: Key Network Services Ltd Dry Run

Internal testing before customer rollout.

### 7.1 Infrastructure Setup

**Tasks:**
- [ ] 7.1.1 Deploy control server to internal infrastructure
- [ ] 7.1.2 Configure internal DNS: control.knws.co.uk → internal IP
- [ ] 7.1.3 Set up PostgreSQL database
- [ ] 7.1.4 Configure TLS certificates
- [ ] 7.1.5 Set up monitoring (uptime, logs)

### 7.2 Internal Agent Deployment

**Tasks:**
- [ ] 7.2.1 Install macOS agent on test machines
- [ ] 7.2.2 Install Windows agent on test machines
- [ ] 7.2.3 Install Linux agent on test servers
- [ ] 7.2.4 Verify all agents connect to control server
- [ ] 7.2.5 Verify agent states (PENDING → ACTIVE flow)

### 7.3 Internal AI Integration Testing

**Tasks:**
- [ ] 7.3.1 Connect Claude.ai to control server
- [ ] 7.3.2 Test tool execution on each agent type
- [ ] 7.3.3 Test local LLM (Ollama) via proxy
- [ ] 7.3.4 Test Open WebUI via SSE
- [ ] 7.3.5 Verify command logging

### 7.4 Documentation

**Tasks:**
- [ ] 7.4.1 Update README.md with new architecture
- [ ] 7.4.2 Create agent installation guides
- [ ] 7.4.3 Create control server admin guide
- [ ] 7.4.4 Create AI integration guides
- [ ] 7.4.5 Create troubleshooting guide

---

## Phase 8: Testing Infrastructure

Comprehensive testing for the new architecture. Review existing tests, remove obsolete ones, and create new tests for expanded platform.

### 8.1 Existing Test Audit

**Current Test Files** (`test/`):
| File | Purpose | Status |
|------|---------|--------|
| `run-all-tests.js` | Test runner | Review for new architecture |
| `test-filesystem-tools.js` | Filesystem tools | Keep - verify works with agent |
| `test-shell-tools.js` | Shell tools | Keep - verify works with agent |
| `test-tool-registry.js` | Tool registry | Keep - may need updates |
| `test-mcp-tools.js` | MCP protocol tests | Review - may be obsolete |
| `test-proxy-tools.js` | Proxy server tests | Update for relay-only proxy |

**Tasks:**
- [ ] 8.1.1 Audit all existing test files
- [ ] 8.1.2 Identify tests that reference legacy code (moved to `old/`)
- [ ] 8.1.3 Identify tests that need updates for new architecture
- [ ] 8.1.4 Document which tests are still valid

### 8.2 Legacy Test Cleanup

**Files to Review for Deletion:**
- Tests for `mcp-sse-server.ts` (moved to `old/`)
- Tests for `basic-server.ts` (moved to `old/`)
- Tests for `advanced-server-simple.ts` (moved to `old/`)
- Tests for `claude-identity-server.ts` (moved to `old/`)

**Tasks:**
- [ ] 8.2.1 Move obsolete tests to `old/test/` (don't delete, archive)
- [ ] 8.2.2 Update `run-all-tests.js` to exclude archived tests
- [ ] 8.2.3 Remove references to legacy servers from test configs
- [ ] 8.2.4 Clean up test fixtures that are no longer needed

### 8.3 Control Server Tests (NEW)

**Directory**: `web/src/__tests__/` or `web/tests/`

**Tasks:**
- [ ] 8.3.1 Create test framework setup (Jest/Vitest for Next.js)
- [ ] 8.3.2 **Transport Tests**:
  - [ ] Streamable HTTP endpoint (`/api/mcp`)
  - [ ] SSE transport (`/api/mcp/sse`)
  - [ ] WebSocket agent connections
- [ ] 8.3.3 **Agent Connection Tests**:
  - [ ] Agent registration and heartbeat
  - [ ] Agent state transitions (PENDING → ACTIVE → BLOCKED)
  - [ ] Fingerprint validation
  - [ ] Duplicate detection
- [ ] 8.3.4 **Licensing Tests**:
  - [ ] License validation on connect
  - [ ] Concurrent agent limits
  - [ ] Trial/expired/suspended handling
- [ ] 8.3.5 **Command Routing Tests**:
  - [ ] Master → Worker routing
  - [ ] Claude.ai → Worker routing
  - [ ] Command logging
- [ ] 8.3.6 **Database Integration Tests**:
  - [ ] Prisma schema validation
  - [ ] CRUD operations for agents
  - [ ] Audit log creation

### 8.4 Agent Tests (macOS)

**Directory**: `test/agent/`

**Tasks:**
- [ ] 8.4.1 **Agent Tools Server Tests**:
  - [ ] HTTP server startup
  - [ ] Filesystem tool endpoints
  - [ ] Shell tool endpoints
  - [ ] Browser bridge WebSocket
- [ ] 8.4.2 **Control Server Connection Tests**:
  - [ ] WebSocket connection establishment
  - [ ] Heartbeat mechanism
  - [ ] Reconnection logic
  - [ ] License validation response handling
- [ ] 8.4.3 **Bonjour Discovery Tests**:
  - [ ] Service advertisement
  - [ ] Service discovery
  - [ ] Direct LAN communication (port 3456)
- [ ] 8.4.4 **Tool Execution Tests**:
  - [ ] Filesystem tools via agent
  - [ ] Shell tools via agent
  - [ ] GUI tools (mock or integration)
  - [ ] Browser tools via extension

### 8.5 MCP Proxy Tests (Updated)

**Directory**: `test/proxy/`

The proxy is now relay-only - tests must verify it has NO embedded tools.

**Tasks:**
- [ ] 8.5.1 **Relay Behavior Tests**:
  - [ ] Verify proxy forwards ALL tool calls to agent
  - [ ] Verify proxy has NO local tool implementations
  - [ ] Verify `tools/list` fetches from agent
  - [ ] Verify `tools/call` forwards to agent
- [ ] 8.5.2 **Connection Tests**:
  - [ ] stdio transport works
  - [ ] Connects to control server
  - [ ] Handles disconnection gracefully
- [ ] 8.5.3 **Negative Tests**:
  - [ ] Verify NO filesystem tools in proxy code
  - [ ] Verify NO shell tools in proxy code
  - [ ] Grep proxy source for embedded tool logic

### 8.6 Browser Extension Tests (Keep Existing)

**Directory**: `extension/` (existing tests remain valid)

Browser extension architecture unchanged - tests should still pass.

**Tasks:**
- [ ] 8.6.1 Verify existing extension tests pass
- [ ] 8.6.2 Update tests if WebSocket URL changed
- [ ] 8.6.3 Add tests for Safari extension (if different)

### 8.7 Integration Tests

**Directory**: `test/integration/`

End-to-end tests for full platform.

**Tasks:**
- [ ] 8.7.1 **Full Flow: Claude.ai → Agent**:
  - [ ] Streamable HTTP request
  - [ ] Control server routing
  - [ ] Agent tool execution
  - [ ] Response back to Claude
- [ ] 8.7.2 **Full Flow: Master Agent → Worker Agent (WAN)**:
  - [ ] Master connects with AI
  - [ ] Master sends command via control server
  - [ ] Worker executes
  - [ ] Response returns to master
- [ ] 8.7.3 **Full Flow: Master Agent → Worker Agent (LAN)**:
  - [ ] Bonjour discovery
  - [ ] Direct port 3456 communication
  - [ ] Async status to control server
- [ ] 8.7.4 **Licensing Integration**:
  - [ ] Agent activation flow
  - [ ] Concurrent limit enforcement
  - [ ] Deactivation on fingerprint change

### 8.8 Performance Tests

**Directory**: `test/performance/`

**Tasks:**
- [ ] 8.8.1 Control server concurrent connections
- [ ] 8.8.2 Command latency (Claude.ai → Agent → Response)
- [ ] 8.8.3 Heartbeat overhead
- [ ] 8.8.4 Large file transfer via filesystem tools
- [ ] 8.8.5 Stress test: many agents connecting simultaneously

### 8.9 Test Infrastructure

**Tasks:**
- [ ] 8.9.1 Set up CI pipeline (GitHub Actions)
- [ ] 8.9.2 Configure test database (PostgreSQL for CI)
- [ ] 8.9.3 Create mock agent for control server tests
- [ ] 8.9.4 Create mock control server for agent tests
- [ ] 8.9.5 Add test coverage reporting
- [ ] 8.9.6 Set up test environment variables

### 8.10 Test Documentation

**Tasks:**
- [ ] 8.10.1 Document test structure in `test/README.md`
- [ ] 8.10.2 Document how to run tests locally
- [ ] 8.10.3 Document CI/CD test pipeline
- [ ] 8.10.4 Document test fixtures and mocks

---

## Priority Order

1. **Phase 0: Codebase Consolidation** (FIRST - merge ./web + ./control_server)
2. **Phase 1: Control Server** (CRITICAL - agent connections, licensing)
3. **Phase 2: macOS Agent** (native tools consolidation)
4. **Phase 8.1-8.2: Test Audit & Cleanup** (remove obsolete, identify updates needed)
5. **Phase 5: Build & Patch System** (installer distribution)
6. **Phase 8.3-8.5: Component Tests** (control server, agent, proxy tests)
7. **Phase 6: Web Platform** (customer portal)
8. **Phase 7: Dry Run** (validate architecture)
9. **Phase 8.7-8.8: Integration & Performance Tests** (full flow, stress testing)
10. **Phase 3: Windows Agent** (after macOS proven)
11. **Phase 4: Linux Agent** (after Windows proven)
12. **Phase 8.9-8.10: CI/CD & Test Docs** (automation, documentation)

---

## File Structure (Target)

```
screencontrol/
├── web/                          # Combined Portal + Control Server (Next.js)
│   ├── prisma/
│   │   └── schema.prisma         # All database models
│   ├── src/
│   │   ├── app/                  # Next.js App Router
│   │   │   ├── (portal)/         # Authenticated portal pages
│   │   │   │   ├── dashboard/
│   │   │   │   ├── agents/
│   │   │   │   ├── downloads/
│   │   │   │   └── settings/
│   │   │   ├── api/              # API routes
│   │   │   │   ├── auth/         # NextAuth
│   │   │   │   ├── agents/       # Agent CRUD
│   │   │   │   ├── installers/   # Patch service
│   │   │   │   └── mcp/          # Streamable HTTP + SSE
│   │   │   ├── login/
│   │   │   └── layout.tsx
│   │   ├── lib/
│   │   │   ├── prisma.ts         # Prisma client singleton
│   │   │   ├── auth.ts           # NextAuth config
│   │   │   ├── control-server/   # Control server logic
│   │   │   │   ├── agent-registry.ts
│   │   │   │   ├── command-router.ts
│   │   │   │   ├── broadcaster.ts
│   │   │   │   ├── websocket-handler.ts
│   │   │   │   ├── heartbeat.ts
│   │   │   │   └── license.ts
│   │   │   └── patch-service/    # Installer patching
│   │   │       └── patcher.ts
│   │   ├── components/           # React components
│   │   └── types/                # Shared TypeScript types
│   ├── server.ts                 # Custom server (WebSocket support)
│   ├── package.json
│   └── .env                      # Database URL, secrets
│
├── marketing/                    # Static marketing site (optional, could be separate repo)
│   └── ...                       # Hugo, Astro, or static HTML
│
├── src/                          # Agent-side code (spawned by native apps)
│   ├── browser-bridge-server.ts  # WebSocket bridge only
│   ├── mcp-proxy-server.ts       # stdio relay for Claude/Cursor
│   └── tool-registry.ts          # Tool configuration
│
├── macos/                    # macOS Agent (Native Objective-C)
│   └── MCPEyes/
│       ├── AppDelegate.m         # Main app + browser bridge spawn
│       ├── MCPServer.m           # HTTP server :3456
│       ├── FilesystemTools.m     # fs_* tools (native)
│       ├── FilesystemTools.h
│       ├── ShellTools.m          # shell_* tools (native)
│       ├── ShellTools.h
│       ├── GUITools.m            # screenshot, click, etc (native)
│       ├── GUITools.h
│       ├── ControlServerClient.m # WebSocket to Control Server
│       └── ControlServerClient.h
│
├── windows/                  # Windows Agent (Native C++/C#)
│   └── ScreenControl/
│       ├── Main.cpp              # Entry point + tray icon
│       ├── HttpServer.cpp        # HTTP server :3456
│       ├── FilesystemTools.cpp   # fs_* tools (Win32)
│       ├── ShellTools.cpp        # shell_* tools (CreateProcess)
│       ├── GUITools.cpp          # screenshot, click (Win32/SendInput)
│       └── ControlServerClient.cpp
│
├── linux/                    # Linux Agent (Native C/C++)
│   └── screencontrol/
│       ├── main.c                # Entry point
│       ├── http_server.c         # HTTP server :3456
│       ├── filesystem_tools.c    # fs_* tools (POSIX)
│       ├── shell_tools.c         # shell_* tools (fork/exec)
│       ├── gui_tools.c           # X11/Wayland (GUI build only)
│       ├── control_client.c      # WebSocket to Control Server
│       ├── Makefile              # Separate targets: gui, headless
│       └── BUILD.md
│
├── linux/bin/                # Pre-built Linux binaries
│   ├── screencontrol-worker-x86_64    # Headless, static binary (~5MB)
│   ├── screencontrol-worker-aarch64   # ARM64 headless
│   └── screencontrol-gui-x86_64       # GUI version (requires GTK)
│
├── extension/                # Browser extensions (shared across platforms)
│   ├── chrome/
│   ├── firefox/
│   └── safari/
│
├── old/                      # Legacy code (archived)
│   └── src/
│       ├── mcp-sse-server.ts
│       ├── basic-server.ts
│       └── advanced-server-simple.ts
│
└── docs/                     # Documentation
    ├── architecture.md
    ├── agent-setup.md
    └── control-server.md
```

---

## Notes

### Business Model: SaaS with Stamped Installers

```
OUR CUSTOMERS (SaaS subscribers)
└── Download stamped installer from portal
    └── Installer contains: Customer ID only (NO secrets)
    └── Distribute to their customers

THEIR END USERS (enterprises)
└── Install on 1-1000+ machines
└── Agent connects to Control Server: "I belong to Customer ID X"
└── Agent state: PENDING (free, limited until activated)

OUR CUSTOMER (back in portal)
└── Sees all connected agents in dashboard
└── Can: Activate (billable), Deactivate, Block, Group
└── Pays per activated agent
```

**Key Points:**
- One installer can be deployed to thousands of machines
- No sensitive info in installer (just customer ID for ownership)
- Agent reports: machine name, IP, user, OS, screen lock status
- Customer controls which agents are active via web portal
- Billing is per-active-agent

### License Enforcement (Anti-Piracy)

**Machine Fingerprinting:**
- Hardware: CPU ID, motherboard UUID, disk serial, RAM size
- Software: OS installation ID, hostname
- License UUID: Issued by Control Server on activation

**Fingerprint = SHA256(hardware + software + license_uuid)**

**Enforcement Rules:**
| Scenario | Action |
|----------|--------|
| First connection | PENDING state, awaiting activation |
| Activated | License UUID issued, fingerprint stored |
| Fingerprint match | Allow connection |
| Minor change (IP, username) | Allow, log change |
| Major change (hardware) | Deactivate → PENDING |
| Duplicate UUID detected | Deactivate NEW connection, keep original |
| VM/Docker clone | Appears as duplicate, customer can activate as new machine |

**Why this prevents abuse:**
- Can't copy installer to new machine without re-activation
- Can't clone VM without license UUID conflict
- Can't tamper with installer (HMAC checksum)
- Changes are logged for audit

### Networking
- **DNS**: Internal agents resolve `control.knws.co.uk` to internal IP via local DNS
- **External**: Customer agents resolve to public control server IP
- **All agents are "remote"**: Even internal agents connect via network to control server
- **Phone home**: All agents validate license on startup and periodically
- **Graceful degradation**: If control server unreachable, agent can work locally but logs warning

### Security & Architecture Principles

**Why Native Code for All Tools (Not Node.js/TypeScript):**

1. **macOS Permissions**: Screen Recording and Accessibility permissions are granted per-app by bundle ID. Spawned Node.js processes do NOT inherit the parent app's permissions. All permission-requiring tools MUST be in the native app.

2. **Reverse Engineering Protection**: Native Objective-C/C++/C# compiles to machine code, which is:
   - Significantly harder to decompile than JavaScript
   - Protects licensing logic from being bypassed
   - Protects intellectual property and trade secrets
   - Makes unauthorized modification extremely difficult

3. **Performance**: Native code executes faster than interpreted JavaScript for system-level operations like file I/O, process management, and GUI automation.

4. **Single Binary Distribution**: One compiled binary per platform simplifies deployment, updates, and reduces attack surface (no exposed source files).

**Node.js Usage (Limited):**
- Browser bridge WebSocket server ONLY (no special permissions needed)
- The browser bridge is intentionally simple - just a protocol relay
- Even if reverse-engineered, it contains no licensing or business logic
