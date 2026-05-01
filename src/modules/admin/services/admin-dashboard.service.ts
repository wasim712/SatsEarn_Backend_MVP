import { prisma } from '../../../db/prisma.client';

export class AdminDashboardService {
  static async getOverviewMetrics() {
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const totalUsers = await prisma.user.count({ where: { role: 'USER' } });
    const newSignups24h = await prisma.user.count({
      where: {
        role: 'USER',
        createdAt: { gte: twentyFourHoursAgo },
      },
    });

    const activeCampaigns = await prisma.campaign.count({
      where: { isActive: true },
    });

    const pendingManualReviews = await prisma.submission.count({
      where: { status: 'MANUAL_REVIEW' },
    });

    const tasksCompleted24h = await prisma.submission.count({
      where: {
        status: { in: ['LOCKED_15D', 'WITHDRAWABLE'] },
        submittedAt: { gte: twentyFourHoursAgo },
      },
    });

    return {
      users: {
        total: totalUsers,
        newLast24h: newSignups24h,
      },
      campaigns: {
        active: activeCampaigns,
      },
      submissions: {
        pendingManualReview: pendingManualReviews,
        completedLast24h: tasksCompleted24h,
      },
    };
  }
}
