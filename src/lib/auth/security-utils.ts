import { globalRateLimiter, RateLimitConfig } from '../security/rate-limiter';
import { getSupabaseServiceClient } from '../db/supabase-client';

/**
 * Validates and sanitizes redirect destinations to prevent open redirect vulnerabilities.
 * Strictly permits only relative internal application paths (e.g., '/portal/abc', '/admin').
 * Rejects protocol-relative URLs (e.g. '//attacker.com'), scheme prefixes ('https://', 'javascript:'),
 * and malformed paths.
 */
export function sanitizeRedirectUrl(
  target: string | null | undefined,
  fallback = '/auth/login'
): string {
  if (!target || typeof target !== 'string') {
    return fallback;
  }

  const trimmed = target.trim();

  // Must begin with a single slash '/' and not '//' or '/\'
  if (!trimmed.startsWith('/') || trimmed.startsWith('//') || trimmed.startsWith('/\\')) {
    return fallback;
  }

  // Reject embedded protocol delimiters or dangerous schemes
  if (
    trimmed.includes(':') ||
    trimmed.toLowerCase().includes('javascript:') ||
    trimmed.toLowerCase().includes('data:') ||
    trimmed.toLowerCase().includes('vbscript:')
  ) {
    return fallback;
  }

  // Reject backslashes which browsers may normalize into domain transitions
  if (trimmed.includes('\\')) {
    return fallback;
  }

  return trimmed;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetMs: number;
}

const DEFAULT_MAX_REQUESTS = 60;
const DEFAULT_WINDOW_MS = 60 * 1000;

let persistentLimiterFailureLogged = false;

/**
 * Enforces rate limiting on sensitive authentication and invitation endpoints.
 *
 * When Supabase is configured, a persistent fixed-window counter in Postgres
 * (increment_rate_limit RPC) is shared by every serverless instance. If that RPC
 * fails (e.g. migration not applied), we fall back to the per-instance in-memory
 * limiter rather than blocking requests. Without Supabase (tests/local), the
 * in-memory limiter is used directly.
 */
export async function enforceRateLimit(
  key: string,
  config?: Partial<RateLimitConfig>
): Promise<RateLimitResult> {
  const supabase = getSupabaseServiceClient();
  if (!supabase) {
    return globalRateLimiter.isAllowed(key, config);
  }

  const maxRequests = config?.maxRequests ?? DEFAULT_MAX_REQUESTS;
  const windowMs = config?.windowMs ?? DEFAULT_WINDOW_MS;
  const windowSeconds = Math.max(1, Math.ceil(windowMs / 1000));

  try {
    const { data, error } = await supabase.rpc('increment_rate_limit', {
      p_key: key,
      p_window_seconds: windowSeconds,
    });
    if (error) throw error;

    const count = typeof data === 'number' ? data : Number(data);
    if (!Number.isFinite(count)) {
      throw new Error(`Unexpected increment_rate_limit result: ${JSON.stringify(data)}`);
    }

    const windowLengthMs = windowSeconds * 1000;
    const now = Date.now();
    const resetMs = Math.floor(now / windowLengthMs) * windowLengthMs + windowLengthMs - now;

    return {
      allowed: count <= maxRequests,
      remaining: Math.max(0, maxRequests - count),
      resetMs: Math.max(0, resetMs),
    };
  } catch (err) {
    if (!persistentLimiterFailureLogged) {
      persistentLimiterFailureLogged = true;
      console.error(
        '[rate-limit] Persistent rate limiter unavailable; falling back to in-memory limiter:',
        err instanceof Error ? err.message : err
      );
    }
    return globalRateLimiter.isAllowed(key, config);
  }
}

/**
 * Resolves the client IP for rate limiting. Prefers `x-real-ip` (set by Vercel's edge),
 * then the FIRST entry of `x-forwarded-for`, else 'unknown'.
 */
export function getClientIp(request: Request | { headers: Headers }): string {
  const headers = request.headers;
  const realIp = headers.get('x-real-ip')?.trim();
  if (realIp) return realIp;

  const forwarded = headers.get('x-forwarded-for');
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim();
    if (first) return first;
  }

  return 'unknown';
}

/**
 * Resolves the canonical base URL for the current environment dynamically.
 * Prioritizes the incoming request headers (x-forwarded-host / host) so generated
 * links always match the exact domain the user is browsing on (local, preview, or production).
 */
export function resolveBaseUrl(
  request?: Request | any,
  explicitUrl?: string
): string {
  // 1. Explicit override passed in
  if (explicitUrl && typeof explicitUrl === 'string' && explicitUrl.trim()) {
    return explicitUrl.trim().replace(/\/$/, '');
  }

  // 2. In production, emailed links must use the configured origin, never a client-supplied Host header
  const configuredUrl = process.env.NEXTAUTH_URL || process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL;
  if (process.env.NODE_ENV === 'production' && configuredUrl) {
    return configuredUrl.trim().replace(/\/$/, '');
  }

  // 3. Resolve from incoming HTTP request (matches the domain the user is browsing locally/in previews)
  if (request) {
    try {
      const headers = request.headers;
      const forwardedHost = typeof headers?.get === 'function' ? headers.get('x-forwarded-host') : undefined;
      const host = forwardedHost || (typeof headers?.get === 'function' ? headers.get('host') : undefined);

      if (host) {
        const forwardedProto = typeof headers?.get === 'function' ? headers.get('x-forwarded-proto') : undefined;
        const isLocal = host.includes('localhost') || host.includes('127.0.0.1');
        const proto = forwardedProto || (isLocal ? 'http' : 'https');
        return `${proto}://${host}`.replace(/\/$/, '');
      }

      if ('nextUrl' in request && request.nextUrl?.origin) {
        return request.nextUrl.origin.replace(/\/$/, '');
      }
    } catch {
      // Fall through to environment variables
    }
  }

  // 3. Environment variables in order of specificity
  if (process.env.NEXTAUTH_URL) {
    return process.env.NEXTAUTH_URL.replace(/\/$/, '');
  }
  if (process.env.APP_URL) {
    return process.env.APP_URL.replace(/\/$/, '');
  }
  if (process.env.NEXT_PUBLIC_APP_URL) {
    return process.env.NEXT_PUBLIC_APP_URL.replace(/\/$/, '');
  }

  // 4. Vercel project canonical production URL (e.g. motionz-onboarding-portal.vercel.app)
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`.replace(/\/$/, '');
  }

  // 5. Vercel unique deployment URL (e.g. preview deployment branch)
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`.replace(/\/$/, '');
  }

  // 6. Local development default
  return 'http://localhost:3000';
}
