import { createHash } from 'crypto';
import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

// SHA-256 of secrets that have been published (e.g. shipped in frontend JS) and must never be used again.
const PUBLISHED_SECRET_HASHES = new Set([
  '44e909e6c3d3aaae319443632c29e2a55a7989fde1faf3becda2842ac7df695c',
]);

function isUnsafeSecret(value: string) {
  const hash = createHash('sha256').update(value).digest('hex');
  return PUBLISHED_SECRET_HASHES.has(hash) || /^your[_-]/i.test(value) || /change[_-]?me/i.test(value);
}

const strongSecret = (name: string) =>
  z
    .string({ message: `${name} is required` })
    .min(32, { message: `${name} must be at least 32 characters long` })
    .refine((value) => !isUnsafeSecret(value), {
      message: `${name} is a placeholder or a published value. Generate a new random one.`,
    });

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
  JWT_SECRET: strongSecret('JWT_SECRET'),

  FIELD_ENCRYPTION_KEY: strongSecret('FIELD_ENCRYPTION_KEY'),

  // Old field-encryption keys (comma-separated), only needed until `npm run reencrypt:fields` has run.
  LEGACY_FIELD_ENCRYPTION_KEYS: z.string().optional(),

  // Request obfuscation only; this value is public in the frontend bundle, so it must not be a real secret.
  TRANSPORT_OBFUSCATION_KEY: z
    .string()
    .min(16, { message: "TRANSPORT_OBFUSCATION_KEY must be at least 16 characters long for request obfuscation" })
    .optional(),

  // Number of reverse proxies in front of the API (Render/Railway = 1). Defaults to 1 in production.
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(10).optional(),

  // Bearer token for GET /metrics. Without it, /metrics is disabled in production.
  METRICS_TOKEN: z.string().min(24, { message: "METRICS_TOKEN must be at least 24 characters long" }).optional(),

  // --- EXTERNAL SERVICES ---
  RESEND_API_KEY: z
    .string()
    .min(1, { message: "Resend API key is required for auth emails" }),
    
  // Optional: highly recommended to keep your sender email dynamically configured
  EMAIL_FROM: z
    .string()
    .default('SatsEarn <onboarding@resend.dev>'),

  REDIS_URL: z
    .string()
    .url({ message: "Must be a valid Redis URL" })
    .optional(),

  ENABLE_CRON: z
    .union([z.string(), z.boolean()])
    .optional()
    .transform((value) => value === true || value === 'true'),
});

export const env = envSchema
  .superRefine((value, ctx) => {
    if (value.FIELD_ENCRYPTION_KEY === value.JWT_SECRET) {
      ctx.addIssue({ code: 'custom', path: ['FIELD_ENCRYPTION_KEY'], message: 'FIELD_ENCRYPTION_KEY must differ from JWT_SECRET' });
    }
    if (value.TRANSPORT_OBFUSCATION_KEY
      && [value.JWT_SECRET, value.FIELD_ENCRYPTION_KEY].includes(value.TRANSPORT_OBFUSCATION_KEY)) {
      ctx.addIssue({ code: 'custom', path: ['TRANSPORT_OBFUSCATION_KEY'], message: 'TRANSPORT_OBFUSCATION_KEY is public and must not reuse a real secret' });
    }
  })
  .parse(process.env);
