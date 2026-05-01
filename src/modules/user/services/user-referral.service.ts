import { prisma } from '../../../db/prisma.client';

export class UserReferralService {
  static async getReferralDashboard(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        referrals: {
          select: {
            id: true,
            fullName: true,
            email: true,
            createdAt: true,
            totalXp: true,
            submissions: {
              where: {
                submittedAt: {
                  gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
                },
              },
              select: { submittedAt: true },
            },
          },
        },
      },
    });

    if (!user) throw new Error('User not found');

    let activeCount = 0;
    let inactiveCount = 0;

    const referralDetails = user.referrals.map((referral) => {
      const uniqueActiveDays = new Set(
        referral.submissions.map((submission) => submission.submittedAt.toISOString().split('T')[0]),
      ).size;

      const isActive = uniqueActiveDays >= 10;
      if (isActive) activeCount++;
      else inactiveCount++;

      return {
        id: referral.id,
        fullName: referral.fullName,
        email: referral.email,
        joinedAt: referral.createdAt,
        totalXp: referral.totalXp,
        isActive,
        daysActiveLast30: uniqueActiveDays,
      };
    });

    return {
      referralCode: user.referralCode,
      totalReferrals: user.referrals.length,
      activeReferrals: activeCount,
      inactiveReferrals: inactiveCount,
      referrals: referralDetails,
    };
  }

  static async getUnlockSchedule(userId: string) {
    const submissions = await prisma.submission.findMany({
      where: {
        userId,
        status: { in: ['LOCKED_15D', 'WITHDRAWABLE'] },
      },
      include: {
        task: {
          include: { campaign: true },
        },
      },
      orderBy: { unlockAt: 'asc' },
    });

    return submissions.map((submission) => ({
      id: submission.id,
      taskTitle: submission.task.title,
      campaignTitle: submission.task.campaign.title,
      confidenceScore: submission.confidenceScore,
      unlockAt: submission.unlockAt,
      status: submission.status,
    }));
  }
}
