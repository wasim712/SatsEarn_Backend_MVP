import multer from 'multer';
import { Router } from 'express';
import { prisma } from '../../db/prisma.client';
import { requireAuth } from '../../middlewares/auth.middleware';
import { validate } from '../../middlewares/validate.middleware';
import { NotificationController } from '../notifications/notification.controller';
import { UserController } from './user.controller';
import {
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
router.get('/dashboard', UserController.getDashboard);
router.post('/change-password', UserController.changePassword);
router.delete('/account', UserController.deleteAccount);

router.get('/settings', async (_req, res) => {
  const settings = await prisma.platformSettings.findFirst();
  res.json(settings || {});
});
router.get('/campaigns', UserController.getCampaigns);
router.get('/campaigns/:id', UserController.getCampaignDetails);

router.post('/tasks/:taskId/submit', upload.single('proofImage'), UserController.submitTaskProof);
router.post('/tasks/:taskId/quiz', validate(submitQuizSchema), UserController.submitQuiz);
router.post('/tasks/:taskId/start', UserController.startTask);

router.get('/referrals', UserController.getReferralDashboard);
router.get('/unlocks', UserController.getUnlockSchedule);
router.get('/submissions', UserController.getSubmissionHistory);
router.get('/bug-reports', UserController.getMyBugReports);
router.get('/blogs', UserController.getPublishedBlogs);
router.get('/faqs', UserController.getActiveFaqs);
router.post('/bug-reports', upload.single('screenshot'), validate(submitBugReportSchema), UserController.submitBugReport);

router.post('/streak/claim', UserController.claimStreak);
router.get('/quiz/today', UserController.getTodayQuiz);
router.post('/quiz/today/submit', validate(submitDailyQuizSchema), UserController.submitTodayQuiz);

router.get('/withdrawals', UserController.getWithdrawals);
router.post('/withdrawals', validate(requestWithdrawalSchema), UserController.requestWithdrawal);

router.get('/notifications', NotificationController.getMyNotifications);
router.put('/notifications/read-all', NotificationController.markAllMyRead);
router.put('/notifications/:id/read', NotificationController.markRead);

export default router;
