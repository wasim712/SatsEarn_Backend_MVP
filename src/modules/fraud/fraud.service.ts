import { prisma } from '../../db/prisma.client';
import { CryptoUtil } from '../../utils/crypto.util';

export class FraudService {
  static async analyzeUserRisk(userId: string) {
    const flags: string[] = [];
    let riskScore = 0;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        submissions: { orderBy: { submittedAt: 'desc' } },
        withdrawals: { orderBy: { createdAt: 'desc' } },
        referrals: true,
      },
    });

    if (!user) {
      throw new Error('User not found');
    }

    const { submissions, withdrawals, referrals } = user;
    const lastIpAddress = CryptoUtil.decrypt(user.lastIpAddress);

    if (lastIpAddress) {
      const users = await prisma.user.findMany({
        where: { id: { not: userId } },
        select: { id: true, lastIpAddress: true },
      });

      const usersWithSameIp = users.filter(
        (candidate) => CryptoUtil.decrypt(candidate.lastIpAddress) === lastIpAddress,
      ).length;

      if (usersWithSameIp > 0) {
        flags.push(`IP Conflict: Matches ${usersWithSameIp} other registered account(s).`);
        riskScore += 40;
      }
    }

    if (referrals.length >= 3) {
      const inactiveReferrals = referrals.filter((referral) => referral.totalXp === 0).length;
      const inactiveRatio = inactiveReferrals / referrals.length;

      if (inactiveRatio > 0.8) {
        flags.push(`Referral Abuse: ${Math.round(inactiveRatio * 100)}% of their ${referrals.length} referrals have 0 XP.`);
        riskScore += 30;
      }
    }

    if (withdrawals.length > 0) {
      const recentInvoice = CryptoUtil.decrypt(withdrawals[0].lightningInvoice);

      if (recentInvoice) {
        const invoicePrefix = recentInvoice.substring(0, 25);
        const otherWithdrawals = await prisma.withdrawal.findMany({
          where: { userId: { not: userId } },
          select: { lightningInvoice: true },
        });

        const sharedInvoices = otherWithdrawals.filter((withdrawal) => {
          const invoice = CryptoUtil.decrypt(withdrawal.lightningInvoice);
          return invoice?.startsWith(invoicePrefix);
        }).length;

        if (sharedInvoices > 0) {
          flags.push(`Wallet Conflict: Lightning routing matches ${sharedInvoices} other user(s).`);
          riskScore += 50;
        }
      }
    }

    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const recentSubmissions = submissions.filter((submission) => new Date(submission.submittedAt) > oneHourAgo);

    if (recentSubmissions.length > 15) {
      flags.push(`Botting Risk: Submitted ${recentSubmissions.length} tasks in under 1 hour.`);
      riskScore += 30;
    }

    const rejectedCount = submissions.filter((submission) => submission.status === 'REJECTED').length;
    const totalReviewed = submissions.filter(
      (submission) => submission.status !== 'PENDING_24H' && submission.status !== 'MANUAL_REVIEW',
    ).length;

    if (totalReviewed >= 5) {
      const rejectRatio = rejectedCount / totalReviewed;

      if (rejectRatio >= 0.7) {
        flags.push(`Spam Risk: ${Math.round(rejectRatio * 100)}% of their tasks get rejected.`);
        riskScore += 25;
      }
    }

    riskScore = Math.min(riskScore, 100);

    return {
      userId: user.id,
      email: user.email,
      riskScore,
      flags,
    };
  }

  static async getHighRiskUsers() {
    const pendingWithdrawals = await prisma.withdrawal.findMany({
      where: { status: 'PENDING' },
      select: { userId: true },
      distinct: ['userId'],
    });

    const reports = await Promise.all(
      pendingWithdrawals.map((withdrawal) => this.analyzeUserRisk(withdrawal.userId)),
    );

    return reports.filter((report) => report.flags.length > 0).sort((a, b) => b.riskScore - a.riskScore);
  }
}
