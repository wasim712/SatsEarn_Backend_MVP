import { prisma } from '../../../db/prisma.client';
import { TierUtils } from '../../../utils/tier.utils';
import { NotificationService } from '../../notifications/notification.service';
import {
  DEFAULT_SECURITY_LOCK_DAYS,
  getSecurityUnlockAt,
  getReferralBonusMsats,
  splitMsats,
} from '../../../utils/submission-flow.util';
import { applyDoubleReward, isDoubleRewardActive } from '../../../utils/reward.util';

export class AdminSubmissionService {
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
            isActive: true,
          },
        },
        task: {
          include: {
            campaign: true,
          },
        },
      },
      orderBy: { submittedAt: 'asc' },
    });

    return submissions.map((submission) => {
      const user = submission.user as any;
      const isPremium = TierUtils.isPremiumActive(user);
      const activeTier = isPremium ? user.premiumTier : TierUtils.getFreeTier(user.totalXp || 0);
      const campaign = submission.task.campaign;
      const campaignMatrix = (campaign?.tierRewardMatrix || {}) as Record<string, number>;
      const overrideMatrix = (submission.task.tierRewardMatrixOverride || {}) as Record<string, number>;
      const tierKey = String(activeTier || '');
      const configuredReward = Number(overrideMatrix[tierKey] || campaignMatrix[tierKey] || 0);
      const isDoubleActive = isDoubleRewardActive(
        campaign?.doubleRewardsStartAt,
        campaign?.doubleRewardsEndAt,
      );
      const displayRewardSats = applyDoubleReward(configuredReward, isDoubleActive);

      return {
        ...submission,
        displayRewardSats,
        user: {
          ...submission.user,
          isPremium,
          activeTier,
        },
      };
    });
  }

  static async reviewSubmission(
    submissionId: string,
    status: 'LOCKED_15D' | 'REJECTED',
    rejectionReason?: string,
    adminId?: string,
  ) {
    const existingSubmission = await prisma.submission.findUnique({
      where: { id: submissionId },
      include: { task: { include: { campaign: true } } },
    });

    if (!existingSubmission) throw new Error('Submission not found');
    if (existingSubmission.status !== 'MANUAL_REVIEW') {
      throw new Error(`Submission already processed: ${existingSubmission.status}`);
    }

    const settings = await prisma.platformSettings.findFirst() || {
      securityLockDays: DEFAULT_SECURITY_LOCK_DAYS,
      referralBonusPercent: 5,
      tierReferralMatrix: null,
    };

    const updateResult = await prisma.$transaction(async (tx) => {
      const result = await tx.submission.updateMany({
        where: { id: submissionId, status: 'MANUAL_REVIEW' },
        data: {
          status,
          reviewedById: adminId,
          rejectionReason: status === 'REJECTED' ? rejectionReason : null,
          unlockAt: status === 'LOCKED_15D' ? getSecurityUnlockAt(settings.securityLockDays) : undefined,
        },
      });

      // On approval: calculate reward, create ledger, credit balanceLocked, process referrals
      if (result.count > 0 && status === 'LOCKED_15D') {
        const submittingUser = await tx.user.findUnique({
          where: { id: existingSubmission.userId },
          select: {
            id: true,
            totalXp: true,
            premiumTier: true,
            premiumExpiresAt: true,
            referredById: true,
            fullName: true,
          },
        });

        if (submittingUser) {
          // Calculate reward based on user's tier
          const activePremiumTier = TierUtils.getCurrentPremiumTier(submittingUser as any);
          const activeTier = activePremiumTier || TierUtils.getFreeTier(submittingUser.totalXp);
          const campaign = existingSubmission.task.campaign;
          const campaignMatrix = (campaign.tierRewardMatrix || {}) as Record<string, number>;
          const overrideMatrix = (existingSubmission.task.tierRewardMatrixOverride || {}) as Record<string, number>;
          const tierKey = String(activeTier || '');
          const configuredReward = Number(overrideMatrix[tierKey] || campaignMatrix[tierKey] || 0);
          const isDoubleActive = isDoubleRewardActive(
            campaign.doubleRewardsStartAt,
            campaign.doubleRewardsEndAt,
          );
          const workerReward = applyDoubleReward(configuredReward, isDoubleActive);

          if (workerReward > 0) {
            // Create ledger entry (not created at submission time for MANUAL_REVIEW)
            await tx.ledger.create({
              data: {
                userId: existingSubmission.userId,
                amountSats: workerReward,
                type: 'TASK_REWARD',
                description: `Task: ${campaign.title} (Tier: ${activeTier}) - Admin Approved`,
                referenceId: submissionId,
              },
            });

            // Credit balanceLocked directly (skipping pending since admin approved)
            await tx.user.update({
              where: { id: existingSubmission.userId },
              data: {
                balanceLocked: { increment: workerReward },
              },
            });

            // Process referral commission
            if (submittingUser.referredById) {
              const referrer = await tx.user.findUnique({
                where: { id: submittingUser.referredById },
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
                const commissionPercent = Number(configuredCommission ?? settings.referralBonusPercent ?? 0);
                // Referral commission is based on BASIC tier reward, not the referred user's actual tier reward
                const basicReward = Number(overrideMatrix['BASIC'] || campaignMatrix['BASIC'] || 0);
                const basicWorkerReward = applyDoubleReward(basicReward > 0 ? basicReward : configuredReward, isDoubleActive);
                let effectiveMsats = getReferralBonusMsats(basicWorkerReward, commissionPercent);

                // Apply cap for free-tier referrers
                if (!referrerHasPremium) {
                  const freeTier = TierUtils.getFreeTier(referrer.totalXp);
                  const cap = TierUtils.getFreeTierReferralCap(freeTier);
                  const referralLedgers = await tx.ledger.findMany({
                    where: { userId: referrer.id, type: 'REFERRAL_BONUS' },
                    select: { amountSats: true },
                  });
                  const totalEarned = referralLedgers.reduce((sum: number, e: any) => sum + e.amountSats, 0);
                  const remainingMsats = Math.max(0, (cap.maxSats - totalEarned) * 1000);
                  effectiveMsats = Math.min(effectiveMsats, remainingMsats);
                }

                if (effectiveMsats > 0) {
                  const totalPendingMsats = (referrer.referralPendingMsats || 0) + effectiveMsats;
                  const { wholeSats, remainingMsats } = splitMsats(totalPendingMsats);

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
                      amountMsats: effectiveMsats,
                      type: 'REFERRAL_BONUS',
                      description: `Commission from ${submittingUser.fullName || 'referred user'} (admin approved)`,
                      referenceId: submissionId,
                    },
                  });

                  try {
                    await NotificationService.notifyUser(
                      referrer.id,
                      'Referral Reward Added',
                      `${submittingUser.fullName || 'Your referral'} had a submission approved and you earned ${(effectiveMsats / 1000).toFixed(3)} sats.`,
                      'SYSTEM_ALERT',
                      submissionId,
                    );
                  } catch (notifyError) {
                    console.error('Referral bonus credited, but notification failed:', notifyError);
                  }
                }
              }
            }
          }
        }
      }

      return result;
    });

    if (updateResult.count === 0) {
      throw new Error('Submission was already processed by another admin.');
    }

    const updatedSubmission = await prisma.submission.findUnique({
      where: { id: submissionId },
      include: { task: true },
    });

    if (!updatedSubmission) throw new Error('Submission not found after update.');

    try {
      if (status === 'LOCKED_15D') {
        await NotificationService.notifyUser(
          updatedSubmission.userId,
          'Submission Approved',
          `Your submission for ${updatedSubmission.task.title} passed manual review.`,
          'SUBMISSION_APPROVED',
          updatedSubmission.id,
        );
      } else {
        await NotificationService.notifyUser(
          updatedSubmission.userId,
          'Submission Rejected',
          rejectionReason || 'Your submission did not meet task requirements.',
          'SUBMISSION_REJECTED',
          updatedSubmission.id,
        );
      }
    } catch (notifyError) {
      console.error("Review succeeded, but failed to send notification:", notifyError);
    }

    return updatedSubmission;
  }
}
