import { NextResponse } from 'next/server';
import {
  appSettingsRepository,
  onboardingSubmissionRepository,
  auditLogRepository,
  tenantRepository,
} from '@/lib/db/repositories';
import { requireAuth, handleAuthError } from '@/lib/auth/guard';
import { isEmailConfigured } from '@/lib/email';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Admin settings: onboarding-form notification recipients, unmatched submissions, integration status. */
export async function GET(request: Request) {
  try {
    await requireAuth(request, { roles: ['admin'] });
    const [notifications, unmatched] = await Promise.all([
      appSettingsRepository.get('notifications'),
      onboardingSubmissionRepository.listByTenant(null, 50),
    ]);

    return NextResponse.json({
      success: true,
      notifications,
      unmatchedSubmissions: unmatched,
      status: {
        email: isEmailConfigured(),
        emailSender: process.env.EMAIL_FROM_ADDRESS || null,
        trackingSheets: Boolean(process.env.GOOGLE_SHEETS_SCRIPT_URL && process.env.GOOGLE_SHEETS_SCRIPT_SECRET),
        ghlWebhook: Boolean(process.env.GHL_WEBHOOK_SECRET),
      },
    });
  } catch (err: any) {
    if (err.statusCode === 401 || err.statusCode === 403) return handleAuthError(err);
    return NextResponse.json({ error: 'Failed to load settings.' }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const { session } = await requireAuth(request, { roles: ['admin'] });
    const body = await request.json().catch(() => ({}));

    // Link an onboarding submission that arrived before the client's portal existed.
    if (body.action === 'link_submission') {
      const tenant = body.tenantId ? await tenantRepository.findById(String(body.tenantId)) : null;
      if (!body.submissionId || !tenant) {
        return NextResponse.json({ error: 'Choose a client to link this submission to.' }, { status: 400 });
      }
      await onboardingSubmissionRepository.assignTenant(String(body.submissionId), tenant.id);
      return NextResponse.json({ success: true });
    }

    const raw: unknown = body.onboarding_form_recipients;
    const list = Array.isArray(raw) ? raw : typeof raw === 'string' ? raw.split(/[\s,;]+/) : [];
    const recipients = Array.from(new Set(list.map((e) => String(e).trim().toLowerCase()).filter(Boolean)));
    const invalid = recipients.filter((e) => !EMAIL_RE.test(e));
    if (invalid.length) {
      return NextResponse.json({ error: `Invalid email address: ${invalid.join(', ')}` }, { status: 400 });
    }
    if (recipients.length > 20) {
      return NextResponse.json({ error: 'Up to 20 recipients are allowed.' }, { status: 400 });
    }

    const value = { onboarding_form_recipients: recipients, notify_assigned_csm: body.notify_assigned_csm !== false };
    await appSettingsRepository.set('notifications', value, session!.email);
    await auditLogRepository.create({
      actor_email: session!.email,
      actor_role: 'admin',
      action: 'settings.notifications_updated',
      resource_type: 'app_settings',
      resource_id: 'notifications',
      details: value,
    });

    return NextResponse.json({ success: true, notifications: value });
  } catch (err: any) {
    if (err.statusCode === 401 || err.statusCode === 403) return handleAuthError(err);
    return NextResponse.json({ error: 'Failed to save settings.' }, { status: 500 });
  }
}
