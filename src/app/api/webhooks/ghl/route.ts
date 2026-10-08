import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import {
  tenantRepository,
  leadRepository,
  appointmentRepository,
  userRepository,
  onboardingSubmissionRepository,
  securityEventRepository,
} from '@/lib/db/repositories';
import { logAuditEvent } from '@/lib/db';
import { resolveBaseUrl, enforceRateLimit, getClientIp } from '@/lib/auth/security-utils';
import { extractAnswers } from '@/lib/onboarding/answers';
import { findRecentDuplicate, notifyOnboardingSubmitted } from '@/lib/onboarding/submissions';
import { getLeadSettings } from '@/lib/db/repositories/app-settings.repository';
import type { Tenant } from '@/lib/db/schema';

/**
 * GoHighLevel webhook receiver. See docs/07-integrations/ghl-workflows.md for the workflow setup.
 *
 * Events (from `customData.event` on GHL workflow "Webhook" actions, or `type` on marketplace events):
 * - lead            Opportunity created / stage changed in a client's sub-account. Routed by location id.
 * - lead_lost       Opportunity marked Lost (or Abandoned) in a client's sub-account: the lead is
 *                   removed from the portal. A `lead` event whose status says lost / abandoned,
 *                   or whose stage is named exactly "Lost" / "Abandoned", does the same.
 * - lead_unqualified The lead tag was taken off the contact: the lead is removed. Only used when a
 *                   lead tag is set under Admin → GHL Connect; with a tag set, a `lead` event for a
 *                   contact without that tag creates nothing (an existing lead is still updated).
 * - csm_call        Call booked with a CSM on the Motionz calendar. Routed by the client's email.
 * - onboarding_form Onboarding form submitted in GoHighLevel. Routed by the submitter's email.
 *                   (Clients now fill the form in inside the portal; this stays for an old workflow.)
 * - ContactCreate / ContactUpdate (marketplace format). The lead tag rule applies here too.
 *                   Other marketplace events are ignored.
 *
 * Authentication: the shared secret GHL_WEBHOOK_SECRET, sent either as the
 * `x-motionz-webhook-secret` header or as `customData.secret` (GHL's standard Webhook action
 * cannot set headers). Without a configured secret the endpoint only works outside production.
 *
 * Nothing is dropped silently: an event the portal cannot place is recorded in the audit log as
 * `ghl.webhook.ignored` (answered 200), a malformed one as `ghl.webhook.rejected` (answered 400),
 * and a wrong secret as a security event. A contact ignored for lacking the lead tag is recorded
 * with the tags that arrived (`tagsSeen`), at most 3 times per location per hour. Those records hold the event type, the reason and the
 * location id or contact email; never the secret and never the full payload.
 */

type Payload = Record<string, any>;

interface HandlerResult {
  tenant?: Tenant;
  ignored?: string;
  /**
   * With `ignored`: an everyday case that would bury the audit log if every event were written.
   * Only this many entries are written per key in the window; the rest are answered but not recorded.
   */
  auditLimit?: { key: string; maxRequests: number; windowMs: number };
  error?: string;
  notified?: number;
  /** Audit action to record instead of `ghl.webhook.<event>`, with extra facts for that entry. */
  action?: string;
  auditDetails?: Record<string, string | number | undefined>;
  /** Extra facts for the audit entry of an ignored or rejected event (e.g. the booking email). */
  info?: Record<string, string | undefined>;
}

const TEN_MINUTES = 10 * 60 * 1000;
const ONE_HOUR = 60 * 60 * 1000;
/** Audit entries per location per hour for contacts ignored because they lack the lead tag. */
const UNTAGGED_AUDIT_LIMIT = 3;

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
  // One indexed lookup. (This used to load every client on every event and search the list.)
  return (await tenantRepository.findByGhlLocationId(locationId)) || undefined;
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

const CLOSED_STATUSES = ['lost', 'abandoned'];
const isClosedWord = (value: string | undefined): boolean => Boolean(value) && CLOSED_STATUSES.includes(value!.toLowerCase());

