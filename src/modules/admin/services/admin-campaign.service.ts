import { prisma } from '../../../db/prisma.client';
import { TierUtils } from '../../../utils/tier.utils';

export class AdminCampaignService {
  private static normalizeNewUserSettings(data: { isNewUserOnly?: boolean; newUserMaxAccountAgeDays?: number | null }) {
    const isNewUserOnly = Boolean(data.isNewUserOnly);
    return {
      isNewUserOnly,
      newUserMaxAccountAgeDays: isNewUserOnly ? Number(data.newUserMaxAccountAgeDays ?? 7) : null,
    };
  }

  static async createCampaign(data: any) {
    const newUserSettings = this.normalizeNewUserSettings(data);
    return await prisma.campaign.create({
      data: {
        title: data.title,
        description: data.description,
        category: data.category,
        coverImageUrl: data.coverImageUrl || null,
        targetUrl: data.targetUrl,
        socialHandleTarget: data.socialHandleTarget,
        maxCompletions: data.maxCompletions,
        targetCountries: data.targetCountries || [],
        requiredPlatform: data.requiredPlatform || 'WEBSITE',
        isPremiumOnly: data.isPremiumOnly || false,
        ...newUserSettings,
        requiredFreeTier: data.requiredFreeTier || 'BASIC',
        baseRewardSats: 0,
        xpReward: 0,
        doubleRewardsStartAt: data.doubleRewardsStartAt ? new Date(data.doubleRewardsStartAt) : null,
        doubleRewardsEndAt: data.doubleRewardsEndAt ? new Date(data.doubleRewardsEndAt) : null,
        tierRewardMatrix: { BASIC: 0, COPPER: 0, BRONZE: 0, SILVER: 0, GOLD: 0, PLATINUM: 0, DIAMOND: 0, CROWN: 0, ELITE: 0, FOUNDER: 0 },
      },
      include: {
        tasks: true,
      },
    });
  }

