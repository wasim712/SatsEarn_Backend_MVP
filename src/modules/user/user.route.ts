import { Router, Request, Response, NextFunction } from "express";
import { UserController } from "./user.controller";
import {
  requestWithdrawalSchema,
  startTaskParamSchema,
  submitDailyQuizSchema,
  submitQuizSchema,
  updateProfileSchema,
} from "./user.schema";
import multer from 'multer';
import { requireAuth } from "../../middlewares/auth.middleware";
import { ZodObject } from "zod";
import { NotificationController } from "../notifications/notification.controller";

const router = Router();
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB limit to prevent server crashing
});
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

      // THE FIX: Safely merge params and query instead of overwriting them
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
router.use(requireAuth);

router.get("/profile", UserController.getProfile);
router.patch(
  "/profile",
  validate(updateProfileSchema),
  UserController.updateProfile,
);
router.get("/dashboard", UserController.getDashboard);
router.post("/change-password", UserController.changePassword);
// Add these with your other user routes
router.delete("/account", UserController.deleteAccount);
router.get("/campaigns", UserController.getCampaigns);
router.get("/campaigns/:id", UserController.getCampaignDetails);
router.post(
  '/tasks/:taskId/submit', 
  requireAuth, 
  upload.single('proofImage'), // Intercepts the file
  UserController.submitTaskProof
);
// GET /api/user/referrals
router.get("/referrals", UserController.getReferralDashboard);

// GET /api/user/unlocks
router.get("/unlocks", UserController.getUnlockSchedule);

// POST /api/user/tasks/:taskId/quiz
router.post(
  "/tasks/:taskId/quiz",
  validate(submitQuizSchema),
  UserController.submitQuiz,
);
// --- 🏆 GAMIFICATION ---
// Claim a streak milestone bonus
router.post("/streak/claim", UserController.claimStreak);
router.post("/tasks/:taskId/start", UserController.startTask);
router.get('/quiz/today', UserController.getTodayQuiz);

// Submit answers and get paid
router.post(
  '/quiz/today/submit', 
  validate(submitDailyQuizSchema), 
  UserController.submitTodayQuiz
);
// --- WITHDRAWALS ---
// Get history
router.get('/withdrawals', requireAuth, UserController.getWithdrawals);

// Request new payout (Protected by Zod Schema)
router.post(
  '/withdrawals', 
  requireAuth, 
  validate(requestWithdrawalSchema), 
  UserController.requestWithdrawal
);
router.get('/notifications', requireAuth, NotificationController.getMyNotifications);
router.put('/notifications/read-all', requireAuth, NotificationController.markAllMyRead);
router.put('/notifications/:id/read', requireAuth, NotificationController.markRead);
export default router;
