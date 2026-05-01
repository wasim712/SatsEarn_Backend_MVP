import bcrypt from 'bcryptjs';
import { prisma } from '../../../db/prisma.client';
import { CryptoUtil } from '../../../utils/crypto.util';
import { UserProfileUpdateInput } from '../user.types';

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
      },
    });

    if (!user) {
      throw new Error('User not found');
    }

    return decryptProfileFields(user);
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
