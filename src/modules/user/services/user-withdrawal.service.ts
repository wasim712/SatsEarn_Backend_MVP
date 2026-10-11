import { prisma } from '../../../db/prisma.client';
import { CryptoUtil } from '../../../utils/crypto.util';
import { FraudService } from '../../fraud/fraud.service';
import { NotificationService } from '../../notifications/notification.service';
import { TierUtils } from '../../../utils/tier.utils';
import { computeUserBalances } from '../../../utils/balance.util';
import { decodeBolt11, DecodedBolt11 } from '../../../utils/bolt11.util';
import { recordWithdrawalRequest } from '../../../monitoring/prometheus';

// Admins pay withdrawals by hand, so the invoice must still be payable for a while.
const MIN_INVOICE_VALIDITY_MS = 10 * 60 * 1000;

function decryptWithdrawal<T extends Record<string, any>>(withdrawal: T): T {
  return {
    ...withdrawal,
    lightningInvoice: CryptoUtil.decrypt(withdrawal.lightningInvoice),
    paymentProof: CryptoUtil.decrypt(withdrawal.paymentProof),
  };
}

// Without this, a user could request 25,000 sats with an invoice for 250,000 (or for "any amount")
// and rely on the admin not noticing.
function validateWithdrawalInvoice(invoice: string, amountSats: number): DecodedBolt11 {
  let decoded: DecodedBolt11;
  try {
    decoded = decodeBolt11(invoice);
  } catch (error: any) {
    throw new Error(`Invalid Lightning invoice: ${error.message}`);
  }

  const allowTestnet = process.env.NODE_ENV !== 'production' || process.env.ALLOW_TESTNET_INVOICES === 'true';
  if (decoded.network !== 'mainnet' && !(allowTestnet && decoded.network === 'testnet')) {
    throw new Error("Only Bitcoin mainnet Lightning invoices (starting with 'lnbc') are accepted.");
  }

  if (decoded.amountMsat === null) {
    throw new Error(`Your invoice has no amount. Create an invoice for exactly ${amountSats.toLocaleString()} sats.`);
  }

  if (decoded.amountMsat !== BigInt(amountSats) * 1000n) {
    const invoiceSats = Number(decoded.amountMsat / 1000n);
    throw new Error(`Your invoice is for ${invoiceSats.toLocaleString()} sats but you requested ${amountSats.toLocaleString()} sats. Create an invoice for exactly ${amountSats.toLocaleString()} sats.`);
  }

  if (decoded.expiresAt.getTime() < Date.now() + MIN_INVOICE_VALIDITY_MS) {
    throw new Error('This invoice has expired or expires too soon. Create a new invoice and submit it right away.');
  }

  if (!decoded.paymentHash) {
    throw new Error('Invalid Lightning invoice: missing payment hash.');
  }

  return decoded;
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

    const decodedInvoice = validateWithdrawalInvoice(lightningInvoice, amountSats);

    const earlierWithdrawals = await prisma.withdrawal.findMany({
      where: { userId, status: { not: 'REJECTED' } },
      select: { lightningInvoice: true },
    });
    const reused = earlierWithdrawals.some((withdrawal) => {
      try {
        const earlierInvoice = CryptoUtil.decrypt(withdrawal.lightningInvoice);
        return Boolean(earlierInvoice) && decodeBolt11(earlierInvoice!).paymentHash === decodedInvoice.paymentHash;
      } catch {
        return false;
      }
    });
    if (reused) {
      throw new Error('This invoice was already used for an earlier withdrawal. Create a new one.');
    }

    const encryptedInvoice = CryptoUtil.encrypt(lightningInvoice.trim());

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

    recordWithdrawalRequest('created');

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
