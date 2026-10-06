import crypto from 'crypto';
import {
  invitationRepository,
  userRepository,
  tenantRepository,
  auditLogRepository,
  securityEventRepository,
} from '../db/repositories';
import { UserRole, UserInvitation, User } from '../db/schema';
import { validateEmail, validateUserRole } from '../validation';
import { AppError, NotFoundError } from '../errors';
import { getSupabaseServiceClient } from '../db/supabase-client';
import { resolveBaseUrl } from '../auth/security-utils';
import { sendEmail, invitationEmail, magicLinkEmail } from '../email';
import { syncClientDriveAccess } from '../integrations/sheets/access';

export interface CreateInvitationParams {
  tenantId: string;
  email: string;
  role: UserRole;
  phone?: string;
  /** Invitee's name, used for the account created on acceptance. */
  fullName?: string;
  createdBy?: string;
  expiresInHours?: number;
  baseUrl?: string;
  request?: Request | any;
  allowExistingUser?: boolean;
  allowed_modules?: string[];
  /** Which email to send with the link. 'login' for self-requested sign-in links; false to skip. Defaults to 'invite'. */
  notify?: 'invite' | 'login' | false;
}

/** "john.doe_smith" -> "John Doe Smith" */
export function titleCaseFromEmail(email: string): string {
  const local = (email.split('@')[0] || '').split('+')[0];
  const words = local.split(/[._\-\s]+/).filter(Boolean);
  if (words.length === 0) return email;
  return words.map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
}

export class InvitationService {
  hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  async createInvitation(params: CreateInvitationParams): Promise<{
    invitation: UserInvitation;
    rawToken: string;
    magicLinkUrl: string;
    emailDelivered: boolean;
  }> {
    const email = validateEmail(params.email);
    const role = validateUserRole(params.role);
    const expiresInHours = params.expiresInHours || 72;

    if (params.createdBy !== 'self-request' && !params.allowExistingUser) {
      const existingUser = await userRepository.findByEmail(email);
      if (existingUser) {
        throw new AppError('An account with this email already exists.', 400, 'EMAIL_ALREADY_EXISTS');
      }
    }

    // Clean resend policy: revoke any pending invitations for the same user and tenant
    await invitationRepository.revokePendingByEmailAndTenant(email, params.tenantId);

    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = this.hashToken(rawToken);

    const now = new Date();
    const expiresAt = new Date(now.getTime() + expiresInHours * 60 * 60 * 1000).toISOString();

    const invitation = await invitationRepository.create({
      tenant_id: params.tenantId,
      email,
      role,
      phone: params.phone,
      full_name: typeof params.fullName === 'string' && params.fullName.trim() ? params.fullName.trim().slice(0, 120) : undefined,
      allowed_modules: params.allowed_modules,
      token_hash: tokenHash,
      expires_at: expiresAt,
      created_by: params.createdBy,
    });

    await auditLogRepository.create({
      tenant_id: params.tenantId,
      actor_email: params.createdBy || 'system',
      actor_role: 'admin',
      action: 'invitation.created',
      resource_type: 'invitation',
      resource_id: invitation.id,
      details: { email, role, phone: params.phone, expiresAt },
    });

    await securityEventRepository.create({
      event_type: 'invitation_created',
      severity: 'low',
      tenant_id: params.tenantId,
      details: {
        email,
        role,
        createdBy: params.createdBy || 'system',
        expiresAt,
        timestamp: now.toISOString(),
      },
    });

    const baseUrl = resolveBaseUrl(params.request, params.baseUrl);
    const magicLinkUrl = `${baseUrl}/auth/verify?token=${rawToken}`;

    let emailDelivered = false;
    const notify = params.notify ?? 'invite';
    if (notify === 'login') {
      emailDelivered = (await sendEmail(magicLinkEmail({ to: email, url: magicLinkUrl }))).delivered;
    } else if (notify === 'invite') {
      const tenant = await tenantRepository.findById(params.tenantId).catch(() => null);
      emailDelivered = (
        await sendEmail(
          invitationEmail({ to: email, url: magicLinkUrl, companyName: tenant?.name, expiresInHours })
        )
      ).delivered;
    }

    return { invitation, rawToken, magicLinkUrl, emailDelivered };
  }

