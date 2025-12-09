// Quick test script to issue a test token and call MCP endpoint
// Run with: node --env-file=../.env issue_test_token.js

const crypto = require('crypto');

// Generate a secure random token
const testToken = crypto.randomBytes(32).toString('base64url');
console.log('Test Token:', testToken);
console.log('Token Hash (SHA256):', crypto.createHash('sha256').update(testToken).digest('hex'));

// Instructions for manual testing
console.log(`
To test manually:

1. SSH to production server:
   ssh 192.168.10.10

2. Insert test token using Prisma:
   cd /var/www/html/screencontrol/web
   npx prisma db execute --stdin << 'EOF'
   INSERT INTO oauth_access_tokens (
     id, "accessTokenHash", "tokenType", scope, audience, "userId", "connectionId",
     "accessExpiresAt", "createdAt", "updatedAt"
   )
   SELECT
     'test-token-' || gen_random_uuid()::text,
     '${crypto.createHash('sha256').update(testToken).digest('hex')}',
     'Bearer',
     ARRAY['mcp:tools', 'mcp:resources', 'mcp:prompts']::text[],
     'https://screencontrol.knws.co.uk/mcp/cmivv9aar000310vcfp9lg0qj',
     mc."userId",
     mc.id,
     NOW() + INTERVAL '1 hour',
     NOW(),
     NOW()
   FROM mcp_connections mc
   WHERE mc."endpointUuid" = 'cmivv9aar000310vcfp9lg0qj'
   LIMIT 1;
EOF

3. Test MCP endpoint:
   curl -s 'https://screencontrol.knws.co.uk/mcp/cmivv9aar000310vcfp9lg0qj' \\
     -H 'Authorization: Bearer ${testToken}' \\
     -H 'Content-Type: application/json' \\
     -d '{"jsonrpc":"2.0","method":"tools/list","id":1}'
`);
