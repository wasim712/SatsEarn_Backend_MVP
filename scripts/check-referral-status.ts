import 'dotenv/config';
import { prisma } from '../src/db/prisma.client';
import { TierUtils } from '../src/utils/tier.utils';

const REFERRER_EMAIL = 'sakshamarya015@gmail.com';
const EXPECTED_REFERRAL_CODE = 'B7F3466D';

async function main() {
  const referrer = await prisma.user.findUnique({
    where: { email: REFERRER_EMAIL },
    include: {
      referrals: {
        select: {
          id: true,
          email: true,
          fullName: true,
          createdAt: true,
          totalXp: true,
        },
      },
      transactions: {
        where: { type: 'REFERRAL_BONUS' },
        select: {
          amountSats: true,
          description: true,
          createdAt: true,
          referenceId: true,
        },
        orderBy: { createdAt: 'desc' },
      },
    },
  });

  if (!referrer) {
    throw new Error(`Referrer not found for email: ${REFERRER_EMAIL}`);
  }

  const isPremium = TierUtils.isPremiumActive(referrer as any);
  const freeTier = TierUtils.getFreeTier(referrer.totalXp);
  const activeTier = isPremium ? referrer.premiumTier : freeTier;
  const freeTierCap = !isPremium ? TierUtils.getFreeTierReferralCap(freeTier) : null;

  const rewardedReferralUsers = await prisma.user.findMany({
    where: {
      referredById: referrer.id,
      transactions: {
        some: {
          type: 'REFERRAL_BONUS',
          userId: referrer.id,
        },
      },
    },
    select: {
      id: true,
      email: true,
      fullName: true,
    },
  });

  const totalReferralBonusSats = referrer.transactions.reduce((sum, tx) => sum + tx.amountSats, 0);
  const remainingUserSlots = freeTierCap ? Math.max(freeTierCap.maxUsers - rewardedReferralUsers.length, 0) : null;
  const remainingSats = freeTierCap ? Math.max(freeTierCap.maxSats - totalReferralBonusSats, 0) : null;

  console.log('='.repeat(72));
  console.log('REFERRAL STATUS CHECK');
  console.log('='.repeat(72));
  console.log(`Referrer Email           : ${referrer.email}`);
  console.log(`Expected Referral Code   : ${EXPECTED_REFERRAL_CODE}`);
  console.log(`Actual Referral Code     : ${referrer.referralCode}`);
  console.log(`Code Match               : ${referrer.referralCode === EXPECTED_REFERRAL_CODE ? 'YES' : 'NO'}`);
  console.log(`Premium Active           : ${isPremium ? 'YES' : 'NO'}`);
  console.log(`Free Tier                : ${freeTier}`);
  console.log(`Active Tier              : ${activeTier}`);
  console.log(`Total XP                 : ${referrer.totalXp}`);
  console.log(`Total Referrals          : ${referrer.referrals.length}`);
  console.log(`Rewarded Referral Users  : ${rewardedReferralUsers.length}`);
  console.log(`Referral Bonus Earned    : ${totalReferralBonusSats.toLocaleString()} sats`);

  if (freeTierCap) {
    console.log(`Free Tier User Cap       : ${freeTierCap.maxUsers}`);
    console.log(`Free Tier Sats Cap       : ${freeTierCap.maxSats.toLocaleString()} sats`);
    console.log(`Remaining User Slots     : ${remainingUserSlots}`);
    console.log(`Remaining Sats Capacity  : ${remainingSats?.toLocaleString()} sats`);
  } else {
    console.log('Referral Cap             : Unlimited (paid tier active)');
  }

  console.log('\nRecent Referral Bonus Transactions');
  console.log('-'.repeat(72));
  if (referrer.transactions.length === 0) {
    console.log('No referral bonus transactions found.');
  } else {
    for (const tx of referrer.transactions.slice(0, 10)) {
      console.log(
        `${new Date(tx.createdAt).toLocaleString()} | +${tx.amountSats} sats | ${tx.description || 'No description'}`,
      );
    }
  }

  console.log('\nReferred Users');
  console.log('-'.repeat(72));
  if (referrer.referrals.length === 0) {
    console.log('No referred users found.');
  } else {
    const rewardedIds = new Set(rewardedReferralUsers.map((user) => user.id));
    for (const user of referrer.referrals.slice(0, 20)) {
      console.log(
        `${rewardedIds.has(user.id) ? '[REWARDED]' : '[PENDING ]'} ${user.email} | ${user.fullName || 'No name'} | XP: ${user.totalXp}`,
      );
    }
  }

  console.log('='.repeat(72));
}

main()
  .catch((error) => {
    console.error('Referral status check failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
