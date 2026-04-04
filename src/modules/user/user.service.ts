import { prisma } from "../../db/prisma.client";
import { supabaseAdmin } from "../../external/supabase.admin";
import { supabase } from "../../external/supabase.client";
import { calculateLevelAndTier } from "../../utils/gamification.util";
import { AdminService } from "../admin/admin.service";
export class UserService {
  static async getProfile(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });
    if (!user) throw new Error("User not found");
    return user;
  }
  static async getUserDashboard(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        // Fetch the 5 most recent transactions for their "Recent Activity" feed
        transactions: {
          orderBy: { createdAt: "desc" },
          take: 5,
          select: {
            amountSats: true,
            type: true,
            description: true,
            createdAt: true,
          },
        },
      },
    });

    if (!user) throw new Error("User not found");

    // Calculate dynamic progress
    const { level, tier, progressToNextLevel } = calculateLevelAndTier(user.xp);

    // If their calculated tier is higher than what's in the DB, upgrade them!
    if (user.tier !== tier) {
      await prisma.user.update({
        where: { id: userId },
        data: { tier },
      });
    }

    return {
      balances: {
        available: user.balanceAvailable,
        pending: user.balancePending,
        locked: user.balanceLocked,
        totalLifetime:
          user.balanceAvailable + user.balancePending + user.balanceLocked,
      },
      gamification: {
        xp: user.xp,
        level,
        tier,
        currentStreak: user.currentStreak,
        progressToNextLevel: `${progressToNextLevel}%`,
      },
      recentActivity: user.transactions,
    };
  }

  // ==========================================
  // 👤 PROFILE CRUD OPERATIONS
  // ==========================================

  static async getUserProfile(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        fullName: true,
        email: true,
        phone: true,
        country: true,
        twitterHandle: true,
        instagramHandle: true,
        telegramHandle: true,
        discordHandle: true,
        referralCode: true,
        createdAt: true,
      },
    });
    if (!user) throw new Error("User not found");
    return user;
  }

  static async updateProfile(userId: string, data: any) {
    // Whitelist the fields they are allowed to change
    // We strictly DO NOT allow them to change their balances, XP, or Role here!
    const allowedUpdates = {
      fullName: data.fullName,
      phone: data.phone,
      twitterHandle: data.twitterHandle,
      instagramHandle: data.instagramHandle,
      telegramHandle: data.telegramHandle,
      discordHandle: data.discordHandle,
    };

    // Remove undefined fields so we don't accidentally overwrite existing data with nulls
    const cleanedData = Object.fromEntries(
      Object.entries(allowedUpdates).filter(([_, v]) => v !== undefined),
    );

    return await prisma.user.update({
      where: { id: userId },
      data: cleanedData,
      select: { fullName: true, twitterHandle: true, discordHandle: true }, // Return only what's needed
    });
  }

  // ==========================================
  // 🔒 SECURITY
  // ==========================================

  static async changePassword(userId: string, newPassword: string) {
    // 1. Get the user's Supabase Auth ID
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { supabaseAuthId: true },
    });

    if (!user) throw new Error("User not found");

    // 2. Use the Supabase Admin API to securely force a password change
    const { error } = await supabase.auth.admin.updateUserById(
      user.supabaseAuthId,
      { password: newPassword },
    );

    if (error) throw new Error(`Password update failed: ${error.message}`);

    return { message: "Password updated successfully" };
  }
  static async deleteAccount(userId: string) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new Error("User not found");
    if (!user.isActive) throw new Error("Account is already deleted");

    // 1. Destroy the Login (Hard delete in Supabase Auth)
    // This immediately revokes their tokens and prevents them from ever logging in again.
    const { error } = await supabaseAdmin.auth.admin.deleteUser(
      user.supabaseAuthId,
    );
    if (error && !error.message.includes("not found")) {
      throw new Error(`Auth deletion failed: ${error.message}`);
    }

    // 2. The Soft Delete & Anonymize (In Prisma)
    const scrambledStr = `deleted_${Date.now()}`;

    await prisma.user.update({
      where: { id: userId },
      data: {
        isActive: false, // THE SOFT DELETE FLAG
        email: `${scrambledStr}@deleted.com`, // Wipe PII
        supabaseAuthId: scrambledStr, // Break the auth link permanently
        fullName: "Deleted User", // Wipe PII
        phone: null,
        twitterHandle: null,
        discordHandle: null,
        referralCode: scrambledStr, // Frees up their referral code for someone else
      },
    });

    return {
      message: "Account successfully deactivated and personal data removed.",
    };
  }
  // GET ALL AVAILABLE CAMPAIGNS FOR THE USER
  static async getAvailableCampaigns(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { tier: true, country: true },
    });
    if (!user) throw new Error("User not found");

    // Filter Logic
    const campaigns = await prisma.campaign.findMany({
      where: {
        isActive: true,
        // 1. User must meet the tier requirement
        requiredTier: user.tier,
        // 2. Must match user's country OR be a global campaign (empty array)
        OR: [
          { targetCountries: { has: user.country || "IN" } },
          { targetCountries: { isEmpty: true } },
        ],
      },
      // Include task count so the frontend can say "Contains 3 tasks"
      include: {
        _count: { select: { tasks: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    // 3. Filter out campaigns that have reached their budget cap
    return campaigns.filter((c) => c.totalCompletions < c.maxCompletions);
  }

  // GET SPECIFIC CAMPAIGN DETAILS & ITS TASKS
  static async getCampaignDetails(userId: string, campaignId: string) {
    const campaign = await prisma.campaign.findUnique({
      where: { id: campaignId },
      include: {
        tasks: {
          // Check if the user has already submitted proof for these tasks
          include: {
            submissions: {
              where: { userId: userId },
              select: { status: true, submittedAt: true },
            },
          },
        },
      },
    });

    if (!campaign) throw new Error("Campaign not found");
    if (!campaign.isActive)
      throw new Error("This campaign is no longer active");

    return campaign;
  }
  // static async submitTask(userId: string, taskId: string, screenshotUrl: string) {
  //   const settings = await AdminService.getGamificationSettings();
  //   return await prisma.$transaction(async (tx) => {

  //     // 1. Fetch User (We need to know who referred them for the bonus)
  //     const user = await tx.user.findUnique({
  //       where: { id: userId },
  //       select: { id: true, referredById: true, fullName: true }
  //     });
  //     if (!user) throw new Error("User not found.");

  //     // 2. Fetch Task & Check Campaign Budget Limits
  //     const task = await tx.task.findUnique({
  //       where: { id: taskId },
  //       include: { campaign: true }
  //     });
  //     if (!task) throw new Error("Task not found.");
  //     if (task.campaign.totalCompletions >= task.campaign.maxCompletions) {
  //       throw new Error("This campaign has reached its maximum budget.");
  //     }

  //     // 3. Prevent Double Submissions (Using the unique constraint in the schema)
  //     const existing = await tx.submission.findUnique({
  //       where: { userId_taskId: { userId, taskId } }
  //     });
  //     if (existing) throw new Error("You already submitted proof for this task.");

  //     // 4. Run AI Verifier (The Mock Vision Check)
  //     const aiResult = await AIVerifier.analyzeProof(screenshotUrl);
  //     const determinedStatus = AIVerifier.determineStatus(aiResult.confidenceScore);

  //     // 5. Create the Submission Record
  //     const submission = await tx.submission.create({
  //       data: {
  //         userId,
  //         taskId,
  //         screenshotUrl,
  //         confidenceScore: aiResult.confidenceScore,
  //         status: determinedStatus,
  //         ocrExtractedText: aiResult.extractedText
  //       }
  //     });

  //     // 6. IF APPROVED or FLAGGED FOR REVIEW: Distribute the Sats!
  //     const reward = task.rewardSatsOverride || task.campaign.rewardSats;

  //     if (determinedStatus === 'PENDING_24H' || determinedStatus === 'MANUAL_REVIEW') {

  //       // --- A. PAY THE WORKER ---
  //       await tx.user.update({
  //         where: { id: userId },
  //         data: { balancePending: { increment: reward } }
  //       });

  //       // Write the immutable receipt for the worker
  //       await tx.ledger.create({
  //         data: {
  //           userId,
  //           amountSats: reward,
  //           type: 'TASK_REWARD',
  //           description: `Task Submitted: ${task.campaign.title}`,
  //           referenceId: submission.id
  //         }
  //       });

  //       // --- B. PAY THE REFERRER (The Lifetime Commission) ---
  //       if (user.referredById) {
  //         // Calculate the cut (e.g., 5% of 100 = 5).
  //         // Math.floor prevents fractional Sats from crashing the database.
  //         const referralBonus = Math.floor(reward * (settings.referralBonusPercent / 100));

  //         if (referralBonus > 0) {
  //           await tx.user.update({
  //             where: { id: user.referredById },
  //             data: { balancePending: { increment: referralBonus } }
  //           });

  //           // Write the immutable receipt for the referrer
  //           await tx.ledger.create({
  //             data: {
  //               userId: user.referredById,
  //               amountSats: referralBonus,
  //               type: 'REFERRAL_BONUS',
  //               description: `Commission from ${user.fullName || 'a referred user'}'s task`,
  //               referenceId: submission.id // Links directly to the exact screenshot/task
  //             }
  //           });
  //         }
  //       }

  //       // --- C. UPDATE CAMPAIGN STATS ---
  //       await tx.campaign.update({
  //         where: { id: task.campaign.id },
  //         data: { totalCompletions: { increment: 1 } }
  //       });
  //     }

  //     return submission;
  //   }, { isolationLevel: 'Serializable' });
  // }

  static async getReferralDashboard(userId: string) {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    // 1. Fetch the user's referral code and their downline (people they invited)
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        referralCode: true,
        referrals: {
          select: {
            id: true,
            fullName: true,
            createdAt: true,
            // Fetch their submissions from the last 30 days to calculate "Active" status
            submissions: {
              where: { submittedAt: { gte: thirtyDaysAgo } },
              select: { submittedAt: true },
            },
          },
        },
      },
    });

    if (!user) throw new Error("User not found");

    // 2. Calculate Active vs Inactive Referrals
    let activeCount = 0;
    let inactiveCount = 0;

    const processedReferrals = user.referrals.map((ref) => {
      // Get unique days they were active
      const uniqueActiveDays = new Set(
        ref.submissions.map(
          (sub) => sub.submittedAt.toISOString().split("T")[0],
        ),
      ).size;

      const isActive = uniqueActiveDays >= 10;
      if (isActive) activeCount++;
      else inactiveCount++;

      return {
        id: ref.id,
        name: ref.fullName || "Anonymous User",
        joinedAt: ref.createdAt,
        isActive,
        daysActiveLast30: uniqueActiveDays,
      };
    });

    // 3. Calculate Total Lifetime Earnings from the Ledger
    const earningsAggr = await prisma.ledger.aggregate({
      where: {
        userId: userId,
        type: "REFERRAL_BONUS",
      },
      _sum: { amountSats: true },
    });

    return {
      referralCode: user.referralCode,
      shareUrl: `https://satsearn.com/join?ref=${user.referralCode}`,
      stats: {
        totalInvited: user.referrals.length,
        activeReferrals: activeCount,
        inactiveReferrals: inactiveCount,
        lifetimeEarningsSats: earningsAggr._sum.amountSats || 0,
      },
      referralsList: processedReferrals,
    };
  }
  // **************************************************************
  // --- 3. THE UNLOCK SCHEDULE ---
  // **************************************************************

  static async getUnlockSchedule(userId: string) {
    // Fetch all submissions currently in the 15-day lock
    const lockedSubmissions = await prisma.submission.findMany({
      where: {
        userId,
        status: "LOCKED_15D",
        unlockAt: { not: null }, // Safety check
      },
      select: {
        id: true,
        unlockAt: true,
        task: {
          select: {
            title: true,
            rewardSatsOverride: true,
            campaign: { select: { title: true, rewardSats: true } },
          },
        },
      },
      orderBy: { unlockAt: "asc" }, // Soonest unlocks at the top
    });

    // Format the response for the frontend timeline
    const timeline = lockedSubmissions.map((sub) => ({
      id: sub.id,
      taskName: sub.task.title || sub.task.campaign.title,
      amountSats: sub.task.rewardSatsOverride || sub.task.campaign.rewardSats,
      unlocksOn: sub.unlockAt,
      daysRemaining: Math.ceil(
        (sub.unlockAt!.getTime() - Date.now()) / (1000 * 60 * 60 * 24),
      ),
    }));

    // Calculate total locked value
    const totalLockedSats = timeline.reduce(
      (sum, item) => sum + item.amountSats,
      0,
    );

    return { totalLockedSats, timeline };
  }
  // **************************************************************
  // --- 5. LEARN & EARN: QUIZ VALIDATOR ---
  // **************************************************************

  static async submitQuizTask(
    userId: string,
    taskId: string,
    userAnswers: string[],
  ) {
    return await prisma.$transaction(async (tx) => {
      const task = await tx.task.findUnique({
        where: { id: taskId },
        include: { campaign: true },
      });

      if (!task || task.campaign.category !== "LEARN_EARN") {
        throw new Error("Invalid task or not a quiz module.");
      }

      // 1. Grade the Quiz (Requires the Admin to have saved { "answers": ["A", "C", "B"] } in the task.requirements JSON)
      const rules = task.requirements as any;
      if (!rules || !rules.correctAnswers)
        throw new Error("Quiz answers not configured by admin.");

      const correctAnswers: string[] = rules.correctAnswers;

      let score = 0;
      userAnswers.forEach((ans, index) => {
        if (ans === correctAnswers[index]) score++;
      });

      const passed = score === correctAnswers.length; // Must get 100% to earn

      if (!passed) {
        throw new Error(
          `Quiz failed. You got ${score} out of ${correctAnswers.length} correct. Try again!`,
        );
      }

      // 2. If Passed, Create the Submission and bypass the 24h AI hold (since it's a math/quiz verification)
      const existing = await tx.submission.findUnique({
        where: { userId_taskId: { userId, taskId } },
      });
      if (existing) throw new Error("You already passed this quiz.");

      const reward = task.rewardSatsOverride || task.campaign.rewardSats;

      const submission = await tx.submission.create({
        data: {
          userId,
          taskId,
          screenshotUrl: "QUIZ_PASSED", // No screenshot needed
          confidenceScore: 100,
          status: "LOCKED_15D", // Straight to 15-day security hold
          unlockAt: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000),
        },
      });

      // 3. Update pending balance & Ledger (Referencing the logic we already built)
      await tx.user.update({
        where: { id: userId },
        data: { balancePending: { increment: reward } },
      });

      await tx.ledger.create({
        data: {
          userId,
          amountSats: reward,
          type: "TASK_REWARD",
          description: `Passed Quiz: ${task.campaign.title}`,
          referenceId: submission.id,
        },
      });

      // Note: You would also call the 5% Referral logic here if you want it to apply to quizzes!

      return { message: "Quiz passed successfully!", earned: reward };
    });
  }
  // **************************************************************
  // --- STREAK ENGINE & CLAIMS ---
  // **************************************************************

  static async claimStreakBonus(userId: string) {
    return await prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({
        where: { id: userId },
        select: { id: true, currentStreak: true, lastActivityAt: true },
      });

      if (!user) throw new Error("User not found");

      // 1. Define the Milestone Rules
      const streakBonuses: Record<number, number> = {
        7: 70,
        21: 210,
        60: 600,
        90: 900,
        180: 1800,
        365: 3650,
      };

      const rewardSats = streakBonuses[user.currentStreak];

      if (!rewardSats) {
        throw new Error(
          `You are on a ${user.currentStreak}-day streak. Next milestone is not reached yet!`,
        );
      }

      // 2. Prevent Double Claiming
      // We check the ledger to see if they already claimed a STREAK_BONUS for this specific streak number
      const alreadyClaimed = await tx.ledger.findFirst({
        where: {
          userId,
          type: "WELCOME_BONUS", // Or create a 'STREAK_BONUS' type in your Prisma Enum
          description: { contains: `${user.currentStreak}-Day Streak` },
        },
      });

      if (alreadyClaimed) {
        throw new Error(
          `You have already claimed your ${user.currentStreak}-day milestone bonus.`,
        );
      }

      // 3. Award the Sats directly to Available Balance (Instant gratification!)
      await tx.user.update({
        where: { id: userId },
        data: { balanceAvailable: { increment: rewardSats } },
      });

      // 4. Log the receipt
      const ledgerEntry = await tx.ledger.create({
        data: {
          userId,
          amountSats: rewardSats,
          type: "WELCOME_BONUS", // Treat it like a bonus
          description: `${user.currentStreak}-Day Streak Milestone Reached!`,
        },
      });

      return {
        message: `Awesome! You claimed ${rewardSats} Sats for your ${user.currentStreak}-day streak.`,
        rewardSats,
        ledgerEntry,
      };
    });
  }
  // **************************************************************
  // --- TASK FLOW: START TASK ---
  // **************************************************************

  static async startTaskFlow(userId: string, taskId: string) {
    const task = await prisma.task.findUnique({
      where: { id: taskId },
      include: { campaign: true }
    });

    if (!task) throw new Error("Task not found.");
    if (!task.campaign.isActive) throw new Error("This campaign has ended.");
    
    // Check if the budget is already exhausted
    if (task.campaign.totalCompletions >= task.campaign.maxCompletions) {
      throw new Error("Sorry, this campaign has reached its maximum budget. No more spots available.");
    }

    // Check if the user already submitted this
    const existingSubmission = await prisma.submission.findUnique({
      where: { userId_taskId: { userId, taskId } }
    });

    if (existingSubmission) {
      throw new Error("You have already completed this task.");
    }

    // Return the specific category instructions so the frontend knows what UI to show
    let actionType = "UPLOAD_SCREENSHOT";
    if (task.campaign.category === 'LEARN_EARN') actionType = "TAKE_QUIZ";
    if (task.campaign.category === 'OFFERWALL') actionType = "EXTERNAL_REDIRECT";

    return {
      message: "You can now start this task!",
      actionType,
      targetUrl: task.targetUrl || task.campaign.targetUrl,
      instructions: task.description || task.campaign.description
    };
  }
}
