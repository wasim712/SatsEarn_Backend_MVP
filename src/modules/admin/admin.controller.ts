import { Request, Response } from 'express';
import { AdminService } from './admin.service';

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
      res.status(201).json({ message: "Campaign created successfully", campaign });
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
      if (error.message === "Campaign not found") return res.status(404).json({ error: error.message });
      res.status(500).json({ error: error.message });
    }
  }

  static async updateCampaign(req: Request, res: Response) {
    try {
      const id = req.params.id as string;
      const updatedCampaign = await AdminService.updateCampaign(id, req.body);
      res.status(200).json({ message: "Campaign updated", campaign: updatedCampaign });
    } catch (error: any) {
      if (error.message === "Campaign not found") return res.status(404).json({ error: error.message });
      res.status(400).json({ error: error.message });
    }
  }

  static async deleteCampaign(req: Request, res: Response) {
    try {
      const id = req.params.id as string;
      await AdminService.deleteCampaign(id);
      res.status(200).json({ message: "Campaign deleted successfully" });
    } catch (error: any) {
      if (error.message === "Campaign not found") return res.status(404).json({ error: error.message });
      res.status(400).json({ error: error.message });
    }
  }
  }
