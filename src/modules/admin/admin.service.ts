import { prisma } from '../../db/prisma.client';

export class AdminService {
  static async getOverviewMetrics() {
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    // 1. User Metrics
    const totalUsers = await prisma.user.count({ where: { role: 'USER' } });
    const newSignups24h = await prisma.user.count({
      where: { 
        role: 'USER',
        createdAt: { gte: twentyFourHoursAgo } 
      }
    });

    // 2. Campaign Metrics
    const activeCampaigns = await prisma.campaign.count({
      where: { isActive: true }
    });

    // 3. Submission Metrics
    const pendingManualReviews = await prisma.submission.count({
      where: { status: 'MANUAL_REVIEW' }
    });
    
    const tasksCompleted24h = await prisma.submission.count({
      where: { 
        status: { in: ['LOCKED_15D', 'WITHDRAWABLE'] },
        // FIXED: Using submittedAt instead of updatedAt
        submittedAt: { gte: twentyFourHoursAgo } 
      }
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
      }
    };
  }
  // Add this below the getOverviewMetrics method
  static async createCampaign(data: any) {
    const campaign = await prisma.campaign.create({
      data: {
        title: data.title,
        description: data.description,
        category: data.category,
        targetUrl: data.targetUrl,
        socialHandleTarget: data.socialHandleTarget,
        rewardSats: data.rewardSats,
        maxCompletions: data.maxCompletions,
        targetCountries: data.targetCountries,
        requiredTier: data.requiredTier,
        
        // This automatically creates 1 default task associated with this campaign
        tasks: {
          create: [{}] 
        }
      },
      // Include the created tasks in the response so we can see the generated Task ID
      include: {
        tasks: true, 
      }
    });

    return campaign;
  }
  // Add this below your createCampaign method
  static async getCampaignAnalytics(campaignId: string) {
    // 1. Verify the campaign exists
    const campaign = await prisma.campaign.findUnique({
      where: { id: campaignId }
    });
    if (!campaign) throw new Error("Campaign not found");

    // 2. Fetch all submissions for tasks belonging to this campaign
    // We only select the specific fields we need to save memory
    const submissions = await prisma.submission.findMany({
      where: { task: { campaignId: campaignId } },
      select: {
        status: true,
        submittedAt: true,
        user: {
          select: { country: true, tier: true }
        }
      }
    });

    // 3. Initialize our analytical counters
    const analytics = {
      totalSubmissions: submissions.length,
      statusCounts: {
        verified: 0, // LOCKED_15D or WITHDRAWABLE
        pending: 0,  // PENDING_24H or MANUAL_REVIEW
        rejected: 0  // REJECTED
      },
      geographicDistribution: {} as Record<string, number>,
      tierDistribution: {} as Record<string, number>,
      timeOfDayPatterns: {} as Record<string, number> // 0-23 hours
    };

    // 4. Process the data in a single fast loop
    for (const sub of submissions) {
      // Status Count
      if (['LOCKED_15D', 'WITHDRAWABLE'].includes(sub.status)) {
        analytics.statusCounts.verified++;
      } else if (['PENDING_24H', 'MANUAL_REVIEW'].includes(sub.status)) {
        analytics.statusCounts.pending++;
      } else if (sub.status === 'REJECTED') {
        analytics.statusCounts.rejected++;
      }

      // Geographic Distribution
      const country = sub.user.country || 'Unknown';
      analytics.geographicDistribution[country] = (analytics.geographicDistribution[country] || 0) + 1;

      // Tier Distribution
      const tier = sub.user.tier;
      analytics.tierDistribution[tier] = (analytics.tierDistribution[tier] || 0) + 1;

      // Time-of-day Pattern (0 - 23 based on UTC hour)
      const hour = sub.submittedAt.getUTCHours().toString();
      analytics.timeOfDayPatterns[hour] = (analytics.timeOfDayPatterns[hour] || 0) + 1;
    }

    return analytics;
  }

  // GET ALL
  static async getAllCampaigns() {
    return await prisma.campaign.findMany({
      orderBy: { createdAt: 'desc' }, // Newest first
    });
  }

  // GET ONE
  static async getCampaignById(id: string) {
    const campaign = await prisma.campaign.findUnique({
      where: { id },
      include: { tasks: true } // Include associated tasks
    });
    if (!campaign) throw new Error("Campaign not found");
    return campaign;
  }

  // UPDATE
  static async updateCampaign(id: string, data: any) {
    // First check if it exists
    await this.getCampaignById(id); 

    return await prisma.campaign.update({
      where: { id },
      data
    });
  }

  // DELETE
  static async deleteCampaign(id: string) {
    await this.getCampaignById(id);
    
    await prisma.task.deleteMany({
      where: { campaignId: id }
    });

    // 2. Now that the children are gone, it is safe to delete the parent campaign
    return await prisma.campaign.delete({
      where: { id }
    });
  }
}