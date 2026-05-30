import { CampaignDevice, FreeTier, PremiumTier, TaskCategory, TaskPlatform } from '@prisma/client';
import { z } from 'zod';

// --- CAMPAIGNS ---

export const createCampaignSchema = z.object({
  body: z.object({
    title: z.string(),
    description: z.string(),
    category: z.nativeEnum(TaskCategory),
    coverImageUrl: z.string().url().optional(),
    targetCountries: z.array(z.string()).optional(),
    isPremiumOnly: z.boolean().default(false),
    requiredFreeTier: z.nativeEnum(FreeTier).default('BASIC'),
    requiredPlatform: z.nativeEnum(CampaignDevice).default('NONE'),

    doubleRewardsStartAt: z.string().datetime().optional(),
    doubleRewardsEndAt: z.string().datetime().optional(),

    maxCompletions: z.number().int().positive()
  })
});

export const updateCampaignSchema = z.object({
  body: z.object({
    title: z.string().min(5, "Title must be at least 5 characters").optional(),
    description: z.string().min(10, "Description must be at least 10 characters").optional(),
    category: z.nativeEnum(TaskCategory).optional(),
    coverImageUrl: z.string().url().optional().nullable(),
    targetUrl: z.string().url().optional(),
    socialHandleTarget: z.string().optional(),
    targetCountries: z.array(z.string()).optional(),
    isActive: z.boolean().optional(),
    requiredPlatform: z.nativeEnum(CampaignDevice).optional(),
    maxCompletions: z.number().int().positive().optional(),

    // CAMPAIGN SETTINGS
    isPremiumOnly: z.boolean().optional(),
    requiredFreeTier: z.nativeEnum(FreeTier).optional(),
    doubleRewardsStartAt: z.string().datetime().optional().nullable(),
    doubleRewardsEndAt: z.string().datetime().optional().nullable(),
  }),
});

// --- TASKS ---


const ProofTypeEnum = z.enum(["SCREENSHOT", "URL", "TEXT_RESPONSE", "API_VERIFIED"]);
const PremiumTierEnum = z.nativeEnum(PremiumTier);
const TaskPlatformEnum = z.nativeEnum(TaskPlatform);

export const createTaskSchema = z.object({
  body: z.object({
    title: z.string().min(3),
    description: z.string().min(5),
    category: z.nativeEnum(TaskCategory).optional(),
    coverImageUrl: z.string().url().optional().or(z.literal('')),
    targetCountries: z.array(z.string()).optional(),
    isPremiumOnly: z.boolean().optional(),
    requiredFreeTier: z.nativeEnum(FreeTier).optional(),
    proofType: ProofTypeEnum.optional().default("SCREENSHOT"),
    targetUrl: z.string().url().optional().or(z.literal('')),
    requiredPlatform: TaskPlatformEnum.optional(),
    xpReward: z.number().int().min(0).optional(),
    xpRewardOverride: z.number().int().min(0).optional(),
    baseRewardSatsOverride: z.number().int().positive().optional(),
    tierRewardMatrix: z.record(z.string(), z.number()).optional(),
    tierRewardMatrixOverride: z.record(z.string(), z.number()).optional(),
    doubleRewardsStartAt: z.string().datetime().optional().nullable(),
    doubleRewardsEndAt: z.string().datetime().optional().nullable(),
  })
});

