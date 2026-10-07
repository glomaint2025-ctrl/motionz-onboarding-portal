import { NextResponse } from 'next/server';
import { createSessionToken, SESSION_COOKIE_NAME } from '@/lib/auth/session';
import { userRepository, securityEventRepository } from '@/lib/db/repositories';
import { enforceRateLimit, getClientIp } from '@/lib/auth/security-utils';
import { logAuditEvent } from '@/lib/db';
import {
  LOGIN_CHALLENGE_COOKIE,
  LOGIN_CHALLENGE_TTL_MS,
  VERIFY_ATTEMPT_LIMIT,
  clearedChallengeCookieOptions,
  loginCodeMatches,
  readCookie,
  resolveStaffRedirect,
  verifyLoginChallenge,
} from '@/lib/auth/login-challenge';

function fail(error: string, status: number, options?: { clearCookie?: boolean; extra?: Record<string, unknown>; headers?: Record<string, string> }) {
  const response = NextResponse.json({ error, ...(options?.extra || {}) }, { status, headers: options?.headers });
  if (options?.clearCookie) response.cookies.set(LOGIN_CHALLENGE_COOKIE, '', clearedChallengeCookieOptions());
  return response;
}

/** Second step of staff sign-in: checks the emailed one-time code and creates the session. */
export async function POST(request: Request) {
  try {
    const ip = getClientIp(request);
    const challenge = verifyLoginChallenge(readCookie(request, LOGIN_CHALLENGE_COOKIE));
    if (!challenge) {
      return fail('Your sign-in code has expired. Please sign in again.', 401, {
        clearCookie: true,
        extra: { restart: true },
      });
    }

    const body = await request.json().catch(() => ({}));
    const code = typeof body?.code === 'string' || typeof body?.code === 'number' ? String(body.code).replace(/\s/g, '') : '';
    if (!/^\d{6}$/.test(code)) {
      return fail('Enter the 6-digit code from your email.', 400);
    }

    const attempts = await enforceRateLimit(`login_code_verify:${challenge.challengeId}`, VERIFY_ATTEMPT_LIMIT);
    if (!attempts.allowed) {
      await securityEventRepository.create({
        event_type: 'staff_login_code_failed',
        severity: 'high',
        details: { email: challenge.email, ip, reason: 'Too many incorrect codes', timestamp: new Date().toISOString() },
      });
      return fail('Too many incorrect codes. Please sign in again to get a new code.', 429, {
        clearCookie: true,
        extra: { restart: true },
        headers: { 'Retry-After': String(Math.ceil(attempts.resetMs / 1000)) },
      });
    }

    if (!loginCodeMatches(code, challenge)) {
      await securityEventRepository.create({
        event_type: 'staff_login_code_failed',
        severity: 'medium',
        details: { email: challenge.email, ip, reason: 'Incorrect code', attemptsRemaining: attempts.remaining, timestamp: new Date().toISOString() },
      });
      await logAuditEvent({
        actorEmail: challenge.email,
        actorRole: challenge.role,
        actorUserId: challenge.userId,
        action: 'security.staff_login_code_failed',
        resourceType: 'user',
        resourceId: challenge.userId,
        details: { attemptsRemaining: attempts.remaining },
        ipAddress: ip,
      });
      const left = attempts.remaining;
      return fail(
        left > 0
          ? `That code is not correct. You have ${left} ${left === 1 ? 'try' : 'tries'} left.`
          : 'That code is not correct. Request a new sign-in by signing in again.',
        401,
        { extra: { attemptsRemaining: left } }
      );
    }

    // The account may have been disabled or changed since the password step.
    const user = await userRepository.findById(challenge.userId);
    if (!user || user.status === 'suspended' || (user.role !== 'admin' && user.role !== 'csm')) {
      return fail('Your staff access has been disabled. Contact a CSM Manager.', 403, {
        clearCookie: true,
        extra: { restart: true },
      });
    }

    // A challenge signs in once: a copied cookie + code cannot be replayed afterwards.
    const firstUse = await enforceRateLimit(`login_code_used:${challenge.challengeId}`, {
      maxRequests: 1,
      windowMs: LOGIN_CHALLENGE_TTL_MS,
    });
    if (!firstUse.allowed) {
      return fail('This sign-in code has already been used. Please sign in again.', 401, {
        clearCookie: true,
        extra: { restart: true },
      });
    }

    await logAuditEvent({
      actorEmail: user.email,
      actorRole: user.role,
      actorUserId: user.id,
      action: 'staff.login_code_verified',
      resourceType: 'user',
      resourceId: user.id,
      ipAddress: ip,
    });
    await securityEventRepository.create({
      event_type: 'staff_login_code_verified',
      severity: 'low',
      details: { email: user.email, role: user.role, ip, timestamp: new Date().toISOString() },
    });

    const response = NextResponse.json({
      success: true,
      user,
      redirectTo: resolveStaffRedirect(user.role, challenge.redirect),
    });
    response.cookies.set(SESSION_COOKIE_NAME, createSessionToken(user.id, user.email, user.role), {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 7 * 24 * 60 * 60, // 7 days
    });
    response.cookies.set(LOGIN_CHALLENGE_COOKIE, '', clearedChallengeCookieOptions());
    return response;
  } catch {
    return NextResponse.json({ error: 'We could not complete your sign-in. Please try again.' }, { status: 500 });
  }
}
