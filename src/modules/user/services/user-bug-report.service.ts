import { prisma } from '../../../db/prisma.client';
import { NotificationService } from '../../notifications/notification.service';

export class UserBugReportService {
  static async submitBugReport(userId: string, data: { title: string; description: string; screenshotUrl?: string | null }) {
    const report = await prisma.bugReport.create({
      data: {
        userId,
        title: data.title,
        description: data.description,
        screenshotUrl: data.screenshotUrl || null,
      },
    });

    await NotificationService.notifyAdmins(
      'New Bug Report Submitted',
      `A new bug report was submitted: ${data.title}`,
      'SYSTEM_ALERT',
      report.id,
    );

    await NotificationService.notifyUser(
      userId,
      'Bug Report Submitted',
      'Your bug report was submitted successfully and is now under admin review.',
      'SYSTEM_ALERT',
      report.id,
    );

    return report;
  }

  static async getMyBugReports(userId: string) {
    return prisma.bugReport.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }
}
