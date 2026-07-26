const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });
const { Client } = require('pg');
const dns = require('dns');
dns.setServers([
  '4.4.4.4',
  '8.8.8.8'
])
async function main() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: true,
  });
  await client.connect();

  console.log('=== Column types (submittedAt / createdAt) ===');
  const cols = await client.query(`
    SELECT table_name, column_name, data_type
    FROM information_schema.columns
    WHERE (table_name IN ('Submission','StandaloneSubmission','QuizAttempt','User'))
      AND column_name IN ('submittedAt','createdAt','currentStreak','lastActivityAt')
    ORDER BY table_name, column_name;
  `);
  console.table(cols.rows);

  console.log('\n=== Current DB timezone setting ===');
  const tz = await client.query(`SHOW timezone;`);
  console.table(tz.rows);

  console.log('\n=== Row counts per source table ===');
  const counts = await client.query(`
    SELECT 'Submission' AS tbl, COUNT(*) FROM "Submission"
    UNION ALL SELECT 'StandaloneSubmission', COUNT(*) FROM "StandaloneSubmission"
    UNION ALL SELECT 'QuizAttempt', COUNT(*) FROM "QuizAttempt";
  `);
  console.table(counts.rows);

  console.log('\n=== currentStreak distribution on User table right now ===');
  const dist = await client.query(`
    SELECT "currentStreak", COUNT(*) AS num_users
    FROM "User"
    GROUP BY "currentStreak"
    ORDER BY "currentStreak" DESC
    LIMIT 20;
  `);
  console.table(dist.rows);

  console.log('\n=== Top 8 users by total activity-row count (most likely to show a real multi-day streak) ===');
  const topUsers = await client.query(`
    WITH counts AS (
      SELECT "userId" AS user_id FROM "Submission"
      UNION ALL
      SELECT "userId" FROM "StandaloneSubmission"
      UNION ALL
      SELECT "userId" FROM "QuizAttempt"
    )
    SELECT user_id, COUNT(*) AS total_rows
    FROM counts
    GROUP BY user_id
    ORDER BY total_rows DESC
    LIMIT 8;
  `);
  console.table(topUsers.rows);

  const userIds = topUsers.rows.map((r) => r.user_id);

  if (userIds.length > 0) {
    console.log('\n=== Raw activity days for those top users (per source) ===');
    const rawDays = await client.query(
      `
      SELECT "userId" AS user_id, "submittedAt" AS ts, "submittedAt"::date AS day, 'submission' AS src
      FROM "Submission" WHERE "userId" = ANY($1)
      UNION ALL
      SELECT "userId", "submittedAt", "submittedAt"::date, 'standalone'
      FROM "StandaloneSubmission" WHERE "userId" = ANY($1)
      UNION ALL
      SELECT "userId", "createdAt", "createdAt"::date, 'quiz'
      FROM "QuizAttempt" WHERE "userId" = ANY($1)
      ORDER BY user_id, day;
      `,
      [userIds],
    );
    console.table(rawDays.rows);

    console.log('\n=== Reconstructed streak_len (read-only) for those top users, vs stored currentStreak ===');
    const recon = await client.query(
      `
      WITH activity_days AS (
        SELECT "userId" AS user_id, "submittedAt"::date AS day FROM "Submission" WHERE "userId" = ANY($1)
        UNION
        SELECT "userId" AS user_id, "submittedAt"::date AS day FROM "StandaloneSubmission" WHERE "userId" = ANY($1)
        UNION
        SELECT "userId" AS user_id, "createdAt"::date   AS day FROM "QuizAttempt" WHERE "userId" = ANY($1)
      ),
      distinct_days AS (
        SELECT DISTINCT user_id, day FROM activity_days
      ),
      grouped AS (
        SELECT
          user_id,
          day,
          day - (ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY day))::int * INTERVAL '1 day' AS grp
        FROM distinct_days
      ),
      islands AS (
        SELECT user_id, grp, COUNT(*) AS streak_len, MAX(day) AS island_end
        FROM grouped
        GROUP BY user_id, grp
      ),
      last_island AS (
        SELECT DISTINCT ON (user_id) user_id, streak_len, island_end
        FROM islands
        ORDER BY user_id, island_end DESC
      )
      SELECT u.id, u.email, u."currentStreak" AS stored_streak, li.streak_len AS correct_streak, li.island_end AS last_activity_day
      FROM "User" u
      JOIN last_island li ON li.user_id = u.id
      WHERE u.id = ANY($1);
      `,
      [userIds],
    );
    console.table(recon.rows);
  }

  await client.end();
}

main().catch((err) => {
  console.error('ERROR:', err);
  process.exit(1);
});
