/**
 * Plain, text-first transactional email templates (no images or icons, per NFR-105).
 */
import type { EmailMessage } from './index';

const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

function layout(heading: string, paragraphs: string[], action?: { label: string; url: string }, footer?: string): string {
  const body = paragraphs.map((p) => `<p style="margin:0 0 16px;line-height:1.5;">${escapeHtml(p)}</p>`).join('');
  const button = action
    ? `<p style="margin:24px 0;"><a href="${escapeHtml(action.url)}" style="background:#111827;color:#ffffff;padding:12px 20px;border-radius:6px;text-decoration:none;display:inline-block;">${escapeHtml(action.label)}</a></p>
       <p style="margin:0 0 16px;font-size:13px;color:#6b7280;line-height:1.5;">If the button does not work, copy this link into your browser:<br>${escapeHtml(action.url)}</p>`
    : '';
  const foot = footer ? `<p style="margin:24px 0 0;font-size:12px;color:#9ca3af;">${escapeHtml(footer)}</p>` : '';
  return `<!doctype html><html><body style="margin:0;padding:24px;background:#f9fafb;font-family:Arial,Helvetica,sans-serif;color:#111827;">
<div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:8px;padding:32px;">
<p style="margin:0 0 24px;font-weight:bold;letter-spacing:0.04em;">MOTIONZ</p>
<h1 style="margin:0 0 16px;font-size:20px;">${escapeHtml(heading)}</h1>${body}${button}${foot}
</div></body></html>`;
}

function text(heading: string, paragraphs: string[], action?: { label: string; url: string }, footer?: string): string {
  return [heading, '', ...paragraphs, ...(action ? ['', `${action.label}: ${action.url}`] : []), ...(footer ? ['', footer] : [])].join('\n');
}

function build(to: string, subject: string, heading: string, paragraphs: string[], action?: { label: string; url: string }, footer?: string, tags?: string[]): EmailMessage {
  return {
    to,
    subject,
    html: layout(heading, paragraphs, action, footer),
    text: text(heading, paragraphs, action, footer),
    tags,
  };
}

export function invitationEmail(params: { to: string; url: string; companyName?: string; invitedBy?: string; expiresInHours?: number }): EmailMessage {
  const company = params.companyName || 'your company';
  return build(
    params.to,
    `You're invited to the ${company} Motionz portal`,
    'Your portal is ready',
    [
      params.invitedBy
        ? `${params.invitedBy} has invited you to the Motionz client portal for ${company}.`
        : `You have been invited to the Motionz client portal for ${company}.`,
      'Use the button below to set your password and sign in.',
    ],
    { label: 'Activate my access', url: params.url },
    `This link works once and expires in ${params.expiresInHours || 72} hours. If you were not expecting this email, you can ignore it.`,
    ['invitation']
  );
}

export function magicLinkEmail(params: { to: string; url: string }): EmailMessage {
  return build(
    params.to,
    'Your Motionz portal sign-in link',
    'Sign in to your portal',
    ['Use the button below to sign in. No password needed.'],
    { label: 'Sign in', url: params.url },
    'This link works once and expires soon. If you did not request it, you can ignore this email.',
    ['magic-link']
  );
}

export function passwordResetEmail(params: { to: string; url: string; expiresInMinutes: number }): EmailMessage {
  return build(
    params.to,
    'Reset your Motionz portal password',
    'Reset your password',
    ['We received a request to reset the password for this account.'],
    { label: 'Choose a new password', url: params.url },
    `This link expires in ${params.expiresInMinutes} minutes. If you did not request a reset, you can ignore this email and your password will stay the same.`,
    ['password-reset']
  );
}

export function staffLoginCodeEmail(params: { to: string; code: string; expiresInMinutes: number }): EmailMessage {
  const message = build(
    params.to,
    'Your Motionz sign-in code',
    'Your sign-in code',
    [
      'Enter this code to finish signing in to the Motionz portal:',
      params.code,
      `This code expires in ${params.expiresInMinutes} minutes and works once.`,
    ],
    undefined,
    "If this wasn't you, someone has your password. Change your password right away and tell a Motionz administrator.",
    ['staff-login-code']
  );
  // Same content as the text part, with the code shown large.
  const plain = `<p style="margin:0 0 16px;line-height:1.5;">${escapeHtml(params.code)}</p>`;
  const large = `<p style="margin:0 0 16px;font-size:32px;font-weight:bold;letter-spacing:0.3em;font-family:'Courier New',Courier,monospace;">${escapeHtml(params.code)}</p>`;
  return { ...message, html: message.html.replace(plain, () => large) };
}

