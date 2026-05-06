import { Request, Response } from 'express';
import { AdminService } from '../admin.service';

export const adminManagementHandlers = {
  async createAnnouncement(req: Request, res: Response) {
    try { res.status(201).json({ message: 'Announcement created', announcement: await AdminService.createAnnouncement(req.body) }); }
    catch (error: any) { res.status(400).json({ error: error.message }); }
  },
  async getAllAnnouncements(_req: Request, res: Response) {
    try { res.status(200).json(await AdminService.getAllAnnouncements()); }
    catch (error: any) { res.status(500).json({ error: error.message }); }
  },
  async updateAnnouncement(req: Request, res: Response) {
    try { res.status(200).json({ message: 'Announcement updated', announcement: await AdminService.updateAnnouncement(req.params.id as string, req.body) }); }
    catch (error: any) { res.status(400).json({ error: error.message }); }
  },
  async deleteAnnouncement(req: Request, res: Response) {
    try { await AdminService.deleteAnnouncement(req.params.id as string); res.status(200).json({ message: 'Announcement deleted' }); }
    catch (error: any) { res.status(400).json({ error: error.message }); }
  },
  async getPendingSubmissions(_req: Request, res: Response) {
    try { res.status(200).json(await AdminService.getPendingSubmissions()); }
    catch (error: any) { res.status(500).json({ error: error.message }); }
  },
  async reviewSubmission(req: Request, res: Response) {
    try {
      const { status, rejectionReason } = req.body;
      if (status !== 'LOCKED_15D' && status !== 'REJECTED') {
        return res.status(400).json({ error: "Invalid status. Manual review only accepts 'LOCKED_15D' (Approve) or 'REJECTED'." });
      }
      const result = await AdminService.reviewSubmission(req.params.id as string, status, rejectionReason, req.user?.id as string | undefined);
      res.status(200).json({ message: `Submission successfully marked as ${status}`, result });
    } catch (error: any) { res.status(400).json({ error: error.message }); }
  },
  async getWithdrawals(_req: Request, res: Response) {
    try { res.json(await AdminService.getAllWithdrawals()); }
    catch (error: any) { res.status(400).json({ error: error.message }); }
  },
  async approveWithdrawal(req: Request, res: Response) {
    try { res.json(await AdminService.processWithdrawal(req.params.id as string, 'PAID', req.body.paymentProof)); }
    catch (error: any) { res.status(400).json({ error: error.message }); }
  },
  async rejectWithdrawal(req: Request, res: Response) {
    try { res.json(await AdminService.processWithdrawal(req.params.id as string, 'REJECTED')); }
    catch (error: any) { res.status(400).json({ error: error.message }); }
  },
  async getPlatformSettings(_req: Request, res: Response) {
    try { res.status(200).json(await AdminService.getGamificationSettings()); }
    catch (error: any) { res.status(500).json({ error: error.message }); }
  },
  async updatePlatformSettings(req: Request, res: Response) {
    try { res.status(200).json({ message: 'Settings updated', settings: await AdminService.updateGamificationSettings(req.body) }); }
    catch (error: any) { res.status(400).json({ error: error.message }); }
  },
  async getAllUsers(_req: Request, res: Response) {
    try { res.status(200).json(await AdminService.getAllUsers()); }
    catch (error: any) { res.status(500).json({ error: error.message }); }
  },
  async getUserDetails(req: Request, res: Response) {
    try { res.status(200).json(await AdminService.getUserDetails(req.params.id as string)); }
    catch (error: any) { res.status(404).json({ error: error.message }); }
  },
  async banUser(req: Request, res: Response) {
    try {
      const user = await AdminService.setUserActiveState(req.params.id as string, false);
      res.status(200).json({ message: 'User account suspended successfully.', user });
    } catch (error: any) { res.status(400).json({ error: error.message }); }
  },
  async activateUser(req: Request, res: Response) {
    try {
      const user = await AdminService.setUserActiveState(req.params.id as string, true);
      res.status(200).json({ message: 'User account reactivated successfully.', user });
    } catch (error: any) { res.status(400).json({ error: error.message }); }
  },
  async deleteUser(req: Request, res: Response) {
    try {
      const user = await AdminService.deleteUserAccount(req.params.id as string);
      res.status(200).json({ message: 'User account deleted successfully.', user });
    } catch (error: any) { res.status(400).json({ error: error.message }); }
  },
  async createDailyQuiz(req: Request, res: Response) {
    try { res.status(201).json({ message: 'Daily Quiz created successfully!', quiz: await AdminService.createDailyQuiz(req.body) }); }
    catch (error: any) { res.status(400).json({ error: error.message }); }
  },
  async getAllDailyQuizzes(_req: Request, res: Response) {
    try { res.status(200).json(await AdminService.getAllDailyQuizzes()); }
    catch (error: any) { res.status(500).json({ error: error.message }); }
  },
  async getDailyQuiz(req: Request, res: Response) {
    try { res.status(200).json(await AdminService.getDailyQuizById(req.params.id as string)); }
    catch (error: any) { res.status(404).json({ error: error.message }); }
  },
  async updateDailyQuiz(req: Request, res: Response) {
    try { res.status(200).json({ message: 'Quiz updated', quiz: await AdminService.updateDailyQuiz(req.params.id as string, req.body) }); }
    catch (error: any) { res.status(400).json({ error: error.message }); }
  },
  async deleteDailyQuiz(req: Request, res: Response) {
    try { res.status(200).json(await AdminService.deleteDailyQuiz(req.params.id as string)); }
    catch (error: any) { res.status(400).json({ error: error.message }); }
  },
};
