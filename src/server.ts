import { PrismaClient } from '@prisma/client';
import app from './app';
import { env } from './config/env';
import { pool, prisma } from './db/prisma.client';

const PORT = env.PORT || 8080;
const server = app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
console.log("🚀 Registering SIGINT handler...");
process.stdin.resume();

const shutdown = async (signal: string) => {
  console.log(`🔥 ${signal} received`);

  await prisma.$disconnect();
  await pool.end();

  console.log("✅ Cleanup done");
  process.exit(0);
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
process.on("uncaughtException", (err) => {
  console.error("💥 Uncaught Exception:", err);
});

process.on("unhandledRejection", (reason) => {
  console.error("💥 Unhandled Rejection:", reason);
});