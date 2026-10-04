import { NextRequest, NextResponse } from 'next/server';
import {
  getTenantById,
  getClientSetupSteps,
  getAppointments,
  getContracts,
  getFeatureToggles,
  getTenantIntegrations,
  getTeamMembers,
  listTeamMemberInvitations,
  DEMO_TENANT_UUID,
} from '@/lib/db';
import { userRepository } from '@/lib/db/repositories/users.repository';
import { leadRepository } from '@/lib/db/repositories/leads.repository';
import { csmAssignmentRepository } from '@/lib/db/repositories';
import { resolveBookingCalendarId } from '@/lib/db/repositories/app-settings.repository';
import { assertPortalAccess, handleAuthError } from '@/lib/auth/guard';
import { hasPermission } from '@/lib/auth/permissions';
import { PORTAL_MODULES } from '@/lib/portal-modules';
import type { UserInvitation } from '@/lib/db/schema';
import { publicTenant, publicTeamMember, publicInvitation } from '../../public-fields';

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
    const isMember = session?.role === 'client_member';
    // The signed-in person (not the account owner), for the greeting and the header.
    const viewerUser = session
      ? (await userRepository.findById(session.userId)) || (await userRepository.findByEmail(session.email))
      : null;

    const [
      steps,
      leadCount,
      appointments,
      contracts,
      featureToggles,
      integrations,
      teamMembers,
      invitations,
    ] = await Promise.all([
      getClientSetupSteps(tenantId),
      leadRepository.countByTenant(tenantId),
      getAppointments(tenantId),
      getContracts(tenantId),
      getFeatureToggles(tenantId),
      getTenantIntegrations(tenantId),
      getTeamMembers(tenantId),
      // Pending invitations hold other people's emails and phone numbers: owner and staff only.
      isMember ? Promise.resolve([] as UserInvitation[]) : listTeamMemberInvitations(tenantId),
    ]);

    // A team member only gets the sections that are on for the client AND granted to them.
    // Every known module is checked, including ones the client has no saved on/off setting for.
    const effectiveFeatureToggles: Record<string, boolean> = { ...featureToggles };
    if (session && isMember) {
      const currentUser = viewerUser;
      if (currentUser && Array.isArray(currentUser.allowed_modules)) {
        const allowedSet = new Set(currentUser.allowed_modules);
        const moduleKeys = [...PORTAL_MODULES.map((m) => m.key), ...Object.keys(featureToggles)];
        for (const key of moduleKeys) {
          if (!allowedSet.has(key)) {
            effectiveFeatureToggles[key] = false;
          }
        }
      }
      // Contracts are for the account owner only, whatever a member's list says.
      if (!hasPermission(session.role, 'client:view_contract')) {
        effectiveFeatureToggles.contracts = false;
      }
    }

    const assignment = await csmAssignmentRepository.findByTenant(tenantId);
    const csmUser = assignment ? await userRepository.findById(assignment.csm_user_id) : null;
    // The assigned CSM's own GHL booking calendar, else the default one (also when there is no CSM).
    const bookingCalendarId = await resolveBookingCalendarId(assignment?.csm_user_id);

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

    // Connected when the location is saved on the client or on their GoHighLevel integration.
    // Leads only ever arrive from GoHighLevel, so having leads also means it is connected.
    const ghlConnected =
      Boolean(targetTenant?.ghl_location_id) ||
      integrations.some((i: any) => i.integration_type === 'ghl' && i.is_active !== false && Boolean(i.config_data?.location_id)) ||
      leadCount > 0;

    // A team member who cannot open the Team page only gets their own entry.
    const visibleTeamMembers =
      isMember && effectiveFeatureToggles.team === false
        ? teamMembers.filter((m) => m.id === session?.userId || m.email.toLowerCase() === session?.email.toLowerCase())
        : teamMembers;

    return NextResponse.json({
      tenant: targetTenant
        ? publicTenant(targetTenant)
        : { id: tenantId, name: 'Demo Portal', slug: 'demo', status: 'active' },
      setupSteps: steps,
      // The real number of leads. The list itself is served, page by page, by /leads.
      leadCount: canSee('leads') ? leadCount : 0,
      // Appointments are calls between the client and their CSM, so they follow the Book a Call section.
      appointments: canSee('book_call') ? appointments : [],
      contracts: canSeeContracts ? contracts : [],
      featureToggles: effectiveFeatureToggles,
      organizationFeatureToggles: featureToggles,
      integrations: publicIntegrations,
      ghlConnected,
      teamMembers: visibleTeamMembers.map(publicTeamMember),
      invitations: invitations.map(publicInvitation),
      csm: csmUser ? { name: csmUser.full_name, email: csmUser.email } : null,
      bookingCalendarId,
      viewer: session
        ? { email: session.email, role: session.role, full_name: viewerUser?.full_name || '' }
        : null,
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
