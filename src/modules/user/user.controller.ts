import { Request, Response } from 'express';
import { UserService } from './user.service';
import { SubmissionStatus } from '@prisma/client';

export class UserController {
  static async getDashboard(req: Request, res: Response) {
    try {
      const dashboardData = await UserService.getUserDashboard(req.user!.id);
      res.status(200).json(dashboardData);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }

  static async getProfile(req: Request, res: Response) {
    try {
      const profile = await UserService.getUserProfile(req.user!.id);
      res.status(200).json(profile);
    } catch (error: any) {
      res.status(404).json({ error: error.message });
    }
  }

  static async updateProfile(req: Request, res: Response) {
    try {
      const updatedProfile = await UserService.updateProfile(req.user!.id, req.body);
      res.status(200).json({ message: "Profile updated", profile: updatedProfile });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  }

  static async changePassword(req: Request, res: Response) {
    try {
      const { newPassword } = req.body;
      if (!newPassword || newPassword.length < 8) {
        return res.status(400).json({ error: "Password must be at least 8 characters long." });
      }

      const result = await UserService.changePassword(req.user!.id, newPassword);
      res.status(200).json(result);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  }
 // **************************************************************
  // --- CAMPAIGN & TASK DISCOVERY ---
  // **************************************************************

  static async getCampaigns(req: Request, res: Response) {
    try {
      // Uses the service method we built earlier to filter by Tier and Country
      const campaigns = await UserService.getAvailableCampaigns(req.user!.id);
      res.status(200).json(campaigns);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }

  static async getCampaignDetails(req: Request, res: Response) {
    try {
      const campaignId = req.params.id as string;
      // This service method fetches the campaign AND includes the nested `tasks` array
      const campaign = await UserService.getCampaignDetails(req.user!.id, campaignId);
      res.status(200).json(campaign);
    } catch (error: any) {
      res.status(404).json({ error: error.message });
    }
  }

  // // **************************************************************
  // // --- PROOF SUBMISSION (MONEY IN) ---
  // // **************************************************************

static async submitTaskProof(req: Request, res: Response) {
    try {
      const taskId = req.params.taskId as string;
      const { screenshotUrl } = req.body;

      // Basic edge case validation
      if (!screenshotUrl || !screenshotUrl.startsWith('http')) {
        return res.status(400).json({ error: "A valid screenshotUrl is required." });
      }

      // Calls the massive transaction in the Service
      const result = await UserService.submitTask(req.user!.id, taskId, screenshotUrl);
      
      // Provide dynamic user feedback based on the AI's decision
      let message = "Proof submitted successfully and is pending manual review.";
      
      if (result.status === SubmissionStatus.LOCKED_15D) {
        message = "AI Verified! Your proof was auto-approved and funds have been added to your pending balance.";
      } else if (result.status === SubmissionStatus.REJECTED) {
        message = `AI Verification Failed: ${result.rejectionReason}`;
      }
      
      res.status(200).json({ message, submission: result });

    } catch (error: any) {
      // Catches Prisma transaction failures, double submissions, or campaign budget caps
      res.status(400).json({ error: error.message });
    }
  }
  static async deleteAccount(req: Request, res: Response) {
    try {
      const result = await UserService.deleteAccount(req.user!.id);
      res.status(200).json(result);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }
  // Inside UserController
  static async getReferralDashboard(req: Request, res: Response) {
    try {
      res.json(await UserService.getReferralDashboard(req.user!.id));
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  }

  static async getUnlockSchedule(req: Request, res: Response) {
    try {
      res.json(await UserService.getUnlockSchedule(req.user!.id));
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  }

  static async submitQuiz(req: Request, res: Response) {
    try {
      // 1. Explicitly cast taskId as a string
      const taskId = req.params.taskId as string;
      
      // 2. Pass the explicitly typed string
      const result = await UserService.submitQuizTask(req.user!.id, taskId, req.body.answers);
      
      res.status(200).json(result);
    } catch (error: any) { 
      res.status(400).json({ error: error.message }); 
    }
  }
  // --- STREAK CLAIMS ---
  static async claimStreak(req: Request, res: Response) {
    try {
      const result = await UserService.claimStreakBonus(req.user!.id);
      res.status(200).json(result);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  }

  // --- START TASK FLOW ---
  static async startTask(req: Request, res: Response) {
    try {
      const taskId = req.params.taskId as string;
      const result = await UserService.startTaskFlow(req.user!.id, taskId);
      res.status(200).json(result);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  }
  // --- DAILY QUIZ CONTROLLERS ---
  
  static async getTodayQuiz(req: Request, res: Response) {
    try {
      const quiz = await UserService.getTodayQuiz(req.user!.id);
      res.status(200).json(quiz);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  }

  static async submitTodayQuiz(req: Request, res: Response) {
    try {
      const { answers } = req.body;
      const result = await UserService.submitDailyQuiz(req.user!.id, answers);
      res.status(200).json(result);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  }
}