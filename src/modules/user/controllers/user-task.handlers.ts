import { Request, Response } from 'express';
import { CloudinaryService } from '../../cloudinary/cloudinary.service';
import { computeImageHash } from '../../verification/verification.service';
import { UserService } from '../user.service';
import { clientErrorMessage } from '../../../utils/client-error.util';

export const userTaskHandlers = {
  async getCampaigns(req: Request, res: Response) {
    try { res.status(200).json(await UserService.getAvailableCampaigns(req.user!.id)); }
    catch (error: any) { res.status(500).json({ error: clientErrorMessage(error) }); }
  },
  async getStandaloneTasks(req: Request, res: Response) {
    try { res.status(200).json(await UserService.getStandaloneTasks(req.user!.id)); }
    catch (error: any) { res.status(500).json({ error: clientErrorMessage(error) }); }
  },
  async getCampaignDetails(req: Request, res: Response) {
    try { res.status(200).json(await UserService.getCampaignDetails(req.user!.id, req.params.id as string)); }
    catch (error: any) { res.status(404).json({ error: clientErrorMessage(error) }); }
  },
  async getStandaloneTaskDetails(req: Request, res: Response) {
    try { res.status(200).json(await UserService.getStandaloneTaskDetails(req.user!.id, req.params.taskId as string)); }
    catch (error: any) { res.status(404).json({ error: clientErrorMessage(error) }); }
  },
  async submitStandaloneTaskProof(req: Request, res: Response) {
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
      let imageHash: string | null = null;
      if (file) {
        screenshotUrl = await CloudinaryService.uploadImageBuffer(file.buffer);
        imageHash = await computeImageHash(file.buffer);
      }

      const result = await UserService.submitStandaloneTask(req.user!.id, taskId, { screenshotUrl, proofText, imageHash }, clientIp);

      let message = 'Proof submitted successfully and is pending manual review.';
      if (result.status === 'PENDING_24H' || result.status === 'LOCKED_15D') {
        message = 'AI Verified! Your proof was auto-approved and funds have been added to your pending balance.';
      } else if (result.status === 'REJECTED') {
        message = `AI Verification Failed: ${result.rejectionReason}`;
      }

      res.status(200).json({ message, submission: result, proofProvided: screenshotUrl || proofText || 'API Verified' });
    } catch (error: any) { res.status(400).json({ error: clientErrorMessage(error) }); }
  },
  async getStandaloneTaskStatus(req: Request, res: Response) {
    try { res.status(200).json(await UserService.getStandaloneTaskStatus(req.user!.id, req.params.taskId as string)); }
    catch (error: any) { res.status(400).json({ error: clientErrorMessage(error) }); }
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
      let imageHash: string | null = null;
      if (file) {
        screenshotUrl = await CloudinaryService.uploadImageBuffer(file.buffer);
        imageHash = await computeImageHash(file.buffer);
      }

      const result = await UserService.submitTask(req.user!.id, taskId, { screenshotUrl, proofText, imageHash }, clientIp);

      let message = 'Proof submitted successfully and is pending manual review.';
      if (result.status === 'PENDING_24H' || result.status === 'LOCKED_15D') {
        message = 'AI Verified! Your proof was auto-approved and funds have been added to your pending balance.';
      } else if (result.status === 'REJECTED') {
        message = `AI Verification Failed: ${result.rejectionReason}`;
      }

      res.status(200).json({ message, submission: result, proofProvided: screenshotUrl || proofText || 'API Verified' });
    } catch (error: any) { res.status(400).json({ error: clientErrorMessage(error) }); }
  },
  async getTaskStatus(req: Request, res: Response) {
    try { res.status(200).json(await UserService.getTaskStatus(req.user!.id, req.params.taskId as string)); }
    catch (error: any) { res.status(400).json({ error: clientErrorMessage(error) }); }
  },
  async getReferralDashboard(req: Request, res: Response) {
    try { res.json(await UserService.getReferralDashboard(req.user!.id)); }
    catch (error: any) { res.status(500).json({ error: clientErrorMessage(error) }); }
  },
  async getUnlockSchedule(req: Request, res: Response) {
    try { res.json(await UserService.getUnlockSchedule(req.user!.id)); }
    catch (error: any) { res.status(500).json({ error: clientErrorMessage(error) }); }
  },
  async getSubmissionHistory(req: Request, res: Response) {
    try { res.json(await UserService.getSubmissionHistory(req.user!.id)); }
    catch (error: any) { res.status(500).json({ error: clientErrorMessage(error) }); }
  },
  async submitBugReport(req: Request, res: Response) {
    try {
      let screenshotUrl: string | undefined;
      if (req.file) {
        screenshotUrl = await CloudinaryService.uploadImageBuffer(req.file.buffer, 'bug_reports');
      }
      res.status(201).json(await UserService.submitBugReport(req.user!.id, { ...req.body, screenshotUrl }));
    } catch (error: any) { res.status(400).json({ error: clientErrorMessage(error) }); }
  },
  async getMyBugReports(req: Request, res: Response) {
    try { res.status(200).json(await UserService.getMyBugReports(req.user!.id)); }
    catch (error: any) { res.status(500).json({ error: clientErrorMessage(error) }); }
  },
  async getBugBountyStats(_req: Request, res: Response) {
    try { res.status(200).json(await UserService.getBugBountyStats()); }
    catch (error: any) { res.status(500).json({ error: clientErrorMessage(error) }); }
  },
  async getPublishedBlogs(_req: Request, res: Response) {
    try { res.status(200).json(await UserService.getPublishedBlogs()); }
    catch (error: any) { res.status(500).json({ error: clientErrorMessage(error) }); }
  },
  async getPublishedBlogByIdentifier(req: Request, res: Response) {
    try {
      const identifier = String(req.params.identifier || '').trim();

      if (!identifier) {
        res.status(400).json({ error: 'Blog identifier is required.' });
        return;
      }

      const blog = identifier.includes('-')
        ? await UserService.getPublishedBlogBySlug(identifier)
        : await UserService.getPublishedBlogById(identifier);

      if (!blog) {
        res.status(404).json({ error: 'Blog not found.' });
        return;
      }

      res.status(200).json(blog);
    } catch (error: any) {
      res.status(500).json({ error: clientErrorMessage(error) });
    }
  },
  async getActiveFaqs(_req: Request, res: Response) {
    try { res.status(200).json(await UserService.getActiveFaqs()); }
    catch (error: any) { res.status(500).json({ error: clientErrorMessage(error) }); }
  },
  async submitQuiz(req: Request, res: Response) {
    try { res.status(200).json(await UserService.submitQuizTask(req.user!.id, req.params.taskId as string, req.body.answers)); }
    catch (error: any) { res.status(400).json({ error: clientErrorMessage(error) }); }
  },
  async claimStreak(req: Request, res: Response) {
    try { res.status(200).json(await UserService.claimStreakBonus(req.user!.id)); }
    catch (error: any) { res.status(400).json({ error: clientErrorMessage(error) }); }
  },
  async claimSatWormReward(req: Request, res: Response) {
    try { res.status(200).json(await UserService.claimSatWormReward(req.user!.id, req.body)); }
    catch (error: any) { res.status(400).json({ error: clientErrorMessage(error) }); }
  },
  async startTask(req: Request, res: Response) {
    try { res.status(200).json(await UserService.startTaskFlow(req.user!.id, req.params.taskId as string)); }
    catch (error: any) { res.status(400).json({ error: clientErrorMessage(error) }); }
  },
  async getTodayQuiz(req: Request, res: Response) {
    try { res.status(200).json(await UserService.getTodayQuiz(req.user!.id, typeof req.query.date === 'string' ? req.query.date : undefined)); }
    catch (error: any) { res.status(400).json({ error: clientErrorMessage(error) }); }
  },
  async submitTodayQuizAnswer(req: Request, res: Response) {
    try { res.status(200).json(await UserService.submitDailyQuizAnswer(req.user!.id, req.body.questionId, req.body.answer, req.body.date)); }
    catch (error: any) { res.status(400).json({ error: clientErrorMessage(error) }); }
  },
  async submitTodayQuiz(req: Request, res: Response) {
    try { res.status(200).json(await UserService.submitDailyQuiz(req.user!.id, req.body.date)); }
    catch (error: any) { res.status(400).json({ error: clientErrorMessage(error) }); }
  },
};

