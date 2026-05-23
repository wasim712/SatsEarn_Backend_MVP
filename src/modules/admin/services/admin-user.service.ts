import { BillingCycle, BillingSource } from '@prisma/client';
import { prisma } from '../../../db/prisma.client';
import { NotificationService } from '../../notifications/notification.service';
import { CryptoUtil } from '../../../utils/crypto.util';
import { TierUtils } from '../../../utils/tier.utils';

const CHEAT_USER_EMAIL = 'sakshamarya015@gmail.com';

export class AdminUserService {
  static async getPremiumRequests() {
    return await prisma.premiumRequest.findMany({
      include: {
        user: {
          select: {
            id: true,
            email: true,
            fullName: true,
            premiumTier: true,
            premiumExpiresAt: true,
            totalXp: true,
            isActive: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  static async updatePremiumRequest(requestId: string, data: {
    status: 'OPEN' | 'CONTACTED' | 'COMPLETED' | 'CANCELLED';
    adminNotes?: string;
  }) {
    const updateData: {
      status: 'OPEN' | 'CONTACTED' | 'COMPLETED' | 'CANCELLED';
      adminNotes?: string;
      contactedAt?: Date | null;
      resolvedAt?: Date | null;
    } = {
      status: data.status,
      ...(data.adminNotes !== undefined ? { adminNotes: data.adminNotes } : {}),
    };

    if (data.status === 'CONTACTED') {
      updateData.contactedAt = new Date();
    }

    if (data.status === 'COMPLETED' || data.status === 'CANCELLED') {
      updateData.resolvedAt = new Date();
    }

    return await prisma.premiumRequest.update({
      where: { id: requestId },
      data: updateData,
      include: {
        user: {
          select: {
            id: true,
            email: true,
            fullName: true,
            premiumTier: true,
            premiumExpiresAt: true,
            totalXp: true,
            isActive: true,
          },
        },
      },
    });
  }

  static async getCheatUserState() {
    const user = await prisma.user.findUnique({
      where: { email: CHEAT_USER_EMAIL },
      select: {
        id: true,
        email: true,
        fullName: true,
        totalXp: true,
        premiumTier: true,
        premiumExpiresAt: true,
        currentStreak: true,
        lastClaimedStreakMilestone: true,
        balanceAvailable: true,
        balancePending: true,
        balanceLocked: true,
        isActive: true,
        lastActivityAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!user) throw new Error(`Cheat user ${CHEAT_USER_EMAIL} not found.`);

    const isPremium = TierUtils.isPremiumActive(user as any);
    const freeTier = TierUtils.getFreeTier(user.totalXp);

    return {
      ...user,
      activeTier: isPremium ? user.premiumTier : freeTier,
      isPremium,
      underlyingFreeTier: freeTier,
    };
  }

  static async updateCheatUserState(data: {
    totalXp?: number;
    balanceAvailable?: number;
    balancePending?: number;
    balanceLocked?: number;
    currentStreak?: number;
    lastClaimedStreakMilestone?: number;
    premiumTier?: 'PLATINUM' | 'DIAMOND' | 'CROWN' | 'ELITE' | 'FOUNDER' | null;
    premiumExpiresAt?: string | null;
    isActive?: boolean;
  }) {
    const existing = await prisma.user.findUnique({
      where: { email: CHEAT_USER_EMAIL },
      select: { id: true },
    });

    if (!existing) throw new Error(`Cheat user ${CHEAT_USER_EMAIL} not found.`);

    await prisma.user.update({
      where: { id: existing.id },
      data: {
        ...(data.totalXp !== undefined ? { totalXp: data.totalXp } : {}),
        ...(data.balanceAvailable !== undefined ? { balanceAvailable: data.balanceAvailable } : {}),
        ...(data.balancePending !== undefined ? { balancePending: data.balancePending } : {}),
        ...(data.balanceLocked !== undefined ? { balanceLocked: data.balanceLocked } : {}),
        ...(data.currentStreak !== undefined ? { currentStreak: data.currentStreak } : {}),
        ...(data.lastClaimedStreakMilestone !== undefined ? { lastClaimedStreakMilestone: data.lastClaimedStreakMilestone } : {}),
        ...(data.premiumTier !== undefined ? { premiumTier: data.premiumTier } : {}),
        ...(data.premiumExpiresAt !== undefined ? { premiumExpiresAt: data.premiumExpiresAt ? new Date(data.premiumExpiresAt) : null } : {}),
        ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
      },
    });

    return await this.getCheatUserState();
  }

  static async getAllUsers() {
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const users = await prisma.user.findMany({
      where: {
        role: 'USER',
      },
      select: {
        id: true,
        email: true,
        fullName: true,
        role: true,
        totalXp: true,
        premiumTier: true,
        premiumExpiresAt: true,
        isActive: true,
        balanceAvailable: true,
        balancePending: true,
        balanceLocked: true,
        referralCode: true,
        _count: {
          select: { referrals: true, submissions: true },
        },
        createdAt: true,
        updatedAt: true,
        lastActivityAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    return users.map((user) => {
      const isPremium = TierUtils.isPremiumActive(user as any);
      const freeTier = TierUtils.getFreeTier(user.totalXp);
      const isRecentlyActive = Boolean(user.lastActivityAt && user.lastActivityAt >= twentyFourHoursAgo);

      return {
        ...user,
        activeTier: isPremium ? user.premiumTier : freeTier,
        isPremium,
        isRecentlyActive,
        underlyingFreeTier: freeTier,
      };
    });
  }

  static async getUserDetails(userId: string) {
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        _count: {
          select: {
            referrals: true,
            submissions: true,
            withdrawals: true,
            transactions: true,
            quizAttempts: true,
            notifications: true,
          },
        },
        submissions: {
          include: {
            task: {
              include: {
                campaign: {
                  select: {
                    id: true,
                    title: true,
                    baseRewardSats: true,
                  },
                },
              },
            },
          },
          orderBy: { submittedAt: 'desc' },
          take: 50,
        },
        withdrawals: {
          orderBy: { createdAt: 'desc' },
          take: 50,
        },
        transactions: {
          orderBy: { createdAt: 'desc' },
          take: 100,
        },
        notifications: {
          where: { forAdmin: false },
          orderBy: { createdAt: 'desc' },
          take: 20,
        },
        billingRecords: {
          orderBy: { createdAt: 'desc' },
          take: 20,
        },
        quizAttempts: {
          include: {
            dailyQuiz: {
              select: {
                id: true,
                title: true,
                rewardSats: true,
                date: true,
              },
            },
          },
          orderBy: { createdAt: 'desc' },
          take: 20,
        },
      },
    });

    if (!user) throw new Error('User not found');

    const isPremium = TierUtils.isPremiumActive(user as any);
    const freeTier = TierUtils.getFreeTier(user.totalXp);

    const submissionMap = new Map(user.submissions.map((submission) => [submission.id, submission]));
    const withdrawalMap = new Map(user.withdrawals.map((withdrawal) => [withdrawal.id, withdrawal]));

    const transactions = user.transactions.map((transaction) => {
      const linkedSubmission = transaction.referenceId ? submissionMap.get(transaction.referenceId) : null;
      const linkedWithdrawal = transaction.referenceId ? withdrawalMap.get(transaction.referenceId) : null;

      return {
        ...transaction,
        source:
          linkedSubmission
            ? {
                kind: 'submission',
                submissionId: linkedSubmission.id,
                status: linkedSubmission.status,
                taskId: linkedSubmission.taskId,
                taskTitle: linkedSubmission.task?.title,
                campaignId: linkedSubmission.task?.campaign?.id,
                campaignTitle: linkedSubmission.task?.campaign?.title,
              }
            : linkedWithdrawal
              ? {
                  kind: 'withdrawal',
                  withdrawalId: linkedWithdrawal.id,
                  status: linkedWithdrawal.status,
                  amountSats: linkedWithdrawal.amountSats,
                }
              : null,
      };
    });

    return {
      ...user,
      phone: CryptoUtil.decrypt(user.phone),
      twitterHandle: CryptoUtil.decrypt(user.twitterHandle),
      instagramHandle: CryptoUtil.decrypt(user.instagramHandle),
      telegramHandle: CryptoUtil.decrypt(user.telegramHandle),
      discordHandle: CryptoUtil.decrypt(user.discordHandle),
      activeTier: isPremium ? user.premiumTier : freeTier,
      isPremium,
      isRecentlyActive: Boolean(user.lastActivityAt && user.lastActivityAt >= twentyFourHoursAgo),
      underlyingFreeTier: freeTier,
      transactions,
    };
  }

  static async adjustUserSubmissionReward(userId: string, data: {
    submissionId: string;
    amountSats: number;
    note?: string;
  }) {
    const submission = await prisma.submission.findFirst({
      where: { id: data.submissionId, userId },
      select: { id: true, userId: true, status: true, task: { select: { title: true } } },
    });

    if (!submission) {
      throw new Error('Submission not found for this user.');
    }

    const ledgerEntry = await prisma.ledger.findFirst({
      where: { userId, referenceId: submission.id, type: 'TASK_REWARD' },
      orderBy: { createdAt: 'asc' },
    });

    if (!ledgerEntry) {
      throw new Error('Original task reward ledger entry was not found.');
    }

    const nextAmount = ledgerEntry.amountSats + data.amountSats;
    if (nextAmount < 0) {
      throw new Error('Adjustment would make the task reward negative.');
    }

    await prisma.$transaction(async (tx) => {
      await tx.ledger.update({
        where: { id: ledgerEntry.id },
        data: {
          amountSats: nextAmount,
          description: `${ledgerEntry.description || 'Task reward'}${data.note ? ` | Admin adjustment: ${data.note}` : ''}`,
        },
      });

      if (submission.status === 'WITHDRAWABLE') {
        await tx.user.update({
          where: { id: userId },
          data: { balanceAvailable: { increment: data.amountSats } },
        });
      } else {
        await tx.user.update({
          where: { id: userId },
          data: { balancePending: { increment: data.amountSats } },
        });
      }
    });

    await NotificationService.notifyUser(
      userId,
      'Task reward adjusted',
      `Your reward for ${submission.task?.title || 'a task'} was adjusted by ${data.amountSats} sats.${data.note ? ` Reason: ${data.note}` : ''}`,
      'SYSTEM_ALERT',
      submission.id,
    );

    return await this.getUserDetails(userId);
  }

  static async setUserActiveState(userId: string, isActive: boolean) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, role: true, isActive: true, fullName: true, email: true },
    });

    if (!user) throw new Error('User not found');
    if (user.role === 'SUPER_ADMIN') throw new Error('Admin accounts cannot be suspended here.');

    return await prisma.user.update({
      where: { id: userId },
      data: { isActive },
      select: {
        id: true,
        email: true,
        fullName: true,
        isActive: true,
        role: true,
      },
    });
  }

  static async deleteUserAccount(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, role: true },
    });

    if (!user) throw new Error('User not found');
    if (user.role === 'SUPER_ADMIN') throw new Error('Admin accounts cannot be deleted here.');

    const scrambledStr = `deleted_${Date.now()}_${userId.slice(0, 6)}`;

    return await prisma.user.update({
      where: { id: userId },
      data: {
        isActive: false,
        email: `${scrambledStr}@deleted.com`,
        passwordHash: null,
        otpCode: null,
        otpExpiresAt: null,
        username: scrambledStr,
        fullName: 'Deleted User',
        phone: null,
        twitterHandle: null,
        instagramHandle: null,
        telegramHandle: null,
        discordHandle: null,
        referralCode: scrambledStr,
      },
      select: {
        id: true,
        email: true,
        fullName: true,
        isActive: true,
      },
    });
  }

  static async updateUserPremium(userId: string, data: {
    premiumTier: 'PLATINUM' | 'DIAMOND' | 'CROWN' | 'ELITE' | 'FOUNDER' | null;
    premiumExpiresAt: string | null;
  }) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, fullName: true },
    });

    if (!user) throw new Error('User not found');

    const premiumExpiresAt = data.premiumExpiresAt ? new Date(data.premiumExpiresAt) : null;

    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: userId },
        data: {
          premiumTier: data.premiumTier,
          premiumExpiresAt,
        },
      });

      if (data.premiumTier) {
        await tx.billingRecord.create({
          data: {
            userId,
            premiumTier: data.premiumTier,
            billingCycle: BillingCycle.MONTHLY,
            billingSource: BillingSource.ADMIN_OVERRIDE,
            adminNotes: 'Premium tier updated manually by admin.',
            premiumExpiresAt,
          },
        });
      }
    });

    return await this.getUserDetails(userId);
  }
}
