import { NextRequest, NextResponse } from 'next/server';
import { getTenantById, getLeads, getAppointments } from '@/lib/db';
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
    if (error.message?.includes('Forbidden') || error.message?.includes('Unauthorized')) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    return NextResponse.json(
      { error: 'Failed to retrieve leads' },
      { status: 500 }
    );
  }
}
