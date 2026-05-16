import 'dotenv/config';
import { prisma } from '../src/db/prisma.client';

const REFERRER_EMAIL = 'sakshamarya015@gmail.com';
const DUMMY_COUNT = 20;

async function main() {
  const referrer = await prisma.user.findUnique({
    where: { email: REFERRER_EMAIL },
    select: { id: true, referralCode: true, email: true },
  });

  if (!referrer) {
    throw new Error(`Referrer not found for email: ${REFERRER_EMAIL}`);
  }

  console.log(`Seeding ${DUMMY_COUNT} dummy referrals for ${referrer.email} (${referrer.id})`);

  const created: string[] = [];

  for (let index = 1; index <= DUMMY_COUNT; index += 1) {
    const email = `dummy.referral.${index}.saksham@test.local`;
    const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } });

    if (existing) {
      console.log(`Skipping existing dummy user: ${email}`);
      continue;
    }

    const user = await prisma.user.create({
      data: {
        email,
        passwordHash: 'dummy-hash',
        authProvider: 'EMAIL',
        isVerified: true,
        fullName: `Dummy Referral ${index}`,
        country: 'India',
        referralCode: `DUM${String(index).padStart(5, '0')}`,
        referredById: referrer.id,
        totalXp: index * 100,
      },
      select: { id: true, email: true },
    });

    created.push(user.email);
    console.log(`Created dummy referral: ${user.email}`);
  }

  const totalReferrals = await prisma.user.count({ where: { referredById: referrer.id } });
  console.log(`Done. Referrer now has ${totalReferrals} referred users.`);
}

main()
  .catch((error) => {
    console.error('Dummy referral seed failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
