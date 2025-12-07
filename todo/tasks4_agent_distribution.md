# Agent Management & Distribution System Tasks

> Enable agents to connect back to the web system, declare their status, advertise tools, and allow users to manage their agent fleet.

## Overview

This task file covers the complete agent lifecycle:
1. **Agent Connection** - WebSocket endpoint for agents to phone home
2. **Agent Fleet Dashboard** - UI for users to see/manage their agents
3. **Licensing & Activation** - Activate agents (PENDING → ACTIVE)
4. **Agent Downloads** - Tenant-tagged installer distribution

Currently implemented:
- Database schema (Agent, AgentState, PowerState, etc.)
- Control-server library (agent-registry, websocket-handler, db-service)
- API routes for agents (`/api/agents`, `/api/agents/[id]`)

Missing:
- WebSocket endpoint integration with Next.js
- Dashboard UI for agent fleet management
- Agent activation/licensing UI
- Installer download system

---

## Part A: WebSocket Integration

The control-server library exists but isn't connected to the Next.js app.

### A.1 WebSocket Server Integration

**Problem**: Next.js App Router doesn't natively support WebSocket. Need custom server.

**Files to check/create**:
- `web/server.ts` - Custom server with WebSocket support
- `web/package.json` - Script to run custom server

**Tasks:**
- [ ] A.1.1 Check if `web/server.ts` exists and has WebSocket support
- [ ] A.1.2 If not, create custom server that:
  - Runs Next.js
  - Adds WebSocket server on `/ws` path
  - Imports websocket-handler.ts
  - Creates agentRegistry singleton
- [ ] A.1.3 Update `package.json` start script to use custom server
- [ ] A.1.4 Test agent can connect via `wss://screencontrol.knws.co.uk/ws`

### A.2 Agent Registration Flow

When agent connects:
1. Agent sends `register` message with machineId, fingerprint, customerId
2. Server creates/updates Agent record in database
3. Server issues licenseUuid if new activation
4. Server sends `registered` response with license status

**Already implemented in**: `websocket-handler.ts`, `agent-registry.ts`

**Tasks:**
- [ ] A.2.1 Verify registration flow works end-to-end
- [ ] A.2.2 Test with macOS agent (MCPEyes.app)
- [ ] A.2.3 Ensure Agent record created in database on first connect

### A.3 Heartbeat & License Checking

Agent sends periodic heartbeat, server responds with:
- License status (active/pending/expired/blocked)
- Power state config (heartbeat interval)
- Pending commands flag

**Already implemented in**: `websocket-handler.ts`

**Tasks:**
- [ ] A.3.1 Verify heartbeat updates `lastSeenAt` in database
- [ ] A.3.2 Verify license status changes propagate to agent
- [ ] A.3.3 Test power state transitions (ACTIVE → PASSIVE → SLEEP)

---

## Part B: Agent Fleet Dashboard

Users need a UI to see and manage their connected agents.

### B.1 Agents List Page

**Create**: `web/src/app/dashboard/agents/page.tsx`

**Features:**
- [ ] B.1.1 Real-time list of user's agents
- [ ] B.1.2 Show for each agent:
  - Machine name / hostname
  - OS type (macOS/Windows/Linux) with icon
  - Status: Online/Offline badge
  - State: PENDING/ACTIVE/BLOCKED/EXPIRED badge
  - Power state: ACTIVE/PASSIVE/SLEEP indicator
  - Screen locked status
  - Last seen timestamp
  - IP address
- [ ] B.1.3 Filter by: Status (online/offline), State, OS type
- [ ] B.1.4 Search by machine name
- [ ] B.1.5 Empty state: "No agents connected yet" with link to downloads

### B.2 Agent Actions

- [ ] B.2.1 **Activate** button (PENDING → ACTIVE)
  - Only show for PENDING agents
  - API: `PATCH /api/agents/[id]` with `{ state: 'ACTIVE' }`
  - Updates `activatedAt` timestamp

- [ ] B.2.2 **Deactivate** button (ACTIVE → PENDING)
  - For when user wants to stop billing
  - Confirmation modal

- [ ] B.2.3 **Block** button (any → BLOCKED)
  - For suspicious/unauthorized agents
  - Confirmation modal
  - Agent will be disconnected and can't reconnect

- [ ] B.2.4 **Unblock** button (BLOCKED → PENDING)
  - Allows agent to reconnect

- [ ] B.2.5 **Wake** button (SLEEP → ACTIVE)
  - For sleeping agents
  - API: `POST /api/agents/[id]/wake`

### B.3 Agent Detail Page

**Create**: `web/src/app/dashboard/agents/[id]/page.tsx`

**Features:**
- [ ] B.3.1 Full agent information:
  - Machine name, hostname
  - OS type, version, architecture
  - Agent version
  - IP address (public and local)
  - First connected timestamp
  - Last seen timestamp
  - License UUID (if activated)

- [ ] B.3.2 Hardware fingerprint info:
  - CPU model
  - Disk serial
  - Motherboard UUID
  - Fingerprint hash

