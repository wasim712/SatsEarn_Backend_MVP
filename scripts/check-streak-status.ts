import 'dotenv/config';
import { prisma } from '../src/db/prisma.client';

const USER_EMAIL = 'satsearnapp@gmail.com';
const EXPECTED_STREAK = 6;

async function main() {
  const user = await prisma.user.findUnique({
    where: { email: USER_EMAIL },
    select: {
      id: true,
      email: true,
      timezone: true,
      currentStreak: true,
      lastClaimedStreakMilestone: true,
      createdAt: true,
    },
  });

  if (!user) {
    throw new Error(`User not found for email: ${USER_EMAIL}`);
  }

  const recentStreakTx = await prisma.ledger.findMany({
    where: {
      userId: user.id,
      type: 'STREAK_BONUS',
    },
    select: {
      type: true,
      amountSats: true,
      description: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'desc' },
    take: 15,
  });

  console.log('='.repeat(72));
  console.log('STREAK STATUS CHECK');
  console.log('='.repeat(72));
  console.log(`User Email                 : ${user.email}`);
  console.log(`Timezone                   : ${user.timezone}`);
  console.log(`Expected currentStreak     : ${EXPECTED_STREAK}`);
  console.log(`Actual currentStreak       : ${user.currentStreak}`);
  console.log(`Match                      : ${user.currentStreak === EXPECTED_STREAK ? 'YES' : 'NO'}`);
  console.log(`lastClaimedStreakMilestone : ${user.lastClaimedStreakMilestone}`);

  console.log('\nRecent Streak-Related Transactions');
  console.log('-'.repeat(72));
  if (recentStreakTx.length === 0) {
    console.log('No streak-related transactions found.');
  } else {
    for (const tx of recentStreakTx) {
      console.log(
        `${new Date(tx.createdAt).toLocaleString()} | ${tx.type} | +${tx.amountSats} sats | ${tx.description || 'No description'}`,
      );
    }
  }

  console.log('='.repeat(72));
}

main()
  .catch((error) => {
    console.error('Streak status check failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
