export const DEFAULT_REVIEW_HOURS = 24;
export const DEFAULT_SECURITY_LOCK_DAYS = 15;

export function getReviewReleaseAt(hours = DEFAULT_REVIEW_HOURS): Date {
  return new Date(Date.now() + hours * 60 * 60 * 1000);
}

export function getSecurityUnlockAt(days = DEFAULT_SECURITY_LOCK_DAYS): Date {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}

export function getReferralBonusAmount(baseRewardSats: number, commissionPercent: number): number {
  if (!Number.isFinite(baseRewardSats) || !Number.isFinite(commissionPercent)) {
    return 0;
  }

  if (baseRewardSats <= 0 || commissionPercent <= 0) {
    return 0;
  }

  return Math.floor(baseRewardSats * (commissionPercent / 100));
}
