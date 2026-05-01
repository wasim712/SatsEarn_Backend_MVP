import { prisma } from '../../../db/prisma.client';

export class UserCampaignService {
  static async getAvailableCampaigns(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { totalXp: true, country: true },
    });

    if (!user) throw new Error('User not found');

    const allowedTiers = ['BASIC'];
    if (user.totalXp >= 1000) allowedTiers.push('BRONZE');
    if (user.totalXp >= 5000) allowedTiers.push('SILVER');
    if (user.totalXp >= 10000) allowedTiers.push('GOLD');

    const campaigns = await prisma.campaign.findMany({
      where: {
        isActive: true,
        requiredFreeTier: { in: allowedTiers as any },
        OR: [
          { targetCountries: { has: user.country || 'IN' } },
          { targetCountries: { isEmpty: true } },
        ],
      },
      include: {
        _count: { select: { tasks: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return campaigns.filter((campaign) => campaign.totalCompletions < campaign.maxCompletions);
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
