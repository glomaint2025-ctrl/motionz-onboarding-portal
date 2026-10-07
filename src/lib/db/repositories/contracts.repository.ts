import { randomUUID } from 'crypto';
import { getSupabaseServiceClient } from '../supabase-client';
import { getStore } from '../mock-db';
import { Contract } from '../schema';
import { DatabaseError } from '../../errors';
import { fetchAllRows } from '../paging';

export class ContractRepository {
  async listByTenant(tenantId: string): Promise<Contract[]> {
    const supabase = getSupabaseServiceClient();
    if (supabase) {
      const { data, error } = await supabase
        .from('contracts')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false });

      if (error) throw new DatabaseError(`Failed to fetch contracts: ${error.message}`, error);
      return (data || []) as Contract[];
    }

    const store = getStore();
    return store.contracts.filter((c) => c.tenant_id === tenantId);
  }

  /**
   * The ids of every client that has at least one contract attached, in one query.
   * Staff lists and the admin dashboard use it for the "No contract" reminder.
   */
  async listTenantIdsWithContract(): Promise<Set<string>> {
    const supabase = getSupabaseServiceClient();
    if (supabase) {
      // Read page by page: one request returns at most 1,000 rows, and a client beyond that
      // would wrongly show as having no contract.
      const rows = await fetchAllRows<{ tenant_id: string }>(
        (from, to) =>
          supabase
            .from('contracts')
            .select('tenant_id', { count: 'exact' })
            .order('tenant_id', { ascending: true })
            .order('id', { ascending: true })
            .range(from, to),
        (error) => {
          throw new DatabaseError(`Failed to fetch contracts: ${error.message}`, error);
        }
      );
      return new Set(rows.map((row) => row.tenant_id));
    }
    return new Set(getStore().contracts.map((c) => c.tenant_id));
  }

  async create(contract: Omit<Contract, 'id' | 'created_at'> & { id?: string }): Promise<Contract> {
    const now = new Date().toISOString();
    const id = contract.id || randomUUID();
    const newRecord: Contract = {
      ...contract,
      id,
      created_at: now,
    };

    const supabase = getSupabaseServiceClient();
    if (supabase) {
      const { data, error } = await supabase
        .from('contracts')
        .insert(newRecord)
        .select('*')
        .single();

      if (error) throw new DatabaseError(`Failed to create contract: ${error.message}`, error);
      return data as Contract;
    }

    const store = getStore();
    store.contracts.push(newRecord);
    return newRecord;
  }

  async remove(tenantId: string, id: string): Promise<boolean> {
    const supabase = getSupabaseServiceClient();
    if (supabase) {
      const { error, count } = await supabase.from('contracts').delete({ count: 'exact' }).eq('id', id).eq('tenant_id', tenantId);
      if (error) throw new DatabaseError(`Failed to delete contract: ${error.message}`, error);
      return (count || 0) > 0;
    }
    const store = getStore();
    const before = store.contracts.length;
    store.contracts = store.contracts.filter((c) => !(c.id === id && c.tenant_id === tenantId));
    return store.contracts.length < before;
  }
}

export const contractRepository = new ContractRepository();
