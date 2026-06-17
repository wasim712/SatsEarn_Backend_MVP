import 'dotenv/config';
import { prisma } from '../src/db/prisma.client';

async function main() {
  const users = await prisma.user.findMany({
    where: {
      OR: [
        { balancePending: { lt: 0 } },
        { balanceLocked: { lt: 0 } },
        { balanceAvailable: { lt: 0 } },
      ],
    },
    select: {
      id: true,
      email: true,
      balancePending: true,
      balanceLocked: true,
      balanceAvailable: true,
    },
    take: 50,
  });

  console.log(JSON.stringify(users, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
