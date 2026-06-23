import { SubmissionStatus } from '@prisma/client';
import { prisma } from '../../db/prisma.client';
import { NotificationService } from '../notifications/notification.service';
import {
  DEFAULT_SECURITY_LOCK_DAYS,
  getSecurityUnlockAt,
} from '../../utils/submission-flow.util';
import { computeUserBalances } from '../../utils/balance.util';

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

      await prisma.$transaction(async (tx) => {
        await tx.user.update({
          where: { id: user.id },
          data: {
            premiumTier: user.queuedPremiumTier,
            premiumExpiresAt: user.queuedPremiumExpiresAt,
            queuedPremiumTier: null,
            queuedPremiumStartsAt: null,
            queuedPremiumExpiresAt: null,
          },
        });

        const refreshed = await tx.user.findUnique({
          where: { id: user.id },
          select: {
            premiumExpiresAt: true,
            billingRecords: {
              where: { premiumExpiresAt: { not: null } },
              orderBy: [{ premiumExpiresAt: 'asc' }, { createdAt: 'asc' }],
              select: {
                premiumTier: true,
                premiumExpiresAt: true,
              },
            },
          },
        });

        if (refreshed?.premiumExpiresAt) {
          const nextQueuedRecord = refreshed.billingRecords.find(
            (record) => record.premiumExpiresAt && new Date(record.premiumExpiresAt).getTime() > new Date(refreshed.premiumExpiresAt as Date).getTime(),
          );

          await tx.user.update({
            where: { id: user.id },
            data: nextQueuedRecord
              ? {
                  queuedPremiumTier: nextQueuedRecord.premiumTier,
                  queuedPremiumStartsAt: refreshed.premiumExpiresAt,
                  queuedPremiumExpiresAt: nextQueuedRecord.premiumExpiresAt,
                }
              : {
                  queuedPremiumTier: null,
                  queuedPremiumStartsAt: null,
                  queuedPremiumExpiresAt: null,
                },
          });
        }
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

    // Fetch regular submissions with their userId so we can move balances
    const readySubmissions = await prisma.submission.findMany({
      where: {
        status: SubmissionStatus.PENDING_24H,
        unlockAt: { lte: new Date() },
      },
      select: { id: true, userId: true },
    });

    const readyStandaloneSubmissions = await prisma.standaloneSubmission.findMany({
      where: {
        status: SubmissionStatus.PENDING_24H,
        unlockAt: { lte: new Date() },
      },
      select: { id: true, userId: true },
    });

    if (readySubmissions.length === 0 && readyStandaloneSubmissions.length === 0) {
      return { message: 'No submissions are ready for 15-day locking.' };
    }

    const lockAt = getSecurityUnlockAt(settings.securityLockDays);

    let regularCount = 0;
    // Process each regular submission: update status AND move balance
    for (const sub of readySubmissions) {
      await prisma.$transaction(async (tx) => {
        // Find the reward amount from the ledger
        const ledgerEntry = await tx.ledger.findFirst({
          where: {
            referenceId: sub.id,
            userId: sub.userId,
            type: 'TASK_REWARD',
          },
        });

        // Update submission status to LOCKED_15D conditionally to avoid race conditions
        const updateResult = await tx.submission.updateMany({
          where: { id: sub.id, status: SubmissionStatus.PENDING_24H },
          data: {
            status: SubmissionStatus.LOCKED_15D,
            unlockAt: lockAt,
          },
        });

        // If no rows were updated, it was already processed
        if (updateResult.count === 0) return;

        // Move sats from Pending → Locked
        if (ledgerEntry) {
          await tx.user.update({
            where: { id: sub.userId },
            data: {
              balancePending: { decrement: ledgerEntry.amountSats },
              balanceLocked: { increment: ledgerEntry.amountSats },
            },
          });
        }
      });
      regularCount++;
    }

    let standaloneCount = 0;
    // Process each standalone submission: update status AND move balance
    for (const sub of readyStandaloneSubmissions) {
      await prisma.$transaction(async (tx) => {
        const ledgerEntry = await tx.ledger.findFirst({
          where: {
            referenceId: sub.id,
            userId: sub.userId,
            type: 'TASK_REWARD',
          },
        });

        const updateResult = await tx.standaloneSubmission.updateMany({
          where: { id: sub.id, status: SubmissionStatus.PENDING_24H },
          data: {
            status: SubmissionStatus.LOCKED_15D,
            unlockAt: lockAt,
          },
        });

        if (updateResult.count === 0) return;

        if (ledgerEntry) {
          await tx.user.update({
            where: { id: sub.userId },
            data: {
              balancePending: { decrement: ledgerEntry.amountSats },
              balanceLocked: { increment: ledgerEntry.amountSats },
            },
          });
        }
      });
      standaloneCount++;
    }

    return {
      success: true,
      message: `Moved ${regularCount + standaloneCount} submissions into 15-day lock.`,
    };
  }

  /**
   * Finds all submissions where the 15-day timer has expired
   * and safely moves the user's funds from Locked to Available.
   */
  static async process15DayUnlocks() {
    // 1. Find all submissions whose timer is in the past!
    const readySubmissions = await prisma.submission.findMany({
      where: {
        status: SubmissionStatus.LOCKED_15D,
        unlockAt: { lte: new Date() }
      },
      select: { id: true, userId: true }
    });

    let unlockedCount = 0;
    let totalSatsUnlocked = 0;

    const readyStandaloneSubmissions = await prisma.standaloneSubmission.findMany({
      where: {
        status: SubmissionStatus.LOCKED_15D,
        unlockAt: { lte: new Date() }
      },
      select: { id: true, userId: true }
    });

    if (readySubmissions.length === 0 && readyStandaloneSubmissions.length === 0) {
      return { message: "No funds are currently scheduled to unlock." };
    }

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

        // B. Mark submission as officially withdrawable conditionally
        const updateResult = await tx.submission.updateMany({
          where: { id: sub.id, status: SubmissionStatus.LOCKED_15D },
          data: { status: SubmissionStatus.WITHDRAWABLE }
        });

        if (updateResult.count === 0) return;

        // C. MOVE THE MONEY! 💰 (Locked -> Available)
        await tx.user.update({
          where: { id: sub.userId },
          data: {
            balanceLocked: { decrement: satsToUnlock },
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

    // 3. Process standalone submissions
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

        const updateResult = await tx.standaloneSubmission.updateMany({
          where: { id: sub.id, status: SubmissionStatus.LOCKED_15D },
          data: { status: SubmissionStatus.WITHDRAWABLE }
        });

        if (updateResult.count === 0) return;

        await tx.user.update({
          where: { id: sub.userId },
          data: {
            balanceLocked: { decrement: satsToUnlock },
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

  /**
   * Reconciles balances for users with negative stored values.
   * Uses computeUserBalances (the single source of truth) to derive
   * the correct values from the ledger + submission statuses, then
   * overwrites the corrupted denormalized fields.
   */
  static async reconcileNegativeBalances() {
    const corruptedUsers = await prisma.user.findMany({
      where: {
        OR: [
          { balancePending: { lt: 0 } },
          { balanceLocked: { lt: 0 } },
          { balanceAvailable: { lt: 0 } },
        ],
      },
      select: { id: true, balancePending: true, balanceLocked: true, balanceAvailable: true },
    });

    if (corruptedUsers.length === 0) {
      return { message: 'No corrupted balances found.' };
    }

    let reconciledCount = 0;

    for (const user of corruptedUsers) {
      const computed = await computeUserBalances(user.id);

      const updates: Record<string, number> = {};
      if (user.balancePending < 0) {
        updates.balancePending = computed.pending;
      }
      if (user.balanceLocked < 0) {
        updates.balanceLocked = computed.locked;
      }
      if (user.balanceAvailable < 0) {
        updates.balanceAvailable = computed.available;
      }

      if (Object.keys(updates).length > 0) {
        await prisma.user.update({
          where: { id: user.id },
          data: updates,
        });

        console.log(
          `[RECONCILE] User ${user.id}: ` +
          `pending ${user.balancePending} → ${updates.balancePending ?? user.balancePending}, ` +
          `locked ${user.balanceLocked} → ${updates.balanceLocked ?? user.balanceLocked}, ` +
          `available ${user.balanceAvailable} → ${updates.balanceAvailable ?? user.balanceAvailable}`,
        );
        reconciledCount++;
      }
    }

    return {
      success: true,
      message: `Reconciled ${reconciledCount} user(s) with corrupted balances.`,
    };
  }

  /**
   * Processes quiz reward unlocks.
   * Finds QuizAttempts where unlockAt has passed but rewardUnlockedAt is null,
   * and moves the reward sats from balanceLocked → balanceAvailable.
   */
  static async processQuizRewardUnlocks() {
    const readyAttempts = await prisma.quizAttempt.findMany({
      where: {
        unlockAt: { lte: new Date() },
        rewardUnlockedAt: null,
        passed: true,
        OR: [
          { rewardSats: { gt: 0 } },
          { streakBonusSats: { gt: 0 } },
        ],
      },
      select: {
        id: true,
        userId: true,
        rewardSats: true,
        streakBonusSats: true,
      },
    });

    if (readyAttempts.length === 0) {
      return { message: 'No quiz rewards are ready to unlock.' };
    }

    let unlockedCount = 0;
    let totalSatsUnlocked = 0;

    for (const attempt of readyAttempts) {
      const satsToUnlock = (attempt.rewardSats || 0) + (attempt.streakBonusSats || 0);
      if (satsToUnlock <= 0) continue;

      await prisma.$transaction(async (tx) => {
        // Mark as unlocked atomically
        const updateResult = await tx.quizAttempt.updateMany({
          where: {
            id: attempt.id,
            rewardUnlockedAt: null, // Guard against double-processing
          },
          data: {
            rewardUnlockedAt: new Date(),
          },
        });

        if (updateResult.count === 0) return;

        // Move sats: Locked → Available
        await tx.user.update({
          where: { id: attempt.userId },
          data: {
            balanceLocked: { decrement: satsToUnlock },
            balanceAvailable: { increment: satsToUnlock },
          },
        });

        totalSatsUnlocked += satsToUnlock;
      });

      if (satsToUnlock > 0) {
        try {
          await NotificationService.notifyUser(
            attempt.userId,
            'Quiz Reward Unlocked',
            `${satsToUnlock} Sats from your daily quiz are now available in your wallet balance.`,
            'SYSTEM_ALERT',
            attempt.id,
          );
        } catch (notifyError) {
          console.error('Quiz reward unlocked, but notification failed:', notifyError);
        }
      }

      unlockedCount++;
    }

    return {
      success: true,
      message: `Unlocked ${totalSatsUnlocked} Sats from ${unlockedCount} quiz reward(s).`,
    };
  }
}
