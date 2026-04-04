import { Router, Request, Response, NextFunction } from "express";
import { UserController } from "./user.controller";
import {
  startTaskParamSchema,
  submitQuizSchema,
  updateProfileSchema,
} from "./user.schema";
import { requireAuth } from "../../middlewares/auth.middleware";
import { ZodObject } from "zod";

const router = Router();

const validate =
  (schema: any) => async (req: Request, res: Response, next: NextFunction) => {
    try {
      // 1. We parse an object containing body, query, and params
      const validated = await schema.parseAsync({
        body: req.body,
        query: req.query,
        params: req.params,
      });
      req.body = validated.body;
      req.params = validated.params;
      req.query = validated.query;

      next();
    } catch (error: any) {
      // 3. SAFETY CHECK: Check for 'issues' (Zod's standard) or 'errors'
      const zErrors = error.issues || error.errors || [];

      console.log("❌ Zod Error Details:", JSON.stringify(zErrors, null, 2));

      return res.status(400).json({
        error: "Validation Failed",
        // 4. Safe mapping with optional chaining
        details:
          zErrors.map?.((e: any) => ({
            path: e.path.join("."),
            message: e.message,
          })) || "Unknown validation error",
      });
    }
  };
router.use(requireAuth);
// Apply requireAuth middleware so only logged-in users can hit these routes
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
// router.post('/tasks/:taskId/submit', UserController.submitTaskProof);
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

// --- 🎯 TASK FLOW ---
// Start a task (checks budget and returns instructions based on category)
router.post("/tasks/:taskId/start", UserController.startTask);
export default router;
