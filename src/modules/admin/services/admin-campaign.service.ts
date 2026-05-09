import { prisma } from '../../../db/prisma.client';
import { TierUtils } from '../../../utils/tier.utils';

export class AdminCampaignService {
  static async createCampaign(data: any) {
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
        requiredPlatform: data.requiredPlatform || 'NONE',
        isPremiumOnly: data.isPremiumOnly || false,
        requiredFreeTier: data.requiredFreeTier || 'BASIC',
        baseRewardSats: data.baseRewardSats,
        xpReward: data.xpReward || 0,
        doubleRewardsStartAt: data.doubleRewardsStartAt ? new Date(data.doubleRewardsStartAt) : null,
        doubleRewardsEndAt: data.doubleRewardsEndAt ? new Date(data.doubleRewardsEndAt) : null,
        tierRewardMatrix: data.tierRewardMatrix,
      },
      include: {
        tasks: true,
      },
    });
  }

  static async getCampaignAnalytics(campaignId: string) {
    const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } });
    if (!campaign) throw new Error('Campaign not found');

    const submissions = await prisma.submission.findMany({
      where: { task: { campaignId } },
      select: {
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

    const analytics = {
      totalSubmissions: submissions.length,
      statusCounts: { verified: 0, pending: 0, rejected: 0 },
      geographicDistribution: {} as Record<string, number>,
      tierDistribution: {} as Record<string, number>,
      timeOfDayPatterns: {} as Record<string, number>,
    };

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

    return analytics;
  }

  static async getAllCampaigns() {
    return await prisma.campaign.findMany({ orderBy: { createdAt: 'desc' } });
  }

  static async getCampaignById(id: string) {
    const campaign = await prisma.campaign.findUnique({
      where: { id },
      include: { tasks: true },
    });

    if (!campaign) throw new Error('Campaign not found');
    return campaign;
  }

  static async updateCampaign(id: string, data: any) {
    await this.getCampaignById(id);
    return await prisma.campaign.update({
      where: { id },
      data: {
        ...data,
        ...(Object.prototype.hasOwnProperty.call(data, 'coverImageUrl')
          ? { coverImageUrl: data.coverImageUrl || null }
          : {}),
      },
    });
  }

  static async deleteCampaign(id: string) {
    await this.getCampaignById(id);
    await prisma.task.deleteMany({ where: { campaignId: id } });
    return await prisma.campaign.delete({ where: { id } });
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
          requiredPlatform: data.requiredPlatform || 'NONE',
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
    await this.getTaskById(campaignId, taskId);

    const {
      title,
      description,
      targetUrl,
        proofType,
        baseRewardSatsOverride,
        tierRewardMatrixOverride,
        xpRewardOverride,
        requirements,
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
        requirements,
      },
    });
  }

  static async deleteTask(campaignId: string, taskId: string) {
    await this.getTaskById(campaignId, taskId);
    return await prisma.task.delete({ where: { id: taskId } });
  }
}