export const updateTaskSchema = z.object({
  body: z.object({
    title: z.string().min(3).optional(),
    description: z.string().min(5).optional(),
    category: z.nativeEnum(TaskCategory).optional(),
    coverImageUrl: z.string().url().optional().or(z.literal('')).nullable(),
    targetCountries: z.array(z.string()).optional(),
    isPremiumOnly: z.boolean().optional(),
    requiredFreeTier: z.nativeEnum(FreeTier).optional(),
    proofType: ProofTypeEnum.optional(),
    targetUrl: z.string().url().optional().or(z.literal('')),
    requiredPlatform: TaskPlatformEnum.optional(),
    xpReward: z.number().int().min(0).optional(),
    xpRewardOverride: z.number().int().min(0).optional(),
    baseRewardSatsOverride: z.number().int().positive().optional(),
    tierRewardMatrix: z.record(z.string(), z.number()).optional(),
    tierRewardMatrixOverride: z.record(z.string(), z.number()).optional(),
    doubleRewardsStartAt: z.string().datetime().optional().nullable(),
    doubleRewardsEndAt: z.string().datetime().optional().nullable(),
    isActive: z.boolean().optional()
  })
});
// --- ANNOUNCEMENTS ---
export const createAnnouncementSchema = z.object({
  body: z.object({
    title: z.string().min(3, "Title is too short"),
    content: z.string().min(10, "Content must be descriptive"),
    type: z.enum(['INFO', 'WARNING', 'SUCCESS', 'PROMOTION']).default('INFO'),
    isActive: z.boolean().default(true),
  }),
});

export const updateAnnouncementSchema = z.object({
  body: z.object({
    title: z.string().min(3).optional(),
    content: z.string().min(10).optional(),
    type: z.enum(['INFO', 'WARNING', 'SUCCESS', 'PROMOTION']).optional(),
    isActive: z.boolean().optional(),
  }),
});

export const createBlogPostSchema = z.object({
  body: z.object({
    title: z.string().min(5, 'Title must be at least 5 characters'),
    slug: z.string().min(3).regex(/^[a-z0-9-]+$/, 'Slug must use lowercase letters, numbers, and hyphens'),
    excerpt: z.string().max(500).optional().or(z.literal('')),
    content: z.string().min(20, 'Content must be at least 20 characters'),
    coverImageUrl: z.string().url().optional().or(z.literal('')),
    isPublished: z.boolean().default(false),
  }),
});

export const updateBlogPostSchema = z.object({
  params: z.object({
    id: z.string().uuid('Invalid blog post ID format'),
  }),
  body: z.object({
    title: z.string().min(5).optional(),
    slug: z.string().min(3).regex(/^[a-z0-9-]+$/).optional(),
    excerpt: z.string().max(500).optional().or(z.literal('')),
    content: z.string().min(20).optional(),
    coverImageUrl: z.string().url().optional().or(z.literal('')).nullable(),
    isPublished: z.boolean().optional(),
  }),
});

export const blogPostIdParamSchema = z.object({
  params: z.object({
    id: z.string().uuid('Invalid blog post ID format'),
  }),
});

export const createFaqItemSchema = z.object({
  body: z.object({
    question: z.string().min(5, 'Question must be at least 5 characters'),
    answer: z.string().min(10, 'Answer must be at least 10 characters'),
    category: z.string().max(100).optional().or(z.literal('')),
    sortOrder: z.number().int().min(0).default(0),
    isActive: z.boolean().default(true),
  }),
});

export const updateFaqItemSchema = z.object({
  params: z.object({
    id: z.string().uuid('Invalid FAQ item ID format'),
  }),
  body: z.object({
    question: z.string().min(5).optional(),
    answer: z.string().min(10).optional(),
    category: z.string().max(100).optional().or(z.literal('')),
    sortOrder: z.number().int().min(0).optional(),
    isActive: z.boolean().optional(),
  }),
});

export const faqItemIdParamSchema = z.object({
  params: z.object({
    id: z.string().uuid('Invalid FAQ item ID format'),
  }),
});

// --- DAILY QUIZ ---
const quizQuestionSchema = z.object({
  questionText: z.string().min(5, "Question must be at least 5 characters"),
  explanation: z.string().trim().optional().or(z.literal('')),
  options: z.array(z.string()).min(2, "Must provide at least 2 options").max(5, "Max 5 options allowed"),
  correctAnswer: z.string(),
  order: z.number().int().min(1)
}).refine((data) => data.options.includes(data.correctAnswer), {
  message: "The correctAnswer MUST be one of the provided options",
  path: ["correctAnswer"]
});

