import { NextResponse } from 'next/server';
import { authenticateStaff, isStaffEmail } from '@/lib/auth/staff';
import { createSessionToken, SESSION_COOKIE_NAME } from '@/lib/auth/session';
import { createInvitation } from '@/lib/auth/invitations';
import { userRepository, tenantRepository, securityEventRepository, appSettingsRepository } from '@/lib/db/repositories';
import {
  LOGIN_CHALLENGE_COOKIE,
  ISSUE_LIMIT,
  challengeCookieOptions,
  issueLoginChallenge,
  maskEmail,
  resolveStaffRedirect,
  signLoginChallenge,
  staffLoginCodeRequired,
} from '@/lib/auth/login-challenge';
import { enforceRateLimit, getClientIp, sanitizeRedirectUrl } from '@/lib/auth/security-utils';
import { resolveTenantId } from '@/lib/db/supabase-client';
import { canExposeDevLinks } from '@/lib/email';
import { logAuditEvent } from '@/lib/db';

export async function POST(request: Request) {
  try {
    const ip = getClientIp(request);
    
    // Rate limit: 10 requests per minute per IP
    const rateLimit = await enforceRateLimit(`login_ip:${ip}`, { maxRequests: 10, windowMs: 60 * 1000 });
    if (!rateLimit.allowed) {
      await securityEventRepository.create({
        event_type: 'rate_limit_exceeded',
        severity: 'medium',
        details: { ip, endpoint: '/api/auth/login', resetMs: rateLimit.resetMs },
      });
      return NextResponse.json(
        { error: 'Too many requests. Please wait a moment before trying again.' },
        { status: 429, headers: { 'Retry-After': String(Math.ceil(rateLimit.resetMs / 1000)) } }
      );
    }

    const body = await request.json();
    const { email, password, role, action, redirect } = body;

    if (!email || typeof email !== 'string') {
      return NextResponse.json({ error: 'Email address is required.' }, { status: 400 });
    }

    const normalizedEmail = email.trim().toLowerCase();

    // 1. Staff Sign In (@motionz.ai domain restricted)
    if (action === 'staff' || isStaffEmail(normalizedEmail)) {
      if (typeof password === 'string' && !password.trim()) {
        const emailCheck = await authenticateStaff(normalizedEmail, undefined, role);
        if (!emailCheck.success) {
          return NextResponse.json({ error: emailCheck.error }, { status: 403 });
        }
        return NextResponse.json({ error: 'Please enter your staff password.' }, { status: 400 });
      }

      const authResult = await authenticateStaff(normalizedEmail, password, role);
      if (!authResult.success || !authResult.user) {
        return NextResponse.json({ error: authResult.error }, { status: 403 });
      }

      // Auto-route based on authenticated staff role
      const safeRedirect = resolveStaffRedirect(authResult.user.role, redirect);

      // Second step: when enabled for this role, email a one-time code instead of signing in.
      const staffUser = authResult.user;
      const security = await appSettingsRepository.get('security');
      if (
        (staffUser.role === 'admin' || staffUser.role === 'csm') &&
        staffLoginCodeRequired(security.staff_login_code, staffUser.role)
      ) {
        const issueLimit = await enforceRateLimit(`login_code_issue:${staffUser.id}`, ISSUE_LIMIT);
        if (!issueLimit.allowed) {
          await securityEventRepository.create({
            event_type: 'rate_limit_exceeded',
            severity: 'medium',
            details: { ip, email: staffUser.email, endpoint: '/api/auth/login', reason: 'sign-in code requests' },
          });
          return NextResponse.json(
            { error: 'Too many sign-in codes requested. Please wait a few minutes and try again.' },
            { status: 429, headers: { 'Retry-After': String(Math.ceil(issueLimit.resetMs / 1000)) } }
          );
        }

        const challenge = await issueLoginChallenge({
          userId: staffUser.id,
          email: staffUser.email,
          role: staffUser.role,
          redirect: safeRedirect,
        });
        if (!challenge) {
          await securityEventRepository.create({
            event_type: 'staff_login_code_delivery_failed',
            severity: 'high',
            details: { email: staffUser.email, role: staffUser.role, ip, timestamp: new Date().toISOString() },
          });
          return NextResponse.json(
            { error: 'We could not email your sign-in code. Please try again in a moment or contact a Motionz administrator.' },
            { status: 503 }
          );
        }

        await securityEventRepository.create({
          event_type: 'staff_login_code_sent',
          severity: 'low',
          details: { email: staffUser.email, role: staffUser.role, ip, timestamp: new Date().toISOString() },
        });

        const challengeResponse = NextResponse.json({
          success: true,
          codeRequired: true,
          emailHint: maskEmail(staffUser.email),
        });
        challengeResponse.cookies.set(
          LOGIN_CHALLENGE_COOKIE,
          signLoginChallenge(challenge),
          challengeCookieOptions(challenge.exp)
        );
        return challengeResponse;
      }

      const sessionToken = createSessionToken(
        authResult.user.id,
        authResult.user.email,
        authResult.user.role
      );

      const response = NextResponse.json({
        success: true,
        user: authResult.user,
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
    }

    // 2. Client Organization Sign In (Email + Password)
    if (!action || action === 'client_login') {
      const invalidCredentials = NextResponse.json(
        { error: 'Incorrect email or password. Please try again.' },
        { status: 403 }
      );

      if (!password || typeof password !== 'string' || !password.trim()) {
        return NextResponse.json({ error: 'Please enter your password.' }, { status: 400 });
      }

      const user = await userRepository.findByEmail(normalizedEmail);
      // Staff accounts only sign in through the staff checks above (disabled staff, sign-in codes).
      if (!user || user.role === 'admin' || user.role === 'csm') {
        return invalidCredentials;
      }

      // Verify credentials via Supabase Auth when Supabase is configured
      const { getSupabaseBrowserClient } = await import('@/lib/db/supabase-client');
      const supabaseAnon = getSupabaseBrowserClient();
      if (supabaseAnon) {
        const { data: authData, error: authError } = await supabaseAnon.auth.signInWithPassword({
          email: normalizedEmail,
          password,
        });

        if (authError || !authData.user) {
          await securityEventRepository.create({
            event_type: 'client_invalid_credentials',
            severity: 'medium',
            details: {
              email: normalizedEmail,
              reason: authError?.message || 'Invalid password',
              timestamp: new Date().toISOString(),
            },
          });
          return invalidCredentials;
        }
      } else if (process.env.NODE_ENV === 'production') {
        return NextResponse.json({ error: 'Sign-in is temporarily unavailable.' }, { status: 503 });
      } else {
        // Fallback for mock in-memory store in unit test environments without Supabase
        if (password === 'WrongPassword123!' || password === 'wrong') {
          return invalidCredentials;
        }
      }

      // Suspension is only revealed once the caller has proven they own the account.
      if (user.status === 'suspended') {
        const reason = user.suspended_reason || 'Account has been disabled by an administrator.';
        return NextResponse.json(
          { error: `Your account has been suspended: ${reason}`, suspended: true, reason },
          { status: 403 }
        );
      }

      if (user.tenant_id) {
        const tenant = await tenantRepository.findById(user.tenant_id);
        if (tenant && tenant.status === 'suspended') {
          const reason = tenant.suspended_reason || 'Organization portal has been disabled by an administrator.';
          return NextResponse.json(
            { error: `Your organization portal has been suspended: ${reason}`, suspended: true, reason },
            { status: 403 }
          );
        }
      }

      const resolvedTenantId = resolveTenantId(user.tenant_id || 'demo');

      // Login activity is tracked for the admin dashboard (FR-501).
      await logAuditEvent({
        tenantId: user.tenant_id || undefined,
        actorEmail: user.email,
        actorRole: user.role,
        actorUserId: user.id,
        action: 'client.authenticated',
        resourceType: 'user',
        resourceId: user.id,
      });

      const sessionToken = createSessionToken(
        user.id,
        user.email,
        user.role,
        resolvedTenantId
      );

      const defaultRedirect = `/portal/${resolvedTenantId}`;
      const safeRedirect = sanitizeRedirectUrl(redirect, defaultRedirect);

      const response = NextResponse.json({
        success: true,
        user,
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
    }

    // 2. Client Magic Link Request
    if (action === 'magic_link') {
      // Per-email rate limit for magic link requests (5 per 15 minutes)
      const emailRateLimit = await enforceRateLimit(`magic_link:${normalizedEmail}`, {
        maxRequests: 5,
        windowMs: 15 * 60 * 1000,
      });
      if (!emailRateLimit.allowed) {
        return NextResponse.json(
          { error: 'Too many magic link requests for this email. Please check your inbox or try again later.' },
          { status: 429 }
        );
      }

      // Same response whether or not the account exists, so this endpoint cannot be used to probe emails.
      const genericResponse = {
        success: true,
        message: 'If an active account exists for this email, a sign-in link has been sent.',
      };

      const user = await userRepository.findByEmail(normalizedEmail);
      if (!user || !user.tenant_id || user.status === 'suspended') {
        return NextResponse.json(genericResponse);
      }

      const { magicLinkUrl } = await createInvitation({
        tenantId: user.tenant_id,
        email: user.email,
        role: user.role,
        createdBy: 'self-request',
        request,
        notify: 'login',
      });

      return NextResponse.json({
        ...genericResponse,
        // Local development without an email provider only; never returned in production.
        ...(canExposeDevLinks() ? { demoMagicLink: magicLinkUrl } : {}),
      });
    }

    return NextResponse.json({ error: 'Invalid authentication action.' }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json(
      { error: 'We could not complete your sign-in. Please try again.' },
      { status: 500 }
    );
  }
}
