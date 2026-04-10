import { z } from 'zod';

// Matching the enums from your Prisma Schema
const TaskCategoryEnum = z.enum(['SOCIAL', 'SURVEY', 'VIDEO_AD', 'APP_INSTALL', 'OFFERWALL', 'LEARN_EARN', 'DAILY_STREAK']);
const TierEnum = z.enum(['BASIC', 'BRONZE', 'SILVER', 'GOLD']);

export const createCampaignSchema = z.object({
  body: z.object({
    title: z.string().min(5, "Title must be at least 5 characters"),
    description: z.string().min(10, "Description must be at least 10 characters"),
    category: TaskCategoryEnum,
    
    // Optional targeting fields depending on the task
    targetUrl: z.string().url().optional(),
    socialHandleTarget: z.string().optional(),
    
    // Economics
    rewardSats: z.number().int().positive("Reward must be a positive integer"),
    maxCompletions: z.number().int().positive("Max completions must be a positive integer"),
    
    // Restrictions
    targetCountries: z.array(z.string()).default([]), // Empty array means global
    requiredTier: TierEnum.default('BASIC'),
  }),
});
// Add this below your createCampaignSchema
export const updateCampaignSchema = z.object({
  body: z.object({
    title: z.string().min(5, "Title must be at least 5 characters").optional(),
    description: z.string().min(10, "Description must be at least 10 characters").optional(),
    category: z.enum(['SOCIAL', 'SURVEY', 'VIDEO_AD', 'APP_INSTALL', 'OFFERWALL', 'LEARN_EARN', 'DAILY_STREAK']).optional(),
    targetUrl: z.string().url().optional(),
    socialHandleTarget: z.string().optional(),
    rewardSats: z.number().int().positive().optional(),
    maxCompletions: z.number().int().positive().optional(),
    targetCountries: z.array(z.string()).optional(),
    requiredTier: z.enum(['BASIC', 'BRONZE', 'SILVER', 'GOLD']).optional(),
    isActive: z.boolean().optional(), // Allows admin to pause the campaign
  }),
});
export const createTaskSchema = z.object({
  body: z.object({
    title: z.string().min(3, "Task title is required").optional(),
    description: z.string().optional(),
    targetUrl: z.string().url().optional(),
    rewardSatsOverride: z.number().int().positive().optional(), // In case one task pays more than others in the same campaign
  }),
});
// Add this below createTaskSchema
export const updateTaskSchema = z.object({
  body: z.object({
    title: z.string().min(3, "Task title must be at least 3 characters").optional(),
    description: z.string().optional(),
    targetUrl: z.string().url("Must be a valid URL").optional(),
    rewardSatsOverride: z.number().int().positive().optional(),
  }),
});
// Announcements
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

const quizQuestionSchema = z.object({
  questionText: z.string().min(5, "Question must be at least 5 characters"),
  options: z.array(z.string()).min(2, "Must provide at least 2 options").max(5, "Max 5 options allowed"),
  correctAnswer: z.string(),
  order: z.number().int().min(1)
}).refine((data) => data.options.includes(data.correctAnswer), {
  message: "The correctAnswer MUST be one of the provided options",
  path: ["correctAnswer"] // Points the error exactly to the wrong field
});

export const createDailyQuizSchema = z.object({
  body: z.object({
    date: z.string().refine((val) => !isNaN(Date.parse(val)), {
      message: "Invalid date format. Use YYYY-MM-DD",
    }),
    title: z.string().min(3),
    rewardSats: z.number().int().positive().default(10),
    questions: z.array(quizQuestionSchema).min(1, "A quiz must have at least 1 question")
  })
});
// Validates the UUID in the URL for GetOne, Update, and Delete
export const quizIdParamSchema = z.object({
  params: z.object({
    id: z.string().uuid("Invalid Quiz ID format"),
  }),
});

// Validates the body for the Update route
export const updateDailyQuizSchema = z.object({
  params: z.object({
    id: z.string().uuid("Invalid Quiz ID format"),
  }),
  body: z.object({
    title: z.string().min(3).optional(),
    rewardSats: z.number().int().positive().optional(),
    isActive: z.boolean().optional(),
  }).strict(),
});