export const createDailyQuizSchema = z.object({
  body: z.object({
    date: z.string().refine((val) => !isNaN(Date.parse(val)), {
      message: "Invalid date format. Use YYYY-MM-DD",
    }),
    title: z.string().min(3),
    rewardSats: z.number().int().positive().default(10),
    xpReward: z.number().int().min(0).default(0),
    questions: z.array(quizQuestionSchema).min(1, "A quiz must have at least 1 question")
  })
});

export const quizIdParamSchema = z.object({
  params: z.object({
    id: z.string().uuid("Invalid Quiz ID format"),
  }),
});

export const updateDailyQuizSchema = z.object({
  params: z.object({
    id: z.string().uuid("Invalid Quiz ID format"),
  }),
  body: z.object({
    title: z.string().min(3).optional(),
    rewardSats: z.number().int().positive().optional(),
    xpReward: z.number().int().min(0).optional(),
    isActive: z.boolean().optional(),
  }).strict(),
});

export const updateCheatUserSchema = z.object({
  body: z.object({
    totalXp: z.number().int().min(0).optional(),
    balanceAvailable: z.number().int().min(0).optional(),
    balancePending: z.number().int().min(0).optional(),
    balanceLocked: z.number().int().min(0).optional(),
    currentStreak: z.number().int().min(0).optional(),
    lastClaimedStreakMilestone: z.number().int().min(0).optional(),
    premiumTier: PremiumTierEnum.nullable().optional(),
    premiumExpiresAt: z.string().datetime().nullable().optional(),
    isActive: z.boolean().optional(),
  }).strict(),
});

export const updateUserPremiumSchema = z.object({
  body: z.object({
    premiumTier: PremiumTierEnum.nullable(),
    premiumExpiresAt: z.string().datetime().nullable(),
  }).strict(),
});

export const adjustUserSubmissionRewardSchema = z.object({
  body: z.object({
    submissionId: z.string().uuid('Invalid submission ID format'),
    amountSats: z.number().int().refine((value) => value !== 0, 'Adjustment cannot be zero'),
    note: z.string().max(500).optional(),
  }).strict(),
});

export const updatePremiumRequestSchema = z.object({
  body: z.object({
    status: z.enum(['OPEN', 'CONTACTED', 'COMPLETED', 'CANCELLED']),
    adminNotes: z.string().max(1000).optional(),
  }).strict(),
});


export const updatePlatformSettingsSchema = z.object({
  body: z.object({
    welcomeBonusSats: z.number().int().min(0).optional(),
    minWithdrawalSats: z.number().int().min(0).optional(),
    securityLockDays: z.number().int().min(0).optional(),
    referralBonusPercent: z.number().int().min(0).optional(),
    baseXpPerTask: z.number().int().min(0).optional(),
    dailyStreakBonusXp: z.number().int().min(0).optional(),
    tierReferralMatrix: z.record(z.string(), z.number()).optional(),
    tierMinWithdrawalMatrix: z.record(z.string(), z.number()).optional(),
    premiumMonthlySatsMatrix: z.record(z.string(), z.number()).optional(),
    premiumYearlySatsMatrix: z.record(z.string(), z.number()).optional(),
    premiumMonthlyUsdMatrix: z.record(z.string(), z.number()).optional(),
    premiumYearlyUsdMatrix: z.record(z.string(), z.number()).optional(),
    btcPriceUsd: z.number().min(0).optional(),
    userSidebarConfig: z.object({
      dashboard: z.boolean().optional(),
      tasks: z.boolean().optional(),
      standaloneTasks: z.boolean().optional(),
      minigames: z.boolean().optional(),
      bugBounty: z.boolean().optional(),
      quiz: z.boolean().optional(),
      referrals: z.boolean().optional(),
      rewards: z.boolean().optional(),
      leaderboard: z.boolean().optional(),
      wallet: z.boolean().optional(),
      settings: z.boolean().optional(),
      help: z.boolean().optional(),
      notifications: z.boolean().optional(),
      profile: z.boolean().optional(),
    }).optional(),
  }),
});

