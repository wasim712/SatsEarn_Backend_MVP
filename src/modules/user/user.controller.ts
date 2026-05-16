import { Request, Response } from 'express';
import { userAccountHandlers } from './controllers/user-account.handlers';
import { userTaskHandlers } from './controllers/user-task.handlers';

export class UserController {
  static async getDashboard(req: Request, res: Response) { return userAccountHandlers.getDashboard(req, res); }
  static async getLeaderboard(req: Request, res: Response) { return userAccountHandlers.getLeaderboard(req, res); }
  static async getProfile(req: Request, res: Response) { return userAccountHandlers.getProfile(req, res); }
  static async updateProfile(req: Request, res: Response) { return userAccountHandlers.updateProfile(req, res); }
  static async changePassword(req: Request, res: Response) { return userAccountHandlers.changePassword(req, res); }
  static async getCampaigns(req: Request, res: Response) { return userTaskHandlers.getCampaigns(req, res); }
  static async getCampaignDetails(req: Request, res: Response) { return userTaskHandlers.getCampaignDetails(req, res); }
  static async getTaskStatus(req: Request, res: Response) { return userTaskHandlers.getTaskStatus(req, res); }
  static async submitTaskProof(req: Request, res: Response) { return userTaskHandlers.submitTaskProof(req, res); }
  static async deleteAccount(req: Request, res: Response) { return userAccountHandlers.deleteAccount(req, res); }
  static async getReferralDashboard(req: Request, res: Response) { return userTaskHandlers.getReferralDashboard(req, res); }
  static async getUnlockSchedule(req: Request, res: Response) { return userTaskHandlers.getUnlockSchedule(req, res); }
  static async submitBugReport(req: Request, res: Response) { return userTaskHandlers.submitBugReport(req, res); }
  static async getMyBugReports(req: Request, res: Response) { return userTaskHandlers.getMyBugReports(req, res); }
  static async getPublishedBlogs(req: Request, res: Response) { return userTaskHandlers.getPublishedBlogs(req, res); }
  static async getActiveFaqs(req: Request, res: Response) { return userTaskHandlers.getActiveFaqs(req, res); }
  static async getSubmissionHistory(req: Request, res: Response) { return userTaskHandlers.getSubmissionHistory(req, res); }
  static async submitQuiz(req: Request, res: Response) { return userTaskHandlers.submitQuiz(req, res); }
  static async claimStreak(req: Request, res: Response) { return userTaskHandlers.claimStreak(req, res); }
  static async startTask(req: Request, res: Response) { return userTaskHandlers.startTask(req, res); }
  static async getTodayQuiz(req: Request, res: Response) { return userTaskHandlers.getTodayQuiz(req, res); }
  static async submitTodayQuiz(req: Request, res: Response) { return userTaskHandlers.submitTodayQuiz(req, res); }
  static async getWithdrawals(req: Request, res: Response) { return userAccountHandlers.getWithdrawals(req, res); }
  static async requestWithdrawal(req: Request, res: Response) { return userAccountHandlers.requestWithdrawal(req, res); }
  static async activeAnnouncement(req: Request, res: Response) { return userAccountHandlers.activeAnnouncement(req, res); }
}
