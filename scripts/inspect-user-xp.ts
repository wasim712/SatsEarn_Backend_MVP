import 'dotenv/config';
import { prisma } from '../src/db/prisma.client';

async function main() {
  const email = 'gosha451@hotmail.com';
  const user = await prisma.user.findUnique({
    where: { email },
    select: {
      id: true,
      email: true,
      fullName: true,
      totalXp: true,
      currentStreak: true,
      lastClaimedStreakMilestone: true,
      createdAt: true,
      lastActivityAt: true,
    },
  });

  if (!user) {
    console.log('USER_NOT_FOUND');
    return;
  }

  const [submissions, standaloneSubmissions, quizAttempts, ledgerEntries] = await Promise.all([
    prisma.submission.findMany({
      where: { userId: user.id },
      orderBy: { submittedAt: 'desc' },
      take: 20,
      select: {
        id: true,
        status: true,
        submittedAt: true,
        task: {
          select: {
            title: true,
            xpRewardOverride: true,
            campaign: { select: { title: true, xpReward: true } },
          },
        },
      },
    }),
    prisma.standaloneSubmission.findMany({
      where: { userId: user.id },
      orderBy: { submittedAt: 'desc' },
      take: 20,
      select: {
        id: true,
        status: true,
        submittedAt: true,
        standaloneTask: { select: { title: true, xpReward: true } },
      },
    }),
    prisma.quizAttempt.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: {
        id: true,
        score: true,
        passed: true,
        createdAt: true,
        dailyQuiz: { select: { title: true, xpReward: true, rewardSats: true, date: true } },
      },
    }),
    prisma.ledger.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: {
        id: true,
        type: true,
        amountSats: true,
        amountMsats: true,
        description: true,
        referenceId: true,
        createdAt: true,
      },
    }),
  ]);

  console.log(JSON.stringify({ user, submissions, standaloneSubmissions, quizAttempts, ledgerEntries }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
}).finally(async () => {
  await prisma.$disconnect();
});