- [ ] B.3.3 Status section:
  - Current state with state change buttons
  - Power state
  - Screen lock status
  - Current task (if any)

- [ ] B.3.4 Activity log:
  - Recent commands executed
  - Connection history (sessions)
  - Fingerprint changes

- [ ] B.3.5 Edit agent label/notes

### B.4 Real-time Updates

- [ ] B.4.1 Add SSE endpoint for agent status updates: `GET /api/agents/events`
- [ ] B.4.2 Dashboard subscribes to SSE for real-time:
  - Agent online/offline changes
  - State changes
  - Power state changes
- [ ] B.4.3 Visual indicator when agent comes online/goes offline

### B.5 Agent Statistics

Dashboard should show:
- [ ] B.5.1 Total agents count
- [ ] B.5.2 Online vs offline count
- [ ] B.5.3 By state (Active, Pending, Blocked)
- [ ] B.5.4 By OS type

---

## Part C: Agent API Enhancements

### C.1 Current API Routes

Already exist:
- `GET /api/agents` - List user's agents
- `GET /api/agents/[id]` - Get agent details
- `PATCH /api/agents/[id]` - Update agent
- `DELETE /api/agents/[id]` - Delete agent

### C.2 New API Routes Needed

- [ ] C.2.1 `POST /api/agents/[id]/wake` - Wake a sleeping agent
- [ ] C.2.2 `POST /api/agents/[id]/activate` - Activate (PENDING → ACTIVE)
- [ ] C.2.3 `POST /api/agents/[id]/block` - Block agent
- [ ] C.2.4 `GET /api/agents/events` - SSE for real-time updates
- [ ] C.2.5 `GET /api/agents/[id]/logs` - Get agent command logs
- [ ] C.2.6 `GET /api/agents/stats` - Get aggregate statistics

### C.3 API Integration with Control Server

The API routes need to interact with the in-memory agentRegistry:
- [ ] C.3.1 Import `agentRegistry` singleton in API routes
- [ ] C.3.2 `/api/agents/[id]/wake` calls `agentRegistry.wakeAgent()`
- [ ] C.3.3 State changes need to update both DB and registry

---

## Part D: Agent Installer Distribution

Enable users to download tenant-tagged agent installers.

### D.1 Database Schema

- [ ] D.1.1 Verify `InstallerDownload` model exists (it does)
- [ ] D.1.2 Add relation from `McpConnection` to track which connection the agent uses

### D.2 Golden Build Storage

**Server path**: `/var/www/html/screencontrol/golden/`

- [ ] D.2.1 Create directory structure on production server
- [ ] D.2.2 Create `manifest.json` format:
  ```json
  {
    "latest": "1.0.0",
    "versions": {
      "1.0.0": {
        "macos": { "filename": "MCPEyes.app.tar.gz", "sha256": "..." },
        "windows": { "filename": "ScreenControl.exe", "sha256": "..." },
        "linux-gui": { "filename": "screencontrol-gui", "sha256": "..." },
        "linux-headless": { "filename": "screencontrol-headless", "sha256": "..." }
      }
    }
  }
  ```
- [ ] D.2.3 Upload initial golden builds

### D.3 Patch Service

**Create**: `web/src/lib/patch-service/`

PatchData structure (256 bytes):
```
PATCH_MAGIC_START (8 bytes): "SCPATCH\x00"
endpoint_uuid (40 bytes): MCP connection UUID
server_url (128 bytes): https://screencontrol.knws.co.uk
checksum (32 bytes): HMAC-SHA256
reserved (40 bytes): zeros
PATCH_MAGIC_END (8 bytes): "SCEND\x00\x00\x00"
```

- [ ] D.3.1 Create `patch-service/constants.ts` - Magic markers
- [ ] D.3.2 Create `patch-service/manifest.ts` - Load manifest
- [ ] D.3.3 Create `patch-service/patcher.ts` - Binary patching
- [ ] D.3.4 Create `patch-service/checksum.ts` - HMAC generation

### D.4 Download API

**Create**: `web/src/app/api/connections/[id]/download/route.ts`

```
GET /api/connections/[id]/download?platform=macos
Authorization: Bearer <session>

Response: Binary stream
Content-Type: application/octet-stream
Content-Disposition: attachment; filename="MCPEyes-macOS.app.tar.gz"
```

- [ ] D.4.1 Validate user owns connection
- [ ] D.4.2 Validate platform parameter
- [ ] D.4.3 Fetch golden build from storage
- [ ] D.4.4 Patch binary with connection's endpointUuid
- [ ] D.4.5 Log download to InstallerDownload table
- [ ] D.4.6 Stream patched binary to user
- [ ] D.4.7 Rate limit: 10 downloads/hour/user

### D.5 Download UI

Add to connection detail page or create dedicated page.

- [ ] D.5.1 Download section on connection detail page
- [ ] D.5.2 Platform icons (macOS, Windows, Linux)
- [ ] D.5.3 Download button for each platform
- [ ] D.5.4 Show download history
- [ ] D.5.5 Installation instructions per platform

