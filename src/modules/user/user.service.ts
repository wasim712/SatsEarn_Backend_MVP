import { prisma } from '../../db/prisma.client';
import { computeUserBalances } from '../../utils/balance.util';
import { NotificationService } from '../notifications/notification.service';
import { TierUtils } from '../../utils/tier.utils';
import { evaluateDailyActivityStreak, getNextStreakMilestone, getStreakMilestoneReward, getStreakMilestones } from '../../utils/reward.util';
import { UserAccountService } from './services/user-account.service';
import { UserCampaignService } from './services/user-campaign.service';
import { UserContentService } from './services/user-content.service';
import { UserQuizService } from './services/user-quiz.service';
import { UserLeaderboardService } from './services/user-leaderboard.service';
import { UserReferralService } from './services/user-referral.service';
import { UserSubmissionService } from './services/user-submission.service';
import { UserWithdrawalService } from './services/user-withdrawal.service';
import { UserBugReportService } from './services/user-bug-report.service';
import { StandaloneUserService } from '../standalone/standalone-user.service';
import { getCheatUserEmail } from '../../utils/cheat-user.util';

// SAT-WORM XP is client-reported, so claims are capped server-side: at most 5 per UTC day
// (25 XP) with a minute between them. XP drives the free tier, which drives task payouts.
const SAT_WORM_DAILY_CLAIM_LIMIT = 5;
const SAT_WORM_CLAIM_COOLDOWN_MS = 60 * 1000;

