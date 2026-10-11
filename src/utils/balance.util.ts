import { SubmissionStatus } from '@prisma/client';
import { prisma } from '../db/prisma.client';

/**
 * Computes the TRUE user balances by deriving them from the Ledger table
 * combined with Submission / StandaloneSubmission / QuizAttempt statuses.
 *
 * This is the SINGLE SOURCE OF TRUTH for balance computation.
 * The denormalized fields on the User model (balancePending, balanceLocked,
 * balanceAvailable) are treated as a performance cache and reconciled
 * periodically by the cron job.
 */
export async function computeUserBalances(userId: string, options: { clamp?: boolean } = {}) {
  // Fetch all ledger entries for this user in one query
  const ledgerEntries = await prisma.ledger.findMany({
    where: { userId },
    select: {
      amountSats: true,
      amountMsats: true,
      type: true,
      referenceId: true,
    },
  });

  // Pre-fetch all submission statuses that are referenced by ledger entries
  const referenceIds = ledgerEntries
    .map((e) => e.referenceId)
    .filter((id): id is string => Boolean(id));

  const uniqueReferenceIds = [...new Set(referenceIds)];

  // Batch-fetch all linked submissions in parallel
  const [regularSubmissions, standaloneSubmissions, quizAttempts] = await Promise.all([
    uniqueReferenceIds.length > 0
      ? prisma.submission.findMany({
          where: { id: { in: uniqueReferenceIds } },
          select: { id: true, status: true },
        })
      : Promise.resolve([]),
    uniqueReferenceIds.length > 0
      ? prisma.standaloneSubmission.findMany({
          where: { id: { in: uniqueReferenceIds } },
          select: { id: true, status: true },
        })
      : Promise.resolve([]),
    uniqueReferenceIds.length > 0
      ? prisma.quizAttempt.findMany({
          where: { id: { in: uniqueReferenceIds } },
          select: { id: true, unlockAt: true, rewardUnlockedAt: true },
        })
      : Promise.resolve([]),
  ]);

  // Build lookup maps
  const submissionStatusMap = new Map<string, SubmissionStatus>();
  for (const sub of regularSubmissions) {
    submissionStatusMap.set(sub.id, sub.status);
  }
  for (const sub of standaloneSubmissions) {
    submissionStatusMap.set(sub.id, sub.status);
  }

  const quizAttemptMap = new Map<string, { unlockAt: Date | null; rewardUnlockedAt: Date | null }>();
  for (const qa of quizAttempts) {
    quizAttemptMap.set(qa.id, { unlockAt: qa.unlockAt, rewardUnlockedAt: qa.rewardUnlockedAt });
  }

  let pending = 0;
  let locked = 0;
  let available = 0;

  const now = new Date();

  for (const entry of ledgerEntries) {
    const sats = entry.amountSats;
    const type = entry.type;
    const refId = entry.referenceId;

    switch (type) {
      case 'TASK_REWARD': {
        if (!refId) {
          // No reference — treat as available (shouldn't normally happen)
          available += sats;
          break;
        }

        const subStatus = submissionStatusMap.get(refId);
        const quizAttempt = quizAttemptMap.get(refId);

        if (subStatus) {
          // Linked to a submission — bucket based on submission status
          switch (subStatus) {
            case SubmissionStatus.PENDING_24H:
              pending += sats;
              break;
            case SubmissionStatus.LOCKED_15D:
              locked += sats;
              break;
            case SubmissionStatus.WITHDRAWABLE:
              available += sats;
              break;
            case SubmissionStatus.MANUAL_REVIEW:
              // MANUAL_REVIEW submissions don't have ledger entries normally,
              // but if one exists, treat it as pending
              pending += sats;
              break;
            case SubmissionStatus.REJECTED:
              // Rejected — sats go nowhere (already rolled back or never credited)
              break;
          }
        } else if (quizAttempt) {
          // Bug report rewards also use TASK_REWARD type but link to bugReport ID
          // which won't match submissions or quizAttempts — falls through to else
          // Quiz-linked TASK_REWARD: not expected but handle gracefully
          available += sats;
        } else {
          // Not linked to any submission or quiz — could be a bug bounty reward
          // which goes directly to available
          available += sats;
        }
        break;
      }

      case 'REFERRAL_BONUS': {
        if (!refId) {
          // Unlinked referral bonus — treat as available
          available += sats;
          break;
        }

        const subStatus = submissionStatusMap.get(refId);
        if (subStatus) {
          switch (subStatus) {
            case SubmissionStatus.PENDING_24H:
              pending += sats;
              break;
            case SubmissionStatus.LOCKED_15D:
              // Referral bonuses stay in pending even when submission moves to locked
              // (the cron only moves TASK_REWARD amounts, not referral bonuses)
              // But they should still be "pending" until the submission is withdrawable
              pending += sats;
              break;
            case SubmissionStatus.WITHDRAWABLE:
              available += sats;
              break;
            case SubmissionStatus.MANUAL_REVIEW:
              pending += sats;
              break;
            case SubmissionStatus.REJECTED:
              break;
          }
        } else {
          // Referenced ID doesn't match any submission — treat as available
          available += sats;
        }
        break;
      }

      case 'DAILY_QUIZ_REWARD': {
        // Quiz rewards go directly to locked, then to available after unlock
        if (refId) {
          const quizAttempt = quizAttemptMap.get(refId);
          if (quizAttempt) {
            const isUnlocked = quizAttempt.rewardUnlockedAt
              || (quizAttempt.unlockAt && quizAttempt.unlockAt <= now);
            if (isUnlocked) {
              available += sats;
            } else {
              locked += sats;
            }
            break;
          }
        }
        // Fallback: treat as locked
        locked += sats;
        break;
      }

      case 'STREAK_BONUS': {
        // Streak bonuses from task submissions go to available directly
        // Streak bonuses from quizzes go to locked (alongside quiz reward)
        if (refId) {
          const quizAttempt = quizAttemptMap.get(refId);
          if (quizAttempt) {
            // Quiz streak bonus — follows quiz unlock timing
            const isUnlocked = quizAttempt.rewardUnlockedAt
              || (quizAttempt.unlockAt && quizAttempt.unlockAt <= now);
            if (isUnlocked) {
              available += sats;
            } else {
              locked += sats;
            }
            break;
          }
        }
        // Task submission streak bonus — goes directly to available
        available += sats;
        break;
      }

      case 'WELCOME_BONUS': {
        locked += sats;
        break;
      }

      case 'WITHDRAWAL': {
        // Negative amount — subtracts from available
        available += sats; // sats is already negative
        break;
      }

      case 'PENALTY': {
        // Negative amount — premium purchase deduction
        available += sats; // sats is already negative
        break;
      }

      case 'MINIGAME_XP_REWARD': {
        // 0 sats — XP only, no balance impact
        break;
      }

      default: {
        // Unknown type — treat as available if positive
        if (sats > 0) {
          available += sats;
        } else {
          available += sats;
        }
        break;
      }
    }
  }

  // Raw values let callers see a real debt (e.g. spending more than was available).
  if (options.clamp === false) {
    return { pending, locked, available };
  }

  // Ensure no bucket goes negative due to rounding or edge cases
  return {
    pending: Math.max(0, pending),
    locked: Math.max(0, locked),
    available: Math.max(0, available),
  };
}

/**
 * Fetches the referral pending msats balance from the user record.
 * This is a sub-sat fractional accumulator that doesn't go through
 * the ledger in the same way, so we read it directly.
 */
export async function getReferralPendingMsats(userId: string): Promise<number> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { referralPendingMsats: true },
  });
  return Math.max(0, user?.referralPendingMsats || 0);
}
