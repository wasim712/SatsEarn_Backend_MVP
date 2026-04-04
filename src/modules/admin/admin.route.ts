import { Router, Request, Response, NextFunction } from "express";
import { AdminController } from "./admin.controller";
import { requireAuth } from "../../middlewares/auth.middleware";
import { requireAdmin } from "../../middlewares/admin.middleware";
import {
  createAnnouncementSchema,
  createCampaignSchema,
  createTaskSchema,
  updateAnnouncementSchema,
  updateCampaignSchema,
  updateTaskSchema,
} from "./admin.schema";
import { ZodObject } from "zod";

const router = Router();

// Zod Validation Middleware
const validate =
  (schema: ZodObject) =>
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      await schema.parseAsync({ body: req.body });
      next();
    } catch (error: any) {
      return res.status(400).json({ error: error.errors });
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
router.get('/submissions/pending', requireAdmin, AdminController.getPendingSubmissions);
router.post('/submissions/:id/review', requireAdmin, AdminController.reviewSubmission);

// --- WITHDRAWALS ---
router.get('/withdrawals/pending', requireAdmin, AdminController.getPendingWithdrawals);
router.post('/withdrawals/:id/process', requireAdmin, AdminController.processWithdrawal);

// --- SETTINGS ---
router.get('/settings', requireAdmin, AdminController.getPlatformSettings);
router.put('/settings', requireAdmin, AdminController.updatePlatformSettings);
// Add this under your other GET routes
router.get('/users', requireAdmin, AdminController.getAllUsers);

export default router;