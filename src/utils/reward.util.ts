export const STREAK_MILESTONES: Record<number, number> = {
  7: 70,
  21: 210,
  60: 600,
  90: 900,
  180: 1800,
  365: 3650,
};

export function getStreakMilestones() {
  return Object.entries(STREAK_MILESTONES)
    .map(([days, rewardSats]) => ({ days: Number(days), rewardSats }))
    .sort((a, b) => a.days - b.days);
}

export function isDoubleRewardActive(startAt?: Date | null, endAt?: Date | null, now = new Date()) {
  if (!startAt || !endAt) return false;
  return now >= startAt && now <= endAt;
}

export function applyDoubleReward(amount: number, isActive: boolean) {
  return isActive ? amount * 2 : amount;
}

export function normalizeUtcDay(date: Date) {
  const normalized = new Date(date);
  normalized.setUTCHours(0, 0, 0, 0);
  return normalized;
}

export function getStreakMilestoneReward(day: number) {
  return STREAK_MILESTONES[day] || 0;
}

export function getNextStreakMilestone(lastClaimedMilestone: number) {
  return Object.keys(STREAK_MILESTONES)
    .map(Number)
    .sort((a, b) => a - b)
    .find((milestone) => milestone > lastClaimedMilestone) || null;
}

export function evaluateDailyActivityStreak(lastActivityAt: Date | null | undefined, currentStreak: number, now = new Date()) {
  const today = normalizeUtcDay(now);
  const lastActiveDay = lastActivityAt ? normalizeUtcDay(lastActivityAt) : null;

  if (!lastActiveDay) {
    return { nextStreak: 1, didCountToday: false, reset: false };
  }

  const diffDays = Math.floor((today.getTime() - lastActiveDay.getTime()) / (24 * 60 * 60 * 1000));

  if (diffDays <= 0) {
    return { nextStreak: currentStreak, didCountToday: true, reset: false };
  }

  if (diffDays === 1) {
    return { nextStreak: currentStreak + 1, didCountToday: false, reset: false };
  }

  return { nextStreak: 1, didCountToday: false, reset: true };
}
