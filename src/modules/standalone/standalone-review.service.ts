import { SubmissionStatus } from '@prisma/client';
import { prisma } from '../../db/prisma.client';
import { TierUtils } from '../../utils/tier.utils';
import { NotificationService } from '../notifications/notification.service';
import {
  DEFAULT_SECURITY_LOCK_DAYS,
  getSecurityUnlockAt,
} from '../../utils/submission-flow.util';

export class StandaloneReviewService {
  static async getPendingSubmissions() {
    const submissions = await prisma.standaloneSubmission.findMany({
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
        standaloneTask: true,
      },
      orderBy: { submittedAt: 'asc' },
    });

    return submissions.map((submission) => {
      const user = submission.user as any;
      const isPremium = TierUtils.isPremiumActive(user);
      const activeTier = isPremium ? user.premiumTier : TierUtils.getFreeTier(user.totalXp || 0);
      return {
        ...submission,
        proofType: 'standalone',
        task: {
          title: submission.standaloneTask.title,
          campaign: { title: 'Standalone Task', baseRewardSats: 0, tierRewardMatrix: submission.standaloneTask.tierRewardMatrix as any },
        },
        user: { ...submission.user, isPremium, activeTier },
      };
    });
  }

  static async reviewSubmission(submissionId: string, status: 'LOCKED_15D' | 'REJECTED', rejectionReason?: string, adminId?: string) {
    const existingSubmission = await prisma.standaloneSubmission.findUnique({
      where: { id: submissionId },
      include: { standaloneTask: true },
    });

    if (!existingSubmission) throw new Error('Submission not found');
    if (existingSubmission.status !== SubmissionStatus.MANUAL_REVIEW) {
      throw new Error(`Submission already processed: ${existingSubmission.status}`);
    }

    const settings = await prisma.platformSettings.findFirst() || {
      securityLockDays: DEFAULT_SECURITY_LOCK_DAYS,
    };

    const updateResult = await prisma.$transaction(async (tx) => {
      const result = await tx.standaloneSubmission.updateMany({
        where: { id: submissionId, status: SubmissionStatus.MANUAL_REVIEW },
        data: {
          status,
          reviewedById: adminId,
          rejectionReason: status === 'REJECTED' ? rejectionReason : null,
          unlockAt: status === 'LOCKED_15D' ? getSecurityUnlockAt(settings.securityLockDays) : undefined,
        },
      });

      // Move sats from Pending → Locked when approving
      if (result.count > 0 && status === 'LOCKED_15D') {
        const ledgerEntry = await tx.ledger.findFirst({
          where: {
            referenceId: submissionId,
            userId: existingSubmission.userId,
            type: 'TASK_REWARD',
          },
        });

        if (ledgerEntry) {
          await tx.user.update({
            where: { id: existingSubmission.userId },
            data: {
              balancePending: { decrement: ledgerEntry.amountSats },
              balanceLocked: { increment: ledgerEntry.amountSats },
            },
          });
        }
      }

      return result;
    });

    if (updateResult.count === 0) {
      throw new Error('Submission was already processed by another admin.');
    }

    const updatedSubmission = await prisma.standaloneSubmission.findUnique({
      where: { id: submissionId },
      include: { standaloneTask: true },
    });
    if (!updatedSubmission) throw new Error('Submission not found after update.');

    if (status === 'LOCKED_15D') {
      await NotificationService.notifyUser(
        updatedSubmission.userId,
        'Submission Approved',
        `Your submission for ${updatedSubmission.standaloneTask.title} passed manual review.`,
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

    return updatedSubmission;
  }
}
