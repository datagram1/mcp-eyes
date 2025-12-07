# Remote MCP Implementation Tasks

> Enable Claude.ai, Claude Code, Cursor, and other AI tools to connect to ScreenControl via Remote MCP with OAuth 2.1 authentication.

## Overview

ScreenControl needs to support the MCP (Model Context Protocol) authorization specification so that external AI tools can securely connect and control agents on behalf of authenticated users.

### Key Requirements
- OAuth 2.1 with PKCE (RFC 7636)
- Dynamic Client Registration (RFC 7591) - required by Claude
- Protected Resource Metadata (RFC 9728)
- Authorization Server Metadata (RFC 8414)
- Per-tenant MCP endpoints with UUID addressing
- Multi-connection support (user can have multiple AI tools connected)
- Revocation capability

---

## Architecture

### Authentication Flow

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  AI CLIENT (Claude.ai / Claude Code / Cursor)                                │
└──────────────────────────────────────────────────────────────────────────────┘
       │
       │ 1. User adds MCP URL: https://screencontrol.knws.co.uk/mcp/{tenant_uuid}
       │
       ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│  DISCOVERY PHASE                                                             │
│  ───────────────                                                             │
│  2. GET /.well-known/oauth-protected-resource/{tenant_uuid}                  │
│     Response: { "resource": "https://.../{uuid}",                            │
│                "authorization_servers": ["https://screencontrol.knws.co.uk"] }│
│                                                                              │
│  3. GET /.well-known/oauth-authorization-server                              │
│     Response: { "issuer": "...",                                             │
│                "authorization_endpoint": "/api/oauth/authorize",             │
│                "token_endpoint": "/api/oauth/token",                         │
│                "registration_endpoint": "/api/oauth/register",               │
│                "response_types_supported": ["code"],                         │
│                "grant_types_supported": ["authorization_code","refresh_token"],│
│                "code_challenge_methods_supported": ["S256"] }                │
└──────────────────────────────────────────────────────────────────────────────┘
       │
       │ 4. POST /api/oauth/register (Dynamic Client Registration)
       │    Body: { "client_name": "Claude", "redirect_uris": [...] }
       │    Response: { "client_id": "...", "client_secret": null }
       │
       ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│  AUTHORIZATION PHASE                                                         │
│  ───────────────────                                                         │
│  5. Redirect user to: /api/oauth/authorize                                   │
│     ?client_id=...                                                           │
│     &redirect_uri=https://claude.ai/api/mcp/auth_callback                    │
│     &response_type=code                                                      │
│     &scope=mcp:tools mcp:resources                                           │
│     &state=...                                                               │
│     &code_challenge=...                                                      │
│     &code_challenge_method=S256                                              │
│     &resource=https://screencontrol.knws.co.uk/mcp/{tenant_uuid}             │
│                                                                              │
│  6. User sees ScreenControl login (if not logged in)                         │
│  7. User sees consent screen: "Claude wants to access your agents"           │
│  8. User approves → redirect to Claude with authorization code               │
└──────────────────────────────────────────────────────────────────────────────┘
       │
       │ 9. POST /api/oauth/token
       │    Body: { grant_type: "authorization_code", code: "...",
       │            code_verifier: "...", redirect_uri: "..." }
       │    Response: { access_token: "...", refresh_token: "...",
       │                expires_in: 3600, token_type: "Bearer" }
       │
       ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│  MCP COMMUNICATION                                                           │
│  ─────────────────                                                           │
│  10. POST /mcp/{tenant_uuid}                                                 │
│      Headers: Authorization: Bearer <access_token>                           │
│               Accept: application/json, text/event-stream                    │
│      Body: JSON-RPC request                                                  │
│                                                                              │
│  11. Server validates token:                                                 │
│      - Token not expired                                                     │
│      - Token audience matches /mcp/{tenant_uuid}                             │
│      - Token belongs to tenant who owns {tenant_uuid}                        │
│                                                                              │
│  12. Server processes MCP request, forwards to user's agents                 │
└──────────────────────────────────────────────────────────────────────────────┘
```

### Endpoint Structure

```
https://screencontrol.knws.co.uk/
├── .well-known/
│   ├── oauth-authorization-server              # RFC 8414 - OAuth metadata
│   └── oauth-protected-resource/[uuid]         # RFC 9728 - Resource metadata
│
├── api/oauth/
│   ├── register                                # RFC 7591 - Dynamic Client Reg
│   ├── authorize                               # OAuth 2.1 - Authorization
│   ├── token                                   # OAuth 2.1 - Token exchange
│   └── revoke                                  # Token revocation
│
├── mcp/[tenant_uuid]/                          # Per-tenant MCP endpoint
│   ├── (POST) Streamable HTTP                  # JSON-RPC requests
│   └── (GET) SSE stream                        # Server-sent events
│
└── dashboard/
    └── connections/                            # User manages MCP connections
        ├── (list active connections)
        ├── (generate new endpoint UUID)
        └── (revoke connection)
