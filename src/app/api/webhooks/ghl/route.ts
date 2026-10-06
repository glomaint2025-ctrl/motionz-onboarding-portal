import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import {
  tenantRepository,
  leadRepository,
  appointmentRepository,
  userRepository,
  csmAssignmentRepository,
  onboardingSubmissionRepository,
  appSettingsRepository,
  securityEventRepository,
} from '@/lib/db/repositories';
import { logAuditEvent } from '@/lib/db';
import { resolveBaseUrl, enforceRateLimit, getClientIp } from '@/lib/auth/security-utils';
import { sendEmail, onboardingSubmittedEmail } from '@/lib/email';
import { extractAnswers } from '@/lib/onboarding/answers';
import type { Tenant } from '@/lib/db/schema';

/**
 * GoHighLevel webhook receiver. See docs/07-integrations/ghl-workflows.md for the workflow setup.
 *
 * Events (from `customData.event` on GHL workflow "Webhook" actions, or `type` on marketplace events):
 * - lead            Opportunity created / stage changed in a client's sub-account. Routed by location id.
 * - csm_call        Call booked with a CSM on the Motionz calendar. Routed by the client's email.
 * - onboarding_form Onboarding form submitted. Routed by the submitter's email.
 * - ContactCreate / ContactUpdate (marketplace format). Other marketplace events are ignored.
 *
 * Authentication: the shared secret GHL_WEBHOOK_SECRET, sent either as the
 * `x-motionz-webhook-secret` header or as `customData.secret` (GHL's standard Webhook action
 * cannot set headers). Without a configured secret the endpoint only works outside production.
 *
 * Nothing is dropped silently: an event the portal cannot place is recorded in the audit log as
 * `ghl.webhook.ignored` (answered 200), a malformed one as `ghl.webhook.rejected` (answered 400),
 * and a wrong secret as a security event. Those records hold the event type, the reason and the
 * location id or contact email; never the secret and never the full payload.
 */

type Payload = Record<string, any>;

interface HandlerResult {
  tenant?: Tenant;
  ignored?: string;
  error?: string;
  notified?: number;
  /** Extra facts for the audit entry of an ignored or rejected event (e.g. the booking email). */
  info?: Record<string, string | undefined>;
}

const TEN_MINUTES = 10 * 60 * 1000;

const str = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim() ? value.trim() : typeof value === 'number' ? String(value) : undefined;

/** audit_logs.action and resource_id are VARCHAR(100); these values come from the sender. */
const clip = (value: string | undefined, max = 100): string | undefined => (value ? value.slice(0, max) : undefined);
const locationOf = (p: Payload): string | undefined => clip(str(p?.location?.id) || str(p?.locationId));