/**
 * True when the event says the opportunity was marked Lost or Abandoned in GoHighLevel:
 * the `lead_lost` event, an opportunity status of lost / abandoned, or a pipeline stage named
 * exactly "Lost" / "Abandoned". A stage that only contains the word ("Lost Contact Attempt") is a
 * normal stage.
 */
function isLostOpportunity(event: string, p: Payload, stage: string | undefined): boolean {
  if (event === 'lead_lost') return true;
  const statuses = [p.customData?.status, p.status, p.opportunity?.status, p.opportunity_status];
  return statuses.some((status) => isClosedWord(str(status))) || isClosedWord(stage);
}

const normalizeTag = (tag: string): string => tag.trim().replace(/\s+/g, ' ').toLowerCase();

/** The keys an object may hold a tag's name under, e.g. { name: "Qualified" }. */
const TAG_NAME_KEYS = ['name', 'tag', 'label', 'value'];

/**
 * The tag names in a tags field, as written, in any shape GoHighLevel may send:
 * "a, Qualified; b | c", ["a", "Qualified"], [{ name: "Qualified" }, { tag: "a" }], or a list
 * written as JSON text ('["a","Qualified"]').
 */
function tagNamesIn(value: unknown, depth = 0): string[] {
  if (depth > 3 || value === null || value === undefined) return [];
  if (Array.isArray(value)) return value.slice(0, 200).flatMap((item) => tagNamesIn(item, depth + 1));
  if (typeof value === 'object') {
    const named = TAG_NAME_KEYS.map((key) => (value as Payload)[key]).find((v) => typeof v === 'string' && v.trim());
    return named ? [String(named).trim().replace(/\s+/g, ' ')] : [];
  }
  if (typeof value !== 'string') return [];
  const text = value.trim();
  if (!text) return [];
  if (text.startsWith('[') && text.endsWith(']')) {
    try {
      const parsed = JSON.parse(text);
      if (Array.isArray(parsed)) return tagNamesIn(parsed, depth + 1);
    } catch {
      // Not JSON: read it as a plain list below.
    }
  }
  // Commas, semicolons and pipes all separate tags. The comma-only split is kept as well, so a
  // tag whose own name holds a semicolon or pipe still matches.
  const pieces = [...text.split(/[,;|]/), ...text.split(',')].map((piece) => piece.trim().replace(/\s+/g, ' ')).filter(Boolean);
  return Array.from(new Set(pieces));
}

/** Every place a contact's tags may arrive in. */
const tagFieldsOf = (p: Payload): unknown[] => [p.tags, p.contact?.tags, p.customData?.tags, p.contact_tags, p.contactTags];

/** True when the contact carries the tag (any letter case or spacing) in any of the tag fields. */
function hasTag(p: Payload, tag: string): boolean {
  const wanted = normalizeTag(tag);
  return tagFieldsOf(p).some((field) => tagNamesIn(field).some((name) => normalizeTag(name) === wanted));
}

/**
 * The tags that arrived, for the audit log: "hot, new", "(none sent)" when the event has no tag
 * field at all, "(empty)" when a field came with nothing in it. At most 200 characters.
 */
function tagsSeen(p: Payload): string {
  const fields = tagFieldsOf(p).filter((field) => field !== undefined && field !== null);
  if (fields.length === 0) return '(none sent)';
  const names = Array.from(new Set(fields.flatMap((field) => tagNamesIn(field))));
  if (names.length > 0) return clip(names.join(', '), 200)!;
  const blank = fields.every((field) => (typeof field === 'string' && !field.trim()) || (Array.isArray(field) && field.length === 0));
  if (blank) return '(empty)';
  // Something arrived that the portal cannot read as tags: show a little of it.
  let raw = '';
  try {
    raw = JSON.stringify(fields.length === 1 ? fields[0] : fields) || '';
  } catch {
    raw = '';
  }
  return clip(`(not readable as tags) ${raw.replace(/\s+/g, ' ')}`, 200)!;
}