export function onboardingSubmittedEmail(params: {
  to: string;
  companyName: string;
  portalUrl: string;
  fields: Record<string, string>;
  /** False when the email on the form matches no client in the portal yet. */
  matched?: boolean;
}): EmailMessage {
  const matched = params.matched !== false;
  const lines = Object.entries(params.fields)
    .filter(([, v]) => v)
    .map(([k, v]) => `${k}: ${v}`);
  return build(
    params.to,
    `Onboarding form submitted: ${params.companyName}`,
    `${params.companyName} submitted their onboarding form`,
    [
      matched
        ? 'The client has completed their onboarding form. You can start setting up their ads.'
        : 'The email on this form does not match any client in the portal yet. Link it to the right client in Settings & Integrations, then start their setup.',
      ...lines,
    ],
    { label: matched ? 'Open client in portal' : 'Link it to a client', url: params.portalUrl },
    undefined,
    ['onboarding-submitted']
  );
}

export function websiteChangeRequestEmail(params: {
  to: string;
  toName?: string;
  companyName: string;
  requestedBy: string;
  title: string;
  description: string;
  targetPageUrl?: string;
  isUrgent?: boolean;
  portalUrl: string;
  /** Files the client attached. `url` is a time-limited signed link. */
  attachments?: { name: string; url: string; size?: number }[];
}): EmailMessage {
  const paragraphs = [
    `${params.requestedBy} from ${params.companyName} submitted a website change request through the client portal.`,
    `Title: ${params.title}`,
    ...(params.targetPageUrl ? [`Page: ${params.targetPageUrl}`] : []),
    `Priority: ${params.isUrgent ? 'Urgent' : 'Normal'}`,
    'Description:',
    params.description,
  ];
  const attachments = params.attachments || [];
  const sizeLabel = (bytes?: number) =>
    typeof bytes === 'number' ? ` (${bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`})` : '';
  const attachmentHeading = `Attachments (${attachments.length}) - links expire in 7 days:`;
  const subject = `${params.isUrgent ? '[Urgent] ' : ''}Website change request: ${params.companyName}`;
  const heading = `${params.companyName} requested a website change`;
  const action = { label: 'Open client', url: params.portalUrl };
  const footer = 'Reply to the client once the change is scheduled or done.';
  let message = build(params.to, subject, heading, paragraphs, action, footer, ['website-change-request']);
  if (attachments.length > 0) {
    // Text part: one "name (size): url" line per file. HTML part: the same list with clickable links.
    const textVersion = build(
      params.to,
      subject,
      heading,
      [...paragraphs, attachmentHeading, ...attachments.map((a) => `${a.name}${sizeLabel(a.size)}: ${a.url}`)],
      action,
      footer
    ).text;
    const items = attachments
      .map(
        (a) =>
          `<li style="margin:0 0 6px;"><a href="${escapeHtml(a.url)}" style="color:#1d4ed8;">${escapeHtml(a.name)}</a>${escapeHtml(sizeLabel(a.size))}</li>`
      )
      .join('');
    const block = `<p style="margin:0 0 8px;line-height:1.5;">${escapeHtml(attachmentHeading)}</p><ul style="margin:0 0 16px;padding-left:20px;line-height:1.5;">${items}</ul>`;
    const buttonMarker = '<p style="margin:24px 0;">';
    message = { ...message, text: textVersion, html: message.html.replace(buttonMarker, () => block + buttonMarker) };
  }
  return params.toName ? { ...message, toName: params.toName } : message;
}

/** A Lead Replacement or Unresponsive Lead form sent from the portal, for the lead review team. */
export function leadRequestEmail(params: {
  to: string;
  type: 'replacement' | 'unresponsive';
  companyName: string;
  leadName: string;
  leadPhone: string;
  /** The outcome in words, e.g. "Approved", "Not replaceable", "Needs review", "Sent to the marketing team". */
  outcome: string;
  outcomeReason: string;
  /** The answers as label and text, in form order. */
  fields: [string, string][];
  submittedBy: string;
  portalUrl: string;
}): EmailMessage {
  const isReplacement = params.type === 'replacement';
  const subject = isReplacement
    ? `Lead replacement request (${params.outcome}): ${params.leadName} — ${params.companyName}`
    : `Unresponsive lead: ${params.leadName} — ${params.companyName}`;
  const heading = isReplacement
    ? `${params.companyName} asked for a lead replacement`
    : `${params.companyName} reported an unresponsive lead`;
  const paragraphs = [
    `${params.submittedBy} sent this from the client portal.`,
    `Lead: ${params.leadName}`,
    `Lead phone: ${params.leadPhone}`,
    ...params.fields.filter(([, value]) => value).map(([label, value]) => `${label}: ${value}`),
    `Outcome: ${params.outcome}`,
    ...(params.outcomeReason ? [`Reason: ${params.outcomeReason}`] : []),
  ];
  const footer = isReplacement
    ? 'The outcome above was worked out by the portal from the replacement rules and shown to the client. Mark the request done in the portal once it is handled.'
    : 'Run your follow-ups with this lead, then mark the request done in the portal.';
  return build(params.to, subject, heading, paragraphs, { label: 'Open client in portal', url: params.portalUrl }, footer, ['lead-request']);
}
