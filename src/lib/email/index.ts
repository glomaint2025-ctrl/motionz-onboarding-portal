/**
 * Transactional email delivery via Resend (RESEND_API_KEY) or Brevo (BREVO_API_KEY).
 *
 * Without a provider key the message is logged to the server console instead of sent,
 * so local development and tests keep working. In production a missing key is an error.
 */

export interface EmailMessage {
  to: string;
  toName?: string;
  subject: string;
  html: string;
  text: string;
  tags?: string[];
}

export interface EmailResult {
  delivered: boolean;
  messageId?: string;
  error?: string;
}

const BREVO_ENDPOINT = 'https://api.brevo.com/v3/smtp/email';
const RESEND_ENDPOINT = 'https://api.resend.com/emails';

export function isEmailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY || process.env.BREVO_API_KEY);
}

function sender() {
  return {
    email: process.env.EMAIL_FROM_ADDRESS || 'onboarding@resend.dev',
    name: process.env.EMAIL_FROM_NAME || 'Motionz Portal',
  };
}

/**
 * Raw links may only be echoed back in API responses during local development
 * when no email provider is configured. Never in production.
 */
export function canExposeDevLinks(): boolean {
  return process.env.NODE_ENV !== 'production' && !isEmailConfigured();
}

export async function sendEmail(message: EmailMessage): Promise<EmailResult> {
  if (process.env.RESEND_API_KEY) {
    return sendViaResend(process.env.RESEND_API_KEY, message);
  }

  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey) {
    if (process.env.NODE_ENV === 'production') {
      console.error(`[email] No email provider key (RESEND_API_KEY / BREVO_API_KEY) is set; could not send "${message.subject}" to ${message.to}.`);
      return { delivered: false, error: 'Email provider is not configured.' };
    }
    console.info(`[email:dev] To: ${message.to}\n[email:dev] Subject: ${message.subject}\n${message.text}`);
    return { delivered: false };
  }

  try {
    const res = await fetch(BREVO_ENDPOINT, {
      method: 'POST',
      headers: {
        'api-key': apiKey,
        'content-type': 'application/json',
        accept: 'application/json',
      },
      body: JSON.stringify({
        sender: sender(),
        to: [{ email: message.to, ...(message.toName ? { name: message.toName } : {}) }],
        subject: message.subject,
        htmlContent: message.html,
        textContent: message.text,
        tags: message.tags,
      }),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      console.error(`[email] Brevo rejected "${message.subject}" to ${message.to}: ${res.status} ${detail}`);
      return { delivered: false, error: `Brevo responded with ${res.status}.` };
    }

    const data = (await res.json().catch(() => ({}))) as { messageId?: string };
    return { delivered: true, messageId: data.messageId };
  } catch (err: any) {
    console.error(`[email] Failed to reach Brevo for "${message.subject}" to ${message.to}:`, err?.message);
    return { delivered: false, error: 'Could not reach the email provider.' };
  }
}

async function sendViaResend(apiKey: string, message: EmailMessage): Promise<EmailResult> {
  const from = sender();
  try {
    const res = await fetch(RESEND_ENDPOINT, {
      method: 'POST',
      headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        from: `${from.name} <${from.email}>`,
        to: [message.to],
        subject: message.subject,
        html: message.html,
        text: message.text,
        tags: message.tags?.map((t) => ({ name: 'type', value: t.replace(/[^a-zA-Z0-9_-]/g, '_') })),
      }),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      console.error(`[email] Resend rejected "${message.subject}" to ${message.to}: ${res.status} ${detail}`);
      return { delivered: false, error: `Resend responded with ${res.status}.` };
    }

    const data = (await res.json().catch(() => ({}))) as { id?: string };
    return { delivered: true, messageId: data.id };
  } catch (err: any) {
    console.error(`[email] Failed to reach Resend for "${message.subject}" to ${message.to}:`, err?.message);
    return { delivered: false, error: 'Could not reach the email provider.' };
  }
}

export * from './templates';
