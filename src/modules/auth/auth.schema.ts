import { z } from 'zod';

export const signUpSchema = z.object({
  body: z.object({
    email: z.string().email("Invalid email address"),
    password: z.string().min(8, "Password must be at least 8 characters"),
    fullName: z.string().min(2, "Full name is required"),
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
    token: z.string().length(8, "OTP must be exactly 6 digits"),
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
    token: z.string().length(8, "OTP must be exactly 6 digits"),
    newPassword: z.string().min(8, "Password must be at least 8 characters"),
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