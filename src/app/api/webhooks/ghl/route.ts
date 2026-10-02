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
} from '@/lib/db/repositories';
import { logAuditEvent } from '@/lib/db';
import { resolveBaseUrl } from '@/lib/auth/security-utils';
import { sendEmail, onboardingSubmittedEmail } from '@/lib/email';
import type { Tenant } from '@/lib/db/schema';

/**
 * GoHighLevel webhook receiver. See docs/07-integrations/ghl-workflows.md for the workflow setup.
 *
 * Events (from `customData.event` on GHL workflow "Webhook" actions, or `type` on marketplace events):
 * - lead            Opportunity created / stage changed in a client's sub-account. Routed by location id.
 * - csm_call        Call booked with a CSM on the Motionz calendar. Routed by the client's email.
 * - onboarding_form Onboarding form submitted. Routed by the submitter's email.
 * - ContactCreate / ContactUpdate / AppointmentCreate / AppointmentUpdate (marketplace format).
 *
 * Authentication: the shared secret GHL_WEBHOOK_SECRET, sent either as the
 * `x-motionz-webhook-secret` header or as `customData.secret` (GHL's standard Webhook action
 * cannot set headers). Without a configured secret the endpoint only works outside production.
 */

type Payload = Record<string, any>;

const str = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim() ? value.trim() : typeof value === 'number' ? String(value) : undefined;

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

// Fields that describe the webhook itself rather than the client's answers.
const META_KEYS = new Set([
  'customData', 'secret', 'location', 'workflow', 'triggerData', 'contact', 'attributionSource',
  'lastAttributionSource', 'contact_id', 'contact_type', 'date_created', 'tags', 'type', 'locationId',
  'user', 'company', 'id', 'calendar', 'opportunity', 'contact_source', 'timezone',
]);

function extractAnswers(p: Payload): Record<string, string> {
  const answers: Record<string, string> = {};
  for (const [key, value] of Object.entries(p)) {
    if (META_KEYS.has(key) || value === null || value === undefined || value === '') continue;
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      answers[key] = String(value);
    } else if (Array.isArray(value) && value.every((v) => typeof v === 'string')) {
      answers[key] = value.join(', ');
    }
  }
  return answers;
}

async function handleLead(p: Payload) {
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

async function handleCsmCall(p: Payload) {
  const tenant = await tenantByEmail(contactEmail(p));
  if (!tenant) return { ignored: 'No client matches this contact email.' };

  const cal = p.calendar || {};
  const appointmentId = str(cal.appointmentId) || str(cal.id) || str(p.customData?.appointment_id);
  const startTime = str(cal.startTime) || str(p.customData?.start_time);
  if (!appointmentId || !startTime) return { error: 'Calendar appointment id and start time are required.' };

  const parsed = new Date(startTime);
  await appointmentRepository.upsertByGhlAppointmentId(tenant.id, appointmentId, {
    contact_name: str(cal.title) || 'Call with your CSM',
    appointment_time: isNaN(parsed.getTime()) ? startTime : parsed.toISOString(),
    status: (str(cal.appoinmentStatus) || str(cal.appointmentStatus) || str(cal.status) || 'confirmed').toLowerCase(),
    notes: 'csm_call',
  });
  return { tenant };
}

async function handleOnboardingForm(request: NextRequest, p: Payload) {
  const email = contactEmail(p);
  const tenant = await tenantByEmail(email);
  const answers = extractAnswers(p);

  await onboardingSubmissionRepository.create({
    tenant_id: tenant?.id ?? null,
    submitter_email: email,
    ghl_contact_id: str(p.contact_id) || str(p.contact?.id),
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
          portalUrl: tenant ? `${baseUrl}/admin/clients/${tenant.id}` : `${baseUrl}/admin`,
          fields: tenant ? answers : { Note: 'No portal client matches this email yet.', 'Submitted by': email || '', ...answers },
        })
      )
    )
  );

  return { tenant: tenant || undefined, notified: recipients.size };
}

async function handleMarketplaceEvent(type: string, p: Payload) {
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
  } else if (type === 'AppointmentCreate' || type === 'AppointmentUpdate') {
    const appointment = p.appointment || p;
    const appointmentId = str(appointment?.id);
    const startTime = str(appointment?.startTime);
    if (!appointmentId || !startTime) return { error: 'Appointment id and startTime are required.' };
    await appointmentRepository.upsertByGhlAppointmentId(tenant.id, appointmentId, {
      contact_name: str(appointment.contactName) || str(appointment.title) || 'Call',
      appointment_time: startTime,
      status: str(appointment.appointmentStatus) || str(appointment.status) || 'confirmed',
      notes: str(appointment.notes),
    });
  }
  return { tenant };
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
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const event = str(payload?.customData?.event) || str(payload?.type) || 'unknown';
    let result: { tenant?: Tenant; ignored?: string; error?: string; notified?: number };

    if (event === 'lead') result = await handleLead(payload);
    else if (event === 'csm_call') result = await handleCsmCall(payload);
    else if (event === 'onboarding_form') result = await handleOnboardingForm(request, payload);
    else result = await handleMarketplaceEvent(event, payload);

    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    if (result.ignored && event !== 'onboarding_form') {
      // 200 so GHL does not retry an event we will never be able to place.
      return NextResponse.json({ received: true, ignored: true, reason: result.ignored });
    }

    await logAuditEvent({
      tenantId: result.tenant?.id,
      actorEmail: 'webhook@gohighlevel.com',
      actorRole: 'webhook',
      action: `ghl.webhook.${event}`,
      resourceType: 'webhook',
      resourceId: str(payload?.location?.id) || str(payload?.locationId) || 'n/a',
      details: { event, matched: Boolean(result.tenant), notified: result.notified },
    });

    return NextResponse.json({ received: true, eventType: event, matched: Boolean(result.tenant) });
  } catch (err: any) {
    console.error('[ghl-webhook] Failed to process event:', err?.message);
    return NextResponse.json({ error: 'Failed to process GoHighLevel webhook' }, { status: 500 });
  }
}
