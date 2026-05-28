import z from "zod";

export const updateProfileSchema = z.object({
  body: z.object({
    fullName: z.string().min(2).optional(),
    twitterHandle: z.string().max(50).optional(),
    instagramHandle: z.string().max(50).optional(),
    phone: z.string().max(10).optional(),
    telegramHandle: z.string().max(50).optional(),
    discordHandle: z.string().max(50).optional(),
  }),
});

export const changePasswordSchema = z.object({
  newPassword: z.string()
    .min(8, "Password must be at least 8 characters long")
    .regex(/[a-zA-Z]/, "Password must contain at least one letter")
    .regex(/[0-9]/, "Password must contain at least one number")
    .regex(/[\W_]/, "Password must contain at least one special character"),
});

export const startTaskParamSchema = z.object({
  params: {
    taskId: z.string().uuid("Invalid Task ID format. Must be a valid UUID."),
  },
});

export const submitQuizSchema = z.object({
  params: z.object({
    taskId: z.string().uuid(),
  }),
  body: z.object({
    answers: z.array(z.string()).min(1, "At least one answer is required"),
  }),
});

export const submitDailyQuizAnswerSchema = z.object({
  body: z.object({
    questionId: z.string().uuid("Invalid Question ID format"),
    answer: z.string().min(1, "Answer cannot be empty"),
  }),
});

export const submitDailyQuizSchema = z.object({
  body: z.object({
    answers: z.array(
      z.object({
        questionId: z.string().uuid("Invalid Question ID format"),
        answer: z.string().min(1, "Answer cannot be empty"),
        attemptCount: z.number().int("Attempt count must be a whole number").min(1, "Attempt count must be at least 1"),
      }),
    ).min(1, "You must submit at least one answer"),
  }),
});

export const requestWithdrawalSchema = z.object({
  body: z.object({
    amountSats: z.number().int("Amount must be a whole number").positive("Amount must be greater than 0"),
    lightningInvoice: z.string()
      .min(10, "Invoice is too short")
      .refine((val) => val.toLowerCase().startsWith('lnbc') || val.toLowerCase().startsWith('lntb'), {
        message: "Invoice must be a valid Lightning Network invoice starting with 'lnbc' or 'lntb'.",
      }),
  }),
});

export const submitBugReportSchema = z.object({
  body: z.object({
    title: z.string().min(5).max(120),
    description: z.string().min(20).max(5000),
  }),
});

export const premiumInterestSchema = z.object({
  body: z.object({
    plan: z.enum(['PLATINUM', 'DIAMOND', 'CROWN', 'ELITE', 'FOUNDER']),
    intent: z.enum(['NOTIFY_ME', 'UPGRADE']),
    source: z.string().min(2).max(100).optional(),
  }),
});

export const premiumSatsUpgradeSchema = z.object({
  body: z.object({
    plan: z.enum(['PLATINUM', 'DIAMOND', 'CROWN', 'ELITE', 'FOUNDER']),
    billingCycle: z.enum(['MONTHLY', 'YEARLY']),
  }),
});

export const claimSatWormRewardSchema = z.object({
  body: z.object({
    score: z.number().int().min(0).max(5000),
    satsEarned: z.number().int().min(0).max(500),
    xpEarned: z.number().int().min(0).max(500),
    foodEaten: z.number().int().min(0).max(5000).optional(),
    elapsed: z.number().int().min(0).max(1000 * 60 * 30).optional(),
    restartCount: z.number().int().min(0).max(100).optional(),
    violationCount: z.number().int().min(0).max(100).optional(),
    reviveUsed: z.boolean().optional(),
    bestScore: z.number().int().min(0).max(5000).optional(),
  }),
});
