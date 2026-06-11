import { prisma } from '../../../db/prisma.client';
import { evaluateDailyActivityStreak } from '../../../utils/reward.util';

type LeaderboardEntry = {
  rank: number;
  userId: string;
  fullName: string;
  username: string;
  avatarUrl: string | null;
  value: number;
};

function getDisplayName(user: { fullName: string | null; username: string | null; email: string }) {
  return user.fullName || user.username || user.email.split('@')[0] || 'User';
}

function getHandle(user: { username: string | null; email: string }) {
  return user.username || user.email.split('@')[0] || 'user';
}

export class UserLeaderboardService {
  static async getLeaderboard() {
    const now = new Date();
    const last24Hours = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const last7Days = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const last30Days = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const [daily, weekly, monthly, allTime, streaks] = await Promise.all([
      this.getEarningsLeaderboard(last24Hours),
      this.getEarningsLeaderboard(last7Days),
      this.getEarningsLeaderboard(last30Days),
      this.getEarningsLeaderboard(),
      this.getStreakLeaderboard(),
    ]);

    return {
      daily,
      weekly,
      monthly,
      allTime,
      streaks,
      generatedAt: now.toISOString(),
    };
  }

  private static async getEarningsLeaderboard(fromDate?: Date): Promise<LeaderboardEntry[]> {
    const ledgerEntries = await prisma.ledger.findMany({
      where: {
        amountSats: { gt: 0 },
        ...(fromDate ? { createdAt: { gte: fromDate } } : {}),
        type: {
          in: ['TASK_REWARD', 'REFERRAL_BONUS', 'WELCOME_BONUS', 'STREAK_BONUS', 'DAILY_QUIZ_REWARD'],
        },
        user: {
          isActive: true,
          role: 'USER',
        },
      },
      select: {
        amountSats: true,
        userId: true,
        user: {
          select: {
            fullName: true,
            username: true,
            email: true,
            avatarUrl: true,
          },
        },
      },
    });

    const totals = new Map<string, Omit<LeaderboardEntry, 'rank'>>();

    for (const entry of ledgerEntries) {
      const existing = totals.get(entry.userId);
      const base = existing || {
        userId: entry.userId,
        fullName: getDisplayName(entry.user),
        username: getHandle(entry.user),
        avatarUrl: entry.user.avatarUrl,
        value: 0,
      };

      base.value += entry.amountSats;
      totals.set(entry.userId, base);
    }

    return Array.from(totals.values())
      .sort((a, b) => b.value - a.value)
      .slice(0, 20)
      .map((entry, index) => ({ ...entry, rank: index + 1 }));
  }

  private static async getStreakLeaderboard(): Promise<LeaderboardEntry[]> {
    const users = await prisma.user.findMany({
      where: {
        isActive: true,
        role: 'USER',
      },
      orderBy: [{ currentStreak: 'desc' }, { totalXp: 'desc' }],
      take: 20,
      select: {
        id: true,
        fullName: true,
        username: true,
        email: true,
        avatarUrl: true,
        currentStreak: true,
        lastActivityAt: true,
      },
    });

    return users
      .map((user) => ({
        ...user,
        currentStreak: evaluateDailyActivityStreak(user.lastActivityAt, user.currentStreak).reset
          ? 0
          : user.currentStreak,
      }))
      .sort((a, b) => b.currentStreak - a.currentStreak)
      .map((user, index) => ({
      rank: index + 1,
      userId: user.id,
      fullName: getDisplayName(user),
      username: getHandle(user),
      avatarUrl: user.avatarUrl,
      value: user.currentStreak,
      }));
  }
}
