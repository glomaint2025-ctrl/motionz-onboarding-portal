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

const SESSION_SECRET = process.env.SESSION_SECRET || 'motionz-dev-fallback-session-secret-at-least-32-chars';
export const SESSION_COOKIE_NAME = 'motionz_session';

/**
 * Encodes and cryptographically signs a session payload using HMAC SHA-256.
 */
export const signSession = (payload: SessionPayload): string => {
  const json = JSON.stringify(payload);
  const base64Data = Buffer.from(json).toString('base64url');
  const signature = crypto
    .createHmac('sha256', SESSION_SECRET)
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
    .createHmac('sha256', SESSION_SECRET)
    .update(base64Data)
    .digest('base64url');

  if (signature !== expectedSignature) {
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
