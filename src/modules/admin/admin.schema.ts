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