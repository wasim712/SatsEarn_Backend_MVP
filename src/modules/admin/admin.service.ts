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
  // --- TASK MANAGEMENT ---
  static async addTaskToCampaign(campaignId: string, data: any) {
    // 1. Ensure the parent campaign exists
    const campaign = await this.getCampaignById(campaignId);

    // 2. Create the child task
    return await prisma.task.create({
      data: {
        campaignId: campaign.id,
        title: data.title,
        description: data.description,
        targetUrl: data.targetUrl,
        // If no specific reward is set for this task, it inherits the campaign's reward (if your schema supports this logic)
      }
    });
  }
  // GET ALL TASKS FOR A CAMPAIGN
  static async getAllTasksForCampaign(campaignId: string) {
    // Verify campaign exists first
    await this.getCampaignById(campaignId); 
    
    return await prisma.task.findMany({
      where: { campaignId },
      orderBy: { createdAt: 'asc' }
    });
  }

  // GET A SINGLE TASK
  static async getTaskById(campaignId: string, taskId: string) {
    const task = await prisma.task.findFirst({
      where: { 
        id: taskId,
        campaignId: campaignId 
      }
    });
    
    if (!task) throw new Error("Task not found in this campaign");
    return task;
  }
  // UPDATE A TASK
  static async updateTask(campaignId: string, taskId: string, data: any) {
    // Verify it exists and belongs to this campaign before updating
    await this.getTaskById(campaignId, taskId);

    return await prisma.task.update({
      where: { id: taskId },
      data
    });
  }

  // DELETE A TASK
  static async deleteTask(campaignId: string, taskId: string) {
    await this.getTaskById(campaignId, taskId);

    // 1. Delete any user submissions attached to this task to prevent foreign key errors
    await prisma.submission.deleteMany({
      where: { taskId: taskId }
    });

    // 2. Safely delete the task
    return await prisma.task.delete({
      where: { id: taskId }
    });
  }
  static async createAnnouncement(data: any) {
    return await prisma.announcement.create({ data });
  }

  static async getAllAnnouncements() {
    return await prisma.announcement.findMany({
      orderBy: { createdAt: 'desc' }
    });
  }

  static async updateAnnouncement(id: string, data: any) {
    return await prisma.announcement.update({
      where: { id },
      data
    });
  }

  static async deleteAnnouncement(id: string) {
    return await prisma.announcement.delete({
      where: { id }
    });
  }
  /**
   * Fetches the global platform settings.
   * If no settings exist (first run), it creates a record with the 
   * default values defined in your Prisma schema.
   */
  static async getGamificationSettings() {
    try {
      // 1. Attempt to find the first (and only) settings record
      let settings = await prisma.platformSettings.findFirst();

      // 2. If it doesn't exist, create it immediately
      if (!settings) {
        settings = await prisma.platformSettings.create({
          data: {} // Prisma will use the @default values from your schema.prisma
        });
        console.log("✅ Global Platform Settings initialized with defaults.");
      }

      return settings;
    } catch (error: any) {
      throw new Error(`Failed to fetch gamification settings: ${error.message}`);
    }
  }

  /**
   * Updates the global settings.
   */
  static async updateGamificationSettings(data: any) {
    const settings = await this.getGamificationSettings();

    return await prisma.platformSettings.update({
      where: { id: settings.id },
      data,
    });
  }
  // **************************************************************
  // --- SUBMISSION REVIEW MANAGEMENT ---
  // **************************************************************

  static async getPendingSubmissions() {
    return await prisma.submission.findMany({
      where: { status: 'MANUAL_REVIEW' },
      include: {
        // Removed trustScore, added isActive to see if the user was soft-deleted
        user: { 
          select: { 
            email: true, 
            fullName: true, 
            tier: true,
            isActive: true 
          } 
        },
        // Included the task override reward in case this specific task pays differently
        task: { 
          select: {
            title: true,
            rewardSatsOverride: true,
            campaign: { 
              select: { title: true, rewardSats: true } 
            }
          } 
        }
      },
      orderBy: { submittedAt: 'asc' } // Review oldest submissions first
    });
  }
  static async reviewSubmission(submissionId: string, status: 'PENDING_24H' | 'REJECTED', rejectionReason?: string, adminId?: string) {
    return await prisma.$transaction(async (tx) => {
      // 1. Fetch submission with relationships
      const submission = await tx.submission.findUnique({
        where: { id: submissionId },
        include: { 
          task: { include: { campaign: true } },
          user: true 
        }
      });

      if (!submission) throw new Error("Submission not found");
      if (submission.status !== 'MANUAL_REVIEW') throw new Error(`Cannot review submission with status: ${submission.status}`);

      // 2. IF APPROVED: Just update the status to move it forward in the pipeline
      // (The Sats were already added to balancePending when it was initially submitted)
      if (status === 'PENDING_24H') {
        return await tx.submission.update({
          where: { id: submissionId },
          data: { 
            status: 'PENDING_24H',
            reviewedById: adminId 
          }
        });
      }

      // 3. IF REJECTED: We must CLAW BACK the pending funds from the worker AND the referrer
      if (status === 'REJECTED') {
        const reward = submission.task.rewardSatsOverride || submission.task.campaign.rewardSats;

        // A. Reverse User's Pending Balance
        await tx.user.update({
          where: { id: submission.userId },
          data: { balancePending: { decrement: reward } }
        });

        // B. Log the reversal in the Ledger
        await tx.ledger.create({
          data: {
            userId: submission.userId,
            amountSats: -reward,
            type: 'PENALTY', // Standardized type for reversals
            description: `Submission Rejected: ${rejectionReason || 'Failed manual review'}`,
            referenceId: submission.id
          }
        });

        // C. Check if we need to claw back a referral bonus
        const settings = await this.getGamificationSettings();
        if (submission.user.referredById) {
          const referralBonus = Math.floor(reward * (settings.referralBonusPercent / 100));
          if (referralBonus > 0) {
            await tx.user.update({
              where: { id: submission.user.referredById },
              data: { balancePending: { decrement: referralBonus } }
            });
            await tx.ledger.create({
              data: {
                userId: submission.user.referredById,
                amountSats: -referralBonus,
                type: 'PENALTY',
                description: `Referral bonus reversed for rejected task`,
                referenceId: submission.id
              }
            });
          }
        }

        // D. Finally, mark the submission as rejected
        return await tx.submission.update({
          where: { id: submissionId },
          data: { 
            status: 'REJECTED', 
            rejectionReason,
            reviewedById: adminId 
          }
        });
      }
    });
  }

  // **************************************************************
  // --- WITHDRAWAL (PAYOUT) MANAGEMENT ---
  // **************************************************************

  static async getPendingWithdrawals() {
    return await prisma.withdrawal.findMany({
      where: { status: 'PENDING' },
      include: {
        user: { select: { email: true, fullName: true, tier: true } }
      },
      orderBy: { createdAt: 'asc' } // Pay the oldest requests first
    });
  }

  static async processWithdrawal(withdrawalId: string, status: 'PAID' | 'REJECTED', paymentProof?: string) {
    return await prisma.$transaction(async (tx) => {
      const withdrawal = await tx.withdrawal.findUnique({
        where: { id: withdrawalId }
      });

      if (!withdrawal) throw new Error("Withdrawal request not found");
      if (withdrawal.status !== 'PENDING') throw new Error(`Withdrawal is already ${withdrawal.status}`);

      // 1. IF ADMIN PAID IT: Save the TxHash and mark as PAID
      if (status === 'PAID') {
        if (!paymentProof) throw new Error("Payment proof (TxHash) is required when marking as PAID");
        
        return await tx.withdrawal.update({
          where: { id: withdrawalId },
          data: { status: 'PAID', paymentProof }
        });
      }

      // 2. IF ADMIN REJECTED IT (e.g., Invalid Wallet ID)
      if (status === 'REJECTED') {
        // We must REFUND the user's available balance since we deducted it when they requested the withdrawal
        await tx.user.update({
          where: { id: withdrawal.userId },
          data: { balanceAvailable: { increment: withdrawal.amountSats } }
        });

        // Log the refund in the Ledger
        await tx.ledger.create({
          data: {
            userId: withdrawal.userId,
            amountSats: withdrawal.amountSats,
            type: 'WITHDRAWAL', // Reversal of withdrawal
            description: `Withdrawal Rejected / Refunded to Available Balance`,
            referenceId: withdrawal.id
          }
        });

        // Update the withdrawal status
        return await tx.withdrawal.update({
          where: { id: withdrawalId },
          data: { status: 'REJECTED' }
        });
      }
    });
  }
  static async getAllUsers() {
    return await prisma.user.findMany({
      select: {
        id: true,
        email: true,
        fullName: true,
        role: true,
        tier: true,
        xp: true,
        isActive: true,
        // Balances
        balanceAvailable: true,
        balancePending: true,
        balanceLocked: true,
        // Referral stats
        referralCode: true,
        _count: {
          select: { referrals: true, submissions: true } // Quick stats for the table
        },
        createdAt: true,
        lastActivityAt: true,
      },
      orderBy: { createdAt: 'desc' }, // Newest users first
    });
  }
  // **************************************************************
  // --- DAILY QUIZ MANAGEMENT ---
  // **************************************************************

  static async createDailyQuiz(data: {
    date: string;
    title: string;
    rewardSats: number;
    questions: Array<{
      questionText: string;
      options: string[];
      correctAnswer: string;
      order: number;
    }>;
  }) {
    const targetDate = new Date(data.date);

    // 1. Check if a quiz already exists for this exact day
    const existingQuiz = await prisma.dailyQuiz.findUnique({
      where: { date: targetDate }
    });

    if (existingQuiz) {
      throw new Error(`A quiz already exists for ${data.date}.`);
    }

    // 2. Nested Create: Saves the Quiz and the Questions together
    const newQuiz = await prisma.dailyQuiz.create({
      data: {
        date: targetDate,
        title: data.title,
        rewardSats: data.rewardSats,
        // The magic Prisma relation create
        questions: {
          create: data.questions.map(q => ({
            questionText: q.questionText,
            options: q.options,
            correctAnswer: q.correctAnswer,
            order: q.order
          }))
        }
      },
      // Return the created questions in the response so we can verify it worked
      include: {
        questions: true 
      }
    });

    return newQuiz;
  }
  // --- GET ALL QUIZZES ---
  static async getAllDailyQuizzes() {
    return await prisma.dailyQuiz.findMany({
      orderBy: { date: 'desc' }, // Newest first
      include: {
        _count: {
          select: { questions: true, attempts: true } // Quick stats for your Admin table
        }
      }
    });
  }

  // --- GET SINGLE QUIZ ---
  static async getDailyQuizById(id: string) {
    const quiz = await prisma.dailyQuiz.findUnique({
      where: { id },
      include: { questions: { orderBy: { order: 'asc' } } }
    });

    if (!quiz) throw new Error("Quiz not found");
    return quiz;
  }

  // --- UPDATE QUIZ DETAILS ---
  static async updateDailyQuiz(id: string, data: { title?: string; rewardSats?: number; isActive?: boolean }) {
    // Check if it exists first
    await this.getDailyQuizById(id); 

    return await prisma.dailyQuiz.update({
      where: { id },
      data
    });
  }

  // --- DELETE QUIZ ---
  static async deleteDailyQuiz(id: string) {
    return await prisma.$transaction(async (tx) => {
      await tx.quizAttempt.deleteMany({ where: { dailyQuizId: id } });
      await tx.dailyQuiz.delete({ where: { id } });

      return { message: "Quiz and all associated data permanently deleted." };
    });
  }
}