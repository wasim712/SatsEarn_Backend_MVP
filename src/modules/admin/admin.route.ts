import multer from 'multer';
import { Router } from 'express';
import { requireAdmin } from '../../middlewares/admin.middleware';
import { requireAuth } from '../../middlewares/auth.middleware';
import { decryptObfuscatedMultipart } from '../../middlewares/obfuscation.middleware';
import { validate } from '../../middlewares/validate.middleware';
import { NotificationController } from '../notifications/notification.controller';
import { AdminController } from './admin.controller';
import {
  blogPostIdParamSchema,
  createAnnouncementSchema,
  createBlogPostSchema,
  createCampaignSchema,
  createDailyQuizSchema,
  createFaqItemSchema,
  createTaskSchema,
  faqItemIdParamSchema,
  quizIdParamSchema,
  updateCheatUserSchema,
  updateAnnouncementSchema,
  updateBlogPostSchema,
  updateCampaignSchema,
  updateDailyQuizSchema,
  updateFaqItemSchema,
  updatePremiumRequestSchema,
  adjustUserSubmissionRewardSchema,
  updateUserPremiumSchema,
  updateTaskSchema,
} from './admin.schema';

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
});

router.use(requireAuth, requireAdmin);

router.get('/metrics', AdminController.getDashboardMetrics);

router.get('/campaigns/:id/analytics', AdminController.getCampaignAnalytics);
router.post('/campaigns/upload-cover', upload.single('coverImage'), decryptObfuscatedMultipart, AdminController.uploadCampaignCover);
router.post('/campaigns', validate(createCampaignSchema), AdminController.createCampaign);
router.get('/campaigns', AdminController.getAllCampaigns);
router.patch('/campaigns/:id', validate(updateCampaignSchema), AdminController.updateCampaign);
router.delete('/campaigns/:id', AdminController.deleteCampaign);
router.get('/campaigns/:id', AdminController.getCampaignById);

router.post('/tasks/standalone', validate(createTaskSchema), AdminController.createStandaloneTask);
router.get('/tasks', AdminController.getAllStandaloneTasks);
router.get('/tasks/:taskId', AdminController.getStandaloneTaskById);
router.patch('/tasks/:taskId', validate(updateTaskSchema), AdminController.updateStandaloneTask);
router.delete('/tasks/:taskId', AdminController.deleteStandaloneTask);
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

router.get('/bug-reports', AdminController.getAllBugReports);
router.post('/bug-reports/:id/review', AdminController.reviewBugReport);

router.get('/blogs', AdminController.getAllBlogPosts);
router.post('/blogs', validate(createBlogPostSchema), AdminController.createBlogPost);
router.patch('/blogs/:id', validate(updateBlogPostSchema), AdminController.updateBlogPost);
router.delete('/blogs/:id', validate(blogPostIdParamSchema), AdminController.deleteBlogPost);

router.get('/faqs', AdminController.getAllFaqItems);
router.post('/faqs', validate(createFaqItemSchema), AdminController.createFaqItem);
router.patch('/faqs/:id', validate(updateFaqItemSchema), AdminController.updateFaqItem);
router.delete('/faqs/:id', validate(faqItemIdParamSchema), AdminController.deleteFaqItem);

router.get('/withdrawals', AdminController.getWithdrawals);
router.post('/withdrawals/:id/approve', AdminController.approveWithdrawal);
router.post('/withdrawals/:id/reject', AdminController.rejectWithdrawal);

router.get('/settings', AdminController.getPlatformSettings);
router.put('/settings', AdminController.updatePlatformSettings);
router.get('/cheat-user', AdminController.getCheatUser);
router.put('/cheat-user', validate(updateCheatUserSchema), AdminController.updateCheatUser);
router.get('/users', AdminController.getAllUsers);
router.get('/premium-requests', AdminController.getPremiumRequests);
router.get('/users/:id', AdminController.getUserDetails);
router.post('/users/:id/ban', AdminController.banUser);
router.post('/users/:id/activate', AdminController.activateUser);
router.delete('/users/:id', AdminController.deleteUser);
router.put('/users/:id/premium', validate(updateUserPremiumSchema), AdminController.updateUserPremium);
router.post('/users/:id/submission-adjustment', validate(adjustUserSubmissionRewardSchema), AdminController.adjustUserSubmissionReward);
router.put('/premium-requests/:id', validate(updatePremiumRequestSchema), AdminController.updatePremiumRequest);

router.post('/quiz/daily', validate(createDailyQuizSchema), AdminController.createDailyQuiz);
router.get('/quiz/daily', AdminController.getAllDailyQuizzes);
router.get('/quiz/daily/single/:id', validate(quizIdParamSchema), AdminController.getDailyQuiz);
router.patch('/quiz/daily/:id', validate(updateDailyQuizSchema), AdminController.updateDailyQuiz);
router.delete('/quiz/daily/:id', validate(quizIdParamSchema), AdminController.deleteDailyQuiz);

router.get('/notifications', NotificationController.getAdminAlerts);
router.put('/notifications/read-all', NotificationController.markAllAdminRead);
router.put('/notifications/:id/read', NotificationController.markRead);

export default router;
