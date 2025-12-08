import { prisma } from '../lib/prisma';

async function main() {
  const clients = await prisma.oAuthClient.findMany({
    select: {
      id: true,
      clientId: true,
      clientName: true,
      redirectUris: true,
      createdAt: true,
    },
  });
  
  console.log('=== OAuth Clients ===\n');
  for (const c of clients) {
    console.log('DB ID:', c.id);
    console.log('  Client ID:', c.clientId);
    console.log('  Name:', c.clientName);
    console.log('  Redirect URIs:', c.redirectUris);
    console.log('  Created:', c.createdAt.toISOString());
    console.log('---');
  }
}

main().finally(() => prisma.$disconnect());