```

### Database Schema Updates

```prisma
// ============================================
// OAUTH - Dynamic Client Registration
// ============================================

model OAuthClient {
  id                  String    @id @default(cuid())
  clientId            String    @unique  // Public identifier (UUID)
  clientSecretHash    String?             // Hashed, only for confidential clients
  clientName          String              // "Claude", "Cursor", "Claude Code"
  clientUri           String?             // Homepage of client

  // Registration
  redirectUris        String[]            // Allowed callback URLs
  grantTypes          String[]  @default(["authorization_code", "refresh_token"])
  responseTypes       String[]  @default(["code"])
  tokenEndpointAuth   String    @default("none") // "none" for public clients

  // Metadata
  logoUri             String?
  contacts            String[]

  // Tracking
  registeredByIp      String?
  registeredByAgent   String?             // User-Agent header

  createdAt           DateTime  @default(now())
  updatedAt           DateTime  @updatedAt

  // Relations
  tokens              OAuthAccessToken[]
  authCodes           OAuthAuthorizationCode[]

  @@map("oauth_clients")
}

// ============================================
// OAUTH - Authorization Codes
// ============================================

model OAuthAuthorizationCode {
  id                  String    @id @default(cuid())
  code                String    @unique  // Hashed authorization code

  // PKCE (required)
  codeChallenge       String
  codeChallengeMethod String    @default("S256")

  // Request context
  redirectUri         String              // Must match on token exchange
  scope               String[]            // Requested scopes
  resource            String              // The tenant MCP URL (audience)
  state               String?             // Client state parameter

  // Relations
  clientId            String
  client              OAuthClient @relation(fields: [clientId], references: [id], onDelete: Cascade)
  userId              String
  user                User @relation(fields: [userId], references: [id], onDelete: Cascade)

  // Lifecycle
  expiresAt           DateTime            // Short-lived (10 minutes)
  usedAt              DateTime?           // Set when exchanged for token

  createdAt           DateTime  @default(now())

  @@index([code])
  @@index([clientId])
  @@index([userId])
  @@map("oauth_authorization_codes")
}

// ============================================
// OAUTH - Access & Refresh Tokens
// ============================================

model OAuthAccessToken {
  id                  String    @id @default(cuid())
  accessTokenHash     String    @unique   // SHA256 hash of token
  refreshTokenHash    String?   @unique   // SHA256 hash of refresh token
  tokenType           String    @default("Bearer")

  // Scopes & audience
  scope               String[]            // Granted scopes
  audience            String              // The tenant MCP URL this token is for

  // Expiry
  accessExpiresAt     DateTime            // Short-lived (1 hour)
  refreshExpiresAt    DateTime?           // Longer-lived (30 days)

  // Relations
  clientId            String
  client              OAuthClient @relation(fields: [clientId], references: [id], onDelete: Cascade)
  userId              String
  user                User @relation(fields: [userId], references: [id], onDelete: Cascade)
  connectionId        String
  connection          McpConnection @relation(fields: [connectionId], references: [id], onDelete: Cascade)

  // Revocation
  revokedAt           DateTime?
  revokedReason       String?

  createdAt           DateTime  @default(now())
  lastUsedAt          DateTime?

  @@index([accessTokenHash])
  @@index([refreshTokenHash])
  @@index([clientId])
  @@index([userId])
  @@index([connectionId])
  @@map("oauth_access_tokens")
}

// ============================================
// MCP CONNECTIONS - Per-User Endpoint Management
// ============================================

