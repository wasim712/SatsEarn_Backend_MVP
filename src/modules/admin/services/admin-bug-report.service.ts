import { BugReportStatus } from '@prisma/client';
import { prisma } from '../../../db/prisma.client';
import { NotificationService } from '../../notifications/notification.service';
import { TierUtils } from '../../../utils/tier.utils';

export class AdminBugReportService {
  static async getAllBugReports() {
    const reports = await prisma.bugReport.findMany({
      include: {
        user: {
          select: {
            id: true,
            email: true,
            fullName: true,
            totalXp: true,
            premiumTier: true,
            premiumExpiresAt: true,
          } as any,
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return reports.map((report) => {
      const user = report.user as any;
      const isPremium = TierUtils.isPremiumActive(user);
      const freeTier = TierUtils.getFreeTier(user.totalXp || 0);

      return {
        ...report,
        user: {
          ...report.user,
          activeTier: isPremium ? user.premiumTier : freeTier,
        },
      };
    });
  }

  static async reviewBugReport(reportId: string, adminId: string, payload: { status: 'REWARDED' | 'REJECTED'; rewardSats?: number; adminNotes?: string }) {
    return prisma.$transaction(async (tx) => {
      const rewardSats = payload.status === 'REWARDED' ? Number(payload.rewardSats || 0) : 0;
      const existingReport = await tx.bugReport.findUnique({ where: { id: reportId } });

      if (!existingReport) {
        throw new Error('Bug report not found.');
      }

      const updated = await tx.bugReport.updateMany({
        where: { id: reportId, status: BugReportStatus.OPEN },
        data: {
          status: payload.status,
          rewardSats,
          adminNotes: payload.adminNotes || null,
          reviewedById: adminId,
          reviewedAt: new Date(),
        },
      });

      if (updated.count === 0) {
        throw new Error('Bug report already reviewed.');
      }

      const finalReport = await tx.bugReport.findUnique({ where: { id: reportId } });
      if (!finalReport) throw new Error('Bug report not found.');

      if (payload.status === 'REWARDED' && rewardSats > 0) {
        await tx.user.update({
          where: { id: existingReport.userId },
          data: { balanceAvailable: { increment: rewardSats } },
        });
        await tx.ledger.create({
          data: {
            userId: existingReport.userId,
            amountSats: rewardSats,
            type: 'TASK_REWARD',
            description: `Bug bounty reward: ${existingReport.title}`,
            referenceId: finalReport.id,
          },
        });
        await NotificationService.notifyUser(
          existingReport.userId,
          'Bug Bounty Reward Approved',
          `Your bug report was approved and rewarded with ${rewardSats} sats.`,
          'SYSTEM_ALERT',
          finalReport.id,
        );
      } else {
        await NotificationService.notifyUser(
          existingReport.userId,
          'Bug Report Rejected',
          payload.adminNotes || 'Your bug report was reviewed and not approved for reward.',
          'SYSTEM_ALERT',
          finalReport.id,
        );
      }

      return finalReport;
    });
  }
}
