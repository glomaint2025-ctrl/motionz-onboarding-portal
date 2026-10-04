import { randomUUID } from 'crypto';
import { getSupabaseServiceClient, resolveTenantId } from '../supabase-client';
import { getStore } from '../mock-db';
import { UserInvitation } from '../schema';
import { DatabaseError, NotFoundError } from '../../errors';

/**
 * Optional invitation fields (module restrictions, invitee name). Older databases have no
 * columns for these, so they are also kept in tenants.settings.invitation_meta[invitationId]
 * (the same approach users.repository uses for user_permissions) and merged back on read.
 */
type InvitationMeta = { allowed_modules?: string[]; full_name?: string };

function isMissingColumnError(error: any): boolean {
  const message = String(error?.message || '');
  return error?.code === 'PGRST204' || error?.code === '42703' || message.includes('schema cache') || message.includes('column');
}

export class InvitationRepository {
  private async readTenantSettings(supabase: any, tenantId: string): Promise<Record<string, any> | null> {
    try {
      const { data } = await supabase.from('tenants').select('settings').eq('id', tenantId).maybeSingle();
      return data ? ((data.settings || {}) as Record<string, any>) : null;
    } catch {
      return null;
    }
  }

  private async saveMeta(supabase: any, tenantId: string, invitationId: string, meta: InvitationMeta): Promise<void> {
    const settings = await this.readTenantSettings(supabase, tenantId);
    if (!settings) throw new DatabaseError('Failed to save invitation details: client not found.');
    const invitationMeta = { ...(settings.invitation_meta || {}), [invitationId]: meta };
    const { error } = await supabase
      .from('tenants')
      .update({ settings: { ...settings, invitation_meta: invitationMeta } })
      .eq('id', tenantId);
    if (error) throw new DatabaseError(`Failed to save invitation details: ${error.message}`, error);
  }

  /** Fills in allowed_modules / full_name from tenant settings when the row itself does not carry them. */
  private async withMeta<T extends UserInvitation | null>(supabase: any, row: T): Promise<T> {
    if (!row || !row.tenant_id) return row;
    if (row.allowed_modules != null && row.full_name != null) return row;
    const settings = await this.readTenantSettings(supabase, row.tenant_id);
    const meta = settings?.invitation_meta?.[row.id] as InvitationMeta | undefined;
    if (!meta) return row;
    return {
      ...row,
      allowed_modules: row.allowed_modules ?? meta.allowed_modules,
      full_name: row.full_name ?? meta.full_name,
    };
  }

  async findByTokenHash(tokenHash: string): Promise<UserInvitation | null> {
    const supabase = getSupabaseServiceClient();
    if (supabase) {
      const { data, error } = await supabase
        .from('user_invitations')
        .select('*')
        .eq('token_hash', tokenHash)
        .maybeSingle();

      if (error) throw new DatabaseError(`Failed to find invitation: ${error.message}`, error);
      return this.withMeta(supabase, data as UserInvitation | null);
    }

    const store = getStore();
    return store.userInvitations.find((inv) => inv.token_hash === tokenHash) || null;
  }

  async findById(id: string): Promise<UserInvitation | null> {
    const supabase = getSupabaseServiceClient();
    if (supabase) {
      const { data, error } = await supabase
        .from('user_invitations')
        .select('*')
        .eq('id', id)
        .maybeSingle();

      if (error) throw new DatabaseError(`Failed to find invitation: ${error.message}`, error);
      return this.withMeta(supabase, data as UserInvitation | null);
    }

    const store = getStore();
    return store.userInvitations.find((inv) => inv.id === id) || null;
  }

