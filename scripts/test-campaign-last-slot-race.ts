import 'dotenv/config';
import { prisma } from '../src/db/prisma.client';

async function createUser(email: string, referralCode: string) {
  return prisma.user.create({
    data: {
      email,
      referralCode,
      role: 'USER',
      isVerified: true,
      passwordHash: 'test-hash',
      balanceAvailable: 0,
      balancePending: 0,
      balanceLocked: 0,
      totalXp: 0,
      currentStreak: 0,
      fullName: email.split('@')[0],
    },
    select: { id: true, email: true },
  });
}

async function main() {
  const stamp = Date.now();
  const userOneEmail = `race-user-one-${stamp}@example.com`;
  const userTwoEmail = `race-user-two-${stamp}@example.com`;
  const campaignTitle = `Race Test Campaign ${stamp}`;
  let campaignId: string | null = null;
  let taskId: string | null = null;
  let userIds: string[] = [];

  console.log('--- Campaign Last Slot Race Test ---');

  const [userOne, userTwo] = await Promise.all([
    createUser(userOneEmail, `RACEA${stamp}`),
    createUser(userTwoEmail, `RACEB${stamp}`),
  ]);
  userIds = [userOne.id, userTwo.id];

  const campaign = await prisma.campaign.create({
    data: {
      title: campaignTitle,
      description: 'Tests atomic reservation of the final campaign completion slot.',
      category: 'SOCIAL',
      targetCountries: [],
      requiredPlatform: 'NONE',
      requiredFreeTier: 'BASIC',
      isPremiumOnly: false,
      isNewUserOnly: false,
      baseRewardSats: 10,
      tierRewardMatrix: {
        BASIC: 10,
        COPPER: 10,
        BRONZE: 10,
        SILVER: 10,
        GOLD: 10,
        PLATINUM: 10,
        DIAMOND: 10,
        CROWN: 10,
        ELITE: 10,
        FOUNDER: 10,
      },
      xpReward: 0,
      maxCompletions: 1,
      totalCompletions: 0,
      isActive: true,
    },
    select: { id: true, title: true, maxCompletions: true, totalCompletions: true },
  });
  campaignId = campaign.id;

  const task = await prisma.task.create({
    data: {
      campaignId: campaign.id,
      title: 'Race Test Task',
      description: 'Single task so first accepted completion claims the only campaign slot.',
      proofType: 'SCREENSHOT',
    },
    select: { id: true },
  });
  taskId = task.id;

  await Promise.all([
    prisma.submission.create({
      data: {
        userId: userOne.id,
        taskId: task.id,
        status: 'PENDING_24H',
        screenshotUrl: 'https://example.com/proof-a.png',
      },
    }),
    prisma.submission.create({
      data: {
        userId: userTwo.id,
        taskId: task.id,
        status: 'PENDING_24H',
        screenshotUrl: 'https://example.com/proof-b.png',
      },
    }),
  ]);

  async function attemptReserve(label: string) {
    return prisma.$transaction(async (tx) => {
      const updated = await tx.campaign.updateMany({
        where: {
          id: campaign.id,
          totalCompletions: { lt: 1 },
        },
        data: {
          totalCompletions: { increment: 1 },
        },
      });

      return {
        label,
        updatedRows: updated.count,
        won: updated.count === 1,
      };
    });
  }

  const [firstAttempt, secondAttempt] = await Promise.all([
    attemptReserve('attempt-1'),
    attemptReserve('attempt-2'),
  ]);

  const finalCampaign = await prisma.campaign.findUnique({
    where: { id: campaign.id },
    select: { id: true, totalCompletions: true, maxCompletions: true },
  });

  console.log('Campaign:', campaign.title);
  console.log('Max completions:', finalCampaign?.maxCompletions);
  console.log('Final total completions:', finalCampaign?.totalCompletions);
  console.log('Result 1:', firstAttempt);
  console.log('Result 2:', secondAttempt);

  const winners = [firstAttempt, secondAttempt].filter((item) => item.won);
  const losers = [firstAttempt, secondAttempt].filter((item) => !item.won);

  if (!finalCampaign) {
    throw new Error('Campaign not found after race test.');
  }

  if (finalCampaign.totalCompletions !== 1) {
    throw new Error(`Expected final totalCompletions to stay at 1, got ${finalCampaign.totalCompletions}`);
  }

  if (winners.length !== 1) {
    throw new Error(`Expected exactly one winner, got ${winners.length}`);
  }

  if (losers.length !== 1) {
    throw new Error(`Expected exactly one loser, got ${losers.length}`);
  }

  if (winners[0].updatedRows !== 1 || losers[0].updatedRows !== 0) {
    throw new Error('Atomic reservation did not behave as expected.');
  }

  console.log('PASS: only one concurrent attempt claimed the final campaign slot.');

  if (taskId) {
    await prisma.submission.deleteMany({ where: { taskId } });
    await prisma.task.deleteMany({ where: { id: taskId } });
  }
  if (campaignId) {
    await prisma.campaign.deleteMany({ where: { id: campaignId } });
  }
  if (userIds.length > 0) {
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  }
}

main()
  .catch(async (error) => {
    console.error('FAIL:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      await prisma.$disconnect();
    } catch {}
  });