const fullName = (first: unknown, last: unknown): string | undefined =>
  clip(`${str(first) || ''} ${str(last) || ''}`.trim() || undefined, 200);

/**
 * The answer for a contact that lacks the lead tag and is not a lead yet. Every untagged contact in
 * every sub-account ends up here, so only a few entries per location per hour reach the audit log:
 * enough for staff to see what GoHighLevel is sending, never enough to bury the log.
 */
function untaggedResult(tenant: Tenant, p: Payload, requiredTag: string, contactName: string | undefined): HandlerResult {
  return {
    tenant,
    ignored: `Contact is not tagged "${requiredTag}" yet.`,
    auditLimit: { key: `ghl_webhook_untagged:${locationOf(p) || tenant.id}`, maxRequests: UNTAGGED_AUDIT_LIMIT, windowMs: ONE_HOUR },
    info: { contact: contactName, client: clip(tenant.name, 200), tagsSeen: tagsSeen(p) },
  };
}

/** Facts for the audit entry of a stored lead: who it was and, with the tag rule on, the tags that came with it. */
function acceptedDetails(tenant: Tenant, p: Payload, requiredTag: string, contactName: string | undefined) {
  return {
    ...(contactName ? { leadName: contactName } : {}),
    client: clip(tenant.name, 200),
    ...(requiredTag ? { tagsSeen: tagsSeen(p) } : {}),
  };
}

/** Removes the client's lead for that contact; `reason` is added to the audit entry when given. */
async function removeLead(tenant: Tenant, contactId: string, notFound: string, reason?: string): Promise<HandlerResult> {
  const removed = await leadRepository.deleteByGhlContactId(tenant.id, contactId);
  if (removed.length === 0) return { tenant, ignored: notFound };
  const lead = removed[0];
  return {
    tenant,
    action: 'ghl.webhook.lead_removed',
    auditDetails: {
      leadName: clip(`${lead.first_name || ''} ${lead.last_name || ''}`.trim() || 'Unnamed lead', 200),
      client: clip(tenant.name, 200),
      ...(reason ? { reason } : {}),
    },
  };
}

async function handleLead(p: Payload, event: string): Promise<HandlerResult> {
  const tenant = await tenantByLocation(str(p.location?.id) || str(p.locationId));
  if (!tenant) return { ignored: 'Unknown or missing location id.' };

  const contactId = str(p.contact_id) || str(p.contact?.id);
  if (!contactId) return { error: 'contact_id is required.' };

  const stage =
    str(p.customData?.stage) || str(p.pipeline_stage) || str(p.pipleline_stage) || str(p.opportunity?.pipeline_stage) || str(p.status);

  // Marked Lost / Abandoned in GoHighLevel: the lead leaves the portal. If the same contact gets a
  // new open opportunity later, the next `lead` event creates it again.
  if (isLostOpportunity(event, p, stage)) {
    return removeLead(tenant, contactId, 'Lead marked lost, but it is not in the portal.');
  }

  // Optional rule (Admin → GHL Connect): only contacts carrying a chosen tag count as leads.
  // Empty = every opportunity counts.
  const requiredTag = (await getLeadSettings()).required_tag;

  // The tag was taken off in GoHighLevel: the lead leaves the portal.
  if (event === 'lead_unqualified') {
    if (!requiredTag) return { tenant, ignored: 'The lead tag rule is switched off, so no lead was removed.' };
    return removeLead(tenant, contactId, 'Tag removed, but the lead is not in the portal.', 'tag removed');
  }

  const contactName = fullName(p.first_name ?? p.contact?.first_name, p.last_name ?? p.contact?.last_name) || clip(str(p.full_name), 200);

  // Not tagged and not a lead yet: no lead is made. (Recorded a few times an hour per location.)
  // A lead the portal already has is still updated: only `lead_unqualified` or Lost removes it.
  if (requiredTag && !hasTag(p, requiredTag) && !(await leadRepository.existsByGhlContactId(tenant.id, contactId))) {
    return untaggedResult(tenant, p, requiredTag, contactName);
  }

  await leadRepository.upsertByGhlContactId(tenant.id, contactId, {
    first_name: str(p.first_name),
    last_name: str(p.last_name),
    email: str(p.email),
    phone: str(p.phone),
    source: str(p.opportunity_source) || str(p.contact_source) || str(p.source),
    ...(stage ? { status: stage } : {}),
  });
  return { tenant, auditDetails: acceptedDetails(tenant, p, requiredTag, contactName) };
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
  if (await findRecentDuplicate(tenant?.id ?? null, email, answers)) {
    return { tenant: tenant || undefined, ignored: 'Duplicate submission.', info: { email: clip(email?.toLowerCase(), 255) } };
  }

  await onboardingSubmissionRepository.create({
    tenant_id: tenant?.id ?? null,
    submitter_email: email,
    ghl_contact_id: contactId,
    answers,
  });

  // Notify the media buyer list (and the assigned CSM) immediately (client answers 5.2 / 5.3).
  // The portal's own onboarding form sends the same emails through the same helper.
  const notified = await notifyOnboardingSubmitted({
    tenant: tenant || null,
    submitterEmail: email,
    answers,
    baseUrl: resolveBaseUrl(request),
  });

  return { tenant: tenant || undefined, notified };
}

