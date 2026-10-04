import { NextResponse } from 'next/server';
import { validatePhone, validateText } from '@/lib/validation';
import { isStaffEmail } from '@/lib/auth/staff';
import {
  tenantRepository,
  csmAssignmentRepository,
  userRepository,
  clientSetupStepRepository,
  featureToggleRepository,
  invitationRepository,
  auditLogRepository,
  integrationConfigRepository,
  onboardingSubmissionRepository,
} from '@/lib/db/repositories';
import { requireAuth, handleAuthError } from '@/lib/auth/guard';
import { provisionClientSheet } from '@/lib/integrations/sheets/provision';
import { createInvitation, resendInvitation, revokeInvitation } from '@/lib/auth/invitations';
import { PORTAL_MODULES } from '@/lib/portal-modules';

/** Only real portal sections are ever returned or saved; legacy switches such as "orders" are ignored. */
const MODULE_KEYS = new Set(PORTAL_MODULES.map((m) => m.key));
const onlyModules = (toggles: Record<string, boolean>): Record<string, boolean> =>
  Object.fromEntries(Object.entries(toggles).filter(([key]) => MODULE_KEYS.has(key)));

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    await requireAuth(request, { roles: ['admin'] });

    const tenant = await tenantRepository.findById(params.id, { includeArchived: true });
    if (!tenant) {
      return NextResponse.json({ error: 'Client portal not found.' }, { status: 404 });
    }

    const [assignment, steps, toggles, members, invitations, integrations, onboardingSubmissions] = await Promise.all([
      csmAssignmentRepository.findByTenant(tenant.id),
      clientSetupStepRepository.listByTenant(tenant.id),
      featureToggleRepository.getTogglesForTenant(tenant.id),
      userRepository.listByTenant(tenant.id),
      invitationRepository.listByTenant(tenant.id, { pendingOnly: false, includeRevoked: true }),
      integrationConfigRepository.listByTenant(tenant.id),
      onboardingSubmissionRepository.listByTenant(tenant.id, 10),
    ]);

    const sheetConfig = integrations.find((i) => i.integration_type === 'google_sheets');

    const csm = assignment ? await userRepository.findById(assignment.csm_user_id) : null;
    const availableCsms = (await userRepository.listByRole('csm')).map((u) => ({ id: u.id, name: u.full_name, email: u.email }));

    return NextResponse.json({
      success: true,
      tenant,
      csm: csm ? { id: csm.id, name: csm.full_name, email: csm.email } : null,
      steps,
      features: onlyModules(toggles),
      members,
      invitations,
      trackingSheetUrl: sheetConfig?.config_data?.sheet_url || null,
      onboardingSubmissions,
      availableCsms,
    });
  } catch (err: any) {
    if (err.statusCode === 401 || err.statusCode === 403) {
      return handleAuthError(err);
    }
    return NextResponse.json({ error: err.message || 'Failed to get client.' }, { status: 500 });
  }
}

