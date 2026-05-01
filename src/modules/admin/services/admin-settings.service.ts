import { prisma } from '../../../db/prisma.client';

export class AdminSettingsService {
  static async getGamificationSettings() {
    let settings = await prisma.platformSettings.findFirst();

    if (!settings) {
      settings = await prisma.platformSettings.create({ data: {} });
    }

    return settings;
  }

  static async updateGamificationSettings(rawData: any) {
    const existing = await this.getGamificationSettings();
    return await prisma.platformSettings.update({
      where: { id: existing.id },
      data: rawData,
    });
  }
}
