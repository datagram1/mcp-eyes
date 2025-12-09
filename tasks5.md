# Task: Add Agent Secret Authentication for Reconnection

## Context
The macOS ScreenControl agent connects to the server via WebSocket and registers itself. When the agent goes offline (e.g., laptop closed, network issues) and the OAuth token expires, we need a way to re-authenticate and re-establish the connection to the correct account.

The solution: The agent sends its API key (a pre-shared secret generated locally) during registration. The server stores a hash of this secret. On reconnection, the agent sends its secret again, and the server validates it against the stored hash.

## Changes Required

### 1. Prisma Schema Change

In `/Users/richardbrown/dev/mcp_eyes_screen_control/web/prisma/schema.prisma`, add a field to the Agent model (around line 202, after the `label` field):

```prisma
model Agent {
  // ... existing fields ...

  // Custom label
  label             String?
  groupName         String?
  tags              String[]

  // Agent secret for re-authentication after token expiry
  agentSecretHash   String?   // bcrypt hash of agent's API key

  // Relations
  license           License     @relation(fields: [licenseId], references: [id], onDelete: Cascade)
  // ...
}
```

### 2. Run Prisma Migration

```bash
cd /Users/richardbrown/dev/mcp_eyes_screen_control/web
npx prisma migrate dev --name add_agent_secret_hash
```

On production server (192.168.10.15):
```bash
ssh richard@192.168.10.15
cd /var/www/screencontrol
npx prisma migrate deploy
```

### 3. Update WebSocket Handler

The WebSocket handler is in `/Users/richardbrown/dev/mcp_eyes_screen_control/web/server.ts`. Find the agent registration handler (should be in the `handleWebSocketMessage` function or similar).

When an agent sends a `register` message, it now includes:
```json
{
  "type": "register",
  "machineId": "xxx",
  "hostname": "xxx",
  "endpointUuid": "cmivv9aar000310vcfp9lg0qj",
  "agentSecret": "sk_xxxxxxxxxxxxxxxx"  // NEW FIELD
}
```

Update the registration handler to:

#### A. On first registration (new agent):
```typescript
import bcrypt from 'bcrypt';

// Hash the agent secret before storing
let agentSecretHash: string | null = null;
if (message.agentSecret) {
  agentSecretHash = await bcrypt.hash(message.agentSecret, 10);
}

// Create or update agent
const agent = await prisma.agent.upsert({
  where: { agentKey: message.machineId },
  update: {
    hostname: message.hostname,
    lastSeenAt: new Date(),
    status: 'ONLINE',
    // Only update secret hash if provided AND agent doesn't already have one
    ...(agentSecretHash && !existingAgent?.agentSecretHash ? { agentSecretHash } : {}),
  },
  create: {
    agentKey: message.machineId,
    hostname: message.hostname,
    machineFingerprint: message.machineId,
    licenseId: license.id,
    ownerUserId: connection.userId,
    agentSecretHash,  // Store on creation
    // ... other fields
  },
});
```

#### B. On reconnection (existing agent with stored secret):
```typescript
// If agent already has a stored secret, validate the provided one
if (existingAgent?.agentSecretHash && message.agentSecret) {
  const secretValid = await bcrypt.compare(message.agentSecret, existingAgent.agentSecretHash);
  if (!secretValid) {
    // Reject registration - agent secret doesn't match
    ws.send(JSON.stringify({
      type: 'error',
      code: 'INVALID_AGENT_SECRET',
      message: 'Agent secret does not match stored secret'
    }));
    return;
  }
}
```

### 4. Add bcrypt Dependency (if not already present)

```bash
cd /Users/richardbrown/dev/mcp_eyes_screen_control/web
npm install bcrypt
npm install --save-dev @types/bcrypt
```

### 5. Test Scenarios

1. **New agent registration**: Agent registers with secret, server stores hash
2. **Reconnection with valid secret**: Agent reconnects, secret matches, allowed
3. **Reconnection with invalid secret**: Agent reconnects with wrong secret, rejected
4. **Reconnection without secret**: If agent has stored secret but doesn't provide one, reject or warn
5. **Legacy agent without secret**: Old agents without agentSecretHash should still work (backward compatible)

### Summary of Files to Modify

| File | Change |
|------|--------|
| `web/prisma/schema.prisma` | Add `agentSecretHash` field to Agent model |
| `web/server.ts` | Update WebSocket registration handler to hash/validate secrets |
| `web/package.json` | Add bcrypt dependency if missing |

## Security Notes

- Use bcrypt with cost factor 10 for hashing
- Never log or expose the raw agent secret
- The agentSecretHash is nullable to maintain backward compatibility
- Only store the secret hash on first registration (don't update on reconnection)
