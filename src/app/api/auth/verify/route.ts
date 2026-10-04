import { NextResponse } from 'next/server';
import { verifyInvitationToken, setAuthPassword } from '@/lib/auth/invitations';
import { invitationService } from '@/lib/services/invitation.service';
import { createSessionToken, SESSION_COOKIE_NAME } from '@/lib/auth/session';
import { enforceRateLimit, getClientIp, sanitizeRedirectUrl } from '@/lib/auth/security-utils';
import { securityEventRepository } from '@/lib/db/repositories';
import { resolveTenantId } from '@/lib/db/supabase-client';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const token = searchParams.get('token');

    if (!token) {
      return NextResponse.json({ error: 'Token is required.' }, { status: 400 });
    }

    const result = await invitationService.validateInvitation(token);

    if (!result.valid) {
      return NextResponse.json(
        { error: result.error || 'This invitation is invalid or has expired.' },
        { status: 400 }
      );
    }

    return NextResponse.json({ valid: true, email: result.email });
  } catch (err: any) {
    return NextResponse.json(
      { error: 'Failed to validate invitation.' },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const ip = getClientIp(request);

    // Rate limit token verification attempts to prevent brute-forcing
    const rateLimit = await enforceRateLimit(`verify_ip:${ip}`, { maxRequests: 15, windowMs: 60 * 1000 });
    if (!rateLimit.allowed) {
      await securityEventRepository.create({
        event_type: 'rate_limit_exceeded',
        severity: 'medium',
        details: { ip, endpoint: '/api/auth/verify', resetMs: rateLimit.resetMs },
      });
      return NextResponse.json(
        { error: 'Too many verification attempts. Please wait a moment.' },
        { status: 429 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const { token, password, redirect } = body;

    if (!token || typeof token !== 'string') {
      return NextResponse.json({ error: 'Token is required.' }, { status: 400 });
    }

    // Everything that can be checked is checked BEFORE the single-use invitation is consumed.
    if (typeof password !== 'string' || password.length < 8) {
      return NextResponse.json({ error: 'Password must be at least 8 characters long.' }, { status: 400 });
    }
    if (password.length > 200) {
      return NextResponse.json({ error: 'Password must be 200 characters or fewer.' }, { status: 400 });
    }

    const precheck = await invitationService.validateInvitation(token);
    if (!precheck.valid) {
      return NextResponse.json(
        { error: precheck.error || 'This invitation is invalid or has expired.' },
        { status: 400 }
      );
    }

    const result = await verifyInvitationToken(token);

    if (!result.success || !result.user) {
      return NextResponse.json(
        { error: result.error || 'This invitation is invalid or has expired.' },
        { status: 400 }
      );
    }

    // The account now exists; save its password. If that fails, say so plainly rather than
    // signing the user in to an account they will not be able to get back into.
    const saved = await setAuthPassword({ userId: result.user.id, email: result.user.email, password });
    if (!saved.ok) {
      return NextResponse.json(
        {
          error:
            'Your account is set up, but we could not save your password. Go to the sign-in page and use "Forgot password" to choose one.',
          code: 'PASSWORD_NOT_SAVED',
        },
        { status: 500 }
      );
    }

    const resolvedTenant = resolveTenantId(result.tenantId || 'demo');
    const sessionToken = createSessionToken(
      result.user.id,
      result.user.email,
      result.user.role,
      resolvedTenant
    );

    const defaultRedirect = `/portal/${resolvedTenant}`;
    const safeRedirect = sanitizeRedirectUrl(redirect, defaultRedirect);

    const response = NextResponse.json({
      success: true,
      user: result.user,
      redirectTo: safeRedirect,
    });

    response.cookies.set(SESSION_COOKIE_NAME, sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 7 * 24 * 60 * 60, // 7 days
    });

    return response;
  } catch (err: any) {
    return NextResponse.json(
      { error: 'We could not complete your sign-in. Please try again.' },
      { status: 500 }
    );
  }
}
