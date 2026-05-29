import cron from 'node-cron';
import { CronService } from './cron.service';

export const startCronJobs = () => {
  const scheduleTime = '*/2 * * * *';

  console.log(`Background worker initialized. Jobs scheduled for [${scheduleTime}]`);

  cron.schedule(scheduleTime, async () => {
    console.log('[CRON] Executing review and unlock sweeps...');

    try {
      const premiumResult = await CronService.processQueuedPremiumTransitions();
      if (premiumResult.message !== 'No queued premium upgrades are ready to activate.') {
        console.log(`[CRON PREMIUM]: ${premiumResult.message}`);
      }

      const reviewResult = await CronService.process24HourReviewQueue();
      if (reviewResult.message !== 'No submissions are ready for 15-day locking.') {
        console.log(`[CRON REVIEW]: ${reviewResult.message}`);
      }

      const unlockResult = await CronService.process15DayUnlocks();
      if (unlockResult.message !== 'No funds are currently scheduled to unlock.') {
        console.log(`[CRON UNLOCK]: ${unlockResult.message}`);
      }
    } catch (error: any) {
      console.error('[CRON FAILED]:', error.message);
    }
  });
};
