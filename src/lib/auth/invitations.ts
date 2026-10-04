import crypto from 'crypto';
import { UserRole, UserInvitation, User } from '../db/schema';
import { invitationService } from '../services/invitation.service';
import { getSupabaseServiceClient } from '../db/supabase-client';

export interface CreateInvitationParams {
  tenantId: string;
  email: string;
  role: UserRole;
  phone?: string;
  fullName?: string;
  allowed_modules?: string[];
  createdBy?: string;
  expiresInHours?: number;
  baseUrl?: string;
  request?: Request | any;
  allowExistingUser?: boolean;
  notify?: 'invite' | 'login' | false;
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
): Promise<{ invitation: UserInvitation; rawToken: string; magicLinkUrl: string; emailDelivered: boolean }> => {
  return invitationService.createInvitation({
    tenantId: params.tenantId,
    email: params.email,
    role: params.role,
    phone: params.phone,
    fullName: params.fullName,
    allowed_modules: params.allowed_modules,
    createdBy: params.createdBy,
    expiresInHours: params.expiresInHours,
    baseUrl: params.baseUrl,
    request: params.request,
    allowExistingUser: params.allowExistingUser,
    notify: params.notify,
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

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Sets the sign-in password for an account in Supabase Auth, creating the auth identity if it
 * does not exist yet. Reports failure instead of swallowing it so callers never claim a password
 * was saved when it was not. Without Supabase (local mock store) there is nothing to sync.
 *
 * The auth user is located by id first (the users table id equals the auth id for accounts
 * created through the invite flow), then by email across every page of auth users.
 */
export const setAuthPassword = async (
  params: { userId: string; email: string; password: string },
  client: any = getSupabaseServiceClient()
): Promise<{ ok: boolean; error?: string }> => {
  if (!client) return { ok: true };

  const email = params.email.trim().toLowerCase();
  const hasUuid = UUID_PATTERN.test(params.userId);

  try {
    let authUserId: string | null = null;

    if (hasUuid) {
      const { data } = await client.auth.admin.getUserById(params.userId);
      if (data?.user?.id && data.user.email?.toLowerCase() === email) {
        authUserId = data.user.id;
      }
    }

    if (!authUserId) {
      const perPage = 1000;
      for (let page = 1; page <= 100; page++) {
        const { data, error } = await client.auth.admin.listUsers({ page, perPage });
        if (error) throw error;
        const users: any[] = data?.users || [];
        const match = users.find((u) => u.email?.toLowerCase() === email);
        if (match) {
          authUserId = match.id;
          break;
        }
        if (users.length < perPage) break;
      }
    }

    if (authUserId) {
      const { error } = await client.auth.admin.updateUserById(authUserId, {
        password: params.password,
        email_confirm: true,
      });
      if (error) throw error;
    } else {
      const { error } = await client.auth.admin.createUser({
        ...(hasUuid ? { id: params.userId } : {}),
        email,
        password: params.password,
        email_confirm: true,
      });
      if (error) throw error;
    }

    return { ok: true };
  } catch (err: any) {
    console.error('[AUTH] Failed to set password in Supabase Auth:', err);
    return { ok: false, error: err?.message || 'Password could not be saved.' };
  }
};

/**
 * Revokes an existing invitation token immediately.
 */
export const revokeInvitation = async (invitationId: string, revokedByEmail: string, revokedByRole: string = 'client'): Promise<boolean> => {
  try {
    return await invitationService.revokeInvitation(invitationId, revokedByEmail, revokedByRole);
  } catch {
    return false;
  }
};

/**
 * Resends an existing invitation: revokes the old one and generates a new active magic link.
 */
export const resendInvitation = async (params: {
  invitationId: string;
  actorEmail: string;
  actorRole?: string;
  request?: Request | any;
  baseUrl?: string;
}) => {
  return await invitationService.resendInvitation(params);
};
