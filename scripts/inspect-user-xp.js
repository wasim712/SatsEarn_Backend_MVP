require('dotenv/config');
const { prisma } = require('../src/db/prisma.client');

async function main() {
  const email = 'gosha451@hotmail.com';
  const user = await prisma.user.findUnique({
    where: { email },
    include: {
      submissions: {
        orderBy: { submittedAt: 'desc' },
        take: 50,
        include: {
          task: { select: { id: true, title: true, xpRewardOverride: true, campaign: { select: { id: true, title: true, xpReward: true } } } }
        }
      },
      standaloneSubmissions: {
        orderBy: { submittedAt: 'desc' },
        take: 50,
        include: {
          standaloneTask: { select: { id: true, title: true, xpReward: true } }
        }
      },
      quizAttempts: {
        orderBy: { createdAt: 'desc' },
        take: 20,
        include: { dailyQuiz: { select: { id: true, title: true, xpReward: true, rewardSats: true, date: true } } }
      },
      transactions: {
        orderBy: { createdAt: 'desc' },
        take: 100,
      },
    },
  });

  if (!user) {
    console.log('USER_NOT_FOUND');
    return;
  }

  console.log(JSON.stringify({
    user: {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      totalXp: user.totalXp,
      currentStreak: user.currentStreak,
      lastClaimedStreakMilestone: user.lastClaimedStreakMilestone,
      createdAt: user.createdAt,
      lastActivityAt: user.lastActivityAt,
    },
    campaignSubmissions: user.submissions.map((submission) => ({
      id: submission.id,
      status: submission.status,
      submittedAt: submission.submittedAt,
      taskTitle: submission.task && submission.task.title,
      campaignTitle: submission.task && submission.task.campaign && submission.task.campaign.title,
      taskXpRewardOverride: submission.task && submission.task.xpRewardOverride,
      campaignXpReward: submission.task && submission.task.campaign && submission.task.campaign.xpReward,
    })),
    standaloneSubmissions: user.standaloneSubmissions.map((submission) => ({
      id: submission.id,
      status: submission.status,
      submittedAt: submission.submittedAt,
      taskTitle: submission.standaloneTask && submission.standaloneTask.title,
      taskXpReward: submission.standaloneTask && submission.standaloneTask.xpReward,
    })),
    quizAttempts: user.quizAttempts.map((attempt) => ({
      id: attempt.id,
      score: attempt.score,
      passed: attempt.passed,
      createdAt: attempt.createdAt,
      quizTitle: attempt.dailyQuiz && attempt.dailyQuiz.title,
      quizXpReward: attempt.dailyQuiz && attempt.dailyQuiz.xpReward,
    })),
    transactions: user.transactions.map((tx) => ({
      id: tx.id,
      type: tx.type,
      amountSats: tx.amountSats,
      amountMsats: tx.amountMsats,
      description: tx.description,
      referenceId: tx.referenceId,
      createdAt: tx.createdAt,
    })),
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
}).finally(async () => {
  await prisma.$disconnect();
});
