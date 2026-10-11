import { z } from 'zod';

// Shared rules for any password a signed-in user or a reset sets.
export const strongPasswordSchema = z.string()
  .min(8, "Password must be at least 8 characters long")
  .max(128, "Password must be at most 128 characters long")
  .regex(/[a-zA-Z]/, "Password must contain at least one letter")
  .regex(/[0-9]/, "Password must contain at least one number")
  .regex(/[\W_]/, "Password must contain at least one special character");

export const signUpSchema = z.object({
  body: z.object({
    email: z.string().email("Invalid email address"),
    password: z.string().min(8, "Password must be at least 8 characters"),
    fullName: z.string().min(2, "Full name is required"),
    username: z
      .string()
      .min(3, "Username must be at least 3 characters")
      .max(10, "Username cannot be greater than 10 characters"),
    country: z.string().min(2, "Country is required"),
    dateOfBirth: z.string().refine((date) => !isNaN(Date.parse(date)), {
      message: "Invalid date format (use YYYY-MM-DD)",
    }),
    referralCode: z.string().optional(),
  }),
});

export const verifyOtpSchema = z.object({
  body: z.object({
    email: z.string().email(),
    token: z.string().length(6, "OTP must be exactly 6 digits"),
    // The password chosen at signup; binds activation to whoever set it (see AuthService.verifyOtp).
    password: z.string().min(1, "Password is required"),
  }),
});

export const signInSchema = z.object({
  body: z.object({
    email: z.string().email(),
    password: z.string(),
  }),
});
// Add these to the bottom of auth.schema.ts
export const requestPasswordResetSchema = z.object({
  body: z.object({
    email: z.string().email(),
  }),
});

export const resetPasswordSchema = z.object({
  body: z.object({
    email: z.string().email(),
    token: z.string().length(6, "OTP must be exactly 6 digits"),
    newPassword: strongPasswordSchema,
  }),
});
export const checkUsername = z.object({
  query: z.object({
    username: z
      .string()
      .min(3, "Username too short")
      .max(10, "Username cannot be greater than 10 characters"),
  }),
});
