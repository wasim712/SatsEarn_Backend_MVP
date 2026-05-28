import { SubmissionStatus } from '@prisma/client';
import { prisma } from '../../../db/prisma.client';
import { TierUtils } from '../../../utils/tier.utils';
import {
  getReferralBonusAmount,
  getReviewReleaseAt,
} from '../../../utils/submission-flow.util';
import {
  applyDoubleReward,
  evaluateDailyActivityStreak,
  getNextStreakMilestone,
  getStreakMilestoneReward,
  isPremiumStreakMilestone,
  isDoubleRewardActive,
} from '../../../utils/reward.util';
import { NotificationService } from '../../notifications/notification.service';
import { AiVerificationService } from '../../verification/verification.service';

const REFERRAL_ACTIVE_DAYS_REQUIRED = 10;
const REFERRAL_ACTIVITY_WINDOW_DAYS = 30;

async function getUserUniqueActiveDaysLast30Days(db: typeof prisma, userId: string) {
  const windowStart = new Date(Date.now() - REFERRAL_ACTIVITY_WINDOW_DAYS * 24 * 60 * 60 * 1000);

  const [taskSubmissions, standaloneSubmissions, quizAttempts] = await Promise.all([
    db.submission.findMany({
      where: {
        userId,
        status: { not: SubmissionStatus.REJECTED },
        submittedAt: { gte: windowStart },
      },
      select: { submittedAt: true },
    }),
    db.standaloneSubmission.findMany({
      where: {
        userId,
        status: { not: SubmissionStatus.REJECTED },
        submittedAt: { gte: windowStart },
      },
      select: { submittedAt: true },
    }),
    db.quizAttempt.findMany({
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


export class UserSubmissionService {
  static async getTaskStatus(userId: string, taskId: string) {
    const submission = await prisma.submission.findUnique({
      where: { userId_taskId: { userId, taskId } },
      select: {
        status: true,
        submittedAt: true,
        rejectionReason: true,
        unlockAt: true,
      },
    });

    if (!submission) {
      return { status: null, submittedAt: null, rejectionReason: null, unlockAt: null };
    }

    return submission;
  }

  static async submitTask(
    userId: string,
    taskId: string,
    proofData: { screenshotUrl?: string; proofText?: string },
    clientIp: string = 'UNKNOWN',
  ) {
    const settings = (await prisma.platformSettings.findFirst()) || {
      referralBonusPercent: 5,
      securityLockDays: 15,
      tierReferralMatrix: null,
    };

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        referredById: true,
        fullName: true,
        totalXp: true,
        currentStreak: true,
        lastActivityAt: true,
        lastClaimedStreakMilestone: true,
        premiumTier: true,
        premiumExpiresAt: true,
      },
    });
    if (!user) throw new Error('User not found.');

    const task = await prisma.task.findUnique({
      where: { id: taskId },
      include: { campaign: true },
    });
    if (!task) throw new Error('Task not found.');
    if (task.campaign.totalCompletions >= task.campaign.maxCompletions) {
      throw new Error('This campaign has reached its maximum budget and is closed.');
    }

    const existing = await prisma.submission.findUnique({
      where: { userId_taskId: { userId, taskId } },
    });
    if (existing && existing.status !== SubmissionStatus.REJECTED) {
      throw new Error('You have already submitted proof for this task.');
    }

    const rulesContext = task.requirements || task.description || task.campaign.description;
    const proofContent = proofData.screenshotUrl || proofData.proofText || '';
    const aiResult = await AiVerificationService.analyzeProof(proofContent, rulesContext);

    let determinedStatus: SubmissionStatus = SubmissionStatus.PENDING_24H;
    if (aiResult.score >= 90) determinedStatus = SubmissionStatus.PENDING_24H;
    else if (aiResult.score >= 70) determinedStatus = SubmissionStatus.MANUAL_REVIEW;
    else determinedStatus = SubmissionStatus.REJECTED;

    const isCampaignDoubleRewardsActive = isDoubleRewardActive(
      task.campaign.doubleRewardsStartAt,
      task.campaign.doubleRewardsEndAt,
    );

    const hasPremium = TierUtils.isPremiumActive(user as any);
    const activeTier = hasPremium ? user.premiumTier : TierUtils.getFreeTier(user.totalXp);
    const campaignRewardMatrix = (task.campaign.tierRewardMatrix || {}) as Record<string, number>;
    const overrideRewardMatrix = (task.tierRewardMatrixOverride || {}) as Record<string, number>;
    const tierKey = String(activeTier || '');
    const overrideReward = Number(overrideRewardMatrix[tierKey] || 0);
    const campaignReward = Number(campaignRewardMatrix[tierKey] || 0);
    const configuredReward = overrideReward > 0 ? overrideReward : campaignReward;
    if (configuredReward <= 0) {
      throw new Error('This task does not have a configured reward for your tier.');
    }
    const workerReward = applyDoubleReward(configuredReward, isCampaignDoubleRewardsActive);
    const baseXpReward = task.xpRewardOverride && task.xpRewardOverride > 0
      ? task.xpRewardOverride
      : (task.campaign.xpReward ?? 0);
    const xpReward = applyDoubleReward(baseXpReward, isCampaignDoubleRewardsActive);
    const streakEvaluation = evaluateDailyActivityStreak(user.lastActivityAt, user.currentStreak);
    const nextMilestone = getNextStreakMilestone(user.lastClaimedStreakMilestone);
    const streakMilestoneEligible = !!(
      nextMilestone
      && streakEvaluation.nextStreak >= nextMilestone
      && (!isPremiumStreakMilestone(nextMilestone) || hasPremium)
    );
    const streakBonusSats = streakMilestoneEligible && nextMilestone
      ? getStreakMilestoneReward(nextMilestone)
      : 0;

    const submission = await prisma.$transaction(async (tx) => {
        const liveCampaign = await tx.campaign.findUnique({ where: { id: task.campaign.id } });
        if (!liveCampaign || liveCampaign.totalCompletions >= liveCampaign.maxCompletions) {
          throw new Error('This campaign filled up while your proof was being verified.');
        }

        const submission = existing && existing.status === SubmissionStatus.REJECTED
          ? await tx.submission.update({
              where: { id: existing.id },
              data: {
                screenshotUrl: proofData.screenshotUrl || null,
                proofText: proofData.proofText || null,
                ipAddress: clientIp,
                confidenceScore: aiResult.score,
                status: determinedStatus,
                rejectionReason: determinedStatus === SubmissionStatus.REJECTED ? aiResult.reason : null,
                unlockAt: determinedStatus === SubmissionStatus.PENDING_24H ? getReviewReleaseAt() : null,
                reviewedById: null,
                submittedAt: new Date(),
              },
            })
          : await tx.submission.create({
              data: {
                userId,
                taskId,
                screenshotUrl: proofData.screenshotUrl || null,
                proofText: proofData.proofText || null,
                ipAddress: clientIp,
                confidenceScore: aiResult.score,
                status: determinedStatus,
                rejectionReason: determinedStatus === SubmissionStatus.REJECTED ? aiResult.reason : null,
                unlockAt: determinedStatus === SubmissionStatus.PENDING_24H ? getReviewReleaseAt() : null,
              },
            });

        if (determinedStatus !== SubmissionStatus.REJECTED) {
          await tx.user.update({
            where: { id: userId },
            data: {
              balancePending: { increment: workerReward },
              totalXp: { increment: xpReward },
              currentStreak: streakEvaluation.nextStreak,
              lastActivityAt: new Date(),
              ...(streakBonusSats > 0 && nextMilestone
                ? {
                    balanceAvailable: { increment: streakBonusSats },
                    lastClaimedStreakMilestone: nextMilestone,
                  }
                : {}),
            },
          });

          await tx.ledger.create({
            data: {
              userId,
              amountSats: workerReward,
              type: 'TASK_REWARD',
              description: `Task: ${liveCampaign.title} (Tier: ${activeTier})`,
              referenceId: submission.id,
            },
          });

          if (streakBonusSats > 0 && nextMilestone) {
            await tx.ledger.create({
              data: {
                userId,
                amountSats: streakBonusSats,
                type: 'STREAK_BONUS',
                description: `Streak milestone reached: ${nextMilestone} days`,
                referenceId: submission.id,
              },
            });
          }

          if (user.referredById) {
            const referrer = await tx.user.findUnique({ where: { id: user.referredById } });

            if (referrer) {
              const referralActiveDays = await getUserUniqueActiveDaysLast30Days(tx as typeof prisma, userId);
              const referralEligible = referralActiveDays >= REFERRAL_ACTIVE_DAYS_REQUIRED;

              if (referralEligible) {
                const referrerHasPremium = TierUtils.isPremiumActive(referrer as any);
                const referrerActiveTier = referrerHasPremium
                  ? referrer.premiumTier
                  : TierUtils.getFreeTier(referrer.totalXp);
                const tierReferralMatrix = (settings?.tierReferralMatrix as Record<string, number> | null) || null;
                const configuredCommission = referrerActiveTier
                  ? tierReferralMatrix?.[String(referrerActiveTier)]
                  : undefined;
                const commissionPercent = Number(
                  configuredCommission ?? settings.referralBonusPercent ?? 0,
                );
                let referralBonus = getReferralBonusAmount(workerReward, commissionPercent);

                if (!referrerHasPremium) {
                  const freeTier = TierUtils.getFreeTier(referrer.totalXp);
                  const cap = TierUtils.getFreeTierReferralCap(freeTier);

                  const referralLedgers = await tx.ledger.findMany({
                    where: {
                      userId: referrer.id,
                      type: 'REFERRAL_BONUS',
                    },
                    select: { amountSats: true },
                  });

                  const totalReferralSatsEarned = referralLedgers.reduce((sum, entry) => sum + entry.amountSats, 0);
                  const remainingSats = cap.maxSats - totalReferralSatsEarned;

                  if (remainingSats <= 0) {
                    referralBonus = 0;
                  } else {
                    referralBonus = Math.max(0, Math.min(referralBonus, remainingSats));
                  }
                }

                if (referralBonus > 0) {
                  await tx.user.update({
                    where: { id: referrer.id },
                    data: { balancePending: { increment: referralBonus } },
                  });

                  await tx.ledger.create({
                    data: {
                      userId: referrer.id,
                      amountSats: referralBonus,
                      type: 'REFERRAL_BONUS',
                      description: `Commission (${commissionPercent}%) from ${user.fullName || 'referred user'}`,
                      referenceId: submission.id,
                    },
                  });
                }
              }
            }
          }

          const campaignTaskIds = (
            await tx.task.findMany({
              where: { campaignId: liveCampaign.id },
              select: { id: true },
            })
          ).map((campaignTask) => campaignTask.id);

          const completedTaskIdsForUser = new Set(
            (
              await tx.submission.findMany({
                where: {
                  userId,
                  status: { not: SubmissionStatus.REJECTED },
                  taskId: { in: campaignTaskIds },
                },
                select: { taskId: true },
              })
            ).map((item) => item.taskId),
          );

          if (campaignTaskIds.length > 0 && completedTaskIdsForUser.size === campaignTaskIds.length) {
            await tx.campaign.update({
              where: { id: liveCampaign.id },
              data: { totalCompletions: { increment: 1 } },
            });
          }
        }

        return submission;
      }, {
        maxWait: 15000,
        timeout: 20000,
      });

    if (submission) {
      try {
        const referredUserName = user.fullName || 'your referral';

        if (submission.status === SubmissionStatus.REJECTED) {
          await NotificationService.notifyUser(
            userId,
            'Submission Rejected',
            submission.rejectionReason || 'Your submission did not meet task requirements.',
            'SUBMISSION_REJECTED',
            submission.id,
          );
        }

        if (submission.status === SubmissionStatus.PENDING_24H) {
          await NotificationService.notifyUser(
            userId,
            'Submission Accepted',
            `Your submission for ${task.title} was accepted and added to your pending balance.`,
            'SUBMISSION_APPROVED',
            submission.id,
          );
        }

        if (submission.status !== SubmissionStatus.REJECTED && streakBonusSats > 0 && nextMilestone) {
          await NotificationService.notifyUser(
            userId,
            'Streak Milestone Reward Unlocked',
            `You reached your ${nextMilestone}-day streak and earned ${streakBonusSats} sats.`,
            'SYSTEM_ALERT',
            submission.id,
          );
        }

        if (submission.status !== SubmissionStatus.REJECTED && user.referredById) {
          const referrer = await prisma.user.findUnique({ where: { id: user.referredById } });

          if (referrer) {
            const referrerHasPremium = TierUtils.isPremiumActive(referrer as any);
            const referrerActiveTier = referrerHasPremium
              ? referrer.premiumTier
              : TierUtils.getFreeTier(referrer.totalXp);
            const tierReferralMatrix = (settings?.tierReferralMatrix as Record<string, number> | null) || null;
            const configuredCommission = referrerActiveTier
              ? tierReferralMatrix?.[String(referrerActiveTier)]
              : undefined;
            const commissionPercent = Number(configuredCommission ?? settings.referralBonusPercent ?? 0);
            const intendedReferralBonus = getReferralBonusAmount(workerReward, commissionPercent);

            let totalReferralSatsEarned = 0;
            let cap = null as ReturnType<typeof TierUtils.getFreeTierReferralCap> | null;

            if (!referrerHasPremium) {
              const freeTier = TierUtils.getFreeTier(referrer.totalXp);
              cap = TierUtils.getFreeTierReferralCap(freeTier);
              const referralLedgers = await prisma.ledger.findMany({
                where: {
                  userId: referrer.id,
                  type: 'REFERRAL_BONUS',
                },
                select: { amountSats: true },
              });
              totalReferralSatsEarned = referralLedgers.reduce((sum, entry) => sum + entry.amountSats, 0);
            }

            const actualReferralLedger = await prisma.ledger.findFirst({
              where: {
                userId: referrer.id,
                type: 'REFERRAL_BONUS',
                referenceId: submission.id,
              },
              select: { amountSats: true },
            });

            const actualReferralBonus = actualReferralLedger?.amountSats || 0;

            if (actualReferralBonus > 0) {
              const cappedMessage = !referrerHasPremium && actualReferralBonus < intendedReferralBonus
                ? ` Your free-tier cap reduced this reward from ${intendedReferralBonus} sats to ${actualReferralBonus} sats.`
                : '';

              await NotificationService.notifyUser(
                referrer.id,
                'Referral Reward Added',
                `${referredUserName} completed a task and you earned ${actualReferralBonus} sats as referral reward.${cappedMessage}`,
                'SYSTEM_ALERT',
                submission.id,
              );
            } else if (!referrerHasPremium && cap) {
              const remainingSats = Math.max(cap.maxSats - totalReferralSatsEarned, 0);

              await NotificationService.notifyUser(
                referrer.id,
                'Referral Reward Cap Reached',
                `${referredUserName} completed a task, but no referral sats were added because your free-tier referral cap is exhausted. Remaining capacity: ${remainingSats} sats.`,
                'SYSTEM_ALERT',
                submission.id,
              );
            }
          }
        }

        if (submission.status === SubmissionStatus.MANUAL_REVIEW) {
          await NotificationService.notifyAdmins(
            'Manual Review Required',
            `${user.fullName} submitted a task that needs manual review.`,
            'NEW_SUBMISSION',
            submission.id,
          );
        }
      } catch (notifyError) {
        console.error('Submission saved, but admin notification failed:', notifyError);
      }
    }

    return submission;
  }
}