export class UserService {
  static async claimSatWormReward(userId: string, payload: {
    score: number;
    satsEarned: number;
    xpEarned: number;
    foodEaten?: number;
    elapsed?: number;
    restartCount?: number;
    violationCount?: number;
    reviveUsed?: boolean;
    bestScore?: number;
  }) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true },
    });

    if (!user) {
      throw new Error('User not found.');
    }

    const safeScore = Math.max(0, Math.min(payload.score || 0, 5000));
    const safeXp = Math.max(0, Math.min(payload.xpEarned || 0, 5));
    const violationCount = Math.max(0, payload.violationCount || 0);
    const elapsed = Math.max(0, payload.elapsed || 0);

    if (safeXp <= 0) {
      return {
        message: 'No XP earned this round.',
        reward: { satsEarned: 0, xpEarned: 0 },
      };
    }

    if (violationCount > 0) {
      throw new Error('This game run was rejected due to validation checks.');
    }

    if (elapsed > 0 && elapsed < 5000 && safeScore > 5) {
      throw new Error('This game run was too short to claim rewards.');
    }

    const cappedXp = 5;
    const description = `SAT-WORM XP reward - Score ${safeScore}${payload.bestScore ? ` - Best ${payload.bestScore}` : ''}`;

    try {
      // Serializable so parallel claims can't all pass the daily-cap and cooldown checks.
      await prisma.$transaction(async (tx) => {
        const dayStart = new Date();
        dayStart.setUTCHours(0, 0, 0, 0);

        const claimsToday = await tx.ledger.findMany({
          where: { userId, type: 'MINIGAME_XP_REWARD', createdAt: { gte: dayStart } },
          select: { createdAt: true },
          orderBy: { createdAt: 'desc' },
        });

        if (claimsToday.length >= SAT_WORM_DAILY_CLAIM_LIMIT) {
          throw new Error(`You've reached today's SAT-WORM XP limit (${SAT_WORM_DAILY_CLAIM_LIMIT * cappedXp} XP). Come back tomorrow!`);
        }

        if (claimsToday[0] && Date.now() - claimsToday[0].createdAt.getTime() < SAT_WORM_CLAIM_COOLDOWN_MS) {
          throw new Error('Please wait a minute before claiming SAT-WORM XP again.');
        }

        await tx.user.update({
          where: { id: userId },
          data: {
            totalXp: { increment: cappedXp },
          },
        });

        await tx.ledger.create({
          data: {
            userId,
            amountSats: 0,
            amountMsats: 0,
            type: 'MINIGAME_XP_REWARD',
            description,
            referenceId: null,
          },
        });
      }, { isolationLevel: 'Serializable' });
    } catch (error: any) {
      if (error?.code === 'P2034') {
        throw new Error('Please wait a minute before claiming SAT-WORM XP again.');
      }
      throw error;
    }

    await NotificationService.notifyUser(
      userId,
      'SAT-WORM XP claimed',
      `You earned ${cappedXp} XP from SAT-WORM. Score: ${safeScore}.`,
      'SYSTEM_ALERT'
    );

    return {
      message: 'SAT-WORM XP added successfully.',
      reward: {
        satsEarned: 0,
        xpEarned: cappedXp,
      },
    };
  }

  static async registerPremiumInterest(userId: string, data: {
    plan: 'PLATINUM' | 'DIAMOND' | 'CROWN' | 'ELITE' | 'FOUNDER';
    intent: 'NOTIFY_ME' | 'UPGRADE';
    source?: string;
  }) {
    return await UserAccountService.registerPremiumInterest(userId, data);
  }
  static async getPremiumRequests(userId: string) {
    return await UserAccountService.getPremiumRequests(userId);
  }

  static async getTaskStatus(userId: string, taskId: string) {
    return await UserSubmissionService.getTaskStatus(userId, taskId);
  }

  static async getStandaloneTaskStatus(userId: string, taskId: string) {
    return await StandaloneUserService.getTaskStatus(userId, taskId);
  }

  static async getProfile(userId: string) {
    return await UserAccountService.getProfile(userId);
  }

  static async completeOnboarding(userId: string) {
    return await UserAccountService.completeOnboarding(userId);
  }

  static async skipOnboarding(userId: string) {
    return await UserAccountService.skipOnboarding(userId);
  }

  static async getUserDashboard(userId: string) {
    const platformSettings = await prisma.platformSettings.findFirst({
      select: { btcPriceUsd: true },
    });

    const unlockedReferralLedgers = await prisma.ledger.findMany({
      where: {
        userId,
        type: 'REFERRAL_BONUS',
        OR: [
          { referenceId: null },
          { referenceId: { not: null } },
        ],
      },
      select: { referenceId: true, amountMsats: true, amountSats: true },
    });

    const referenceIds = unlockedReferralLedgers
      .map((entry) => entry.referenceId)
      .filter((value): value is string => Boolean(value));

    const [campaignSubmissions, standaloneSubmissions] = await Promise.all([
      referenceIds.length
        ? prisma.submission.findMany({
            where: { id: { in: referenceIds }, status: 'WITHDRAWABLE' },
            select: { id: true },
          })
        : Promise.resolve([]),
      referenceIds.length
        ? prisma.standaloneSubmission.findMany({
            where: { id: { in: referenceIds }, status: 'WITHDRAWABLE' },
            select: { id: true },
          })
        : Promise.resolve([]),
    ]);

    const unlockedReferenceIds = new Set([
      ...campaignSubmissions.map((entry) => entry.id),
      ...standaloneSubmissions.map((entry) => entry.id),
    ]);

    const availableReferralMsats = unlockedReferralLedgers.reduce((sum, entry) => {
      if (!entry.referenceId || unlockedReferenceIds.has(entry.referenceId)) {
        return sum + (entry.amountMsats ?? entry.amountSats * 1000);
      }

      return sum;
    }, 0);

    const wholeAvailableReferralSats = unlockedReferralLedgers.reduce((sum, entry) => {
      if (!entry.referenceId || unlockedReferenceIds.has(entry.referenceId)) {
        return sum + entry.amountSats;
      }

      return sum;
    }, 0);

    const availableReferralRemainderMsats = Math.max(0, availableReferralMsats - wholeAvailableReferralSats * 1000);

    // Sum only positive (income) ledger entries to get true lifetime earned sats.
    // This value never decreases even when sats are spent on subscriptions or withdrawn.
    const lifetimeLedgerAggregate = await prisma.ledger.aggregate({
      where: {
        userId,
        amountSats: { gt: 0 },
      },
      _sum: { amountSats: true },
    });
    const totalLifetimeSats = lifetimeLedgerAggregate._sum.amountSats ?? 0;

    const [user, recentStandaloneSubmissions] = await Promise.all([
      prisma.user.findUnique({
        where: { id: userId },
        include: {
          submissions: {
            orderBy: { submittedAt: 'desc' },
            take: 5,
            select: {
              id: true,
              status: true,
              rejectionReason: true,
              submittedAt: true,
              unlockAt: true,
              userId: true,
              task: {
                select: {
                  title: true,
                  tierRewardMatrixOverride: true,
                  campaign: {
                    select: {
                      title: true,
                      tierRewardMatrix: true,
                    },
                  },
                },
              },
            },
          },
          transactions: {
            orderBy: { createdAt: 'desc' },
            take: 5,
            select: {
              amountSats: true,
              amountMsats: true,
              type: true,
              description: true,
              createdAt: true,
            },
          },
          _count: {
            select: {
              referrals: true,
              submissions: {
                where: {
                  status: {
                    in: ['LOCKED_15D', 'WITHDRAWABLE', 'MANUAL_REVIEW'],
                  },
                },
              },
            },
          },
        },
      }),
      prisma.standaloneSubmission.findMany({
        where: { userId },
        orderBy: { submittedAt: 'desc' },
        take: 5,
        select: {
          id: true,
          status: true,
          rejectionReason: true,
          submittedAt: true,
          unlockAt: true,
          userId: true,
          standaloneTask: {
            select: { title: true, tierRewardMatrix: true },
          },
        },
      }),
    ]);

    if (!user) throw new Error('User not found');

    const streakEvaluation = evaluateDailyActivityStreak(user.lastActivityAt, user.currentStreak, new Date(), user.timezone);

    if (streakEvaluation.reset && user.currentStreak !== 0) {
      await prisma.user.update({
        where: { id: userId },
        data: { currentStreak: 0 },
      });
      user.currentStreak = 0;
    }

    const activePremiumTier = TierUtils.getCurrentPremiumTier(user as any);
    const isPremium = Boolean(activePremiumTier);
    const freeTier = TierUtils.getFreeTier(user.totalXp);
    const activeTier = activePremiumTier || freeTier;

    const maxXp = 200000;
    const cappedXp = Math.min(user.totalXp, maxXp);
    const level = Math.min(200, Math.floor(cappedXp / 1000) + 1);
    const nextLevelTotalXp = level * 1000;
    const tierThresholds = [
      { tier: 'BASIC', xp: 0 },
      { tier: 'COPPER', xp: 10000 },
      { tier: 'BRONZE', xp: 50000 },
      { tier: 'SILVER', xp: 100000 },
      { tier: 'GOLD', xp: 150000 },
    ];
    const currentTierIndex = tierThresholds.findIndex((entry) => entry.tier === freeTier);
    const nextTierEntry = currentTierIndex >= 0 && currentTierIndex < tierThresholds.length - 1 ? tierThresholds[currentTierIndex + 1] : null;
    const xpToNextTier = nextTierEntry ? Math.max(nextTierEntry.xp - user.totalXp, 0) : 0;
    const currentLevelProgressPercent = ((cappedXp % 1000) / 1000) * 100;
    const isMaxLevel = cappedXp >= maxXp;

    let xpDisplay = '';
    if (isMaxLevel) xpDisplay = `${maxXp.toLocaleString()} XP (MAX)`;
    else xpDisplay = `${user.totalXp.toLocaleString()} / ${nextLevelTotalXp.toLocaleString()} XP`;

    const streakMilestones = getStreakMilestones();
    const lastClaimedStreakMilestone = user.lastClaimedStreakMilestone || 0;
    const nextStreakMilestone = getNextStreakMilestone(lastClaimedStreakMilestone);
    const nextStreakRewardSats = nextStreakMilestone ? getStreakMilestoneReward(nextStreakMilestone) : 0;
    const claimedMilestones = streakMilestones.filter((milestone) => milestone.days <= lastClaimedStreakMilestone);
    const progressPercent = nextStreakMilestone
      ? Math.min((Math.max(user.currentStreak, 0) / nextStreakMilestone) * 100, 100)
      : 100;
    const daysRemaining = nextStreakMilestone ? Math.max(nextStreakMilestone - user.currentStreak, 0) : 0;

    const cheatUserEmail = getCheatUserEmail();
    const isCheatDisplayAccount =
      Boolean(cheatUserEmail) && typeof user.email === 'string' && user.email.toLowerCase() === cheatUserEmail;

    // Compute TRUE balances from the ledger — single source of truth,
    // except for the dedicated cheat account where we intentionally surface
    // raw cached balances so admin cheat edits are reflected in the UI.
    const computedBalances = isCheatDisplayAccount
      ? {
          available: Math.max(0, user.balanceAvailable || 0),
          pending: Math.max(0, user.balancePending || 0),
          locked: Math.max(0, user.balanceLocked || 0),
        }
      : await computeUserBalances(userId);

    return {
      balances: {
        available: computedBalances.available,
        availableMsats: availableReferralRemainderMsats,
        pending: computedBalances.pending,
        pendingMsats: Math.max(0, user.referralPendingMsats || 0),
        locked: computedBalances.locked,
        totalLifetime: totalLifetimeSats,
        btcPriceUsd: platformSettings?.btcPriceUsd || 90000,
      },
      gamification: {
        totalXp: user.totalXp,
        level,
        activeTier,
        underlyingFreeTier: freeTier,
        isPremium,
        premiumExpiresAt: user.premiumExpiresAt,
        currentStreak: user.currentStreak,
        lastClaimedStreakMilestone,
        streak: {
          currentStreak: user.currentStreak,
          lastClaimedMilestone: lastClaimedStreakMilestone,
          nextMilestone: nextStreakMilestone,
          nextRewardSats: nextStreakRewardSats,
          daysRemaining,
          progressPercent,
          totalMilestones: streakMilestones.length,
          claimedMilestonesCount: claimedMilestones.length,
          milestones: streakMilestones.map((milestone) => ({
            days: milestone.days,
            rewardSats: milestone.rewardSats,
            claimed: milestone.days <= lastClaimedStreakMilestone,
            reachedInCurrentRun: milestone.days > lastClaimedStreakMilestone && user.currentStreak >= milestone.days,
            isNext: nextStreakMilestone === milestone.days,
          })),
        },
        xpDisplay,
        progressPercent: isMaxLevel ? 100 : currentLevelProgressPercent,
        tasksCompleted: user._count.submissions,
        activeReferrals: user._count.referrals,
        nextTier: nextTierEntry?.tier || null,
        xpToNextTier,
      },
      recentActivity: user.transactions,
      recentSubmissions: await (async () => {
        // Helper: resolve expected reward from tier matrix when no ledger entry exists yet
        const resolveRewardSats = (ledgerAmountSats: number | undefined, tierMatrix: Record<string, number>) => {
          if (ledgerAmountSats !== undefined && ledgerAmountSats > 0) return ledgerAmountSats;
          return Number(tierMatrix[String(activeTier || 'BASIC')] || 0);
        };

        // Build campaign submission entries
        const campaignEntries = await Promise.all(
          user.submissions.map(async (submission) => {
            const ledgerEntry = await prisma.ledger.findFirst({
              where: {
                referenceId: submission.id,
                userId: submission.userId,
                type: 'TASK_REWARD',
              },
              orderBy: { createdAt: 'desc' },
              select: { amountSats: true },
            });

            const overrideMatrix = (submission.task.tierRewardMatrixOverride || {}) as Record<string, number>;
            const campaignMatrix = (submission.task.campaign.tierRewardMatrix || {}) as Record<string, number>;
            const tierKey = String(activeTier || 'BASIC');
            const expectedReward = Number(overrideMatrix[tierKey] || campaignMatrix[tierKey] || 0);
            const rewardSats = ledgerEntry?.amountSats || expectedReward;

            return {
              id: submission.id,
              taskTitle: submission.task.title,
              campaignTitle: submission.task.campaign.title,
              isStandalone: false,
              status: submission.status,
              rejectionReason: submission.rejectionReason,
              submittedAt: submission.submittedAt,
              unlockAt: submission.unlockAt,
              creditedAt: submission.status === 'WITHDRAWABLE' ? submission.unlockAt : null,
              rewardSats,
              remainingMs: submission.unlockAt ? Math.max(new Date(submission.unlockAt).getTime() - Date.now(), 0) : 0,
            };
          }),
        );

        // Build standalone submission entries
        const standaloneEntries = await Promise.all(
          recentStandaloneSubmissions.map(async (submission) => {
            const ledgerEntry = await prisma.ledger.findFirst({
              where: {
                referenceId: submission.id,
                userId: submission.userId,
                type: 'TASK_REWARD',
              },
              orderBy: { createdAt: 'desc' },
              select: { amountSats: true },
            });

            const standaloneMatrix = (submission.standaloneTask.tierRewardMatrix || {}) as Record<string, number>;
            const tierKey = String(activeTier || 'BASIC');
            const expectedReward = Number(standaloneMatrix[tierKey] || 0);
            const rewardSats = ledgerEntry?.amountSats || expectedReward;

            return {
              id: submission.id,
              taskTitle: submission.standaloneTask.title,
              campaignTitle: 'Standalone Task',
              isStandalone: true,
              status: submission.status,
              rejectionReason: submission.rejectionReason,
              submittedAt: submission.submittedAt,
              unlockAt: submission.unlockAt,
              creditedAt: submission.status === 'WITHDRAWABLE' ? submission.unlockAt : null,
              rewardSats,
              remainingMs: submission.unlockAt ? Math.max(new Date(submission.unlockAt).getTime() - Date.now(), 0) : 0,
            };
          }),
        );

        // Merge, sort by newest first, take top 5
        return [...campaignEntries, ...standaloneEntries]
          .sort((a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime())
          .slice(0, 5);
      })(),
    };
  }

  static async getLeaderboard() {
    return await UserLeaderboardService.getLeaderboard();
  }

  static async getUserProfile(userId: string) {
    return await UserAccountService.getUserProfile(userId);
  }

  static async upgradePremiumUsingSats(userId: string, data: {
    plan: 'PLATINUM' | 'DIAMOND' | 'CROWN' | 'ELITE' | 'FOUNDER';
    billingCycle: 'MONTHLY' | 'YEARLY';
  }) {
    return await UserAccountService.upgradePremiumUsingSats(userId, data as any);
  }

  static async updateProfile(userId: string, data: any) {
    return await UserAccountService.updateProfile(userId, data);
  }

  static async changePassword(userId: string, currentPassword: string, newPassword: string) {
    return await UserAccountService.changePassword(userId, currentPassword, newPassword);
  }

  static async deleteAccount(userId: string) {
    return await UserAccountService.deleteAccount(userId);
  }

  static async getAvailableCampaigns(userId: string) {
    return await UserCampaignService.getAvailableCampaigns(userId);
  }

  static async getStandaloneTasks(userId: string) {
    return await StandaloneUserService.getTasks(userId);
  }

  static async getCampaignDetails(userId: string, campaignId: string) {
    return await UserCampaignService.getCampaignDetails(userId, campaignId);
  }

  static async getStandaloneTaskDetails(userId: string, taskId: string) {
    return await StandaloneUserService.getTaskDetails(userId, taskId);
  }

  static async submitTask(userId: string, taskId: string, proofData: { screenshotUrl?: string; proofText?: string; imageHash?: string | null }, clientIp: string = 'UNKNOWN') {
    return await UserSubmissionService.submitTask(userId, taskId, proofData, clientIp);
  }

  static async submitStandaloneTask(userId: string, taskId: string, proofData: { screenshotUrl?: string; proofText?: string; imageHash?: string | null }, clientIp: string = 'UNKNOWN') {
    return await StandaloneUserService.submitTask(userId, taskId, proofData, clientIp);
  }

  static async getReferralDashboard(userId: string) {
    return await UserReferralService.getReferralDashboard(userId);
  }

  static async getUnlockSchedule(userId: string) {
    return await UserReferralService.getUnlockSchedule(userId);
  }

  static async getSubmissionHistory(userId: string) {
    const [submissions, standaloneSubmissions, historyUser] = await Promise.all([
      prisma.submission.findMany({
        where: { userId },
        include: {
          task: {
            include: {
              campaign: true,
            },
          },
        },
        orderBy: { submittedAt: 'desc' },
      }),
      prisma.standaloneSubmission.findMany({
        where: { userId },
        include: {
          standaloneTask: {
            select: { title: true, tierRewardMatrix: true },
          },
        },
        orderBy: { submittedAt: 'desc' },
      }),
      prisma.user.findUnique({
        where: { id: userId },
        select: { totalXp: true, premiumTier: true, premiumExpiresAt: true },
      }),
    ]);

    const historyActiveTier = historyUser
      ? (TierUtils.getCurrentPremiumTier(historyUser as any) || TierUtils.getFreeTier(historyUser.totalXp))
      : 'BASIC';
    const historyTierKey = String(historyActiveTier || 'BASIC');

    const campaignEntries = await Promise.all(
      submissions.map(async (submission) => {
        const ledgerEntry = await prisma.ledger.findFirst({
          where: {
            referenceId: submission.id,
            userId,
            type: 'TASK_REWARD',
          },
          orderBy: { createdAt: 'desc' },
          select: { amountSats: true, amountMsats: true },
        });

        const overrideMatrix = (submission.task.tierRewardMatrixOverride || {}) as Record<string, number>;
        const campaignMatrix = (submission.task.campaign.tierRewardMatrix || {}) as Record<string, number>;
        const expectedReward = Number(overrideMatrix[historyTierKey] || campaignMatrix[historyTierKey] || 0);
        const ledgerSats = ledgerEntry ? ((ledgerEntry.amountMsats ?? ledgerEntry.amountSats * 1000) / 1000) : 0;
        const rewardSats = ledgerSats > 0 ? ledgerSats : expectedReward;

        return {
          id: submission.id,
          taskTitle: submission.task.title,
          campaignTitle: submission.task.campaign.title,
          isStandalone: false,
          status: submission.status,
          rejectionReason: submission.rejectionReason,
          submittedAt: submission.submittedAt,
          unlockAt: submission.unlockAt,
          creditedAt: submission.status === 'WITHDRAWABLE' ? submission.unlockAt : null,
          rewardSats,
          remainingMs: submission.unlockAt ? Math.max(new Date(submission.unlockAt).getTime() - Date.now(), 0) : 0,
        };
      }),
    );

    const standaloneEntries = await Promise.all(
      standaloneSubmissions.map(async (submission) => {
        const ledgerEntry = await prisma.ledger.findFirst({
          where: {
            referenceId: submission.id,
            userId,
            type: 'TASK_REWARD',
          },
          orderBy: { createdAt: 'desc' },
          select: { amountSats: true, amountMsats: true },
        });

        const standaloneMatrix = (submission.standaloneTask.tierRewardMatrix || {}) as Record<string, number>;
        const expectedReward = Number(standaloneMatrix[historyTierKey] || 0);
        const ledgerSats = ledgerEntry ? ((ledgerEntry.amountMsats ?? ledgerEntry.amountSats * 1000) / 1000) : 0;
        const rewardSats = ledgerSats > 0 ? ledgerSats : expectedReward;

        return {
          id: submission.id,
          taskTitle: submission.standaloneTask.title,
          campaignTitle: 'Standalone Task',
          isStandalone: true,
          status: submission.status,
          rejectionReason: submission.rejectionReason,
          submittedAt: submission.submittedAt,
          unlockAt: submission.unlockAt,
          creditedAt: submission.status === 'WITHDRAWABLE' ? submission.unlockAt : null,
          rewardSats,
          remainingMs: submission.unlockAt ? Math.max(new Date(submission.unlockAt).getTime() - Date.now(), 0) : 0,
        };
      }),
    );

    return [...campaignEntries, ...standaloneEntries]
      .sort((a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime());
  }

  static async submitQuizTask(userId: string, taskId: string, answers: string[]) {
    return await UserQuizService.submitQuizTask(userId, taskId, answers);
  }

  static async claimStreakBonus(userId: string) {
    return await UserQuizService.claimStreakBonus(userId);
  }

  static async startTaskFlow(userId: string, taskId: string) {
    return await UserQuizService.startTaskFlow(userId, taskId);
  }

  static async getTodayQuiz(userId: string, dateKey?: string) {
    return await UserQuizService.getTodayQuiz(userId, dateKey);
  }

  static async submitDailyQuizAnswer(userId: string, questionId: string, answer: string, dateKey?: string) {
    return await UserQuizService.submitDailyQuizAnswer(userId, questionId, answer, dateKey);
  }

  static async submitDailyQuiz(userId: string, dateKey?: string) {
    return await UserQuizService.submitDailyQuiz(userId, dateKey);
  }

  static async getUserWithdrawals(userId: string) {
    return await UserWithdrawalService.getUserWithdrawals(userId);
  }

  static async requestWithdrawal(userId: string, amountSats: number, lightningInvoice: string) {
    return await UserWithdrawalService.requestWithdrawal(userId, amountSats, lightningInvoice);
  }

  static async getActiveAnnouncements() {
    return await UserCampaignService.getActiveAnnouncements();
  }

  static async getPublishedBlogs() {
    return await UserContentService.getPublishedBlogs();
  }

  static async getPublishedBlogById(id: string) {
    return await UserContentService.getPublishedBlogById(id);
  }

  static async getPublishedBlogBySlug(slug: string) {
    return await UserContentService.getPublishedBlogBySlug(slug);
  }

  static async getActiveFaqs() {
    return await UserContentService.getActiveFaqs();
  }

  static async submitBugReport(userId: string, data: { title: string; description: string; screenshotUrl?: string | null }) {
    return await UserBugReportService.submitBugReport(userId, data);
  }

  static async getMyBugReports(userId: string) {
    return await UserBugReportService.getMyBugReports(userId);
  }

  static async getBugBountyStats() {
    return await UserBugReportService.getBugBountyStats();
  }
}


