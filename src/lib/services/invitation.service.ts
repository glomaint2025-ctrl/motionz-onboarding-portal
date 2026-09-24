import crypto from 'crypto';
import {
  invitationRepository,
  userRepository,
  auditLogRepository,
} from '../db/repositories';
import { UserRole, UserInvitation, User } from '../db/schema';
import { validateEmail, validateUserRole } from '../validation';
import { AppError, NotFoundError } from '../errors';

export interface CreateInvitationParams {
  tenantId: string;
  email: string;
  role: UserRole;
  phone?: string;
  createdBy?: string;
  expiresInHours?: number;
}

export class InvitationService {
  hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  async createInvitation(params: CreateInvitationParams): Promise<{
    invitation: UserInvitation;
    rawToken: string;
    magicLinkUrl: string;
  }> {
    const email = validateEmail(params.email);
    const role = validateUserRole(params.role);
    const expiresInHours = params.expiresInHours || 72;

    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = this.hashToken(rawToken);

    const now = new Date();
    const expiresAt = new Date(now.getTime() + expiresInHours * 60 * 60 * 1000).toISOString();

    const invitation = await invitationRepository.create({
      tenant_id: params.tenantId,
      email,
      role,
      phone: params.phone,
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

    const baseUrl =
      process.env.NEXTAUTH_URL ||
      (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000');
    const magicLinkUrl = `${baseUrl}/auth/verify?token=${rawToken}`;

    return { invitation, rawToken, magicLinkUrl };
  }

  async verifyAndAccept(rawToken: string): Promise<{ user: User; tenantId: string }> {
    if (!rawToken || typeof rawToken !== 'string') {
      throw new AppError('Invitation token is required.', 400, 'TOKEN_REQUIRED');
    }

    const tokenHash = this.hashToken(rawToken);
    const invitation = await invitationRepository.findByTokenHash(tokenHash);

    if (!invitation) {
      throw new NotFoundError('Invitation', 'Invalid or unrecognized token');
    }

    if (invitation.revoked_at) {
      throw new AppError('This invitation has been revoked by an administrator.', 410, 'INVITATION_REVOKED');
    }

    if (invitation.accepted_at) {
      throw new AppError('This invitation has already been used. Please request a new link.', 410, 'INVITATION_ALREADY_ACCEPTED');
    }

    const now = new Date();
    if (new Date(invitation.expires_at) < now) {
      throw new AppError('This invitation link has expired (72-hour window exceeded).', 410, 'INVITATION_EXPIRED');
    }

    // Mark invitation accepted
    await invitationRepository.markAccepted(invitation.id);

    // Upsert or fetch existing user
    let user = await userRepository.findByEmail(invitation.email);
    if (!user) {
      user = await userRepository.create({
        email: invitation.email,
        full_name: invitation.email.split('@')[0].replace(/[._]/g, ' '),
        role: invitation.role,
        tenant_id: invitation.tenant_id,
        phone: invitation.phone,
      });
    } else {
      user = await userRepository.update(user.id, {
        tenant_id: invitation.tenant_id,
        role: invitation.role,
        ...(invitation.phone ? { phone: invitation.phone } : {}),
      });
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

    return { user, tenantId: invitation.tenant_id };
  }

  async revokeInvitation(invitationId: string, revokedByEmail: string): Promise<boolean> {
    await invitationRepository.revoke(invitationId);
    await auditLogRepository.create({
      actor_email: revokedByEmail,
      actor_role: 'admin',
      action: 'invitation.revoked',
      resource_type: 'invitation',
      resource_id: invitationId,
    });
    return true;
  }
}

export const invitationService = new InvitationService();
