import { NextRequest, NextResponse } from 'next/server';
import { handleAuthError } from '@/lib/auth/guard';
import { setAuthPassword } from '@/lib/auth/invitations';
import { enforceRateLimit } from '@/lib/auth/security-utils';
import { securityEventRepository } from '@/lib/db/repositories';
import { logAuditEvent } from '@/lib/db';
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH, requireCurrentUser, verifyCurrentPassword } from '@/lib/account/profile';

export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'no-store, no-cache, must-revalidate' };

const refuse = (error: string, status: number, headers: Record<string, string> = {}) =>
  NextResponse.json({ error }, { status, headers: { ...NO_STORE, ...headers } });

/**
 * POST /api/account/profile/password { currentPassword, newPassword }: the signed-in person changes
 * their own password. The person comes from the session only; any id or email in the body is ignored.
 * Sessions are stateless signed cookies, so the person stays signed in afterwards.
 * No password is ever written to a log.
 */
export async function POST(request: NextRequest) {
  try {
    const { user } = await requireCurrentUser(request);

    const parsed = await request.json().catch(() => null);
    const body: Record<string, unknown> = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    const currentPassword = typeof body.currentPassword === 'string' ? body.currentPassword : '';
    const newPassword = typeof body.newPassword === 'string' ? body.newPassword : '';

    if (!currentPassword) return refuse('Please enter your current password.', 400);
    if (newPassword.length < PASSWORD_MIN_LENGTH) {
      return refuse(`Your new password must be at least ${PASSWORD_MIN_LENGTH} characters long.`, 400);
    }
    if (newPassword.length > PASSWORD_MAX_LENGTH) {
      return refuse(`Your new password must be ${PASSWORD_MAX_LENGTH} characters or fewer.`, 400);
    }
    if (newPassword === currentPassword) {
      return refuse('Your new password must be different from your current password.', 400);
    }

    // Counted per person, so guessing the current password from a signed-in browser is slow.
    const limit = await enforceRateLimit(`account_password:${user.id}`, { maxRequests: 5, windowMs: 15 * 60 * 1000 });
    if (!limit.allowed) {
      await securityEventRepository.create({
        event_type: 'rate_limit_exceeded',
        severity: 'medium',
        tenant_id: user.tenant_id,
        details: { email: user.email, endpoint: '/api/account/profile/password', resetMs: limit.resetMs },
      });
      return refuse('Too many attempts. Please wait a few minutes and try again.', 429, {
        'Retry-After': String(Math.ceil(limit.resetMs / 1000)),
      });
    }

    const check =
      currentPassword.length > PASSWORD_MAX_LENGTH ? 'wrong' : await verifyCurrentPassword(user.email, currentPassword);
    if (check === 'unavailable') {
      return refuse('Passwords cannot be changed right now. Please try again later.', 503);
    }
    if (check === 'wrong') {
      await securityEventRepository.create({
        event_type: 'account_password_change_wrong_password',
        severity: 'medium',
        tenant_id: user.tenant_id,
        details: { email: user.email, role: user.role, timestamp: new Date().toISOString() },
      });
      return refuse('Your current password is not correct.', 403);
    }

    const saved = await setAuthPassword({ userId: user.id, email: user.email, password: newPassword });
    if (!saved.ok) {
      console.error('[ACCOUNT] Password change could not be saved for user', user.id);
      return refuse('We could not save your new password. Your old password still works. Please try again in a moment.', 500);
    }

    await logAuditEvent({
      tenantId: user.tenant_id || undefined,
      actorEmail: user.email,
      actorRole: user.role,
      actorUserId: user.id,
      action: 'account.password_changed',
      resourceType: 'user',
      resourceId: user.id,
      details: { email: user.email },
    });
    await securityEventRepository.create({
      event_type: 'account_password_changed',
      severity: 'low',
      tenant_id: user.tenant_id,
      details: { email: user.email, role: user.role, timestamp: new Date().toISOString() },
    });

    return NextResponse.json({ success: true }, { headers: NO_STORE });
  } catch (err: any) {
    return handleAuthError(err);
  }
}
