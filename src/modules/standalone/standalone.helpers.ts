import { SubmissionStatus, TaskPlatform, type User } from '@prisma/client';
import { prisma } from '../../db/prisma.client';
import { TierUtils } from '../../utils/tier.utils';
import { getReferralBonusAmount, getReferralBonusMsats, getReviewReleaseAt, splitMsats } from '../../utils/submission-flow.util';
import {
  applyDoubleReward,
  evaluateDailyActivityStreak,
  getNextStreakMilestone,
  getStreakMilestoneReward,
} from '../../utils/reward.util';
import { NotificationService } from '../notifications/notification.service';

const REFERRAL_ACTIVE_DAYS_REQUIRED = 10;
const REFERRAL_ACTIVITY_WINDOW_DAYS = 30;
const FREE_TIERS = ['BASIC', 'COPPER', 'BRONZE', 'SILVER', 'GOLD'] as const;

async function getUserUniqueActiveDaysLast30Days(userId: string) {
  const windowStart = new Date(Date.now() - REFERRAL_ACTIVITY_WINDOW_DAYS * 24 * 60 * 60 * 1000);

  const [taskSubmissions, standaloneSubmissions, quizAttempts] = await Promise.all([
    prisma.submission.findMany({
      where: {
        userId,
        status: { not: SubmissionStatus.REJECTED },
        submittedAt: { gte: windowStart },
      },
      select: { submittedAt: true },
    }),
    prisma.standaloneSubmission.findMany({
      where: {
        userId,
        status: { not: SubmissionStatus.REJECTED },
        submittedAt: { gte: windowStart },
      },
      select: { submittedAt: true },
    }),
    prisma.quizAttempt.findMany({
      where: {
        userId,
        createdAt: { gte: windowStart },
      },
      select: { createdAt: true },
    }),
  ]);

  return new Set([
    ...taskSubmissions.map((item) => item.submittedAt.toISOString().split('T')[0]),
    ...standaloneSubmissions.map((item) => item.submittedAt.toISOString().split('T')[0]),
    ...quizAttempts.map((item) => item.createdAt.toISOString().split('T')[0]),
  ]).size;
}

export const ALL_TIERS = ['BASIC', 'COPPER', 'BRONZE', 'SILVER', 'GOLD', 'PLATINUM', 'DIAMOND', 'CROWN', 'ELITE', 'FOUNDER'] as const;
const ALLOWED_STANDALONE_PLATFORMS: readonly TaskPlatform[] = ['TWITTER', 'YOUTUBE', 'INSTAGRAM', 'TELEGRAM', 'FACEBOOK', 'LINKEDIN', 'APP_STORE', 'PLAY_STORE', 'WEBSITE'];

export function normalizeStandaloneRequiredPlatform(input: unknown): TaskPlatform {
  const normalized = String(input || 'WEBSITE').trim().toUpperCase();
  return ALLOWED_STANDALONE_PLATFORMS.includes(normalized as TaskPlatform)
    ? (normalized as TaskPlatform)
    : 'WEBSITE';
}

export function normalizeTierRewardMatrix(input: unknown) {
  const source = (input || {}) as Record<string, number>;
  return ALL_TIERS.reduce<Record<string, number>>((acc, tier) => {
    acc[tier] = Math.max(0, Number(source[tier] || 0));
    return acc;
  }, {});
}

export function sanitizeStandaloneTierRewardMatrix(input: unknown, isPremiumOnly: boolean) {
  const matrix = normalizeTierRewardMatrix(input);
  if (!isPremiumOnly) {
    return matrix;
  }

  for (const tier of FREE_TIERS) {
    matrix[tier] = 0;
  }

  return matrix;
}

export function getActiveTier(user: Pick<User, 'totalXp' | 'premiumTier' | 'premiumExpiresAt'>) {
  return TierUtils.isPremiumActive(user as User) ? user.premiumTier : TierUtils.getFreeTier(user.totalXp);
}

export function getStandaloneRewardForUser(
  tierRewardMatrix: unknown,
  user: Pick<User, 'totalXp' | 'premiumTier' | 'premiumExpiresAt'>,
) {
  const matrix = normalizeTierRewardMatrix(tierRewardMatrix);
  const activeTier = String(getActiveTier(user) || 'BASIC');
  return Number(matrix[activeTier] || 0);
}

