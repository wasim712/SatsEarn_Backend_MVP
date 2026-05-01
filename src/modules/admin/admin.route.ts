import { Router } from 'express';
import { requireAdmin } from '../../middlewares/admin.middleware';
import { requireAuth } from '../../middlewares/auth.middleware';
import { validate } from '../../middlewares/validate.middleware';
import { NotificationController } from '../notifications/notification.controller';
import { AdminController } from './admin.controller';
import {
  createAnnouncementSchema,
  createCampaignSchema,
  createDailyQuizSchema,
  createTaskSchema,
  quizIdParamSchema,
  updateAnnouncementSchema,
  updateCampaignSchema,
  updateDailyQuizSchema,
  updateTaskSchema,
} from './admin.schema';

const router = Router();

router.use(requireAuth, requireAdmin);

router.get('/metrics', AdminController.getDashboardMetrics);

router.get('/campaigns/:id/analytics', AdminController.getCampaignAnalytics);
router.post('/campaigns', validate(createCampaignSchema), AdminController.createCampaign);
router.get('/campaigns', AdminController.getAllCampaigns);
router.patch('/campaigns/:id', validate(updateCampaignSchema), AdminController.updateCampaign);
router.delete('/campaigns/:id', AdminController.deleteCampaign);
router.get('/campaigns/:id', AdminController.getCampaignById);

router.post('/campaigns/:campaignId/tasks', validate(createTaskSchema), AdminController.addTaskToCampaign);
router.get('/campaigns/:campaignId/tasks', AdminController.getAllTasksForCampaign);
router.get('/campaigns/:campaignId/tasks/:taskId', AdminController.getTaskById);
router.patch('/campaigns/:campaignId/tasks/:taskId', validate(updateTaskSchema), AdminController.updateTask);
router.delete('/campaigns/:campaignId/tasks/:taskId', AdminController.deleteTask);

router.get('/announcements', AdminController.getAllAnnouncements);
router.post('/announcements', validate(createAnnouncementSchema), AdminController.createAnnouncement);
router.patch('/announcements/:id', validate(updateAnnouncementSchema), AdminController.updateAnnouncement);
router.delete('/announcements/:id', AdminController.deleteAnnouncement);

router.get('/submissions/pending', AdminController.getPendingSubmissions);
router.post('/submissions/:id/review', AdminController.reviewSubmission);

router.get('/withdrawals', AdminController.getWithdrawals);
router.post('/withdrawals/:id/approve', AdminController.approveWithdrawal);
router.post('/withdrawals/:id/reject', AdminController.rejectWithdrawal);

router.get('/settings', AdminController.getPlatformSettings);
router.put('/settings', AdminController.updatePlatformSettings);
router.get('/users', AdminController.getAllUsers);

router.post('/quiz/daily', validate(createDailyQuizSchema), AdminController.createDailyQuiz);
router.get('/quiz/daily', AdminController.getAllDailyQuizzes);
router.get('/quiz/daily/single/:id', validate(quizIdParamSchema), AdminController.getDailyQuiz);
router.patch('/quiz/daily/:id', validate(updateDailyQuizSchema), AdminController.updateDailyQuiz);
router.delete('/quiz/daily/:id', validate(quizIdParamSchema), AdminController.deleteDailyQuiz);

router.get('/notifications', NotificationController.getAdminAlerts);
router.put('/notifications/read-all', NotificationController.markAllAdminRead);
router.put('/notifications/:id/read', NotificationController.markRead);

export default router;
