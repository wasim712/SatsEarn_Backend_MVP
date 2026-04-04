import { Request, Response } from "express";
import { AdminService } from "./admin.service";

export class AdminController {
  static async getDashboardMetrics(req: Request, res: Response) {
    try {
      const metrics = await AdminService.getOverviewMetrics();
      res.status(200).json(metrics);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }
  // Add this below the getDashboardMetrics method
  static async createCampaign(req: Request, res: Response) {
    try {
      const campaign = await AdminService.createCampaign(req.body);
      res
        .status(201)
        .json({ message: "Campaign created successfully", campaign });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  }
  static async getCampaignAnalytics(req: Request, res: Response) {
    try {
      const id = req.params.id as string;
      const analytics = await AdminService.getCampaignAnalytics(id);
      res.status(200).json(analytics);
    } catch (error: any) {
      if (error.message === "Campaign not found") {
        res.status(404).json({ error: error.message });
      } else {
        res.status(500).json({ error: error.message });
      }
    }
  }
  // --- CAMPAIGN CRUD CONTROLLERS ---

  static async getAllCampaigns(req: Request, res: Response) {
    try {
      const campaigns = await AdminService.getAllCampaigns();
      res.status(200).json(campaigns);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }

  static async getCampaignById(req: Request, res: Response) {
    try {
      const id = req.params.id as string;
      const campaign = await AdminService.getCampaignById(id);
      res.status(200).json(campaign);
    } catch (error: any) {
      if (error.message === "Campaign not found")
        return res.status(404).json({ error: error.message });
      res.status(500).json({ error: error.message });
    }
  }

  static async updateCampaign(req: Request, res: Response) {
    try {
      const id = req.params.id as string;
      const updatedCampaign = await AdminService.updateCampaign(id, req.body);
      res
        .status(200)
        .json({ message: "Campaign updated", campaign: updatedCampaign });
    } catch (error: any) {
      if (error.message === "Campaign not found")
        return res.status(404).json({ error: error.message });
      res.status(400).json({ error: error.message });
    }
  }

  static async deleteCampaign(req: Request, res: Response) {
    try {
      const id = req.params.id as string;
      await AdminService.deleteCampaign(id);
      res.status(200).json({ message: "Campaign deleted successfully" });
    } catch (error: any) {
      if (error.message === "Campaign not found")
        return res.status(404).json({ error: error.message });
      res.status(400).json({ error: error.message });
    }
  }

  // **************************************************************
  // --- TASK CONTROLLERS ---
  // *************************************************************
  static async addTaskToCampaign(req: Request, res: Response) {
    try {
      const campaignId = req.params.campaignId as string;
      const newTask = await AdminService.addTaskToCampaign(
        campaignId,
        req.body,
      );
      res
        .status(201)
        .json({ message: "Task added to campaign", task: newTask });
    } catch (error: any) {
      if (error.message === "Campaign not found")
        return res.status(404).json({ error: error.message });
      res.status(400).json({ error: error.message });
    }
  }
  static async getAllTasksForCampaign(req: Request, res: Response) {
    try {
      const campaignId = req.params.campaignId as string;
      const tasks = await AdminService.getAllTasksForCampaign(campaignId);
      res.status(200).json(tasks);
    } catch (error: any) {
      if (error.message === "Campaign not found")
        return res.status(404).json({ error: error.message });
      res.status(500).json({ error: error.message });
    }
  }

  static async getTaskById(req: Request, res: Response) {
    try {
      const { campaignId, taskId } = req.params;
      const task = await AdminService.getTaskById(
        campaignId as string,
        taskId as string,
      );
      res.status(200).json(task);
    } catch (error: any) {
      res.status(404).json({ error: error.message });
    }
  }

  static async updateTask(req: Request, res: Response) {
    try {
      const { campaignId, taskId } = req.params;
      const updatedTask = await AdminService.updateTask(
        campaignId as string,
        taskId as string,
        req.body,
      );
      res.status(200).json({ message: "Task updated", task: updatedTask });
    } catch (error: any) {
      if (error.message === "Task not found in this campaign")
        return res.status(404).json({ error: error.message });
      res.status(400).json({ error: error.message });
    }
  }

  static async deleteTask(req: Request, res: Response) {
    try {
      const { campaignId, taskId } = req.params;
      await AdminService.deleteTask(campaignId as string, taskId as string);
      res.status(200).json({ message: "Task deleted successfully" });
    } catch (error: any) {
      res.status(404).json({ error: error.message });
    }
  }
  // --- ANNOUNCEMENT CONTROLLERS ---

  static async createAnnouncement(req: Request, res: Response) {
    try {
      const announcement = await AdminService.createAnnouncement(req.body);
      res.status(201).json(announcement);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  }

  static async getAllAnnouncements(req: Request, res: Response) {
    try {
      const list = await AdminService.getAllAnnouncements();
      res.status(200).json(list);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }

  static async updateAnnouncement(req: Request, res: Response) {
    try {
      const updated = await AdminService.updateAnnouncement(req.params.id as string, req.body);
      res.status(200).json(updated);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  }

  static async deleteAnnouncement(req: Request, res: Response) {
    try {
      await AdminService.deleteAnnouncement(req.params.id as string);
      res.status(200).json({ message: "Announcement deleted" });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  }
  static async getPendingSubmissions(req: Request, res: Response) {
    try {
      // Assuming you add this to AdminService
      const submissions = await AdminService.getPendingSubmissions(); 
      res.status(200).json(submissions);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }

  static async reviewSubmission(req: Request, res: Response) {
    try {
      // 1. Explicitly cast the ID as a single string
      const id = req.params.id as string;
      
      // 2. Explicitly cast the status to match the exact Enum required by the service
      const status = req.body.status as 'PENDING_24H' | 'REJECTED';
      
      // 3. Cast optional fields
      const rejectionReason = req.body.rejectionReason as string | undefined;
      const adminId = req.user?.id as string | undefined; 

      const result = await AdminService.reviewSubmission(id, status, rejectionReason, adminId);
      res.status(200).json({ message: `Submission marked as ${status}`, result });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  }
  // **************************************************************
  // --- WITHDRAWAL CONTROLLERS ---
  // **************************************************************

  static async getPendingWithdrawals(req: Request, res: Response) {
    try {
      const withdrawals = await AdminService.getPendingWithdrawals();
      res.status(200).json(withdrawals);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }
static async processWithdrawal(req: Request, res: Response) {
    try {
      // 1. Explicitly cast the ID as a single string
      const id = req.params.id as string;
      
      // 2. Explicitly cast the status to match the exact Enum
      const status = req.body.status as 'PAID' | 'REJECTED';
      
      // 3. Cast the payment proof as a string or undefined
      const paymentProof = req.body.paymentProof as string | undefined;

      const result = await AdminService.processWithdrawal(id, status, paymentProof);
      res.status(200).json({ message: `Withdrawal marked as ${status}`, result });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  }
  // **************************************************************
  // --- SETTINGS CONTROLLERS ---
  // **************************************************************

  static async getPlatformSettings(req: Request, res: Response) {
    try {
      const settings = await AdminService.getGamificationSettings();
      res.status(200).json(settings);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }

  static async updatePlatformSettings(req: Request, res: Response) {
    try {
      const updatedSettings = await AdminService.updateGamificationSettings(req.body);
      res.status(200).json({ message: "Settings updated", settings: updatedSettings });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  }
  static async getAllUsers(req: Request, res: Response) {
    try {
      const users = await AdminService.getAllUsers();
      res.status(200).json(users);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }
}
