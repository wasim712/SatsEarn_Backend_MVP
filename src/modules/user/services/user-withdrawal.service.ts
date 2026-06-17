import { prisma } from '../../../db/prisma.client';
import { CryptoUtil } from '../../../utils/crypto.util';
import { FraudService } from '../../fraud/fraud.service';
import { NotificationService } from '../../notifications/notification.service';
import { TierUtils } from '../../../utils/tier.utils';
import { computeUserBalances } from '../../../utils/balance.util';

function decryptWithdrawal<T extends Record<string, any>>(withdrawal: T): T {
  return {
    ...withdrawal,
    lightningInvoice: CryptoUtil.decrypt(withdrawal.lightningInvoice),
    paymentProof: CryptoUtil.decrypt(withdrawal.paymentProof),
  };
}

export class UserWithdrawalService {
  static async getUserWithdrawals(userId: string) {
    const withdrawals = await prisma.withdrawal.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });

    return withdrawals.map(decryptWithdrawal);
  }

  static async requestWithdrawal(userId: string, amountSats: number, lightningInvoice: string) {
    const settings = await prisma.platformSettings.findFirst();
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { totalXp: true, premiumTier: true, premiumExpiresAt: true },
    });

    if (!user) throw new Error('User not found.');

    const activePremiumTier = TierUtils.getCurrentPremiumTier(user as any);
    const hasPremium = Boolean(activePremiumTier);
    const activeTier = activePremiumTier || TierUtils.getFreeTier(user.totalXp);
    const tierMinWithdrawalMatrix = (settings?.tierMinWithdrawalMatrix as Record<string, number> | null) || null;
    const configuredTierMin = tierMinWithdrawalMatrix?.[String(activeTier)];

    if (configuredTierMin === undefined || configuredTierMin === null || Number.isNaN(Number(configuredTierMin))) {
      throw new Error('Minimum withdrawal is not configured for your tier. Please contact admin.');
    }

    const minWithdrawal = Number(configuredTierMin);

    if (amountSats < minWithdrawal) {
      throw new Error(`The minimum withdrawal amount for your tier is ${minWithdrawal.toLocaleString()} Sats.`);
    }

    const encryptedInvoice = CryptoUtil.encrypt(lightningInvoice);

    if (!encryptedInvoice) {
      throw new Error('Lightning invoice is required.');
    }

    const withdrawal = await prisma.$transaction(
      async (tx) => {
        const user = await tx.user.findUnique({
          where: { id: userId },
          select: { balanceAvailable: true },
        });

        if (!user) {
          throw new Error('User not found.');
        }

        // Compute TRUE available balance from the ledger
        const computedBalances = await computeUserBalances(userId);
        // Use the minimum of stored and computed to prevent withdrawing phantom sats
        const trueAvailable = Math.min(user.balanceAvailable, computedBalances.available);

        if (trueAvailable < amountSats) {
          throw new Error('Insufficient available balance.');
        }

        await tx.user.update({
          where: { id: userId },
          data: { balanceAvailable: { decrement: amountSats } },
        });

        const newWithdrawal = await tx.withdrawal.create({
          data: {
            userId,
            amountSats,
            lightningInvoice: encryptedInvoice,
            status: 'PENDING',
          },
        });

        await tx.ledger.create({
          data: {
            userId,
            amountSats: -amountSats,
            type: 'WITHDRAWAL',
            description: 'Withdrawal requested (Pending Admin Review)',
            referenceId: newWithdrawal.id,
          },
        });

        return newWithdrawal;
      },
      { isolationLevel: 'Serializable' },
    );

    try {
      const fraudReport = await FraudService.analyzeUserRisk(userId);

      if (fraudReport.riskScore >= 60) {
        await NotificationService.notifyAdmins(
          'High Risk Withdrawal Detected',
          `User requested ${amountSats} Sats but has a Risk Score of ${fraudReport.riskScore}/100. Flags: ${fraudReport.flags.join(', ')}`,
          'SYSTEM_ALERT',
          withdrawal.id,
        );
      } else {
        await NotificationService.notifyAdmins(
          'New Withdrawal Request',
          `User requested a payout of ${amountSats} Sats.`,
          'NEW_WITHDRAWAL',
          withdrawal.id,
        );
      }
    } catch (error) {
      console.error('Fraud Engine failed to run, but withdrawal was created:', error);
    }

    return decryptWithdrawal(withdrawal);
  }
}
