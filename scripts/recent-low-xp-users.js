require('dotenv/config');
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 1, connectionTimeoutMillis: 10000 });
async function main() {
  const client = await pool.connect();
  try {
    const res = await client.query(
      `SELECT id, email, "fullName", "totalXp", "createdAt"
       FROM "User"
       WHERE role = 'USER'
       ORDER BY "createdAt" DESC
       LIMIT 100`
    );
    console.log(JSON.stringify(res.rows.filter((row) => Number(row.totalXp) <= 100), null, 2));
  } finally {
    client.release();
    await pool.end();
  }
}
main().catch((error) => { console.error(error); process.exit(1); });
