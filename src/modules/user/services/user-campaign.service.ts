import { prisma } from '../../../db/prisma.client';
import { TierUtils } from '../../../utils/tier.utils';
import { applyDoubleReward, isDoubleRewardActive } from '../../../utils/reward.util';

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
            requirements: true,
            tierRewardMatrixOverride: true,
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
        const doubleRewardsActive = isDoubleRewardActive(campaign.doubleRewardsStartAt, campaign.doubleRewardsEndAt);
        const activeTier = hasPremium ? user.premiumTier : userFreeTier;
        const taskLevelRewards = campaign.tasks.map((task) => {
          const rewardMatrix = (task.tierRewardMatrixOverride as any) || (campaign.tierRewardMatrix as any) || {};
          return Number(rewardMatrix?.[activeTier as string] || 0);
        });
        const baseTierReward = taskLevelRewards.length ? Math.max(...taskLevelRewards, 0) : 0;
        const totalTasksCount = campaign.tasks.length;
        const completedTasksCount = campaign.tasks.filter((task) => {
          const latestSubmission = task.submissions[0];
          return latestSubmission && latestSubmission.status !== 'REJECTED';
        }).length;

        const isCompleted = totalTasksCount > 0 && completedTasksCount === totalTasksCount;
        const hasStarted = campaign.tasks.some((task) => task.submissions.length > 0);

        return {
          ...campaign,
          isStandalone: campaign.tasks.length > 0 && campaign.tasks.every((task) => Boolean((task as any).requirements?.standalone)),
          displayRewardSats: applyDoubleReward(baseTierReward, doubleRewardsActive),
          doubleRewardsActive,
          requiredPlatform: campaign.tasks.length > 0 && campaign.tasks.every((task) => Boolean((task as any).requirements?.standalone)) ? 'NONE' : String(campaign.requiredPlatform || 'NONE'),
          isCompleted,
          hasStarted,
          completedTasksCount,
          totalTasksCount,
          userCompletionStatus: !campaign.isActive
            ? 'PAUSED'
            : isCompleted
              ? 'COMPLETED'
              : hasStarted
                ? 'IN_PROGRESS'
                : 'AVAILABLE',
        };
      });
  }

  static async getStandaloneTasks(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { totalXp: true, premiumTier: true, premiumExpiresAt: true },
    });

    if (!user) throw new Error('User not found');

    const hasPremium = TierUtils.isPremiumActive(user as any);
    const activeTier = hasPremium ? user.premiumTier : TierUtils.getFreeTier(user.totalXp);

    const tasks = await prisma.task.findMany({
      where: {
        campaign: {
          isActive: true,
        },
      },
      include: {
        campaign: true,
        submissions: {
          where: { userId },
          select: { status: true, submittedAt: true },
          orderBy: { submittedAt: 'desc' },
          take: 1,
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return tasks
      .filter((task) => Boolean((task.requirements as any)?.standalone))
      .map((task) => {
        const rewardMatrix = (task.tierRewardMatrixOverride as any) || (task.campaign.tierRewardMatrix as any) || {};
        const doubleRewardsActive = isDoubleRewardActive(task.campaign.doubleRewardsStartAt, task.campaign.doubleRewardsEndAt);
        const taskRewardSats = applyDoubleReward(Number(rewardMatrix?.[activeTier as string] || 0), doubleRewardsActive);
        const latestSubmission = task.submissions[0];
        const hasStarted = Boolean(latestSubmission);
        const isCompleted = Boolean(latestSubmission && latestSubmission.status !== 'REJECTED');

        return {
          id: task.id,
          campaignId: task.campaignId,
          title: task.title,
          description: task.description,
          targetUrl: task.targetUrl,
          proofType: task.proofType,
          requiredPlatform: 'NONE',
          requirements: task.requirements,
          tierRewardMatrixOverride: task.tierRewardMatrixOverride,
          xpReward: task.xpRewardOverride ?? task.campaign.xpReward ?? 0,
          taskRewardSats,
          doubleRewardsActive,
          isCompleted,
          hasStarted,
          userCompletionStatus: !task.campaign.isActive
            ? 'PAUSED'
            : isCompleted
              ? 'COMPLETED'
              : hasStarted
                ? 'IN_PROGRESS'
                : 'AVAILABLE',
          createdAt: task.createdAt,
          updatedAt: task.updatedAt,
          campaign: {
            id: task.campaign.id,
            title: task.campaign.title,
            description: task.campaign.description,
          },
        };
      });
  }


  static async getStandaloneTaskDetails(userId: string, taskId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { totalXp: true, premiumTier: true, premiumExpiresAt: true },
    });

    if (!user) throw new Error('User not found');

    const task = await prisma.task.findUnique({
      where: { id: taskId },
      include: {
        campaign: true,
        submissions: {
          where: { userId },
          select: { status: true, submittedAt: true },
          orderBy: { submittedAt: 'desc' },
          take: 1,
        },
      },
    });

    if (!task) throw new Error('Standalone task not found');
    if (!task.campaign?.isActive) throw new Error('This standalone task is no longer active');
    if (!Boolean((task.requirements as any)?.standalone)) throw new Error('This task is not a standalone task');

    const hasPremium = TierUtils.isPremiumActive(user as any);
    const activeTier = hasPremium ? user.premiumTier : TierUtils.getFreeTier(user.totalXp);
    const rewardMatrix = (task.tierRewardMatrixOverride as any) || (task.campaign.tierRewardMatrix as any) || {};
    const doubleRewardsActive = isDoubleRewardActive(task.campaign.doubleRewardsStartAt, task.campaign.doubleRewardsEndAt);
    const taskRewardSats = applyDoubleReward(Number(rewardMatrix?.[activeTier as string] || 0), doubleRewardsActive);
    const latestSubmission = task.submissions[0];
    const hasStarted = Boolean(latestSubmission);
    const isCompleted = Boolean(latestSubmission && latestSubmission.status !== 'REJECTED');

    return {
      id: task.id,
      campaignId: task.campaignId,
      title: task.title,
      description: task.description,
      targetUrl: task.targetUrl,
      proofType: task.proofType,
      requiredPlatform: 'NONE',
      requirements: task.requirements,
      tierRewardMatrixOverride: task.tierRewardMatrixOverride,
      xpReward: task.xpRewardOverride ?? task.campaign.xpReward ?? 0,
      taskRewardSats,
      doubleRewardsActive,
      isCompleted,
      hasStarted,
      userCompletionStatus: !task.campaign.isActive
        ? 'PAUSED'
        : isCompleted
          ? 'COMPLETED'
          : hasStarted
            ? 'IN_PROGRESS'
            : 'AVAILABLE',
      userSubmission: latestSubmission ?? null,
      submissions: latestSubmission ? [latestSubmission] : [],
      createdAt: task.createdAt,
      updatedAt: task.updatedAt,
      campaign: {
        id: task.campaign.id,
        title: task.campaign.title,
        description: task.campaign.description,
      },
    };
  }

  static async getCampaignDetails(userId: string, campaignId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { totalXp: true, premiumTier: true, premiumExpiresAt: true },
    });
    if (!user) throw new Error('User not found');

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

    const hasPremium = TierUtils.isPremiumActive(user as any);
    const activeTier = hasPremium ? user.premiumTier : TierUtils.getFreeTier(user.totalXp);
    const doubleRewardsActive = isDoubleRewardActive(campaign.doubleRewardsStartAt, campaign.doubleRewardsEndAt);
    const topTaskRewardForTier = campaign.tasks.length
      ? Math.max(
          ...campaign.tasks.map((task) => {
            const rewardMatrix = (task.tierRewardMatrixOverride as any) || (campaign.tierRewardMatrix as any) || {};
            return Number(rewardMatrix?.[activeTier as string] || 0);
          }),
          0
        )
      : 0;

    return {
      ...campaign,
      activeTier,
      doubleRewardsActive,
      displayRewardSats: applyDoubleReward(topTaskRewardForTier, doubleRewardsActive),
      tasks: campaign.tasks.map((task) => {
        const rewardMatrix = (task.tierRewardMatrixOverride as any) || (campaign.tierRewardMatrix as any);
        const taskRewardSats = applyDoubleReward(Number(rewardMatrix?.[activeTier as string] || 0), doubleRewardsActive);
        const requirements = (task.requirements as any) || {};

        return {
          ...task,
          taskRewardSats,
          xpReward: task.xpRewardOverride ?? campaign.xpReward ?? 0,
          requiredPlatform: requirements.requiredPlatform || 'NONE',
        };
      }),
    };
  }

  static async getActiveAnnouncements() {
    return await prisma.announcement.findMany({
      where: { isActive: true },
      orderBy: { createdAt: 'desc' },
    });
  }
}