  async listByTenant(tenantId: string, options?: { pendingOnly?: boolean; includeRevoked?: boolean }): Promise<UserInvitation[]> {
    const resolvedId = resolveTenantId(tenantId);
    const pendingOnly = options?.pendingOnly ?? false;
    const includeRevoked = options?.includeRevoked ?? true;
    const supabase = getSupabaseServiceClient();
    if (supabase) {
      let query = supabase
        .from('user_invitations')
        .select('*')
        .or(`tenant_id.eq.${resolvedId},tenant_id.eq.${tenantId}`);

      if (!includeRevoked) {
        query = query.is('revoked_at', null);
      }

      if (pendingOnly) {
        query = query.is('accepted_at', null);
      }

      const { data, error } = await query.order('created_at', { ascending: false });

      if (error) throw new DatabaseError(`Failed to list invitations: ${error.message}`, error);
      return (data || []) as UserInvitation[];
    }

    const store = getStore();
    return store.userInvitations
      .filter((inv) => {
        const invTenant = resolveTenantId(inv.tenant_id);
        if (invTenant !== resolvedId && inv.tenant_id !== tenantId) return false;
        if (!includeRevoked && inv.revoked_at) return false;
        if (pendingOnly && inv.accepted_at) return false;
        return true;
      })
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
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
      const meta: InvitationMeta = {};
      if (newRecord.allowed_modules !== undefined) meta.allowed_modules = newRecord.allowed_modules;
      if (newRecord.full_name) meta.full_name = newRecord.full_name;
      const hasMeta = Object.keys(meta).length > 0;

      let { data, error } = await supabase
        .from('user_invitations')
        .insert(newRecord)
        .select('*')
        .single();

      let metaInSettingsOnly = false;
      if (error && hasMeta && isMissingColumnError(error)) {
        // Database without the optional columns: store the row without them.
        const { allowed_modules: _modules, full_name: _name, ...coreRecord } = newRecord;
        ({ data, error } = await supabase.from('user_invitations').insert(coreRecord).select('*').single());
        metaInSettingsOnly = true;
      }

      if (error) throw new DatabaseError(`Failed to create invitation: ${error.message}`, error);

      if (metaInSettingsOnly) {
        // Restrictions must never be silently dropped: if they cannot be saved, the invite is withdrawn.
        try {
          await this.saveMeta(supabase, newRecord.tenant_id, id, meta);
        } catch (err) {
          await supabase.from('user_invitations').update({ revoked_at: now }).eq('id', id);
          throw err;
        }
        return { ...(data as UserInvitation), ...meta };
      }
      return data as UserInvitation;
    }

    const store = getStore();
    store.userInvitations.push(newRecord);
    return newRecord;
  }

  /**
   * Atomically marks an invitation as accepted. Returns true if successfully claimed,
   * or false if it was already claimed concurrently by another request.
   */
  async markAccepted(invitationId: string): Promise<boolean> {
    const now = new Date().toISOString();
    const supabase = getSupabaseServiceClient();
    if (supabase) {
      const { data, error } = await supabase
        .from('user_invitations')
        .update({ accepted_at: now })
        .eq('id', invitationId)
        .is('accepted_at', null)
        .select('id');

      if (error) throw new DatabaseError(`Failed to mark invitation accepted: ${error.message}`, error);
      return Boolean(data && data.length > 0);
    }

    const store = getStore();
    const inv = store.userInvitations.find((i) => i.id === invitationId);
    if (inv) {
      if (inv.accepted_at) return false;
      inv.accepted_at = now;
      return true;
    }
    return false;
  }

  /**
   * Revokes an existing invitation immediately.
   */
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

  /**
   * Revokes any pending invitations for a specific email and tenant to support safe resending.
   */
  async revokePendingByEmailAndTenant(email: string, tenantId: string): Promise<number> {
    const now = new Date().toISOString();
    const normalized = email.trim().toLowerCase();
    const resolvedId = resolveTenantId(tenantId);

    const supabase = getSupabaseServiceClient();
    if (supabase) {
      const { data, error } = await supabase
        .from('user_invitations')
        .update({ revoked_at: now })
        .eq('email', normalized)
        .or(`tenant_id.eq.${resolvedId},tenant_id.eq.${tenantId}`)
        .is('accepted_at', null)
        .is('revoked_at', null)
        .select('id');

      if (error) throw new DatabaseError(`Failed to revoke pending invitations: ${error.message}`, error);
      return data ? data.length : 0;
    }

    const store = getStore();
    let count = 0;
    store.userInvitations.forEach((inv) => {
      const invTenant = resolveTenantId(inv.tenant_id);
      if (inv.email === normalized && (inv.tenant_id === tenantId || invTenant === resolvedId) && !inv.accepted_at && !inv.revoked_at) {
        inv.revoked_at = now;
        count++;
      }
    });
    return count;
  }
}

export const invitationRepository = new InvitationRepository();
