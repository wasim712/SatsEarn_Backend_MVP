import cron from 'node-cron';
import { CronService } from './cron.service'; // Adjust path if needed

export const startCronJobs = () => {
  /*
    =======================================================
    CRON SCHEDULE CHEAT SHEET:
    '* * * * *'       = Every minute (Great for testing)
    '0 * * * *'       = Every hour at minute 0
    '0 0 * * *'       = Every day at midnight
    '0 0 * * 0'       = Every Sunday at midnight
    =======================================================
  */
  
  // ⚠️ CHANGE THIS VARIABLE TO SET THE FREQUENCY
  const scheduleTime = '* * * * *'; 

  console.log(`🕒 Background Worker Initialized. Unlock script scheduled for: [${scheduleTime}]`);

  cron.schedule(scheduleTime, async () => {
    console.log('⏳ [CRON] Executing 15-Day Unlock sweep...');
    
    try {
      const result = await CronService.process15DayUnlocks();
      
      // We only log success if it actually moved money, to avoid spamming the console every minute
      if (result.message !== "No funds are currently scheduled to unlock.") {
        console.log(`✅ [CRON SUCCESS]: ${result.message}`);
      }
      
    } catch (error: any) {
      console.error(`❌ [CRON FAILED]:`, error.message);
    }
  });
};