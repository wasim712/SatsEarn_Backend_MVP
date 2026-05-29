import { SubmissionStatus } from '@prisma/client';
import { prisma } from '../../db/prisma.client'; // Adjust path if needed
import { NotificationService } from '../notifications/notification.service';
import {
  DEFAULT_SECURITY_LOCK_DAYS,
  getSecurityUnlockAt,
} from '../../utils/submission-flow.util';

export class CronService {
  static async processQueuedPremiumTransitions() {
    const now = new Date();

    const usersReadyForQueuedPremium = await prisma.user.findMany({
      where: {
        queuedPremiumTier: { not: null },
        queuedPremiumStartsAt: { lte: now },
        queuedPremiumExpiresAt: { gt: now },
        OR: [
          { premiumExpiresAt: null },
          { premiumExpiresAt: { lte: now } },
        ],
      },
      select: {
        id: true,
        queuedPremiumTier: true,
        queuedPremiumStartsAt: true,
        queuedPremiumExpiresAt: true,
      },
    });

    if (usersReadyForQueuedPremium.length === 0) {
      return { message: 'No queued premium upgrades are ready to activate.' };
    }

    let activatedCount = 0;

    for (const user of usersReadyForQueuedPremium) {
      if (!user.queuedPremiumTier || !user.queuedPremiumExpiresAt) {
        continue;
      }

      await prisma.user.update({
        where: { id: user.id },
        data: {
          premiumTier: user.queuedPremiumTier,
          premiumExpiresAt: user.queuedPremiumExpiresAt,
          queuedPremiumTier: null,
          queuedPremiumStartsAt: null,
          queuedPremiumExpiresAt: null,
        },
      });

      try {
        await NotificationService.notifyUser(
          user.id,
          'Queued Premium Activated',
          `Your queued ${user.queuedPremiumTier} subscription is now active.`,
          'SYSTEM_ALERT',
          user.id,
        );
      } catch (notifyError) {
        console.error('Queued premium activated, but notification failed:', notifyError);
      }

      activatedCount++;
    }

    return {
      success: true,
      message: `Activated ${activatedCount} queued premium subscriptions.`,
    };
  }

  static async process24HourReviewQueue() {
    const settings = await prisma.platformSettings.findFirst() || {
      securityLockDays: DEFAULT_SECURITY_LOCK_DAYS,
    };

    const readySubmissions = await prisma.submission.findMany({
      where: {
        status: SubmissionStatus.PENDING_24H,
        unlockAt: { lte: new Date() },
      },
      select: { id: true },
    });

    if (readySubmissions.length === 0) {
      return { message: 'No submissions are ready for 15-day locking.' };
    }

    const lockAt = getSecurityUnlockAt(settings.securityLockDays);

    const result = await prisma.submission.updateMany({
      where: {
        id: { in: readySubmissions.map((submission) => submission.id) },
        status: SubmissionStatus.PENDING_24H,
      },
      data: {
        status: SubmissionStatus.LOCKED_15D,
        unlockAt: lockAt,
      },
    });

    const readyStandaloneSubmissions = await prisma.standaloneSubmission.findMany({
      where: {
        status: SubmissionStatus.PENDING_24H,
        unlockAt: { lte: new Date() },
      },
      select: { id: true },
    });

    let standaloneCount = 0;
    if (readyStandaloneSubmissions.length > 0) {
      const standaloneResult = await prisma.standaloneSubmission.updateMany({
        where: {
          id: { in: readyStandaloneSubmissions.map((submission) => submission.id) },
          status: SubmissionStatus.PENDING_24H,
        },
        data: {
          status: SubmissionStatus.LOCKED_15D,
          unlockAt: lockAt,
        },
      });
      standaloneCount = standaloneResult.count;
    }

    return {
      success: true,
      message: `Moved ${result.count + standaloneCount} submissions into 15-day lock.`,
    };
  }

