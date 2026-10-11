/**
 * READ-ONLY audit for SAT-WORM XP farming (H-3).
 *
 * Before the fix, every claim gave 5 XP with no cap. The new limit is 5 claims per UTC day,
 * so any user/day above that was scripted. XP sets the free tier, which sets task payouts.
 *
 *   npx ts-node scripts/audit-xp-outliers.ts
 */
import { prisma } from '../src/db/prisma.client';

const DAILY_LIMIT = 5;
const XP_PER_CLAIM = 5;

async function main() {
  const claims = await prisma.ledger.findMany({
    where: { type: 'MINIGAME_XP_REWARD' },
    select: { userId: true, createdAt: true },
  });

  const perUser = new Map<string, { claims: number; days: Map<string, number> }>();
  for (const claim of claims) {
    const day = claim.createdAt.toISOString().slice(0, 10);
    const entry = perUser.get(claim.userId) || { claims: 0, days: new Map<string, number>() };
    entry.claims += 1;
    entry.days.set(day, (entry.days.get(day) || 0) + 1);
    perUser.set(claim.userId, entry);
  }

  const flagged = [...perUser.entries()]
    .map(([userId, entry]) => {
      const overLimitDays = [...entry.days.values()].filter((count) => count > DAILY_LIMIT);
      const excessClaims = [...entry.days.values()].reduce((sum, count) => sum + Math.max(0, count - DAILY_LIMIT), 0);
      return {
        userId,
        totalClaims: entry.claims,
        minigameXp: entry.claims * XP_PER_CLAIM,
        daysOverLimit: overLimitDays.length,
        maxClaimsInADay: Math.max(...entry.days.values()),
        excessXp: excessClaims * XP_PER_CLAIM,
      };
    })
    .filter((row) => row.daysOverLimit > 0)
    .sort((a, b) => b.excessXp - a.excessXp);

  if (flagged.length === 0) {
    console.log(`Checked ${claims.length} SAT-WORM claims: nobody went over ${DAILY_LIMIT} claims in a day.`);
    return;
  }

  const users = await prisma.user.findMany({
    where: { id: { in: flagged.map((row) => row.userId) } },
    select: { id: true, email: true, totalXp: true },
  });
  const userById = new Map(users.map((user) => [user.id, user]));

  console.log(`Checked ${claims.length} SAT-WORM claims. ${flagged.length} user(s) exceeded ${DAILY_LIMIT}/day:\n`);
  console.table(flagged.map((row) => ({
    ...row,
    email: userById.get(row.userId)?.email,
    totalXp: userById.get(row.userId)?.totalXp,
    xpWithoutExcess: (userById.get(row.userId)?.totalXp ?? 0) - row.excessXp,
  })));
  console.log('\nxpWithoutExcess shows where each user would stand without the farmed XP (it decides their tier).');
}

main()
  .catch((error) => {
    console.error('Audit failed:', error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
