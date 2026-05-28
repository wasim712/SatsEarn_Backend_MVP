import { prisma } from '../../../db/prisma.client';

const DEFAULT_USER_SIDEBAR_CONFIG = {
  dashboard: true,
  tasks: true,
  standaloneTasks: true,
  minigames: true,
  bugBounty: true,
  quiz: true,
  referrals: true,
  rewards: true,
  leaderboard: true,
  wallet: true,
  settings: true,
  help: true,
  notifications: true,
  profile: true,
};

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
          userSidebarConfig: DEFAULT_USER_SIDEBAR_CONFIG,
        },
      });
    }

    if (!settings.premiumMonthlySatsMatrix || !settings.premiumYearlySatsMatrix || !settings.userSidebarConfig) {
      settings = await prisma.platformSettings.update({
        where: { id: settings.id },
        data: {
          premiumMonthlySatsMatrix: settings.premiumMonthlySatsMatrix || DEFAULT_PREMIUM_MONTHLY_SATS_MATRIX,
          premiumYearlySatsMatrix: settings.premiumYearlySatsMatrix || DEFAULT_PREMIUM_YEARLY_SATS_MATRIX,
          userSidebarConfig: settings.userSidebarConfig || DEFAULT_USER_SIDEBAR_CONFIG,
        },
      });
    }

    return {
      ...settings,
      userSidebarConfig: {
        ...DEFAULT_USER_SIDEBAR_CONFIG,
        ...((settings.userSidebarConfig || {}) as Record<string, boolean>),
      },
    };
  }

  static async updateGamificationSettings(rawData: any) {
    const existing = await this.getGamificationSettings();
    const normalizedSidebarConfig = rawData.userSidebarConfig
      ? {
          ...DEFAULT_USER_SIDEBAR_CONFIG,
          ...(rawData.userSidebarConfig as Record<string, boolean>),
        }
      : undefined;

    const updated = await prisma.platformSettings.update({
      where: { id: existing.id },
      data: {
        ...rawData,
        ...(normalizedSidebarConfig ? { userSidebarConfig: normalizedSidebarConfig } : {}),
      },
    });

    return {
      ...updated,
      userSidebarConfig: {
        ...DEFAULT_USER_SIDEBAR_CONFIG,
        ...((updated.userSidebarConfig || {}) as Record<string, boolean>),
      },
    };
  }
}
