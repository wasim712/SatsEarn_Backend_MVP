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
export const changePasswordSchema = z.object({
  newPassword: z.string()
    .min(8, "Password must be at least 8 characters long")
    .regex(/[a-zA-Z]/, "Password must contain at least one letter")
    .regex(/[0-9]/, "Password must contain at least one number")
    .regex(/[\W_]/, "Password must contain at least one special character"),
});
export const startTaskParamSchema = z.object({
  params : {
  taskId: z.string().uuid("Invalid Task ID format. Must be a valid UUID."),
}
});

export const submitQuizSchema = z.object({
  params: z.object({
    taskId: z.string().uuid(),
  }),
  body: z.object({
    answers: z.array(z.string()).min(1, "At least one answer is required"),
  }),
})
export const submitDailyQuizSchema = z.object({
  body: z.object({
    answers: z.array(
      z.object({
        questionId: z.string().uuid("Invalid Question ID format"),
        answer: z.string().min(1, "Answer cannot be empty"),
      })
    ).min(1, "You must submit at least one answer"),
  }),
});