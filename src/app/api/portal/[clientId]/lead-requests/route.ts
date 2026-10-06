import { NextRequest, NextResponse } from 'next/server';
import { getTenantById, logAuditEvent, DEMO_TENANT_UUID } from '@/lib/db';
import { leadRepository, leadRequestRepository, isLeadRequestsUnavailable, userRepository } from '@/lib/db/repositories';
import { assertPortalAccess, handleAuthError } from '@/lib/auth/guard';
import { assertModuleEnabled } from '@/lib/auth/modules';
import { resolveBaseUrl, enforceRateLimit } from '@/lib/auth/security-utils';
import {
  FORM_UNAVAILABLE,
  LEAD_REQUEST_TYPES,
  UNRESPONSIVE_TOO_EARLY,
  type LeadRequestDecision,
  type LeadRequestType,
  type ReplacementDetails,
} from '@/lib/lead-requests/definition';
import { decideReplacement, UNRESPONSIVE_SENT_TEXT } from '@/lib/lead-requests/decision';
import { validateLeadRequest, firstLeadRequestError } from '@/lib/lead-requests/validation';
import { findRecentLeadRequestDuplicate, notifyLeadRequest, sendLeadRequestWebhook } from '@/lib/lead-requests/submissions';
import type { Lead, LeadRequest } from '@/lib/db/schema';

export const runtime = 'nodejs';

const ONE_HOUR = 60 * 60 * 1000;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;
const NO_STORE = { 'Cache-Control': 'no-store, no-cache, must-revalidate' };

/** What a client may see of a request: everything except internal user ids. */
function publicRequest(r: LeadRequest) {
  return {
    id: r.id,
    type: r.type,
    lead_id: r.lead_id,
    lead_name: r.lead_name,
    lead_phone: r.lead_phone,
    details: r.details,
    decision: r.decision,
    decision_reason: r.decision_reason,
    status: r.status,
    submitter_email: r.submitter_email,
    created_at: r.created_at,
  };
}

const leadName = (lead: Lead) => `${lead.first_name || ''} ${lead.last_name || ''}`.trim();

