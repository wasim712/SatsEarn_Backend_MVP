import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

const envSchema = z.object({
  PORT: z.string().default('8080'),

  NODE_ENV: z
    .enum(['development', 'production', 'test'])
    .default('development'),

  // --- NEON DATABASE ---
  DATABASE_URL: z
    .string()
    .url({ message: "DATABASE_URL must be a valid connection string" }),
    
  // DIRECT_URL: z
  //   .string()
  //   .url({ message: "DIRECT_URL must be a valid connection string for migrations" }),

  // --- CUSTOM AUTHENTICATION ---
  JWT_SECRET: z
    .string()
    .min(16, { message: "JWT_SECRET must be at least 16 characters long for security" }),

  FIELD_ENCRYPTION_KEY: z
    .string()
    .min(16, { message: "FIELD_ENCRYPTION_KEY must be at least 16 characters long for security" })
    .optional(),

  TRANSPORT_OBFUSCATION_KEY: z
    .string()
    .min(16, { message: "TRANSPORT_OBFUSCATION_KEY must be at least 16 characters long for request obfuscation" })
    .optional(),

  // --- EXTERNAL SERVICES ---
  RESEND_API_KEY: z
    .string()
    .min(1, { message: "Resend API key is required for auth emails" }),
    
  // Optional: highly recommended to keep your sender email dynamically configured
  EMAIL_FROM: z
    .string()
    .default('Sats Earn <onboarding@resend.dev>'),

  REDIS_URL: z
    .string()
    .url({ message: "Must be a valid Redis URL" })
    .optional(),
});

export const env = envSchema.parse(process.env);