  async validateInvitation(rawToken: string): Promise<{ valid: boolean; email?: string; error?: string }> {
    if (!rawToken || typeof rawToken !== 'string') {
      return { valid: false, error: 'Invitation token is required.' };
    }

    const tokenHash = this.hashToken(rawToken);
    const invitation = await invitationRepository.findByTokenHash(tokenHash);

    if (!invitation) {
      return { valid: false, error: 'This invitation is invalid or has expired.' };
    }

    if (invitation.revoked_at) {
      return { valid: false, error: 'This invitation was cancelled. Ask for a new invite.' };
    }

    if (invitation.accepted_at) {
      return { valid: false, error: 'This invitation has already been used. Please sign in with your email and password.' };
    }

    const now = new Date();
    if (new Date(invitation.expires_at) < now) {
      return { valid: false, error: 'This invitation link has expired. Ask for a new one.' };
    }

    return { valid: true, email: invitation.email };
  }

  async verifyAndAccept(rawToken: string): Promise<{ user: User; tenantId: string }> {
    if (!rawToken || typeof rawToken !== 'string') {
      throw new AppError('Invitation token is required.', 400, 'TOKEN_REQUIRED');
    }

    const tokenHash = this.hashToken(rawToken);
    const invitation = await invitationRepository.findByTokenHash(tokenHash);

    if (!invitation) {
      await securityEventRepository.create({
        event_type: 'magic_link_verification_failed',
        severity: 'medium',
        details: { reason: 'Unknown token hash', tokenHashPrefix: tokenHash.slice(0, 8) },
      });
      throw new NotFoundError('Invitation', 'This invitation is invalid or has expired.');
    }

    if (invitation.revoked_at) {
      await securityEventRepository.create({
        event_type: 'magic_link_verification_failed',
        severity: 'medium',
        tenant_id: invitation.tenant_id,
        details: { reason: 'Invitation revoked', invitationId: invitation.id },
      });
      throw new AppError('This invitation was cancelled. Ask for a new invite.', 410, 'INVITATION_REVOKED');
    }

    if (invitation.accepted_at) {
      await securityEventRepository.create({
        event_type: 'magic_link_verification_failed',
        severity: 'medium',
        tenant_id: invitation.tenant_id,
        details: { reason: 'Invitation already accepted', invitationId: invitation.id },
      });
      throw new AppError('This invitation has already been used. Please request a new link.', 410, 'INVITATION_ALREADY_ACCEPTED');
    }

    const now = new Date();
    if (new Date(invitation.expires_at) < now) {
      await securityEventRepository.create({
        event_type: 'magic_link_verification_failed',
        severity: 'low',
        tenant_id: invitation.tenant_id,
        details: { reason: 'Invitation expired', invitationId: invitation.id },
      });
      throw new AppError('This invitation link has expired. Ask for a new one.', 410, 'INVITATION_EXPIRED');
    }

    // Atomically claim invitation to prevent concurrent double-acceptance race conditions
    const claimed = await invitationRepository.markAccepted(invitation.id);
    if (!claimed) {
      throw new AppError('This invitation has already been used. Please request a new link.', 410, 'INVITATION_ALREADY_ACCEPTED');
    }

    // Synchronize Supabase Auth identity if Supabase service client is configured
    let authUserId: string | undefined;
    const supabase = getSupabaseServiceClient();
    if (supabase) {
      try {
        const { data: createdAuth } = await supabase.auth.admin.createUser({
          email: invitation.email,
          email_confirm: true,
        });
        if (createdAuth?.user?.id) {
          authUserId = createdAuth.user.id;
        }
      } catch {
        // User may already exist in Supabase auth.users
      }
    }

    // Upsert or fetch existing application user record
    let user = await userRepository.findByEmail(invitation.email);
    if (!user) {
      // Name: what the inviter typed; else the client's primary contact for the account owner;
      // else a readable version of the email address.
      let fullName = invitation.full_name?.trim();
      if (!fullName && invitation.role === 'client' && invitation.tenant_id) {
        const tenant = await tenantRepository.findById(invitation.tenant_id).catch(() => null);
        fullName = tenant?.primary_contact_name?.trim() || undefined;
      }
      user = await userRepository.create({
        id: authUserId,
        email: invitation.email,
        full_name: fullName || titleCaseFromEmail(invitation.email),
        role: invitation.role,
        tenant_id: invitation.tenant_id,
        phone: invitation.phone,
      });
    } else {
      user = await userRepository.update(user.id, {
        tenant_id: invitation.tenant_id,
        role: invitation.role,
        ...(invitation.phone ? { phone: invitation.phone } : {}),
        ...(invitation.full_name?.trim() ? { full_name: invitation.full_name.trim() } : {}),
      });
    }

    // Module restrictions go through updatePermissions, which works whether or not the
    // users table has an allowed_modules column (it also records them in tenant settings).
    if (Array.isArray(invitation.allowed_modules)) {
      user = await userRepository.updatePermissions(user.id, invitation.allowed_modules);
    }

    await auditLogRepository.create({
      tenant_id: invitation.tenant_id,
      actor_email: user.email,
      actor_role: user.role,
      action: 'invitation.accepted',
      resource_type: 'user',
      resource_id: user.id,
      details: { invitationId: invitation.id },
    });

    // If the client organization is currently in 'onboarding' status, transition to 'active'
    if (invitation.tenant_id) {
      try {
        const tenant = await tenantRepository.findById(invitation.tenant_id);
        if (tenant && tenant.status === 'onboarding') {
          await tenantRepository.update(invitation.tenant_id, { status: 'active' });
        }
      } catch (err) {
        console.error('[AUTH] Failed to transition tenant status on invitation acceptance:', err);
      }
    }

    await securityEventRepository.create({
      event_type: 'invitation_accepted',
      severity: 'low',
      tenant_id: invitation.tenant_id,
      details: {
        userEmail: user.email,
        userRole: user.role,
        invitationId: invitation.id,
        timestamp: now.toISOString(),
      },
    });

    // This is the one place a client owner or team member gets a working login, so it is where
    // they are given their Google Drive access. Never throws; a Drive problem is only logged.
    if (invitation.tenant_id && (user.role === 'client' || user.role === 'client_member')) {
      await syncClientDriveAccess(invitation.tenant_id, { actorEmail: user.email, actorRole: user.role, budgetMs: 15_000 });
    }

    return { user, tenantId: invitation.tenant_id };
  }

