import multer from 'multer';
import { Router } from 'express';
import { prisma } from '../../db/prisma.client';
import { requireAuth } from '../../middlewares/auth.middleware';
import { decryptObfuscatedMultipart } from '../../middlewares/obfuscation.middleware';
import { validate } from '../../middlewares/validate.middleware';
import { NotificationController } from '../notifications/notification.controller';
import { UserController } from './user.controller';
import {
  claimSatWormRewardSchema,
  premiumInterestSchema,
  premiumSatsUpgradeSchema,
  requestWithdrawalSchema,
  submitBugReportSchema,
  submitDailyQuizSchema,
  submitQuizSchema,
  updateProfileSchema,
} from './user.schema';

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
});

router.use(requireAuth);

router.get('/profile', UserController.getProfile);
router.patch('/profile', validate(updateProfileSchema), UserController.updateProfile);
router.get('/premium-interest', UserController.getPremiumRequests);
router.post('/premium-interest', validate(premiumInterestSchema), UserController.registerPremiumInterest);
router.post('/premium-upgrade/sats', validate(premiumSatsUpgradeSchema), UserController.upgradePremiumUsingSats);
router.get('/dashboard', UserController.getDashboard);
router.get('/leaderboard', UserController.getLeaderboard);
router.post('/change-password', UserController.changePassword);
router.delete('/account', UserController.deleteAccount);

router.get('/settings', async (_req, res) => {
  const settings = await prisma.platformSettings.findFirst();
  const defaultSidebarConfig = {
    dashboard: true,
    tasks: true,
    standaloneTasks: true,
    minigames: true,
    bugBounty: true,
    quiz: true,
    referrals: true,
    rewards: true,
    leaderboard: true,
    wallet: true,
    settings: true,
    help: true,
    notifications: true,
    profile: true,
  };

  res.json({
    userSidebarConfig: {
      ...defaultSidebarConfig,
      ...(((settings?.userSidebarConfig as Record<string, boolean> | null) || {})),
    },
  });
});
router.get('/campaigns', UserController.getCampaigns);
router.get('/standalone-tasks', UserController.getStandaloneTasks);
router.get('/standalone-tasks/:taskId', UserController.getStandaloneTaskDetails);
router.get('/standalone-tasks/:taskId/status', UserController.getStandaloneTaskStatus);
router.post('/standalone-tasks/:taskId/submit', upload.single('proofImage'), decryptObfuscatedMultipart, UserController.submitStandaloneTaskProof);
router.get('/campaigns/:id', UserController.getCampaignDetails);
router.get('/tasks/:taskId/status', UserController.getTaskStatus);

router.post('/tasks/:taskId/submit', upload.single('proofImage'), decryptObfuscatedMultipart, UserController.submitTaskProof);
router.post('/tasks/:taskId/quiz', validate(submitQuizSchema), UserController.submitQuiz);
router.post('/tasks/:taskId/start', UserController.startTask);

router.get('/referrals', UserController.getReferralDashboard);
router.get('/unlocks', UserController.getUnlockSchedule);
router.get('/submissions', UserController.getSubmissionHistory);
router.get('/bug-reports', UserController.getMyBugReports);
router.get('/bug-reports/stats', UserController.getBugBountyStats);
router.get('/blogs', UserController.getPublishedBlogs);
router.get('/faqs', UserController.getActiveFaqs);
router.post('/bug-reports', upload.single('screenshot'), decryptObfuscatedMultipart, validate(submitBugReportSchema), UserController.submitBugReport);

router.post('/streak/claim', UserController.claimStreak);
router.post('/minigames/sat-worm/claim', validate(claimSatWormRewardSchema), UserController.claimSatWormReward);
router.get('/quiz/today', UserController.getTodayQuiz);
router.post('/quiz/today/submit', validate(submitDailyQuizSchema), UserController.submitTodayQuiz);

router.get('/withdrawals', UserController.getWithdrawals);
router.post('/withdrawals', validate(requestWithdrawalSchema), UserController.requestWithdrawal);

router.get('/notifications', NotificationController.getMyNotifications);
router.put('/notifications/read-all', NotificationController.markAllMyRead);
router.put('/notifications/:id/read', NotificationController.markRead);

export default router;
