import { NextRequest, NextResponse } from 'next/server';
import { handleAuthError } from '@/lib/auth/guard';
import { enforceRateLimit, getClientIp } from '@/lib/auth/security-utils';
import { createSessionToken, SESSION_COOKIE_NAME } from '@/lib/auth/session';
import { isStaffEmail, STAFF_EMAIL_DOMAIN } from '@/lib/auth/staff';
import { userRepository, securityEventRepository } from '@/lib/db/repositories';
import { logAuditEvent } from '@/lib/db';
import { getSupabaseServiceClient } from '@/lib/db/supabase-client';
import { validateEmail } from '@/lib/validation';
import { sendEmail, signInEmailChangedEmail } from '@/lib/email';
import { requireCurrentUser, sessionCookieOptions, verifyCurrentPassword } from '@/lib/account/profile';

export const dynamic = 'force-dynamic';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type ServiceClient = NonNullable<ReturnType<typeof getSupabaseServiceClient>>;

/**
 * The Supabase Auth identity of a person: by id when it matches their row (accounts created
 * through the invite flow), otherwise by their current email across the auth users.
 */
async function findAuthUserId(supabase: ServiceClient, user: { id: string; email: string }): Promise<string | null> {
  const email = user.email.trim().toLowerCase();
  if (UUID_PATTERN.test(user.id)) {
    const { data } = await supabase.auth.admin.getUserById(user.id);
    if (data?.user?.id && data.user.email?.toLowerCase() === email) return data.user.id;
  }
  const perPage = 1000;
  for (let page = 1; page <= 100; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
    if (error) throw error;
    const users = data?.users || [];
    const match = users.find((u) => u.email?.toLowerCase() === email);
    if (match) return match.id;
    if (users.length < perPage) break;
  }
  return null;
}

/**
 * POST /api/account/profile/email { newEmail, currentPassword }
 * The signed-in person changes the email they sign in with. Only their own login changes:
 * a client's company contact details are left exactly as they are.
 *
 * Order: Supabase Auth first, then the users row; if the row cannot be saved the Auth change is
 * undone so the two never disagree. The session cookie is re-issued so the person stays signed in.
 */
