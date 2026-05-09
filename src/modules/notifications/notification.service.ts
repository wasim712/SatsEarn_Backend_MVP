import { prisma } from '../../db/prisma.client';
import { NotificationType } from '@prisma/client';

export class NotificationService {
  
  // ─── DISPATCHERS ───

  static async notifyUser(userId: string, title: string, message: string, type: NotificationType, referenceId?: string) {
    const existing = await prisma.notification.findFirst({
      where: {
        userId,
        forAdmin: false,
        title,
        message,
        type,
        referenceId: referenceId || null,
      },
      select: { id: true },
    });

    if (existing) {
      return existing;
    }

    return await prisma.notification.create({
      data: { userId, forAdmin: false, title, message, type, referenceId }
    });
  }

  static async notifyAdmins(title: string, message: string, type: NotificationType, referenceId?: string) {
    const existing = await prisma.notification.findFirst({
      where: {
        forAdmin: true,
        title,
        message,
        type,
        referenceId: referenceId || null,
      },
      select: { id: true },
    });

    if (existing) {
      return existing;
    }

    return await prisma.notification.create({
      data: { forAdmin: true, title, message, type, referenceId }
    });
  }

  // ─── FETCHERS ───

  static async getUserNotifications(userId: string) {
    return await prisma.notification.findMany({
      where: { userId, forAdmin: false },
      orderBy: { createdAt: 'desc' },
      take: 50 // Limit payload size
    });
  }

  static async getAdminNotifications() {
    return await prisma.notification.findMany({
      where: { forAdmin: true },
      orderBy: { createdAt: 'desc' },
      take: 100 
    });
  }

  // ─── ACTIONS ───

  static async markAsRead(notificationId: string, userId?: string) {
    // Note: If userId is provided, we ensure users can only read their own alerts
    return await prisma.notification.updateMany({
      where: { 
        id: notificationId,
        ...(userId ? { userId } : {}) 
      },
      data: { isRead: true }
    });
  }

  static async markAllUserRead(userId: string) {
    return await prisma.notification.updateMany({
      where: { userId, isRead: false },
      data: { isRead: true }
    });

  }
  // Add this under your other ACTIONS in notification.service.ts
  static async markAllAdminRead() {
    return await prisma.notification.updateMany({
      where: { forAdmin: true, isRead: false },
      data: { isRead: true }
    });
  }
}
