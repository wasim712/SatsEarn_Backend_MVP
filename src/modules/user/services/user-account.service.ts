import bcrypt from 'bcryptjs';
import { BillingCycle, BillingSource, PremiumRequestStatus, PremiumTier } from '@prisma/client';
import { prisma } from '../../../db/prisma.client';
import { CryptoUtil } from '../../../utils/crypto.util';
import { TierUtils } from '../../../utils/tier.utils';
import { NotificationService } from '../../notifications/notification.service';
import { PremiumInterestInput, UserProfileUpdateInput } from '../user.types';

const PREMIUM_TIER_DURATION_DAYS: Record<PremiumTier, { monthly: number; yearly: number }> = {
  PLATINUM: { monthly: 30, yearly: 365 },
  DIAMOND: { monthly: 30, yearly: 365 },
  CROWN: { monthly: 30, yearly: 365 },
  ELITE: { monthly: 30, yearly: 365 },
  FOUNDER: { monthly: 30, yearly: 365 },
};

function buildDefaultPremiumMonthlySatsMatrix() {
  return {
    PLATINUM: 6499,
    DIAMOND: 8999,
    CROWN: 12999,
    ELITE: 19999,
    FOUNDER: 0,
  };
}

function buildDefaultPremiumYearlySatsMatrix() {
  return {
    PLATINUM: 72999,
    DIAMOND: 102999,
    CROWN: 146999,
    ELITE: 221999,
    FOUNDER: 299999,
  };
}

function addDays(baseDate: Date, days: number) {
  const next = new Date(baseDate);
  next.setDate(next.getDate() + days);
  return next;
}

function decryptProfileFields<T extends Record<string, any>>(user: T | null): T | null {
  if (!user) {
    return null;
  }

  return {
    ...user,
    phone: CryptoUtil.decrypt(user.phone),
    twitterHandle: CryptoUtil.decrypt(user.twitterHandle),
    instagramHandle: CryptoUtil.decrypt(user.instagramHandle),
    telegramHandle: CryptoUtil.decrypt(user.telegramHandle),
    discordHandle: CryptoUtil.decrypt(user.discordHandle),
  };
}

export class UserAccountService {
  static async getPremiumPricing() {
    const settings = await prisma.platformSettings.findFirst();

    return {
      monthlySatsMatrix: (settings?.premiumMonthlySatsMatrix as Record<string, number> | null) || buildDefaultPremiumMonthlySatsMatrix(),
      yearlySatsMatrix: (settings?.premiumYearlySatsMatrix as Record<string, number> | null) || buildDefaultPremiumYearlySatsMatrix(),
    };
  }

  static async getProfile(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new Error('User not found');
    }

