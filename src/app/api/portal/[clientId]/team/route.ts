import { NextRequest, NextResponse } from 'next/server';
import { validateEmail, validatePhone } from '@/lib/validation';
import { isStaffEmail } from '@/lib/auth/staff';
import { getTenantById, getTeamMembers, listTeamMemberInvitations, getFeatureToggles, logAuditEvent, DEMO_TENANT_UUID } from '@/lib/db';
import { assertPortalAccess, handleAuthError } from '@/lib/auth/guard';
import { hasPermission } from '@/lib/auth/permissions';
import { assertModuleEnabled } from '@/lib/auth/modules';
import { isMemberSelectableModule, MEMBER_SELECTABLE_MODULES } from '@/lib/portal-modules';
import { publicTeamMember, publicInvitation } from '../../public-fields';
import { createInvitation, revokeInvitation, resendInvitation } from '@/lib/auth/invitations';
import { invitationRepository } from '@/lib/db/repositories/invitations.repository';
import { userRepository } from '@/lib/db/repositories/users.repository';
import { tenantRepository } from '@/lib/db/repositories/tenants.repository';
import { enforceRateLimit } from '@/lib/auth/security-utils';
import type { UserInvitation } from '@/lib/db/schema';
import { syncClientDriveAccess } from '@/lib/integrations/sheets/access';

/** Inviting, removing and changing people's access is for the account owner (and Motionz staff). */
const NO_PAGES_MESSAGE = 'Choose at least one page this person can see.';
const FULL_NAME_MAX = 100;

const ownerOnly = () =>
  NextResponse.json({ error: 'Only the account owner can do this.', code: 'FORBIDDEN' }, { status: 403 });

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
    // The team list is only for people who can open the Team page (staff are never blocked).
    await assertModuleEnabled(session, tenantId, 'team');
    // Pending invitations hold other people's emails and phone numbers: owner and staff only.
    const canManage = !session || hasPermission(session.role, 'team:invite');

    const [members, allInvitations, featureToggles] = await Promise.all([
      getTeamMembers(tenantId),
      canManage ? listTeamMemberInvitations(tenantId) : Promise.resolve([] as UserInvitation[]),
      getFeatureToggles(tenantId),
    ]);

    const activeMemberEmails = new Set(members.map((m) => m.email.toLowerCase()));
    const now = new Date();
    const invitations = allInvitations.filter((inv) => {
      if (inv.accepted_at) return false;
      if (inv.revoked_at) return false;
      if (new Date(inv.expires_at) <= now) return false;
      if (activeMemberEmails.has(inv.email.toLowerCase())) return false;
      return true;
    });

    return NextResponse.json({
      members: members.map(publicTeamMember),
      invitations: invitations.map(publicInvitation),
      featureToggles,
      viewer: session ? { email: session.email, role: session.role, userId: session.userId } : null,
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
      { error: 'Failed to retrieve team members' },
      { status: 500 }
    );
  }
}

