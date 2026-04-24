import { SubmissionStatus } from "@prisma/client";
import bcrypt from 'bcryptjs'
import { prisma } from "../../db/prisma.client";
import { calculateLevelAndTier } from "../../utils/gamification.util";
import { AdminService } from "../admin/admin.service";
import { AiVerificationService } from "../verification/verification.service";
import { TierUtils } from "../../utils/tier.utils";
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
        // NEW: Dynamically count their stats based on your Prisma Schema!
        _count: {
          select: {
            referrals: true, // Counts all users who used this user's referralCode
            submissions: {
              where: {
                // Only count tasks that they actually completed/passed
                status: {
                  in: ["LOCKED_15D", "WITHDRAWABLE", "MANUAL_REVIEW"]
                }
              }
            }
          }
        }
      },
    });

    if (!user) throw new Error("User not found");

    // --- DUAL-TRACK TIER LOGIC ---
    // Safe cast for TierUtils if you typed it to accept the User model
    const isPremium = TierUtils.isPremiumActive(user as any); 
    const freeTier = TierUtils.getFreeTier(user.totalXp);
    const activeTier = isPremium ? user.premiumTier : freeTier;

    // --- XP & LEVEL MATH ---
    // Rule: 1,000 XP = 1 level. Max level = 200 (200,000 XP)
    const maxXp = 200000;
    const cappedXp = Math.min(user.totalXp, maxXp);
    const level = Math.min(200, Math.floor(cappedXp / 1000) + 1);
    
    const nextLevelTotalXp = level * 1000; // e.g., if Level 14, next barrier is 14,000
    const currentLevelProgressPercent = ((cappedXp % 1000) / 1000) * 100;
    const isMaxLevel = cappedXp >= maxXp;

    // --- FRONTEND DISPLAY STRINGS ---
    let xpDisplay = "";
    if (isPremium) {
      // Premium rule: Show total XP only (no denominator)
      xpDisplay = `${user.totalXp.toLocaleString()} XP`;
    } else if (isMaxLevel) {
      xpDisplay = `${maxXp.toLocaleString()} XP (MAX)`;
    } else {
      // Free rule: Show absolute cumulative format (13,500 / 13,999 XP)
      xpDisplay = `${user.totalXp.toLocaleString()} / ${(nextLevelTotalXp - 1).toLocaleString()} XP`;
    }

    return {
      balances: {
        available: user.balanceAvailable,
        pending: user.balancePending,
        locked: user.balanceLocked,
        totalLifetime:
          user.balanceAvailable + user.balancePending + user.balanceLocked,
      },
      // Now injecting the explicit DB counts into the Gamification object
      gamification: {
        totalXp: user.totalXp,
        level: isPremium ? null : level, 
        activeTier, 
        underlyingFreeTier: freeTier, 
        isPremium,
        premiumExpiresAt: user.premiumExpiresAt,
        currentStreak: user.currentStreak,
        xpDisplay,
        progressPercent: isPremium || isMaxLevel ? 100 : currentLevelProgressPercent,
        
        // 🚀 NEW: Exposing the accurate counts to the frontend!
        tasksCompleted: user._count.submissions,
        activeReferrals: user._count.referrals,
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
    // 1. Verify the user exists and is active
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user || !user.isActive) {
      throw new Error("User not found or deactivated.");
    }

    // 2. Cryptographically hash the new password
    const passwordHash = await bcrypt.hash(newPassword, 10);

    // 3. Save the new hash to your Neon Database
    await prisma.user.update({
      where: { id: userId },
      data: { passwordHash },
    });

    return { message: "Password updated successfully." };
  }
