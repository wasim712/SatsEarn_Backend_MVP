require('dotenv/config');
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 1, connectionTimeoutMillis: 10000 });
async function main() {
  const userId = 'c8873a45-3b15-4048-b360-68f2a35db91e';
  const client = await pool.connect();
  try {
    const res = await client.query(
      'SELECT id, title, message, type, "referenceId", "createdAt" FROM "Notification" WHERE "userId" = $1 ORDER BY "createdAt" DESC LIMIT 50',
      [userId]
    );
    console.log(JSON.stringify(res.rows, null, 2));
  } finally {
    client.release();
    await pool.end();
  }
}
main().catch((error) => { console.error(error); process.exit(1); });