model McpConnection {
  id                  String    @id @default(cuid())
  userId              String

  // Endpoint identifier (the UUID in /mcp/{uuid})
  endpointUuid        String    @unique @default(cuid())

  // Connection metadata
  name                String              // User-friendly name: "My Claude Desktop"
  description         String?

  // Which client is using this (populated after first auth)
  clientName          String?             // "Claude", "Cursor", etc.
  clientId            String?             // OAuth client ID

  // Status
  status              McpConnectionStatus @default(ACTIVE)

  // Usage tracking
  lastUsedAt          DateTime?
  totalRequests       Int       @default(0)

  // Timestamps
  createdAt           DateTime  @default(now())
  updatedAt           DateTime  @updatedAt
  revokedAt           DateTime?

  // Relations
  user                User @relation(fields: [userId], references: [id], onDelete: Cascade)
  tokens              OAuthAccessToken[]
  requestLogs         McpRequestLog[]

  @@index([userId])
  @@index([endpointUuid])
  @@index([status])
  @@map("mcp_connections")
}

enum McpConnectionStatus {
  ACTIVE              // Can be used
  PAUSED              // Temporarily disabled
  REVOKED             // Permanently disabled
}

// ============================================
// MCP REQUEST LOGGING
// ============================================

model McpRequestLog {
  id                  String    @id @default(cuid())
  connectionId        String

  // Request details
  method              String              // "tools/list", "tools/call", etc.
  toolName            String?             // For tools/call
  params              Json?

  // Response
  success             Boolean
  errorCode           Int?
  errorMessage        String?
  durationMs          Int?

  // Context
  ipAddress           String?
  userAgent           String?

  createdAt           DateTime  @default(now())

  connection          McpConnection @relation(fields: [connectionId], references: [id], onDelete: Cascade)

  @@index([connectionId])
  @@index([method])
  @@index([createdAt])
  @@map("mcp_request_logs")
}

// ============================================
// UPDATE EXISTING USER MODEL
// ============================================

