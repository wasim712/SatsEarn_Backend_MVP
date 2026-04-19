import { User, FreeTier } from '@prisma/client';

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
  static isPremiumActive(user: User): boolean {
    if (!user.premiumTier || !user.premiumExpiresAt) return false;
    return new Date() < user.premiumExpiresAt;
  }

  // 3. Get the Referral Commission % based on their Tier
  static getReferralCommission(user: User, defaultPercent: number): number {
    if (!this.isPremiumActive(user)) return defaultPercent; // e.g., 5%
    
    // Premium specific rates
    switch (user.premiumTier) {
      case 'FOUNDER': return 30;
      case 'ELITE': return 25;
      case 'CROWN': return 20;
      case 'DIAMOND': return 15;
      case 'PLATINUM': return 10;
      default: return defaultPercent;
    }
  }
}