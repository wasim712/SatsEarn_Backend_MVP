import { SubmissionStatus } from '@prisma/client';
import { prisma } from '../../../db/prisma.client';
import { TierUtils } from '../../../utils/tier.utils';
import {
  getReferralBonusAmount,
  getReviewReleaseAt,
} from '../../../utils/submission-flow.util';
import { NotificationService } from '../../notifications/notification.service';
import { AiVerificationService } from '../../verification/verification.service';

export class UserSubmissionService {
  static async submitTask(
    userId: string,
    taskId: string,
    proofData: { screenshotUrl?: string; proofText?: string },
    clientIp: string = 'UNKNOWN',
  ) {
    const settings = (await prisma.platformSettings.findFirst()) || {
      referralBonusPercent: 5,
      securityLockDays: 15,
    };

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        referredById: true,
        fullName: true,
        totalXp: true,
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
    if (existing) {
      throw new Error('You have already submitted proof for this task.');
    }

    const rulesContext = task.requirements || task.description || task.campaign.description;
    const proofContent = proofData.screenshotUrl || proofData.proofText || '';
    const aiResult = await AiVerificationService.analyzeProof(proofContent, rulesContext);

    let determinedStatus: SubmissionStatus = SubmissionStatus.PENDING_24H;
    if (aiResult.score >= 90) determinedStatus = SubmissionStatus.PENDING_24H;
    else if (aiResult.score >= 70) determinedStatus = SubmissionStatus.MANUAL_REVIEW;
    else determinedStatus = SubmissionStatus.REJECTED;

    const baseReward = task.baseRewardSatsOverride || task.campaign.baseRewardSats;
    const rewardMatrix: any = task.tierRewardMatrixOverride || task.campaign.tierRewardMatrix;

    const hasPremium = TierUtils.isPremiumActive(user as any);
    const activeTier = hasPremium ? user.premiumTier : TierUtils.getFreeTier(user.totalXp);
    const workerReward = Number(rewardMatrix[activeTier as string]) || baseReward;

    const submission = await prisma.$transaction(
      async (tx) => {
        const liveCampaign = await tx.campaign.findUnique({ where: { id: task.campaign.id } });
        if (!liveCampaign || liveCampaign.totalCompletions >= liveCampaign.maxCompletions) {
          throw new Error('This campaign filled up while your proof was being verified.');
        }

        const submission = await tx.submission.create({
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
            data: { balancePending: { increment: workerReward } },
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

          if (user.referredById) {
            const referrer = await tx.user.findUnique({ where: { id: user.referredById } });

            if (referrer) {
              const commissionPercent = TierUtils.getReferralCommission(
                referrer as any,
                settings.referralBonusPercent,
              );
              const referralBonus = getReferralBonusAmount(baseReward, commissionPercent);

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

          await tx.campaign.update({
            where: { id: liveCampaign.id },
            data: { totalCompletions: { increment: 1 } },
          });
        }

        return submission;
      },
      { isolationLevel: 'Serializable' },
    );

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
