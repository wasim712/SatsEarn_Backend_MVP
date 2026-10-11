import multer from 'multer';
import { Router } from 'express';
import { prisma } from '../../db/prisma.client';
import { requireAuth } from '../../middlewares/auth.middleware';
import { decryptObfuscatedMultipart } from '../../middlewares/obfuscation.middleware';
import { userLimiter, userLimits } from '../../middlewares/rate-limit';
import { validate } from '../../middlewares/validate.middleware';
import { NotificationController } from '../notifications/notification.controller';
import { UserController } from './user.controller';
import {
  changePasswordSchema,
  claimSatWormRewardSchema,
  premiumInterestSchema,
  premiumSatsUpgradeSchema,
  requestWithdrawalSchema,
  submitBugReportSchema,
  submitDailyQuizAnswerSchema,
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
// Broad per-user ceiling; money-touching routes below also get their own tighter limits.
router.use(userLimiter('users-api', 15 * 60 * 1000, 1500));

router.get('/profile', UserController.getProfile);
router.post('/onboarding/complete', UserController.completeOnboarding);
router.post('/onboarding/skip', UserController.skipOnboarding);
router.patch('/profile', validate(updateProfileSchema), UserController.updateProfile);
router.get('/premium-interest', UserController.getPremiumRequests);
router.post('/premium-interest', validate(premiumInterestSchema), UserController.registerPremiumInterest);
router.post('/premium-upgrade/sats', userLimits.premiumUpgrade, validate(premiumSatsUpgradeSchema), UserController.upgradePremiumUsingSats);
router.get('/dashboard', UserController.getDashboard);
router.get('/leaderboard', UserController.getLeaderboard);
router.post('/change-password', userLimits.changePassword, validate(changePasswordSchema), UserController.changePassword);
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

  const defaultTierMinWithdrawalMatrix = {
    BASIC: 25000,
    COPPER: 25000,
    BRONZE: 25000,
    SILVER: 25000,
    GOLD: 25000,
    PLATINUM: 25000,
    DIAMOND: 25000,
    CROWN: 25000,
    ELITE: 25000,
    FOUNDER: 25000,
  };

  res.json({
    tierMinWithdrawalMatrix: {
      ...defaultTierMinWithdrawalMatrix,
      ...(((settings?.tierMinWithdrawalMatrix as Record<string, number> | null) || {})),
    },
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
router.post('/standalone-tasks/:taskId/submit', userLimits.taskSubmit, upload.single('proofImage'), decryptObfuscatedMultipart, UserController.submitStandaloneTaskProof);
router.get('/campaigns/:id', UserController.getCampaignDetails);
router.get('/tasks/:taskId/status', UserController.getTaskStatus);

router.post('/tasks/:taskId/submit', userLimits.taskSubmit, upload.single('proofImage'), decryptObfuscatedMultipart, UserController.submitTaskProof);
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
router.post('/minigames/sat-worm/claim', userLimits.minigameClaim, validate(claimSatWormRewardSchema), UserController.claimSatWormReward);
router.get('/quiz/today', UserController.getTodayQuiz);
router.post('/quiz/today/answer', userLimits.quizAnswer, validate(submitDailyQuizAnswerSchema), UserController.submitTodayQuizAnswer);
router.post('/quiz/today/submit', userLimits.quizSubmit, validate(submitDailyQuizSchema), UserController.submitTodayQuiz);

router.get('/withdrawals', UserController.getWithdrawals);
router.post('/withdrawals', userLimits.withdrawal, validate(requestWithdrawalSchema), UserController.requestWithdrawal);

router.get('/notifications', NotificationController.getMyNotifications);
router.put('/notifications/read-all', NotificationController.markAllMyRead);
router.put('/notifications/:id/read', NotificationController.markRead);

export default router;
