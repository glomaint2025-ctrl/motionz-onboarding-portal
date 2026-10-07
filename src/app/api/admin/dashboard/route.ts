import { NextResponse } from 'next/server';
import {
  tenantRepository,
  clientSetupStepRepository,
  securityEventRepository,
  onboardingSubmissionRepository,
  csmAssignmentRepository,
  contractRepository,
  leadRequestRepository,
} from '@/lib/db/repositories';
import { requireAuth, handleAuthError } from '@/lib/auth/guard';

const DAY = 24 * 60 * 60 * 1000;

/**
 * Admin dashboard metrics (FR-501). Everything is computed from real data; unknown sources are null.
 *
 * The number of database reads is fixed, however many clients there are: each table is read once
 * (clients, setup steps, CSM assignments, contracts, open lead requests, two security counts,
 * unmatched submissions), all at the same time, and joined here.
 */
export async function GET(request: Request) {
  try {
    await requireAuth(request, { roles: ['admin'] });

    const weekAgo = new Date(Date.now() - 7 * DAY).toISOString();
    const [tenants, withContract, stepsByTenant, assignments, eventsLast7Days, highSeverityLast7Days, unmatched, allOpenRequests] =
      await Promise.all([
        tenantRepository.listAll({ includeArchived: true, summary: true }),
        contractRepository.listTenantIdsWithContract(),
        clientSetupStepRepository.listByTenants(null),
        csmAssignmentRepository.listAll(),
        securityEventRepository.countSince(weekAgo),
        securityEventRepository.countSince(weekAgo, ['high', 'critical']),
        onboardingSubmissionRepository.listByTenant(null, 100),
        // Lead Replacement and Unresponsive Lead requests nobody has marked done yet.
        // Never fails the dashboard: with the table missing or unreadable the card simply shows none.
        leadRequestRepository.listOpenSummaries().catch((err: any) => {
          console.error('[dashboard] Could not read the lead requests:', err?.message);
          return [] as { tenant_id: string; created_at: string }[];
        }),
      ]);

    const live = tenants.filter((t: any) => !t.deleted_at && t.status !== 'cancelled');
    const withCsm = new Set(assignments.map((a) => a.tenant_id));

    const setup = live.map((t) => {
      const steps = stepsByTenant.get(t.id) || [];
      const current = steps.find((s) => s.status !== 'done');
      const lastChange = current ? new Date(current.updated_at || t.created_at).getTime() : null;
      return {
        id: t.id,
        name: t.name,
        done: steps.length > 0 && !current,
        currentStep: current?.name || null,
        daysOnStep: lastChange ? Math.floor((Date.now() - lastChange) / DAY) : null,
        hasCsm: withCsm.has(t.id),
        hasContract: withContract.has(t.id),
        ghlConnected: Boolean(t.ghl_location_id),
      };
    });

    // Requests are grouped by client. Only live clients count: a request left behind by an
    // archived or cancelled client is not something anybody still has to handle.
    const liveNameById = new Map(live.map((t) => [t.id, t.name]));
    const openRequests = allOpenRequests.filter((r) => liveNameById.has(r.tenant_id));
    const openByClient = new Map<string, { id: string; name: string; open: number; newest: string }>();
    for (const r of openRequests) {
      const entry = openByClient.get(r.tenant_id);
      if (entry) entry.open += 1;
      else openByClient.set(r.tenant_id, { id: r.tenant_id, name: liveNameById.get(r.tenant_id) || 'Unknown client', open: 1, newest: r.created_at });
    }

    return NextResponse.json({
      success: true,
      clients: {
        total: tenants.length,
        active: tenants.filter((t: any) => !t.deleted_at && t.status === 'active').length,
        onboarding: tenants.filter((t: any) => !t.deleted_at && t.status === 'onboarding').length,
        suspended: tenants.filter((t: any) => !t.deleted_at && t.status === 'suspended').length,
        cancelledOrArchived: tenants.filter((t: any) => t.deleted_at || t.status === 'cancelled').length,
        newLast30Days: tenants.filter((t) => Date.now() - new Date(t.created_at).getTime() < 30 * DAY).length,
      },
      // Same client set as /admin/ghl (live clients: not archived, not cancelled).
      ghl: { connected: setup.filter((s) => s.ghlConnected).length, total: setup.length },
      withoutCsm: setup.filter((s) => !s.hasCsm).map(({ id, name }) => ({ id, name })),
      // Live clients (not archived or cancelled) that still need a contract attached by an admin.
      withoutContract: setup.filter((s) => !s.hasContract).map(({ id, name }) => ({ id, name })),
      inSetup: setup.filter((s) => !s.done).length,
      stuck: setup
        .filter((s) => !s.done && s.daysOnStep !== null && s.daysOnStep >= 7)
        .map(({ id, name, currentStep, daysOnStep }) => ({ id, name, currentStep, daysOnStep })),
      security: {
        last7Days: eventsLast7Days,
        highSeverity: highSeverityLast7Days,
      },
      unmatchedSubmissions: unmatched.length,
      // Newest first (the list comes newest first, and a Map keeps the order clients were first seen in).
      leadRequests: { open: openRequests.length, clients: Array.from(openByClient.values()) },
    });
  } catch (err: any) {
    if (err.statusCode === 401 || err.statusCode === 403) return handleAuthError(err);
    return NextResponse.json({ error: 'Could not load the dashboard. Please try again.' }, { status: 500 });
  }
}
