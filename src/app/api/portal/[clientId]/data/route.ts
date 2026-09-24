import { NextRequest, NextResponse } from 'next/server';
import {
  getTenantById,
  getClientSetupSteps,
  getLeads,
  getAppointments,
  getContracts,
  getOrders,
  getFeatureToggles,
  getTenantIntegrations,
  getTeamMembers,
  listTeamMemberInvitations,
} from '@/lib/db';
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

    // Session validation if cookie is present
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

    const [
      steps,
      leads,
      appointments,
      contracts,
      orders,
      featureToggles,
      integrations,
      teamMembers,
      invitations,
    ] = await Promise.all([
      getClientSetupSteps(tenantId),
      getLeads(tenantId),
      getAppointments(tenantId),
      getContracts(tenantId),
      getOrders(tenantId),
      getFeatureToggles(tenantId),
      getTenantIntegrations(tenantId),
      getTeamMembers(tenantId),
      listTeamMemberInvitations(tenantId),
    ]);

    return NextResponse.json({
      tenant: targetTenant || {
        id: tenantId,
        name: 'ABC Roofing',
        slug: 'abc-roofing',
        primary_email: 'john@abcroofing.com',
        primary_contact_name: 'John Smith',
        phone: '(555) 234-5678',
        status: 'active',
      },
      setupSteps: steps,
      leads,
      appointments,
      contracts,
      orders,
      featureToggles,
      integrations,
      teamMembers,
      invitations,
    });
  } catch (error: any) {
    if (error.message?.includes('Forbidden') || error.message?.includes('Unauthorized')) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    return NextResponse.json(
      { error: 'Failed to retrieve portal data' },
      { status: 500 }
    );
  }
}