export async function POST(request: NextRequest) {
  try {
    const { session, user } = await requireCurrentUser(request);
    const ip = getClientIp(request);
    const isStaff = user.role === 'admin' || user.role === 'csm';

    const parsed = await request.json().catch(() => null);
    const body: Record<string, unknown> = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};

    let newEmail: string;
    try {
      newEmail = validateEmail(body.newEmail as string);
    } catch {
      return NextResponse.json({ error: 'Enter a valid email address.' }, { status: 400 });
    }
    if (newEmail.length > 255) {
      return NextResponse.json({ error: 'Enter a valid email address.' }, { status: 400 });
    }
    const currentPassword = typeof body.currentPassword === 'string' ? body.currentPassword : '';
    if (!currentPassword) {
      return NextResponse.json({ error: 'Enter your current password.' }, { status: 400 });
    }

    const oldEmail = user.email.trim().toLowerCase();
    if (newEmail === oldEmail) {
      return NextResponse.json({ error: 'That is already your sign-in email.' }, { status: 400 });
    }

    // Staff stay on the Motionz domain; clients never move onto it.
    if (isStaff && !isStaffEmail(newEmail)) {
      return NextResponse.json({ error: `Staff accounts must use an ${STAFF_EMAIL_DOMAIN} email address.` }, { status: 400 });
    }
    if (!isStaff && (isStaffEmail(newEmail) || newEmail.endsWith(STAFF_EMAIL_DOMAIN))) {
      return NextResponse.json(
        { error: `${STAFF_EMAIL_DOMAIN} addresses are for the Motionz team. Use your own email address.` },
        { status: 400 }
      );
    }

    // Only attempts that reach the password check count, so typos above do not lock anyone out.
    // This also caps password guessing through this form.
    const rateLimit = await enforceRateLimit(`account_email_change:${user.id}`, { maxRequests: 5, windowMs: 15 * 60 * 1000 });
    if (!rateLimit.allowed) {
      await securityEventRepository.create({
        event_type: 'rate_limit_exceeded',
        severity: 'medium',
        tenant_id: user.tenant_id,
        details: { ip, email: user.email, endpoint: '/api/account/profile/email', resetMs: rateLimit.resetMs },
      });
      return NextResponse.json(
        { error: 'Too many attempts. Please wait a few minutes before trying again.' },
        { status: 429, headers: { 'Retry-After': String(Math.ceil(rateLimit.resetMs / 1000)) } }
      );
    }

    // Prove it is really them before anything else is revealed or changed.
    const passwordCheck = await verifyCurrentPassword(oldEmail, currentPassword);
    if (passwordCheck === 'unavailable') {
      return NextResponse.json({ error: 'Your email cannot be changed right now. Please try again later.' }, { status: 503 });
    }
    if (passwordCheck !== 'ok') {
      await securityEventRepository.create({
        event_type: 'account_email_change_wrong_password',
        severity: 'medium',
        tenant_id: user.tenant_id,
        details: { email: oldEmail, role: user.role, ip, timestamp: new Date().toISOString() },
      });
      return NextResponse.json({ error: 'Your current password is not correct.' }, { status: 403 });
    }

    const existing = await userRepository.findByEmail(newEmail);
    if (existing && existing.id !== user.id) {
      return NextResponse.json({ error: 'Another account already uses this email address. Choose a different one.' }, { status: 409 });
    }

    // 1. Supabase Auth (where the password lives).
    const supabase = getSupabaseServiceClient();
    let authUserId: string | null = null;
    if (supabase) {
      authUserId = await findAuthUserId(supabase, user);
      if (!authUserId) {
        return NextResponse.json(
          { error: 'We could not find your sign-in account, so your email was not changed. Please contact your Motionz team.' },
          { status: 409 }
        );
      }
      const { error } = await supabase.auth.admin.updateUserById(authUserId, { email: newEmail, email_confirm: true });
      if (error) {
        const duplicate = /already|registered|exists/i.test(error.message || '');
        if (!duplicate) console.error(`[account] Auth email for ${user.id} could not be changed: ${error.message}`);
        return NextResponse.json(
          {
            error: duplicate
              ? 'Another account already uses this email address. Choose a different one.'
              : 'Your email could not be changed. Nothing was saved. Please try again.',
          },
          { status: duplicate ? 409 : 502 }
        );
      }
    }

    // 2. The users row; undo the Auth change if it cannot be saved.
    try {
      await userRepository.update(user.id, { email: newEmail });
    } catch (err: any) {
      let reverted = true;
      if (supabase && authUserId) {
        const revert = await supabase.auth.admin.updateUserById(authUserId, { email: oldEmail, email_confirm: true });
        reverted = !revert.error;
        if (revert.error) {
          console.error(`[account] Auth email for ${user.id} could not be reverted: ${revert.error.message}`);
          await securityEventRepository.create({
            event_type: 'account_email_change_out_of_step',
            severity: 'high',
            tenant_id: user.tenant_id,
            details: { userId: user.id, email: oldEmail, attemptedEmail: newEmail, timestamp: new Date().toISOString() },
          });
        }
      }
      console.error(`[account] Email change for ${user.id} could not be saved: ${err?.message}`);
      return NextResponse.json(
        {
          error: reverted
            ? 'Your email could not be changed. Nothing was saved. Please try again.'
            : 'Your email change did not finish. Please contact your Motionz team before signing in again.',
        },
        { status: 500 }
      );
    }

    await logAuditEvent({
      tenantId: user.tenant_id || undefined,
      actorEmail: newEmail,
      actorRole: user.role,
      actorUserId: user.id,
      action: 'account.email_changed',
      resourceType: 'user',
      resourceId: user.id,
      details: { previousEmail: oldEmail, email: newEmail },
      ipAddress: ip,
    });
    await securityEventRepository.create({
      event_type: 'account_email_changed',
      severity: 'medium',
      tenant_id: user.tenant_id,
      details: { email: newEmail, previousEmail: oldEmail, role: user.role, ip, timestamp: new Date().toISOString() },
    });

    // Tell the old address, so a change the owner did not make is noticed.
    let noticeSent = false;
    try {
      noticeSent = (await sendEmail(signInEmailChangedEmail({ to: oldEmail, newEmail }))).delivered;
    } catch {
      // The change itself succeeded; a failed notice must not undo it.
    }

    const response = NextResponse.json({ success: true, email: newEmail, noticeSent });
    response.cookies.set(
      SESSION_COOKIE_NAME,
      createSessionToken(user.id, newEmail, session.role, session.tenantId),
      sessionCookieOptions()
    );
    return response;
  } catch (err: any) {
    if (err?.statusCode === 401 || err?.statusCode === 403) return handleAuthError(err);
    console.error('[account] Email change failed:', err?.message || err);
    return NextResponse.json({ error: 'Your email could not be changed. Please try again.' }, { status: 500 });
  }
}
