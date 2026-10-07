import { randomUUID } from 'crypto';
import { getSupabaseServiceClient, resolveTenantId } from '../supabase-client';
import { getStore } from '../mock-db';
import { User, UserRole } from '../schema';
import { DatabaseError, NotFoundError, AppError } from '../../errors';
import { chunk } from '../paging';

/** The database has no such column yet (migration not applied). */
export function isMissingColumnError(error: any): boolean {
  const message = String(error?.message || '');
  return error?.code === 'PGRST204' || error?.code === '42703' || message.includes('schema cache') || message.includes('column');
}

export class UserRepository {
  private async getTenantMetadata(tenantId?: string | null): Promise<{ suspendedMap: Record<string, any>; userPermissions: Record<string, string[]> }> {
    if (!tenantId) return { suspendedMap: {}, userPermissions: {} };
    const supabase = getSupabaseServiceClient();
    if (!supabase) return { suspendedMap: {}, userPermissions: {} };
    try {
      const { data } = await supabase
        .from('tenants')
        .select('settings')
        .or(`id.eq.${tenantId},slug.eq.${tenantId}`)
        .maybeSingle();
      return {
        suspendedMap: (data?.settings?.suspended_users || {}) as Record<string, any>,
        userPermissions: (data?.settings?.user_permissions || {}) as Record<string, string[]>,
      };
    } catch {
      return { suspendedMap: {}, userPermissions: {} };
    }
  }

  private async getTenantSuspendedUsers(tenantId?: string | null): Promise<Record<string, any>> {
    const meta = await this.getTenantMetadata(tenantId);
    return meta.suspendedMap;
  }

  private normalizeUserWithSuspension(
    user: any,
    metadata?: { suspendedMap?: Record<string, any>; userPermissions?: Record<string, string[]> } | Record<string, any>
  ): User {
    if (!user) return user;
    const suspendedMap = (metadata as any)?.suspendedMap || metadata;
    const userPermissions = (metadata as any)?.userPermissions;
    const susp = suspendedMap?.[user.id];
    const allowedModules = user.allowed_modules || userPermissions?.[user.id];

    if (user.status === 'active' && !susp?.suspended_at) {
      return {
        ...user,
        status: 'active',
        suspended_at: null,
        suspended_reason: null,
        suspended_by: null,
        suspended_by_role: null,
        cascade_suspended: false,
        allowed_modules: allowedModules,
      } as User;
    }

    return {
      ...user,
      status: user.status || susp?.status || 'active',
      suspended_at: user.suspended_at || susp?.suspended_at,
      suspended_reason: user.suspended_reason || susp?.suspended_reason,
      suspended_by: user.suspended_by || susp?.suspended_by,
      suspended_by_role: user.suspended_by_role || susp?.suspended_by_role,
      cascade_suspended: user.cascade_suspended ?? susp?.cascade_suspended ?? false,
      allowed_modules: allowedModules,
    } as User;
  }

  async findById(userId: string): Promise<User | null> {
    const supabase = getSupabaseServiceClient();
    if (supabase) {
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId);
      let query = supabase.from('users').select('*');
      if (isUuid) {
        query = query.eq('id', userId);
      } else if (userId === 'user-csm-1') {
        query = query.eq('email', 'csm@motionz.ai');
      } else if (userId === 'user-csm-2') {
        query = query.eq('email', 'csm.agent@motionz.ai');
      } else if (userId === 'user-admin-1') {
        query = query.eq('email', 'admin@motionz.ai');
      } else {
        return null;
      }

      const { data, error } = await query.maybeSingle();
      if (error) throw new DatabaseError(`Failed to fetch user: ${error.message}`, error);
      if (!data) return null;

      if (data.tenant_id) {
        const metadata = await this.getTenantMetadata(data.tenant_id);
        return this.normalizeUserWithSuspension(data, metadata);
      }
      return this.normalizeUserWithSuspension(data);
    }

