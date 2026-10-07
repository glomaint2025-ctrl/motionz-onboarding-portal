import { NextResponse } from 'next/server';
import { userRepository, securityEventRepository } from '@/lib/db/repositories';
import { enforceRateLimit, getClientIp } from '@/lib/auth/security-utils';
import {
  LOGIN_CHALLENGE_COOKIE,
  RESEND_LIMIT,
  challengeCookieOptions,
  clearedChallengeCookieOptions,
  issueLoginChallenge,
  maskEmail,
  readCookie,
  signLoginChallenge,
  verifyLoginChallenge,
} from '@/lib/auth/login-challenge';

/**
 * Emails a new code for the pending staff sign-in. The replacement cookie carries the new
 * code's hash, so the previous code stops working; the expiry and attempt count carry over.
 */
export async function POST(request: Request) {
  try {
    const ip = getClientIp(request);
    const challenge = verifyLoginChallenge(readCookie(request, LOGIN_CHALLENGE_COOKIE));
    if (!challenge) {
      const expired = NextResponse.json(
        { error: 'Your sign-in has expired. Please sign in again.', restart: true },
        { status: 401 }
      );
      expired.cookies.set(LOGIN_CHALLENGE_COOKIE, '', clearedChallengeCookieOptions());
      return expired;
    }

    const limit = await enforceRateLimit(`login_code_resend:${challenge.challengeId}`, RESEND_LIMIT);
    if (!limit.allowed) {
      await securityEventRepository.create({
        event_type: 'rate_limit_exceeded',
        severity: 'medium',
        details: { ip, email: challenge.email, endpoint: '/api/auth/login/resend-code' },
      });
      return NextResponse.json(
        { error: 'You have requested too many codes. Use the latest code we emailed, or sign in again later.' },
        { status: 429, headers: { 'Retry-After': String(Math.ceil(limit.resetMs / 1000)) } }
      );
    }

    const user = await userRepository.findById(challenge.userId);
    if (!user || user.status === 'suspended' || (user.role !== 'admin' && user.role !== 'csm')) {
      const disabled = NextResponse.json(
        { error: 'Your staff access has been disabled. Contact a CSM Manager.', restart: true },
        { status: 403 }
      );
      disabled.cookies.set(LOGIN_CHALLENGE_COOKIE, '', clearedChallengeCookieOptions());
      return disabled;
    }

    const reissued = await issueLoginChallenge(
      { userId: user.id, email: user.email, role: user.role, redirect: challenge.redirect },
      { challengeId: challenge.challengeId, exp: challenge.exp }
    );
    if (!reissued) {
      await securityEventRepository.create({
        event_type: 'staff_login_code_delivery_failed',
        severity: 'high',
        details: { email: user.email, role: user.role, ip, timestamp: new Date().toISOString() },
      });
      return NextResponse.json(
        { error: 'We could not email a new code. Please try again in a moment or contact a CSM Manager.' },
        { status: 503 }
      );
    }

    await securityEventRepository.create({
      event_type: 'staff_login_code_sent',
      severity: 'low',
      details: { email: user.email, role: user.role, ip, resend: true, timestamp: new Date().toISOString() },
    });

    const response = NextResponse.json({ success: true, emailHint: maskEmail(user.email) });
    response.cookies.set(LOGIN_CHALLENGE_COOKIE, signLoginChallenge(reissued), challengeCookieOptions(reissued.exp));
    return response;
  } catch {
    return NextResponse.json({ error: 'We could not send a new code. Please try again.' }, { status: 500 });
  }
}
