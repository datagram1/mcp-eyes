/**
 * Developer Test Environment Seed Script
 *
 * Creates the developer user and a test MCP connection.
 * Run with: npm run seed:dev
 *
 * This is needed for testing the macOS agent's Debug tab,
 * which requires an endpointUuid to connect.
 */

import { PrismaClient } from '@prisma/client';

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

  // 2. Find or create test MCP connection
  let connection = await prisma.mcpConnection.findFirst({
    where: {
      userId: user.id,
      name: CONNECTION_NAME,
    },
  });

  if (connection) {
    console.log(`✓ Found existing connection: "${CONNECTION_NAME}"`);
  } else {
    connection = await prisma.mcpConnection.create({
      data: {
        userId: user.id,
        name: CONNECTION_NAME,
        description: 'Test connection for agent development',
        status: 'ACTIVE',
      },
    });
    console.log(`✓ Created new connection: "${CONNECTION_NAME}"`);
  }

  // 3. Output the results
  console.log('\n' + '═'.repeat(60));
  console.log('📋 DEVELOPER TEST ENVIRONMENT READY');
  console.log('═'.repeat(60));
  console.log(`\n  User:            ${user.email}`);
  console.log(`  User ID:         ${user.id}`);
  console.log(`  Connection:      ${connection.name}`);
  console.log(`  Connection ID:   ${connection.id}`);
  console.log(`\n  🔑 Endpoint UUID: ${connection.endpointUuid}`);
  console.log('\n' + '─'.repeat(60));
  console.log('  Copy the Endpoint UUID above into the macOS agent\'s');
  console.log('  Debug tab → "Endpoint UUID" field, then click Connect.');
  console.log('─'.repeat(60));

  // Also output the full MCP URL
  const serverUrl = process.env.APP_URL || 'https://screencontrol.knws.co.uk';
  console.log(`\n  MCP Endpoint URL:`);
  console.log(`  ${serverUrl}/mcp/${connection.endpointUuid}`);
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
