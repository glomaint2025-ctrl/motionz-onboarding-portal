import { randomUUID } from 'crypto';
import { getSupabaseServiceClient } from '../supabase-client';
import { getStore } from '../mock-db';
import { CsmAssignment } from '../schema';
import { DatabaseError } from '../../errors';
import { fetchAllRows } from '../paging';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class CsmAssignmentRepository {
  private async resolveCsmUuid(csmUserId: string, supabase: any): Promise<string> {
    if (UUID_REGEX.test(csmUserId)) {
      return csmUserId;
    }

    let targetEmail = 'csm@motionz.ai';
    if (csmUserId === 'user-csm-2') {
      targetEmail = 'csm.agent@motionz.ai';
    } else if (csmUserId.includes('@')) {
      targetEmail = csmUserId;
    }

    const { data: user } = await supabase
      .from('users')
      .select('id')
      .eq('email', targetEmail)
      .maybeSingle();

    if (user?.id) {
      return user.id;
    }

    const { data: fallbackUser } = await supabase
      .from('users')
      .select('id')
      .eq('role', 'csm')
      .limit(1)
      .maybeSingle();

    return fallbackUser?.id || 'e0000000-0000-0000-0000-000000000002';
  }

  async assign(csmUserId: string, tenantId: string): Promise<CsmAssignment> {
    const now = new Date().toISOString();
    const id = randomUUID();

    const supabase = getSupabaseServiceClient();
    if (supabase) {
      const resolvedCsmId = await this.resolveCsmUuid(csmUserId, supabase);
      const record: CsmAssignment = { id, csm_user_id: resolvedCsmId, tenant_id: tenantId, assigned_at: now };

      const { data, error } = await supabase
        .from('csm_assignments')
        .upsert(record, { onConflict: 'csm_user_id,tenant_id' })
        .select('*')
        .single();

      if (error) throw new DatabaseError(`Failed to assign CSM: ${error.message}`, error);
      return data as CsmAssignment;
    }

    const store = getStore();
    const existing = store.csmAssignments.find(
      (a) => a.csm_user_id === csmUserId && a.tenant_id === tenantId
    );
    if (existing) return existing;

    const record: CsmAssignment = { id, csm_user_id: csmUserId, tenant_id: tenantId, assigned_at: now };
    store.csmAssignments.push(record);
    return record;
  }

  /**
   * Makes csmUserId the only CSM assigned to the client (a client has exactly one CSM),
   * or removes the assignment when csmUserId is null.
   */
  async setForTenant(tenantId: string, csmUserId: string | null): Promise<CsmAssignment | null> {
    const supabase = getSupabaseServiceClient();
    if (supabase) {
      const { error } = await supabase.from('csm_assignments').delete().eq('tenant_id', tenantId);
      if (error) throw new DatabaseError(`Failed to clear CSM assignment: ${error.message}`, error);
    } else {
      const store = getStore();
      store.csmAssignments = store.csmAssignments.filter((a) => a.tenant_id !== tenantId);
    }
    return csmUserId ? this.assign(csmUserId, tenantId) : null;
  }

  async findByTenant(tenantId: string): Promise<CsmAssignment | null> {
    const supabase = getSupabaseServiceClient();
    if (supabase) {
      if (!UUID_REGEX.test(tenantId)) {
        return null;
      }

      const { data, error } = await supabase
        .from('csm_assignments')
        .select('*')
        .eq('tenant_id', tenantId)
        .maybeSingle();

      if (error) throw new DatabaseError(`Failed to find CSM assignment: ${error.message}`, error);
      return data as CsmAssignment | null;
    }

    const store = getStore();
    return store.csmAssignments.find((a) => a.tenant_id === tenantId) || null;
  }

  /** Every CSM assignment, in one read (a client has at most one). Used to join lists in memory. */
  async listAll(): Promise<CsmAssignment[]> {
    const supabase = getSupabaseServiceClient();
    if (supabase) {
      return fetchAllRows<CsmAssignment>(
        (from, to) =>
          supabase
            .from('csm_assignments')
            .select('*', { count: 'exact' })
            .order('tenant_id', { ascending: true })
            .order('id', { ascending: true })
            .range(from, to),
        (error) => {
          throw new DatabaseError(`Failed to list assignments: ${error.message}`, error);
        }
      );
    }
    return getStore().csmAssignments.slice();
  }

  async listByCsm(csmUserId: string): Promise<CsmAssignment[]> {
    const supabase = getSupabaseServiceClient();
    if (supabase) {
      const resolvedCsmId = await this.resolveCsmUuid(csmUserId, supabase);
      const { data, error } = await supabase
        .from('csm_assignments')
        .select('*')
        .eq('csm_user_id', resolvedCsmId);

      if (error) throw new DatabaseError(`Failed to list assignments: ${error.message}`, error);
      return (data || []) as CsmAssignment[];
    }

    const store = getStore();
    return store.csmAssignments.filter(
      (a) =>
        a.csm_user_id === csmUserId ||
        (csmUserId === 'user-csm-1' && a.csm_user_id === 'e0000000-0000-0000-0000-000000000002')
    );
  }
}

export const csmAssignmentRepository = new CsmAssignmentRepository();
