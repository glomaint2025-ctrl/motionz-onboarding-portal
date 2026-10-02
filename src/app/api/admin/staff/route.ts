import { NextResponse } from 'next/server';
import crypto from 'crypto';
import {
  userRepository,
  csmAssignmentRepository,
  passwordResetRepository,
  auditLogRepository,
} from '@/lib/db/repositories';
import { requireAuth, handleAuthError } from '@/lib/auth/guard';
import { isStaffEmail } from '@/lib/auth/staff';
import { resolveBaseUrl } from '@/lib/auth/security-utils';
import { getSupabaseServiceClient } from '@/lib/db/supabase-client';
import { sendEmail, canExposeDevLinks } from '@/lib/email';
import { validateEmail, validateText } from '@/lib/validation';

const SETUP_LINK_MINUTES = 72 * 60;

function staffWelcomeEmail(to: string, name: string, role: string, url: string) {
  const esc = (v: string) => v.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
  const roleLabel = role === 'admin' ? 'an Admin' : 'a CSM';
  const text = `Hi ${name},\n\nYou have been added to the Motionz portal as ${roleLabel}.\nSet your password here (link valid for 72 hours): ${url}\n\nThen sign in on the Staff tab with ${to}.`;
  const html = `<!doctype html><html><body style="font-family:Arial,Helvetica,sans-serif;background:#f9fafb;padding:24px;color:#111827">
<div style="max-width:560px;margin:0 auto;background:#fff;border:1px solid #e5e7eb;border-radius:8px;padding:32px">
<p style="font-weight:bold;letter-spacing:.04em;margin:0 0 24px">MOTIONZ</p>
<h1 style="font-size:20px;margin:0 0 16px">Welcome to the Motionz portal</h1>
<p style="line-height:1.5">Hi ${esc(name)}, you have been added as ${roleLabel}. Set your password to get started.</p>
<p style="margin:24px 0"><a href="${esc(url)}" style="background:#111827;color:#fff;padding:12px 20px;border-radius:6px;text-decoration:none">Set my password</a></p>
<p style="font-size:13px;color:#6b7280">This link expires in 72 hours. Afterwards, sign in on the Staff tab with ${esc(to)}.</p>
</div></body></html>`;
  return { to, subject: 'You have been added to the Motionz portal', html, text, tags: ['staff-invite'] };
}

/** Admin > Staff: list Motionz staff with their assigned client counts. */
export async function GET(request: Request) {
  try {
    await requireAuth(request, { roles: ['admin'] });
    const [admins, csms] = await Promise.all([userRepository.listAllByRole('admin'), userRepository.listAllByRole('csm')]);
    const staff = await Promise.all(
      [...admins, ...csms].map(async (u) => ({
        id: u.id,
        email: u.email,
        name: u.full_name,
        role: u.role,
        status: u.status || 'active',
        assignedClients: u.role === 'csm' ? (await csmAssignmentRepository.listByCsm(u.id)).length : null,
        created_at: u.created_at,
      }))
    );
    return NextResponse.json({ success: true, staff });
  } catch (err: any) {
    if (err.statusCode === 401 || err.statusCode === 403) return handleAuthError(err);
    return NextResponse.json({ error: 'Failed to load staff.' }, { status: 500 });
  }
}

/** Adds a staff member (CSM or Admin) and emails them a link to set their password. */
export async function POST(request: Request) {
  try {
    const { session } = await requireAuth(request, { roles: ['admin'] });
    const body = await request.json().catch(() => ({}));

    let email: string;
    let fullName: string;
    try {
      email = validateEmail(body.email);
      fullName = validateText(body.name, 'Name', { required: true, max: 120 })!;
    } catch (e: any) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    const role = body.role === 'admin' ? 'admin' : 'csm';

    if (!isStaffEmail(email)) {
      return NextResponse.json({ error: 'Staff accounts must use an @motionz.ai email address.' }, { status: 400 });
    }
    if (await userRepository.findByEmail(email)) {
      return NextResponse.json({ error: 'An account with this email already exists.' }, { status: 400 });
    }

    // Staff sign in with a Supabase Auth password; create the auth user so the reset link can set it.
    let authUserId: string | undefined;
    const supabase = getSupabaseServiceClient();
    if (supabase) {
      const { data, error } = await supabase.auth.admin.createUser({ email, email_confirm: true });
      if (error && !/already/i.test(error.message)) {
        return NextResponse.json({ error: `Could not create the login: ${error.message}` }, { status: 500 });
      }
      authUserId = data?.user?.id;
    }

    const user = await userRepository.create({ id: authUserId, email, full_name: fullName, role, status: 'active' } as any);

    const rawToken = crypto.randomBytes(32).toString('hex');
    await passwordResetRepository.create(email, rawToken, SETUP_LINK_MINUTES);
    const setupUrl = `${resolveBaseUrl(request)}/auth/reset-password?token=${rawToken}`;
    const delivery = await sendEmail(staffWelcomeEmail(email, fullName, role, setupUrl));

    await auditLogRepository.create({
      actor_email: session!.email,
      actor_role: 'admin',
      action: 'staff.created',
      resource_type: 'user',
      resource_id: user.id,
      details: { email, role, emailDelivered: delivery.delivered },
    });

    return NextResponse.json({
      success: true,
      staff: { id: user.id, email, name: fullName, role, status: 'active' },
      emailDelivered: delivery.delivered,
      ...(canExposeDevLinks() ? { setupUrl } : {}),
    });
  } catch (err: any) {
    if (err.statusCode === 401 || err.statusCode === 403) return handleAuthError(err);
    return NextResponse.json({ error: err.message || 'Failed to add staff member.' }, { status: 500 });
  }
}

/** { id, action: 'disable' | 'enable' } — disabling blocks sign-in and removes nothing. */
export async function PATCH(request: Request) {
  try {
    const { session } = await requireAuth(request, { roles: ['admin'] });
    const body = await request.json().catch(() => ({}));
    const target = body.id ? await userRepository.findById(String(body.id)) : null;
    if (!target || (target.role !== 'admin' && target.role !== 'csm')) {
      return NextResponse.json({ error: 'Staff member not found.' }, { status: 404 });
    }
    if (target.id === session!.userId) {
      return NextResponse.json({ error: 'You cannot disable your own account.' }, { status: 400 });
    }

    if (body.action === 'disable') {
      await userRepository.suspendUser(target.id, 'Staff access disabled by an administrator.', session!.email, 'admin');
    } else if (body.action === 'enable') {
      await userRepository.unsuspendUser(target.id);
    } else {
      return NextResponse.json({ error: 'Unknown action.' }, { status: 400 });
    }

    await auditLogRepository.create({
      actor_email: session!.email,
      actor_role: 'admin',
      action: `staff.${body.action}d`,
      resource_type: 'user',
      resource_id: target.id,
      details: { email: target.email },
    });
    return NextResponse.json({ success: true });
  } catch (err: any) {
    if (err.statusCode === 401 || err.statusCode === 403) return handleAuthError(err);
    return NextResponse.json({ error: 'Failed to update staff member.' }, { status: 500 });
  }
}