### D.6 Agent-Side PatchData Reading

Agents need to read embedded configuration on startup.

- [ ] D.6.1 macOS: Add PatchData section to MCPEyes binary
- [ ] D.6.2 macOS: Read endpoint_uuid on startup
- [ ] D.6.3 macOS: Connect to correct MCP endpoint
- [ ] D.6.4 Windows: Same for ScreenControl.exe
- [ ] D.6.5 Linux: Same for ELF binary

---

## Part E: Navigation & Layout

### E.1 Dashboard Navigation

- [ ] E.1.1 Add "Agents" link to dashboard sidebar
- [ ] E.1.2 Add badge showing online agent count
- [ ] E.1.3 Add "Downloads" link or integrate into connections

### E.2 Home Dashboard Widgets

- [ ] E.2.1 Agent status summary widget
- [ ] E.2.2 Recent agent activity widget

---

## Environment Variables

Add to `.env`:

```bash
# Golden Builds
GOLDEN_BUILDS_PATH=/var/www/html/screencontrol/golden
PATCH_SECRET=your-hmac-secret-key

# WebSocket (if separate port needed)
WS_PORT=3001
```

---

## Priority Order

1. **Part A: WebSocket Integration** (enable agents to connect)
2. **Part B.1-B.2: Agents List Page** (see agents, activate them)
3. **Part C: API Enhancements** (wake, activate, block)
4. **Part B.3-B.5: Agent Detail & Real-time** (full management)
5. **Part D: Installer Distribution** (download tagged agents)

---

## Testing Checklist

- [ ] Agent connects via WebSocket and appears in database
- [ ] Agent shows in dashboard as PENDING
- [ ] User activates agent → becomes ACTIVE
- [ ] Agent heartbeat updates lastSeenAt
- [ ] Agent disconnect shows as offline
- [ ] Wake command reaches sleeping agent
- [ ] Block prevents agent from connecting
- [ ] Download returns patched installer
- [ ] Patched agent connects to correct MCP endpoint

---

## Part F: Testing (from tasks3 Phase 10)

### F.1 Unit Tests

- [ ] F.1.1 PKCE verification tests
- [ ] F.1.2 Token generation/validation tests
- [ ] F.1.3 Scope validation tests
- [ ] F.1.4 Rate limiting tests

### F.2 Integration Tests

- [ ] F.2.1 Full OAuth flow test
- [ ] F.2.2 Token refresh flow test
- [ ] F.2.3 MCP request with valid token
- [ ] F.2.4 MCP request with invalid/expired token
- [ ] F.2.5 Agent WebSocket connection test
- [ ] F.2.6 Agent registration and heartbeat test

### F.3 Manual Testing with MCP Inspector

- [ ] F.3.1 Test auth discovery
- [ ] F.3.2 Test DCR (Dynamic Client Registration)
- [ ] F.3.3 Test authorization flow
- [ ] F.3.4 Test MCP tools via authenticated connection

### F.4 Agent Testing

- [ ] F.4.1 Agent connects via WebSocket and appears in database
- [ ] F.4.2 Agent shows in dashboard as PENDING
- [ ] F.4.3 User activates agent → becomes ACTIVE
- [ ] F.4.4 Agent heartbeat updates lastSeenAt
- [ ] F.4.5 Agent disconnect shows as offline
- [ ] F.4.6 Wake command reaches sleeping agent
- [ ] F.4.7 Block prevents agent from connecting
- [ ] F.4.8 Download returns patched installer
- [ ] F.4.9 Patched agent connects to correct MCP endpoint

---

## Part G: Deployment (from tasks3 Phase 11)

### G.1 Deploy to Production

- [ ] G.1.1 Commit all changes to git
- [ ] G.1.2 Push to GitHub
- [ ] G.1.3 SSH to 192.168.10.10
- [ ] G.1.4 Pull changes: `cd /var/www/html/screencontrol && git pull`
- [ ] G.1.5 Run migration: `cd web && npx prisma migrate deploy`
- [ ] G.1.6 Rebuild: `npm run build`
- [ ] G.1.7 Restart service: `sudo systemctl restart screencontrol`

### G.2 Verify Deployment

- [ ] G.2.1 Test `/.well-known/oauth-authorization-server`
- [ ] G.2.2 Test `/.well-known/oauth-protected-resource/{uuid}`
- [ ] G.2.3 Test connection creation in dashboard
- [ ] G.2.4 Test OAuth flow with Claude.ai connector
- [ ] G.2.5 Test agent WebSocket connection
- [ ] G.2.6 Test agent appears in dashboard
- [ ] G.2.7 Test MCP tools via authenticated connection

---

## References

- [tasks2.md Phase 1: Control Server](/todo/tasks2.md)
- [tasks2.md Phase 6: Web Platform](/todo/tasks2.md)
- [tasks3_remote_mcp.md: MCP Connection Management](/todo/tasks3_remote_mcp.md)
- [web/src/lib/control-server/](/web/src/lib/control-server/) - Existing implementation
