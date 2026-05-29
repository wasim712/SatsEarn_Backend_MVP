import { User, FreeTier, PremiumTier } from '@prisma/client';

type PremiumUserLike = Pick<User, 'premiumTier' | 'premiumExpiresAt'> & {
  queuedPremiumTier?: PremiumTier | null;
  queuedPremiumStartsAt?: Date | null;
  queuedPremiumExpiresAt?: Date | null;
};

const FREE_TIER_REFERRAL_CAPS: Record<FreeTier, { maxUsers: number; maxSats: number }> = {
  BASIC: { maxUsers: 20, maxSats: 2000 },
  COPPER: { maxUsers: 40, maxSats: 4000 },
  BRONZE: { maxUsers: 60, maxSats: 6000 },
  SILVER: { maxUsers: 80, maxSats: 8000 },
  GOLD: { maxUsers: 100, maxSats: 10000 },
};

export class TierUtils {
  // 1. Calculate Free Tier from XP
  static getFreeTier(totalXp: number): FreeTier {
    if (totalXp >= 150000) return FreeTier.GOLD;
    if (totalXp >= 100000) return FreeTier.SILVER;
    if (totalXp >= 50000) return FreeTier.BRONZE;
    if (totalXp >= 10000) return FreeTier.COPPER;
    return FreeTier.BASIC;
  }

  // 2. Check if Premium is currently active
  static isPremiumActive(user: PremiumUserLike): boolean {
    if (!user.premiumTier || !user.premiumExpiresAt) return false;
    return new Date() < user.premiumExpiresAt;
  }

  static getCurrentPremiumTier(user: PremiumUserLike): PremiumTier | null {
    if (this.isPremiumActive(user)) {
      return user.premiumTier;
    }

    const now = new Date();
    if (
      user.queuedPremiumTier
      && user.queuedPremiumStartsAt
      && user.queuedPremiumExpiresAt
      && user.queuedPremiumStartsAt <= now
      && user.queuedPremiumExpiresAt > now
    ) {
      return user.queuedPremiumTier;
    }

    return null;
  }

  static getFreeTierReferralCap(tier: FreeTier) {
    return FREE_TIER_REFERRAL_CAPS[tier];
  }
}
