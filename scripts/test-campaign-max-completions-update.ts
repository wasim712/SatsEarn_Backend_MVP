import 'dotenv/config';
import { prisma } from '../src/db/prisma.client';
import { AdminCampaignService } from '../src/modules/admin/services/admin-campaign.service';

async function main() {
  const campaign = await prisma.campaign.findFirst({
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      title: true,
      maxCompletions: true,
      requiredPlatform: true,
    },
  });

  if (!campaign) {
    throw new Error('No campaign found to test. Create a campaign first.');
  }

  const originalMaxCompletions = campaign.maxCompletions;
  const nextMaxCompletions = originalMaxCompletions === 1000 ? 1001 : 1000;

  console.log('--- Campaign Update Regression Test ---');
  console.log('Campaign ID:', campaign.id);
  console.log('Campaign Title:', campaign.title);
  console.log('Original maxCompletions:', originalMaxCompletions);
  console.log('Updating to:', nextMaxCompletions);

  const updated = await AdminCampaignService.updateCampaign(campaign.id, {
    maxCompletions: nextMaxCompletions,
    requiredPlatform: campaign.requiredPlatform,
  });

  const reloaded = await prisma.campaign.findUnique({
    where: { id: campaign.id },
    select: {
      id: true,
      maxCompletions: true,
      requiredPlatform: true,
    },
  });

  console.log('Service returned maxCompletions:', updated.maxCompletions);
  console.log('Database maxCompletions:', reloaded?.maxCompletions);

  if (!reloaded) {
    throw new Error('Campaign disappeared after update.');
  }

  if (updated.maxCompletions !== nextMaxCompletions) {
    throw new Error(`Service response mismatch: expected ${nextMaxCompletions}, got ${updated.maxCompletions}`);
  }

  if (reloaded.maxCompletions !== nextMaxCompletions) {
    throw new Error(`Database mismatch: expected ${nextMaxCompletions}, got ${reloaded.maxCompletions}`);
  }

  await AdminCampaignService.updateCampaign(campaign.id, {
    maxCompletions: originalMaxCompletions,
    requiredPlatform: campaign.requiredPlatform,
  });

  console.log('PASS: maxCompletions persisted correctly and rollback succeeded.');
}

main()
  .catch((error) => {
    console.error('FAIL:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
