import { prisma } from '../lib/prisma';

async function main() {
  const tokens = await prisma.oAuthAccessToken.findMany({
    include: {
      connection: true,
    },
    orderBy: { createdAt: 'desc' },
    take: 5,
  });
  
  console.log('Recent OAuth Access Tokens:');
  for (const t of tokens) {
    console.log('---');
    console.log('Token ID:', t.id);
    console.log('Audience:', t.audience);
    console.log('Scope:', t.scope);
    console.log('Expires:', t.accessExpiresAt);
    console.log('Revoked:', t.revokedAt);
    console.log('Connection:', t.connection.name);
    console.log('Connection Status:', t.connection.status);
    console.log('Endpoint UUID:', t.connection.endpointUuid);
  }
}

main().finally(() => prisma.$disconnect());
