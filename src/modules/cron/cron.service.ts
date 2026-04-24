import { SubmissionStatus } from '@prisma/client';
import { prisma } from '../../db/prisma.client'; // Adjust path if needed

export class CronService {
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
      
      unlockedCount++;
    }

    return { 
      success: true,
      message: `Cron Success! Moved ${totalSatsUnlocked} Sats to Available Balance across ${unlockedCount} tasks.` 
    };
  }
}