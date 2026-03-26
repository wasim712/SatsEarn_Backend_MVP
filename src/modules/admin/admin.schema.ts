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