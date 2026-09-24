/**
 * Environment Variable Validation & Configuration Manager
 * Strict schema verification ensuring all runtime secrets and connection strings
 * are validated prior to execution.
 */

export interface EnvConfig {
  NODE_ENV: 'development' | 'production' | 'test';
  DATABASE_URL?: string;
  NEXT_PUBLIC_SUPABASE_URL?: string;
  NEXT_PUBLIC_SUPABASE_ANON_KEY?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
  SESSION_SECRET: string;
  NEXTAUTH_URL: string;
  GHL_API_BASE_URL: string;
  GOOGLE_SERVICE_ACCOUNT_EMAIL?: string;
  GOOGLE_PRIVATE_KEY?: string;
  SLACK_WEBHOOK_URL?: string;
}

export interface EnvValidationResult {
  valid: boolean;
  errors: string[];
  config: EnvConfig;
}

export function validateEnv(env: Record<string, string | undefined> = process.env): EnvValidationResult {
  const errors: string[] = [];

  const nodeEnv = (env.NODE_ENV || 'development') as EnvConfig['NODE_ENV'];
  if (!['development', 'production', 'test'].includes(nodeEnv)) {
    errors.push(`Invalid NODE_ENV "${nodeEnv}". Must be 'development', 'production', or 'test'.`);
  }

  const sessionSecret = env.SESSION_SECRET || 'motionz-default-dev-secret-key-at-least-32-chars-long';
  if (nodeEnv === 'production' && !env.VERCEL) {
    if (!env.SESSION_SECRET) {
      errors.push('SESSION_SECRET is required in production.');
    } else if (env.SESSION_SECRET.length < 32) {
      errors.push('SESSION_SECRET must be at least 32 characters long for production security.');
    }
  }

  const nextAuthUrl = env.NEXTAUTH_URL || 'http://localhost:3000';
  try {
    new URL(nextAuthUrl);
  } catch {
    errors.push(`NEXTAUTH_URL "${nextAuthUrl}" is not a valid URL.`);
  }

  const ghlBaseUrl = env.GHL_API_BASE_URL || 'https://services.leadconnectorhq.com';
  try {
    new URL(ghlBaseUrl);
  } catch {
    errors.push(`GHL_API_BASE_URL "${ghlBaseUrl}" is not a valid URL.`);
  }

  if (env.NEXT_PUBLIC_SUPABASE_URL) {
    try {
      new URL(env.NEXT_PUBLIC_SUPABASE_URL);
    } catch {
      errors.push(`NEXT_PUBLIC_SUPABASE_URL "${env.NEXT_PUBLIC_SUPABASE_URL}" is not a valid URL.`);
    }
  }

  // If using Supabase in production, service role key is mandatory
  if (nodeEnv === 'production' && !env.VERCEL && env.NEXT_PUBLIC_SUPABASE_URL && !env.SUPABASE_ROLE_KEY && !env.SUPABASE_SERVICE_ROLE_KEY) {
    errors.push('SUPABASE_SERVICE_ROLE_KEY is required when NEXT_PUBLIC_SUPABASE_URL is configured in production.');
  }

  const config: EnvConfig = {
    NODE_ENV: nodeEnv,
    DATABASE_URL: env.DATABASE_URL,
    NEXT_PUBLIC_SUPABASE_URL: env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY: env.SUPABASE_SERVICE_ROLE_KEY,
    SESSION_SECRET: sessionSecret,
    NEXTAUTH_URL: nextAuthUrl,
    GHL_API_BASE_URL: ghlBaseUrl,
    GOOGLE_SERVICE_ACCOUNT_EMAIL: env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    GOOGLE_PRIVATE_KEY: env.GOOGLE_PRIVATE_KEY,
    SLACK_WEBHOOK_URL: env.SLACK_WEBHOOK_URL,
  };

  return {
    valid: errors.length === 0,
    errors,
    config,
  };
}

let cachedConfig: EnvConfig | null = null;

export function getEnv(): EnvConfig {
  if (cachedConfig) {
    return cachedConfig;
  }

  const result = validateEnv();
  if (!result.valid && process.env.NODE_ENV === 'production' && !process.env.VERCEL) {
    throw new Error(`Environment validation failed:\n${result.errors.map(e => ` - ${e}`).join('\n')}`);
  }

  cachedConfig = result.config;
  return cachedConfig;
}

/**
 * Returns safe diagnostic environment configuration without leaking secret keys.
 */
export function getSanitizedEnv(): Record<string, string | boolean> {
  const env = getEnv();
  return {
    NODE_ENV: env.NODE_ENV,
    HAS_DATABASE_URL: Boolean(env.DATABASE_URL),
    HAS_SUPABASE_URL: Boolean(env.NEXT_PUBLIC_SUPABASE_URL),
    HAS_SUPABASE_ANON: Boolean(env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
    HAS_SUPABASE_SERVICE_KEY: Boolean(env.SUPABASE_SERVICE_ROLE_KEY),
    HAS_SESSION_SECRET: Boolean(env.SESSION_SECRET && env.SESSION_SECRET.length >= 32),
    NEXTAUTH_URL: env.NEXTAUTH_URL,
    GHL_API_BASE_URL: env.GHL_API_BASE_URL,
    HAS_GOOGLE_CREDS: Boolean(env.GOOGLE_SERVICE_ACCOUNT_EMAIL && env.GOOGLE_PRIVATE_KEY),
    HAS_SLACK_WEBHOOK: Boolean(env.SLACK_WEBHOOK_URL),
  };
}