    return decryptProfileFields(user);
  }

  static async getUserProfile(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        fullName: true,
        email: true,
        phone: true,
        country: true,
        twitterHandle: true,
        instagramHandle: true,
        telegramHandle: true,
        discordHandle: true,
        referralCode: true,
        createdAt: true,
        totalXp: true,
        balanceAvailable: true,
        premiumTier: true,
        premiumExpiresAt: true,
        billingRecords: {
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
      },
    });

    if (!user) {
      throw new Error('User not found');
    }

    const decrypted = decryptProfileFields(user);
    const isPremium = TierUtils.isPremiumActive(user as any);
    const activeTier = isPremium ? user.premiumTier : TierUtils.getFreeTier(user.totalXp);
    const pricing = await this.getPremiumPricing();

    return {
      ...decrypted,
      activeTier,
      isPremium,
      premiumTier: user.premiumTier,
      premiumExpiresAt: user.premiumExpiresAt,
      balanceAvailable: user.balanceAvailable,
      premiumPricing: pricing,
      billingHistory: user.billingRecords,
    };
  }

  static async upgradePremiumUsingSats(userId: string, data: { plan: PremiumTier; billingCycle: BillingCycle }) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        fullName: true,
        balanceAvailable: true,
        premiumTier: true,
        premiumExpiresAt: true,
      },
    });

    if (!user) {
      throw new Error('User not found');
    }

    const pricing = await this.getPremiumPricing();
    const priceMap = data.billingCycle === BillingCycle.MONTHLY ? pricing.monthlySatsMatrix : pricing.yearlySatsMatrix;
    const amountSats = Number(priceMap[data.plan] || 0);

    if (amountSats <= 0) {
      throw new Error('This tier is not available for sats upgrade right now.');
    }

    if (user.balanceAvailable < amountSats) {
      throw new Error('Not enough sats available for this tier upgrade.');
    }

    const durationDays = data.billingCycle === BillingCycle.MONTHLY
      ? PREMIUM_TIER_DURATION_DAYS[data.plan].monthly
      : PREMIUM_TIER_DURATION_DAYS[data.plan].yearly;

    const startsFrom = user.premiumExpiresAt && user.premiumExpiresAt > new Date() ? user.premiumExpiresAt : new Date();
    const premiumExpiresAt = addDays(startsFrom, durationDays);

    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: user.id },
        data: {
          balanceAvailable: { decrement: amountSats },
          premiumTier: data.plan,
          premiumExpiresAt,
        },
      });

      await tx.ledger.create({
        data: {
          userId: user.id,
          amountSats: -amountSats,
          type: 'PENALTY',
          description: `Premium upgrade using sats - ${data.plan} (${data.billingCycle})`,
        },
      });

      await tx.billingRecord.create({
        data: {
          userId: user.id,
          premiumTier: data.plan,
          billingCycle: data.billingCycle,
          billingSource: BillingSource.SATS_BALANCE,
          amountSats,
          premiumExpiresAt,
        },
      });
    });

    await NotificationService.notifyAdmins(
      'Premium upgraded using sats',
      `${user.fullName?.trim() || user.email} upgraded to ${data.plan} using ${amountSats} sats (${data.billingCycle}).`,
      'SYSTEM_ALERT',
      user.id,
    );

    return {
      success: true,
      message: `Successfully upgraded to ${data.plan} using sats.`,
      profile: await this.getUserProfile(userId),
    };
  }

  static async registerPremiumInterest(userId: string, data: PremiumInterestInput) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        fullName: true,
        premiumTier: true,
        premiumExpiresAt: true,
        totalXp: true,
      },
    });

    if (!user) {
      throw new Error('User not found');
    }

    const activeTier = TierUtils.isPremiumActive(user as any)
      ? user.premiumTier || 'UNKNOWN'
      : TierUtils.getFreeTier(user.totalXp);

    const existingOpenRequest = await prisma.premiumRequest.findFirst({
      where: {
        userId,
        plan: data.plan,
        intent: data.intent,
        status: {
          in: [PremiumRequestStatus.OPEN, PremiumRequestStatus.CONTACTED],
        },
      },
      select: { id: true },
    });

    if (existingOpenRequest) {
      return {
        success: true,
        message: data.intent === 'UPGRADE'
          ? 'Your upgrade interest is already on file. Our admin team will reach out to you manually.'
          : 'You are already on the notify list for this plan.',
      };
    }

    const request = await prisma.premiumRequest.create({
      data: {
        userId: user.id,
        plan: data.plan,
        intent: data.intent,
        source: data.source,
        userEmail: user.email,
        userFullName: user.fullName,
        userActiveTier: String(activeTier),
      },
    });

    const actor = user.fullName?.trim() || user.email;
    const actionLabel = data.intent === 'UPGRADE' ? 'Upgrade' : 'Notify me';
    const sourceLabel = data.source ? ` via ${data.source}` : '';

    await NotificationService.notifyAdmins(
      `Premium ${actionLabel} Request`,
      `${actor} (${user.email}) clicked ${actionLabel} for ${data.plan}.${sourceLabel} Current tier: ${activeTier}.`,
      'SYSTEM_ALERT',
      request.id,
    );

    return {
      success: true,
      message: data.intent === 'UPGRADE'
        ? 'Your upgrade interest has been shared with our admin team. We will reach out to you manually.'
        : 'You are on the notify list. We will contact you when manual payment is available.',
    };
  }

  static async getPremiumRequests(userId: string) {
    return await prisma.premiumRequest.findMany({
      where: {
        userId,
        status: {
          in: [PremiumRequestStatus.OPEN, PremiumRequestStatus.CONTACTED],
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  static async updateProfile(userId: string, data: UserProfileUpdateInput) {
    const allowedUpdates = {
      fullName: data.fullName,
      phone: CryptoUtil.encrypt(data.phone),
      twitterHandle: CryptoUtil.encrypt(data.twitterHandle),
      instagramHandle: CryptoUtil.encrypt(data.instagramHandle),
      telegramHandle: CryptoUtil.encrypt(data.telegramHandle),
      discordHandle: CryptoUtil.encrypt(data.discordHandle),
    };

    const cleanedData = Object.fromEntries(
      Object.entries(allowedUpdates).filter(([, value]) => value !== undefined),
    );

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: cleanedData,
      select: { fullName: true, twitterHandle: true, discordHandle: true },
    });

    return decryptProfileFields(updatedUser);
  }

  static async changePassword(userId: string, newPassword: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true },
    });

    if (!user) {
      throw new Error('User not found');
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);
    await prisma.user.update({
      where: { id: userId },
      data: { passwordHash },
    });

    return { message: 'Password updated successfully.' };
  }

  static async deleteAccount(userId: string) {
    const scrambledStr = `deleted_${Date.now()}`;

    await prisma.user.update({
      where: { id: userId },
      data: {
        isActive: false,
        email: `${scrambledStr}@deleted.com`,
        passwordHash: null,
        otpCode: null,
        otpExpiresAt: null,
        username: scrambledStr,
        fullName: 'Deleted User',
        phone: null,
        twitterHandle: null,
        instagramHandle: null,
        telegramHandle: null,
        discordHandle: null,
        referralCode: scrambledStr,
      },
    });

    return {
      message: 'Account successfully deactivated and personal data removed.',
    };
  }
}