model User {
  // ... existing fields ...

  // OAuth relations (add these)
  oauthTokens         OAuthAccessToken[]
  oauthCodes          OAuthAuthorizationCode[]
  mcpConnections      McpConnection[]

  // ... rest of existing relations ...
}
```

---

## Implementation Tasks

### Phase 1: Database & Schema Updates ✅

- [x] 1.1 Create Prisma migration for new OAuth tables
  - [x] 1.1.1 Add `OAuthClient` model
  - [x] 1.1.2 Add `OAuthAuthorizationCode` model
  - [x] 1.1.3 Add `OAuthAccessToken` model
  - [x] 1.1.4 Add `McpConnection` model
  - [x] 1.1.5 Add `McpRequestLog` model
  - [x] 1.1.6 Add `McpConnectionStatus` enum
  - [x] 1.1.7 Update `User` model with new relations

- [x] 1.2 Create database migration
  - [x] 1.2.1 Run `npx prisma migrate dev --name add_oauth_mcp`
  - [x] 1.2.2 Generate Prisma client `npx prisma generate`

### Phase 2: OAuth Core Library ✅

- [x] 2.1 Create OAuth utility library `src/lib/oauth/`
  - [x] 2.1.1 `src/lib/oauth/index.ts` - exports
  - [x] 2.1.2 `src/lib/oauth/pkce.ts` - PKCE code challenge verification
  - [x] 2.1.3 `src/lib/oauth/tokens.ts` - Token generation, hashing, validation
  - [x] 2.1.4 `src/lib/oauth/scopes.ts` - Scope definitions and validation
  - [x] 2.1.5 `src/lib/oauth/client-registration.ts` - DCR logic

- [x] 2.2 Token utilities
  - [x] 2.2.1 Generate secure random tokens (access, refresh, auth codes)
  - [x] 2.2.2 SHA256 hashing for storage
  - [x] 2.2.3 Token expiry calculation
  - [x] 2.2.4 Token validation with audience check

- [x] 2.3 PKCE utilities
  - [x] 2.3.1 Verify S256 code challenge against code verifier
  - [x] 2.3.2 Reject plain method (only S256 allowed per OAuth 2.1)

### Phase 3: Well-Known Endpoints ✅

- [x] 3.1 OAuth Authorization Server Metadata (RFC 8414)
  - [x] 3.1.1 Create `src/app/.well-known/oauth-authorization-server/route.ts`
  - [x] 3.1.2 Return issuer, endpoints, supported features
  - [x] 3.1.3 Include `registration_endpoint` for DCR

- [x] 3.2 Protected Resource Metadata (RFC 9728)
  - [x] 3.2.1 Create `src/app/.well-known/oauth-protected-resource/[uuid]/route.ts`
  - [x] 3.2.2 Validate UUID exists and is active
  - [x] 3.2.3 Return resource URL and authorization_servers

### Phase 4: OAuth Endpoints ✅

- [x] 4.1 Dynamic Client Registration (RFC 7591)
  - [x] 4.1.1 Create `src/app/api/oauth/register/route.ts`
  - [x] 4.1.2 Validate client_name, redirect_uris
  - [x] 4.1.3 Generate client_id (UUID)
  - [x] 4.1.4 Store in OAuthClient table
  - [x] 4.1.5 Return client credentials

- [x] 4.2 Authorization Endpoint
  - [x] 4.2.1 Create `src/app/api/oauth/authorize/route.ts`
  - [x] 4.2.2 Validate all required parameters (client_id, redirect_uri, response_type, code_challenge, resource)
  - [x] 4.2.3 Verify client exists and redirect_uri matches
  - [x] 4.2.4 Check user session (redirect to login if not authenticated)
  - [x] 4.2.5 Show consent screen (user approves scopes)
  - [x] 4.2.6 Generate authorization code
  - [x] 4.2.7 Store code with PKCE challenge
  - [x] 4.2.8 Redirect to client with code and state

- [x] 4.3 Token Endpoint
  - [x] 4.3.1 Create `src/app/api/oauth/token/route.ts`
  - [x] 4.3.2 Handle `grant_type=authorization_code`
    - [x] Validate code exists and not expired/used
    - [x] Verify PKCE code_verifier against stored challenge
    - [x] Verify redirect_uri matches
    - [x] Generate access_token and refresh_token
    - [x] Mark code as used
    - [x] Store tokens
    - [x] Return token response
  - [x] 4.3.3 Handle `grant_type=refresh_token`
    - [x] Validate refresh_token exists and not expired/revoked
    - [x] Generate new access_token
    - [x] Rotate refresh_token (issue new one, invalidate old)
    - [x] Return token response

- [x] 4.4 Token Revocation Endpoint
  - [x] 4.4.1 Create `src/app/api/oauth/revoke/route.ts`
  - [x] 4.4.2 Accept token and token_type_hint
  - [x] 4.4.3 Mark token as revoked

### Phase 5: MCP Tenant Endpoints ✅

- [x] 5.1 Per-tenant MCP endpoint
  - [x] 5.1.1 Create `src/app/mcp/[uuid]/route.ts`
  - [x] 5.1.2 Validate Bearer token from Authorization header
  - [x] 5.1.3 Verify token audience matches this endpoint
  - [x] 5.1.4 Extract user from token
  - [x] 5.1.5 Handle POST (Streamable HTTP JSON-RPC)
  - [x] 5.1.6 Handle GET (SSE stream)
  - [x] 5.1.7 Return 401 with WWW-Authenticate header if unauthorized

- [x] 5.2 MCP request handling
  - [x] 5.2.1 `initialize` - Return capabilities
  - [x] 5.2.2 `tools/list` - List user's available agent tools
  - [x] 5.2.3 `tools/call` - Forward to agent, return result
  - [x] 5.2.4 `resources/list` - List available resources
  - [x] 5.2.5 `prompts/list` - List available prompts

- [x] 5.3 Session management
  - [x] 5.3.1 Generate Mcp-Session-Id header
  - [x] 5.3.2 Track sessions for resumption
  - [x] 5.3.3 Handle Last-Event-ID for SSE resumption

### Phase 6: Dashboard UI - Connection Management

- [ ] 6.1 Connections list page
  - [ ] 6.1.1 Create `src/app/(dashboard)/dashboard/connections/page.tsx`
  - [ ] 6.1.2 List all user's MCP connections
  - [ ] 6.1.3 Show status (active/paused/revoked)
  - [ ] 6.1.4 Show last used timestamp
  - [ ] 6.1.5 Show connected client name

- [ ] 6.2 Create new connection
  - [ ] 6.2.1 "Add Connection" button
  - [ ] 6.2.2 Modal/form for connection name
  - [ ] 6.2.3 Generate new McpConnection with UUID
  - [ ] 6.2.4 Display the MCP URL for user to copy
  - [ ] 6.2.5 Instructions for adding to Claude/Cursor

- [ ] 6.3 Connection detail/management
  - [ ] 6.3.1 View connection details
  - [ ] 6.3.2 Copy MCP URL button
  - [ ] 6.3.3 Pause/Resume connection
  - [ ] 6.3.4 Revoke connection (with confirmation)
  - [ ] 6.3.5 View request logs

- [ ] 6.4 API routes for connection management
  - [ ] 6.4.1 `GET /api/connections` - List user's connections
  - [ ] 6.4.2 `POST /api/connections` - Create new connection
  - [ ] 6.4.3 `GET /api/connections/[id]` - Get connection details
  - [ ] 6.4.4 `PATCH /api/connections/[id]` - Update (pause/resume)
  - [ ] 6.4.5 `DELETE /api/connections/[id]` - Revoke connection
  - [ ] 6.4.6 `GET /api/connections/[id]/logs` - Get request logs

### Phase 7: Consent Screen

- [ ] 7.1 Create OAuth consent page
  - [ ] 7.1.1 Create `src/app/oauth/consent/page.tsx`
  - [ ] 7.1.2 Show client name and logo
  - [ ] 7.1.3 Show requested scopes with descriptions
  - [ ] 7.1.4 Show which agents will be accessible
  - [ ] 7.1.5 "Allow" and "Deny" buttons
  - [ ] 7.1.6 Handle form submission

### Phase 8: Security & Validation ✅

- [x] 8.1 Token security
  - [x] 8.1.1 Tokens never stored in plain text (always hashed)
  - [x] 8.1.2 Short access token lifetime (1 hour)
  - [x] 8.1.3 Refresh token rotation on use
  - [x] 8.1.4 Audience validation on every request

- [x] 8.2 PKCE enforcement
  - [x] 8.2.1 Require code_challenge on authorize
  - [x] 8.2.2 Require code_verifier on token exchange
  - [x] 8.2.3 Only allow S256 method

- [x] 8.3 Redirect URI validation
  - [x] 8.3.1 Exact match only (no wildcards)
  - [x] 8.3.2 HTTPS required (except localhost)
  - [x] 8.3.3 No fragments allowed

- [x] 8.4 Rate limiting
  - [x] 8.4.1 Rate limit /api/oauth/register (10/hour per IP)
  - [x] 8.4.2 Rate limit /api/oauth/token (60/min per IP)
  - [x] 8.4.3 Rate limit MCP endpoints (100/min per connection, 20/min unauthenticated)

### Phase 9: Documentation

- [ ] 9.1 Update README.md
  - [ ] 9.1.1 Add Remote MCP section
  - [ ] 9.1.2 Document authentication flow
  - [ ] 9.1.3 Document endpoint structure
  - [ ] 9.1.4 Add architecture diagram

- [ ] 9.2 User documentation
  - [ ] 9.2.1 How to connect Claude.ai
  - [ ] 9.2.2 How to connect Claude Code
  - [ ] 9.2.3 How to connect Cursor
  - [ ] 9.2.4 Troubleshooting guide

### Phase 10: Testing

- [ ] 10.1 Unit tests
  - [ ] 10.1.1 PKCE verification tests
  - [ ] 10.1.2 Token generation/validation tests
  - [ ] 10.1.3 Scope validation tests

- [ ] 10.2 Integration tests
  - [ ] 10.2.1 Full OAuth flow test
  - [ ] 10.2.2 Token refresh flow test
  - [ ] 10.2.3 MCP request with valid token
  - [ ] 10.2.4 MCP request with invalid/expired token

- [ ] 10.3 Manual testing with MCP Inspector
  - [ ] 10.3.1 Test auth discovery
  - [ ] 10.3.2 Test DCR
  - [ ] 10.3.3 Test authorization flow
  - [ ] 10.3.4 Test MCP tools

### Phase 11: Deployment

- [ ] 11.1 Deploy to production
  - [ ] 11.1.1 Commit all changes to git
  - [ ] 11.1.2 Push to GitHub
  - [ ] 11.1.3 SSH to 192.168.10.10
  - [ ] 11.1.4 Pull changes: `cd /var/www/html/screencontrol && git pull`
  - [ ] 11.1.5 Run migration: `cd web && npx prisma migrate deploy`
  - [ ] 11.1.6 Rebuild: `npm run build`
  - [ ] 11.1.7 Restart service: `sudo systemctl restart screencontrol`

- [ ] 11.2 Verify deployment
  - [ ] 11.2.1 Test /.well-known/oauth-authorization-server
  - [ ] 11.2.2 Test connection creation in dashboard
  - [ ] 11.2.3 Test with Claude.ai connector

---

## Scopes

| Scope | Description |
|-------|-------------|
| `mcp:tools` | Access to list and call tools on agents |
| `mcp:resources` | Access to list and read resources |
| `mcp:prompts` | Access to list and use prompts |
| `mcp:agents:read` | Read agent status and metadata |
| `mcp:agents:write` | Modify agent settings |

Default scope for connections: `mcp:tools mcp:resources mcp:agents:read`

---

## Claude-Specific Notes

**OAuth Callback URL:** `https://claude.ai/api/mcp/auth_callback`
(May change to `https://claude.com/api/mcp/auth_callback`)

