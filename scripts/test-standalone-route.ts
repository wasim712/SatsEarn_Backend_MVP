import 'dotenv/config';

const API_BASE = 'http://localhost:8080/api';

async function main() {
  const adminPassword = process.env.ADMIN_PASSWORD;

  if (!adminPassword) {
    throw new Error('ADMIN_PASSWORD is required in .env');
  }

  const signinResponse = await fetch(`${API_BASE}/auth/signin`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'admin@satsearn.com',
      password: adminPassword,
    }),
  });

  const signinData = await signinResponse.json();
  console.log('SIGNIN_STATUS', signinResponse.status);
  console.log(JSON.stringify(signinData, null, 2));

  if (!signinResponse.ok) {
    throw new Error('Admin signin failed');
  }

  const token = signinData?.token || signinData?.session || signinData?.data?.token;
  if (!token) {
    throw new Error('No token returned from signin');
  }

  const payload = {
    title: 'Standalone route test',
    description: 'Checks standalone route validation against live backend.',
    category: 'SOCIAL',
    targetCountries: ['IN'],
    isPremiumOnly: false,
    isNewUserOnly: false,
    requiredFreeTier: 'BASIC',
    proofType: 'SCREENSHOT',
    requiredPlatform: 'NONE',
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
  };

  const response = await fetch(`${API_BASE}/admin/tasks/standalone`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });

  const data = await response.json();
  console.log('CREATE_STATUS', response.status);
  console.log(JSON.stringify(data, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
