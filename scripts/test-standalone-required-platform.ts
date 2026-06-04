import 'dotenv/config';
import { createTaskSchema } from '../src/modules/admin/admin.schema';

const payload = {
  body: {
    title: 'Standalone validation test',
    description: 'Checks standalone requiredPlatform validation against admin schema.',
    category: 'SOCIAL',
    proofType: 'SCREENSHOT',
    requiredPlatform: 'NONE',
    requiredFreeTier: 'BASIC',
    isPremiumOnly: false,
    isNewUserOnly: false,
    targetCountries: ['IN'],
    xpReward: 10,
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
  },
};

async function main() {
  try {
    const parsed = await createTaskSchema.parseAsync(payload);
    console.log('VALIDATION_OK');
    console.log(JSON.stringify(parsed.body, null, 2));
  } catch (error: any) {
    console.log('VALIDATION_FAILED');
    console.log(JSON.stringify(error?.issues ?? error, null, 2));
    process.exit(1);
  }
}

main();