export async function POST(
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

    // Rate limit team member invitations per tenant
    const rateLimit = await enforceRateLimit(`team_invite:${tenantId}`, {
      maxRequests: 20,
      windowMs: 60 * 1000,
    });
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: 'Too many invitations issued recently. Please wait before inviting more team members.' },
        { status: 429 }
      );
    }

    // Enforce active account, tenant suspension, and tenant isolation
    const session = await assertPortalAccess(request, targetTenant, rawClientId);

    // Writes always require a signed-in user; there is no anonymous fallback actor.
    if (!session) {
      return NextResponse.json({ error: 'Authentication required. Please sign in.', code: 'UNAUTHENTICATED' }, { status: 401 });
    }
    if (!hasPermission(session.role, 'team:invite')) return ownerOnly();
    const actorRole: any = session.role;
    const actorEmail = session.email;

    const body = (await request.json().catch(() => ({}))) || {};
    const { email, phone, allowed_modules } = body;
    const fullName =
      typeof body.fullName === 'string' && body.fullName.trim()
        ? body.fullName.trim().replace(/\s+/g, ' ').slice(0, FULL_NAME_MAX)
        : undefined;

    let normalizedEmail: string;
    try {
      normalizedEmail = validateEmail(email);
    } catch (e: any) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }

    if (isStaffEmail(normalizedEmail)) {
      return NextResponse.json(
        { error: '@motionz.ai addresses are for Motionz staff only. Invite your team member with their own email.' },
        { status: 400 }
      );
    }

    const existingUser = await userRepository.findByEmail(normalizedEmail);
    if (existingUser) {
      return NextResponse.json(
        { error: 'An account with this email already exists.' },
        { status: 400 }
      );
    }

    const existingTenant = await tenantRepository.findByEmail(normalizedEmail);
    if (existingTenant) {
      return NextResponse.json(
        { error: 'An account with this email already exists.' },
        { status: 400 }
      );
    }

    let validPhone: string;
    try {
      validPhone = validatePhone(phone, { required: true })!;
    } catch (e: any) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }

    // Role assignment is strictly server-controlled: forced to 'client_member' unless admin invites
    const assignedRole = actorRole === 'admin' && body.role === 'client' ? 'client' : 'client_member';

    // Hierarchy check: filter allowed_modules so only modules enabled for this tenant are granted
    const tenantToggles = await getFeatureToggles(tenantId);
    let resolvedAllowedModules: string[] | undefined = undefined;
    if (Array.isArray(allowed_modules)) {
      resolvedAllowedModules = allowed_modules.filter(
        (key: unknown): key is string => typeof key === 'string' && tenantToggles[key] !== false
      );
    } else {
      resolvedAllowedModules = MEMBER_SELECTABLE_MODULES.map((m) => m.key).filter((key) => tenantToggles[key] !== false);
    }
    // Team members can never be given owner-only sections (the contract, managing the team).
    if (assignedRole === 'client_member') {
      resolvedAllowedModules = resolvedAllowedModules.filter(isMemberSelectableModule);
      // A team member with no pages would sign in to an almost empty portal.
      if (resolvedAllowedModules.length === 0) {
        return NextResponse.json({ error: NO_PAGES_MESSAGE }, { status: 400 });
      }
    }

    const inviteResult = await createInvitation({
      tenantId,
      email: normalizedEmail,
      role: assignedRole,
      fullName,
      phone: validPhone,
      allowed_modules: resolvedAllowedModules,
      createdBy: actorEmail,
      expiresInHours: 72,
      request,
    });

    await logAuditEvent({
      tenantId,
      actorEmail,
      actorRole,
      action: 'team.invite_sent',
      resourceType: 'user_invitation',
      resourceId: inviteResult.invitation.id,
      details: { email: normalizedEmail, role: assignedRole, phone: validPhone, emailDelivered: Boolean(inviteResult.emailDelivered) },
    });

    return NextResponse.json({
      success: true,
      invitation: publicInvitation(inviteResult.invitation),
      magicLinkUrl: inviteResult.magicLinkUrl,
      emailDelivered: Boolean(inviteResult.emailDelivered),
      message: inviteResult.emailDelivered
        ? `Invite emailed to ${normalizedEmail}.`
        : 'The invite was created, but the email could not be sent. Copy the link and send it yourself.',
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
      { error: 'Failed to invite team member' },
      { status: 500 }
    );
  }
}

