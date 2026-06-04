require('dotenv/config');
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 1,
  connectionTimeoutMillis: 10000,
});

async function main() {
  const client = await pool.connect();
  try {
    const [hotmail, xp35] = await Promise.all([
      client.query(
        `SELECT id, email, "fullName", "totalXp", "createdAt"
         FROM "User"
         WHERE LOWER(email) LIKE $1
         ORDER BY "createdAt" DESC
         LIMIT 50`,
        ['%hotmail%']
      ),
      client.query(
        `SELECT id, email, "fullName", "totalXp", "createdAt"
         FROM "User"
         WHERE "totalXp" = 35
         ORDER BY "createdAt" DESC
         LIMIT 50`
      )
    ]);

    console.log(JSON.stringify({ hotmail: hotmail.rows, xp35: xp35.rows }, null, 2));
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
