import { prisma } from '../../../db/prisma.client';

export class AdminSettingsService {
  static async getGamificationSettings() {
    let settings = await prisma.platformSettings.findFirst();

    if (!settings) {
      settings = await prisma.platformSettings.create({
        data: {
          tierMinWithdrawalMatrix: {
            BASIC: 25000, COPPER: 25000, BRONZE: 25000, SILVER: 25000, GOLD: 25000,
            PLATINUM: 25000, DIAMOND: 25000, CROWN: 25000, ELITE: 25000, FOUNDER: 25000,
          },
        },
      });
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