function nonNegativeInt(value: string | null, fallback: number): number {
  const parsed = value ? parseInt(value, 10) : NaN;
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function authOrServerError(error: any, fallback: string) {
  if (
    error?.code ||
    error?.message?.includes('suspended') ||
    error?.message?.includes('Forbidden') ||
    error?.message?.includes('Unauthorized')
  ) {
    return handleAuthError(error);
  }
  return NextResponse.json({ error: fallback }, { status: 500 });
}

/**
 * GET /api/portal/[clientId]/lead-requests?limit=&offset=&lead=
 * The client's own Lead Replacement and Unresponsive Lead requests, newest first, plus what the two
 * form pages need: who is submitting, and (with ?lead=<id>) the lead to pre-pick.
 * `available: false` means the forms are not set up yet (the table has not been created).
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { clientId: string } }
) {
  try {
    const rawClientId = params.clientId;
    const targetTenant = await getTenantById(rawClientId);

    if (!targetTenant && rawClientId !== 'demo') {
      return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });
    }

    const tenantId = targetTenant ? targetTenant.id : DEMO_TENANT_UUID;

    // Enforce active account, tenant suspension, and tenant isolation
    const session = await assertPortalAccess(request, targetTenant, rawClientId);
    await assertModuleEnabled(session, tenantId, 'leads');

    const { searchParams } = new URL(request.url);
    const limit = Math.min(Math.max(1, nonNegativeInt(searchParams.get('limit'), DEFAULT_LIMIT)), MAX_LIMIT);
    const offset = nonNegativeInt(searchParams.get('offset'), 0);
    const leadId = (searchParams.get('lead') || '').trim().slice(0, 100);

    let available = true;
    let rows: LeadRequest[] = [];
    let total = 0;
    try {
      ({ rows, total } = await leadRequestRepository.listByTenant(tenantId, { limit, offset }));
    } catch (err) {
      if (!isLeadRequestsUnavailable(err)) throw err;
      available = false;
    }

    const [viewer, lead] = await Promise.all([
      session ? userRepository.findById(session.userId).catch(() => null) : null,
      leadId ? leadRepository.findById(tenantId, leadId) : null,
    ]);

    return NextResponse.json(
      {
        available,
        requests: rows.map(publicRequest),
        total,
        submittingAs: {
          name: viewer?.full_name || session?.email || '',
          company: targetTenant?.name || 'Demo Portal',
        },
        lead: lead ? { id: lead.id, name: leadName(lead), phone: lead.phone || '', created_at: lead.created_at } : null,
      },
      { headers: NO_STORE }
    );
  } catch (error: any) {
    return authOrServerError(error, 'Your requests could not be loaded.');
  }
}

/**
 * POST /api/portal/[clientId]/lead-requests  (JSON)
 * Body: { type: 'replacement' | 'unresponsive', leadId?, leadName, leadPhone, ...answers }
 * (see LeadRequestInput in src/lib/lead-requests/definition.ts).
 *
 * A Lead Replacement request is checked against the replacement rules straight away; all three
 * outcomes are saved. An Unresponsive Lead before day 4 is refused and not saved. Every saved
 * request is audit-logged, emailed to the lead review team and sent to the automation link (if set).
 * Staff may submit on a client's behalf; whoever is signed in is recorded as the submitter.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { clientId: string } }
) {
  try {
    const rawClientId = params.clientId;
    const targetTenant = await getTenantById(rawClientId);

    if (!targetTenant && rawClientId !== 'demo') {
      return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });
    }

    const tenantId = targetTenant ? targetTenant.id : DEMO_TENANT_UUID;

    // Enforce active account, tenant suspension, and tenant isolation
    const session = await assertPortalAccess(request, targetTenant, rawClientId);

    // Writes always require a signed-in user; there is no anonymous fallback actor.
    if (!session) {
      return NextResponse.json({ error: 'Authentication required. Please sign in.', code: 'UNAUTHENTICATED' }, { status: 401 });
    }
    await assertModuleEnabled(session, tenantId, 'leads');

    const rateLimit = await enforceRateLimit(`lead_request:${session.userId}`, { maxRequests: 30, windowMs: ONE_HOUR });
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: 'You have sent many requests in the last hour. Please wait a while and try again.', code: 'RATE_LIMITED' },
        { status: 429, headers: { 'Retry-After': String(Math.ceil(rateLimit.resetMs / 1000)) } }
      );
    }

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
    }
    if (!LEAD_REQUEST_TYPES.includes(body.type)) {
      return NextResponse.json({ error: 'Choose which form you are sending.' }, { status: 400 });
    }
    const type = body.type as LeadRequestType;

    const checked = validateLeadRequest(type, body);

    // A picked lead must be one of this client's own leads.
    let lead: Lead | null = null;
    const rawLeadId = typeof body.leadId === 'string' ? body.leadId.trim() : '';
    if (rawLeadId) {
      lead = rawLeadId.length <= 100 ? await leadRepository.findById(tenantId, rawLeadId) : null;
      if (!lead) checked.errors.leadId = 'That lead could not be found in your leads. Pick it again, or type the name and phone number.';
    }

    if (!checked.details || Object.keys(checked.errors).length > 0) {
      const onlyTooEarly = checked.tooEarly && Object.keys(checked.errors).length === 1;
      return NextResponse.json(
        {
          error: onlyTooEarly ? UNRESPONSIVE_TOO_EARLY : firstLeadRequestError(checked.errors),
          fields: checked.errors,
          ...(checked.tooEarly ? { code: 'TOO_EARLY' } : {}),
        },
        { status: 400 }
      );
    }

    let decision: LeadRequestDecision = 'sent';
    let decisionReason = UNRESPONSIVE_SENT_TEXT;
    if (type === 'replacement') {
      const details = checked.details as ReplacementDetails;
      ({ decision, reason: decisionReason } = decideReplacement(details.reason, details.appointment));
    }

    let saved: LeadRequest;
    try {
      // A double click, or a retry after a slow reply: give the earlier result back instead of saving twice.
      const duplicate = await findRecentLeadRequestDuplicate(tenantId, {
        type,
        leadId: lead?.id || null,
        leadName: checked.leadName,
        leadPhone: checked.leadPhone,
        details: checked.details as unknown as Record<string, unknown>,
      });
      if (duplicate) {
        return NextResponse.json({
          success: true,
          duplicate: true,
          request: publicRequest(duplicate),
          message: 'We already have this request. Nothing was sent twice.',
        });
      }

      saved = await leadRequestRepository.create({
        tenant_id: tenantId,
        lead_id: lead?.id || null,
        type,
        lead_name: checked.leadName,
        lead_phone: checked.leadPhone,
        details: checked.details as unknown as Record<string, any>,
        decision,
        decision_reason: decisionReason,
        submitted_by: session.userId,
        submitter_email: session.email,
      });
    } catch (err) {
      if (!isLeadRequestsUnavailable(err)) throw err;
      return NextResponse.json({ error: FORM_UNAVAILABLE, code: 'FORM_UNAVAILABLE' }, { status: 503 });
    }

    // Tell the lead review team and the automation link. Neither can undo or fail the saved request.
    const tenantForNotice = targetTenant || { id: tenantId, name: 'Demo Portal', ghl_location_id: undefined };
    const [notified, webhook] = await Promise.all([
      notifyLeadRequest({ request: saved, tenant: tenantForNotice, baseUrl: resolveBaseUrl(request) }).catch((err: any) => {
        console.error('[lead-requests] Failed to notify staff:', err?.message);
        return 0;
      }),
      sendLeadRequestWebhook({ request: saved, tenant: tenantForNotice, lead }),
    ]);

    try {
      await logAuditEvent({
        tenantId,
        actorEmail: session.email,
        actorRole: session.role,
        actorUserId: session.userId,
        action: 'lead_request.submitted',
        resourceType: 'lead_request',
        resourceId: saved.id,
        details: { type, leadName: saved.lead_name, decision, notified, webhook },
      });
    } catch (err: any) {
      // The request itself is saved and visible to staff; a missing log line must not tell the client it failed.
      console.error('[lead-requests] Could not write the audit entry:', err?.message);
    }

    return NextResponse.json({ success: true, request: publicRequest(saved), notified });
  } catch (error: any) {
    if (error?.code || error?.message?.includes('suspended') || error?.message?.includes('Forbidden') || error?.message?.includes('Unauthorized')) {
      return handleAuthError(error);
    }
    console.error('[lead-requests] Failed to save the request:', error?.message);
    return NextResponse.json({ error: 'Your request could not be saved. Please try again.' }, { status: 500 });
  }
}
