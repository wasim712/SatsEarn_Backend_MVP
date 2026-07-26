export const STREAK_MILESTONES: Record<number, number> = {
  7: 70,
  21: 210,
  60: 600,
  90: 900,
  180: 1800,
  365: 3650,
};

export const PREMIUM_STREAK_MILESTONES = new Set([90, 180, 365]);

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

export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone });
    return true;
  } catch {
    return false;
  }
}

export function normalizeUtcDay(date: Date) {
  const normalized = new Date(date);
  normalized.setUTCHours(0, 0, 0, 0);
  return normalized;
}

// Buckets a timestamp into the user's local calendar day (not UTC), so streaks
// aren't broken/collapsed by users whose activity falls near their own midnight
// but on the same UTC calendar date (or vice versa).
export function normalizeToTimezoneDay(date: Date, timeZone: string = 'UTC') {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);

  const year = parts.find((p) => p.type === 'year')?.value;
  const month = parts.find((p) => p.type === 'month')?.value;
  const day = parts.find((p) => p.type === 'day')?.value;

  return new Date(`${year}-${month}-${day}T00:00:00.000Z`);
}

export function getStreakMilestoneReward(day: number) {
  return STREAK_MILESTONES[day] || 0;
}

export function isPremiumStreakMilestone(day: number) {
  return PREMIUM_STREAK_MILESTONES.has(day);
}

export function getNextStreakMilestone(lastClaimedMilestone: number) {
  return Object.keys(STREAK_MILESTONES)
    .map(Number)
    .sort((a, b) => a - b)
    .find((milestone) => milestone > lastClaimedMilestone) || null;
}

export function evaluateDailyActivityStreak(
  lastActivityAt: Date | null | undefined,
  currentStreak: number,
  now = new Date(),
  timeZone: string = 'UTC',
) {
  if (!lastActivityAt) {
    return { nextStreak: 1, didCountToday: false, reset: false };
  }

  if (currentStreak <= 0) {
    return { nextStreak: 1, didCountToday: false, reset: false };
  }

  const elapsedMs = now.getTime() - lastActivityAt.getTime();
  const twentyFourHoursMs = 24 * 60 * 60 * 1000;

  if (elapsedMs < 0) {
    return { nextStreak: currentStreak, didCountToday: true, reset: false };
  }

  let today: Date;
  let lastActiveDay: Date;
  try {
    today = normalizeToTimezoneDay(now, timeZone);
    lastActiveDay = normalizeToTimezoneDay(lastActivityAt, timeZone);
  } catch {
    today = normalizeToTimezoneDay(now, 'UTC');
    lastActiveDay = normalizeToTimezoneDay(lastActivityAt, 'UTC');
  }
  const diffDays = Math.round((today.getTime() - lastActiveDay.getTime()) / twentyFourHoursMs);

  if (diffDays <= 0) {
    return { nextStreak: currentStreak, didCountToday: true, reset: false };
  }

  if (diffDays === 1) {
    return { nextStreak: currentStreak + 1, didCountToday: false, reset: false };
  }

  return { nextStreak: 1, didCountToday: false, reset: true };
}
