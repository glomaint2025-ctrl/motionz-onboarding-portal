import { randomUUID } from 'crypto';
import { getSupabaseServiceClient } from '../supabase-client';
import { getStore } from '../mock-db';
import { Lead } from '../schema';
import { DatabaseError } from '../../errors';

export class LeadRepository {
  async listByTenant(
    tenantId: string,
    options?: { status?: string; limit?: number; offset?: number }
  ): Promise<Lead[]> {
    const limit = options?.limit || 50;
    const offset = options?.offset || 0;

    const supabase = getSupabaseServiceClient();
    if (supabase) {
      let query = supabase
        .from('leads')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      if (options?.status) {
        query = query.eq('status', options.status);
      }

      const { data, error } = await query;
      if (error) throw new DatabaseError(`Failed to fetch leads: ${error.message}`, error);
      return (data || []) as Lead[];
    }

    const store = getStore();
    let results = store.leads.filter((l) => l.tenant_id === tenantId);
    if (options?.status) {
      results = results.filter((l) => l.status.toLowerCase() === options.status?.toLowerCase());
    }
    return results.slice(offset, offset + limit);
  }

  async create(lead: Omit<Lead, 'id' | 'created_at' | 'updated_at'> & { id?: string }): Promise<Lead> {
    const now = new Date().toISOString();
    const id = lead.id || randomUUID();
    const newRecord: Lead = {
      ...lead,
      id,
      created_at: now,
      updated_at: now,
    };

    const supabase = getSupabaseServiceClient();
    if (supabase) {
      const { data, error } = await supabase
        .from('leads')
        .insert(newRecord)
        .select('*')
        .single();

      if (error) throw new DatabaseError(`Failed to create lead: ${error.message}`, error);
      return data as Lead;
    }

    const store = getStore();
    store.leads.unshift(newRecord);
    return newRecord;
  }
}

export const leadRepository = new LeadRepository();