export async function applyStandaloneRewardEffects(params: {
  userId: string;
  userFullName: string | null;
  referredById: string | null;
  workerReward: number;
  xpReward: number;
  standaloneTaskTitle: string;
  submissionId: string;
  submissionStatus: SubmissionStatus;
  rejectionReason?: string | null;
}) {
  const {
    userId,
    userFullName,
    referredById,
    workerReward,
    xpReward,
    standaloneTaskTitle,
    submissionId,
    submissionStatus,
    rejectionReason,
  } = params;

  const settings = (await prisma.platformSettings.findFirst()) || {
    referralBonusPercent: 5,
    tierReferralMatrix: null,
  };

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      currentStreak: true,
      lastActivityAt: true,
      lastClaimedStreakMilestone: true,
      balancePending: true,
      totalXp: true,
    },
  });

  if (!user) {
    throw new Error('User not found.');
  }

  const streakEvaluation = evaluateDailyActivityStreak(user.lastActivityAt, user.currentStreak);
  const nextStreak = streakEvaluation.nextStreak;
  const nextMilestone = getNextStreakMilestone(user.lastClaimedStreakMilestone);
  const streakBonusSats = nextMilestone && nextStreak >= nextMilestone ? getStreakMilestoneReward(nextMilestone) : 0;

  if (submissionStatus !== SubmissionStatus.REJECTED) {
    await prisma.user.update({
      where: { id: userId },
      data: {
        balancePending: { increment: workerReward + streakBonusSats },
        totalXp: { increment: xpReward },
        currentStreak: nextStreak,
        lastActivityAt: new Date(),
        ...(streakBonusSats > 0 && nextMilestone
          ? { lastClaimedStreakMilestone: nextMilestone }
          : {}),
      },
    });

    await prisma.ledger.create({
      data: {
        userId,
        amountSats: workerReward,
        type: 'TASK_REWARD',
        description: `Standalone task reward for ${standaloneTaskTitle}`,
        referenceId: submissionId,
      },
    });

    if (streakBonusSats > 0 && nextMilestone) {
      await prisma.ledger.create({
        data: {
          userId,
          amountSats: streakBonusSats,
          type: 'STREAK_BONUS',
          description: `Standalone streak milestone reward (${nextMilestone} days)`,
          referenceId: submissionId,
        },
      });
    }

    if (referredById) {
      const referrer = await prisma.user.findUnique({
        where: { id: referredById },
        select: {
          id: true,
          totalXp: true,
          premiumTier: true,
          premiumExpiresAt: true,
          referralPendingMsats: true,
        },
      });
      if (referrer) {
        const referralActiveDays = await getUserUniqueActiveDaysLast30Days(userId);
        const referralEligible = referralActiveDays >= REFERRAL_ACTIVE_DAYS_REQUIRED;

        if (referralEligible) {
          const referrerHasPremium = TierUtils.isPremiumActive(referrer as User);
          const referrerActiveTier = referrerHasPremium ? referrer.premiumTier : TierUtils.getFreeTier(referrer.totalXp);
          const tierReferralMatrix = (settings.tierReferralMatrix as Record<string, number> | null) || null;
          const configuredCommission = referrerActiveTier ? tierReferralMatrix?.[String(referrerActiveTier)] : undefined;
          const commissionPercent = Number(configuredCommission ?? settings.referralBonusPercent ?? 0);
          const intendedReferralBonus = getReferralBonusAmount(workerReward, commissionPercent);
          const intendedReferralBonusMsats = getReferralBonusMsats(workerReward, commissionPercent);

          let actualReferralBonus = intendedReferralBonus;
          let actualReferralBonusMsats = intendedReferralBonusMsats;
          if (!referrerHasPremium) {
            const freeTier = TierUtils.getFreeTier(referrer.totalXp);
            const cap = TierUtils.getFreeTierReferralCap(freeTier);
            const referralLedgers = await prisma.ledger.findMany({
              where: { userId: referrer.id, type: 'REFERRAL_BONUS' },
              select: { amountSats: true },
            });
            const totalReferralSatsEarned = referralLedgers.reduce((sum, entry) => sum + entry.amountSats, 0);
            actualReferralBonus = Math.max(0, Math.min(intendedReferralBonus, cap.maxSats - totalReferralSatsEarned));
            actualReferralBonusMsats = Math.max(0, Math.min(intendedReferralBonusMsats, (cap.maxSats - totalReferralSatsEarned) * 1000));
          }

          if (actualReferralBonusMsats > 0) {
            const totalReferralPendingMsats = (referrer.referralPendingMsats || 0) + actualReferralBonusMsats;
            const { wholeSats, remainingMsats } = splitMsats(totalReferralPendingMsats);

            await prisma.user.update({
              where: { id: referrer.id },
              data: {
                balancePending: { increment: wholeSats },
                referralPendingMsats: remainingMsats,
              },
            });
            await prisma.ledger.create({
              data: {
                userId: referrer.id,
                amountSats: wholeSats,
                amountMsats: actualReferralBonusMsats,
                type: 'REFERRAL_BONUS',
                description: `Referral bonus from standalone task completion by ${userFullName || 'your referral'}`,
                referenceId: submissionId,
              },
            });

            await NotificationService.notifyUser(
              referrer.id,
              'Referral Reward Added',
              `${userFullName || 'Your referral'} completed a standalone task and you earned ${(actualReferralBonusMsats / 1000).toFixed(3)} sats in pending balance.`,
              'SYSTEM_ALERT',
              submissionId,
            );
          }
        }
      }
    }
  }

  if (submissionStatus === SubmissionStatus.REJECTED) {
    await NotificationService.notifyUser(
      userId,
      'Submission Rejected',
      rejectionReason || 'Your submission did not meet task requirements.',
      'SUBMISSION_REJECTED',
      submissionId,
    );
  }

  if (submissionStatus === SubmissionStatus.PENDING_24H) {
    await NotificationService.notifyUser(
      userId,
      'Submission Accepted',
      `Your submission for ${standaloneTaskTitle} was accepted and added to your pending balance.`,
      'SUBMISSION_APPROVED',
      submissionId,
    );
  }

  if (submissionStatus === SubmissionStatus.MANUAL_REVIEW) {
    await NotificationService.notifyAdmins(
      'Manual Review Required',
      `${userFullName || 'A user'} submitted a standalone task that needs manual review.`,
      'NEW_SUBMISSION',
      submissionId,
    );
  }
}

export function getStandaloneUnlockAt(status: SubmissionStatus) {
  return status === SubmissionStatus.PENDING_24H ? getReviewReleaseAt() : null;
}

export function getStandaloneDisplayReward(task: { tierRewardMatrix: unknown }, user: Pick<User, 'totalXp' | 'premiumTier' | 'premiumExpiresAt'>) {
  return applyDoubleReward(getStandaloneRewardForUser(task.tierRewardMatrix, user), false);
}
