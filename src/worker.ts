import { pool, prisma } from './db/prisma.client';
import { env } from './config/env';
import { startCronJobs } from './modules/cron/cron.runner';

if (env.ENABLE_CRON) {
  startCronJobs();
  console.log('Background worker started.');
} else {
  console.log('Background worker started with cron disabled (ENABLE_CRON=false).');
}

console.log('🚀 Registering SIGINT handler...');
process.stdin.resume();

const shutdown = async (signal: string) => {
  console.log(`🔥 ${signal} received`);

  await prisma.$disconnect();
  await pool.end();

  console.log('✅ Worker cleanup done');
  process.exit(0);
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
process.on('uncaughtException', (err) => {
  console.error('💥 Uncaught Exception:', err);
});

process.on('unhandledRejection', (reason) => {
  console.error('💥 Unhandled Rejection:', reason);
});
