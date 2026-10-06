/**
 * The optional automation link (Admin → Settings & Integrations → Automations): a GoHighLevel
 * Inbound Webhook the portal sends every lead form submission to.
 * No server-only imports: the settings card and the API both check a link with this.
 */

export const WEBHOOK_URL_MAX = 500;

/** Host names that only mean something inside a private network. */
const PRIVATE_SUFFIXES = ['.localhost', '.local', '.internal', '.lan', '.home', '.intranet', '.corp', '.test', '.invalid', '.example'];

export type WebhookUrlCheck = { ok: true; url: string } | { ok: false; error: string };

/**
 * Accepts an empty value (automation off) or a public https link. Refuses http, links with a
 * username or password, IP addresses, localhost and private network names, so the portal can never
 * be pointed at something inside its own network.
 */
export function checkWebhookUrl(input: unknown): WebhookUrlCheck {
  if (input === undefined || input === null) return { ok: true, url: '' };
  if (typeof input !== 'string') return { ok: false, error: 'Paste the webhook link as text.' };
  const raw = input.trim();
  if (!raw) return { ok: true, url: '' };
  if (raw.length > WEBHOOK_URL_MAX) return { ok: false, error: `That link is too long (${WEBHOOK_URL_MAX} characters at most).` };

  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return { ok: false, error: 'That does not look like a link. Copy the Inbound Webhook link from GoHighLevel and paste it again.' };
  }
  if (parsed.protocol !== 'https:') return { ok: false, error: 'The link must start with https://.' };
  if (parsed.username || parsed.password) return { ok: false, error: 'The link must not contain a username or password.' };

  const host = parsed.hostname.toLowerCase().replace(/\.$/, '');
  // The URL parser already turns forms like 2130706433 or 0x7f.1 into dotted numbers.
  const isIpLiteral = host.startsWith('[') || host.includes(':') || /^[\d.]+$/.test(host);
  const isPrivateName = host === 'localhost' || !host.includes('.') || PRIVATE_SUFFIXES.some((suffix) => host.endsWith(suffix));
  if (isIpLiteral || isPrivateName) {
    return { ok: false, error: 'That address is not allowed. Use the public https link GoHighLevel gives you.' };
  }
  return { ok: true, url: parsed.toString() };
}
