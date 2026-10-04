import crypto from 'crypto';
import { getSessionSecret } from './session';
import { sanitizeRedirectUrl } from './security-utils';
import { sendEmail, canExposeDevLinks, staffLoginCodeEmail } from '../email';
import type { StaffLoginCodeMode } from '../db/repositories/app-settings.repository';

/**
 * Emailed one-time sign-in code for staff (second step after the password).
 *
 * Stateless by design (no DB table, works on serverless): the pending sign-in lives in a
 * signed, httpOnly cookie. The cookie never contains the code, only a keyed hash of it, so
 * someone holding the cookie cannot work the code out offline.
 */

export const LOGIN_CHALLENGE_COOKIE = 'motionz_login_challenge';
export const LOGIN_CHALLENGE_TTL_MS = 10 * 60 * 1000;
export const LOGIN_CHALLENGE_TTL_MINUTES = 10;
/** Scoped to the login endpoints so the browser sends it nowhere else. */
export const LOGIN_CHALLENGE_COOKIE_PATH = '/api/auth/login';

export const VERIFY_ATTEMPT_LIMIT = { maxRequests: 5, windowMs: LOGIN_CHALLENGE_TTL_MS };
export const RESEND_LIMIT = { maxRequests: 3, windowMs: LOGIN_CHALLENGE_TTL_MS };
/** New challenges (and therefore emails) per staff account. */
export const ISSUE_LIMIT = { maxRequests: 5, windowMs: LOGIN_CHALLENGE_TTL_MS };

export interface LoginChallenge {
  challengeId: string;
  userId: string;
  email: string;
  role: 'admin' | 'csm';
  redirect: string;
  codeHash: string;
  /** Epoch milliseconds. */
  exp: number;
}

// Domain-separated from session tokens (same secret, different MAC input), so a challenge
// cookie can never be replayed as a session cookie or the other way round.
const SIGNATURE_CONTEXT = 'motionz.login-challenge.v1.';
const CODE_CONTEXT = 'motionz.login-code.v1.';

const hmac = (context: string, value: string): string =>
  crypto.createHmac('sha256', getSessionSecret()).update(context + value).digest('base64url');

const safeEqual = (a: string, b: string): boolean => {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && crypto.timingSafeEqual(left, right);
};

export function staffLoginCodeRequired(mode: StaffLoginCodeMode | undefined, role: string): boolean {
  if (mode === 'all_staff') return role === 'admin' || role === 'csm';
  if (mode === 'csm') return role === 'csm';
  return false;
}

export function generateLoginCode(): string {
  return crypto.randomInt(0, 1_000_000).toString().padStart(6, '0');
}

/** Keyed hash (HMAC with the server secret), bound to the challenge it was issued for. */
export function hashLoginCode(code: string, challengeId: string): string {
  return hmac(CODE_CONTEXT, `${challengeId}:${code}`);
}

export function loginCodeMatches(code: string, challenge: LoginChallenge): boolean {
  return safeEqual(hashLoginCode(code, challenge.challengeId), challenge.codeHash);
}

export function signLoginChallenge(challenge: LoginChallenge): string {
  const data = Buffer.from(JSON.stringify(challenge)).toString('base64url');
  return `${data}.${hmac(SIGNATURE_CONTEXT, data)}`;
}

/** Returns the challenge, or null when the token is missing, tampered with or expired. */
export function verifyLoginChallenge(token: string | null | undefined): LoginChallenge | null {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [data, signature] = parts;
  if (!safeEqual(signature, hmac(SIGNATURE_CONTEXT, data))) return null;

  try {
    const challenge = JSON.parse(Buffer.from(data, 'base64url').toString('utf-8')) as LoginChallenge;
    if (
      !challenge ||
      typeof challenge.challengeId !== 'string' ||
      typeof challenge.userId !== 'string' ||
      typeof challenge.codeHash !== 'string' ||
      typeof challenge.exp !== 'number' ||
      (challenge.role !== 'admin' && challenge.role !== 'csm')
    ) {
      return null;
    }
    if (Date.now() > challenge.exp) return null;
    return challenge;
  } catch {
    return null;
  }
}

/** c***@motionz.ai */
export function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!domain) return '***';
  return `${local.charAt(0)}***@${domain}`;
}

/** Same routing rules the password step applies to staff. */
export function resolveStaffRedirect(role: string, redirect: unknown): string {
  const fallback = role === 'admin' ? '/admin' : '/csm';
  let target = sanitizeRedirectUrl(typeof redirect === 'string' ? redirect : undefined, fallback);
  if (role === 'csm' && target.startsWith('/admin')) target = '/csm';
  if (role === 'admin' && (target === '/auth/login' || target === '/')) target = '/admin';
  return target;
}

export function readCookie(request: Request, name: string): string | null {
  const header = request.headers.get('cookie');
  if (!header) return null;
  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index === -1) continue;
    if (part.slice(0, index).trim() === name) {
      const value = part.slice(index + 1).trim();
      try {
        return decodeURIComponent(value);
      } catch {
        return value;
      }
    }
  }
  return null;
}

export function challengeCookieOptions(exp: number) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: LOGIN_CHALLENGE_COOKIE_PATH,
    maxAge: Math.max(1, Math.ceil((exp - Date.now()) / 1000)),
  };
}

export function clearedChallengeCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: LOGIN_CHALLENGE_COOKIE_PATH,
    maxAge: 0,
  };
}

/**
 * Generates a fresh code for the challenge and emails it. The code is never logged or
 * returned by this module. `existing` keeps the same challenge id and expiry (resend).
 *
 * Returns null when the email could not be delivered. Local development without an email
 * provider counts as delivered: the email module prints the message to the server console.
 */
export async function issueLoginChallenge(
  params: { userId: string; email: string; role: 'admin' | 'csm'; redirect: string },
  existing?: Pick<LoginChallenge, 'challengeId' | 'exp'>
): Promise<LoginChallenge | null> {
  const challengeId = existing?.challengeId || crypto.randomBytes(18).toString('base64url');
  const code = generateLoginCode();

  const result = await sendEmail(
    staffLoginCodeEmail({ to: params.email, code, expiresInMinutes: LOGIN_CHALLENGE_TTL_MINUTES })
  );
  if (!result.delivered && !canExposeDevLinks()) return null;

  return {
    challengeId,
    userId: params.userId,
    email: params.email,
    role: params.role,
    redirect: params.redirect,
    codeHash: hashLoginCode(code, challengeId),
    exp: existing?.exp ?? Date.now() + LOGIN_CHALLENGE_TTL_MS,
  };
}