static async deleteAccount(userId: string) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new Error("User not found");
    if (!user.isActive) throw new Error("Account is already deleted");

    // The Soft Delete & Anonymize (In Prisma)
    // We scramble their data so they can never log in again, 
    // while keeping their ID intact so foreign keys (Ledger, Submissions) don't break.
    const scrambledStr = `deleted_${Date.now()}`;

    await prisma.user.update({
      where: { id: userId },
      data: {
        isActive: false, // THE SOFT DELETE FLAG
        
        // --- DESTROY LOGIN CAPABILITIES ---
        email: `${scrambledStr}@deleted.com`, 
        passwordHash: null, 
        otpCode: null,
        otpExpiresAt: null,
        
        // --- WIPE PII & FREE UP UNIQUE FIELDS ---
        username: scrambledStr, // Frees up the username for new users
        fullName: "Deleted User", 
        phone: null,
        twitterHandle: null,
        instagramHandle: null,
        telegramHandle: null,
        discordHandle: null,
        
        referralCode: scrambledStr, // Frees up their referral code
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
      select: { totalXp: true, country: true },
    });
    
    if (!user) throw new Error("User not found");

    // 1. Translate raw XP into an array of allowed Campaign Tiers
    // A Silver user should be able to see Silver, Bronze, and Basic campaigns.
    const allowedTiers = ["BASIC"];
    if (user.totalXp >= 1000) allowedTiers.push("BRONZE");
    if (user.totalXp >= 5000) allowedTiers.push("SILVER");
    if (user.totalXp >= 10000) allowedTiers.push("GOLD");

    // 2. Filter Logic
    const campaigns = await prisma.campaign.findMany({
      where: {
        isActive: true,
        
        // Use the new schema field 'requiredFreeTier' and the 'in' operator
        requiredFreeTier: {
          in: allowedTiers as any // Cast to any to avoid strict Enum type clashes if needed, or import your FreeTier enum
        },
        
        // Must match user's country OR be a global campaign (empty array)
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
static async submitTask(userId: string, taskId: string, screenshotUrl: string) {
    // ==========================================
    // PHASE 1: OUTSIDE THE TRANSACTION (Safe to be slow)
    // ==========================================
    
    const settings = await prisma.platformSettings.findFirst() || { referralBonusPercent: 5 };

    // 1. Fetch User
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, referredById: true, fullName: true, totalXp: true, premiumTier: true, premiumExpiresAt: true }
    });
    if (!user) throw new Error("User not found.");

    // 2. Fetch Task & Enforce Campaign Budgets
    const task = await prisma.task.findUnique({
      where: { id: taskId },
      include: { campaign: true }
    });
    if (!task) throw new Error("Task not found.");
    if (task.campaign.totalCompletions >= task.campaign.maxCompletions) {
      throw new Error("This campaign has reached its maximum budget and is closed.");
    }

    // 3. Prevent Double Submissions
    const existing = await prisma.submission.findUnique({
      where: { userId_taskId: { userId, taskId } }
    });
    if (existing) throw new Error("You have already submitted proof for this task.");

    // 4. Run AI Verifier (Takes ~8 seconds, completely safe here outside the transaction)
    const rulesContext = task.requirements || task.description || task.campaign.description;
    const aiResult = await AiVerificationService.analyzeProof(screenshotUrl, rulesContext);

    // 5. Determine Database Status based on AI Score
    let determinedStatus: SubmissionStatus = SubmissionStatus.PENDING_24H;
    if (aiResult.score >= 90) determinedStatus = SubmissionStatus.LOCKED_15D; // Auto-Pass
    else if (aiResult.score >= 70) determinedStatus = SubmissionStatus.MANUAL_REVIEW; // Unsure
    else determinedStatus = SubmissionStatus.REJECTED; // Failed

    // 6. Pre-Calculate Economics
    const baseReward = task.baseRewardSatsOverride || task.campaign.baseRewardSats;
    const rewardMatrix: any = task.tierRewardMatrixOverride || task.campaign.tierRewardMatrix;
    
    const hasPremium = TierUtils.isPremiumActive(user as any);
    const activeTier = hasPremium ? user.premiumTier : TierUtils.getFreeTier(user.totalXp);
    const workerReward = Number(rewardMatrix[activeTier as string]) || baseReward;

    // ==========================================
    // PHASE 2: INSIDE THE TRANSACTION (Lightning Fast < 50ms)
    // ==========================================
    
    return await prisma.$transaction(async (tx) => {
      // Re-verify the budget just in case it filled up while the AI was "thinking"
      const liveCampaign = await tx.campaign.findUnique({ where: { id: task.campaign.id } });
      if (!liveCampaign || liveCampaign.totalCompletions >= liveCampaign.maxCompletions) {
        throw new Error("This campaign filled up while your proof was being verified.");
      }

      // 7. Create the Submission Record
      const submission = await tx.submission.create({
        data: {
          userId,
          taskId,
          screenshotUrl,
          confidenceScore: aiResult.score,
          status: determinedStatus,
          rejectionReason: determinedStatus === SubmissionStatus.REJECTED ? aiResult.reason : null,
          unlockAt: determinedStatus === SubmissionStatus.LOCKED_15D 
            ? new Date(Date.now() + 15 * 24 * 60 * 60 * 1000) 
            : null
        }
      });

      // 8. IF NOT REJECTED: Distribute the Sats
      if (determinedStatus !== SubmissionStatus.REJECTED) {
        
        // --- A. PAY THE WORKER ---
        await tx.user.update({
          where: { id: userId },
          data: { balancePending: { increment: workerReward } }
        });

        await tx.ledger.create({
          data: {
            userId,
            amountSats: workerReward,
            type: 'TASK_REWARD',
            description: `Task: ${liveCampaign.title} (Tier: ${activeTier})`,
            referenceId: submission.id
          }
        });

        // --- B. PAY THE REFERRER ---
        if (user.referredById) {
          const referrer = await tx.user.findUnique({ where: { id: user.referredById } });
          
          if (referrer) {
            const commissionPercent = TierUtils.getReferralCommission(referrer as any, settings.referralBonusPercent);
            const referralBonus = Math.floor(baseReward * (commissionPercent / 100));

            if (referralBonus > 0) {
              await tx.user.update({
                where: { id: referrer.id },
                data: { balancePending: { increment: referralBonus } }
              });

              await tx.ledger.create({
                data: {
                  userId: referrer.id,
                  amountSats: referralBonus,
                  type: 'REFERRAL_BONUS',
                  description: `Commission (${commissionPercent}%) from ${user.fullName || 'referred user'}`,
                  referenceId: submission.id
                }
              });
            }
          }
        }

        // --- C. UPDATE CAMPAIGN STATS ---
        await tx.campaign.update({
          where: { id: liveCampaign.id },
          data: { totalCompletions: { increment: 1 } }
        });
      }

      return submission;
    }, { isolationLevel: 'Serializable' }); 
  }
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
    const settings = await prisma.platformSettings.findFirst() || { referralBonusPercent: 5 };

    return await prisma.$transaction(async (tx) => {
      
      // 1. Fetch User (Needed to calculate their active tier and referrals)
      const user = await tx.user.findUnique({
        where: { id: userId },
        select: { id: true, referredById: true, fullName: true, totalXp: true, premiumTier: true, premiumExpiresAt: true }
      });
      if (!user) throw new Error("User not found.");

      // 2. Fetch Task & Enforce Campaign Budgets
      const task = await tx.task.findUnique({
        where: { id: taskId },
        include: { campaign: true },
      });

      if (!task || task.campaign.category !== "LEARN_EARN") {
        throw new Error("Invalid task or not a quiz module.");
      }
      if (task.campaign.totalCompletions >= task.campaign.maxCompletions) {
        throw new Error("This campaign has reached its maximum budget and is closed.");
      }

      // 3. Prevent Double Submissions early
      const existing = await tx.submission.findUnique({
        where: { userId_taskId: { userId, taskId } },
      });
      if (existing) throw new Error("You already passed this quiz.");

      // 4. Grade the Quiz (Requires Admin to have saved { "correctAnswers": ["A", "C", "B"] } in requirements)
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

      // 5. --- NEW ECONOMICS ENGINE ---
      const baseReward = task.baseRewardSatsOverride || task.campaign.baseRewardSats;
      const rewardMatrix: any = task.tierRewardMatrixOverride || task.campaign.tierRewardMatrix;
      
      // Find out what tier the user is right now
      const hasPremium = TierUtils.isPremiumActive(user as any); // Safe cast for the util
      const activeTier = hasPremium ? user.premiumTier : TierUtils.getFreeTier(user.totalXp);
      
      // Pull their exact explicit reward from the JSON matrix
      const workerReward = Number(rewardMatrix[activeTier as string]) || baseReward;

      // 6. Create the Submission (Bypass 24h AI hold, go straight to 15-day lock)
      const submission = await tx.submission.create({
        data: {
          userId,
          taskId,
          screenshotUrl: "QUIZ_PASSED", // No screenshot needed
          confidenceScore: 100,
          status: SubmissionStatus.LOCKED_15D, 
          unlockAt: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000),
        },
      });

      // 7. A. PAY THE WORKER (To Pending Balance)
      await tx.user.update({
        where: { id: userId },
        data: { balancePending: { increment: workerReward } },
      });

      await tx.ledger.create({
        data: {
          userId,
          amountSats: workerReward,
          type: "TASK_REWARD",
          description: `Passed Quiz: ${task.campaign.title} (Tier: ${activeTier})`,
          referenceId: submission.id,
        },
      });

      // 8. B. PAY THE REFERRER (Anti-Inflation: Based strictly on baseReward)
      if (user.referredById) {
        const referrer = await tx.user.findUnique({ where: { id: user.referredById } });
        
        if (referrer) {
          const commissionPercent = TierUtils.getReferralCommission(referrer as any, settings.referralBonusPercent);
          const referralBonus = Math.floor(baseReward * (commissionPercent / 100));

          if (referralBonus > 0) {
            await tx.user.update({
              where: { id: referrer.id },
              data: { balancePending: { increment: referralBonus } }
            });

            await tx.ledger.create({
              data: {
                userId: referrer.id,
                amountSats: referralBonus,
                type: 'REFERRAL_BONUS',
                description: `Commission (${commissionPercent}%) from ${user.fullName || 'referred user'}'s quiz`,
                referenceId: submission.id
              }
            });
          }
        }
      }

      // 9. C. UPDATE CAMPAIGN STATS
      await tx.campaign.update({
        where: { id: task.campaign.id },
        data: { totalCompletions: { increment: 1 } }
      });

      return { 
        message: "Quiz passed successfully!", 
        earned: workerReward, 
        submissionId: submission.id 
      };
    }, { isolationLevel: 'Serializable' }); // Critical to prevent database race conditions on campaign limits
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
  // **************************************************************
  // --- DAILY QUIZ: USER FLOW ---
  // **************************************************************

  // 1. Fetch Today's Quiz
  static async getTodayQuiz(userId: string) {
    // Standardize "Today" to Midnight UTC to match the Admin's Date selection
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);

    const quiz = await prisma.dailyQuiz.findFirst({
      where: { date: today, isActive: true },
      include: { questions: { orderBy: { order: 'asc' } } }
    });

    if (!quiz) throw new Error("There is no active quiz for today. Check back tomorrow!");

    // Security Check: Did they already take it?
    const existingAttempt = await prisma.quizAttempt.findUnique({
      where: { userId_dailyQuizId: { userId, dailyQuizId: quiz.id } }
    });

    if (existingAttempt) {
      throw new Error(`You already took today's quiz! You scored ${existingAttempt.score}/${quiz.questions.length}.`);
    }

    // SECURITY STRIPPING: Remove the `correctAnswer` before sending to the frontend!
    const safeQuestions = quiz.questions.map(q => ({
      id: q.id,
      questionText: q.questionText,
      options: q.options,
      order: q.order
    }));

    return {
      id: quiz.id,
      title: quiz.title,
      rewardSats: quiz.rewardSats,
      questions: safeQuestions
    };
  }


  // 2. Grade and Reward
