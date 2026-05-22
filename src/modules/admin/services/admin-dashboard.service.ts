import { prisma } from '../../../db/prisma.client';

export class AdminDashboardService {
  static async getOverviewMetrics() {
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const [
      totalUsers,
      accountActiveUsers,
      accountInactiveUsers,
      newSignups24h,
      activeUsers24h,
      premiumUsers,
      activeCampaigns,
      totalCampaigns,
      doubleRewardCampaigns,
      pendingManualReviews,
      approvedSubmissions24h,
      rejectedSubmissions24h,
      totalWithdrawalsPending,
      totalWithdrawalsPaid,
      satsPending,
      satsPaid,
      recentUsers,
      recentSubmissions,
      recentTransactions,
    ] = await Promise.all([
      prisma.user.count({ where: { role: 'USER' } }),
      prisma.user.count({ where: { role: 'USER', isActive: true } }),
      prisma.user.count({ where: { role: 'USER', isActive: false } }),
      prisma.user.count({
        where: {
          role: 'USER',
          createdAt: { gte: twentyFourHoursAgo },
        },
      }),
      prisma.user.count({
        where: {
          role: 'USER',
          lastActivityAt: { gte: twentyFourHoursAgo },
        },
      }),
      prisma.user.count({
        where: {
          role: 'USER',
          premiumExpiresAt: { gt: new Date() },
        },
      }),
      prisma.campaign.count({ where: { isActive: true } }),
      prisma.campaign.count(),
      prisma.campaign.count({
        where: {
          doubleRewardsStartAt: { not: null },
          doubleRewardsEndAt: { not: null },
        },
      }),
      prisma.submission.count({ where: { status: 'MANUAL_REVIEW' } }),
      prisma.submission.count({
        where: {
          status: { in: ['LOCKED_15D', 'WITHDRAWABLE'] },
          submittedAt: { gte: twentyFourHoursAgo },
        },
      }),
      prisma.submission.count({
        where: {
          status: 'REJECTED',
          submittedAt: { gte: twentyFourHoursAgo },
        },
      }),
      prisma.withdrawal.count({ where: { status: 'PENDING' } }),
      prisma.withdrawal.count({ where: { status: 'PAID' } }),
      prisma.user.aggregate({ _sum: { balancePending: true } }),
      prisma.withdrawal.aggregate({
        _sum: { amountSats: true },
        where: { status: 'PAID' },
      }),
      prisma.user.findMany({
        where: { role: 'USER', createdAt: { gte: sevenDaysAgo } },
        select: { createdAt: true },
      }),
      prisma.submission.findMany({
        where: { submittedAt: { gte: sevenDaysAgo } },
        select: { submittedAt: true, status: true },
      }),
      prisma.ledger.findMany({
        where: { createdAt: { gte: sevenDaysAgo } },
        select: { createdAt: true, amountSats: true, type: true },
      }),
    ]);

    const dailyLabels = Array.from({ length: 7 }, (_, index) => {
      const date = new Date(sevenDaysAgo);
      date.setDate(sevenDaysAgo.getDate() + index);
      return date.toISOString().slice(0, 10);
    });

    const signupSeries = dailyLabels.map((date) => ({ date, count: 0 }));
    const submissionSeries = dailyLabels.map((date) => ({ date, approved: 0, rejected: 0 }));
    const satsSeries = dailyLabels.map((date) => ({ date, sats: 0 }));

    for (const user of recentUsers) {
      const dateKey = user.createdAt.toISOString().slice(0, 10);
      const day = signupSeries.find((entry) => entry.date === dateKey);
      if (day) day.count += 1;
    }

    for (const submission of recentSubmissions) {
      const dateKey = submission.submittedAt.toISOString().slice(0, 10);
      const day = submissionSeries.find((entry) => entry.date === dateKey);
      if (!day) continue;
      if (['LOCKED_15D', 'WITHDRAWABLE'].includes(submission.status)) day.approved += 1;
      if (submission.status === 'REJECTED') day.rejected += 1;
    }

    for (const transaction of recentTransactions) {
      const dateKey = transaction.createdAt.toISOString().slice(0, 10);
      const day = satsSeries.find((entry) => entry.date === dateKey);
      if (!day) continue;
      if (['TASK_REWARD', 'STREAK_BONUS', 'QUIZ_REWARD', 'REFERRAL_BONUS'].includes(transaction.type)) {
        day.sats += Number(transaction.amountSats || 0);
      }
    }

    return {
      users: {
        total: totalUsers,
        accountActive: accountActiveUsers,
        accountInactive: accountInactiveUsers,
        newLast24h: newSignups24h,
        activeLast24h: activeUsers24h,
        premium: premiumUsers,
      },
      campaigns: {
        active: activeCampaigns,
        total: totalCampaigns,
        doubleRewardsConfigured: doubleRewardCampaigns,
      },
      submissions: {
        pendingManualReview: pendingManualReviews,
        completedLast24h: approvedSubmissions24h,
        rejectedLast24h: rejectedSubmissions24h,
      },
      withdrawals: {
        pending: totalWithdrawalsPending,
        paid: totalWithdrawalsPaid,
      },
      sats: {
        pendingPool: Number(satsPending._sum.balancePending || 0),
        paidOut: Number(satsPaid._sum.amountSats || 0),
      },
      charts: {
        signupsLast7d: signupSeries,
        submissionsLast7d: submissionSeries,
        satsDistributedLast7d: satsSeries,
      },
    };
  }
}