  static async getCampaignAnalytics(campaignId: string) {
    const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } });
    if (!campaign) throw new Error('Campaign not found');

    const campaignTasks = await prisma.task.findMany({
      where: { campaignId },
      select: { id: true },
    });

    const campaignTaskIds = campaignTasks.map((task) => task.id);

    const submissions = await prisma.submission.findMany({
      where: { task: { campaignId } },
      select: {
        id: true,
        userId: true,
        status: true,
        submittedAt: true,
        user: {
          select: {
            country: true,
            totalXp: true,
            premiumTier: true,
            premiumExpiresAt: true,
          },
        },
      },
    });

    const submissionIds = submissions.map((submission) => submission.id);

    const rewardLedgers = submissionIds.length
      ? await prisma.ledger.findMany({
          where: {
            type: 'TASK_REWARD',
            referenceId: { in: submissionIds },
          },
          select: {
            amountSats: true,
            referenceId: true,
            description: true,
          },
        })
      : [];

    const analytics = {
      totalSubmissions: submissions.length,
      statusCounts: { verified: 0, pending: 0, rejected: 0 },
      geographicDistribution: {} as Record<string, number>,
      tierDistribution: {} as Record<string, number>,
      satsByTierDistribution: {} as Record<string, number>,
      timeOfDayPatterns: {} as Record<string, number>,
      totalTaskRewardSatsSpent: 0,
      totalRewardedSubmissions: 0,
      totalRewardedUsers: 0,
      averageRewardPerApprovedSubmission: 0,
      campaignTaskCount: campaignTaskIds.length,
    };

    const rewardedUserIds = new Set<string>();
    const submissionUserMap = new Map(submissions.map((submission) => [submission.id, submission.userId]));

    for (const submission of submissions) {
      if (['LOCKED_15D', 'WITHDRAWABLE'].includes(submission.status)) {
        analytics.statusCounts.verified++;
      } else if (['PENDING_24H', 'MANUAL_REVIEW'].includes(submission.status)) {
        analytics.statusCounts.pending++;
      } else if (submission.status === 'REJECTED') {
        analytics.statusCounts.rejected++;
      }

      const country = submission.user.country || 'Unknown';
      analytics.geographicDistribution[country] =
        (analytics.geographicDistribution[country] || 0) + 1;

      const hasPremium = TierUtils.isPremiumActive(submission.user as any);
      const activeTier = hasPremium
        ? submission.user.premiumTier
        : TierUtils.getFreeTier(submission.user.totalXp);

      analytics.tierDistribution[activeTier as string] =
        (analytics.tierDistribution[activeTier as string] || 0) + 1;

      const hour = submission.submittedAt.getUTCHours().toString();
      analytics.timeOfDayPatterns[hour] =
        (analytics.timeOfDayPatterns[hour] || 0) + 1;
    }

    for (const ledger of rewardLedgers) {
      analytics.totalTaskRewardSatsSpent += Number(ledger.amountSats || 0);

      const rewardedUserId = ledger.referenceId ? submissionUserMap.get(ledger.referenceId) : null;
      if (rewardedUserId) {
        rewardedUserIds.add(rewardedUserId);
      }

      const tierMatch = ledger.description?.match(/Tier:\s*([A-Z]+)/i);
      const tierKey = tierMatch?.[1]?.toUpperCase() || 'UNKNOWN';

      analytics.satsByTierDistribution[tierKey] =
        (analytics.satsByTierDistribution[tierKey] || 0) + Number(ledger.amountSats || 0);
    }

    analytics.totalRewardedSubmissions = rewardLedgers.length;
    analytics.totalRewardedUsers = rewardedUserIds.size;
    analytics.averageRewardPerApprovedSubmission = analytics.totalRewardedSubmissions > 0
      ? Math.floor(analytics.totalTaskRewardSatsSpent / analytics.totalRewardedSubmissions)
      : 0;

    return analytics;
  }

  static async getAllCampaigns() {
    const campaigns = await prisma.campaign.findMany({
      include: { tasks: { select: { requirements: true } } },
      orderBy: { createdAt: 'desc' },
    });

    return campaigns.map((campaign) => ({
      ...campaign,
      isStandalone: campaign.tasks.length > 0 && campaign.tasks.every((task) => Boolean((task.requirements as any)?.standalone)),
    }));
  }

  static async getCampaignById(id: string) {
    const campaign = await prisma.campaign.findUnique({
      where: { id },
      include: { tasks: true },
    });

    if (!campaign) throw new Error('Campaign not found');
    return {
      ...campaign,
      isStandalone: campaign.tasks.length > 0 && campaign.tasks.every((task) => Boolean((task.requirements as any)?.standalone)),
    };
  }

  static async updateCampaign(id: string, data: any) {
    await this.getCampaignById(id);

    const {
      baseRewardSats: _baseRewardSats,
      tierRewardMatrix: _tierRewardMatrix,
      xpReward: _xpReward,
      maxCompletions,
      ...safeData
    } = data;

    const newUserSettings = Object.prototype.hasOwnProperty.call(data, 'isNewUserOnly')
      || Object.prototype.hasOwnProperty.call(data, 'newUserMaxAccountAgeDays')
      ? this.normalizeNewUserSettings(data)
      : null;


    return await prisma.campaign.update({
      where: { id },
      data: {
        ...safeData,
        ...(newUserSettings ? newUserSettings : {}),
        ...(Object.prototype.hasOwnProperty.call(data, 'maxCompletions')
          ? { maxCompletions: Number(maxCompletions) }
          : {}),
        ...(Object.prototype.hasOwnProperty.call(safeData, 'coverImageUrl')
          ? { coverImageUrl: safeData.coverImageUrl || null }
          : {}),
      },
    });
  }

  static async deleteCampaign(id: string) {
    await this.getCampaignById(id);
    return await prisma.campaign.update({
      where: { id },
      data: { isActive: false },
    });
  }


  static async createStandaloneTask(data: any) {
    const standaloneCampaign = await prisma.campaign.create({
      data: {
        title: data.title,
        description: data.description,
        category: 'SOCIAL',
        coverImageUrl: null,
        targetUrl: data.targetUrl || null,
        socialHandleTarget: null,
        targetCountries: [],
        requiredPlatform: 'NONE',
        requiredFreeTier: 'BASIC',
        isPremiumOnly: false,
        baseRewardSats: 0,
        xpReward: 0,
        tierRewardMatrix: { BASIC: 0, COPPER: 0, BRONZE: 0, SILVER: 0, GOLD: 0, PLATINUM: 0, DIAMOND: 0, CROWN: 0, ELITE: 0, FOUNDER: 0 },
        maxCompletions: 999999999,
        isActive: true,
      },
    });

    const task = await prisma.task.create({
      data: {
        campaignId: standaloneCampaign.id,
        title: data.title,
        description: data.description,
        targetUrl: data.targetUrl || null,
        proofType: data.proofType || 'SCREENSHOT',
        baseRewardSatsOverride: data.baseRewardSatsOverride || null,
        tierRewardMatrixOverride: data.tierRewardMatrixOverride || null,
        xpRewardOverride: data.xpRewardOverride ?? null,
        requirements: {
          requiredPlatform: data.requiredPlatform || 'NONE',
          standalone: true,
        },
      },
    });

    return {
      campaign: standaloneCampaign,
      task,
    };
  }


  static async getAllStandaloneTasks() {
    return await prisma.task.findMany({
      where: {
        requirements: {
          path: ['standalone'],
          equals: true,
        },
      },
      include: {
        campaign: {
          select: {
            id: true,
            title: true,
            isActive: true,
            createdAt: true,
            updatedAt: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  static async getStandaloneTaskById(taskId: string) {
    const task = await prisma.task.findUnique({
      where: { id: taskId },
      include: {
        campaign: true,
      },
    });

    if (!task || !(task.requirements as any)?.standalone) {
      throw new Error('Standalone task not found');
    }

    return task;
  }

  static async updateStandaloneTask(taskId: string, data: any) {
    await this.getStandaloneTaskById(taskId);

    const {
      title,
      description,
      targetUrl,
      proofType,
      baseRewardSatsOverride,
      tierRewardMatrixOverride,
      xpRewardOverride,
      requiredPlatform,
    } = data;

    const updatedTask = await prisma.task.update({
      where: { id: taskId },
      data: {
        title,
        description,
        targetUrl,
        proofType,
        baseRewardSatsOverride,
        tierRewardMatrixOverride,
        xpRewardOverride,
        requirements: {
          ...(data.requirements || {}),
          standalone: true,
          requiredPlatform: requiredPlatform || 'NONE',
        },
      },
      include: { campaign: true },
    });

    await prisma.campaign.update({
      where: { id: updatedTask.campaignId },
      data: {
        title: title ?? updatedTask.title,
        description: description ?? updatedTask.description ?? '',
        targetUrl: targetUrl === '' ? null : (targetUrl ?? undefined),
      },
    });

    return await this.getStandaloneTaskById(taskId);
  }

  static async deleteStandaloneTask(taskId: string) {
    const task = await this.getStandaloneTaskById(taskId);
    await prisma.task.delete({ where: { id: taskId } });
    return await prisma.campaign.delete({ where: { id: task.campaignId } });
  }

  static async addTaskToCampaign(campaignId: string, data: any) {
    const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } });
    if (!campaign) throw new Error('Campaign not found.');

    return await prisma.task.create({
      data: {
        campaignId: campaign.id,
        title: data.title,
        description: data.description,
        targetUrl: data.targetUrl || null,
        proofType: data.proofType || 'SCREENSHOT',
        baseRewardSatsOverride: data.baseRewardSatsOverride || null,
        tierRewardMatrixOverride: data.tierRewardMatrixOverride || null,
        xpRewardOverride: data.xpRewardOverride ?? null,
        requirements: {
          ...(data.requirements || {}),
          requiredPlatform: data.requiredPlatform || 'WEBSITE',
        },
      },
    });
  }

  static async getAllTasksForCampaign(campaignId: string) {
    await this.getCampaignById(campaignId);
    return await prisma.task.findMany({
      where: { campaignId },
      orderBy: { createdAt: 'asc' },
    });
  }

  static async getTaskById(campaignId: string, taskId: string) {
    const task = await prisma.task.findFirst({ where: { id: taskId, campaignId } });
    if (!task) throw new Error('Task not found in this campaign');
    return task;
  }

  static async updateTask(campaignId: string, taskId: string, data: any) {
    const existingTask = await this.getTaskById(campaignId, taskId);

    const {
      title,
      description,
      targetUrl,
        proofType,
        baseRewardSatsOverride,
        tierRewardMatrixOverride,
        xpRewardOverride,
        requirements,
        requiredPlatform,
      } = data;

    return await prisma.task.update({
      where: { id: taskId },
      data: {
        title,
        description,
        targetUrl,
        proofType,
        baseRewardSatsOverride,
        tierRewardMatrixOverride,
        xpRewardOverride,
        requirements: {
          ...(existingTask.requirements as any || {}),
          ...(requirements || {}),
          ...(requiredPlatform ? { requiredPlatform } : {}),
        },
      },
    });
  }

  static async deleteTask(campaignId: string, taskId: string) {
    await this.getTaskById(campaignId, taskId);
    return await prisma.task.delete({ where: { id: taskId } });
  }
}

