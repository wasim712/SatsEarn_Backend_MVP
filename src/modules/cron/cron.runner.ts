import cron from 'node-cron';
import { recordCronFailure, recordCronRun } from '../../monitoring/prometheus';
import { CronService } from './cron.service';

export const startCronJobs = () => {
  const scheduleTime = '*/2 * * * *';

  console.log(`Background worker initialized. Jobs scheduled for [${scheduleTime}]`);

  cron.schedule(scheduleTime, async () => {
    console.log('[CRON] Executing review and unlock sweeps...');

    try {
      recordCronRun('scheduler_sweep', 'started');
      // 1. Reconcile any corrupted (negative) balances first
      const reconcileResult = await CronService.reconcileNegativeBalances();
      if (reconcileResult.message !== 'No corrupted balances found.') {
        console.log(`[CRON RECONCILE]: ${reconcileResult.message}`);
      }

      // 2. Activate queued premium subscriptions
      const premiumResult = await CronService.processQueuedPremiumTransitions();
      if (premiumResult.message !== 'No queued premium upgrades are ready to activate.') {
        console.log(`[CRON PREMIUM]: ${premiumResult.message}`);
      }

      // 3. Move PENDING_24H → LOCKED_15D
      const reviewResult = await CronService.process24HourReviewQueue();
      if (reviewResult.message !== 'No submissions are ready for 15-day locking.') {
        console.log(`[CRON REVIEW]: ${reviewResult.message}`);
      }

      // 4. Move LOCKED_15D → WITHDRAWABLE (task submissions)
      const unlockResult = await CronService.process15DayUnlocks();
      if (unlockResult.message !== 'No funds are currently scheduled to unlock.') {
        console.log(`[CRON UNLOCK]: ${unlockResult.message}`);
      }

      // 5. Unlock quiz rewards (locked → available)
      const quizUnlockResult = await CronService.processQuizRewardUnlocks();
      if (quizUnlockResult.message !== 'No quiz rewards are ready to unlock.') {
        console.log(`[CRON QUIZ UNLOCK]: ${quizUnlockResult.message}`);
      }

      recordCronRun('scheduler_sweep', 'success');
    } catch (error: any) {
      recordCronFailure('scheduler_sweep');
      recordCronRun('scheduler_sweep', 'failed');
      console.error('[CRON FAILED]:', error.message);
    }
  });
};