export async function PUT(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const { session } = await requireAuth(request, { roles: ['admin'] });
    const actorEmail = session?.email || 'admin@motionz.ai';

    const tenant = await tenantRepository.findById(params.id, { includeArchived: true });
    if (!tenant) {
      return NextResponse.json({ error: 'Client portal not found.' }, { status: 404 });
    }

    const body = await request.json();
    const { name, phone, status, ghl_location_id, csm_user_id, feature_toggles } = body;
    const csmChange = 'csm_user_id' in body;

    const updates: any = {};
    // Validation errors name their field, so the form can mark the right input.
    try {
      if (name !== undefined) updates.name = validateText(name, 'Company name', { required: true, max: 255 });
    } catch (e: any) {
      return NextResponse.json({ error: e.message, field: 'name' }, { status: 400 });
    }
    try {
      if (phone !== undefined) updates.phone = validatePhone(phone) ?? null;
    } catch (e: any) {
      return NextResponse.json({ error: e.message, field: 'phone' }, { status: 400 });
    }
    // Suspending and archiving have their own buttons (reason, team lock-out, history),
    // so this form may only move a client between Active and Onboarding.
    if (status !== undefined && status !== null && status !== '') {
      if (status !== 'active' && status !== 'onboarding') {
        return NextResponse.json(
          { error: 'Status can only be set to Active or Onboarding here. Use the Suspend or Archive buttons instead.' },
          { status: 400 }
        );
      }
      if (tenant.deleted_at || tenant.status === 'suspended' || tenant.status === 'cancelled') {
        return NextResponse.json(
          { error: 'This client is suspended or archived. Use Reactivate or Unarchive first.' },
          { status: 400 }
        );
      }
      updates.status = status;
    }
    if (ghl_location_id !== undefined) {
      const loc = typeof ghl_location_id === 'string' ? ghl_location_id.trim() : '';
      if (loc && !/^[A-Za-z0-9_-]{6,64}$/.test(loc)) {
        return NextResponse.json(
          { error: 'The GoHighLevel Location ID looks wrong. Copy it from the sub-account URL.', field: 'ghl_location_id' },
          { status: 400 }
        );
      }
      updates.ghl_location_id = loc || null;
    }

    // Check the CSM before saving anything, so a bad choice never leaves a half-saved form.
    if (csmChange && csm_user_id) {
      const csmUser = await userRepository.findById(String(csm_user_id));
      if (!csmUser || csmUser.role !== 'csm') {
        return NextResponse.json({ error: 'Choose a valid CSM.', field: 'csm_user_id' }, { status: 400 });
      }
    }

    const updatedTenant = Object.keys(updates).length > 0
      ? await tenantRepository.update(tenant.id, updates)
      : tenant;

    if (csmChange) {
      await csmAssignmentRepository.setForTenant(tenant.id, csm_user_id ? String(csm_user_id) : null);
    }

    // Update feature toggles if supplied
    if (feature_toggles && typeof feature_toggles === 'object') {
      await Promise.all(
        Object.entries(feature_toggles)
          .filter(([key]) => MODULE_KEYS.has(key))
          .map(([key, isEnabled]) => featureToggleRepository.setToggle(tenant.id, key, Boolean(isEnabled)))
      );
    }

    await auditLogRepository.create({
      tenant_id: tenant.id,
      actor_email: actorEmail,
      actor_role: 'admin',
      action: 'client.updated',
      resource_type: 'tenant',
      resource_id: tenant.id,
      details: { updates: body },
    });

    return NextResponse.json({ success: true, tenant: updatedTenant });
  } catch (err: any) {
    if (err.statusCode === 401 || err.statusCode === 403) {
      return handleAuthError(err);
    }
    return NextResponse.json({ error: err.message || 'Failed to update client.' }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const { session } = await requireAuth(request, { roles: ['admin'] });
    const actorEmail = session?.email || 'admin@motionz.ai';

    const tenant = await tenantRepository.findById(params.id);
    if (!tenant) {
      return NextResponse.json({ error: 'Client portal not found.' }, { status: 404 });
    }

    await tenantRepository.softDelete(tenant.id);

    await auditLogRepository.create({
      tenant_id: tenant.id,
      actor_email: actorEmail,
      actor_role: 'admin',
      action: 'client.deleted',
      resource_type: 'tenant',
      resource_id: tenant.id,
    });

    return NextResponse.json({ success: true, message: 'Portal archived successfully.' });
  } catch (err: any) {
    if (err.statusCode === 401 || err.statusCode === 403) {
      return handleAuthError(err);
    }
    return NextResponse.json({ error: err.message || 'Failed to delete portal.' }, { status: 500 });
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const { session } = await requireAuth(request, { roles: ['admin'] });
    const actorEmail = session?.email || 'admin@motionz.ai';

    const tenant = await tenantRepository.findById(params.id, { includeArchived: true });
    if (!tenant) {
      return NextResponse.json({ error: 'Client portal not found.' }, { status: 404 });
    }

    const body = await request.json();
    const { action, invitationId, memberId, reason } = body;

    // Create (or re-link) the client's tracking sheet, e.g. when it failed during client creation.
    if (action === 'create_sheet') {
      const sheet = await provisionClientSheet({
        tenantId: tenant.id,
        clientName: tenant.name,
        clientEmail: tenant.primary_email,
      });
      await auditLogRepository.create({
        tenant_id: tenant.id,
        actor_email: actorEmail,
        actor_role: 'admin',
        action: 'integration.sheet_created',
        resource_type: 'tenant',
        resource_id: tenant.id,
        details: { ok: sheet.ok, error: sheet.error },
      });
      return NextResponse.json({ success: sheet.ok, sheet, error: sheet.error }, { status: sheet.ok ? 200 : 502 });
    }

    // 1. Tenant-level suspension (Admin bans whole client company portal + cascades to all members)
    if (action === 'suspend_client') {
      const banReason = reason?.trim() || 'Client account disabled by Motionz administrator.';
      const updatedTenant = await tenantRepository.suspendTenant(tenant.id, banReason, actorEmail);
      const cascadedCount = await userRepository.cascadeSuspendByTenant(tenant.id, banReason, actorEmail, 'admin');

      await auditLogRepository.create({
        tenant_id: tenant.id,
        actor_email: actorEmail,
        actor_role: 'admin',
        action: 'tenant.suspended',
        resource_type: 'tenant',
        resource_id: tenant.id,
        details: { reason: banReason, cascadedMembersDisabled: cascadedCount },
      });

      return NextResponse.json({
        success: true,
        message: 'Client organization and members suspended.',
        tenant: updatedTenant,
        cascadedMembers: cascadedCount,
      });
    }

    // 2. Tenant-level unban (Admin unlocks client company + unlocks all cascade-suspended members)
    if (action === 'unsuspend_client') {
      const updatedTenant = await tenantRepository.unsuspendTenant(tenant.id);
      const unlockedCount = await userRepository.cascadeUnsuspendByTenant(tenant.id);

      await auditLogRepository.create({
        tenant_id: tenant.id,
        actor_email: actorEmail,
        actor_role: 'admin',
        action: 'tenant.unsuspended',
        resource_type: 'tenant',
        resource_id: tenant.id,
        details: { unlockedMembersCount: unlockedCount },
      });

      return NextResponse.json({
        success: true,
        message: 'Client organization and cascade-suspended members reactivated.',
        tenant: updatedTenant,
        unlockedMembers: unlockedCount,
      });
    }

    // 3. Member-level suspension by Admin
    if (action === 'suspend_member') {
      if (!memberId) {
        return NextResponse.json({ error: 'Member ID is required' }, { status: 400 });
      }
      const targetUser = await userRepository.findById(memberId);
      if (!targetUser || targetUser.tenant_id !== tenant.id) {
        return NextResponse.json({ error: 'That person is not part of this client.' }, { status: 404 });
      }
      if (targetUser.role === 'client') {
        return NextResponse.json(
          { error: 'The account owner cannot be disabled on their own. Use "Suspend client" to lock the whole company out.' },
          { status: 400 }
        );
      }
      const banReason = reason?.trim() || 'Account disabled by Motionz administrator.';
      const updatedUser = await userRepository.suspendUser(targetUser.id, banReason, actorEmail, 'admin', false);

      await auditLogRepository.create({
        tenant_id: tenant.id,
        actor_email: actorEmail,
        actor_role: 'admin',
        action: 'user.suspended_by_admin',
        resource_type: 'user',
        resource_id: targetUser.id,
        details: { email: targetUser.email, reason: banReason },
      });

      return NextResponse.json({ success: true, message: 'Member account suspended.', user: updatedUser });
    }

    // 4. Member-level unban by Admin
    if (action === 'unsuspend_member') {
      if (!memberId) {
        return NextResponse.json({ error: 'Member ID is required' }, { status: 400 });
      }
      const targetUser = await userRepository.findById(memberId);
      if (!targetUser || targetUser.tenant_id !== tenant.id) {
        return NextResponse.json({ error: 'That person is not part of this client.' }, { status: 404 });
      }
      const updatedUser = await userRepository.unsuspendUser(targetUser.id);

      await auditLogRepository.create({
        tenant_id: tenant.id,
        actor_email: actorEmail,
        actor_role: 'admin',
        action: 'user.unsuspended_by_admin',
        resource_type: 'user',
        resource_id: targetUser.id,
        details: { email: targetUser.email },
      });

      return NextResponse.json({ success: true, message: 'Member account reactivated.', user: updatedUser });
    }

    // 4b. Member permissions update by Admin
    if (action === 'update_member_permissions') {
      if (!memberId) {
        return NextResponse.json({ error: 'Member ID is required' }, { status: 400 });
      }
      const targetUser = await userRepository.findById(memberId);
      if (!targetUser || targetUser.tenant_id !== tenant.id) {
        return NextResponse.json({ error: 'That person is not part of this client.' }, { status: 404 });
      }
      const { allowed_modules } = body;
      if (!Array.isArray(allowed_modules)) {
        return NextResponse.json({ error: 'allowed_modules must be an array of module keys.' }, { status: 400 });
      }

      const tenantToggles = await featureToggleRepository.getTogglesForTenant(tenant.id);
      const sanitized = allowed_modules.filter((k: string) => MODULE_KEYS.has(k) && tenantToggles[k] !== false);

      const updatedUser = await userRepository.updatePermissions(targetUser.id, sanitized);

      await auditLogRepository.create({
        tenant_id: tenant.id,
        actor_email: actorEmail,
        actor_role: 'admin',
        action: 'user.permissions_updated_by_admin',
        resource_type: 'user',
        resource_id: targetUser.id,
        details: { email: targetUser.email, allowed_modules: sanitized },
      });

      return NextResponse.json({
        success: true,
        message: 'Member permissions updated successfully.',
        user: updatedUser,
      });
    }

    // 5. Create new magic link / invitation for this client
    if (action === 'create_invitation') {
      const { email, role, phone, allowed_modules } = body;
      const targetEmail = (email || tenant.primary_email).trim().toLowerCase();
      if (isStaffEmail(targetEmail)) {
        return NextResponse.json({ error: '@motionz.ai addresses are for Motionz staff only.' }, { status: 400 });
      }
      if (role && role !== 'client' && role !== 'client_member') {
        return NextResponse.json({ error: 'Portal invitations can only be for client roles.' }, { status: 400 });
      }
      let invitePhone: string | undefined;
      try {
        invitePhone = validatePhone(phone) || tenant.phone || undefined;
      } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 400 });
      }

      // Enforce hierarchy with tenant toggles
      const tenantToggles = await featureToggleRepository.getTogglesForTenant(tenant.id);
      let sanitizedAllowed: string[] | undefined = undefined;
      if (Array.isArray(allowed_modules)) {
        sanitizedAllowed = allowed_modules.filter((k: string) => MODULE_KEYS.has(k) && tenantToggles[k] !== false);
      } else {
        sanitizedAllowed = PORTAL_MODULES.map((m) => m.key).filter((k) => tenantToggles[k] !== false);
      }

      const result = await createInvitation({
        tenantId: tenant.id,
        email: targetEmail,
        role: role || 'client',
        phone: invitePhone,
        allowed_modules: sanitizedAllowed,
        createdBy: actorEmail,
        allowExistingUser: true,
        request,
      });

      return NextResponse.json({
        success: true,
        message: 'Invitation created.',
        emailDelivered: Boolean(result.emailDelivered),
        invitation: result.invitation,
        magicLinkUrl: result.magicLinkUrl,
      });
    }

    // 6. Unarchive / Restore client portal (must run before the invitation checks below)
    if (action === 'unarchive' || action === 'restore') {
      const updatedTenant = await tenantRepository.unarchive(tenant.id);

      await auditLogRepository.create({
        tenant_id: tenant.id,
        actor_email: actorEmail,
        actor_role: 'admin',
        action: 'client.unarchived',
        resource_type: 'tenant',
        resource_id: tenant.id,
      });

      return NextResponse.json({
        success: true,
        message: 'Client unarchived.',
        tenant: updatedTenant,
      });
    }

    // 7. Invitation operations (resend, revoke)
    if (action !== 'resend' && action !== 'revoke') {
      return NextResponse.json({ error: 'That action is not supported.' }, { status: 400 });
    }
    if (!invitationId) {
      return NextResponse.json({ error: 'Choose an invitation first.' }, { status: 400 });
    }

    const existing = await invitationRepository.findById(invitationId);
    if (!existing || existing.tenant_id !== tenant.id) {
      return NextResponse.json({ error: 'That invitation does not belong to this client.' }, { status: 404 });
    }

    if (action === 'revoke') {
      await revokeInvitation(invitationId, actorEmail, 'admin');
      return NextResponse.json({ success: true, message: 'Invitation revoked successfully.' });
    }

    if (action === 'resend') {
      if (existing.accepted_at) {
        return NextResponse.json(
          { error: 'Cannot resend: this invitation has already been accepted.' },
          { status: 400 }
        );
      }

      const result = await resendInvitation({
        invitationId,
        actorEmail,
        actorRole: 'admin',
        request,
      });

      return NextResponse.json({
        success: true,
        message: 'Invitation regenerated and resent successfully.',
        invitation: result.invitation,
        magicLinkUrl: result.magicLinkUrl,
      });
    }

    return NextResponse.json({ error: 'That action is not supported.' }, { status: 400 });
  } catch (err: any) {
    if (err.statusCode === 401 || err.statusCode === 403) {
      return handleAuthError(err);
    }
    return NextResponse.json({ error: err.message || 'Operation failed.' }, { status: 500 });
  }
}

