import { NextResponse } from 'next/server';
import { appSettingsRepository, auditLogRepository } from '@/lib/db/repositories';
import { requireAuth, handleAuthError } from '@/lib/auth/guard';
import { checkSlackWebhookUrl, maskSlackWebhookUrl } from '@/lib/lead-requests/slack';

/** What the browser may know about the Slack link: whether one is set, and its masked form. Never the link itself. */
const publicSlack = (url: string) => ({ configured: Boolean(url), lead_request_slack_webhook_url: maskSlackWebhookUrl(url) });

/** Admin settings: the Slack channel that gets a message for every lead form (app setting `slack`). */
export async function GET(request: Request) {
  try {
    await requireAuth(request, { roles: ['admin'] });
    const slack = await appSettingsRepository.get('slack');
    return NextResponse.json({ success: true, slack: publicSlack(slack.lead_request_slack_webhook_url) });
  } catch (err: any) {
    if (err.statusCode === 401 || err.statusCode === 403) return handleAuthError(err);
    return NextResponse.json({ error: 'Failed to load the Slack settings.' }, { status: 500 });
  }
}

/**
 * Body: { lead_request_slack_webhook_url } — a Slack Incoming Webhook link, or empty to switch Slack
 * messages off. Sending back the masked link the page was given changes nothing.
 */
export async function PUT(request: Request) {
  try {
    const { session } = await requireAuth(request, { roles: ['admin'] });
    const body = await request.json().catch(() => ({}));

    const previous = await appSettingsRepository.get('slack');
    const previousUrl = previous.lead_request_slack_webhook_url;

    const sent = body?.lead_request_slack_webhook_url;
    // The page only ever holds the masked link; saving without typing a new one keeps the stored link.
    if (previousUrl && typeof sent === 'string' && sent.trim() === maskSlackWebhookUrl(previousUrl)) {
      return NextResponse.json({ success: true, slack: publicSlack(previousUrl), changed: false });
    }

    const check = checkSlackWebhookUrl(sent);
    if (!check.ok) {
      return NextResponse.json({ error: check.error, field: 'lead_request_slack_webhook_url' }, { status: 400 });
    }

    const changed = previousUrl !== check.url;
    if (changed) {
      await appSettingsRepository.set('slack', { ...previous, lead_request_slack_webhook_url: check.url }, session!.email);
      await auditLogRepository.create({
        actor_email: session!.email,
        actor_role: 'admin',
        action: 'settings.slack_updated',
        resource_type: 'app_settings',
        resource_id: 'slack',
        // The link itself lets anyone post to the channel, so it is never written to the log.
        details: { lead_request_slack: check.url ? 'Set' : 'Off', previous: previousUrl ? 'Set' : 'Off' },
      });
    }

    return NextResponse.json({ success: true, slack: publicSlack(check.url), changed });
  } catch (err: any) {
    if (err.statusCode === 401 || err.statusCode === 403) return handleAuthError(err);
    return NextResponse.json({ error: 'Failed to save the Slack settings.' }, { status: 500 });
  }
}