static async submitDailyQuiz(userId: string, userAnswers: Array<{ questionId: string, answer: string }>) {
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);

    const quiz = await prisma.dailyQuiz.findFirst({
      where: { date: today, isActive: true },
      include: { questions: true }
    });

    if (!quiz) throw new Error("Quiz not found or has expired.");

    // Prevent double-dipping
    const existingAttempt = await prisma.quizAttempt.findUnique({
      where: { userId_dailyQuizId: { userId, dailyQuizId: quiz.id } }
    });

    if (existingAttempt) throw new Error("You have already submitted answers for today's quiz.");
// --- VALIDATION STRATEGY ---
    if (userAnswers.length !== quiz.questions.length) {
      throw new Error(`You must submit exactly ${quiz.questions.length} answers.`);
    }

    const validQuestionIds = new Set(quiz.questions.map(q => q.id));
    for (const submission of userAnswers) {
      if (!validQuestionIds.has(submission.questionId)) {
        throw new Error(`Invalid Question ID detected: ${submission.questionId}`);
      }
    }
    // --- GRADING LOGIC ---
    let score = 0;
    const totalQuestions = quiz.questions.length;

    // Create a map of correct answers for O(1) fast lookup
    const answerKey = new Map(quiz.questions.map(q => [q.id, q.correctAnswer]));

    for (const submission of userAnswers) {
      const correctAnswer = answerKey.get(submission.questionId);
      if (correctAnswer && correctAnswer === submission.answer) {
        score++;
      }
    }

    // Still track if they got a perfect score for gamification/UI purposes
    const passed = score === totalQuestions; 

    // --- REWARD MATH (Proportional Distribution) ---
    // Example: 10 Max Sats / 3 Questions = 3.333 Sats per correct answer
    const exactEarnedSats = (quiz.rewardSats / totalQuestions) * score;
    
    // We MUST use Math.floor() so Prisma doesn't crash trying to save a decimal into an Int column.
    const finalRewardSats = Math.floor(exactEarnedSats);

    // --- DATABASE TRANSACTION (All or Nothing) ---
    return await prisma.$transaction(async (tx) => {
      // 1. Record the attempt so they can't try again
      const attempt = await tx.quizAttempt.create({
        data: {
          userId,
          dailyQuizId: quiz.id,
          score,
          passed
        }
      });

      // 2. If they got absolutely nothing right, return early without touching balances
      if (finalRewardSats <= 0) {
        return { 
          message: `Oof! You scored ${score}/${totalQuestions} and earned 0 Sats. Study up for tomorrow!`, 
          passed: false, 
          score,
          rewardEarned: 0
        };
      }

      // 3. Pay them the partial (or full) amount instantly!
      await tx.user.update({
        where: { id: userId },
        data: { balanceAvailable: { increment: finalRewardSats } }
      });

      // 4. Log the receipt
      await tx.ledger.create({
        data: {
          userId,
          amountSats: finalRewardSats,
          type: 'DAILY_QUIZ_REWARD',
          description: `Daily Quiz: ${quiz.title} (${score}/${totalQuestions} correct)`,
          referenceId: attempt.id
        }
      });

      // Return dynamic messaging based on performance
      return {
        message: passed 
          ? `Perfect score! You earned the full ${finalRewardSats} Sats.` 
          : `Good job! You got ${score}/${totalQuestions} correct and earned a partial reward of ${finalRewardSats} Sats.`,
        passed,
        score,
        rewardEarned: finalRewardSats
      };
    });
  }
}
