require('dotenv/config');
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 1,
  connectionTimeoutMillis: 10000,
});

async function main() {
  const email = 'gosha451@hotmail.com';
  const client = await pool.connect();
  try {
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

    const [ledgerRes, submissionsRes, standaloneRes, quizRes] = await Promise.all([
      client.query(
        'SELECT id, type, "amountSats", "amountMsats", description, "referenceId", "createdAt" FROM "Ledger" WHERE "userId" = $1 ORDER BY "createdAt" DESC LIMIT 50',
        [userId]
      ),
      client.query(
        'SELECT s.id, s.status, s."submittedAt", t.title as "taskTitle", t."xpRewardOverride", c.title as "campaignTitle", c."xpReward" as "campaignXpReward" FROM "Submission" s JOIN "Task" t ON t.id = s."taskId" JOIN "Campaign" c ON c.id = t."campaignId" WHERE s."userId" = $1 ORDER BY s."submittedAt" DESC LIMIT 20',
        [userId]
      ),
      client.query(
        'SELECT ss.id, ss.status, ss."submittedAt", st.title as "taskTitle", st."xpReward" as "taskXpReward" FROM "StandaloneSubmission" ss JOIN "StandaloneTask" st ON st.id = ss."standaloneTaskId" WHERE ss."userId" = $1 ORDER BY ss."submittedAt" DESC LIMIT 20',
        [userId]
      ),
      client.query(
        'SELECT qa.id, qa.score, qa.passed, qa."createdAt", dq.title as "quizTitle", dq."xpReward" as "quizXpReward" FROM "QuizAttempt" qa JOIN "DailyQuiz" dq ON dq.id = qa."dailyQuizId" WHERE qa."userId" = $1 ORDER BY qa."createdAt" DESC LIMIT 20',
        [userId]
      )
    ]);

    console.log(JSON.stringify({
      user,
      ledger: ledgerRes.rows,
      submissions: submissionsRes.rows,
      standaloneSubmissions: standaloneRes.rows,
      quizAttempts: quizRes.rows,
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
