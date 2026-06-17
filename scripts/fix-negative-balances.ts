import 'dotenv/config';
import { prisma } from '../src/db/prisma.client';
import { CronService } from '../src/modules/cron/cron.service';

async function main() {
  console.log('--- Fix Negative Balances ---');

  const before = await prisma.user.findMany({
    where: {
      OR: [
        { balancePending: { lt: 0 } },
        { balanceLocked: { lt: 0 } },
        { balanceAvailable: { lt: 0 } },
      ],
    },
    select: {
      id: true,
      email: true,
      balancePending: true,
      balanceLocked: true,
      balanceAvailable: true,
    },
  });

  console.log(`Users with corrupted negative balances before repair: ${before.length}`);

  if (before.length > 0) {
    for (const user of before) {
      console.log(
        `[BEFORE] ${user.email || user.id} | pending=${user.balancePending}, locked=${user.balanceLocked}, available=${user.balanceAvailable}`,
      );
    }
  }

  const result = await CronService.reconcileNegativeBalances();
  console.log(result);

  const after = await prisma.user.findMany({
    where: {
      OR: [
        { balancePending: { lt: 0 } },
        { balanceLocked: { lt: 0 } },
        { balanceAvailable: { lt: 0 } },
      ],
    },
    select: {
      id: true,
      email: true,
      balancePending: true,
      balanceLocked: true,
      balanceAvailable: true,
    },
  });

  console.log(`Users with corrupted negative balances after repair: ${after.length}`);

  if (after.length > 0) {
    for (const user of after) {
      console.log(
        `[AFTER] ${user.email || user.id} | pending=${user.balancePending}, locked=${user.balanceLocked}, available=${user.balanceAvailable}`,
      );
    }
    throw new Error('Some users still have negative balances after reconciliation.');
  }

  console.log('PASS: all negative cached balances were repaired to non-negative values.');
}

main()
  .catch((error) => {
    console.error('FAIL:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
