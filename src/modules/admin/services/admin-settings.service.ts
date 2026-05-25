import { prisma } from '../../../db/prisma.client';

const DEFAULT_PREMIUM_MONTHLY_SATS_MATRIX = {
  PLATINUM: 6499,
  DIAMOND: 8999,
  CROWN: 12999,
  ELITE: 19999,
  FOUNDER: 0,
};

const DEFAULT_PREMIUM_YEARLY_SATS_MATRIX = {
  PLATINUM: 72999,
  DIAMOND: 102999,
  CROWN: 146999,
  ELITE: 221999,
  FOUNDER: 299999,
};

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
          premiumMonthlySatsMatrix: DEFAULT_PREMIUM_MONTHLY_SATS_MATRIX,
          premiumYearlySatsMatrix: DEFAULT_PREMIUM_YEARLY_SATS_MATRIX,
        },
      });
    }

    if (!settings.premiumMonthlySatsMatrix || !settings.premiumYearlySatsMatrix) {
      settings = await prisma.platformSettings.update({
        where: { id: settings.id },
        data: {
          premiumMonthlySatsMatrix: settings.premiumMonthlySatsMatrix || DEFAULT_PREMIUM_MONTHLY_SATS_MATRIX,
          premiumYearlySatsMatrix: settings.premiumYearlySatsMatrix || DEFAULT_PREMIUM_YEARLY_SATS_MATRIX,
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
