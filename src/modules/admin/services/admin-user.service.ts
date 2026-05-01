import { prisma } from '../../../db/prisma.client';
import { TierUtils } from '../../../utils/tier.utils';

export class AdminUserService {
  static async getAllUsers() {
    const users = await prisma.user.findMany({
      select: {
        id: true,
        email: true,
        fullName: true,
        role: true,
        totalXp: true,
        premiumTier: true,
        premiumExpiresAt: true,
        isActive: true,
        balanceAvailable: true,
        balancePending: true,
        balanceLocked: true,
        referralCode: true,
        _count: {
          select: { referrals: true, submissions: true },
        },
        createdAt: true,
        updatedAt: true,
        lastActivityAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    return users.map((user) => {
      const isPremium = TierUtils.isPremiumActive(user as any);
      const freeTier = TierUtils.getFreeTier(user.totalXp);

      return {
        ...user,
        activeTier: isPremium ? user.premiumTier : freeTier,
        isPremium,
        underlyingFreeTier: freeTier,
      };
    });
  }
}
