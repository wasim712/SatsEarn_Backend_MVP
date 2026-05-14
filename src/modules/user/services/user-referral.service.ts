import { prisma } from '../../../db/prisma.client';
import { TierUtils } from '../../../utils/tier.utils';

export class UserReferralService {
  static async getReferralDashboard(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        transactions: {
          where: { type: 'REFERRAL_BONUS' },
          select: { amountSats: true },
        },
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

    const activeTier = TierUtils.isPremiumActive(user as any)
      ? user.premiumTier
      : TierUtils.getFreeTier(user.totalXp);
    const isFreeTier = !TierUtils.isPremiumActive(user as any);
    const freeTierCap = isFreeTier ? TierUtils.getFreeTierReferralCap(activeTier as any) : null;
    const lifetimeReferralEarnings = user.transactions.reduce((sum, tx) => sum + tx.amountSats, 0);

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
      lifetimeEarningsSats: lifetimeReferralEarnings,
      activeTier,
      referralRewardCapSats: freeTierCap?.maxSats ?? null,
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
