import { prisma } from '../../../db/prisma.client';
import { CryptoUtil } from '../../../utils/crypto.util';
import { TierUtils } from '../../../utils/tier.utils';
import { NotificationService } from '../../notifications/notification.service';

export class AdminWithdrawalService {
  static async getAllWithdrawals() {
    const withdrawals = await prisma.withdrawal.findMany({
      include: {
        user: {
          select: {
            email: true,
            fullName: true,
            totalXp: true,
            premiumTier: true,
            premiumExpiresAt: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return withdrawals.map((withdrawal) => {
      const hasPremium = TierUtils.isPremiumActive(withdrawal.user as any);
      return {
        ...withdrawal,
        lightningInvoice: CryptoUtil.mask(withdrawal.lightningInvoice),
        paymentProof: CryptoUtil.decrypt(withdrawal.paymentProof),
        user: {
          ...withdrawal.user,
          activeTier: hasPremium
            ? withdrawal.user.premiumTier
            : TierUtils.getFreeTier(withdrawal.user.totalXp),
        },
      };
    });
  }

  static async processWithdrawal(
    withdrawalId: string,
    status: 'PAID' | 'REJECTED',
    paymentProof?: string,
  ) {
    return await prisma.$transaction(
      async (tx) => {
        const withdrawal = await tx.withdrawal.findUnique({
          where: { id: withdrawalId },
        });

        if (!withdrawal) throw new Error('Withdrawal request not found');
        if (withdrawal.status !== 'PENDING') {
          throw new Error(`Withdrawal is already ${withdrawal.status}`);
        }

        if (status === 'PAID') {
          if (!paymentProof) {
            throw new Error('Payment proof (TxHash/Preimage) is required when marking as PAID');
          }

          await NotificationService.notifyUser(
            withdrawal.userId,
            'Withdrawal Paid! ?',
            `Your request for ${withdrawal.amountSats} Sats has been sent to your Lightning wallet!`,
            'WITHDRAWAL_PAID',
            withdrawal.id,
          );

          return await tx.withdrawal.update({
            where: { id: withdrawalId },
            data: {
              status: 'PAID',
              paymentProof: CryptoUtil.encrypt(paymentProof),
            },
          });
        }

        await tx.user.update({
          where: { id: withdrawal.userId },
          data: { balanceAvailable: { increment: withdrawal.amountSats } },
        });

        await NotificationService.notifyUser(
          withdrawal.userId,
          'Withdrawal Rejected',
          `Your request for ${withdrawal.amountSats} Sats was rejected. Funds have been returned to your available balance.`,
          'WITHDRAWAL_REJECTED',
          withdrawal.id,
        );

        await tx.ledger.create({
          data: {
            userId: withdrawal.userId,
            amountSats: withdrawal.amountSats,
            type: 'WITHDRAWAL',
            description: 'Withdrawal Rejected / Refunded to Available Balance',
            referenceId: withdrawal.id,
          },
        });

        return await tx.withdrawal.update({
          where: { id: withdrawalId },
          data: { status: 'REJECTED' },
        });
      },
      { isolationLevel: 'Serializable' },
    );
  }
}
