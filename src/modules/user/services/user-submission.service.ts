import { SubmissionStatus } from '@prisma/client';
import { prisma } from '../../../db/prisma.client';
import { TierUtils } from '../../../utils/tier.utils';
import {
  getReferralBonusAmount,
  getReferralBonusMsats,
  getReviewReleaseAt,
  splitMsats,
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
import { recordReferralCredit, recordTaskSubmission } from '../../../monitoring/prometheus';

export class UserSubmissionService {
  private static isWithinNewUserWindow(createdAt: Date, maxAgeDays: number | null | undefined) {
    if (!maxAgeDays || maxAgeDays <= 0) return false;
    const accountAgeMs = Date.now() - new Date(createdAt).getTime();
    const accountAgeDays = Math.floor(accountAgeMs / (24 * 60 * 60 * 1000));
    return accountAgeDays <= maxAgeDays;
  }

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
    proofData: { screenshotUrl?: string; proofText?: string; imageHash?: string | null },
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
        createdAt: true,
        totalXp: true,
        currentStreak: true,
        lastActivityAt: true,
        lastClaimedStreakMilestone: true,
        premiumTier: true,
        premiumExpiresAt: true,
        timezone: true,
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
    if (task.campaign.isNewUserOnly && !this.isWithinNewUserWindow(user.createdAt, task.campaign.newUserMaxAccountAgeDays)) {
      throw new Error('This campaign is only available to new users.');
    }

    const existing = await prisma.submission.findUnique({
      where: { userId_taskId: { userId, taskId } },
    });
    if (existing && existing.status !== SubmissionStatus.REJECTED) {
      throw new Error('You have already submitted proof for this task.');
    }

    const rulesContext = task.requirements || task.description || task.campaign.description;
    // Only the screenshot we uploaded is analysed. Typed text/URLs are never fetched (SSRF) and go to a human.
    const aiResult = proofData.screenshotUrl
      ? await AiVerificationService.analyzeProof(proofData.screenshotUrl, rulesContext)
      : { score: 75, reason: 'Non-image proof submitted. Flagged for manual review.' };

    // Same screenshot already submitted for this task by another account.
    const duplicateImage = proofData.imageHash
      ? Boolean(await prisma.submission.findFirst({
          where: { taskId, imageHash: proofData.imageHash, userId: { not: userId } },
          select: { id: true },
        }))
      : false;

    const determinedStatus: SubmissionStatus = AiVerificationService.decideStatus(aiResult.score, { duplicateImage });

    recordTaskSubmission(
      determinedStatus === SubmissionStatus.PENDING_24H
        ? 'accepted'
        : determinedStatus === SubmissionStatus.MANUAL_REVIEW
          ? 'manual_review'
          : 'rejected',
    );

    const isCampaignDoubleRewardsActive = isDoubleRewardActive(
      task.campaign.doubleRewardsStartAt,
      task.campaign.doubleRewardsEndAt,
    );

    const activePremiumTier = TierUtils.getCurrentPremiumTier(user as any);
    const hasPremium = Boolean(activePremiumTier);
    if (task.campaign.isPremiumOnly && !hasPremium) {
      throw new Error('This task is available for premium members only.');
    }
    const activeTier = activePremiumTier || TierUtils.getFreeTier(user.totalXp);
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
    const streakEvaluation = evaluateDailyActivityStreak(user.lastActivityAt, user.currentStreak, new Date(), user.timezone);
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
                imageHash: proofData.imageHash || null,
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
                imageHash: proofData.imageHash || null,
                ipAddress: clientIp,
                confidenceScore: aiResult.score,
                status: determinedStatus,
                rejectionReason: determinedStatus === SubmissionStatus.REJECTED ? aiResult.reason : null,
                unlockAt: determinedStatus === SubmissionStatus.PENDING_24H ? getReviewReleaseAt() : null,
              },
            });

        if (determinedStatus !== SubmissionStatus.REJECTED) {
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

          const completesCampaign =
            campaignTaskIds.length > 0 && completedTaskIdsForUser.size === campaignTaskIds.length;

          if (completesCampaign) {
            const reservedSlot = await tx.campaign.updateMany({
              where: {
                id: liveCampaign.id,
                totalCompletions: { lt: liveCampaign.maxCompletions },
              },
              data: { totalCompletions: { increment: 1 } },
            });

            if (reservedSlot.count === 0) {
              throw new Error('This campaign filled up while your proof was being verified.');
            }
          }

          await tx.user.update({
            where: { id: userId },
            data: {
              ...(determinedStatus === SubmissionStatus.PENDING_24H
                ? { balancePending: { increment: workerReward } }
                : {}),
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

          if (determinedStatus === SubmissionStatus.PENDING_24H) {
            await tx.ledger.create({
              data: {
                userId,
                amountSats: workerReward,
                type: 'TASK_REWARD',
                description: `Task: ${liveCampaign.title} (Tier: ${activeTier})`,
                referenceId: submission.id,
              },
            });
          }

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

          if (determinedStatus === SubmissionStatus.PENDING_24H && user.referredById) {
            const referrer = await tx.user.findUnique({
              where: { id: user.referredById },
              select: {
                id: true,
                totalXp: true,
                premiumTier: true,
                premiumExpiresAt: true,
                referralPendingMsats: true,
              },
            });

            if (referrer) {
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
                // Referral commission is based on BASIC tier reward, not the referred user's actual tier reward
                const basicTierReward = Number(overrideRewardMatrix['BASIC'] || campaignRewardMatrix['BASIC'] || 0);
                const basicWorkerReward = applyDoubleReward(basicTierReward > 0 ? basicTierReward : configuredReward, isCampaignDoubleRewardsActive);
                const intendedReferralBonusMsats = getReferralBonusMsats(basicWorkerReward, commissionPercent);
                let referralBonusMsats = intendedReferralBonusMsats;

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
                  const remainingMsats = Math.max(0, remainingSats * 1000);

                  if (remainingSats <= 0) {
                    referralBonusMsats = 0;
                  } else {
                    referralBonusMsats = Math.max(0, Math.min(referralBonusMsats, remainingMsats));
                  }
                }

                if (referralBonusMsats > 0) {
                  const totalReferralPendingMsats = (referrer.referralPendingMsats || 0) + referralBonusMsats;
                  const { wholeSats, remainingMsats } = splitMsats(totalReferralPendingMsats);

                  await tx.user.update({
                    where: { id: referrer.id },
                    data: {
                      balancePending: { increment: wholeSats },
                      referralPendingMsats: remainingMsats,
                    },
                  });

            await tx.ledger.create({
              data: {
                userId: referrer.id,
                      amountSats: wholeSats,
                      amountMsats: referralBonusMsats,
                      type: 'REFERRAL_BONUS',
                      description: `Commission (${commissionPercent}%) from ${user.fullName || 'referred user'}`,
                referenceId: submission.id,
              },
            });

            recordReferralCredit('campaign', 'created');

                  await NotificationService.notifyUser(
                    referrer.id,
                    'Referral Reward Added',
                    `${user.fullName || 'Your referral'} completed a task and you earned ${(referralBonusMsats / 1000).toFixed(3)} sats in pending balance.`,
                    'SYSTEM_ALERT',
                    submission.id,
                  );
                }
            }
          }

        }

        return submission;
      }, {
        maxWait: 15000,
        timeout: 20000,
      });

    if (submission) {
      try {
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

        if (submission.status === SubmissionStatus.MANUAL_REVIEW) {
          await NotificationService.notifyUser(
            userId,
            'Submission Under Review',
            `Your submission for "${task.title || task.campaign.title}" is being manually reviewed. You will be notified once it is approved or rejected.`,
            'SUBMISSION_APPROVED',
            submission.id,
          );

          await NotificationService.notifyAdmins(
            'Manual Review Required',
            `${user.fullName} submitted a task that needs manual review: "${task.title || task.campaign.title}".`,
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
