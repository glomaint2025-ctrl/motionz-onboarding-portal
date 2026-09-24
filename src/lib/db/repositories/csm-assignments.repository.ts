import { randomUUID } from 'crypto';
import { getSupabaseServiceClient } from '../supabase-client';
import { getStore } from '../mock-db';
import { CsmAssignment } from '../schema';
import { DatabaseError } from '../../errors';

export class CsmAssignmentRepository {
  async assign(csmUserId: string, tenantId: string): Promise<CsmAssignment> {
    const now = new Date().toISOString();
    const id = randomUUID();
    const record: CsmAssignment = { id, csm_user_id: csmUserId, tenant_id: tenantId, assigned_at: now };

    const supabase = getSupabaseServiceClient();
    if (supabase) {
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

    store.csmAssignments.push(record);
    return record;
  }

  async findByTenant(tenantId: string): Promise<CsmAssignment | null> {
    const supabase = getSupabaseServiceClient();
    if (supabase) {
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

  async listByCsm(csmUserId: string): Promise<CsmAssignment[]> {
    const supabase = getSupabaseServiceClient();
    if (supabase) {
      const { data, error } = await supabase
        .from('csm_assignments')
        .select('*')
        .eq('csm_user_id', csmUserId);

      if (error) throw new DatabaseError(`Failed to list assignments: ${error.message}`, error);
      return (data || []) as CsmAssignment[];
    }

    const store = getStore();
    return store.csmAssignments.filter((a) => a.csm_user_id === csmUserId);
  }
}

export const csmAssignmentRepository = new CsmAssignmentRepository();
