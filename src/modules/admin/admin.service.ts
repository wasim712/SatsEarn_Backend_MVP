import { AdminAnnouncementService } from "./services/admin-announcement.service";
import { AdminCampaignService } from "./services/admin-campaign.service";
import { AdminDashboardService } from "./services/admin-dashboard.service";
import { AdminQuizService } from "./services/admin-quiz.service";
import { AdminSettingsService } from "./services/admin-settings.service";
import { AdminSubmissionService } from "./services/admin-submission.service";
import { AdminUserService } from "./services/admin-user.service";
import { AdminWithdrawalService } from "./services/admin-withdrawal.service";

export class AdminService {
  static async getOverviewMetrics() {
    return await AdminDashboardService.getOverviewMetrics();
  }
  static async createCampaign(data: any) {
    return await AdminCampaignService.createCampaign(data);
  }
  static async getCampaignAnalytics(campaignId: string) {
    return await AdminCampaignService.getCampaignAnalytics(campaignId);
  }
  static async getAllCampaigns() {
    return await AdminCampaignService.getAllCampaigns();
  }
  static async getCampaignById(id: string) {
    return await AdminCampaignService.getCampaignById(id);
  }
  static async updateCampaign(id: string, data: any) {
    return await AdminCampaignService.updateCampaign(id, data);
  }
  static async deleteCampaign(id: string) {
    return await AdminCampaignService.deleteCampaign(id);
  }
  static async addTaskToCampaign(campaignId: string, data: any) {
    return await AdminCampaignService.addTaskToCampaign(campaignId, data);
  }
  static async getAllTasksForCampaign(campaignId: string) {
    return await AdminCampaignService.getAllTasksForCampaign(campaignId);
  }
  static async getTaskById(campaignId: string, taskId: string) {
    return await AdminCampaignService.getTaskById(campaignId, taskId);
  }
  static async updateTask(campaignId: string, taskId: string, data: any) {
    return await AdminCampaignService.updateTask(campaignId, taskId, data);
  }
  static async deleteTask(campaignId: string, taskId: string) {
    return await AdminCampaignService.deleteTask(campaignId, taskId);
  }
  static async createAnnouncement(data: any) {
    return await AdminAnnouncementService.createAnnouncement(data);
  }
  static async getAllAnnouncements() {
    return await AdminAnnouncementService.getAllAnnouncements();
  }
  static async updateAnnouncement(id: string, data: any) {
    return await AdminAnnouncementService.updateAnnouncement(id, data);
  }
  static async deleteAnnouncement(id: string) {
    return await AdminAnnouncementService.deleteAnnouncement(id);
  }
  static async getGamificationSettings() {
    return await AdminSettingsService.getGamificationSettings();
  }
  static async updateGamificationSettings(rawData: any) {
    return await AdminSettingsService.updateGamificationSettings(rawData);
  }
  static async getPendingSubmissions() {
    return await AdminSubmissionService.getPendingSubmissions();
  }
  static async reviewSubmission(
    submissionId: string,
    status: "LOCKED_15D" | "REJECTED",
    rejectionReason?: string,
    adminId?: string,
  ) {
    return await AdminSubmissionService.reviewSubmission(
      submissionId,
      status,
      rejectionReason,
      adminId,
    );
  }
  static async getAllWithdrawals() {
    return await AdminWithdrawalService.getAllWithdrawals();
  }
  static async processWithdrawal(
    withdrawalId: string,
    status: "PAID" | "REJECTED",
    paymentProof?: string,
  ) {
    return await AdminWithdrawalService.processWithdrawal(
      withdrawalId,
      status,
      paymentProof,
    );
  }
  static async getAllUsers() {
    return await AdminUserService.getAllUsers();
  }
  static async getUserDetails(userId: string) {
    return await AdminUserService.getUserDetails(userId);
  }
  static async setUserActiveState(userId: string, isActive: boolean) {
    return await AdminUserService.setUserActiveState(userId, isActive);
  }
  static async deleteUserAccount(userId: string) {
    return await AdminUserService.deleteUserAccount(userId);
  }
  static async createDailyQuiz(data: {
    date: string;
    title: string;
    rewardSats: number;
    xpReward: number;
    questions: Array<{
      questionText: string;
      options: string[];
      correctAnswer: string;
      order: number;
    }>;
  }) {
    return await AdminQuizService.createDailyQuiz(data);
  }
  static async getAllDailyQuizzes() {
    return await AdminQuizService.getAllDailyQuizzes();
  }
  static async getDailyQuizById(id: string) {
    return await AdminQuizService.getDailyQuizById(id);
  }
  static async updateDailyQuiz(
    id: string,
    data: { title?: string; rewardSats?: number; xpReward?: number; isActive?: boolean },
  ) {
    return await AdminQuizService.updateDailyQuiz(id, data);
  }
  static async deleteDailyQuiz(id: string) {
    return await AdminQuizService.deleteDailyQuiz(id);
  }
}
