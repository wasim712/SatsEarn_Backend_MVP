import { Request, Response } from 'express';
import { UserService } from './user.service';

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

  // static async submitTaskProof(req: Request, res: Response) {
  //   try {
  //     const taskId = req.params.taskId as string;
  //     const { screenshotUrl } = req.body;

  //     if (!screenshotUrl) {
  //       return res.status(400).json({ error: "screenshotUrl is required to submit a task." });
  //     }

  //     // Calls the massive transaction we wrote earlier: 
  //     // 1. AI Verifier -> 2. Create Submission -> 3. Pay User -> 4. Pay Referrer
  //     const result = await UserService.submitTask(req.user!.id, taskId, screenshotUrl);
      
  //     res.status(200).json({ 
  //       message: "Proof submitted successfully!", 
  //       submission: result 
  //     });
  //   } catch (error: any) {
  //     // Return 400 for business logic errors (e.g., "Already submitted", "Budget reached")
  //     res.status(400).json({ error: error.message });
  //   }
  // }
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
}