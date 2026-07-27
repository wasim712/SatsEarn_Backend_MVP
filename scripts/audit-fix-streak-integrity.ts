import 'dotenv/config';
import { SubmissionStatus } from '@prisma/client';
import { prisma } from '../src/db/prisma.client';
import { normalizeToTimezoneDay } from '../src/utils/reward.util';

// Reconstructs each user's TRUE current streak from raw activity history
// (submissions, standalone submissions, quiz attempts) and compares it to the
// stored `currentStreak`. This exists because of a bug where a user's
// `timezone` could be silently overwritten by the auth middleware on any
// request, which retroactively re-bucketed their past activity into
// different calendar days and could wipe out `currentStreak` with no trace
// (see auth.middleware.ts fix in the same change).
//
// This script NEVER touches balances or lastClaimedStreakMilestone — missed
// milestone payouts are a financial decision and are only flagged here for a
// human to review, never auto-credited.
//
// Two distinct categories come out of this audit, and they are NOT the same:
//
//   UNDERCOUNTED (true > stored) — the user lost streak days they actually
//     earned. This is real harm and is what --apply repairs.
//
//   STALE (true < stored) — an inactive user whose stored streak simply hasn't
//     been lazily reset yet, because the reset only fires on their next
//     dashboard/task/quiz load. Writing 0 here fixes nothing they'd notice:
//     they self-correct on next login. Left alone unless --include-stale.
//
// Usage:
//   npx ts-node scripts/audit-fix-streak-integrity.ts                  (dry run, report only)
//   npx ts-node scripts/audit-fix-streak-integrity.ts --apply          (repairs UNDERCOUNTED only)
//   npx ts-node scripts/audit-fix-streak-integrity.ts --apply --include-stale  (also zeroes stale)

const APPLY = process.argv.includes('--apply');
const INCLUDE_STALE = process.argv.includes('--include-stale');
const DAY_MS = 24 * 60 * 60 * 1000;
const MILESTONES = [7, 21, 60, 90, 180, 365];

interface Finding {
  userId: string;
  email: string;
  timezone: string;
  storedCurrentStreak: number;
  trueCurrentStreak: number;
  storedLastActivityAt: Date | null;
  trueLastActivityAt: Date;
  lastClaimedStreakMilestone: number;
  possibleMissedMilestone: number | null;
}

function computeTrueStreak(sortedDescDayBuckets: Date[], todayBucket: Date): number {
  if (sortedDescDayBuckets.length === 0) return 0;

  const mostRecent = sortedDescDayBuckets[0];
  const diffFromToday = Math.round((todayBucket.getTime() - mostRecent.getTime()) / DAY_MS);

  // More than 1 day since the last activity means the streak is already
  // broken as of today, regardless of how long the prior run was.
  if (diffFromToday > 1) return 0;

  let streak = 1;
  for (let i = 1; i < sortedDescDayBuckets.length; i++) {
    const diff = Math.round(
      (sortedDescDayBuckets[i - 1].getTime() - sortedDescDayBuckets[i].getTime()) / DAY_MS,
    );
    if (diff === 1) {
      streak++;
    } else {
      break;
    }
  }
  return streak;
}