**Client Name:** "Claude"

**Required Features:**
- Dynamic Client Registration (RFC 7591)
- Token refresh support
- Protected Resource Metadata (RFC 9728)

**Supported Transports:**
- Streamable HTTP (preferred)
- SSE (may be deprecated)

---

## Deployment Workflow

```
┌─────────────────────────────────────────────────────────────────────┐
│  LOCAL DEVELOPMENT (this machine)                                   │
│  ─────────────────────────────────                                  │
│  1. Make code changes in ./web                                      │
│  2. Test locally: npm run dev                                       │
│  3. Commit: git add . && git commit -m "..."                        │
│  4. Push: git push origin main                                      │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│  GITHUB (https://github.com/datagram1/mcp-eyes)                     │
│  ──────────────────────────────────────────────                     │
│  Repository stores all code                                         │
│  Only ./web directory is deployed to production                     │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│  PRODUCTION SERVER (192.168.10.10)                                  │
│  ─────────────────────────────────                                  │
│  1. SSH: ssh richardbrown@192.168.10.10                             │
│  2. Navigate: cd /var/www/html/screencontrol                        │
│  3. Pull: git pull origin main                                      │
│  4. Install: cd web && npm install                                  │
│  5. Migrate: npx prisma migrate deploy                              │
│  6. Build: npm run build                                            │
│  7. Restart: sudo systemctl restart screencontrol                   │
│  8. Verify: curl https://screencontrol.knws.co.uk/api/health        │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Files to Create/Modify

### New Files

```
web/src/lib/oauth/
├── index.ts
├── pkce.ts
├── tokens.ts
├── scopes.ts
└── client-registration.ts

