const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 1, connectionTimeoutMillis: 10000 });

async function main() {
  const client = await pool.connect();
  try {
    const email = 'gosha451@hotmail.com';
    const userRes = await client.query(
      'SELECT id, email, "fullName", "totalXp", "currentStreak", "lastClaimedStreakMilestone", "createdAt", "lastActivityAt" FROM "User" WHERE email = $1',
      [email]
    );

    if (userRes.rows.length === 0) {
      console.log('USER_NOT_FOUND');
      return;
    }

    const user = userRes.rows[0];
    const userId = user.id;

    const [notifications, submissions, standaloneSubmissions, quizAttempts, ledger, billingRecords] = await Promise.all([
      client.query('SELECT id, title, message, type, "referenceId", "createdAt" FROM "Notification" WHERE "userId" = $1 ORDER BY "createdAt" DESC', [userId]),
      client.query('SELECT s.id, s.status, s."submittedAt", t.title as "taskTitle", t."xpRewardOverride", c.title as "campaignTitle", c."xpReward" as "campaignXpReward" FROM "Submission" s JOIN "Task" t ON t.id = s."taskId" JOIN "Campaign" c ON c.id = t."campaignId" WHERE s."userId" = $1 ORDER BY s."submittedAt" DESC', [userId]),
      client.query('SELECT ss.id, ss.status, ss."submittedAt", st.title as "taskTitle", st."xpReward" as "taskXpReward" FROM "StandaloneSubmission" ss JOIN "StandaloneTask" st ON st.id = ss."standaloneTaskId" WHERE ss."userId" = $1 ORDER BY ss."submittedAt" DESC', [userId]),
      client.query('SELECT qa.id, qa.score, qa.passed, qa."createdAt", dq.title as "quizTitle", dq."xpReward" as "quizXpReward" FROM "QuizAttempt" qa JOIN "DailyQuiz" dq ON dq.id = qa."dailyQuizId" WHERE qa."userId" = $1 ORDER BY qa."createdAt" DESC', [userId]),
      client.query('SELECT id, type, "amountSats", "amountMsats", description, "referenceId", "createdAt" FROM "Ledger" WHERE "userId" = $1 ORDER BY "createdAt" DESC', [userId]),
      client.query('SELECT id, "premiumTier", "billingCycle", "billingSource", "createdAt" FROM "BillingRecord" WHERE "userId" = $1 ORDER BY "createdAt" DESC', [userId]),
    ]);

    const satWormNotifications = notifications.rows.filter((row) => row.title === 'SAT-WORM XP claimed');
    const satWormXp = satWormNotifications.reduce((sum, row) => {
      const match = /earned (\d+) XP/i.exec(row.message || '');
      return sum + (match ? Number(match[1]) : 0);
    }, 0);

    console.log(JSON.stringify({
      user,
      notificationCount: notifications.rows.length,
      satWormNotificationCount: satWormNotifications.length,
      satWormXp,
      notifications: notifications.rows,
      submissions: submissions.rows,
      standaloneSubmissions: standaloneSubmissions.rows,
      quizAttempts: quizAttempts.rows,
      ledger: ledger.rows,
      billingRecords: billingRecords.rows,
      inferredMissingXp: Number(user.totalXp || 0) - satWormXp,
    }, null, 2));
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
