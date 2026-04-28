import { Router, Request, Response, NextFunction } from "express";
import { AdminController } from "./admin.controller";
import { requireAuth } from "../../middlewares/auth.middleware";
import { requireAdmin } from "../../middlewares/admin.middleware";
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
} from "./admin.schema";
import { ZodObject } from "zod";
import { NotificationController } from "../notifications/notification.controller";

const router = Router();

// Zod Validation Middleware
const validate =
  (schema: any) =>
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const validatedData = await schema.parseAsync({
        body: req.body,
        query: req.query,
        params: req.params,
      });

      // THE FIX: Overwrite the body, but safely merge params and query 
      // to avoid triggering Express's read-only getter errors.
      req.body = validatedData.body;
      Object.assign(req.params, validatedData.params);
      Object.assign(req.query, validatedData.query);

      next();
    } catch (error: any) {
      // 1. Is it a Zod Error?
      const zErrors = error.issues || error.errors;
      
      if (zErrors) {
        return res.status(400).json({
          error: "Validation Failed",
          details: zErrors.map((e: any) => ({
            path: e.path.join('.'),
            message: e.message
          }))
        });
      }

      // 2. It's a code crash! 
      console.log("🔥 MIDDLEWARE CRASH:", error);
      
      return res.status(500).json({
        error: "Internal Server Error in Middleware",
        message: error.message
      });
    }
  };
// Apply auth + admin middleware globally
router.use(requireAuth, requireAdmin);

/*
========================
DASHBOARD
========================
*/
router.get("/metrics", AdminController.getDashboardMetrics);

/*
========================
CAMPAIGNS
========================
*/

// ✅ MOST SPECIFIC FIRST
router.get("/campaigns/:id/analytics", AdminController.getCampaignAnalytics);

// Create
router.post(
    "/campaigns",
    validate(createCampaignSchema),
    AdminController.createCampaign,
);

// Get all
router.get("/campaigns", AdminController.getAllCampaigns);

// Update
router.patch(
    "/campaigns/:id",
    validate(updateCampaignSchema),
    AdminController.updateCampaign,
);

// Delete
router.delete("/campaigns/:id", AdminController.deleteCampaign);

// ⚠️ KEEP THIS LAST among campaign routes
router.get("/campaigns/:id", AdminController.getCampaignById);

/*
========================
TASKS (Nested)
========================
*/

// Create task
router.post(
    "/campaigns/:campaignId/tasks",
    validate(createTaskSchema),
    AdminController.addTaskToCampaign,
);
// Get all tasks of campaign
router.get(
    "/campaigns/:campaignId/tasks",
    AdminController.getAllTasksForCampaign,
);
// Get single task
router.get(
    "/campaigns/:campaignId/tasks/:taskId",
    AdminController.getTaskById,
);
// Update task
router.patch(
    "/campaigns/:campaignId/tasks/:taskId",
    validate(updateTaskSchema),
    AdminController.updateTask,
);
// Delete task
router.delete(
    "/campaigns/:campaignId/tasks/:taskId",
    AdminController.deleteTask,
);
router.get('/announcements', AdminController.getAllAnnouncements);
router.post('/announcements', validate(createAnnouncementSchema), AdminController.createAnnouncement);
router.patch('/announcements/:id', validate(updateAnnouncementSchema), AdminController.updateAnnouncement);
router.delete('/announcements/:id', AdminController.deleteAnnouncement);
// --- SUBMISSIONS ---
router.get('/submissions/pending',  AdminController.getPendingSubmissions);
router.post('/submissions/:id/review',  AdminController.reviewSubmission);

// --- WITHDRAWALS ---
router.get('/withdrawals',  AdminController.getWithdrawals);
router.post('/withdrawals/:id/approve',  AdminController.approveWithdrawal);
router.post('/withdrawals/:id/reject',  AdminController.rejectWithdrawal);
// --- SETTINGS ---
router.get('/settings',  AdminController.getPlatformSettings);
router.put('/settings',  AdminController.updatePlatformSettings);
// Add this under your other GET routes
router.get('/users',  AdminController.getAllUsers);
router.post(
    '/quiz/daily',
    validate(createDailyQuizSchema),
    AdminController.createDailyQuiz
);
// Read All
router.get('/quiz/daily', AdminController.getAllDailyQuizzes);

// Read Single
router.get('/quiz/daily/single/:id', validate(quizIdParamSchema), AdminController.getDailyQuiz);

// Update Details
router.patch('/quiz/daily/:id', validate(updateDailyQuizSchema), AdminController.updateDailyQuiz);

// Delete
router.delete('/quiz/daily/:id', validate(quizIdParamSchema), AdminController.deleteDailyQuiz);
router.get('/notifications', NotificationController.getAdminAlerts);
router.put('/notifications/read-all', NotificationController.markAllAdminRead);
router.put('/notifications/:id/read', NotificationController.markRead);
export default router;