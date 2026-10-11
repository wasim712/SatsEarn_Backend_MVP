/**
 * READ-ONLY audit for the daily-quiz replay bug (C-1).
 *
 * Before the fix, POST /quiz/today/submit paid again on every call and accepted any quiz date.
 * This lists:
 *   - attempts paid more than once (several DAILY_QUIZ_REWARD rows for one attempt)
 *   - rewards paid for a quiz whose date was not the day it was paid (past/future quiz played)
 *
 *   npx ts-node scripts/audit-quiz-replays.ts
 */
import { prisma } from '../src/db/prisma.client';

const DAY_MS = 24 * 60 * 60 * 1000;

async function main() {
  const rewards = await prisma.ledger.findMany({
    where: { type: 'DAILY_QUIZ_REWARD' },
    select: { userId: true, referenceId: true, amountSats: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
  });

  const attemptIds = [...new Set(rewards.map((row) => row.referenceId).filter((id): id is string => Boolean(id)))];
  const attempts = await prisma.quizAttempt.findMany({
    where: { id: { in: attemptIds } },
    select: { id: true, dailyQuiz: { select: { date: true, xpReward: true, title: true } } },
  });
  const attemptById = new Map(attempts.map((attempt) => [attempt.id, attempt]));

  type UserFinding = { replays: number; overpaidSats: number; extraXpEstimate: number; offDayRewards: number };
  const findings = new Map<string, UserFinding>();
  const finding = (userId: string) => {
    if (!findings.has(userId)) findings.set(userId, { replays: 0, overpaidSats: 0, extraXpEstimate: 0, offDayRewards: 0 });
    return findings.get(userId)!;
  };

  const byAttempt = new Map<string, typeof rewards>();
  for (const row of rewards) {
    if (!row.referenceId) continue;
    byAttempt.set(row.referenceId, [...(byAttempt.get(row.referenceId) || []), row]);
  }

  for (const [attemptId, rows] of byAttempt) {
    const attempt = attemptById.get(attemptId);

    if (rows.length > 1) {
      const entry = finding(rows[0].userId);
      const extra = rows.slice(1);
      entry.replays += extra.length;
      entry.overpaidSats += extra.reduce((sum, row) => sum + row.amountSats, 0);
      entry.extraXpEstimate += extra.length * (attempt?.dailyQuiz.xpReward ?? 0);
    }

    // Paid more than a day away from the quiz's own date: a past or future quiz was played.
    if (attempt && Math.abs(rows[0].createdAt.getTime() - attempt.dailyQuiz.date.getTime()) > 2 * DAY_MS) {
      finding(rows[0].userId).offDayRewards += 1;
    }
  }

  if (findings.size === 0) {
    console.log(`Checked ${rewards.length} quiz reward rows: no replays or off-day rewards found.`);
    return;
  }

  const users = await prisma.user.findMany({
    where: { id: { in: [...findings.keys()] } },
    select: { id: true, email: true, totalXp: true, balanceAvailable: true, balanceLocked: true },
  });

  const rows = users
    .map((user) => ({ ...user, ...findings.get(user.id)! }))
    .sort((a, b) => b.overpaidSats - a.overpaidSats);

  console.log(`Checked ${rewards.length} quiz reward rows. ${rows.length} user(s) flagged:\n`);
  console.table(rows.map((row) => ({
    userId: row.id,
    email: row.email,
    replays: row.replays,
    overpaidSats: row.overpaidSats,
    extraXpEstimate: row.extraXpEstimate,
    offDayRewards: row.offDayRewards,
    totalXp: row.totalXp,
    available: row.balanceAvailable,
    locked: row.balanceLocked,
  })));
  console.log('\nNext: pause withdrawals for these users, then reverse the overpaid sats/XP with reviewed ledger entries.');
}

main()
  .catch((error) => {
    console.error('Audit failed:', error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