async function main() {
  const users = await prisma.user.findMany({
    where: { isActive: true },
    select: {
      id: true,
      email: true,
      timezone: true,
      currentStreak: true,
      lastActivityAt: true,
      lastClaimedStreakMilestone: true,
    },
  });

  const findings: Finding[] = [];
  const now = new Date();

  for (const user of users) {
    const [submissions, standaloneSubmissions, quizAttempts] = await Promise.all([
      prisma.submission.findMany({
        where: { userId: user.id, status: { not: SubmissionStatus.REJECTED } },
        select: { submittedAt: true },
      }),
      prisma.standaloneSubmission.findMany({
        where: { userId: user.id, status: { not: SubmissionStatus.REJECTED } },
        select: { submittedAt: true },
      }),
      prisma.quizAttempt.findMany({
        where: { userId: user.id },
        select: { createdAt: true },
      }),
    ]);

    const rawTimestamps = [
      ...submissions.map((s) => s.submittedAt),
      ...standaloneSubmissions.map((s) => s.submittedAt),
      ...quizAttempts.map((q) => q.createdAt),
    ];

    if (rawTimestamps.length === 0) continue; // nothing to reconstruct from

    const timezone = user.timezone || 'UTC';
    const dayBuckets = rawTimestamps.map((ts) => normalizeToTimezoneDay(ts, timezone));
    const uniqueSortedDesc = Array.from(new Set(dayBuckets.map((d) => d.getTime())))
      .sort((a, b) => b - a)
      .map((t) => new Date(t));

    const todayBucket = normalizeToTimezoneDay(now, timezone);
    const trueCurrentStreak = computeTrueStreak(uniqueSortedDesc, todayBucket);
    const trueLastActivityAt = new Date(Math.max(...rawTimestamps.map((d) => d.getTime())));

    if (user.currentStreak === trueCurrentStreak) continue;

    const possibleMissedMilestone = MILESTONES.filter(
      (m) => trueCurrentStreak >= m && m > user.lastClaimedStreakMilestone,
    );

    findings.push({
      userId: user.id,
      email: user.email,
      timezone,
      storedCurrentStreak: user.currentStreak,
      trueCurrentStreak,
      storedLastActivityAt: user.lastActivityAt,
      trueLastActivityAt,
      lastClaimedStreakMilestone: user.lastClaimedStreakMilestone,
      possibleMissedMilestone:
        possibleMissedMilestone.length > 0 ? Math.max(...possibleMissedMilestone) : null,
    });
  }

  const undercounted = findings.filter((f) => f.trueCurrentStreak > f.storedCurrentStreak);
  const stale = findings.filter((f) => f.trueCurrentStreak < f.storedCurrentStreak);

  console.log('='.repeat(90));
  console.log(`STREAK INTEGRITY AUDIT ${APPLY ? '(APPLY MODE - writing fixes)' : '(DRY RUN - report only)'}`);
  console.log('='.repeat(90));
  console.log(`Users scanned                : ${users.length}`);
  console.log(`Mismatches total             : ${findings.length}`);
  console.log(`  UNDERCOUNTED (lost streak) : ${undercounted.length}  <-- real harm, repaired by --apply`);
  console.log(`  STALE (inactive, self-heal): ${stale.length}  <-- ${INCLUDE_STALE ? 'will be zeroed (--include-stale)' : 'left alone'}`);

  console.log('\n' + '='.repeat(90));
  console.log('UNDERCOUNTED — users who lost streak days they earned');
  console.log('='.repeat(90));
  if (undercounted.length === 0) {
    console.log('None.');
  }
  for (const f of undercounted) {
    console.log('-'.repeat(90));
    console.log(`Email                       : ${f.email}`);
    console.log(`Timezone                    : ${f.timezone}`);
    console.log(`Stored currentStreak        : ${f.storedCurrentStreak}`);
    console.log(`Reconstructed currentStreak : ${f.trueCurrentStreak}`);
    console.log(`Stored lastActivityAt       : ${f.storedLastActivityAt?.toISOString() ?? 'null'}`);
    console.log(`True lastActivityAt         : ${f.trueLastActivityAt.toISOString()}`);
    if (f.possibleMissedMilestone) {
      console.log(
        `POSSIBLE MISSED MILESTONE   : ${f.possibleMissedMilestone} days (lastClaimed=${f.lastClaimedStreakMilestone}) -- NOT auto-paid, needs manual review of whether a sats bonus is owed`,
      );
    }
  }

  console.log('\n' + '='.repeat(90));
  console.log('STALE — inactive users whose stored streak self-corrects on next login');
  console.log('='.repeat(90));
  for (const f of stale) {
    console.log(
      `${f.email.padEnd(34)} ${String(f.storedCurrentStreak).padStart(2)} -> ${f.trueCurrentStreak}   last activity ${f.trueLastActivityAt.toISOString()}`,
    );
  }

  const toApply = INCLUDE_STALE ? findings : undercounted;

  if (APPLY) {
    console.log(
      `\nApplying currentStreak / lastActivityAt fixes to ${toApply.length} user(s) (no balances or milestones touched)...`,
    );
    for (const f of toApply) {
      await prisma.user.update({
        where: { id: f.userId },
        data: {
          currentStreak: f.trueCurrentStreak,
          lastActivityAt: f.trueLastActivityAt,
        },
      });
      console.log(`Fixed ${f.email}: ${f.storedCurrentStreak} -> ${f.trueCurrentStreak}`);
    }
  } else if (toApply.length > 0) {
    console.log(`\nDry run complete. Re-run with --apply to repair ${toApply.length} user(s).`);
  }

  console.log('='.repeat(90));
}

main()
  .catch((error) => {
    console.error('Streak integrity audit failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
