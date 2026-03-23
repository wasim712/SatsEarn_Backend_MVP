import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

const envSchema = z.object({
  PORT: z.string().default('8080'),

  NODE_ENV: z
    .enum(['development', 'production', 'test'])
    .default('development'),

  // Database (optional for now)
  DATABASE_URL: z
    .string()
    .url({ message: "Database URL must be a valid URL" })
    .optional(),

  SUPABASE_URL: z
    .string()
    .url({ message: "Must be a valid Supabase URL" }),

  SUPABASE_SERVICE_ROLE_KEY: z
    .string()
    .min(1, { message: "Service Role Key is required" }),

  REDIS_URL: z
    .string()
    .url({ message: "Must be a valid Redis URL" })
    .optional(),

  RESEND_API_KEY: z
    .string()
    .min(1, { message: "Resend API key is required" })
    .optional(),
});

export const env = envSchema.parse(process.env);