  async revokeInvitation(
    invitationId: string,
    revokedByEmail: string,
    revokedByRole: string = 'client',
    options: { replaced?: boolean } = {}
  ): Promise<boolean> {
    const invitation = await invitationRepository.findById(invitationId);
    await invitationRepository.revoke(invitationId);
    // Sending an invitation again replaces the old one; the log already shows "Invitation re-sent".
    if (options.replaced) return true;
    await auditLogRepository.create({
      tenant_id: invitation?.tenant_id,
      actor_email: revokedByEmail,
      actor_role: revokedByRole as any,
      action: 'invitation.revoked',
      resource_type: 'invitation',
      resource_id: invitationId,
      details: invitation ? { email: invitation.email, role: invitation.role } : undefined,
    });
    await securityEventRepository.create({
      event_type: 'invitation_revoked',
      severity: 'low',
      details: {
        invitationId,
        revokedBy: revokedByEmail,
        timestamp: new Date().toISOString(),
      },
    });
    return true;
  }

  /**
   * Resends an existing invitation: explicitly revokes the previous invitation
   * and provisions a fresh token with a 72-hour expiration window.
   */
  async resendInvitation(params: {
    invitationId: string;
    actorEmail: string;
    actorRole?: string;
    request?: Request | any;
    baseUrl?: string;
  }): Promise<{
    invitation: UserInvitation;
    rawToken: string;
    magicLinkUrl: string;
    emailDelivered: boolean;
  }> {
    const existing = await invitationRepository.findById(params.invitationId);
    if (!existing) {
      throw new NotFoundError('Invitation', 'Invitation not found.');
    }

    if (existing.accepted_at) {
      throw new AppError('Cannot resend invitation: this account has already accepted and activated.', 400, 'ALREADY_ACCEPTED');
    }

    // Explicitly revoke the old invitation if it wasn't already revoked
    if (!existing.revoked_at) {
      await this.revokeInvitation(params.invitationId, params.actorEmail, params.actorRole || 'client', { replaced: true });
    }

    // Create fresh invitation (also automatically cleans any pending invitations for this email & tenant)
    const result = await this.createInvitation({
      tenantId: existing.tenant_id,
      email: existing.email,
      role: existing.role,
      phone: existing.phone,
      fullName: existing.full_name,
      // Keep the invitee's module restrictions: a resent link must not widen access.
      allowed_modules: existing.allowed_modules,
      createdBy: params.actorEmail,
      allowExistingUser: true,
      expiresInHours: 72,
      baseUrl: params.baseUrl,
      request: params.request,
    });

    await auditLogRepository.create({
      tenant_id: existing.tenant_id,
      actor_email: params.actorEmail,
      actor_role: (params.actorRole || 'client') as any,
      action: 'invitation.resent',
      resource_type: 'invitation',
      resource_id: result.invitation.id,
      details: {
        oldInvitationId: params.invitationId,
        newInvitationId: result.invitation.id,
        email: existing.email,
      },
    });

    return result;
  }
}

export const invitationService = new InvitationService();
