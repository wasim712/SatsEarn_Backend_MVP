import { PrismaClient, PremiumTier } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import bcrypt from 'bcryptjs';
import 'dotenv/config';

const pool = new Pool({
  connectionString: process.env.DIRECT_URL || process.env.DATABASE_URL,
  connectionTimeoutMillis: 30000,
  idleTimeoutMillis: 30000,
  max: 1,
  ssl: { rejectUnauthorized: false },
});

const adapter = new PrismaPg(pool as any);
const prisma = new PrismaClient({ adapter });

async function upsertUser(params: {
  email: string;
  password: string;
  fullName: string;
  username: string;
  referralCode: string;
  referredById?: string | null;
  role?: 'USER' | 'SUPER_ADMIN';
  totalXp?: number;
  isVerified?: boolean;
  country?: string;
  premiumTier?: PremiumTier | null;
  premiumExpiresAt?: Date | null;
  lastActivityAt?: Date;
}) {
  const passwordHash = await bcrypt.hash(params.password, 10);

  return prisma.user.upsert({
    where: { email: params.email },
    update: {
      passwordHash,
      fullName: params.fullName,
      username: params.username,
      referralCode: params.referralCode,
      referredById: params.referredById ?? null,
      role: params.role || 'USER',
      totalXp: params.totalXp ?? 0,
      isVerified: params.isVerified ?? true,
      country: params.country || 'IN',
      premiumTier: params.premiumTier ?? null,
      premiumExpiresAt: params.premiumExpiresAt ?? null,
      lastActivityAt: params.lastActivityAt,
      authProvider: 'EMAIL',
    },
    create: {
      email: params.email,
      passwordHash,
      authProvider: 'EMAIL',
      isVerified: params.isVerified ?? true,
      fullName: params.fullName,
      username: params.username,
      role: params.role || 'USER',
      referralCode: params.referralCode,
      referredById: params.referredById ?? null,
      country: params.country || 'IN',
      totalXp: params.totalXp ?? 0,
      premiumTier: params.premiumTier ?? null,
      premiumExpiresAt: params.premiumExpiresAt ?? null,
      lastActivityAt: params.lastActivityAt,
    },
  });
}

async function createSequentialActivityForReferralUser(userId: string, days: number) {
  await prisma.standaloneSubmission.deleteMany({ where: { userId } });

  for (let offset = 0; offset < days; offset++) {
    const submittedAt = new Date();
    submittedAt.setUTCDate(submittedAt.getUTCDate() - offset);
    submittedAt.setUTCHours(12, 0, 0, 0);

    const standaloneTask = await prisma.standaloneTask.upsert({
      where: { id: `seed-standalone-activity-task-${offset + 1}` },
      update: {
        title: `Seed Activity Task ${offset + 1}`,
        description: 'Used only for referral activity seeding.',
        category: 'SOCIAL',
        targetCountries: ['IN'],
        tierRewardMatrix: {
          BASIC: 10,
          COPPER: 10,
          BRONZE: 10,
          SILVER: 10,
          GOLD: 10,
          PLATINUM: 10,
          DIAMOND: 10,
          CROWN: 10,
          ELITE: 10,
          FOUNDER: 10,
        },
        isActive: true,
      },
      create: {
        id: `seed-standalone-activity-task-${offset + 1}`,
        title: `Seed Activity Task ${offset + 1}`,
        description: 'Used only for referral activity seeding.',
        category: 'SOCIAL',
        targetCountries: ['IN'],
        tierRewardMatrix: {
          BASIC: 10,
          COPPER: 10,
          BRONZE: 10,
          SILVER: 10,
          GOLD: 10,
          PLATINUM: 10,
          DIAMOND: 10,
          CROWN: 10,
          ELITE: 10,
          FOUNDER: 10,
        },
        isActive: true,
      },
    });

    await prisma.standaloneSubmission.create({
      data: {
        userId,
        standaloneTaskId: standaloneTask.id,
        proofText: `Seed referral activity day ${offset + 1}`,
        confidenceScore: 100,
        status: 'WITHDRAWABLE',
        submittedAt,
      } as any,
    });
  }
}

