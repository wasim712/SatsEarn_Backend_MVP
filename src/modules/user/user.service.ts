import { prisma } from '../../db/prisma.client';
import { TierUtils } from '../../utils/tier.utils';
import { UserAccountService } from './services/user-account.service';
import { UserCampaignService } from './services/user-campaign.service';
import { UserQuizService } from './services/user-quiz.service';
import { UserReferralService } from './services/user-referral.service';
import { UserSubmissionService } from './services/user-submission.service';
import { UserWithdrawalService } from './services/user-withdrawal.service';

export class UserService {
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
    const currentLevelProgressPercent = ((cappedXp % 1000) / 1000) * 100;
    const isMaxLevel = cappedXp >= maxXp;

    let xpDisplay = '';
    if (isMaxLevel) xpDisplay = `${maxXp.toLocaleString()} XP (MAX)`;
    else xpDisplay = `${user.totalXp.toLocaleString()} / ${nextLevelTotalXp.toLocaleString()} XP`;

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
        xpDisplay,
        progressPercent: isMaxLevel ? 100 : currentLevelProgressPercent,
        tasksCompleted: user._count.submissions,
        activeReferrals: user._count.referrals,
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
}
