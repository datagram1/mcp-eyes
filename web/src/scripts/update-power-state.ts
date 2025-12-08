#!/usr/bin/env tsx
/**
 * Update all agents to ACTIVE power state
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Updating all agents to ACTIVE power state...');

  const result = await prisma.agent.updateMany({
    where: {
      powerState: {
        in: ['PASSIVE', 'SLEEP']
      }
    },
    data: {
      powerState: 'ACTIVE'
    }
  });

  console.log(`Updated ${result.count} agents to ACTIVE power state`);
}

main()
  .catch((e) => {
    console.error('Error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
