import bcrypt from 'bcryptjs';
import { PremiumRequestStatus } from '@prisma/client';
import { prisma } from '../../../db/prisma.client';
import { CryptoUtil } from '../../../utils/crypto.util';
import { TierUtils } from '../../../utils/tier.utils';
import { NotificationService } from '../../notifications/notification.service';
import { PremiumInterestInput, UserProfileUpdateInput } from '../user.types';

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
        premiumTier: true,
        premiumExpiresAt: true,
      },
    });

    if (!user) {
      throw new Error('User not found');
    }

    const decrypted = decryptProfileFields(user);
    const isPremium = TierUtils.isPremiumActive(user as any);
    const activeTier = isPremium ? user.premiumTier : TierUtils.getFreeTier(user.totalXp);

    return {
      ...decrypted,
      activeTier,
      isPremium,
      premiumTier: user.premiumTier,
      premiumExpiresAt: user.premiumExpiresAt,
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
      throw new Error(`You have already sent a ${data.intent === 'UPGRADE' ? 'premium upgrade' : 'notify me'} request for ${data.plan}.`);
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
