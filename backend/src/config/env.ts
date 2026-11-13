import { z } from 'zod';

export const envSchema = z.object({
  USERS_TABLE: z.string().min(1, 'USERS_TABLE is required'),
  EVENTS_TABLE: z.string().min(1, 'EVENTS_TABLE is required'),
  EVENT_STAFF_TABLE: z.string().min(1, 'EVENT_STAFF_TABLE is required'),
  RSVPS_TABLE: z.string().min(1, 'RSVPS_TABLE is required'),
  WAITLIST_TABLE: z.string().min(1, 'WAITLIST_TABLE is required'),
  TICKETS_TABLE: z.string().min(1, 'TICKETS_TABLE is required'),
  S3_BUCKET: z.string().min(1, 'S3_BUCKET is required'),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  JWT_EXPIRES_IN: z.string().default('24h'),
  // Optional: once removed or empty, the application continues normal operation
  BOOTSTRAP_SECRET: z
    .preprocess(
      (val) => (typeof val === 'string' && val.trim() === '' ? undefined : val),
      z.string().min(16, 'BOOTSTRAP_SECRET must be at least 16 characters').optional()
    ),
  AWS_REGION: z.string().default('us-east-1'),
  CORS_ALLOWED_ORIGINS: z.string().default('http://localhost:5173,http://localhost:3000'),
});

export type EnvConfig = z.infer<typeof envSchema>;

let parsedEnv: EnvConfig | null = null;

export function getEnv(override?: Record<string, string | undefined>): EnvConfig {
  if (override) {
    parsedEnv = envSchema.parse(override);
    return parsedEnv;
  }
  if (!parsedEnv) {
    parsedEnv = envSchema.parse(process.env);
  }
  return parsedEnv;
}

export function resetEnvCache(): void {
  parsedEnv = null;
}
