import { randomUUID } from 'crypto';
import { getSupabaseServiceClient } from '../supabase-client';
import { getStore } from '../mock-db';
import { Contract } from '../schema';
import { DatabaseError } from '../../errors';

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
