require('dotenv/config');
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 1, connectionTimeoutMillis: 10000 });

async function main() {
  const userId = 'c8873a45-3b15-4048-b360-68f2a35db91e';
  const client = await pool.connect();
  try {
    const [userRes, submissionsRes, standaloneRes, quizRes, ledgerRes] = await Promise.all([
      client.query('SELECT id, email, "fullName", "totalXp", "currentStreak", "lastClaimedStreakMilestone", "createdAt", "lastActivityAt" FROM "User" WHERE id = $1', [userId]),
      client.query('SELECT s.id, s.status, s."submittedAt", t.title as "taskTitle", t."xpRewardOverride", c.title as "campaignTitle", c."xpReward" as "campaignXpReward" FROM "Submission" s JOIN "Task" t ON t.id = s."taskId" JOIN "Campaign" c ON c.id = t."campaignId" WHERE s."userId" = $1 ORDER BY s."submittedAt" DESC LIMIT 50', [userId]),
      client.query('SELECT ss.id, ss.status, ss."submittedAt", st.title as "taskTitle", st."xpReward" as "taskXpReward" FROM "StandaloneSubmission" ss JOIN "StandaloneTask" st ON st.id = ss."standaloneTaskId" WHERE ss."userId" = $1 ORDER BY ss."submittedAt" DESC LIMIT 50', [userId]),
      client.query('SELECT qa.id, qa.score, qa.passed, qa."createdAt", dq.title as "quizTitle", dq."xpReward" as "quizXpReward" FROM "QuizAttempt" qa JOIN "DailyQuiz" dq ON dq.id = qa."dailyQuizId" WHERE qa."userId" = $1 ORDER BY qa."createdAt" DESC LIMIT 50', [userId]),
      client.query('SELECT id, type, "amountSats", "amountMsats", description, "referenceId", "createdAt" FROM "Ledger" WHERE "userId" = $1 ORDER BY "createdAt" DESC LIMIT 100', [userId])
    ]);

    console.log(JSON.stringify({
      user: userRes.rows[0],
      submissions: submissionsRes.rows,
      standaloneSubmissions: standaloneRes.rows,
      quizAttempts: quizRes.rows,
      ledger: ledgerRes.rows,
    }, null, 2));
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error) => { console.error(error); process.exit(1); });
