import { NextResponse } from 'next/server';
import { appSettingsRepository, auditLogRepository } from '@/lib/db/repositories';
import { requireAuth, handleAuthError } from '@/lib/auth/guard';
import { checkWebhookUrl } from '@/lib/lead-requests/automation';

/** Admin settings: the optional link every lead form submission is sent to (app setting `automation`). */
export async function GET(request: Request) {
  try {
    await requireAuth(request, { roles: ['admin'] });
    const automation = await appSettingsRepository.get('automation');
    return NextResponse.json({ success: true, automation });
  } catch (err: any) {
    if (err.statusCode === 401 || err.statusCode === 403) return handleAuthError(err);
    return NextResponse.json({ error: 'Failed to load the automation settings.' }, { status: 500 });
  }
}

/**
 * Body: { lead_request_webhook_url } — a public https link (a GoHighLevel Inbound Webhook), or empty
 * to switch the automation off. http, IP addresses, localhost and private network names are refused.
 */
export async function PUT(request: Request) {
  try {
    const { session } = await requireAuth(request, { roles: ['admin'] });
    const body = await request.json().catch(() => ({}));

    const check = checkWebhookUrl(body?.lead_request_webhook_url);
    if (!check.ok) {
      return NextResponse.json({ error: check.error, field: 'lead_request_webhook_url' }, { status: 400 });
    }

    const previous = await appSettingsRepository.get('automation');
    const value = { ...previous, lead_request_webhook_url: check.url };
    const changed = previous.lead_request_webhook_url !== value.lead_request_webhook_url;
    if (changed) {
      await appSettingsRepository.set('automation', value, session!.email);
      await auditLogRepository.create({
        actor_email: session!.email,
        actor_role: 'admin',
        action: 'settings.automation_updated',
        resource_type: 'app_settings',
        resource_id: 'automation',
        // The link itself is a credential for the receiving workflow, so only its host is logged.
        details: {
          lead_request_webhook: value.lead_request_webhook_url ? `Set (${new URL(value.lead_request_webhook_url).hostname})` : 'Off',
          previous: previous.lead_request_webhook_url ? 'Set' : 'Off',
        },
      });
    }

    return NextResponse.json({ success: true, automation: value, changed });
  } catch (err: any) {
    if (err.statusCode === 401 || err.statusCode === 403) return handleAuthError(err);
    return NextResponse.json({ error: 'Failed to save the automation settings.' }, { status: 500 });
  }
}
