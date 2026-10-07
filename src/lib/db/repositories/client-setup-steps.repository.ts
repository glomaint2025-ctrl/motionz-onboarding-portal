import { randomUUID } from 'crypto';
import { getSupabaseServiceClient, resolveTenantId } from '../supabase-client';
import { getStore } from '../mock-db';
import { ClientSetupStep, SetupStatus } from '../schema';
import { DatabaseError, NotFoundError } from '../../errors';
import { fetchAllRows, chunk, IN_MAX_IDS } from '../paging';

/** What the staff lists need from a setup step to work out progress and the current step. */
export type SetupStepSummary = Pick<ClientSetupStep, 'tenant_id' | 'status' | 'name' | 'sort_order' | 'updated_at'>;
const STEP_SUMMARY_COLUMNS = 'tenant_id,status,name,sort_order,updated_at';

export class ClientSetupStepRepository {
  async listByTenant(tenantId: string): Promise<ClientSetupStep[]> {
    const supabase = getSupabaseServiceClient();
    if (supabase) {
      const targetTenantId = resolveTenantId(tenantId);
      const { data, error } = await supabase
        .from('client_setup_steps')
        .select('*')
        .eq('tenant_id', targetTenantId)
        .order('sort_order', { ascending: true });

      if (error) throw new DatabaseError(`Failed to fetch setup steps: ${error.message}`, error);
      return (data || []) as ClientSetupStep[];
    }

    const store = getStore();
    const resolvedId = resolveTenantId(tenantId);
    return store.clientSetupSteps
      .filter((s) => s.tenant_id === tenantId || s.tenant_id === resolvedId)
      .sort((a, b) => a.sort_order - b.sort_order);
  }

  /**
   * The setup steps of many clients at once, grouped by client and in step order: a fixed number
   * of requests instead of one per client. Pass null for every client. Clients with no steps are absent.
   */
  async listByTenants(tenantIds: string[] | null): Promise<Map<string, SetupStepSummary[]>> {
    const grouped = new Map<string, SetupStepSummary[]>();
    const add = (rows: SetupStepSummary[]) => {
      for (const row of rows) {
        const list = grouped.get(row.tenant_id);
        if (list) list.push(row);
        else grouped.set(row.tenant_id, [row]);
      }
    };
    const wanted = tenantIds ? new Set(tenantIds) : null;
    if (wanted && wanted.size === 0) return grouped;

    const supabase = getSupabaseServiceClient();
    if (supabase) {
      const fail = (error: any): never => {
        throw new DatabaseError(`Failed to fetch setup steps: ${error.message}`, error);
      };
      const read = (ids: string[] | null) =>
        fetchAllRows<SetupStepSummary>((from, to) => {
          let query = supabase.from('client_setup_steps').select(STEP_SUMMARY_COLUMNS, { count: 'exact' });
          if (ids) query = query.in('tenant_id', ids);
          return query
            .order('tenant_id', { ascending: true })
            .order('sort_order', { ascending: true })
            .order('id', { ascending: true })
            .range(from, to) as any;
        }, fail);

      if (wanted && wanted.size <= IN_MAX_IDS) {
        (await Promise.all(chunk(Array.from(wanted)).map((part) => read(part)))).forEach(add);
        return grouped;
      }
      // Every client (or a long id list): one full read, filtered here.
      const rows = await read(null);
      add(wanted ? rows.filter((r) => wanted.has(r.tenant_id)) : rows);
      return grouped;
    }

    const rows = getStore()
      .clientSetupSteps.filter((s) => !wanted || wanted.has(s.tenant_id))
      .slice()
      .sort((a, b) => a.sort_order - b.sort_order);
    add(rows);
    return grouped;
  }

  async cloneStepsForTenant(tenantId: string, steps: Omit<ClientSetupStep, 'id'>[]): Promise<ClientSetupStep[]> {
    const records: ClientSetupStep[] = steps.map((s, idx) => ({
      ...s,
      id: randomUUID(),
      tenant_id: tenantId,
      updated_at: new Date().toISOString(),
    }));

    const supabase = getSupabaseServiceClient();
    if (supabase) {
      const { data, error } = await supabase
        .from('client_setup_steps')
        .insert(records)
        .select('*');

      if (error) throw new DatabaseError(`Failed to clone setup steps: ${error.message}`, error);
      return (data || []) as ClientSetupStep[];
    }

    const store = getStore();
    store.clientSetupSteps.push(...records);
    return records;
  }

  async updateStep(
    tenantId: string,
    stepKey: string,
    updates: Partial<Pick<ClientSetupStep, 'status' | 'name' | 'what_it_is' | 'right_now' | 'we_need_from_you' | 'unlocks'>>
  ): Promise<ClientSetupStep> {
    const now = new Date().toISOString();
    const cleanUpdates: any = {
      ...updates,
      updated_at: now,
    };
    if (updates.status === 'done') {
      cleanUpdates.completed_at = now;
    }

    const supabase = getSupabaseServiceClient();
    if (supabase) {
      const { data, error } = await supabase
        .from('client_setup_steps')
        .update(cleanUpdates)
        .eq('tenant_id', tenantId)
        .eq('step_key', stepKey)
        .select('*')
        .single();

      if (error) throw new DatabaseError(`Failed to update step: ${error.message}`, error);
      if (!data) throw new NotFoundError('ClientSetupStep', `${tenantId}:${stepKey}`);
      return data as ClientSetupStep;
    }

    const store = getStore();
    const resolvedId = resolveTenantId(tenantId);
    const step = store.clientSetupSteps.find(
      (s) => (s.tenant_id === tenantId || s.tenant_id === resolvedId) && s.step_key === stepKey
    );
    if (!step) throw new NotFoundError('ClientSetupStep', `${tenantId}:${stepKey}`);

    Object.assign(step, cleanUpdates);
    return step;
  }
}

export const clientSetupStepRepository = new ClientSetupStepRepository();
