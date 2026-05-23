import { Request, Response } from 'express';
import { CloudinaryService } from '../../cloudinary/cloudinary.service';
import { UserService } from '../user.service';

export const userTaskHandlers = {
  async getCampaigns(req: Request, res: Response) {
    try { res.status(200).json(await UserService.getAvailableCampaigns(req.user!.id)); }
    catch (error: any) { res.status(500).json({ error: error.message }); }
  },
  async getStandaloneTasks(req: Request, res: Response) {
    try { res.status(200).json(await UserService.getStandaloneTasks(req.user!.id)); }
    catch (error: any) { res.status(500).json({ error: error.message }); }
  },
  async getCampaignDetails(req: Request, res: Response) {
    try { res.status(200).json(await UserService.getCampaignDetails(req.user!.id, req.params.id as string)); }
    catch (error: any) { res.status(404).json({ error: error.message }); }
  },
  async getStandaloneTaskDetails(req: Request, res: Response) {
    try { res.status(200).json(await UserService.getStandaloneTaskDetails(req.user!.id, req.params.taskId as string)); }
    catch (error: any) { res.status(404).json({ error: error.message }); }
  },
  async submitTaskProof(req: Request, res: Response) {
    try {
      const taskId = req.params.taskId as string;
      const file = req.file;
      const proofText = req.body.proofText;
      const isApiVerification = req.body.triggerVerification;
      const clientIp = req.ip || req.headers['x-forwarded-for']?.toString() || 'UNKNOWN';

      if (!file && !proofText && !isApiVerification) {
        return res.status(400).json({ error: 'Proof is required. Please upload an image, enter text/URL, or trigger verification.' });
      }

      let screenshotUrl: string | undefined;
      if (file) {
        screenshotUrl = await CloudinaryService.uploadImageBuffer(file.buffer);
      }

      const result = await UserService.submitTask(req.user!.id, taskId, { screenshotUrl, proofText }, clientIp);

      let message = 'Proof submitted successfully and is pending manual review.';
      if (result.status === 'PENDING_24H' || result.status === 'LOCKED_15D') {
        message = 'AI Verified! Your proof was auto-approved and funds have been added to your pending balance.';
      } else if (result.status === 'REJECTED') {
        message = `AI Verification Failed: ${result.rejectionReason}`;
      }

      res.status(200).json({ message, submission: result, proofProvided: screenshotUrl || proofText || 'API Verified' });
    } catch (error: any) { res.status(400).json({ error: error.message }); }
  },
  async getTaskStatus(req: Request, res: Response) {
    try { res.status(200).json(await UserService.getTaskStatus(req.user!.id, req.params.taskId as string)); }
    catch (error: any) { res.status(400).json({ error: error.message }); }
  },
  async getReferralDashboard(req: Request, res: Response) {
    try { res.json(await UserService.getReferralDashboard(req.user!.id)); }
    catch (error: any) { res.status(500).json({ error: error.message }); }
  },
  async getUnlockSchedule(req: Request, res: Response) {
    try { res.json(await UserService.getUnlockSchedule(req.user!.id)); }
    catch (error: any) { res.status(500).json({ error: error.message }); }
  },
  async getSubmissionHistory(req: Request, res: Response) {
    try { res.json(await UserService.getSubmissionHistory(req.user!.id)); }
    catch (error: any) { res.status(500).json({ error: error.message }); }
  },
  async submitBugReport(req: Request, res: Response) {
    try {
      let screenshotUrl: string | undefined;
      if (req.file) {
        screenshotUrl = await CloudinaryService.uploadImageBuffer(req.file.buffer, 'bug_reports');
      }
      res.status(201).json(await UserService.submitBugReport(req.user!.id, { ...req.body, screenshotUrl }));
    } catch (error: any) { res.status(400).json({ error: error.message }); }
  },
  async getMyBugReports(req: Request, res: Response) {
    try { res.status(200).json(await UserService.getMyBugReports(req.user!.id)); }
    catch (error: any) { res.status(500).json({ error: error.message }); }
  },
  async getBugBountyStats(_req: Request, res: Response) {
    try { res.status(200).json(await UserService.getBugBountyStats()); }
    catch (error: any) { res.status(500).json({ error: error.message }); }
  },
  async getPublishedBlogs(_req: Request, res: Response) {
    try { res.status(200).json(await UserService.getPublishedBlogs()); }
    catch (error: any) { res.status(500).json({ error: error.message }); }
  },
  async getActiveFaqs(_req: Request, res: Response) {
    try { res.status(200).json(await UserService.getActiveFaqs()); }
    catch (error: any) { res.status(500).json({ error: error.message }); }
  },
  async submitQuiz(req: Request, res: Response) {
    try { res.status(200).json(await UserService.submitQuizTask(req.user!.id, req.params.taskId as string, req.body.answers)); }
    catch (error: any) { res.status(400).json({ error: error.message }); }
  },
  async claimStreak(req: Request, res: Response) {
    try { res.status(200).json(await UserService.claimStreakBonus(req.user!.id)); }
    catch (error: any) { res.status(400).json({ error: error.message }); }
  },
  async claimSatWormReward(req: Request, res: Response) {
    try { res.status(200).json(await UserService.claimSatWormReward(req.user!.id, req.body)); }
    catch (error: any) { res.status(400).json({ error: error.message }); }
  },
  async startTask(req: Request, res: Response) {
    try { res.status(200).json(await UserService.startTaskFlow(req.user!.id, req.params.taskId as string)); }
    catch (error: any) { res.status(400).json({ error: error.message }); }
  },
  async getTodayQuiz(req: Request, res: Response) {
    try { res.status(200).json(await UserService.getTodayQuiz(req.user!.id)); }
    catch (error: any) { res.status(400).json({ error: error.message }); }
  },
  async submitTodayQuiz(req: Request, res: Response) {
    try { res.status(200).json(await UserService.submitDailyQuiz(req.user!.id, req.body.answers)); }
    catch (error: any) { res.status(400).json({ error: error.message }); }
  },
};