export async function DELETE(
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

    // Writes always require a signed-in user; there is no anonymous fallback actor.
    if (!session) {
      return NextResponse.json({ error: 'Authentication required. Please sign in.', code: 'UNAUTHENTICATED' }, { status: 401 });
    }
    if (!hasPermission(session.role, 'team:remove')) return ownerOnly();
    const actorRole: any = session.role;
    const actorEmail = session.email;

    const { searchParams } = new URL(request.url);
    let invitationId = searchParams.get('invitationId');
    if (!invitationId) {
      try {
        const body = await request.json();
        invitationId = body?.invitationId;
      } catch {
        // Body parsing optional
      }
    }

    if (!invitationId) {
      return NextResponse.json({ error: 'Invitation ID is required' }, { status: 400 });
    }

    const invitation = await invitationRepository.findById(invitationId);
    if (!invitation) {
      return NextResponse.json({ error: 'Invitation not found' }, { status: 404 });
    }

    if (invitation.tenant_id !== tenantId) {
      return NextResponse.json(
        { error: 'Forbidden: invitation belongs to another organization' },
        { status: 403 }
      );
    }

    await revokeInvitation(invitationId, actorEmail, actorRole);

    await logAuditEvent({
      tenantId,
      actorEmail,
      actorRole,
      action: 'team.invite_revoked',
      resourceType: 'user_invitation',
      resourceId: invitationId,
      details: { email: invitation.email, role: invitation.role },
    });

    return NextResponse.json({
      success: true,
      message: 'Invitation revoked successfully',
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
      { error: error.message || 'Failed to revoke invitation' },
      { status: 500 }
    );
  }
}

export async function PATCH(
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

    // Writes always require a signed-in user; there is no anonymous fallback actor.
    if (!session) {
      return NextResponse.json({ error: 'Authentication required. Please sign in.', code: 'UNAUTHENTICATED' }, { status: 401 });
    }
    if (!hasPermission(session.role, 'team:invite')) return ownerOnly();
    const actorRole: any = session.role;
    const actorEmail = session.email;

    const body = await request.json().catch(() => ({}));
    const invitationId = body?.invitationId;

    if (!invitationId) {
      return NextResponse.json({ error: 'Invitation ID is required' }, { status: 400 });
    }

    const existing = await invitationRepository.findById(invitationId);
    if (!existing) {
      return NextResponse.json({ error: 'Invitation not found' }, { status: 404 });
    }

    if (existing.tenant_id !== tenantId) {
      return NextResponse.json(
        { error: 'Forbidden: invitation belongs to another organization' },
        { status: 403 }
      );
    }

    if (existing.accepted_at) {
      return NextResponse.json(
        { error: 'Cannot resend: this team member has already accepted their invitation and set up their account.' },
        { status: 400 }
      );
    }

    const result = await resendInvitation({
      invitationId,
      actorEmail,
      actorRole,
      request,
    });

    return NextResponse.json({
      success: true,
      message: result.emailDelivered
        ? `Invite emailed to ${result.invitation.email}.`
        : 'A new invite link was created, but the email could not be sent. Copy the link and send it yourself.',
      invitation: publicInvitation(result.invitation),
      magicLinkUrl: result.magicLinkUrl,
      emailDelivered: Boolean(result.emailDelivered),
    });
  } catch (error: any) {
    if (error.code || error.message?.includes('Forbidden') || error.message?.includes('Unauthorized')) {
      return handleAuthError(error);
    }
    return NextResponse.json(
      { error: 'The invite could not be sent again. Please try again.' },
      { status: 500 }
    );
  }
}

