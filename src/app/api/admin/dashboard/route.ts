import { NextResponse } from 'next/server';
import {
  tenantRepository,
  clientSetupStepRepository,
  securityEventRepository,
  onboardingSubmissionRepository,
  csmAssignmentRepository,
} from '@/lib/db/repositories';
import { requireAuth, handleAuthError } from '@/lib/auth/guard';

const DAY = 24 * 60 * 60 * 1000;

/** Admin dashboard metrics (FR-501). Everything is computed from real data; unknown sources are null. */
export async function GET(request: Request) {
  try {
    await requireAuth(request, { roles: ['admin'] });

    const tenants = await tenantRepository.list({ includeArchived: true, limit: 1000 });
    const live = tenants.filter((t: any) => !t.deleted_at && t.status !== 'cancelled');

    const setup = await Promise.all(
      live.map(async (t) => {
        const [steps, assignment] = await Promise.all([
          clientSetupStepRepository.listByTenant(t.id),
          csmAssignmentRepository.findByTenant(t.id),
        ]);
        const current = steps.find((s: any) => s.status !== 'done');
        const lastChange = current ? new Date((current as any).updated_at || t.created_at).getTime() : null;
        return {
          id: t.id,
          name: t.name,
          done: steps.length > 0 && !current,
          currentStep: current?.name || null,
          daysOnStep: lastChange ? Math.floor((Date.now() - lastChange) / DAY) : null,
          hasCsm: Boolean(assignment),
          ghlConnected: Boolean(t.ghl_location_id),
        };
      })
    );

    const events = await securityEventRepository.list({ limit: 500 });
    const weekAgo = Date.now() - 7 * DAY;
    const recentEvents = events.filter((e: any) => new Date(e.created_at).getTime() > weekAgo);
    const [unmatched] = await Promise.all([onboardingSubmissionRepository.listByTenant(null, 100)]);

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
      ghlNotConnected: setup.filter((s) => !s.ghlConnected).map(({ id, name }) => ({ id, name })),
      withoutCsm: setup.filter((s) => !s.hasCsm).map(({ id, name }) => ({ id, name })),
      inSetup: setup.filter((s) => !s.done).length,
      stuck: setup
        .filter((s) => !s.done && s.daysOnStep !== null && s.daysOnStep >= 14)
        .map(({ id, name, currentStep, daysOnStep }) => ({ id, name, currentStep, daysOnStep })),
      security: {
        last7Days: recentEvents.length,
        highSeverity: recentEvents.filter((e: any) => e.severity === 'high' || e.severity === 'critical').length,
      },
      unmatchedSubmissions: unmatched.length,
      // No billing source is connected (payments run through Stripe links outside the portal).
      revenue: null,
      churnRate: null,
    });
  } catch (err: any) {
    if (err.statusCode === 401 || err.statusCode === 403) return handleAuthError(err);
    return NextResponse.json({ error: 'Failed to load dashboard.' }, { status: 500 });
  }
}
