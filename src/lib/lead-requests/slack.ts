/**
 * Slack messages for the lead forms (Admin → Settings & Integrations → Slack messages): the checks
 * on the Slack webhook link, the masked form shown in the browser, and the message text.
 * No server-only imports: the settings card and the API both use this.
 */
import { detailLines, decisionLabel } from './definition';

export const SLACK_URL_MAX = 300;
export const SLACK_HOST = 'hooks.slack.com';
export const SLACK_TIMEOUT_MS = 5000;
export const SLACK_TEST_TEXT = 'Test message from the Motionz portal';
/** How much of "What happened" / "How they tried" goes into the Slack message. */
export const SLACK_LONG_TEXT_MAX = 500;

export type SlackUrlCheck = { ok: true; url: string } | { ok: false; error: string };

const NOT_SLACK = 'That is not a Slack webhook link. It must start with https://hooks.slack.com/services/.';

/**
 * Accepts an empty value (Slack messages off) or a Slack Incoming Webhook link:
 * https, host exactly hooks.slack.com, path starting /services/, 300 characters at most.
 */
export function checkSlackWebhookUrl(input: unknown): SlackUrlCheck {
  if (input === undefined || input === null) return { ok: true, url: '' };
  if (typeof input !== 'string') return { ok: false, error: 'Paste the Slack webhook link as text.' };
  const raw = input.trim();
  if (!raw) return { ok: true, url: '' };
  // The partly hidden link the settings page shows is not a link Slack would accept.
  if (/[…•]/.test(raw)) return { ok: false, error: 'That is the hidden version of the link. Paste the full Webhook URL from Slack.' };
  if (raw.length > SLACK_URL_MAX) return { ok: false, error: `That link is too long (${SLACK_URL_MAX} characters at most).` };

  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return { ok: false, error: 'That does not look like a link. Copy the Webhook URL from Slack and paste it again.' };
  }
  if (parsed.protocol !== 'https:') return { ok: false, error: 'The link must start with https://.' };
  if (parsed.username || parsed.password || parsed.port) return { ok: false, error: NOT_SLACK };
  if (parsed.hostname.toLowerCase() !== SLACK_HOST) return { ok: false, error: NOT_SLACK };
  if (!parsed.pathname.startsWith('/services/') || parsed.pathname.length <= '/services/'.length) return { ok: false, error: NOT_SLACK };
  return { ok: true, url: parsed.toString() };
}

/**
 * The link as the browser may see it: https://hooks.slack.com/services/T…/B…/••••
 * (the first letter of the workspace and channel parts; never the secret part). Empty when unset.
 */
export function maskSlackWebhookUrl(url: string | null | undefined): string {
  if (!url) return '';
  let parts: string[] = [];
  try {
    parts = new URL(url).pathname.split('/').filter(Boolean).slice(1);
  } catch {
    // Not a link: fall through to the fully hidden form.
  }
  const hint = (part: string | undefined, fallback: string) => `${(part && /^[A-Za-z]/.test(part) ? part[0] : fallback).toUpperCase()}…`;
  return `https://${SLACK_HOST}/services/${hint(parts[0], 'T')}/${hint(parts[1], 'B')}/••••`;
}

/** Slack reads &, < and > as control characters; what a person typed must not become a link or a mention. */
export function escapeSlack(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function clipped(value: unknown, max: number): string {
  const text = String(value ?? '').trim();
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

export interface SlackLeadRequest {
  type: string;
  lead_name: string;
  lead_phone: string;
  details: Record<string, any> | null;
  decision: string;
  submitter_email: string | null;
}

/**
 * The message posted to Slack for a saved lead form. The plain text is complete on its own:
 * what was sent, the outcome, the client, the lead, the answers, who sent it and a link to the client.
 */
export function leadRequestSlackText(request: SlackLeadRequest, clientName: string, clientUrl: string): string {
  const d = request.details || {};
  const lines: string[] = [];
  if (request.type === 'unresponsive') {
    lines.push('*Unresponsive lead*');
  } else {
    lines.push(`*Lead replacement request — ${escapeSlack(decisionLabel(request.decision))}*`);
  }
  lines.push(`Client: ${escapeSlack(clientName)}`);
  lines.push(`Lead: ${escapeSlack(request.lead_name)} · ${escapeSlack(request.lead_phone)}`);
  if (request.type === 'unresponsive') {
    const days = d.days_since_sent === undefined || d.days_since_sent === null ? '' : String(d.days_since_sent);
    if (days) lines.push(`Days since the lead was sent: ${escapeSlack(days)}`);
    lines.push(`How they tried to reach them: ${escapeSlack(clipped(d.contact_attempts, SLACK_LONG_TEXT_MAX))}`);
  } else {
    // The same labels the email and the staff list use, so a retired option still reads properly.
    const [reason, appointment] = detailLines('replacement', d);
    lines.push(`Reason: ${escapeSlack(reason[1])}`);
    lines.push(`Appointment: ${escapeSlack(appointment[1])}`);
    lines.push(`What happened: ${escapeSlack(clipped(d.what_happened, SLACK_LONG_TEXT_MAX))}`);
  }
  lines.push(`Submitted by: ${escapeSlack(request.submitter_email || 'unknown')}`);
  lines.push(clientUrl);
  return lines.join('\n');
}