function secretMatches(provided: string | undefined, secret: string): boolean {
  if (!provided) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(secret);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function authorize(request: NextRequest, payload: Payload): { ok: boolean; status?: number; error?: string } {
  const secret = process.env.GHL_WEBHOOK_SECRET;
  if (!secret) {
    return process.env.NODE_ENV === 'production'
      ? { ok: false, status: 503, error: 'Webhook secret is not configured.' }
      : { ok: true };
  }
  const provided = request.headers.get('x-motionz-webhook-secret') || str(payload?.customData?.secret);
  return secretMatches(provided, secret) ? { ok: true } : { ok: false, status: 401, error: 'Invalid webhook credentials.' };
}

async function tenantByLocation(locationId: string | undefined): Promise<Tenant | undefined> {
  if (!locationId) return undefined;
  return (await tenantRepository.list({ limit: 1000 })).find((t) => t.ghl_location_id === locationId);
}

/** A client is identified by the email of any of its portal users, or the company's primary email. */
async function tenantByEmail(email: string | undefined): Promise<Tenant | null> {
  if (!email) return null;
  const normalized = email.toLowerCase();
  const user = await userRepository.findByEmail(normalized);
  if (user?.tenant_id) return tenantRepository.findById(user.tenant_id);
  return tenantRepository.findByEmail(normalized);
}

const contactEmail = (p: Payload) => str(p.email) || str(p.contact?.email);

/** Key-order independent JSON: Postgres JSONB does not keep the order answers were sent in. */
function stableJson(value: Record<string, unknown> | null | undefined): string {
  const source = value || {};
  return JSON.stringify(Object.keys(source).sort().map((key) => [key, source[key]]));
}

async function handleLead(p: Payload): Promise<HandlerResult> {
  const tenant = await tenantByLocation(str(p.location?.id) || str(p.locationId));
  if (!tenant) return { ignored: 'Unknown or missing location id.' };

  const contactId = str(p.contact_id) || str(p.contact?.id);
  if (!contactId) return { error: 'contact_id is required.' };

  const stage =
    str(p.customData?.stage) || str(p.pipeline_stage) || str(p.pipleline_stage) || str(p.opportunity?.pipeline_stage) || str(p.status);

  await leadRepository.upsertByGhlContactId(tenant.id, contactId, {
    first_name: str(p.first_name),
    last_name: str(p.last_name),
    email: str(p.email),
    phone: str(p.phone),
    source: str(p.opportunity_source) || str(p.contact_source) || str(p.source),
    ...(stage ? { status: stage } : {}),
  });
  return { tenant };
}

async function handleCsmCall(p: Payload): Promise<HandlerResult> {
  const email = contactEmail(p);
  const cal = p.calendar || {};
  const appointmentId = str(cal.appointmentId) || str(cal.id) || str(p.customData?.appointment_id);
  const startTime = str(cal.startTime) || str(p.customData?.start_time);
  // Shown under Audit Logs, so staff can see a booking made with an email no client uses.
  const info = { email: clip(email?.toLowerCase(), 255), start_time: clip(startTime) };

  const tenant = await tenantByEmail(email);
  if (!tenant) return { ignored: 'No client matches this contact email.', info };

  if (!appointmentId || !startTime) return { error: 'Calendar appointment id and start time are required.', info };

  const parsed = new Date(startTime);
  await appointmentRepository.upsertByGhlAppointmentId(tenant.id, appointmentId, {
    contact_name: str(cal.title) || 'Call with your CSM',
    appointment_time: isNaN(parsed.getTime()) ? startTime : parsed.toISOString(),
    status: (str(cal.appoinmentStatus) || str(cal.appointmentStatus) || str(cal.status) || 'confirmed').toLowerCase(),
    notes: 'csm_call',
  });
  return { tenant };
}

async function handleOnboardingForm(request: NextRequest, p: Payload): Promise<HandlerResult> {
  const email = contactEmail(p);
  const tenant = await tenantByEmail(email);
  const answers = extractAnswers(p);
  const contactId = str(p.contact_id) || str(p.contact?.id);

  // GHL retries webhooks; skip an identical submission received in the last 10 minutes.
  const recent = await onboardingSubmissionRepository.listByTenant(tenant?.id ?? null, 5);
  const duplicate = recent.find(
    (r) =>
      r.submitter_email === email &&
      Date.now() - new Date(r.submitted_at).getTime() < 10 * 60 * 1000 &&
      stableJson(r.answers) === stableJson(answers)
  );
  if (duplicate) {
    return { tenant: tenant || undefined, ignored: 'Duplicate submission.', info: { email: clip(email?.toLowerCase(), 255) } };
  }

  await onboardingSubmissionRepository.create({
    tenant_id: tenant?.id ?? null,
    submitter_email: email,
    ghl_contact_id: contactId,
    answers,
  });

  // Notify the media buyer list (and the assigned CSM) immediately (client answers 5.2 / 5.3).
  const settings = await appSettingsRepository.get('notifications');
  const recipients = new Set(settings.onboarding_form_recipients.map((r) => r.toLowerCase()));
  if (process.env.MEDIA_BUYER_EMAIL) recipients.add(process.env.MEDIA_BUYER_EMAIL.toLowerCase());
  if (tenant && settings.notify_assigned_csm) {
    const assignment = await csmAssignmentRepository.findByTenant(tenant.id);
    const csm = assignment ? await userRepository.findById(assignment.csm_user_id) : null;
    if (csm?.email) recipients.add(csm.email.toLowerCase());
  }

  const baseUrl = resolveBaseUrl(request);
  const companyName = tenant?.name || answers['DBA Business Name'] || email || 'Unknown client';
  await Promise.all(
    Array.from(recipients).map((to) =>
      sendEmail(
        onboardingSubmittedEmail({
          to,
          companyName,
          portalUrl: tenant ? `${baseUrl}/admin/clients/${tenant.id}` : `${baseUrl}/admin/integrations`,
          fields: tenant ? answers : { 'Submitted by': email || '', ...answers },
          matched: Boolean(tenant),
        })
      )
    )
  );

  return { tenant: tenant || undefined, notified: recipients.size };
}

async function handleMarketplaceEvent(type: string, p: Payload): Promise<HandlerResult> {
  const tenant = await tenantByLocation(str(p.locationId) || str(p.location?.id));
  if (!tenant) return { ignored: 'Unknown or missing location id.' };

  if (type === 'ContactCreate' || type === 'ContactUpdate') {
    const contact = p.contact || p;
    const contactId = str(contact?.id);
    if (!contactId) return { error: 'Contact id is required.' };
    await leadRepository.upsertByGhlContactId(tenant.id, contactId, {
      first_name: str(contact.firstName),
      last_name: str(contact.lastName),
      email: str(contact.email),
      phone: str(contact.phone),
      source: str(contact.source),
      ...(str(contact.status) ? { status: str(contact.status)! } : {}),
    });
  } else {
    // Appointments in a client's own sub-account are homeowner bookings, not CSM calls (client answer 2.1).
    // CSM calls arrive as `csm_call` events from Motionz's own calendar.
    return { ignored: `Event type ${type} is not used by the portal.` };
  }
  return { tenant };
}

/**
 * Records a request with a missing or wrong secret as a security event. Rate limited (overall and
 * per sender) so a flood of bad requests cannot fill the table; never throws.
 */
async function recordInvalidSecret(request: NextRequest, payload: Payload): Promise<void> {
  try {
    const ip = clip(getClientIp(request)) || 'unknown';
    const overall = await enforceRateLimit('ghl_webhook_bad_secret:all', { maxRequests: 30, windowMs: TEN_MINUTES });
    if (!overall.allowed) return;
    const perSender = await enforceRateLimit(`ghl_webhook_bad_secret:${ip}`, { maxRequests: 5, windowMs: TEN_MINUTES });
    if (!perSender.allowed) return;

    const sent = Boolean(request.headers.get('x-motionz-webhook-secret') || str(payload?.customData?.secret));
    await securityEventRepository.create({
      event_type: 'ghl_webhook_invalid_secret',
      severity: 'medium',
      details: {
        reason: sent ? 'Wrong webhook secret.' : 'No webhook secret was sent.',
        eventType: clip(str(payload?.customData?.event) || str(payload?.type), 50) || 'unknown',
        location: locationOf(payload),
        ip,
      },
    });
  } catch (err: any) {
    console.error('[ghl-webhook] Could not record a rejected secret:', err?.message);
  }
}

/**
 * Audit entry for an event that was not stored: ignored (cannot be placed) or rejected (malformed).
 * Holds the event type, the reason and the location id or contact email, so staff can see why data
 * did not arrive. Rate limited per sender so a misfiring workflow cannot fill the table; never throws.
 */
async function recordNotStored(kind: 'ignored' | 'rejected', event: string, payload: Payload, result: HandlerResult): Promise<void> {
  try {
    const location = locationOf(payload);
    const sender = result.info?.email || location || 'none';
    const limit = await enforceRateLimit(`ghl_webhook_${kind}:${event}:${sender}`, { maxRequests: 20, windowMs: TEN_MINUTES });
    if (!limit.allowed) return;

    await logAuditEvent({
      tenantId: result.tenant?.id,
      actorEmail: 'webhook@gohighlevel.com',
      actorRole: 'webhook',
      action: `ghl.webhook.${kind}`,
      resourceType: 'webhook',
      resourceId: location || 'n/a',
      details: { reason: result.ignored || result.error, eventType: event, location, ...result.info },
    });
  } catch (err: any) {
    console.error('[ghl-webhook] Could not record an event that was not stored:', err?.message);
  }
}

export async function POST(request: NextRequest) {
  let payload: Payload;
  try {
    payload = JSON.parse(await request.text());
  } catch {
    return NextResponse.json({ error: 'Invalid JSON payload.' }, { status: 400 });
  }

  const auth = authorize(request, payload);
  if (!auth.ok) {
    if (auth.status === 401) await recordInvalidSecret(request, payload);
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const event = clip(str(payload?.customData?.event) || str(payload?.type), 50) || 'unknown';
    let result: HandlerResult;

    if (event === 'lead') result = await handleLead(payload);
    else if (event === 'csm_call') result = await handleCsmCall(payload);
    else if (event === 'onboarding_form') result = await handleOnboardingForm(request, payload);
    else result = await handleMarketplaceEvent(event, payload);

    if (result.error) {
      await recordNotStored('rejected', event, payload, result);
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    if (result.ignored) {
      await recordNotStored('ignored', event, payload, result);
      // 200 so GHL does not retry an event we will never be able to place.
      return NextResponse.json({ received: true, ignored: true, reason: result.ignored });
    }

    await logAuditEvent({
      tenantId: result.tenant?.id,
      actorEmail: 'webhook@gohighlevel.com',
      actorRole: 'webhook',
      action: `ghl.webhook.${event}`,
      resourceType: 'webhook',
      resourceId: locationOf(payload) || 'n/a',
      details: { event, matched: Boolean(result.tenant), notified: result.notified },
    });

    return NextResponse.json({ received: true, eventType: event, matched: Boolean(result.tenant) });
  } catch (err: any) {
    console.error('[ghl-webhook] Failed to process event:', err?.message);
    return NextResponse.json({ error: 'Failed to process GoHighLevel webhook' }, { status: 500 });
  }
}