    const store = getStore();
    return (
      store.users.find(
        (u) =>
          u.id === userId ||
          (userId === 'e0000000-0000-0000-0000-000000000002' && (u.id === 'user-csm-1' || u.email === 'csm@motionz.ai')) ||
          (userId === 'e0000000-0000-0000-0000-000000000001' && (u.id === 'user-admin-1' || u.email === 'admin@motionz.ai'))
      ) || null
    );
  }

  async findByEmail(email: string): Promise<User | null> {
    const normalized = email.trim().toLowerCase();
    const supabase = getSupabaseServiceClient();
    if (supabase) {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('email', normalized)
        .maybeSingle();

      if (error) throw new DatabaseError(`Failed to fetch user by email: ${error.message}`, error);
      if (!data) return null;

      if (data.tenant_id) {
        const metadata = await this.getTenantMetadata(data.tenant_id);
        return this.normalizeUserWithSuspension(data, metadata);
      }
      return this.normalizeUserWithSuspension(data);
    }

    const store = getStore();
    return store.users.find((u) => u.email.toLowerCase() === normalized) || null;
  }

  /**
   * Staff users by id, in one request per 100 ids (e.g. the CSM names for a page of clients).
   * Meant for staff: the per-client suspension details that findById adds are not read.
   */
  async findByIds(userIds: string[]): Promise<User[]> {
    const unique = Array.from(new Set(userIds.filter(Boolean)));
    if (unique.length === 0) return [];

    const supabase = getSupabaseServiceClient();
    if (supabase) {
      const uuids = unique.filter((id) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id));
      if (uuids.length === 0) return [];
      const pages = await Promise.all(
        chunk(uuids).map(async (part) => {
          const { data, error } = await supabase.from('users').select('*').in('id', part);
          if (error) throw new DatabaseError(`Failed to fetch users: ${error.message}`, error);
          return data || [];
        })
      );
      return pages.flat().map((u) => this.normalizeUserWithSuspension(u));
    }

    const store = getStore();
    return unique.map((id) => store.users.find((u) => u.id === id)).filter((u): u is User => Boolean(u));
  }

  /** All users of one staff role, including disabled ones (Admin > Staff). */
  async listAllByRole(role: 'admin' | 'csm'): Promise<User[]> {
    const supabase = getSupabaseServiceClient();
    if (supabase) {
      const { data, error } = await supabase.from('users').select('*').eq('role', role).order('created_at');
      if (error) throw new DatabaseError(`Failed to list ${role} users: ${error.message}`, error);
      return (data || []) as User[];
    }
    return getStore().users.filter((u) => u.role === role);
  }

  /** Active staff users of one role (e.g. all CSMs for the assignment dropdown). */
  async listByRole(role: 'admin' | 'csm'): Promise<User[]> {
    const supabase = getSupabaseServiceClient();
    if (supabase) {
      const { data, error } = await supabase.from('users').select('*').eq('role', role).order('full_name');
      if (error) throw new DatabaseError(`Failed to list ${role} users: ${error.message}`, error);
      return ((data || []) as User[]).filter((u) => u.status !== 'suspended');
    }
    return getStore().users.filter((u) => u.role === role && u.status !== 'suspended');
  }

  async listByTenant(tenantId: string): Promise<User[]> {
    const resolvedId = resolveTenantId(tenantId);
    const supabase = getSupabaseServiceClient();
    if (supabase) {
      const [usersRes, metadata] = await Promise.all([
        supabase
          .from('users')
          .select('*')
          .or(`tenant_id.eq.${resolvedId},tenant_id.eq.${tenantId}`)
          .order('created_at', { ascending: true }),
        this.getTenantMetadata(resolvedId || tenantId),
      ]);

      if (usersRes.error) throw new DatabaseError(`Failed to list tenant users: ${usersRes.error.message}`, usersRes.error);
      return (usersRes.data || []).map((u) => this.normalizeUserWithSuspension(u, metadata));
    }

    const store = getStore();
    return store.users.filter((u) => u.tenant_id === tenantId || u.tenant_id === resolvedId);
  }

  async create(user: Omit<User, 'id' | 'created_at' | 'updated_at'> & { id?: string }): Promise<User> {
    const normalizedEmail = user.email.trim().toLowerCase();
    const existing = await this.findByEmail(normalizedEmail);
    if (existing) {
      throw new AppError('An account with this email already exists.', 400, 'EMAIL_ALREADY_EXISTS');
    }

    const now = new Date().toISOString();
    const id = user.id || randomUUID();
    const newRecord: User = {
      ...user,
      id,
      email: normalizedEmail,
      created_at: now,
      updated_at: now,
    };

    const supabase = getSupabaseServiceClient();
    if (supabase) {
      const { data, error } = await supabase
        .from('users')
        .insert(newRecord)
        .select('*')
        .single();

      if (error) throw new DatabaseError(`Failed to create user: ${error.message}`, error);
      return data as User;
    }

    const store = getStore();
    store.users.push(newRecord);
    return newRecord;
  }

  async update(userId: string, updates: Partial<User>): Promise<User> {
    const now = new Date().toISOString();
    const cleanUpdates = { ...updates, updated_at: now };

    const supabase = getSupabaseServiceClient();
    if (supabase) {
      let res = await supabase
        .from('users')
        .update(cleanUpdates)
        .eq('id', userId)
        .select('*')
        .single();

      // Gracefully handle PostgreSQL schema cache if suspension columns have not yet been migrated
      if (
        res.error &&
        (res.error.message?.includes('schema cache') ||
          res.error.message?.includes('column') ||
          res.error.code === 'PGRST204')
      ) {
        const {
          status,
          suspended_at,
          suspended_reason,
          suspended_by,
          suspended_by_role,
          cascade_suspended,
          ...coreUpdates
        } = cleanUpdates as any;

        const keysToUpdate = Object.keys(coreUpdates).filter((k) => k !== 'updated_at');
        if (keysToUpdate.length > 0) {
          res = await supabase
            .from('users')
            .update(coreUpdates)
            .eq('id', userId)
            .select('*')
            .single();
        } else {
          const { data: existingUser } = await supabase
            .from('users')
            .select('*')
            .eq('id', userId)
            .maybeSingle();

          if (existingUser) {
            const tenantId = existingUser.tenant_id;
            if (tenantId) {
              const { data: tenantData } = await supabase
                .from('tenants')
                .select('settings')
                .or(`id.eq.${tenantId},slug.eq.${tenantId}`)
                .maybeSingle();

              const currentSettings = (tenantData?.settings || {}) as Record<string, any>;
              const suspendedUsers = { ...(currentSettings.suspended_users || {}) };

              if (updates.status === 'suspended') {
                suspendedUsers[userId] = {
                  status: 'suspended',
                  suspended_at: updates.suspended_at || new Date().toISOString(),
                  suspended_reason: updates.suspended_reason || 'Account disabled by administrator.',
                  suspended_by: updates.suspended_by,
                  suspended_by_role: updates.suspended_by_role || 'admin',
                  cascade_suspended: updates.cascade_suspended || false,
                };
              } else if (updates.status === 'active') {
                delete suspendedUsers[userId];
              }

              await supabase
                .from('tenants')
                .update({ settings: { ...currentSettings, suspended_users: suspendedUsers } })
                .or(`id.eq.${tenantId},slug.eq.${tenantId}`);
            }

            return {
              ...existingUser,
              status: updates.status || (existingUser as any).status || 'active',
              suspended_at: updates.suspended_at,
              suspended_reason: updates.suspended_reason,
              suspended_by: updates.suspended_by,
              suspended_by_role: updates.suspended_by_role,
              cascade_suspended: updates.cascade_suspended,
            } as User;
          }
        }
      }

      if (res.error) throw new DatabaseError(`Failed to update user: ${res.error.message}`, res.error);
      if (!res.data) throw new NotFoundError('User', userId);
      return {
        ...res.data,
        status: updates.status || (res.data as any).status || 'active',
        suspended_at: updates.suspended_at || (res.data as any).suspended_at,
        suspended_reason: updates.suspended_reason || (res.data as any).suspended_reason,
        suspended_by: updates.suspended_by || (res.data as any).suspended_by,
        suspended_by_role: updates.suspended_by_role || (res.data as any).suspended_by_role,
        cascade_suspended: updates.cascade_suspended ?? (res.data as any).cascade_suspended,
      } as User;
    }

    const store = getStore();
    const user = store.users.find((u) => u.id === userId);
    if (!user) throw new NotFoundError('User', userId);

    Object.assign(user, cleanUpdates);
    return user;
  }

  /**
   * Saves (or clears, with null) the profile picture path.
   * Returns false when the database has no avatar_path column yet, so callers can say
   * "not available" instead of failing. Nothing else on the row is touched.
   */
  async setAvatarPath(userId: string, path: string | null, client: any = getSupabaseServiceClient()): Promise<boolean> {
    const now = new Date().toISOString();
    if (client) {
      const { data, error } = await client
        .from('users')
        .update({ avatar_path: path, updated_at: now })
        .eq('id', userId)
        .select('id');
      if (error) {
        if (isMissingColumnError(error)) return false;
        throw new DatabaseError(`Failed to save profile picture: ${error.message}`, error);
      }
      if (!data || data.length === 0) throw new NotFoundError('User', userId);
      return true;
    }

    const user = getStore().users.find((u) => u.id === userId);
    if (!user) throw new NotFoundError('User', userId);
    user.avatar_path = path;
    user.updated_at = now;
    return true;
  }

  async delete(userId: string): Promise<void> {
    const supabase = getSupabaseServiceClient();
    if (supabase) {
      const { error } = await supabase.from('users').delete().eq('id', userId);
      if (error) throw new DatabaseError(`Failed to delete user: ${error.message}`, error);
      return;
    }

    const store = getStore();
    const idx = store.users.findIndex((u) => u.id === userId);
    if (idx !== -1) store.users.splice(idx, 1);
  }

  /**
   * Disables/bans a user account with reason and attribution.
   */
  async suspendUser(
    userId: string,
    reason: string,
    suspendedBy: string,
    suspendedByRole: 'admin' | 'csm' | 'client',
    cascadeSuspended: boolean = false
  ): Promise<User> {
    const now = new Date().toISOString();
    return this.update(userId, {
      status: 'suspended',
      suspended_at: now,
      suspended_reason: reason,
      suspended_by: suspendedBy,
      suspended_by_role: suspendedByRole,
      cascade_suspended: cascadeSuspended,
    });
  }

  /**
   * Re-activates/unbans a user account.
   */
  async unsuspendUser(userId: string): Promise<User> {
    const supabase = getSupabaseServiceClient();
    if (supabase) {
      const { data: userRecord } = await supabase
        .from('users')
        .select('tenant_id')
        .eq('id', userId)
        .maybeSingle();

      if (userRecord?.tenant_id) {
        const { data: tenantData } = await supabase
          .from('tenants')
          .select('settings')
          .eq('id', userRecord.tenant_id)
          .maybeSingle();

        const currentSettings = (tenantData?.settings || {}) as Record<string, any>;
        if (currentSettings.suspended_users?.[userId]) {
          const newSuspendedUsers = { ...currentSettings.suspended_users };
          delete newSuspendedUsers[userId];
          await supabase
            .from('tenants')
            .update({ settings: { ...currentSettings, suspended_users: newSuspendedUsers } })
            .eq('id', userRecord.tenant_id);
        }
      }

      let res = await supabase
        .from('users')
        .update({
          status: 'active',
          suspended_at: null,
          suspended_reason: null,
          suspended_by: null,
          suspended_by_role: null,
          cascade_suspended: false,
          updated_at: new Date().toISOString(),
        })
        .eq('id', userId)
        .select('*')
        .single();

      if (res.error) {
        res = await supabase
          .from('users')
          .update({
            status: 'active',
            updated_at: new Date().toISOString(),
          })
          .eq('id', userId)
          .select('*')
          .single();
      }

      if (res.error) throw new DatabaseError(`Failed to unsuspend user: ${res.error.message}`, res.error);
      if (!res.data) throw new NotFoundError('User', userId);
      return this.normalizeUserWithSuspension(res.data);
    }

    const store = getStore();
    const user = store.users.find((u) => u.id === userId);
    if (!user) throw new NotFoundError('User', userId);

    user.status = 'active';
    user.suspended_at = undefined;
    user.suspended_reason = undefined;
    user.suspended_by = undefined;
    user.suspended_by_role = undefined;
    user.cascade_suspended = false;
    return user;
  }

  /**
   * Cascades suspension to all client members under a tenant when the main client is suspended.
   */
  async cascadeSuspendByTenant(
    tenantId: string,
    reason: string,
    suspendedBy: string,
    suspendedByRole: 'admin' | 'csm'
  ): Promise<number> {
    const users = await this.listByTenant(tenantId);
    let count = 0;
    for (const u of users) {
      if (u.status !== 'suspended') {
        await this.suspendUser(u.id, reason, suspendedBy, suspendedByRole, true);
        count++;
      }
    }
    return count;
  }

  /**
   * Unlocks users who were cascade-suspended when the main client is unbanned.
   * Users who were individually banned by the client remain untouched unless specified.
   */
  async cascadeUnsuspendByTenant(tenantId: string): Promise<number> {
    const users = await this.listByTenant(tenantId);
    let count = 0;
    for (const u of users) {
      if (u.status === 'suspended' && (u.cascade_suspended || u.role === 'client')) {
        await this.unsuspendUser(u.id);
        count++;
      }
    }
    return count;
  }

  /**
   * Updates allowed module permissions for a client team member.
   */
  async updatePermissions(userId: string, allowedModules: string[]): Promise<User> {
    const supabase = getSupabaseServiceClient();
    if (supabase) {
      const { data: userRecord } = await supabase
        .from('users')
        .select('tenant_id')
        .eq('id', userId)
        .maybeSingle();

      if (userRecord?.tenant_id) {
        const { data: tenantData } = await supabase
          .from('tenants')
          .select('settings')
          .or(`id.eq.${userRecord.tenant_id},slug.eq.${userRecord.tenant_id}`)
          .maybeSingle();

        const currentSettings = (tenantData?.settings || {}) as Record<string, any>;
        const userPermissions = { ...(currentSettings.user_permissions || {}) };
        userPermissions[userId] = allowedModules;

        await supabase
          .from('tenants')
          .update({ settings: { ...currentSettings, user_permissions: userPermissions } })
          .or(`id.eq.${userRecord.tenant_id},slug.eq.${userRecord.tenant_id}`);
      }

      try {
        await supabase
          .from('users')
          .update({ allowed_modules: allowedModules, updated_at: new Date().toISOString() })
          .eq('id', userId);
      } catch {
        // Fallback to settings is active
      }

      const updated = await this.findById(userId);
      if (!updated) throw new NotFoundError('User', userId);
      return { ...updated, allowed_modules: allowedModules };
    }

    const store = getStore();
    const user = store.users.find((u) => u.id === userId);
    if (!user) throw new NotFoundError('User', userId);

    user.allowed_modules = allowedModules;
    user.updated_at = new Date().toISOString();
    return user;
  }
}

export const userRepository = new UserRepository();
