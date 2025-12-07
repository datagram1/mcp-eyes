# ScreenControl Testing Checklist

This document provides manual testing procedures for ScreenControl components.

## F.3 Manual Testing with MCP Inspector

### F.3.1 Test Auth Discovery
```bash
# Get OAuth authorization server metadata
curl https://screencontrol.knws.co.uk/.well-known/oauth-authorization-server | jq

# Expected: JSON with authorization_endpoint, token_endpoint, etc.
```

**Verify:**
- [ ] Response returns valid JSON
- [ ] Contains `authorization_endpoint`
- [ ] Contains `token_endpoint`
- [ ] Contains `registration_endpoint` (for DCR)
- [ ] Contains `code_challenge_methods_supported: ["S256"]`

### F.3.2 Test DCR (Dynamic Client Registration)
```bash
# Register a new OAuth client
curl -X POST https://screencontrol.knws.co.uk/api/oauth/register \
  -H "Content-Type: application/json" \
  -d '{
    "client_name": "Test Client",
    "redirect_uris": ["http://localhost:8080/callback"],
    "grant_types": ["authorization_code", "refresh_token"],
    "scope": "mcp:tools mcp:resources"
  }' | jq
```

**Verify:**
- [ ] Response returns `client_id`
- [ ] Response returns `client_secret` (if confidential client)
- [ ] Client is created in database
- [ ] Rate limiting works (max 10/hour)

### F.3.3 Test Authorization Flow
1. Open browser to authorization URL:
   ```
   https://screencontrol.knws.co.uk/api/oauth/authorize?
     client_id=<CLIENT_ID>&
     redirect_uri=http://localhost:8080/callback&
     response_type=code&
     code_challenge=<CODE_CHALLENGE>&
     code_challenge_method=S256&
     scope=mcp:tools%20mcp:resources&
     state=random-state
   ```

2. Log in if prompted

3. Approve consent screen

4. Capture authorization code from redirect

5. Exchange code for tokens:
   ```bash
   curl -X POST https://screencontrol.knws.co.uk/api/oauth/token \
     -H "Content-Type: application/x-www-form-urlencoded" \
     -d "grant_type=authorization_code" \
     -d "code=<AUTH_CODE>" \
     -d "redirect_uri=http://localhost:8080/callback" \
     -d "client_id=<CLIENT_ID>" \
     -d "code_verifier=<CODE_VERIFIER>" | jq
   ```

**Verify:**
- [ ] Consent screen shows correct scopes
- [ ] Authorization code is returned in redirect
- [ ] Token exchange returns `access_token`
- [ ] Token exchange returns `refresh_token`
- [ ] Token has correct `expires_in`
- [ ] Invalid code_verifier is rejected

### F.3.4 Test MCP Tools via Authenticated Connection
```bash
# List available tools
curl https://screencontrol.knws.co.uk/mcp/<ENDPOINT_UUID> \
  -H "Authorization: Bearer <ACCESS_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"tools/list","id":1}' | jq

# Call a tool (e.g., screenshot)
curl https://screencontrol.knws.co.uk/mcp/<ENDPOINT_UUID> \
  -H "Authorization: Bearer <ACCESS_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"screenshot"},"id":2}' | jq
```

**Verify:**
- [ ] tools/list returns available tools
- [ ] tools/call executes tool on agent
- [ ] Invalid token returns 401
- [ ] Expired token returns 401
- [ ] Missing scope returns 403

---

## F.4 Agent Testing

### F.4.1 Agent Connects via WebSocket
```bash
# Test WebSocket endpoint is listening
curl -v -H "Connection: Upgrade" -H "Upgrade: websocket" \
  https://screencontrol.knws.co.uk/ws

# Expected: 101 Switching Protocols (with WebSocket client)
```

**Steps:**
1. Start ScreenControl agent on test machine
2. Agent connects to `wss://screencontrol.knws.co.uk/ws`
3. Check server logs for connection

**Verify:**
- [ ] Agent establishes WebSocket connection
- [ ] Server logs show connection
- [ ] Agent record created in database
- [ ] Agent appears in dashboard

### F.4.2 Agent Shows in Dashboard as PENDING
1. Navigate to Dashboard → Agents
2. Find newly connected agent

**Verify:**
- [ ] Agent appears in list
- [ ] Status shows "PENDING" badge
- [ ] Hostname is displayed correctly
- [ ] OS type icon is correct
- [ ] "Activate" button is visible

