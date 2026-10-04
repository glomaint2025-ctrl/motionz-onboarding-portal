import { NextRequest, NextResponse } from 'next/server';
import { getTenantById, getTenantIntegrations, DEMO_TENANT_UUID } from '@/lib/db';
import { leadRepository } from '@/lib/db/repositories/leads.repository';
import { assertPortalAccess, handleAuthError } from '@/lib/auth/guard';
import { assertModuleEnabled } from '@/lib/auth/modules';

const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;
const SEARCH_MAX = 100;
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

function positiveInt(value: string | null, fallback: number): number {
  const parsed = value ? parseInt(value, 10) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

/**
 * GET /api/portal/[clientId]/leads?page=&pageSize=&search=&stage=
 * One page of the client's leads (newest first) plus real totals:
 *  - total / totalPages: leads matching the current search and stage
 *  - counts.all, counts.newThisWeek, counts.byStage: across every lead the client has
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
    const pageSize = Math.min(positiveInt(searchParams.get('pageSize'), DEFAULT_PAGE_SIZE), MAX_PAGE_SIZE);
    const requestedPage = positiveInt(searchParams.get('page'), 1);
    const search = (searchParams.get('search') || '').trim().slice(0, SEARCH_MAX);
    const stageParam = (searchParams.get('stage') || '').trim().slice(0, SEARCH_MAX);
    const stage = stageParam && stageParam.toUpperCase() !== 'ALL' ? stageParam : undefined;

    const [firstTry, all, newThisWeek, byStage, integrations] = await Promise.all([
      leadRepository.query(tenantId, { search, stage, limit: pageSize, offset: (requestedPage - 1) * pageSize }),
      leadRepository.countByTenant(tenantId),
      leadRepository.countByTenant(tenantId, { since: new Date(Date.now() - WEEK_MS).toISOString() }),
      leadRepository.stageCounts(tenantId),
      getTenantIntegrations(tenantId),
    ]);

    // Connected when the location is saved on the client or on their GoHighLevel integration.
    // Leads only ever arrive from GoHighLevel, so having leads also means it is connected.
    const ghlConnected =
      Boolean(targetTenant?.ghl_location_id) ||
      integrations.some((i: any) => i.integration_type === 'ghl' && i.is_active !== false && Boolean(i.config_data?.location_id)) ||
      all > 0;

    // A page past the end (for example after a filter change) falls back to the last real page.
    const totalPages = Math.max(1, Math.ceil(firstTry.total / pageSize));
    const page = Math.min(requestedPage, totalPages);
    const result =
      page === requestedPage
        ? firstTry
        : await leadRepository.query(tenantId, { search, stage, limit: pageSize, offset: (page - 1) * pageSize });

    return NextResponse.json(
      {
        leads: result.leads,
        total: result.total,
        page,
        pageSize,
        totalPages,
        counts: { all, newThisWeek, byStage },
        ghlConnected,
        connected: ghlConnected,
      },
      {
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate',
        },
      }
    );
  } catch (error: any) {
    if (
      error.code ||
      error.message?.includes('suspended') ||
      error.message?.includes('Forbidden') ||
      error.message?.includes('Unauthorized')
    ) {
      return handleAuthError(error);
    }
    return NextResponse.json(
      { error: 'Failed to retrieve leads' },
      { status: 500 }
    );
  }
}
