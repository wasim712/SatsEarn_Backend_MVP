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

function getRequiredEnv(name: string) {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`${name} environment variable is missing`);
  }

  return value;
}

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
  updatePassword?: boolean;
}) {
  const passwordHash = await bcrypt.hash(params.password, 10);
  const updateData: Record<string, unknown> = {
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
  };

  if (params.updatePassword) {
    updateData.passwordHash = passwordHash;
  }

  return prisma.user.upsert({
    where: { email: params.email },
    update: updateData,
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

  const adminEmail = 'admin@satsearn.com';
  const adminPassword = getRequiredEnv('ADMIN_PASSWORD');
  const adminFullName = process.env.ADMIN_FULL_NAME?.trim() || 'SatsEarn Admin';
  const adminUsername = process.env.ADMIN_USERNAME?.trim() || 'admin';
  const adminReferralCode = process.env.ADMIN_REFERRAL_CODE?.trim() || 'ADMIN001';
  const adminCountry = process.env.ADMIN_COUNTRY?.trim() || 'India';
  const resetAdminPassword = process.env.ADMIN_RESET_PASSWORD === 'true';

  const admin = await upsertUser({
    email: adminEmail,
    password: adminPassword,
    fullName: adminFullName,
    username: adminUsername,
    referralCode: adminReferralCode,
    role: 'SUPER_ADMIN',
    totalXp: 10000,
    country: adminCountry,
    updatePassword: resetAdminPassword,
  });

  const saksham = await upsertUser({
    email: 'sakshamarya015@gmail.com',
    password: 'SecurePassword123!',
    fullName: 'Saksham Arya',
    username: 'saksham1',
    referralCode: 'SAKSHAM1',
    totalXp: 120000,
    country: 'India',
    premiumTier: 'CROWN',
    premiumExpiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    updatePassword: true,
  });

  console.log('✅ Platform settings seeded');
  console.log(`✅ Admin account seeded: ${admin.email}`);
  console.log(
    resetAdminPassword
      ? '✅ Admin password was updated from environment'
      : '✅ Admin password was left unchanged on existing records'
  );
  console.log(`✅ Admin referral code: ${admin.referralCode}`);
  console.log(`✅ Member account seeded: ${saksham.email}`);
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
