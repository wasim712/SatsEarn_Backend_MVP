import { Request, Response } from 'express';
import { adminCampaignHandlers } from './controllers/admin-campaign.handlers';
import { adminManagementHandlers } from './controllers/admin-management.handlers';

export class AdminController {
  static async getDashboardMetrics(req: Request, res: Response) { return adminCampaignHandlers.getDashboardMetrics(req, res); }
  static async createCampaign(req: Request, res: Response) { return adminCampaignHandlers.createCampaign(req, res); }
  static async uploadCampaignCover(req: Request, res: Response) { return adminCampaignHandlers.uploadCampaignCover(req, res); }
  static async getCampaignAnalytics(req: Request, res: Response) { return adminCampaignHandlers.getCampaignAnalytics(req, res); }
  static async getAllCampaigns(req: Request, res: Response) { return adminCampaignHandlers.getAllCampaigns(req, res); }
  static async getCampaignById(req: Request, res: Response) { return adminCampaignHandlers.getCampaignById(req, res); }
  static async updateCampaign(req: Request, res: Response) { return adminCampaignHandlers.updateCampaign(req, res); }
  static async deleteCampaign(req: Request, res: Response) { return adminCampaignHandlers.deleteCampaign(req, res); }
  static async createStandaloneTask(req: Request, res: Response) { return adminCampaignHandlers.createStandaloneTask(req, res); }
  static async getAllStandaloneTasks(req: Request, res: Response) { return adminCampaignHandlers.getAllStandaloneTasks(req, res); }
  static async getStandaloneTaskById(req: Request, res: Response) { return adminCampaignHandlers.getStandaloneTaskById(req, res); }
  static async updateStandaloneTask(req: Request, res: Response) { return adminCampaignHandlers.updateStandaloneTask(req, res); }
  static async deleteStandaloneTask(req: Request, res: Response) { return adminCampaignHandlers.deleteStandaloneTask(req, res); }
  static async addTaskToCampaign(req: Request, res: Response) { return adminCampaignHandlers.addTaskToCampaign(req, res); }
  static async getAllTasksForCampaign(req: Request, res: Response) { return adminCampaignHandlers.getAllTasksForCampaign(req, res); }
  static async getTaskById(req: Request, res: Response) { return adminCampaignHandlers.getTaskById(req, res); }
  static async updateTask(req: Request, res: Response) { return adminCampaignHandlers.updateTask(req, res); }
  static async deleteTask(req: Request, res: Response) { return adminCampaignHandlers.deleteTask(req, res); }
  static async createAnnouncement(req: Request, res: Response) { return adminManagementHandlers.createAnnouncement(req, res); }
  static async getAllAnnouncements(req: Request, res: Response) { return adminManagementHandlers.getAllAnnouncements(req, res); }
  static async updateAnnouncement(req: Request, res: Response) { return adminManagementHandlers.updateAnnouncement(req, res); }
  static async deleteAnnouncement(req: Request, res: Response) { return adminManagementHandlers.deleteAnnouncement(req, res); }
  static async getPendingSubmissions(req: Request, res: Response) { return adminManagementHandlers.getPendingSubmissions(req, res); }
  static async reviewSubmission(req: Request, res: Response) { return adminManagementHandlers.reviewSubmission(req, res); }
  static async getWithdrawals(req: Request, res: Response) { return adminManagementHandlers.getWithdrawals(req, res); }
  static async approveWithdrawal(req: Request, res: Response) { return adminManagementHandlers.approveWithdrawal(req, res); }
  static async rejectWithdrawal(req: Request, res: Response) { return adminManagementHandlers.rejectWithdrawal(req, res); }
  static async getPlatformSettings(req: Request, res: Response) { return adminManagementHandlers.getPlatformSettings(req, res); }
  static async updatePlatformSettings(req: Request, res: Response) { return adminManagementHandlers.updatePlatformSettings(req, res); }
  static async getAllUsers(req: Request, res: Response) { return adminManagementHandlers.getAllUsers(req, res); }
  static async getPremiumRequests(req: Request, res: Response) { return adminManagementHandlers.getPremiumRequests(req, res); }
  static async getUserDetails(req: Request, res: Response) { return adminManagementHandlers.getUserDetails(req, res); }
  static async getCheatUser(req: Request, res: Response) { return adminManagementHandlers.getCheatUser(req, res); }
  static async updateCheatUser(req: Request, res: Response) { return adminManagementHandlers.updateCheatUser(req, res); }
  static async banUser(req: Request, res: Response) { return adminManagementHandlers.banUser(req, res); }
  static async activateUser(req: Request, res: Response) { return adminManagementHandlers.activateUser(req, res); }
  static async deleteUser(req: Request, res: Response) { return adminManagementHandlers.deleteUser(req, res); }
  static async updateUserPremium(req: Request, res: Response) { return adminManagementHandlers.updateUserPremium(req, res); }
  static async adjustUserSubmissionReward(req: Request, res: Response) { return adminManagementHandlers.adjustUserSubmissionReward(req, res); }
  static async updatePremiumRequest(req: Request, res: Response) { return adminManagementHandlers.updatePremiumRequest(req, res); }
  static async createDailyQuiz(req: Request, res: Response) { return adminManagementHandlers.createDailyQuiz(req, res); }
  static async getAllDailyQuizzes(req: Request, res: Response) { return adminManagementHandlers.getAllDailyQuizzes(req, res); }
  static async getDailyQuiz(req: Request, res: Response) { return adminManagementHandlers.getDailyQuiz(req, res); }
  static async updateDailyQuiz(req: Request, res: Response) { return adminManagementHandlers.updateDailyQuiz(req, res); }
  static async deleteDailyQuiz(req: Request, res: Response) { return adminManagementHandlers.deleteDailyQuiz(req, res); }
  static async getAllBugReports(req: Request, res: Response) { return adminManagementHandlers.getAllBugReports(req, res); }
  static async reviewBugReport(req: Request, res: Response) { return adminManagementHandlers.reviewBugReport(req, res); }
  static async createBlogPost(req: Request, res: Response) { return adminManagementHandlers.createBlogPost(req, res); }
  static async getAllBlogPosts(req: Request, res: Response) { return adminManagementHandlers.getAllBlogPosts(req, res); }
  static async updateBlogPost(req: Request, res: Response) { return adminManagementHandlers.updateBlogPost(req, res); }
  static async deleteBlogPost(req: Request, res: Response) { return adminManagementHandlers.deleteBlogPost(req, res); }
  static async createFaqItem(req: Request, res: Response) { return adminManagementHandlers.createFaqItem(req, res); }
  static async getAllFaqItems(req: Request, res: Response) { return adminManagementHandlers.getAllFaqItems(req, res); }
  static async updateFaqItem(req: Request, res: Response) { return adminManagementHandlers.updateFaqItem(req, res); }
  static async deleteFaqItem(req: Request, res: Response) { return adminManagementHandlers.deleteFaqItem(req, res); }
}