web/src/app/.well-known/
├── oauth-authorization-server/
│   └── route.ts
└── oauth-protected-resource/
    └── [uuid]/
        └── route.ts

web/src/app/api/oauth/
├── register/
│   └── route.ts
├── authorize/
│   └── route.ts
├── token/
│   └── route.ts
└── revoke/
    └── route.ts

web/src/app/mcp/
└── [uuid]/
    └── route.ts

web/src/app/(dashboard)/dashboard/connections/
├── page.tsx
├── new/
│   └── page.tsx
└── [id]/
    ├── page.tsx
    └── logs/
        └── page.tsx

web/src/app/oauth/
└── consent/
    └── page.tsx

web/src/app/api/connections/
├── route.ts
└── [id]/
    ├── route.ts
    └── logs/
        └── route.ts
```

### Modified Files

```
web/prisma/schema.prisma          # Add OAuth and MCP models
web/README.md                      # Add Remote MCP documentation
```

---

## References

- [MCP Authorization Spec (2025-06-18)](https://modelcontextprotocol.io/specification/2025-06-18/basic/authorization)
- [MCP Streamable HTTP Transport](https://modelcontextprotocol.io/specification/2025-03-26/basic/transports)
- [RFC 7591 - Dynamic Client Registration](https://tools.ietf.org/html/rfc7591)
- [RFC 8414 - OAuth Server Metadata](https://tools.ietf.org/html/rfc8414)
- [RFC 9728 - Protected Resource Metadata](https://tools.ietf.org/html/rfc9728)
- [OAuth 2.1 Draft](https://datatracker.ietf.org/doc/html/draft-ietf-oauth-v2-1-13)
- [Claude Custom Connectors](https://support.claude.com/en/articles/11503834-building-custom-connectors-via-remote-mcp-servers)
- [MCP Inspector Tool](https://github.com/modelcontextprotocol/inspector)
