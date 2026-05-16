import { prisma } from '../../db/prisma.client';
import { TierUtils } from '../../utils/tier.utils';
import { getNextStreakMilestone, getStreakMilestoneReward, getStreakMilestones } from '../../utils/reward.util';
import { UserAccountService } from './services/user-account.service';
import { UserCampaignService } from './services/user-campaign.service';
import { UserContentService } from './services/user-content.service';
import { UserQuizService } from './services/user-quiz.service';
import { UserLeaderboardService } from './services/user-leaderboard.service';
import { UserReferralService } from './services/user-referral.service';
import { UserSubmissionService } from './services/user-submission.service';
import { UserWithdrawalService } from './services/user-withdrawal.service';
import { UserBugReportService } from './services/user-bug-report.service';

export class UserService {
  static async getTaskStatus(userId: string, taskId: string) {
    return await UserSubmissionService.getTaskStatus(userId, taskId);
  }

  static async getProfile(userId: string) {
    return await UserAccountService.getProfile(userId);
  }

  static async getUserDashboard(userId: string) {
    const user = await prisma.user.findUnique({
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
                campaign: {
                  select: {
                    title: true,
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
    });

    if (!user) throw new Error('User not found');

    const isPremium = TierUtils.isPremiumActive(user as any);
    const freeTier = TierUtils.getFreeTier(user.totalXp);
    const activeTier = isPremium ? user.premiumTier : freeTier;

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

    return {
      balances: {
        available: user.balanceAvailable,
        pending: user.balancePending,
        locked: user.balanceLocked,
        totalLifetime: user.balanceAvailable + user.balancePending + user.balanceLocked,
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
      recentSubmissions: await Promise.all(
        user.submissions.map(async (submission) => {
          const ledgerEntry = await prisma.ledger.findFirst({
            where: {
              referenceId: submission.id,
              userId: submission.userId,
              type: 'TASK_REWARD',
            },
            select: { amountSats: true },
          });

          return {
            id: submission.id,
            taskTitle: submission.task.title,
            campaignTitle: submission.task.campaign.title,
            status: submission.status,
            rejectionReason: submission.rejectionReason,
            submittedAt: submission.submittedAt,
            unlockAt: submission.unlockAt,
            creditedAt: submission.status === 'WITHDRAWABLE' ? submission.unlockAt : null,
            rewardSats: ledgerEntry?.amountSats || 0,
            remainingMs: submission.unlockAt ? Math.max(new Date(submission.unlockAt).getTime() - Date.now(), 0) : 0,
          };
        }),
      ),
    };
  }

  static async getLeaderboard() {
    return await UserLeaderboardService.getLeaderboard();
  }

  static async getUserProfile(userId: string) {
    return await UserAccountService.getUserProfile(userId);
  }

  static async updateProfile(userId: string, data: any) {
    return await UserAccountService.updateProfile(userId, data);
  }

  static async changePassword(userId: string, newPassword: string) {
    return await UserAccountService.changePassword(userId, newPassword);
  }

  static async deleteAccount(userId: string) {
    return await UserAccountService.deleteAccount(userId);
  }

  static async getAvailableCampaigns(userId: string) {
    return await UserCampaignService.getAvailableCampaigns(userId);
  }

  static async getCampaignDetails(userId: string, campaignId: string) {
    return await UserCampaignService.getCampaignDetails(userId, campaignId);
  }

  static async submitTask(userId: string, taskId: string, proofData: { screenshotUrl?: string; proofText?: string }, clientIp: string = 'UNKNOWN') {
    return await UserSubmissionService.submitTask(userId, taskId, proofData, clientIp);
  }

  static async getReferralDashboard(userId: string) {
    return await UserReferralService.getReferralDashboard(userId);
  }

  static async getUnlockSchedule(userId: string) {
    return await UserReferralService.getUnlockSchedule(userId);
  }

  static async getSubmissionHistory(userId: string) {
    const submissions = await prisma.submission.findMany({
      where: { userId },
      include: {
        task: {
          include: {
            campaign: true,
          },
        },
      },
      orderBy: { submittedAt: 'desc' },
    });

    return await Promise.all(
      submissions.map(async (submission) => {
        const ledgerEntry = await prisma.ledger.findFirst({
          where: {
            referenceId: submission.id,
            userId,
            type: 'TASK_REWARD',
          },
          select: { amountSats: true },
        });

        return {
          id: submission.id,
          taskTitle: submission.task.title,
          campaignTitle: submission.task.campaign.title,
          status: submission.status,
          rejectionReason: submission.rejectionReason,
          submittedAt: submission.submittedAt,
          unlockAt: submission.unlockAt,
          creditedAt: submission.status === 'WITHDRAWABLE' ? submission.unlockAt : null,
          rewardSats: ledgerEntry?.amountSats || 0,
          remainingMs: submission.unlockAt ? Math.max(new Date(submission.unlockAt).getTime() - Date.now(), 0) : 0,
        };
      }),
    );
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

  static async getTodayQuiz(userId: string) {
    return await UserQuizService.getTodayQuiz(userId);
  }

  static async submitDailyQuiz(userId: string, userAnswers: Array<{ questionId: string; answer: string }>) {
    return await UserQuizService.submitDailyQuiz(userId, userAnswers);
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

  static async getActiveFaqs() {
    return await UserContentService.getActiveFaqs();
  }

  static async submitBugReport(userId: string, data: { title: string; description: string; screenshotUrl?: string | null }) {
    return await UserBugReportService.submitBugReport(userId, data);
  }

  static async getMyBugReports(userId: string) {
    return await UserBugReportService.getMyBugReports(userId);
  }
}
