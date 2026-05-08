import { CampaignDevice, FreeTier, TaskCategory } from '@prisma/client';
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
    
    baseRewardSats: z.number().int().positive(),
    xpReward: z.number().int().min(0).default(0),
    doubleRewardsStartAt: z.string().datetime().optional(),
    doubleRewardsEndAt: z.string().datetime().optional(),

    tierRewardMatrix: z.object({
      BASIC: z.number().int(),
      COPPER: z.number().int(),
      BRONZE: z.number().int(),
      SILVER: z.number().int(),
      GOLD: z.number().int(),
      PLATINUM: z.number().int(),
      DIAMOND: z.number().int(),
      CROWN: z.number().int(),
      ELITE: z.number().int(),
      FOUNDER: z.number().int(),
    }),
    
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
    maxCompletions: z.number().int().positive().optional(),
    targetCountries: z.array(z.string()).optional(),
    isActive: z.boolean().optional(),
    requiredPlatform: z.nativeEnum(CampaignDevice).optional(),
    
    // NEW ECONOMICS
    isPremiumOnly: z.boolean().optional(),
    requiredFreeTier: z.nativeEnum(FreeTier).optional(),
    baseRewardSats: z.number().int().positive().optional(),
    xpReward: z.number().int().min(0).optional(),
    doubleRewardsStartAt: z.string().datetime().optional().nullable(),
    doubleRewardsEndAt: z.string().datetime().optional().nullable(),
    tierRewardMatrix: z.object({
      BASIC: z.number().int(),
      COPPER: z.number().int(),
      BRONZE: z.number().int(),
      SILVER: z.number().int(),
      GOLD: z.number().int(),
      PLATINUM: z.number().int(),
      DIAMOND: z.number().int(),
      CROWN: z.number().int(),
      ELITE: z.number().int(),
      FOUNDER: z.number().int(),
    }).optional(),
  }),
});

// --- TASKS ---


const ProofTypeEnum = z.enum(["SCREENSHOT", "URL", "TEXT_RESPONSE", "API_VERIFIED"]);

export const createTaskSchema = z.object({
  body: z.object({
    title: z.string().min(3),
    description: z.string().min(5),
    proofType: ProofTypeEnum.optional().default("SCREENSHOT"),
    targetUrl: z.string().url().optional().or(z.literal('')),
    requiredPlatform: z.string().optional(),
    baseRewardSatsOverride: z.number().int().positive().optional(),
    xpRewardOverride: z.number().int().min(0).optional(),
    tierRewardMatrixOverride: z.record(z.string(), z.number()).optional()
  })
});

export const updateTaskSchema = z.object({
  body: z.object({
    title: z.string().min(3).optional(),
    description: z.string().min(5).optional(),
    
    // 🚀 NEW: Add it to the update schema too!
    proofType: ProofTypeEnum.optional(),

    targetUrl: z.string().url().optional().or(z.literal('')),
    requiredPlatform: z.string().optional(),
    baseRewardSatsOverride: z.number().int().positive().optional(),
    xpRewardOverride: z.number().int().min(0).optional(),
tierRewardMatrixOverride: z.record(z.string(), z.number()).optional()
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

// --- DAILY QUIZ ---
const quizQuestionSchema = z.object({
  questionText: z.string().min(5, "Question must be at least 5 characters"),
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
