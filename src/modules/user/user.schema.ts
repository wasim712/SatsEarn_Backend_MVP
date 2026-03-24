import z from "zod";

export const updateProfileSchema = z.object({
  body: z.object({
    fullName: z.string().min(2).optional(),
    twitterHandle: z.string().max(50).optional(),
    instagramHandle: z.string().max(50).optional(),
    telegramHandle: z.string().max(50).optional(),
    discordHandle: z.string().max(50).optional(),
  }),
});