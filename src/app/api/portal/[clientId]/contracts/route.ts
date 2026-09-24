import { NextRequest, NextResponse } from 'next/server';
import { getTenantById, getContracts } from '@/lib/db';
import { verifySession } from '@/lib/auth/session';
import { assertTenantAccess } from '@/lib/auth/permissions';

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

    const tenantId = targetTenant ? targetTenant.id : 'tenant-demo-abc-roofing';

    const sessionCookie = request.cookies.get('motionz_session');
    if (sessionCookie) {
      const session = verifySession(sessionCookie.value);
      if (session) {
        assertTenantAccess(
          { role: session.role, tenantId: session.tenantId },
          tenantId
        );
      }
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
    if (error.message?.includes('Forbidden') || error.message?.includes('Unauthorized')) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    return NextResponse.json(
      { error: 'Failed to retrieve contracts' },
      { status: 500 }
    );
  }
}
