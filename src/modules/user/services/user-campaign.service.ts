import { prisma } from '../../../db/prisma.client';
import { TierUtils } from '../../../utils/tier.utils';
import { applyDoubleReward, isDoubleRewardActive } from '../../../utils/reward.util';

export class UserCampaignService {
  private static isWithinNewUserWindow(createdAt: Date, maxAgeDays: number | null | undefined) {
    if (!maxAgeDays || maxAgeDays <= 0) return false;
    const accountAgeMs = Date.now() - new Date(createdAt).getTime();
    const accountAgeDays = Math.floor(accountAgeMs / (24 * 60 * 60 * 1000));
    return accountAgeDays <= maxAgeDays;
  }

  private static getTierRewardForTask(
    task: { tierRewardMatrixOverride?: unknown; campaign: { tierRewardMatrix?: unknown } },
    activeTier: string | null | undefined,
  ) {
    const tierKey = String(activeTier || '');
    const overrideMatrix = (task.tierRewardMatrixOverride || {}) as Record<string, number>;
    const campaignMatrix = (task.campaign.tierRewardMatrix || {}) as Record<string, number>;
    const overrideReward = Number(overrideMatrix[tierKey] || 0);
    const campaignReward = Number(campaignMatrix[tierKey] || 0);
    return overrideReward > 0 ? overrideReward : campaignReward;
  }

  private static getBasicTierRewardForTask(
    task: { tierRewardMatrixOverride?: unknown; campaign: { tierRewardMatrix?: unknown } },
  ) {
    return this.getTierRewardForTask(task, 'BASIC');
  }

  static async getAvailableCampaigns(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { totalXp: true, country: true, premiumTier: true, premiumExpiresAt: true, createdAt: true },
    });

    if (!user) throw new Error('User not found');

    const freeTierOrder = ['BASIC', 'COPPER', 'BRONZE', 'SILVER', 'GOLD'];
    const userFreeTier = TierUtils.getFreeTier(user.totalXp);
    const userFreeTierIndex = freeTierOrder.indexOf(userFreeTier);
    const activePremiumTier = TierUtils.getCurrentPremiumTier(user as any);
    const hasPremium = Boolean(activePremiumTier);

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
            xpRewardOverride: true,
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
        const userHasCompletedOrStartedCampaign = campaign.tasks.some((task) => {
          const latestSubmission = task.submissions[0];
          return Boolean(latestSubmission && latestSubmission.status !== 'REJECTED');
        });

        if (campaign.totalCompletions >= campaign.maxCompletions && !userHasCompletedOrStartedCampaign) {
          return false;
        }

        if (campaign.tasks.length === 0) return false;
        if (campaign.isNewUserOnly && !this.isWithinNewUserWindow(user.createdAt, campaign.newUserMaxAccountAgeDays)) return false;

        if (campaign.isPremiumOnly) {
          return true;
        }

        const requiredTierIndex = freeTierOrder.indexOf(campaign.requiredFreeTier);
        return requiredTierIndex <= userFreeTierIndex || hasPremium;
      })
      .map((campaign) => {
        const doubleRewardsActive = isDoubleRewardActive(campaign.doubleRewardsStartAt, campaign.doubleRewardsEndAt);
        const activeTier = activePremiumTier || userFreeTier;
        const taskLevelRewards = campaign.tasks.map((task) => {
          return this.getTierRewardForTask({ ...task, campaign }, activeTier as string);
        });
        const basicTierTaskRewards = campaign.tasks.map((task) => {
          return this.getBasicTierRewardForTask({ ...task, campaign });
        });
        const totalTaskReward = taskLevelRewards.reduce((sum, reward) => sum + Number(reward || 0), 0);
        const baseRewardSats = basicTierTaskRewards.reduce((sum, reward) => sum + Number(reward || 0), 0);
        const totalTaskXp = campaign.tasks.reduce(
          (sum, task) => sum + Number(task.xpRewardOverride ?? campaign.xpReward ?? 0),
          0,
        );
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
          baseRewardSats,
          displayRewardSats: applyDoubleReward(totalTaskReward, doubleRewardsActive),
          xpReward: applyDoubleReward(totalTaskXp, doubleRewardsActive),
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
        const doubleRewardsActive = isDoubleRewardActive(task.campaign.doubleRewardsStartAt, task.campaign.doubleRewardsEndAt);
        const taskRewardSats = applyDoubleReward(this.getTierRewardForTask(task, activeTier as string), doubleRewardsActive);
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
          isPremiumOnly: Boolean(task.campaign.isPremiumOnly),
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

    const activePremiumTier = TierUtils.getCurrentPremiumTier(user as any);
    const hasPremium = Boolean(activePremiumTier);
    if (task.campaign.isPremiumOnly && !hasPremium) {
      throw new Error('This task is available for premium members only.');
    }
    const activeTier = activePremiumTier || TierUtils.getFreeTier(user.totalXp);
    const doubleRewardsActive = isDoubleRewardActive(task.campaign.doubleRewardsStartAt, task.campaign.doubleRewardsEndAt);
    const taskRewardSats = applyDoubleReward(this.getTierRewardForTask(task, activeTier as string), doubleRewardsActive);
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
      isPremiumOnly: Boolean(task.campaign.isPremiumOnly),
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
      select: { totalXp: true, premiumTier: true, premiumExpiresAt: true, createdAt: true },
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

    const activePremiumTier = TierUtils.getCurrentPremiumTier(user as any);
    const hasPremium = Boolean(activePremiumTier);
    if (campaign.isPremiumOnly && !hasPremium) {
      throw new Error('This campaign is available for premium members only.');
    }
    if (campaign.isNewUserOnly && !this.isWithinNewUserWindow(user.createdAt, campaign.newUserMaxAccountAgeDays)) {
      throw new Error('This campaign is only available to new users.');
    }
    const activeTier = activePremiumTier || TierUtils.getFreeTier(user.totalXp);
    const doubleRewardsActive = isDoubleRewardActive(campaign.doubleRewardsStartAt, campaign.doubleRewardsEndAt);
    const totalTaskRewardForTier = campaign.tasks.reduce(
      (sum, task) => sum + this.getTierRewardForTask({ ...task, campaign }, activeTier as string),
      0,
    );
    const totalTaskXp = campaign.tasks.reduce(
      (sum, task) => sum + Number(task.xpRewardOverride ?? campaign.xpReward ?? 0),
      0,
    );

    return {
      ...campaign,
      activeTier,
      doubleRewardsActive,
      displayRewardSats: applyDoubleReward(totalTaskRewardForTier, doubleRewardsActive),
      xpReward: applyDoubleReward(totalTaskXp, doubleRewardsActive),
      tasks: campaign.tasks.map((task) => {
        const taskRewardSats = applyDoubleReward(this.getTierRewardForTask({ ...task, campaign }, activeTier as string), doubleRewardsActive);
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
