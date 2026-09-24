import crypto from 'crypto';
import { UserRole, UserInvitation, User } from '../db/schema';
import { invitationService } from '../services/invitation.service';

export interface CreateInvitationParams {
  tenantId: string;
  email: string;
  role: UserRole;
  phone?: string;
  fullName?: string;
  createdBy?: string;
  expiresInHours?: number;
}

export interface VerificationResult {
  success: boolean;
  user?: User;
  tenantId?: string;
  error?: string;
}

/**
 * Generates a SHA-256 hash of a raw token for secure database storage.
 */
export const hashToken = (token: string): string => {
  return crypto.createHash('sha256').update(token).digest('hex');
};

/**
 * Creates an expiring, single-use, revocable magic-link invitation.
 * Returns the invitation record along with the unhashed raw token to be delivered in the link.
 */
export const createInvitation = async (
  params: CreateInvitationParams
): Promise<{ invitation: UserInvitation; rawToken: string; magicLinkUrl: string }> => {
  return invitationService.createInvitation({
    tenantId: params.tenantId,
    email: params.email,
    role: params.role,
    phone: params.phone,
    createdBy: params.createdBy,
    expiresInHours: params.expiresInHours,
  });
};

/**
 * Verifies a single-use magic-link token.
 * Validates expiration, revocation, and prior acceptance.
 */
export const verifyInvitationToken = async (rawToken: string): Promise<VerificationResult> => {
  try {
    const result = await invitationService.verifyAndAccept(rawToken);
    return {
      success: true,
      user: result.user,
      tenantId: result.tenantId,
    };
  } catch (err: any) {
    return {
      success: false,
      error: err.message || 'Invitation verification failed.',
    };
  }
};

/**
 * Revokes an existing invitation token immediately.
 */
export const revokeInvitation = async (invitationId: string, revokedByEmail: string): Promise<boolean> => {
  try {
    return await invitationService.revokeInvitation(invitationId, revokedByEmail);
  } catch {
    return false;
  }
};
