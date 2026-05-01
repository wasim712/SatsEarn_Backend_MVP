import { prisma } from '../../../db/prisma.client';

export class AdminAnnouncementService {
  static async createAnnouncement(data: any) {
    return await prisma.announcement.create({ data });
  }

  static async getAllAnnouncements() {
    return await prisma.announcement.findMany({
      orderBy: { createdAt: 'desc' },
    });
  }

  static async updateAnnouncement(id: string, data: any) {
    return await prisma.announcement.update({ where: { id }, data });
  }

  static async deleteAnnouncement(id: string) {
    return await prisma.announcement.delete({ where: { id } });
  }
}
