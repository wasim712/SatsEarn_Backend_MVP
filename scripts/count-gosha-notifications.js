require('dotenv/config');
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 1, connectionTimeoutMillis: 10000 });
async function main() {
  const client = await pool.connect();
  try {
    const userId = 'c8873a45-3b15-4048-b360-68f2a35db91e';
    const countRes = await client.query('SELECT COUNT(*)::int AS count FROM "Notification" WHERE "userId" = $1', [userId]);
    const rowsRes = await client.query('SELECT id, title, message, type, "createdAt" FROM "Notification" WHERE "userId" = $1 ORDER BY "createdAt" DESC', [userId]);
    console.log(JSON.stringify({ count: countRes.rows[0].count, notifications: rowsRes.rows }, null, 2));
  } finally { client.release(); await pool.end(); }
}
main().catch((e)=>{console.error(e);process.exit(1)});
