// Recomputes User.currentStreak from raw activity history (Submission, StandaloneSubmission,
// QuizAttempt), bucketing each activity into the user's local calendar day (per User.timezone,
// default 'UTC') instead of the old always-UTC bucketing that could undercount streaks.
//
// Usage:
//   node scripts/backfill-streaks.js            (dry run -- report only, no writes)
//   node scripts/backfill-streaks.js --apply     (apply the corrected values)

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });
const { Client } = require('pg');
const dns = require('dns');
dns.setServers(['4.4.4.4', '8.8.8.8']);

const APPLY = process.argv.includes('--apply');

function localDayKey(ts, timeZone) {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date(ts));
  } catch {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'UTC',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date(ts));
  }
}

function dayKeyToUtcMs(dayKey) {
  return new Date(`${dayKey}T00:00:00.000Z`).getTime();
}

// Length of the trailing run of consecutive local-calendar days ending at the most recent day.
function trailingStreakLength(sortedDistinctDayKeys) {
  if (sortedDistinctDayKeys.length === 0) return 0;
  const ONE_DAY_MS = 24 * 60 * 60 * 1000;
  let streak = 1;
  for (let i = sortedDistinctDayKeys.length - 1; i > 0; i--) {
    const curr = dayKeyToUtcMs(sortedDistinctDayKeys[i]);
    const prev = dayKeyToUtcMs(sortedDistinctDayKeys[i - 1]);
    if (curr - prev === ONE_DAY_MS) {
      streak++;
    } else {
      break;
    }
  }
  return streak;
}

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL, ssl: true });
  await client.connect();

  const { rows: users } = await client.query(`
    SELECT id, email, "currentStreak", "lastActivityAt", timezone
    FROM "User"
  `);

  const { rows: activity } = await client.query(`
    SELECT "userId" AS user_id, "submittedAt" AS ts FROM "Submission"
    UNION ALL
    SELECT "userId", "submittedAt" FROM "StandaloneSubmission"
    UNION ALL
    SELECT "userId", "createdAt" FROM "QuizAttempt"
  `);

  const activityByUser = new Map();
  for (const row of activity) {
    if (!activityByUser.has(row.user_id)) activityByUser.set(row.user_id, []);
    activityByUser.get(row.user_id).push(row.ts);
  }

  const report = [];
  for (const user of users) {
    const timestamps = activityByUser.get(user.id) || [];
    if (timestamps.length === 0) continue;

    const dayKeys = Array.from(new Set(timestamps.map((ts) => localDayKey(ts, user.timezone)))).sort();
    const correctStreak = trailingStreakLength(dayKeys);

    if (correctStreak !== user.currentStreak) {
      report.push({
        id: user.id,
        email: user.email,
        timezone: user.timezone,
        distinctDays: dayKeys.length,
        lastDay: dayKeys[dayKeys.length - 1],
        storedStreak: user.currentStreak,
        correctStreak,
      });
    }
  }

  console.log(APPLY ? '=== APPLYING corrections ===' : '=== DRY RUN (no writes) ===');
  console.table(report.map(({ id, ...rest }) => rest));

  if (APPLY) {
    for (const entry of report) {
      await client.query(`UPDATE "User" SET "currentStreak" = $1 WHERE id = $2`, [entry.correctStreak, entry.id]);
    }
    console.log(`Updated ${report.length} user(s).`);
  } else {
    console.log(`${report.length} user(s) would be updated. Re-run with --apply to write changes.`);
  }

  await client.end();
}

main().catch((err) => {
  console.error('ERROR:', err);
  process.exit(1);
});
