/**
 * Developer Test Environment Seed Script
 *
 * Creates the developer user and a test MCP connection with OAuth credentials.
 * Run with: npm run seed:dev
 *
 * This is needed for testing the macOS agent's Debug tab,
 * which requires an endpointUuid to connect.
 */

import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';

const prisma = new PrismaClient();

const DEVELOPER_EMAIL = 'richard.brown@knws.co.uk';
const DEVELOPER_NAME = 'Richard Brown';
const CONNECTION_NAME = 'Dev Testing';

async function main() {
  console.log('🔧 Setting up developer test environment...\n');

  // 1. Find or create developer user
  let user = await prisma.user.findUnique({
    where: { email: DEVELOPER_EMAIL },
  });

  if (user) {
    console.log(`✓ Found existing user: ${DEVELOPER_EMAIL}`);

    // Ensure account is active
    if (user.accountStatus !== 'ACTIVE') {
      user = await prisma.user.update({
        where: { id: user.id },
        data: { accountStatus: 'ACTIVE' },
      });
      console.log('  → Updated account status to ACTIVE');
    }
  } else {
    user = await prisma.user.create({
      data: {
        email: DEVELOPER_EMAIL,
        name: DEVELOPER_NAME,
        accountStatus: 'ACTIVE',
        emailVerified: new Date(),
        oauthProvider: 'local',
      },
    });
    console.log(`✓ Created new user: ${DEVELOPER_EMAIL}`);
  }

  // 2. Find or create test MCP connection with OAuth client
  let connection = await prisma.mcpConnection.findFirst({
    where: {
      userId: user.id,
      name: CONNECTION_NAME,
    },
    include: {
      oauthClient: true,
    },
  });

  let oauthClientSecret: string | null = null;

  if (connection) {
    console.log(`✓ Found existing connection: "${CONNECTION_NAME}"`);

    // Check if OAuth client exists, create if missing
    if (!connection.oauthClient) {
      console.log('  → OAuth client missing, creating one...');

      const oauthClientId = uuidv4();
      oauthClientSecret = crypto.randomBytes(32).toString('hex');
      const oauthClientSecretHash = crypto.createHash('sha256').update(oauthClientSecret).digest('hex');

      const oauthClient = await prisma.oAuthClient.create({
        data: {
          clientId: oauthClientId,
          clientSecretHash: oauthClientSecretHash,
          clientName: CONNECTION_NAME,
          clientUri: 'https://claude.ai',
          redirectUris: [
            'https://claude.ai/oauth/callback',
            'https://claude.ai/api/oauth/callback',
            'https://claude.ai/api/mcp/auth_callback',
          ],
          grantTypes: ['authorization_code', 'refresh_token'],
          responseTypes: ['code'],
          tokenEndpointAuth: 'client_secret_post',
          contacts: [],
          registeredByIp: `seed:${user.id}`,
          registeredByAgent: 'seed-dev.ts',
        },
      });

      // Link OAuth client to connection
      connection = await prisma.mcpConnection.update({
        where: { id: connection.id },
        data: { oauthClientId: oauthClient.id },
        include: { oauthClient: true },
      });

      console.log('  → OAuth client created and linked');
    } else {
      console.log('  → OAuth client already exists');
    }
  } else {
    // Create new connection with OAuth client
    const oauthClientId = uuidv4();
    oauthClientSecret = crypto.randomBytes(32).toString('hex');
    const oauthClientSecretHash = crypto.createHash('sha256').update(oauthClientSecret).digest('hex');

    // Create OAuth client first
    const oauthClient = await prisma.oAuthClient.create({
      data: {
        clientId: oauthClientId,
        clientSecretHash: oauthClientSecretHash,
        clientName: CONNECTION_NAME,
        clientUri: 'https://claude.ai',
        redirectUris: [
          'https://claude.ai/oauth/callback',
          'https://claude.ai/api/oauth/callback',
        ],
        grantTypes: ['authorization_code', 'refresh_token'],
        responseTypes: ['code'],
        tokenEndpointAuth: 'client_secret_post',
        contacts: [],
        registeredByIp: `seed:${user.id}`,
        registeredByAgent: 'seed-dev.ts',
      },
    });

    connection = await prisma.mcpConnection.create({
      data: {
        userId: user.id,
        name: CONNECTION_NAME,
        description: 'Test connection for agent development',
        status: 'ACTIVE',
        oauthClientId: oauthClient.id,
      },
      include: { oauthClient: true },
    });
    console.log(`✓ Created new connection: "${CONNECTION_NAME}" with OAuth client`);
  }

  // 3. Output the results
  const serverUrl = process.env.APP_URL || 'https://screencontrol.knws.co.uk';

  console.log('\n' + '═'.repeat(60));
  console.log('📋 DEVELOPER TEST ENVIRONMENT READY');
  console.log('═'.repeat(60));
  console.log(`\n  User:            ${user.email}`);
  console.log(`  User ID:         ${user.id}`);
  console.log(`  Connection:      ${connection.name}`);
  console.log(`  Connection ID:   ${connection.id}`);
  console.log(`\n  🔑 Endpoint UUID: ${connection.endpointUuid}`);
  console.log(`\n  MCP Endpoint URL:`);
  console.log(`  ${serverUrl}/mcp/${connection.endpointUuid}`);

  // OAuth credentials
  if (connection.oauthClient) {
    console.log('\n' + '─'.repeat(60));
    console.log('  🔐 OAuth Credentials:');
    console.log(`  Client ID:     ${connection.oauthClient.clientId}`);
    if (oauthClientSecret) {
      console.log(`  Client Secret: ${oauthClientSecret}`);
      console.log('\n  ⚠️  SAVE THE CLIENT SECRET - it cannot be retrieved later!');
    } else {
      console.log(`  Client Secret: (already exists - use "Regenerate" in UI to get new one)`);
    }
    console.log('─'.repeat(60));
  }

  console.log('\n  Use these credentials to connect Claude or other MCP clients.');
  console.log('\n');
}

main()
  .catch((e) => {
    console.error('Error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