  /**
   * Finds all submissions where the 15-day timer has expired
   * and safely moves the user's funds from Pending to Available.
   */
  static async process15DayUnlocks() {
    // 1. Find all submissions whose timer is in the past!
    const readySubmissions = await prisma.submission.findMany({
      where: {
        status: SubmissionStatus.LOCKED_15D,
        unlockAt: { lte: new Date() } // Less than or equal to RIGHT NOW
      },
      select: { id: true, userId: true }
    });

    if (readySubmissions.length === 0) {
      return { message: "No funds are currently scheduled to unlock." };
    }

    let unlockedCount = 0;
    let totalSatsUnlocked = 0;

    // 2. Process them one by one safely
    for (const sub of readySubmissions) {
      let satsUnlockedForSubmission = 0;

      await prisma.$transaction(async (tx) => {
        
        // A. Find the exact amount we promised them in the Ledger
        const ledgerEntry = await tx.ledger.findFirst({
          where: {
            referenceId: sub.id,
            userId: sub.userId,
            type: 'TASK_REWARD'
          }
        });

        // If ledger is missing, skip to prevent crashing the whole loop
        if (!ledgerEntry) return; 

        const satsToUnlock = ledgerEntry.amountSats;
        satsUnlockedForSubmission = satsToUnlock;

        // B. Mark submission as officially withdrawable
        await tx.submission.update({
          where: { id: sub.id },
          data: { status: SubmissionStatus.WITHDRAWABLE }
        });

        // C. MOVE THE MONEY! 💰 (Pending -> Available)
        await tx.user.update({
          where: { id: sub.userId },
          data: {
            balancePending: { decrement: satsToUnlock },
            balanceAvailable: { increment: satsToUnlock }
          }
        });

        totalSatsUnlocked += satsToUnlock;
      });

      if (satsUnlockedForSubmission > 0) {
        try {
          await NotificationService.notifyUser(
            sub.userId,
            'Funds Unlocked',
            `${satsUnlockedForSubmission} Sats from your accepted submission are now available in your wallet balance.`,
            'SYSTEM_ALERT',
            sub.id,
          );
        } catch (notifyError) {
          console.error('Funds unlocked, but failed to send notification:', notifyError);
        }
      }
      
      unlockedCount++;
    }

    const readyStandaloneSubmissions = await prisma.standaloneSubmission.findMany({
      where: {
        status: SubmissionStatus.LOCKED_15D,
        unlockAt: { lte: new Date() }
      },
      select: { id: true, userId: true }
    });

    for (const sub of readyStandaloneSubmissions) {
      let satsUnlockedForSubmission = 0;

      await prisma.$transaction(async (tx) => {
        const ledgerEntry = await tx.ledger.findFirst({
          where: {
            referenceId: sub.id,
            userId: sub.userId,
            type: 'TASK_REWARD'
          }
        });

        if (!ledgerEntry) return;

        const satsToUnlock = ledgerEntry.amountSats;
        satsUnlockedForSubmission = satsToUnlock;

        await tx.standaloneSubmission.update({
          where: { id: sub.id },
          data: { status: SubmissionStatus.WITHDRAWABLE }
        });

        await tx.user.update({
          where: { id: sub.userId },
          data: {
            balancePending: { decrement: satsToUnlock },
            balanceAvailable: { increment: satsToUnlock }
          }
        });

        totalSatsUnlocked += satsToUnlock;
      });

      if (satsUnlockedForSubmission > 0) {
        try {
          await NotificationService.notifyUser(
            sub.userId,
            'Funds Unlocked',
            `${satsUnlockedForSubmission} Sats from your accepted standalone submission are now available in your wallet balance.`,
            'SYSTEM_ALERT',
            sub.id,
          );
        } catch (notifyError) {
          console.error('Funds unlocked, but failed to send notification:', notifyError);
        }
      }

      unlockedCount++;
    }

    return { 
      success: true,
      message: `Cron Success! Moved ${totalSatsUnlocked} Sats to Available Balance across ${unlockedCount} tasks.` 
    };
  }
}
