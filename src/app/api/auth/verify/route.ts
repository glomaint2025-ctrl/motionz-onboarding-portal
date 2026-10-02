import { NextResponse } from 'next/server';
import { verifyInvitationToken } from '@/lib/auth/invitations';
import { createSessionToken, SESSION_COOKIE_NAME } from '@/lib/auth/session';
import { enforceRateLimit, sanitizeRedirectUrl } from '@/lib/auth/security-utils';
import { securityEventRepository } from '@/lib/db/repositories';
import { resolveTenantId } from '@/lib/db/supabase-client';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const token = searchParams.get('token');

    if (!token) {
      return NextResponse.json({ error: 'Token is required.' }, { status: 400 });
    }

    const { invitationService } = await import('@/lib/services/invitation.service');
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
    const ip = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'global';

    // Rate limit token verification attempts to prevent brute-forcing
    const rateLimit = enforceRateLimit(`verify_ip:${ip}`, { maxRequests: 15, windowMs: 60 * 1000 });
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

    const body = await request.json();
    const { token, password, redirect } = body;

    if (!token || typeof token !== 'string') {
      return NextResponse.json({ error: 'Token is required.' }, { status: 400 });
    }

    const result = await verifyInvitationToken(token);

    if (!result.success || !result.user) {
      return NextResponse.json(
        { error: result.error || 'This invitation is invalid or has expired.' },
        { status: 400 }
      );
    }

    // If password provided upon invitation claim, persist in Supabase Auth
    const userEmail = result.user?.email;
    const userId = result.user?.id;
    if (password && typeof password === 'string' && userEmail && userId) {
      const { getSupabaseServiceClient } = await import('@/lib/db/supabase-client');
      const supabase = getSupabaseServiceClient();
      if (supabase) {
        try {
          const { data: listData } = await supabase.auth.admin.listUsers();
          const existingAuth = listData?.users?.find(
            (u) => u.email?.toLowerCase() === userEmail.toLowerCase()
          );

          if (existingAuth) {
            await supabase.auth.admin.updateUserById(existingAuth.id, {
              password,
              email_confirm: true,
            });
          } else {
            await supabase.auth.admin.createUser({
              id: userId,
              email: userEmail,
              password,
              email_confirm: true,
            });
          }
        } catch (err: any) {
          console.error('[AUTH] Failed to sync password to Supabase Auth:', err);
        }
      }
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