export async function PUT(
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
    // Writes always require a signed-in user; there is no anonymous fallback actor.
    if (!session) {
      return NextResponse.json({ error: 'Authentication required. Please sign in.', code: 'UNAUTHENTICATED' }, { status: 401 });
    }
    // Disabling people and changing what they can see is never open to team members.
    if (!hasPermission(session.role, 'team:remove')) return ownerOnly();
    const actorRole: any = session.role;
    const actorEmail = session.email;

    const body = (await request.json().catch(() => ({}))) || {};
    const { action, memberId, reason } = body;

    if (!memberId) {
      return NextResponse.json({ error: 'Member ID is required' }, { status: 400 });
    }

    const targetUser = await userRepository.findById(memberId);
    if (!targetUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    if (targetUser.tenant_id !== tenantId) {
      return NextResponse.json(
        { error: 'Forbidden: Member belongs to another organization' },
        { status: 403 }
      );
    }

    if (targetUser.id === session.userId || targetUser.email.toLowerCase() === session.email.toLowerCase()) {
      return NextResponse.json(
        { error: 'You cannot change your own access.', code: 'FORBIDDEN' },
        { status: 403 }
      );
    }

    // Main client cannot ban another main client unless they are admin/csm
    if (targetUser.role === 'client' && actorRole !== 'admin' && actorRole !== 'csm') {
      return NextResponse.json(
        { error: "Only Motionz can change the account owner's access.", code: 'FORBIDDEN' },
        { status: 403 }
      );
    }

    // Google Drive access follows the change (the tracking sheet and calculator). It never fails
    // the request, and a Drive problem is kept in the activity log for Motionz, not shown to the client.
    const syncDriveAccess = () => syncClientDriveAccess(tenantId, { actorEmail, actorRole, budgetMs: 15_000 });

    if (action === 'suspend') {
      const banReason = (typeof reason === 'string' ? reason.trim().slice(0, 500) : '') || 'Access turned off by the account owner.';
      const updatedUser = await userRepository.suspendUser(
        targetUser.id,
        banReason,
        actorEmail,
        actorRole,
        false
      );

      await logAuditEvent({
        tenantId,
        actorEmail,
        actorRole,
        action: 'team.member_suspended',
        resourceType: 'user',
        resourceId: targetUser.id,
        details: {
          email: targetUser.email,
          reason: banReason,
          suspendedBy: actorEmail,
          suspendedByRole: actorRole,
        },
      });
      await syncDriveAccess();

      return NextResponse.json({
        success: true,
        message: 'Access turned off.',
        user: updatedUser ? publicTeamMember(updatedUser) : null,
      });
    }

    if (action === 'unsuspend') {
      const updatedUser = await userRepository.unsuspendUser(targetUser.id);

      await logAuditEvent({
        tenantId,
        actorEmail,
        actorRole,
        action: 'team.member_unsuspended',
        resourceType: 'user',
        resourceId: targetUser.id,
        details: { email: targetUser.email, unsuspendedBy: actorEmail },
      });
      await syncDriveAccess();

      return NextResponse.json({
        success: true,
        message: 'Access turned back on.',
        user: updatedUser ? publicTeamMember(updatedUser) : null,
      });
    }

    if (action === 'update_permissions') {
      const { allowed_modules } = body;
      if (!Array.isArray(allowed_modules)) {
        return NextResponse.json(
          { error: 'allowed_modules must be an array of module keys.' },
          { status: 400 }
        );
      }

      if (targetUser.role === 'client' && actorRole !== 'admin' && actorRole !== 'csm') {
        return NextResponse.json(
          { error: "Only Motionz can change the account owner's access.", code: 'FORBIDDEN' },
          { status: 403 }
        );
      }

      // Hierarchy: cannot enable modules that are disabled at the organization level
      const tenantToggles = await getFeatureToggles(tenantId);
      const sanitizedAllowed = allowed_modules.filter(
        (k: unknown): k is string =>
          typeof k === 'string' &&
          tenantToggles[k] !== false &&
          // Team members can never be given owner-only sections (the contract, managing the team).
          (targetUser.role !== 'client_member' || isMemberSelectableModule(k))
      );

      // A team member with no pages would sign in to an almost empty portal.
      if (targetUser.role === 'client_member' && sanitizedAllowed.length === 0) {
        return NextResponse.json({ error: NO_PAGES_MESSAGE }, { status: 400 });
      }

      const updatedUser = await userRepository.updatePermissions(targetUser.id, sanitizedAllowed);

      await logAuditEvent({
        tenantId,
        actorEmail,
        actorRole,
        action: 'team.permissions_updated',
        resourceType: 'user',
        resourceId: targetUser.id,
        details: {
          email: targetUser.email,
          allowed_modules: sanitizedAllowed,
          updatedBy: actorEmail,
          updatedByRole: actorRole,
        },
      });
      await syncDriveAccess();

      return NextResponse.json({
        success: true,
        message: 'Access updated.',
        user: updatedUser ? publicTeamMember(updatedUser) : null,
      });
    }

    return NextResponse.json({ error: 'Invalid action. Supported: suspend, unsuspend, update_permissions' }, { status: 400 });
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
      { error: error.message || 'Failed to update member status' },
      { status: 500 }
    );
  }
}


