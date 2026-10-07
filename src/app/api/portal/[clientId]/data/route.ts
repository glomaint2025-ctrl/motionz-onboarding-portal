import { NextRequest, NextResponse } from 'next/server';
import { getTenantById, DEMO_TENANT_UUID } from '@/lib/db';
import { userRepository } from '@/lib/db/repositories/users.repository';
import { leadRepository } from '@/lib/db/repositories/leads.repository';
import {
  csmAssignmentRepository,
  clientSetupStepRepository,
  appointmentRepository,
  contractRepository,
  featureToggleRepository,
  integrationConfigRepository,
  invitationRepository,
} from '@/lib/db/repositories';
import { resolveBookingCalendarId, resolveFormSettings, resolveStaffTitle } from '@/lib/db/repositories/app-settings.repository';
import { staffRoleLabel } from '@/lib/account/role-labels';
import { assertPortalAccess, handleAuthError, getSessionUser } from '@/lib/auth/guard';
import { hasPermission } from '@/lib/auth/permissions';
import { PORTAL_MODULES } from '@/lib/portal-modules';
import type { UserInvitation } from '@/lib/db/schema';
import { publicTenant, publicTeamMember, publicInvitation } from '../../public-fields';

/** Non-secret integration fields that the client portal may display. */
const PUBLIC_INTEGRATION_FIELDS = ['location_id', 'spreadsheet_id', 'sheet_url', 'tab_name', 'calculator_id', 'calculator_url'];

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

    // The assigned CSM, then (together) that person's name and their booking calendar.
    const loadCsm = async () => {
      const assignment = await csmAssignmentRepository.findByTenant(tenantId);
      const [csmUser, bookingCalendarId] = await Promise.all([
        assignment ? userRepository.findById(assignment.csm_user_id) : Promise.resolve(null),
        // The assigned CSM's own GHL booking calendar, else the default one (also when there is no CSM).
        resolveBookingCalendarId(assignment?.csm_user_id),
      ]);
      return { csmUser, bookingCalendarId };
    };

    // Everything the page needs is read at the same time. The client was loaded above, so each
    // read goes straight to its table (no second lookup of the client per read), and the signed-in
    // person's row is the one the access check already read.
    const [
      viewerUser,
      steps,
      leadCount,
      appointments,
      contracts,
      featureToggles,
      integrations,
      teamMembers,
      pendingInvitations,
      { csmUser, bookingCalendarId },
      forms,
      viewerTitle,
    ] = await Promise.all([
      // The signed-in person (not the account owner), for the greeting and the header.
      session ? getSessionUser(session) : Promise.resolve(null),
      clientSetupStepRepository.listByTenant(tenantId),
      leadRepository.countByTenant(tenantId),
      appointmentRepository.listByTenant(tenantId),
      contractRepository.listByTenant(tenantId),
      featureToggleRepository.getTogglesForTenant(tenantId),
      integrationConfigRepository.listByTenant(tenantId),
      userRepository.listByTenant(tenantId),
      // Pending invitations hold other people's emails and phone numbers: owner and staff only.
      isMember ? Promise.resolve([] as UserInvitation[]) : invitationRepository.listByTenant(tenantId, { pendingOnly: true }),
      loadCsm(),
      // GoHighLevel form ids set by an admin (only the Texting registration form; the rest are built in).
      resolveFormSettings(),
      // A staff viewer's title ("Tech"), so the header names them correctly. Uses the person already
      // read above (no second read of them) and never fails the page.
      session?.role === 'admin'
        ? getSessionUser(session).then((u) => resolveStaffTitle(u?.id)).catch(() => null)
        : Promise.resolve(null),
    ]);

    // Invitations still waiting: not accepted, revoked or expired, and not for somebody already on the team.
    const activeEmails = new Set(teamMembers.map((m) => m.email.toLowerCase()));
    const nowDate = new Date();
    const invitations = pendingInvitations.filter(
      (inv) =>
        !inv.accepted_at && !inv.revoked_at && new Date(inv.expires_at) > nowDate && !activeEmails.has(inv.email.toLowerCase())
    );

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

    const isClientRole = session?.role === 'client' || session?.role === 'client_member';
    const canSee = (moduleKey: string) => !isClientRole || effectiveFeatureToggles[moduleKey] !== false;
    const canSeeContracts =
      canSee('contracts') && (!session || hasPermission(session.role, 'client:view_contract'));

    // Integration credentials (API tokens etc.) never leave the server. The sheet link follows Results Tracking.
    const publicIntegrations = integrations
      .filter((i: any) => i.integration_type !== 'google_sheets' || canSee('tracking'))
      .map((i: any) => ({
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
      setupSteps: canSee('onboarding') ? steps : [],
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
      invitations: isMember && effectiveFeatureToggles.team === false ? [] : invitations.map(publicInvitation),
      csm: csmUser ? { name: csmUser.full_name, email: csmUser.email } : null,
      bookingCalendarId,
      forms,
      viewer: session
        ? {
            email: session.email,
            role: session.role,
            full_name: viewerUser?.full_name || '',
            // Staff looking at a portal are named by their own role ("CSM Manager", "Tech").
            role_label: staffRoleLabel(session.role, viewerTitle),
          }
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
