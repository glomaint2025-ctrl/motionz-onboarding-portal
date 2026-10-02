import crypto from 'crypto';
import { UserRole } from '../db/schema';

export interface SessionPayload {
  userId: string;
  email: string;
  role: UserRole;
  tenantId?: string;
  issuedAt: number;
  expiresAt: number;
}

const DEV_FALLBACK_SECRET = 'motionz-dev-fallback-session-secret-at-least-32-chars';

/**
 * Session signing secret. Production refuses to sign or verify sessions without a real
 * SESSION_SECRET (at least 32 characters), so the public dev fallback can never be used there.
 * Resolved lazily so `next build` does not require the secret.
 */
export function getSessionSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (secret && secret.length >= 32) return secret;
  if (process.env.NODE_ENV === 'production') {
    throw new Error('SESSION_SECRET must be set to at least 32 characters in production.');
  }
  return DEV_FALLBACK_SECRET;
}
export const SESSION_COOKIE_NAME = 'motionz_session';

/**
 * Encodes and cryptographically signs a session payload using HMAC SHA-256.
 */
export const signSession = (payload: SessionPayload): string => {
  const json = JSON.stringify(payload);
  const base64Data = Buffer.from(json).toString('base64url');
  const signature = crypto
    .createHmac('sha256', getSessionSecret())
    .update(base64Data)
    .digest('base64url');
  return `${base64Data}.${signature}`;
};

/**
 * Verifies a signed session token. Returns the verified payload or null if tampered or expired.
 */
export const verifySession = (token: string): SessionPayload | null => {
  if (!token || typeof token !== 'string') return null;

  const parts = token.split('.');
  if (parts.length !== 2) return null;

  const [base64Data, signature] = parts;
  const expectedSignature = crypto
    .createHmac('sha256', getSessionSecret())
    .update(base64Data)
    .digest('base64url');

  const given = Buffer.from(signature);
  const expected = Buffer.from(expectedSignature);
  if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) {
    return null; // Tampered session token
  }

  try {
    const json = Buffer.from(base64Data, 'base64url').toString('utf-8');
    const payload: SessionPayload = JSON.parse(json);

    const now = Date.now();
    if (now > payload.expiresAt) {
      return null; // Expired session
    }

    return payload;
  } catch (err) {
    return null;
  }
};

/**
 * Creates a standard 7-day session token for an authenticated user.
 */
export const createSessionToken = (
  userId: string,
  email: string,
  role: UserRole,
  tenantId?: string,
  durationDays = 7
): string => {
  const now = Date.now();
  const expiresAt = now + durationDays * 24 * 60 * 60 * 1000;

  const payload: SessionPayload = {
    userId,
    email,
    role,
    tenantId,
    issuedAt: now,
    expiresAt,
  };

  return signSession(payload);
};
