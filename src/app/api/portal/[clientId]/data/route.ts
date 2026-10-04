import { NextRequest, NextResponse } from 'next/server';
import {
  getTenantById,
  getClientSetupSteps,
  getLeads,
  getAppointments,
  getContracts,
  getFeatureToggles,
  getTenantIntegrations,
  getTeamMembers,
  listTeamMemberInvitations,
  DEMO_TENANT_UUID,
} from '@/lib/db';
import { userRepository } from '@/lib/db/repositories/users.repository';
import { csmAssignmentRepository } from '@/lib/db/repositories';
import { assertPortalAccess, handleAuthError } from '@/lib/auth/guard';
import { hasPermission } from '@/lib/auth/permissions';

/** Non-secret integration fields that the client portal may display. */
const PUBLIC_INTEGRATION_FIELDS = ['location_id', 'spreadsheet_id', 'sheet_url', 'tab_name'];

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

    const [
      steps,
      leads,
      appointments,
      contracts,
      featureToggles,
      integrations,
      teamMembers,
      invitations,
    ] = await Promise.all([
      getClientSetupSteps(tenantId),
      getLeads(tenantId),
      getAppointments(tenantId),
      getContracts(tenantId),
      getFeatureToggles(tenantId),
      getTenantIntegrations(tenantId),
      getTeamMembers(tenantId),
      listTeamMemberInvitations(tenantId),
    ]);

    // Hierarchical gating: if user is a client member with restricted allowed_modules,
    // intersect their allowed_modules with organization feature toggles.
    const effectiveFeatureToggles: Record<string, boolean> = { ...featureToggles };
    if (session && session.role === 'client_member') {
      const currentUser = (await userRepository.findById(session.userId)) || (await userRepository.findByEmail(session.email));
      if (currentUser && Array.isArray(currentUser.allowed_modules)) {
        const allowedSet = new Set(currentUser.allowed_modules);
        for (const key of Object.keys(effectiveFeatureToggles)) {
          if (!allowedSet.has(key)) {
            effectiveFeatureToggles[key] = false;
          }
        }
      }
    }

    const assignment = await csmAssignmentRepository.findByTenant(tenantId);
    const csmUser = assignment ? await userRepository.findById(assignment.csm_user_id) : null;

    const isClientRole = session?.role === 'client' || session?.role === 'client_member';
    const canSee = (moduleKey: string) => !isClientRole || effectiveFeatureToggles[moduleKey] !== false;
    const canSeeContracts =
      canSee('contracts') && (!session || hasPermission(session.role, 'client:view_contract'));

    // Integration credentials (API tokens etc.) never leave the server.
    const publicIntegrations = integrations.map((i: any) => ({
      id: i.id,
      integration_type: i.integration_type,
      is_active: i.is_active,
      config_data: Object.fromEntries(
        Object.entries(i.config_data || {}).filter(([key]) => PUBLIC_INTEGRATION_FIELDS.includes(key))
      ),
    }));

    return NextResponse.json({
      tenant: targetTenant || { id: tenantId, name: 'Demo Portal', slug: 'demo', status: 'active' },
      setupSteps: steps,
      leads: canSee('leads') ? leads : [],
      appointments: canSee('leads') ? appointments : [],
      contracts: canSeeContracts ? contracts : [],
      featureToggles: effectiveFeatureToggles,
      organizationFeatureToggles: featureToggles,
      integrations: publicIntegrations,
      teamMembers,
      invitations: session?.role === 'client_member' ? [] : invitations,
      csm: csmUser ? { name: csmUser.full_name, email: csmUser.email } : null,
      viewer: session ? { email: session.email, role: session.role } : null,
    });
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
      { error: 'Failed to retrieve portal data' },
      { status: 500 }
    );
  }
}
