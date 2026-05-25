export type UserProfileUpdateInput = {
  fullName?: string;
  phone?: string;
  twitterHandle?: string;
  instagramHandle?: string;
  telegramHandle?: string;
  discordHandle?: string;
};

export type TaskProofInput = {
  screenshotUrl?: string;
  proofText?: string;
};

export type PremiumInterestInput = {
  plan: 'PLATINUM' | 'DIAMOND' | 'CROWN' | 'ELITE' | 'FOUNDER';
  intent: 'NOTIFY_ME' | 'UPGRADE';
  source?: string;
};

export type PremiumSatsUpgradeInput = {
  plan: 'PLATINUM' | 'DIAMOND' | 'CROWN' | 'ELITE' | 'FOUNDER';
  billingCycle: 'MONTHLY' | 'YEARLY';
};
