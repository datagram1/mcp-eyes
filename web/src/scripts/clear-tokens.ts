import { prisma } from '../lib/prisma';

async function main() {
  // Delete all tokens with localhost audience
  const deleted = await prisma.oAuthAccessToken.deleteMany({
    where: {
      audience: { contains: 'localhost' }
    }
  });
  
  console.log('Deleted', deleted.count, 'tokens with localhost audience');
  
  // Also clear auth codes
  const deletedCodes = await prisma.oAuthAuthorizationCode.deleteMany({
    where: {
      resource: { contains: 'localhost' }
    }
  });
  
  console.log('Deleted', deletedCodes.count, 'auth codes with localhost resource');
}

main().finally(() => prisma.$disconnect());
