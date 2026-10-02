import { NextRequest, NextResponse } from 'next/server';
import { validatePhone } from '@/lib/validation';
import { getTenantById, getTeamMembers, listTeamMemberInvitations, getFeatureToggles, logAuditEvent, DEMO_TENANT_UUID } from '@/lib/db';
import { assertPortalAccess, handleAuthError } from '@/lib/auth/guard';
import { assertPermission, assertTenantAccess } from '@/lib/auth/permissions';
import { verifySession } from '@/lib/auth/session';
import { createInvitation, revokeInvitation, resendInvitation } from '@/lib/auth/invitations';
import { invitationRepository } from '@/lib/db/repositories/invitations.repository';
import { userRepository } from '@/lib/db/repositories/users.repository';
import { tenantRepository } from '@/lib/db/repositories/tenants.repository';
import { enforceRateLimit } from '@/lib/auth/security-utils';

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

    const [members, allInvitations, featureToggles] = await Promise.all([
      getTeamMembers(tenantId),
      listTeamMemberInvitations(tenantId),
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

    return NextResponse.json({ members, invitations, featureToggles });
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

    let actorRole: any = 'client';
    let actorEmail = 'john@abcroofing.com';

    if (session) {
      assertPermission(session.role, 'team:invite');
      actorRole = session.role;
      actorEmail = session.email;
    }

    const body = await request.json();
    const { email, phone, allowed_modules } = body;

    if (!email || !email.includes('@')) {
      return NextResponse.json(
        { error: 'A valid email address is required' },
        { status: 400 }
      );
    }

    const normalizedEmail = String(email).trim().toLowerCase();
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
      resolvedAllowedModules = allowed_modules.filter((key: string) => tenantToggles[key] !== false);
    } else {
      resolvedAllowedModules = Object.keys(tenantToggles).filter((key) => tenantToggles[key] !== false);
    }

    const inviteResult = await createInvitation({
      tenantId,
      email: normalizedEmail,
      role: assignedRole,
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
      details: { email: String(email).trim().toLowerCase(), role: assignedRole, phone: validPhone },
    });

    return NextResponse.json({
      success: true,
      invitation: inviteResult.invitation,
      magicLinkUrl: inviteResult.magicLinkUrl,
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

    let actorRole: any = 'client';
    let actorEmail = 'john@abcroofing.com';

    if (session) {
      assertPermission(session.role, 'team:remove');
      actorRole = session.role;
      actorEmail = session.email;
    }

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

    let actorRole: any = 'client';
    let actorEmail = 'john@abcroofing.com';

    if (session) {
      assertPermission(session.role, 'team:invite');
      actorRole = session.role;
      actorEmail = session.email;
    }

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
      message: 'Invitation regenerated and resent successfully.',
      invitation: result.invitation,
      magicLinkUrl: result.magicLinkUrl,
    });
  } catch (error: any) {
    if (error.message?.includes('Forbidden') || error.message?.includes('Unauthorized')) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    return NextResponse.json(
      { error: error.message || 'Failed to resend invitation' },
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

    let actorRole: any = 'client';
    let actorEmail = 'john@abcroofing.com';

    // Enforce active account, tenant suspension, and tenant isolation
    const session = await assertPortalAccess(request, targetTenant, rawClientId);
    if (session) {
      actorRole = session.role;
      actorEmail = session.email;
    }

    const body = await request.json().catch(() => ({}));
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

    // Main client cannot ban another main client unless they are admin/csm
    if (targetUser.role === 'client' && actorRole !== 'admin' && actorRole !== 'csm') {
      return NextResponse.json(
        { error: 'Forbidden: Only Motionz administrators can disable the primary client account.' },
        { status: 403 }
      );
    }

    if (action === 'suspend') {
      const banReason = reason?.trim() || 'Access disabled by organization administrator.';
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

      return NextResponse.json({
        success: true,
        message: 'Member account has been suspended.',
        user: updatedUser,
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

      return NextResponse.json({
        success: true,
        message: 'Member account has been reactivated.',
        user: updatedUser,
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
          { error: 'Forbidden: Cannot change permissions for primary organization owner.' },
          { status: 403 }
        );
      }

      // Hierarchy: cannot enable modules that are disabled at the organization level
      const tenantToggles = await getFeatureToggles(tenantId);
      const sanitizedAllowed = allowed_modules.filter((k: string) => tenantToggles[k] !== false);

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

      return NextResponse.json({
        success: true,
        message: 'Member permissions updated successfully.',
        user: updatedUser,
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


