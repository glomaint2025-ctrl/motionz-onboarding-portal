import { NextResponse } from 'next/server';
import { listTenants, getClientSetupSteps } from '@/lib/db';
import { requireAuth, handleAuthError, getVisibleTenantIds } from '@/lib/auth/guard';
import { calculateSetupProgress } from '@/lib/onboarding/progress';
import { parsePaginationParams, buildPaginationMeta } from '@/lib/utils/pagination';

/**
 * Client roster for the CSM workspace. CSMs see only their assigned clients; admins see all.
 * Supports ?page, ?pageSize, ?search and ?status (all | active | onboarding | suspended | in_progress | completed).
 */
export async function GET(request: Request) {
  try {
    const { session } = await requireAuth(request, {
      roles: ['csm', 'admin'],
      capability: 'onboarding:view_guidance',
    });

    const { searchParams } = new URL(request.url);
    const hasPagination = searchParams.has('page') || searchParams.has('pageSize') || searchParams.has('limit');
    const { page, pageSize, offset, search } = parsePaginationParams(request, 10);
    const status = searchParams.get('status')?.trim() || 'all';

    const visible = await getVisibleTenantIds(session!);
    const tenants = (await listTenants()).filter((t) => !visible || visible.has(t.id));

    const clients = await Promise.all(
      tenants.map(async (t) => {
        const steps = await getClientSetupSteps(t.id);
        const progress = calculateSetupProgress(steps);
        const currentStep = steps.find((s) => s.status !== 'done');
        return {
          id: t.id,
          name: t.name,
          slug: t.slug,
          status: t.status,
          primary_email: t.primary_email,
          primary_contact_name: t.primary_contact_name,
          phone: t.phone,
          progress_percent: progress.percentage,
          completed_steps: progress.completedSteps,
          total_steps: progress.totalSteps,
          current_step_name: currentStep?.name || null,
          current_step_status: currentStep?.status || null,
          // Legacy field names kept for existing consumers
          progressPercentage: progress.percentage,
          completedCount: progress.completedSteps,
          totalCount: progress.totalSteps,
        };
      })
    );

    const q = search?.toLowerCase();
    const filtered = clients.filter((c) => {
      const matchesSearch =
        !q ||
        c.name.toLowerCase().includes(q) ||
        c.primary_email.toLowerCase().includes(q) ||
        Boolean(c.primary_contact_name && c.primary_contact_name.toLowerCase().includes(q));
      // "in_progress" and "completed" describe setup progress, not the client's account status.
      const matchesStatus =
        status === 'all' ||
        (status === 'in_progress'
          ? c.progress_percent < 100
          : status === 'completed'
            ? c.total_steps > 0 && c.progress_percent === 100
            : c.status === status);
      return matchesSearch && matchesStatus;
    });

    const stats = {
      totalClients: clients.length,
      activeClients: clients.filter((c) => c.status === 'active').length,
      pendingSetup: clients.filter((c) => c.progress_percent < 100).length,
      completedClients: clients.filter((c) => c.total_steps > 0 && c.progress_percent === 100).length,
      avgProgress: clients.length
        ? Math.round(clients.reduce((sum, c) => sum + c.progress_percent, 0) / clients.length)
        : 0,
      archivedClients: 0,
      newThisMonth: 0,
    };

    return NextResponse.json(
      {
        success: true,
        tenants: hasPagination ? filtered.slice(offset, offset + pageSize) : filtered,
        clients: filtered,
        pagination: buildPaginationMeta(filtered.length, page, pageSize),
        stats,
      },
      { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } }
    );
  } catch (err: any) {
    if (err.statusCode === 401 || err.statusCode === 403) {
      return handleAuthError(err);
    }
    return NextResponse.json({ error: 'Could not load your clients. Please try again.' }, { status: 500 });
  }
}