async function handleMarketplaceEvent(type: string, p: Payload): Promise<HandlerResult> {
  const tenant = await tenantByLocation(str(p.locationId) || str(p.location?.id));
  if (!tenant) return { ignored: 'Unknown or missing location id.' };

  if (type === 'ContactCreate' || type === 'ContactUpdate') {
    const contact = p.contact || p;
    const contactId = str(contact?.id);
    if (!contactId) return { error: 'Contact id is required.' };

    // The same optional rule as workflow `lead` events: with a lead tag set, a contact without it
    // creates nothing, and a lead the portal already has is still updated.
    const requiredTag = (await getLeadSettings()).required_tag;
    const contactName = fullName(contact.firstName, contact.lastName) || clip(str(contact.name), 200);
    if (requiredTag && !hasTag(p, requiredTag) && !(await leadRepository.existsByGhlContactId(tenant.id, contactId))) {
      return untaggedResult(tenant, p, requiredTag, contactName);
    }

    await leadRepository.upsertByGhlContactId(tenant.id, contactId, {
      first_name: str(contact.firstName),
      last_name: str(contact.lastName),
      email: str(contact.email),
      phone: str(contact.phone),
      source: str(contact.source),
      ...(str(contact.status) ? { status: str(contact.status)! } : {}),
    });
    return { tenant, auditDetails: acceptedDetails(tenant, p, requiredTag, contactName) };
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
    const limit = result.auditLimit
      ? await enforceRateLimit(result.auditLimit.key, result.auditLimit)
      : await enforceRateLimit(`ghl_webhook_${kind}:${event}:${sender}`, { maxRequests: 20, windowMs: TEN_MINUTES });
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

    if (event === 'lead' || event === 'lead_lost' || event === 'lead_unqualified') result = await handleLead(payload, event);
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
      action: result.action || `ghl.webhook.${event}`,
      resourceType: 'webhook',
      resourceId: locationOf(payload) || 'n/a',
      details: { event, matched: Boolean(result.tenant), notified: result.notified, ...result.auditDetails },
    });

    return NextResponse.json({
      received: true,
      eventType: event,
      matched: Boolean(result.tenant),
      ...(result.action === 'ghl.webhook.lead_removed' ? { removed: true } : {}),
    });
  } catch (err: any) {
    console.error('[ghl-webhook] Failed to process event:', err?.message);
    return NextResponse.json({ error: 'Failed to process GoHighLevel webhook' }, { status: 500 });
  }
}
