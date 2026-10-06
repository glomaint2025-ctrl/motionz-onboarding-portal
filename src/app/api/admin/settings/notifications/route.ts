import { NextResponse } from 'next/server';
import {
  appSettingsRepository,
  onboardingSubmissionRepository,
  auditLogRepository,
  tenantRepository,
} from '@/lib/db/repositories';
import { NOTIFICATION_LIST_KEYS, type NotificationListKey } from '@/lib/db/repositories/app-settings.repository';
import { requireAuth, handleAuthError } from '@/lib/auth/guard';
import { isEmailConfigured } from '@/lib/email';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_RECIPIENTS = 20;

/** Admin settings: who is emailed about onboarding forms, website change requests and lead forms, unmatched submissions, integration status. */
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

    const current = await appSettingsRepository.get('notifications');
    const lists = {} as Record<NotificationListKey, string[]>;
    for (const key of NOTIFICATION_LIST_KEYS) {
      const raw: unknown = body[key];
      // The two newer lists keep their saved value when a caller does not send them.
      if (raw === undefined && key !== 'onboarding_form_recipients') {
        lists[key] = current[key];
        continue;
      }
      const list = Array.isArray(raw) ? raw : typeof raw === 'string' ? raw.split(/[\s,;]+/) : [];
      const recipients = Array.from(new Set(list.map((e) => String(e).trim().toLowerCase()).filter(Boolean)));
      const invalid = recipients.filter((e) => !EMAIL_RE.test(e));
      // `field` tells the settings page which of the three boxes to mark.
      if (invalid.length) {
        return NextResponse.json({ error: `Invalid email address: ${invalid.join(', ')}`, field: key }, { status: 400 });
      }
      if (recipients.length > MAX_RECIPIENTS) {
        return NextResponse.json({ error: `Up to ${MAX_RECIPIENTS} recipients are allowed.`, field: key }, { status: 400 });
      }
      lists[key] = recipients;
    }

    const value = { ...lists, notify_assigned_csm: body.notify_assigned_csm !== false };
    const sameList = (a: string[], b: string[]) => a.length === b.length && a.every((e, i) => e === b[i]);
    const changed: string[] = NOTIFICATION_LIST_KEYS.filter((key) => !sameList(current[key], value[key]));
    if (current.notify_assigned_csm !== value.notify_assigned_csm) changed.push('notify_assigned_csm');

    await appSettingsRepository.set('notifications', value, session!.email);
    await auditLogRepository.create({
      actor_email: session!.email,
      actor_role: 'admin',
      action: 'settings.notifications_updated',
      resource_type: 'app_settings',
      resource_id: 'notifications',
      // `changed` names the lists (and the CSM tick box) this save altered.
      details: { ...value, changed },
    });

    return NextResponse.json({ success: true, notifications: value });
  } catch (err: any) {
    if (err.statusCode === 401 || err.statusCode === 403) return handleAuthError(err);
    return NextResponse.json({ error: 'Failed to save settings.' }, { status: 500 });
  }
}
