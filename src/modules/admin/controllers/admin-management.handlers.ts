import { Request, Response } from 'express';
import { AdminService } from '../admin.service';
import { clientErrorMessage } from '../../../utils/client-error.util';

export const adminManagementHandlers = {
  async createAnnouncement(req: Request, res: Response) {
    try { res.status(201).json({ message: 'Announcement created', announcement: await AdminService.createAnnouncement(req.body) }); }
    catch (error: any) { res.status(400).json({ error: clientErrorMessage(error) }); }
  },
  async getAllAnnouncements(_req: Request, res: Response) {
    try { res.status(200).json(await AdminService.getAllAnnouncements()); }
    catch (error: any) { res.status(500).json({ error: clientErrorMessage(error) }); }
  },
  async updateAnnouncement(req: Request, res: Response) {
    try { res.status(200).json({ message: 'Announcement updated', announcement: await AdminService.updateAnnouncement(req.params.id as string, req.body) }); }
    catch (error: any) { res.status(400).json({ error: clientErrorMessage(error) }); }
  },
  async deleteAnnouncement(req: Request, res: Response) {
    try { await AdminService.deleteAnnouncement(req.params.id as string); res.status(200).json({ message: 'Announcement deleted' }); }
    catch (error: any) { res.status(400).json({ error: clientErrorMessage(error) }); }
  },
  async getPendingSubmissions(_req: Request, res: Response) {
    try { res.status(200).json(await AdminService.getPendingSubmissions()); }
    catch (error: any) { res.status(500).json({ error: clientErrorMessage(error) }); }
  },
  async reviewSubmission(req: Request, res: Response) {
    try {
      const { status, rejectionReason } = req.body;
      if (status !== 'LOCKED_15D' && status !== 'REJECTED') {
        return res.status(400).json({ error: "Invalid status. Manual review only accepts 'LOCKED_15D' (Approve) or 'REJECTED'." });
      }
      const result = await AdminService.reviewSubmission(req.params.id as string, status, rejectionReason, req.user?.id as string | undefined);
      res.status(200).json({ message: `Submission successfully marked as ${status}`, result });
    } catch (error: any) { res.status(400).json({ error: clientErrorMessage(error) }); }
  },
  async getWithdrawals(_req: Request, res: Response) {
    try { res.json(await AdminService.getAllWithdrawals()); }
    catch (error: any) { res.status(400).json({ error: clientErrorMessage(error) }); }
  },
  async approveWithdrawal(req: Request, res: Response) {
    try { res.json(await AdminService.processWithdrawal(req.params.id as string, 'PAID', req.body.paymentProof)); }
    catch (error: any) { res.status(400).json({ error: clientErrorMessage(error) }); }
  },
  async rejectWithdrawal(req: Request, res: Response) {
    try { res.json(await AdminService.processWithdrawal(req.params.id as string, 'REJECTED')); }
    catch (error: any) { res.status(400).json({ error: clientErrorMessage(error) }); }
  },
  async getPlatformSettings(_req: Request, res: Response) {
    try { res.status(200).json(await AdminService.getGamificationSettings()); }
    catch (error: any) { res.status(500).json({ error: clientErrorMessage(error) }); }
  },
  async updatePlatformSettings(req: Request, res: Response) {
    try { res.status(200).json({ message: 'Settings updated', settings: await AdminService.updateGamificationSettings(req.body) }); }
    catch (error: any) { res.status(400).json({ error: clientErrorMessage(error) }); }
  },
  async getAllBugReports(_req: Request, res: Response) {
    try { res.status(200).json(await AdminService.getAllBugReports()); }
    catch (error: any) { res.status(500).json({ error: clientErrorMessage(error) }); }
  },
  async reviewBugReport(req: Request, res: Response) {
    try { res.status(200).json(await AdminService.reviewBugReport(req.params.id as string, req.user!.id, req.body)); }
    catch (error: any) { res.status(400).json({ error: clientErrorMessage(error) }); }
  },
  async createBlogPost(req: Request, res: Response) {
    try { res.status(201).json({ message: 'Blog post created', post: await AdminService.createBlogPost(req.body) }); }
    catch (error: any) { res.status(400).json({ error: clientErrorMessage(error) }); }
  },
  async getAllBlogPosts(_req: Request, res: Response) {
    try { res.status(200).json(await AdminService.getAllBlogPosts()); }
    catch (error: any) { res.status(500).json({ error: clientErrorMessage(error) }); }
  },
  async updateBlogPost(req: Request, res: Response) {
    try { res.status(200).json({ message: 'Blog post updated', post: await AdminService.updateBlogPost(req.params.id as string, req.body) }); }
    catch (error: any) { res.status(400).json({ error: clientErrorMessage(error) }); }
  },
  async deleteBlogPost(req: Request, res: Response) {
    try { res.status(200).json(await AdminService.deleteBlogPost(req.params.id as string)); }
    catch (error: any) { res.status(400).json({ error: clientErrorMessage(error) }); }
  },
  async createFaqItem(req: Request, res: Response) {
    try { res.status(201).json({ message: 'FAQ item created', item: await AdminService.createFaqItem(req.body) }); }
    catch (error: any) { res.status(400).json({ error: clientErrorMessage(error) }); }
  },
  async getAllFaqItems(_req: Request, res: Response) {
    try { res.status(200).json(await AdminService.getAllFaqItems()); }
    catch (error: any) { res.status(500).json({ error: clientErrorMessage(error) }); }
  },
  async updateFaqItem(req: Request, res: Response) {
    try { res.status(200).json({ message: 'FAQ item updated', item: await AdminService.updateFaqItem(req.params.id as string, req.body) }); }
    catch (error: any) { res.status(400).json({ error: clientErrorMessage(error) }); }
  },
  async deleteFaqItem(req: Request, res: Response) {
    try { res.status(200).json(await AdminService.deleteFaqItem(req.params.id as string)); }
    catch (error: any) { res.status(400).json({ error: clientErrorMessage(error) }); }
  },
  async getAllUsers(_req: Request, res: Response) {
    try { res.status(200).json(await AdminService.getAllUsers()); }
    catch (error: any) { res.status(500).json({ error: clientErrorMessage(error) }); }
  },
  async getPremiumRequests(_req: Request, res: Response) {
    try { res.status(200).json(await AdminService.getPremiumRequests()); }
    catch (error: any) { res.status(500).json({ error: clientErrorMessage(error) }); }
  },
  async getUserDetails(req: Request, res: Response) {
    try { res.status(200).json(await AdminService.getUserDetails(req.params.id as string)); }
    catch (error: any) { res.status(404).json({ error: clientErrorMessage(error) }); }
  },
  async getCheatUser(req: Request, res: Response) {
    try { res.status(200).json(await AdminService.getCheatUserState()); }
    catch (error: any) { res.status(404).json({ error: clientErrorMessage(error) }); }
  },
  async updateCheatUser(req: Request, res: Response) {
    try { res.status(200).json({ message: 'Cheat user updated successfully.', user: await AdminService.updateCheatUserState(req.body, req.user?.id) }); }
    catch (error: any) { res.status(400).json({ error: clientErrorMessage(error) }); }
  },
  async banUser(req: Request, res: Response) {
    try {
      const user = await AdminService.setUserActiveState(req.params.id as string, false);
      res.status(200).json({ message: 'User account suspended successfully.', user });
    } catch (error: any) { res.status(400).json({ error: clientErrorMessage(error) }); }
  },
  async activateUser(req: Request, res: Response) {
    try {
      const user = await AdminService.setUserActiveState(req.params.id as string, true);
      res.status(200).json({ message: 'User account reactivated successfully.', user });
    } catch (error: any) { res.status(400).json({ error: clientErrorMessage(error) }); }
  },
  async deleteUser(req: Request, res: Response) {
    try {
      const user = await AdminService.deleteUserAccount(req.params.id as string);
      res.status(200).json({ message: 'User account deleted successfully.', user });
    } catch (error: any) { res.status(400).json({ error: clientErrorMessage(error) }); }
  },
  async updateUserPremium(req: Request, res: Response) {
    try {
      const user = await AdminService.updateUserPremium(req.params.id as string, req.body);
      res.status(200).json({ message: 'User premium tier updated successfully.', user });
    } catch (error: any) { res.status(400).json({ error: clientErrorMessage(error) }); }
  },
  async adjustUserSubmissionReward(req: Request, res: Response) {
    try {
      const user = await AdminService.adjustUserSubmissionReward(req.params.id as string, req.body);
      res.status(200).json({ message: 'Submission reward adjusted successfully.', user });
    } catch (error: any) { res.status(400).json({ error: clientErrorMessage(error) }); }
  },
  async updatePremiumRequest(req: Request, res: Response) {
    try {
      const request = await AdminService.updatePremiumRequest(req.params.id as string, req.body);
      res.status(200).json({ message: 'Premium request updated successfully.', request });
    } catch (error: any) { res.status(400).json({ error: clientErrorMessage(error) }); }
  },
  async createDailyQuiz(req: Request, res: Response) {
    try { res.status(201).json({ message: 'Daily Quiz created successfully!', quiz: await AdminService.createDailyQuiz(req.body) }); }
    catch (error: any) { res.status(400).json({ error: clientErrorMessage(error) }); }
  },
  async getAllDailyQuizzes(_req: Request, res: Response) {
    try { res.status(200).json(await AdminService.getAllDailyQuizzes()); }
    catch (error: any) { res.status(500).json({ error: clientErrorMessage(error) }); }
  },
  async getDailyQuiz(req: Request, res: Response) {
    try { res.status(200).json(await AdminService.getDailyQuizById(req.params.id as string)); }
    catch (error: any) { res.status(404).json({ error: clientErrorMessage(error) }); }
  },
  async updateDailyQuiz(req: Request, res: Response) {
    try { res.status(200).json({ message: 'Quiz updated', quiz: await AdminService.updateDailyQuiz(req.params.id as string, req.body) }); }
    catch (error: any) { res.status(400).json({ error: clientErrorMessage(error) }); }
  },
  async deleteDailyQuiz(req: Request, res: Response) {
    try { res.status(200).json(await AdminService.deleteDailyQuiz(req.params.id as string)); }
    catch (error: any) { res.status(400).json({ error: clientErrorMessage(error) }); }
  },
};
