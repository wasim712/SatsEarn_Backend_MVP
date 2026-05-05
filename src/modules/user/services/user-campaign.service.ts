import { prisma } from '../../../db/prisma.client';
import { TierUtils } from '../../../utils/tier.utils';

export class UserCampaignService {
  static async getAvailableCampaigns(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { totalXp: true, country: true, premiumTier: true, premiumExpiresAt: true },
    });

    if (!user) throw new Error('User not found');

    const freeTierOrder = ['BASIC', 'COPPER', 'BRONZE', 'SILVER', 'GOLD'];
    const userFreeTier = TierUtils.getFreeTier(user.totalXp);
    const userFreeTierIndex = freeTierOrder.indexOf(userFreeTier);
    const hasPremium = TierUtils.isPremiumActive(user as any);

    const campaigns = await prisma.campaign.findMany({
      where: {
        isActive: true,
        OR: [
          { targetCountries: { has: user.country || 'IN' } },
          { targetCountries: { isEmpty: true } },
        ],
      },
      include: {
        _count: { select: { tasks: true } },
        tasks: {
          select: {
            id: true,
            submissions: {
              where: { userId },
              select: { status: true, submittedAt: true },
              orderBy: { submittedAt: 'desc' },
              take: 1,
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return campaigns
      .filter((campaign) => {
        if (campaign.totalCompletions >= campaign.maxCompletions) return false;
        if (campaign.tasks.length === 0) return false;

        if (campaign.isPremiumOnly) {
          return hasPremium;
        }

        const requiredTierIndex = freeTierOrder.indexOf(campaign.requiredFreeTier);
        return requiredTierIndex <= userFreeTierIndex || hasPremium;
      })
      .map((campaign) => {
        const totalTasksCount = campaign.tasks.length;
        const completedTasksCount = campaign.tasks.filter((task) => {
          const latestSubmission = task.submissions[0];
          return latestSubmission && latestSubmission.status !== 'REJECTED';
        }).length;

        const isCompleted = totalTasksCount > 0 && completedTasksCount === totalTasksCount;
        const hasStarted = campaign.tasks.some((task) => task.submissions.length > 0);

        return {
          ...campaign,
          requiredPlatform: String(campaign.requiredPlatform || 'NONE'),
          isCompleted,
          hasStarted,
          completedTasksCount,
          totalTasksCount,
          userCompletionStatus: isCompleted
            ? 'COMPLETED'
            : hasStarted
              ? 'IN_PROGRESS'
              : 'AVAILABLE',
        };
      });
  }

  static async getCampaignDetails(userId: string, campaignId: string) {
    const campaign = await prisma.campaign.findUnique({
      where: { id: campaignId },
      include: {
        tasks: {
          include: {
            submissions: {
              where: { userId },
              select: { status: true, submittedAt: true },
            },
          },
        },
      },
    });

    if (!campaign) throw new Error('Campaign not found');
    if (!campaign.isActive) throw new Error('This campaign is no longer active');

    return campaign;
  }

  static async getActiveAnnouncements() {
    return await prisma.announcement.findMany({
      where: { isActive: true },
      orderBy: { createdAt: 'desc' },
    });
  }
}
