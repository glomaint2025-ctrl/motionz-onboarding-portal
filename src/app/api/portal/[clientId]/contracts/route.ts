import { NextRequest, NextResponse } from 'next/server';
import { getTenantById, getContracts, DEMO_TENANT_UUID } from '@/lib/db';
import { assertPortalAccess, handleAuthError } from '@/lib/auth/guard';
import { hasPermission } from '@/lib/auth/permissions';

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
    if (session && !hasPermission(session.role, 'client:view_contract')) {
      return NextResponse.json({ error: 'Forbidden: contracts are visible to the account owner only.' }, { status: 403 });
    }

    // Return strictly contracts - no extraneous data
    const contracts = await getContracts(tenantId);

    return NextResponse.json(
      { contracts },
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
      { error: 'Failed to retrieve contracts' },
      { status: 500 }
    );
  }
}
