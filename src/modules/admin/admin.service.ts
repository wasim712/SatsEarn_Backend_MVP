import { prisma } from '../../db/prisma.client';
import { TierUtils } from '../../utils/tier.utils';
import {
  DEFAULT_SECURITY_LOCK_DAYS,
  getReferralBonusAmount,
  getSecurityUnlockAt,
} from '../../utils/submission-flow.util';

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
        maxCompletions: data.maxCompletions,
        targetCountries: data.targetCountries || [],
        
        // --- THE NEW ACCESS GATES ---
        isPremiumOnly: data.isPremiumOnly || false,
        requiredFreeTier: data.requiredFreeTier || 'BASIC',
        
        // --- THE NEW ECONOMICS ---
        baseRewardSats: data.baseRewardSats,
        // Prisma accepts standard JS objects for JSON fields
        tierRewardMatrix: data.tierRewardMatrix, 
        
        // This automatically creates 1 default task associated with this campaign
        tasks: {
          create: [
            {
              title: `Complete: ${data.title}`,
              description: data.description,
              targetUrl: data.targetUrl,
              // We leave requirements null so it falls back to the campaign defaults, 
              // but you can inject AI JSON rules here if you pass them!
            }
          ]
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
    const campaign = await prisma.campaign.findUnique({
      where: { id: campaignId }
    });
    if (!campaign) throw new Error("Campaign not found");

    const submissions = await prisma.submission.findMany({
      where: { task: { campaignId: campaignId } },
      select: {
        status: true,
        submittedAt: true,
        user: {
          // UPDATE: Replaced `tier` with the new Dual-Track fields
          select: { country: true, totalXp: true, premiumTier: true, premiumExpiresAt: true }
        }
      }
    });

    const analytics = {
      totalSubmissions: submissions.length,
      statusCounts: { verified: 0, pending: 0, rejected: 0 },
      geographicDistribution: {} as Record<string, number>,
      tierDistribution: {} as Record<string, number>,
      timeOfDayPatterns: {} as Record<string, number> 
    };

    for (const sub of submissions) {
      if (['LOCKED_15D', 'WITHDRAWABLE'].includes(sub.status)) analytics.statusCounts.verified++;
      else if (['PENDING_24H', 'MANUAL_REVIEW'].includes(sub.status)) analytics.statusCounts.pending++;
      else if (sub.status === 'REJECTED') analytics.statusCounts.rejected++;

      const country = sub.user.country || 'Unknown';
      analytics.geographicDistribution[country] = (analytics.geographicDistribution[country] || 0) + 1;

      // UPDATE: Dynamically calculate the tier for the chart
      const hasPremium = TierUtils.isPremiumActive(sub.user as any);
      const activeTier = hasPremium ? sub.user.premiumTier : TierUtils.getFreeTier(sub.user.totalXp);
      
      analytics.tierDistribution[activeTier as string] = (analytics.tierDistribution[activeTier as string] || 0) + 1;

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
    const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } });
    if (!campaign) throw new Error("Campaign not found.");

    // 2. Create the child task
    return await prisma.task.create({
      data: {
        campaignId: campaign.id,
        title: data.title,
        description: data.description,
        targetUrl: data.targetUrl || null,
        
        // 🚀 NEW: Explicitly save the Proof Type!
        proofType: data.proofType || 'SCREENSHOT', 
        
        baseRewardSatsOverride: data.baseRewardSatsOverride || null,
        tierRewardMatrixOverride: data.tierRewardMatrixOverride || null,
        
        // 🚀 TIP: Store the requiredPlatform inside the requirements JSON!
        requirements: {
          ...(data.requirements || {}),
          requiredPlatform: data.requiredPlatform || 'NONE'
        },
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
// UPDATE A TASK
  static async updateTask(campaignId: string, taskId: string, data: any) {
    // Verify it exists and belongs to this campaign before updating
    await this.getTaskById(campaignId, taskId);

    // Destructure ONLY the fields we allow admins to change
    const { 
      title, 
      description, 
      targetUrl, 
      proofType, 
      requiredPlatform, // From frontend
      baseRewardSatsOverride, 
      tierRewardMatrixOverride 
    } = data;

    const safePayload: any = {};
    if (title !== undefined) safePayload.title = title;
    if (description !== undefined) safePayload.description = description;
    if (targetUrl !== undefined) safePayload.targetUrl = targetUrl;
    if (proofType !== undefined) safePayload.proofType = proofType;
    if (baseRewardSatsOverride !== undefined) safePayload.baseRewardSatsOverride = baseRewardSatsOverride;
    if (tierRewardMatrixOverride !== undefined) safePayload.tierRewardMatrixOverride = tierRewardMatrixOverride;
    
    // Safely update the platform inside the JSON if it was provided
    if (requiredPlatform !== undefined) {
      safePayload.requirements = { requiredPlatform };
    }

    return await prisma.task.update({
      where: { id: taskId },
      data: safePayload
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
          data: {} // Prisma uses the @default values from schema.prisma
        });
        console.log("✅ Global Platform Settings initialized with defaults.");
      }

      return settings;
    } catch (error: any) {
      throw new Error(`Failed to fetch gamification settings: ${error.message}`);
    }
  }

  /**
   * Safely updates the global settings while ignoring invalid frontend data.
   */
static async updateGamificationSettings(rawData: any) {
    const settings = await this.getGamificationSettings();

    // Safely extract the new matrix alongside the other numbers
    const {
      welcomeBonusSats, minWithdrawalSats, securityLockDays,
      referralBonusPercent, baseXpPerTask, dailyStreakBonusXp,
      tierReferralMatrix // ⬅️ Extract the new matrix
    } = rawData;

    const safePayload: any = {};
    if (welcomeBonusSats !== undefined) safePayload.welcomeBonusSats = Number(welcomeBonusSats);
    if (minWithdrawalSats !== undefined) safePayload.minWithdrawalSats = Number(minWithdrawalSats);
    if (securityLockDays !== undefined) safePayload.securityLockDays = Number(securityLockDays);
    if (referralBonusPercent !== undefined) safePayload.referralBonusPercent = Number(referralBonusPercent);
    if (baseXpPerTask !== undefined) safePayload.baseXpPerTask = Number(baseXpPerTask);
    if (dailyStreakBonusXp !== undefined) safePayload.dailyStreakBonusXp = Number(dailyStreakBonusXp);
    
    // ⬅️ Add the matrix to the safe payload
    if (tierReferralMatrix !== undefined) safePayload.tierReferralMatrix = tierReferralMatrix;

    return await prisma.platformSettings.update({
      where: { id: settings.id },
      data: safePayload,
    });
  }
  // **************************************************************
  // --- SUBMISSION REVIEW MANAGEMENT ---
  // **************************************************************

static async getPendingSubmissions() {
    const submissions = await prisma.submission.findMany({
      where: { status: 'MANUAL_REVIEW' },
      include: {
        user: { 
          select: { 
            email: true, 
            fullName: true, 
            totalXp: true,
            premiumTier: true,
            premiumExpiresAt: true,
            isActive: true 
          } 
        },
        task: { 
          select: {
            title: true,
            baseRewardSatsOverride: true, // ⬅️ FIXED: Added "base" to match schema
            tierRewardMatrixOverride: true, // It's good to pull this too since the reviewer logic uses it!
            campaign: { 
              select: { title: true, baseRewardSats: true } 
            }
          } 
        }
      },
      orderBy: { submittedAt: 'asc' } 
    });

    // Clean up the data for the Admin UI
    return submissions.map(sub => {
      const hasPremium = TierUtils.isPremiumActive(sub.user as any);
      return {
        ...sub,
        user: {
          ...sub.user,
          activeTier: hasPremium ? sub.user.premiumTier : TierUtils.getFreeTier(sub.user.totalXp),
          isPremium: hasPremium
        }
      };
    });
  }
static async reviewSubmission(submissionId: string, status: 'LOCKED_15D' | 'REJECTED', rejectionReason?: string, adminId?: string) {
    const settings = await prisma.platformSettings.findFirst() || {
      referralBonusPercent: 5,
      securityLockDays: DEFAULT_SECURITY_LOCK_DAYS,
    };

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

      // 2. IF APPROVED: Move it to the security lock and start the 15-day countdown clock
      // (The Sats were already added to balancePending when it was initially submitted)
      if (status === 'LOCKED_15D') {
        return await tx.submission.update({
          where: { id: submissionId },
          data: { 
            status: 'LOCKED_15D',
            unlockAt: getSecurityUnlockAt(settings.securityLockDays),
            reviewedById: adminId 
          }
        });
      }

      // 3. IF REJECTED: We must CLAW BACK the pending funds using the exact Matrix Math
      if (status === 'REJECTED') {
        
        // --- RECONSTRUCT THE ECONOMICS MATH ---
        const baseReward = submission.task.baseRewardSatsOverride || submission.task.campaign.baseRewardSats;
        const rewardMatrix: any = submission.task.tierRewardMatrixOverride || submission.task.campaign.tierRewardMatrix;
        
        const hasPremium = TierUtils.isPremiumActive(submission.user as any);
        const activeTier = hasPremium ? submission.user.premiumTier : TierUtils.getFreeTier(submission.user.totalXp);
        
        const workerReward = Number(rewardMatrix[activeTier as string]) || baseReward;

        // A. Reverse User's Pending Balance
        await tx.user.update({
          where: { id: submission.userId },
          data: { balancePending: { decrement: workerReward } }
        });

        // B. Log the reversal in the Ledger
        await tx.ledger.create({
          data: {
            userId: submission.userId,
            amountSats: -workerReward,
            type: 'PENALTY', // Standardized type for reversals
            description: `Submission Rejected: ${rejectionReason || 'Failed manual review'}`,
            referenceId: submission.id
          }
        });

        // C. Claw back the referral bonus (Anti-Inflation: Based on baseReward)
        if (submission.user.referredById) {
          const referrer = await tx.user.findUnique({ where: { id: submission.user.referredById } });
          
          if (referrer) {
            const commissionPercent = TierUtils.getReferralCommission(referrer as any, settings.referralBonusPercent);
            const referralBonus = getReferralBonusAmount(baseReward, commissionPercent);
            
            if (referralBonus > 0) {
              await tx.user.update({
                where: { id: referrer.id },
                data: { balancePending: { decrement: referralBonus } }
              });
              
              await tx.ledger.create({
                data: {
                  userId: referrer.id,
                  amountSats: -referralBonus,
                  type: 'PENALTY',
                  description: `Referral bonus reversed for rejected task`,
                  referenceId: submission.id
                }
              });
            }
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
    }, { isolationLevel: 'Serializable' }); // Keep it serializable to prevent balance race conditions
  }

// **************************************************************
  // --- WITHDRAWAL (PAYOUT) MANAGEMENT ---
  // **************************************************************

  // 🚀 CHANGED: Renamed and removed the 'PENDING' filter so the Admin UI can see history
  static async getAllWithdrawals() {
    const withdrawals = await prisma.withdrawal.findMany({
      // Removed the where clause to fetch EVERYTHING
      include: {
        user: { 
          select: { 
            email: true, 
            fullName: true, 
            totalXp: true, 
            premiumTier: true, 
            premiumExpiresAt: true 
          } 
        }
      },
      orderBy: { createdAt: 'desc' } // 🚀 CHANGED: 'desc' shows the newest requests at the top
    });

    return withdrawals.map(w => {
      const hasPremium = TierUtils.isPremiumActive(w.user as any);
      return {
        ...w,
        user: {
          ...w.user,
          activeTier: hasPremium ? w.user.premiumTier : TierUtils.getFreeTier(w.user.totalXp)
        }
      };
    });
  }

  static async processWithdrawal(withdrawalId: string, status: 'PAID' | 'REJECTED', paymentProof?: string) {
    // 🚀 CHANGED: Added Serializable isolation to prevent double-refund race conditions
    return await prisma.$transaction(async (tx) => {
      const withdrawal = await tx.withdrawal.findUnique({
        where: { id: withdrawalId }
      });

      if (!withdrawal) throw new Error("Withdrawal request not found");
      if (withdrawal.status !== 'PENDING') throw new Error(`Withdrawal is already ${withdrawal.status}`);

      // 1. IF ADMIN PAID IT: Save the TxHash and mark as PAID
      if (status === 'PAID') {
        if (!paymentProof) throw new Error("Payment proof (TxHash/Preimage) is required when marking as PAID");
        
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

        // Log the refund in the Ledger as a positive income
        await tx.ledger.create({
          data: {
            userId: withdrawal.userId,
            amountSats: withdrawal.amountSats, // Positive amount to refund
            type: 'WITHDRAWAL', 
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
    }, { isolationLevel: 'Serializable' }); 
  }
static async getAllUsers() {
    const users = await prisma.user.findMany({
      select: {
        id: true,
        email: true,
        fullName: true,
        role: true,
        // UPDATE: Removed `tier` and `xp`, added the new ones
        totalXp: true,
        premiumTier: true,
        premiumExpiresAt: true,
        isActive: true,
        balanceAvailable: true,
        balancePending: true,
        balanceLocked: true,
        referralCode: true,
        _count: {
          select: { referrals: true, submissions: true } 
        },
        createdAt: true,
        lastActivityAt: true,
      },
      orderBy: { createdAt: 'desc' }, 
    });

    // Calculate the display data for the Admin Table
    return users.map(user => {
      const isPremium = TierUtils.isPremiumActive(user as any);
      const freeTier = TierUtils.getFreeTier(user.totalXp);
      
      return {
        ...user,
        activeTier: isPremium ? user.premiumTier : freeTier,
        isPremium,
        underlyingFreeTier: freeTier // Helpful for admins to see what tier they drop to if premium expires
      };
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
