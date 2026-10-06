import { NextResponse } from 'next/server';
import { getTenantById, logAuditEvent } from '@/lib/db';
import { leadRequestRepository, isLeadRequestsUnavailable, userRepository } from '@/lib/db/repositories';
import { requireAuth, handleAuthError, assertCsmAssigned } from '@/lib/auth/guard';

const LIST_LIMIT = 50;

/**
 * GET /api/csm/clients/[id]/lead-requests
 * A client's Lead Replacement and Unresponsive Lead requests, newest first, for staff
 * (admins: every client; CSMs: their assigned clients only).
 * `available: false` means the table has not been created yet; the list is then empty.
 */
export async function GET(request: Request, { params }: { params: { id: string } }) {
  try {
    const { session } = await requireAuth(request, { roles: ['csm', 'admin'] });

    const tenant = await getTenantById(params.id);
    if (!tenant) {
      return NextResponse.json({ error: 'Client portal not found.' }, { status: 404 });
    }
    await assertCsmAssigned(session, tenant.id);

    try {
      const { rows, total } = await leadRequestRepository.listByTenant(tenant.id, { limit: LIST_LIMIT });
      // Show who marked a request done by name, not by id.
      const resolverIds = Array.from(new Set(rows.map((r) => r.resolved_by).filter((id): id is string => Boolean(id))));
      const resolvers = await Promise.all(resolverIds.map((id) => userRepository.findById(id).catch(() => null)));
      const nameById = new Map(resolvers.filter(Boolean).map((u) => [u!.id, u!.full_name || u!.email]));
      return NextResponse.json({
        success: true,
        available: true,
        total,
        requests: rows.map((r) => ({ ...r, resolved_by_name: r.resolved_by ? nameById.get(r.resolved_by) || null : null })),
      });
    } catch (err) {
      if (!isLeadRequestsUnavailable(err)) throw err;
      return NextResponse.json({ success: true, available: false, total: 0, requests: [] });
    }
  } catch (err: any) {
    if (err.statusCode === 401 || err.statusCode === 403) return handleAuthError(err);
    return NextResponse.json({ error: 'The lead requests could not be loaded.' }, { status: 500 });
  }
}

/**
 * PATCH /api/csm/clients/[id]/lead-requests
 * Body: { requestId, status: 'done' | 'open' } — marks a request done, or reopens it.
 */
export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    const { session } = await requireAuth(request, { roles: ['csm', 'admin'] });

    const tenant = await getTenantById(params.id);
    if (!tenant) {
      return NextResponse.json({ error: 'Client portal not found.' }, { status: 404 });
    }
    await assertCsmAssigned(session, tenant.id);

    const body = await request.json().catch(() => null);
    const requestId = typeof body?.requestId === 'string' ? body.requestId.trim() : '';
    const status = body?.status;
    if (!requestId || requestId.length > 100) {
      return NextResponse.json({ error: 'Choose a request.' }, { status: 400 });
    }
    if (status !== 'done' && status !== 'open') {
      return NextResponse.json({ error: 'Choose Done or Open.' }, { status: 400 });
    }

    try {
      const existing = await leadRequestRepository.findById(requestId);
      // A request of another client is treated exactly like one that does not exist.
      if (!existing || existing.tenant_id !== tenant.id) {
        return NextResponse.json({ error: 'That request could not be found.' }, { status: 404 });
      }
      if (existing.status === status) {
        return NextResponse.json({ success: true, request: existing, changed: false });
      }

      const previous = existing.status;
      const updated = await leadRequestRepository.setStatus(requestId, status, session!.userId);
      if (!updated) {
        return NextResponse.json({ error: 'That request could not be found.' }, { status: 404 });
      }

      await logAuditEvent({
        tenantId: tenant.id,
        actorEmail: session!.email,
        actorRole: session!.role,
        actorUserId: session!.userId,
        action: 'lead_request.status_changed',
        resourceType: 'lead_request',
        resourceId: updated.id,
        details: { status, previous, type: updated.type, leadName: updated.lead_name },
      });

      return NextResponse.json({ success: true, request: updated, changed: true });
    } catch (err) {
      if (!isLeadRequestsUnavailable(err)) throw err;
      return NextResponse.json({ error: 'Lead requests are not set up yet.', code: 'FORM_UNAVAILABLE' }, { status: 503 });
    }
  } catch (err: any) {
    if (err.statusCode === 401 || err.statusCode === 403) return handleAuthError(err);
    return NextResponse.json({ error: 'The request could not be updated. Please try again.' }, { status: 500 });
  }
}
