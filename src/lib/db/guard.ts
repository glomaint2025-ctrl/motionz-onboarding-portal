/**
 * Database Runtime Guard & Environment Isolation Manager
 * Enforces strict production rules:
 * - In PRODUCTION: Live Supabase connection is mandatory. Any attempt to fall back
 *   to mock-db or serve simulated data throws a critical DatabaseError immediately.
 * - In DEVELOPMENT / TEST: Controlled fallback to mock-db is permitted when Supabase
 *   credentials are unconfigured or offline.
 */

import { DatabaseError } from '../errors';
import { isSupabaseConfigured, getSupabaseServiceClient } from './supabase-client';

export type RuntimeEnvironment = 'production' | 'development' | 'test';

export function getRuntimeEnvironment(): RuntimeEnvironment {
  const env = process.env.NODE_ENV;
  if (env === 'production') return 'production';
  if (env === 'test') return 'test';
  return 'development';
}

export function isProduction(): boolean {
  return getRuntimeEnvironment() === 'production';
}

/**
 * Asserts that the database connection is valid for production execution.
 * Throws a fatal DatabaseError if production is missing database configuration
 * or attempts to access mock data.
 */
export function assertProductionDatabase(): void {
  if (isProduction()) {
    if (!isSupabaseConfigured() || !getSupabaseServiceClient()) {
      throw new DatabaseError(
        'CRITICAL DATABASE FAULT: Production environment requires a valid Supabase connection (NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY). Mock database fallback is strictly prohibited in production.'
      );
    }
  }
}

/**
 * Validates whether mock datastore access is permitted in current runtime.
 */
export function isMockFallbackAllowed(): boolean {
  return !isProduction();
}
