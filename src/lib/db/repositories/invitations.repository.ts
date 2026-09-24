import { randomUUID } from 'crypto';
import { getSupabaseServiceClient } from '../supabase-client';
import { getStore } from '../mock-db';
import { UserInvitation } from '../schema';
import { DatabaseError, NotFoundError } from '../../errors';

export class InvitationRepository {
  async findByTokenHash(tokenHash: string): Promise<UserInvitation | null> {
    const supabase = getSupabaseServiceClient();
    if (supabase) {
      const { data, error } = await supabase
        .from('user_invitations')
        .select('*')
        .eq('token_hash', tokenHash)
        .maybeSingle();

      if (error) throw new DatabaseError(`Failed to find invitation: ${error.message}`, error);
      return data as UserInvitation | null;
    }

    const store = getStore();
    return store.userInvitations.find((inv) => inv.token_hash === tokenHash) || null;
  }

  async listByTenant(tenantId: string): Promise<UserInvitation[]> {
    const supabase = getSupabaseServiceClient();
    if (supabase) {
      const { data, error } = await supabase
        .from('user_invitations')
        .select('*')
        .eq('tenant_id', tenantId)
        .is('revoked_at', null)
        .order('created_at', { ascending: false });

      if (error) throw new DatabaseError(`Failed to list invitations: ${error.message}`, error);
      return (data || []) as UserInvitation[];
    }

    const store = getStore();
    return store.userInvitations.filter(
      (inv) => inv.tenant_id === tenantId && !inv.revoked_at
    );
  }

  async create(invitation: Omit<UserInvitation, 'id' | 'created_at'> & { id?: string }): Promise<UserInvitation> {
    const now = new Date().toISOString();
    const id = invitation.id || randomUUID();
    const isCreatedByUuid = invitation.created_by && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(invitation.created_by);
    const newRecord: UserInvitation = {
      ...invitation,
      id,
      email: invitation.email.trim().toLowerCase(),
      created_by: isCreatedByUuid ? invitation.created_by : undefined,
      created_at: now,
    };

    const supabase = getSupabaseServiceClient();
    if (supabase) {
      const { data, error } = await supabase
        .from('user_invitations')
        .insert(newRecord)
        .select('*')
        .single();

      if (error) throw new DatabaseError(`Failed to create invitation: ${error.message}`, error);
      return data as UserInvitation;
    }

    const store = getStore();
    store.userInvitations.push(newRecord);
    return newRecord;
  }

  async markAccepted(invitationId: string): Promise<void> {
    const now = new Date().toISOString();
    const supabase = getSupabaseServiceClient();
    if (supabase) {
      const { error } = await supabase
        .from('user_invitations')
        .update({ accepted_at: now })
        .eq('id', invitationId);

      if (error) throw new DatabaseError(`Failed to mark invitation accepted: ${error.message}`, error);
      return;
    }

    const store = getStore();
    const inv = store.userInvitations.find((i) => i.id === invitationId);
    if (inv) inv.accepted_at = now;
  }

  async revoke(invitationId: string): Promise<void> {
    const now = new Date().toISOString();
    const supabase = getSupabaseServiceClient();
    if (supabase) {
      const { error } = await supabase
        .from('user_invitations')
        .update({ revoked_at: now })
        .eq('id', invitationId);

      if (error) throw new DatabaseError(`Failed to revoke invitation: ${error.message}`, error);
      return;
    }

    const store = getStore();
    const inv = store.userInvitations.find((i) => i.id === invitationId);
    if (inv) inv.revoked_at = now;
  }
}

export const invitationRepository = new InvitationRepository();
