import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 1,
});

const prisma = new PrismaClient({ adapter: new PrismaPg(pool as any) });

async function main() {
  const email = process.argv[2];

  if (!email) {
    throw new Error('Usage: npm run reset:premium-billing-test -- user@example.com');
  }

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, email: true },
  });

  if (!user) {
    throw new Error(`User not found for email: ${email}`);
  }

  await prisma.$transaction(async (tx) => {
    await tx.billingRecord.deleteMany({ where: { userId: user.id } });
    await tx.user.update({
      where: { id: user.id },
      data: {
        premiumTier: null,
        premiumExpiresAt: null,
        queuedPremiumTier: null,
        queuedPremiumStartsAt: null,
        queuedPremiumExpiresAt: null,
      },
    });
  });

  console.log(`Reset billing records and premium cache for ${user.email}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });

