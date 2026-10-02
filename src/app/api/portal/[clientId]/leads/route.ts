import { NextRequest, NextResponse } from 'next/server';
import { getTenantById, getLeads, getAppointments, DEMO_TENANT_UUID } from '@/lib/db';
import { assertPortalAccess, handleAuthError } from '@/lib/auth/guard';

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
    await assertPortalAccess(request, targetTenant, rawClientId);

    // Fetch strictly leads and appointments - no excess data
    const [leads, appointments] = await Promise.all([
      getLeads(tenantId),
      getAppointments(tenantId),
    ]);

    return NextResponse.json(
      { leads, appointments },
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
