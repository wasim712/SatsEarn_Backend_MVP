import { Request, Response } from 'express';
import { CloudinaryService } from '../../cloudinary/cloudinary.service';
import { AdminService } from '../admin.service';

export const adminCampaignHandlers = {
  async getDashboardMetrics(_req: Request, res: Response) {
    try { res.status(200).json(await AdminService.getOverviewMetrics()); }
    catch (error: any) { res.status(500).json({ error: error.message }); }
  },
  async createCampaign(req: Request, res: Response) {
    try { res.status(201).json({ message: 'Campaign created successfully', campaign: await AdminService.createCampaign(req.body) }); }
    catch (error: any) { res.status(400).json({ error: error.message }); }
  },
  async uploadCampaignCover(req: Request, res: Response) {
    try {
      const file = req.file;
      if (!file) {
        return res.status(400).json({ error: 'Campaign cover image file is required.' });
      }
      const coverImageUrl = await CloudinaryService.uploadImageBuffer(file.buffer, 'campaign_covers');
      res.status(200).json({ message: 'Campaign cover uploaded successfully', coverImageUrl });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  },
  async getCampaignAnalytics(req: Request, res: Response) {
    try { res.status(200).json(await AdminService.getCampaignAnalytics(req.params.id as string)); }
    catch (error: any) { res.status(error.message === 'Campaign not found' ? 404 : 500).json({ error: error.message }); }
  },
  async getAllCampaigns(_req: Request, res: Response) {
    try { res.status(200).json(await AdminService.getAllCampaigns()); }
    catch (error: any) { res.status(500).json({ error: error.message }); }
  },
  async getCampaignById(req: Request, res: Response) {
    try { res.status(200).json(await AdminService.getCampaignById(req.params.id as string)); }
    catch (error: any) { res.status(404).json({ error: error.message }); }
  },
  async updateCampaign(req: Request, res: Response) {
    try { res.status(200).json({ message: 'Campaign updated', campaign: await AdminService.updateCampaign(req.params.id as string, req.body) }); }
    catch (error: any) { res.status(error.message === 'Campaign not found' ? 404 : 400).json({ error: error.message }); }
  },
  async deleteCampaign(req: Request, res: Response) {
    try { await AdminService.deleteCampaign(req.params.id as string); res.status(200).json({ message: 'Campaign deleted successfully' }); }
    catch (error: any) { res.status(error.message === 'Campaign not found' ? 404 : 400).json({ error: error.message }); }
  },
  async addTaskToCampaign(req: Request, res: Response) {
    try { res.status(201).json({ message: 'Task added successfully', task: await AdminService.addTaskToCampaign(req.params.campaignId as string, req.body) }); }
    catch (error: any) { res.status(400).json({ error: error.message }); }
  },
  async getAllTasksForCampaign(req: Request, res: Response) {
    try { res.status(200).json(await AdminService.getAllTasksForCampaign(req.params.campaignId as string)); }
    catch (error: any) { res.status(404).json({ error: error.message }); }
  },
  async getTaskById(req: Request, res: Response) {
    try { res.status(200).json(await AdminService.getTaskById(req.params.campaignId as string, req.params.taskId as string)); }
    catch (error: any) { res.status(404).json({ error: error.message }); }
  },
  async updateTask(req: Request, res: Response) {
    try { res.status(200).json({ message: 'Task updated', task: await AdminService.updateTask(req.params.campaignId as string, req.params.taskId as string, req.body) }); }
    catch (error: any) { res.status(400).json({ error: error.message }); }
  },
  async deleteTask(req: Request, res: Response) {
    try { await AdminService.deleteTask(req.params.campaignId as string, req.params.taskId as string); res.status(200).json({ message: 'Task deleted successfully' }); }
    catch (error: any) { res.status(400).json({ error: error.message }); }
  },
};