### F.4.3 User Activates Agent → Becomes ACTIVE
1. Click "Activate" button on agent
2. Confirm activation

**Verify:**
- [ ] State changes to "ACTIVE"
- [ ] `activatedAt` timestamp is set
- [ ] Agent receives state update via WebSocket
- [ ] "Deactivate" button now visible

### F.4.4 Agent Heartbeat Updates lastSeenAt
1. Wait for heartbeat interval (30 seconds)
2. Check agent's lastSeenAt timestamp

**Verify:**
- [ ] `lastSeenAt` updates on each heartbeat
- [ ] Dashboard shows "Last seen: just now"
- [ ] Online status indicator is green

### F.4.5 Agent Disconnect Shows as Offline
1. Stop the agent application
2. Wait for timeout (60 seconds)
3. Check dashboard

**Verify:**
- [ ] Agent shows as "Offline" in dashboard
- [ ] Status indicator turns gray
- [ ] "Last seen: Xm ago" timestamp shown

### F.4.6 Wake Command Reaches Sleeping Agent
1. Let agent enter SLEEP power state
2. Click "Wake" button in dashboard

**Verify:**
- [ ] Wake command sent to agent
- [ ] Agent power state changes to ACTIVE
- [ ] Dashboard updates to show active state
- [ ] Heartbeat interval decreases

### F.4.7 Block Prevents Agent from Connecting
1. Click "Block" on an agent
2. Stop and restart the agent

**Verify:**
- [ ] Agent state changes to BLOCKED
- [ ] Existing WebSocket connection closed
- [ ] Agent cannot reconnect
- [ ] Error message sent to agent

### F.4.8 Download Returns Patched Installer
1. Go to Dashboard → Connections → [Connection] → Downloads
2. Select platform (macOS/Windows/Linux)
3. Click Download

**Verify:**
- [ ] Download starts
- [ ] File has correct filename
- [ ] File contains embedded endpoint UUID
- [ ] Checksum is valid

### F.4.9 Patched Agent Connects to Correct MCP Endpoint
1. Install downloaded agent on test machine
2. Run agent without manual configuration

**Verify:**
- [ ] Agent reads embedded configuration
- [ ] Agent connects to correct WebSocket
- [ ] Agent associates with correct MCP connection
- [ ] Tools work via the MCP endpoint

---

## Quick Verification Commands

### Check Database Agent Count
```sql
SELECT status, state, COUNT(*) FROM agents GROUP BY status, state;
```

### Check Recent Agent Activity
```sql
SELECT a.hostname, cl.method, cl.status, cl."startedAt"
FROM command_logs cl
JOIN agents a ON cl."agentId" = a.id
ORDER BY cl."startedAt" DESC
LIMIT 10;
```

### Check OAuth Clients
```sql
SELECT "clientId", "clientName", "createdAt" FROM oauth_clients ORDER BY "createdAt" DESC LIMIT 5;
```

### Check Access Tokens
```sql
SELECT scope, "expiresAt", "createdAt" FROM access_tokens ORDER BY "createdAt" DESC LIMIT 5;
```

---

## Environment Variables to Verify

```bash
# Check production environment
ssh production-server "cd /var/www/screencontrol/web && grep -E '^(DATABASE_URL|NEXTAUTH_URL|PATCH_SECRET)' .env"
```

Required variables:
- [ ] `DATABASE_URL` - PostgreSQL connection string
- [ ] `NEXTAUTH_URL` - Base URL for auth
- [ ] `NEXTAUTH_SECRET` - Session encryption key
- [ ] `PATCH_SECRET` - HMAC key for installer patching

---

## Test Results Log

| Date | Tester | Test | Result | Notes |
|------|--------|------|--------|-------|
| | | F.3.1 Auth Discovery | | |
| | | F.3.2 DCR | | |
| | | F.3.3 Auth Flow | | |
| | | F.3.4 MCP Tools | | |
| | | F.4.1 WebSocket Connect | | |
| | | F.4.2 PENDING State | | |
| | | F.4.3 Activate | | |
| | | F.4.4 Heartbeat | | |
| | | F.4.5 Disconnect | | |
| | | F.4.6 Wake | | |
| | | F.4.7 Block | | |
| | | F.4.8 Download | | |
| | | F.4.9 Patched Agent | | |