async function main() {
  console.log('🌱 Starting backend seed...');

  await prisma.platformSettings.upsert({
    where: { id: 'global-settings' },
    update: {
      welcomeBonusSats: 50,
      minWithdrawalSats: 25000,
      referralBonusPercent: 5,
      tierReferralMatrix: {
        BASIC: 5,
        COPPER: 5,
        BRONZE: 5,
        SILVER: 5,
        GOLD: 5,
        PLATINUM: 5,
        DIAMOND: 5,
        CROWN: 5,
        ELITE: 5,
        FOUNDER: 5,
      },
      tierMinWithdrawalMatrix: {
        BASIC: 25000,
        COPPER: 25000,
        BRONZE: 25000,
        SILVER: 25000,
        GOLD: 25000,
        PLATINUM: 25000,
        DIAMOND: 25000,
        CROWN: 25000,
        ELITE: 25000,
        FOUNDER: 25000,
      },
      premiumMonthlySatsMatrix: {
        PLATINUM: 6499,
        DIAMOND: 8999,
        CROWN: 12999,
        ELITE: 19999,
        FOUNDER: 0,
      },
      premiumYearlySatsMatrix: {
        PLATINUM: 72999,
        DIAMOND: 102999,
        CROWN: 146999,
        ELITE: 221999,
        FOUNDER: 299999,
      },
      premiumMonthlyUsdMatrix: {
        PLATINUM: 4.99,
        DIAMOND: 6.99,
        CROWN: 9.99,
        ELITE: 15.99,
        FOUNDER: 0,
      },
      premiumYearlyUsdMatrix: {
        PLATINUM: 54.99,
        DIAMOND: 76.99,
        CROWN: 109.99,
        ELITE: 175.99,
        FOUNDER: 249.99,
      },
      baseXpPerTask: 10,
    },
    create: {
      id: 'global-settings',
      welcomeBonusSats: 50,
      minWithdrawalSats: 25000,
      referralBonusPercent: 5,
      tierReferralMatrix: {
        BASIC: 5,
        COPPER: 5,
        BRONZE: 5,
        SILVER: 5,
        GOLD: 5,
        PLATINUM: 5,
        DIAMOND: 5,
        CROWN: 5,
        ELITE: 5,
        FOUNDER: 5,
      },
      tierMinWithdrawalMatrix: {
        BASIC: 25000,
        COPPER: 25000,
        BRONZE: 25000,
        SILVER: 25000,
        GOLD: 25000,
        PLATINUM: 25000,
        DIAMOND: 25000,
        CROWN: 25000,
        ELITE: 25000,
        FOUNDER: 25000,
      },
      premiumMonthlySatsMatrix: {
        PLATINUM: 6499,
        DIAMOND: 8999,
        CROWN: 12999,
        ELITE: 19999,
        FOUNDER: 0,
      },
      premiumYearlySatsMatrix: {
        PLATINUM: 72999,
        DIAMOND: 102999,
        CROWN: 146999,
        ELITE: 221999,
        FOUNDER: 299999,
      },
      premiumMonthlyUsdMatrix: {
        PLATINUM: 4.99,
        DIAMOND: 6.99,
        CROWN: 9.99,
        ELITE: 15.99,
        FOUNDER: 0,
      },
      premiumYearlyUsdMatrix: {
        PLATINUM: 54.99,
        DIAMOND: 76.99,
        CROWN: 109.99,
        ELITE: 175.99,
        FOUNDER: 249.99,
      },
      baseXpPerTask: 10,
    },
  });

  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminPassword) {
    throw new Error('ADMIN_PASSWORD environment variable is missing');
  }

  await upsertUser({
    email: 'admin@satsearn.com',
    password: adminPassword,
    fullName: 'Saksham Arya',
    username: 'admin',
    referralCode: 'ADMIN001',
    role: 'SUPER_ADMIN',
    totalXp: 10000,
    country: 'IN',
  });

  const saksham = await upsertUser({
    email: 'sakshamarya015@gmail.com',
    password: 'SecurePassword123!',
    fullName: 'Saksham Referral Tester',
    username: 'saksham1',
    referralCode: 'SAKSHAM1',
    totalXp: 120000,
    country: 'IN',
    premiumTier: 'CROWN',
    premiumExpiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
  });

  const referralChild = await upsertUser({
    email: 's',
    password: 'SecurePassword123!',
    fullName: 'Referral Child Tester',
    username: 'refchild1',
    referralCode: 'REFCHILD',
    referredById: saksham.id,
    totalXp: 500,
    country: 'IN',
  });

  await upsertUser({
    email: 'referralchild2@example.com',
    password: 'SecurePassword123!',
    fullName: 'Referral Child Tester Two',
    username: 'refchild2',
    referralCode: 'REFCHD2',
    referredById: saksham.id,
    totalXp: 1500,
    country: 'IN',
  });

  await upsertUser({
    email: 'floattester@example.com',
    password: 'SecurePassword123!',
    fullName: 'Float Referral Tester',
    username: 'fltref1',
    referralCode: 'FLOAT001',
    totalXp: 2500,
    country: 'IN',
  });

  await createSequentialActivityForReferralUser(referralChild.id, 10);

  console.log('✅ Platform settings seeded');
  console.log('✅ Admin account seeded: admin@satsearn.com');
  console.log('✅ Referral test account seeded: sakshamarya015@gmail.com / SecurePassword123!');
  console.log(`✅ Referral code for testing: ${saksham.referralCode}`);
  console.log('✅ Additional test accounts seeded: referralchild@example.com, referralchild2@example.com, floattester@example.com');
  console.log('✅ Added 10 sequential active days for referralchild@example.com');
}

main()
  .catch((error) => {
    console.error('❌ Seed failed:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
