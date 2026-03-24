import { prisma } from '../../db/prisma.client';

export class UserService {
  static async updateProfile(userId: string, data: any) {
    // The country is intentionally omitted here to enforce the "locked after signup" rule
    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: {
        fullName: data.fullName,
        twitterHandle: data.twitterHandle,
        instagramHandle: data.instagramHandle,
        telegramHandle: data.telegramHandle,
        discordHandle: data.discordHandle,
      },
    });

    return updatedUser;
  }

  static async getProfile(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });
    if (!user) throw new Error("User not found");
    return user;
  }
}