/**
 * Posting to Slack (server only). Used when a lead form is saved and by "Send a test message".
 */
import { appSettingsRepository } from '../db/repositories';
import { checkSlackWebhookUrl, SLACK_TIMEOUT_MS } from './slack';

export type SlackPostResult = { ok: true } | { ok: false; error: string };

/** The saved Slack webhook link, or '' when Slack messages are off. */
export async function savedSlackWebhookUrl(): Promise<string> {
  return (await appSettingsRepository.get('slack')).lead_request_slack_webhook_url || '';
}

/**
 * Posts one message to a Slack Incoming Webhook. Never throws: a link that is not a Slack link,
 * cannot be reached, answers with an error or takes longer than 5 seconds comes back as
 * `{ ok: false, error }` in plain words (Slack's own short answer is included).
 */
export async function postToSlack(url: string, text: string): Promise<SlackPostResult> {
  // Checked again here: a link saved some other way must still be a Slack link.
  const check = checkSlackWebhookUrl(url);
  if (!check.ok || !check.url) return { ok: false, error: 'The saved Slack link is not a Slack webhook link.' };
  try {
    const res = await fetch(check.url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text }),
      // Never follow a redirect away from Slack.
      redirect: 'error',
      signal: AbortSignal.timeout(SLACK_TIMEOUT_MS),
    });
    if (res.ok) return { ok: true };
    const answer = (await res.text().catch(() => '')).trim().slice(0, 120);
    return { ok: false, error: `Slack answered with an error (${res.status}${answer ? `: ${answer}` : ''}).` };
  } catch (err: any) {
    return {
      ok: false,
      error:
        err?.name === 'TimeoutError' || err?.name === 'AbortError'
          ? 'Slack did not answer within 5 seconds.'
          : `Slack could not be reached: ${String(err?.message || err).slice(0, 200)}`,
    };
  }
}
