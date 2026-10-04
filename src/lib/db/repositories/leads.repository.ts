import { randomUUID } from 'crypto';
import { getSupabaseServiceClient } from '../supabase-client';
import { getStore } from '../mock-db';
import { Lead } from '../schema';
import { DatabaseError } from '../../errors';

export interface LeadQuery {
  /** Free-text search over name, email and phone. Every word must match. */
  search?: string;
  /** Exact pipeline stage (the lead's status). */
  stage?: string;
  limit?: number;
  offset?: number;
}

/** Words of a search box entry, stripped of characters that have meaning in a database filter. */
function searchTerms(search?: string): string[] {
  return (search || '')
    .replace(/[,()"\\%*]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 5);
}

function matchesTerms(lead: Lead, terms: string[]): boolean {
  const haystack = [lead.first_name, lead.last_name, lead.email, lead.phone].filter(Boolean).join(' ').toLowerCase();
  return terms.every((t) => haystack.includes(t.toLowerCase()));
}

export class LeadRepository {
  /**
   * One page of a client's leads, newest first, with the total number that match.
   * Search and stage filtering happen in the database so nothing is capped silently.
   */
  async query(tenantId: string, options: LeadQuery = {}): Promise<{ leads: Lead[]; total: number }> {
    const limit = Math.max(1, options.limit || 25);
    const offset = Math.max(0, options.offset || 0);
    const terms = searchTerms(options.search);

    const supabase = getSupabaseServiceClient();
    if (supabase) {
      let query = supabase
        .from('leads')
        .select('*', { count: 'exact' })
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);
      if (options.stage) query = query.eq('status', options.stage);
      for (const t of terms) {
        query = query.or(`first_name.ilike.%${t}%,last_name.ilike.%${t}%,email.ilike.%${t}%,phone.ilike.%${t}%`);
      }
      const { data, error, count } = await query;
      if (error) {
        // Asking for a page past the end is not a failure: report an empty page with the real total.
        if ((error as any).code === 'PGRST103') {
          return { leads: [], total: await this.countMatching(tenantId, options) };
        }
        throw new DatabaseError(`Failed to fetch leads: ${error.message}`, error);
      }
      return { leads: (data || []) as Lead[], total: count ?? (data || []).length };
    }

    const store = getStore();
    const matching = store.leads
      .filter((l) => l.tenant_id === tenantId)
      .filter((l) => !options.stage || l.status === options.stage)
      .filter((l) => matchesTerms(l, terms))
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    return { leads: matching.slice(offset, offset + limit), total: matching.length };
  }

  /** Number of leads matching a search and stage, without fetching them. */
  private async countMatching(tenantId: string, options: LeadQuery): Promise<number> {
    const supabase = getSupabaseServiceClient();
    if (!supabase) return (await this.query(tenantId, { ...options, limit: 1, offset: 0 })).total;
    let query = supabase.from('leads').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId);
    if (options.stage) query = query.eq('status', options.stage);
    for (const t of searchTerms(options.search)) {
      query = query.or(`first_name.ilike.%${t}%,last_name.ilike.%${t}%,email.ilike.%${t}%,phone.ilike.%${t}%`);
    }
    const { count, error } = await query;
    if (error) throw new DatabaseError(`Failed to count leads: ${error.message}`, error);
    return count || 0;
  }

  /** The real number of leads a client has (optionally only those created since a date). */
  async countByTenant(tenantId: string, options: { since?: string } = {}): Promise<number> {
    const supabase = getSupabaseServiceClient();
    if (supabase) {
      let query = supabase.from('leads').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId);
      if (options.since) query = query.gte('created_at', options.since);
      const { count, error } = await query;
      if (error) throw new DatabaseError(`Failed to count leads: ${error.message}`, error);
      return count || 0;
    }

    const sinceMs = options.since ? new Date(options.since).getTime() : null;
    return getStore().leads.filter(
      (l) => l.tenant_id === tenantId && (sinceMs === null || new Date(l.created_at).getTime() >= sinceMs)
    ).length;
  }

  /** How many leads sit in each pipeline stage, largest first. */
  async stageCounts(tenantId: string): Promise<{ stage: string; count: number }[]> {
    const counts = new Map<string, number>();
    const add = (status?: string | null) => {
      const stage = status || 'New';
      counts.set(stage, (counts.get(stage) || 0) + 1);
    };

    const supabase = getSupabaseServiceClient();
    if (supabase) {
      // Only the stage column is read, in chunks, so every lead is counted.
      const CHUNK = 1000;
      for (let from = 0; from < 200000; from += CHUNK) {
        const { data, error } = await supabase
          .from('leads')
          .select('status')
          .eq('tenant_id', tenantId)
          .order('id', { ascending: true })
          .range(from, from + CHUNK - 1);
        if (error) throw new DatabaseError(`Failed to count leads by stage: ${error.message}`, error);
        (data || []).forEach((row: { status?: string | null }) => add(row.status));
        if (!data || data.length < CHUNK) break;
      }
    } else {
      getStore()
        .leads.filter((l) => l.tenant_id === tenantId)
        .forEach((l) => add(l.status));
    }

    return Array.from(counts.entries())
      .map(([stage, count]) => ({ stage, count }))
      .sort((a, b) => b.count - a.count || a.stage.localeCompare(b.stage));
  }

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

  /**
   * Inserts or updates a lead keyed by its GoHighLevel contact id within a tenant,
   * so repeated ContactCreate/ContactUpdate webhooks never duplicate a lead.
   */
  async upsertByGhlContactId(
    tenantId: string,
    ghlContactId: string,
    fields: Partial<Omit<Lead, 'id' | 'tenant_id' | 'ghl_contact_id' | 'created_at' | 'updated_at'>>
  ): Promise<Lead> {
    const now = new Date().toISOString();
    const supabase = getSupabaseServiceClient();
    if (supabase) {
      const { data: existing, error: findError } = await supabase
        .from('leads')
        .select('id')
        .eq('tenant_id', tenantId)
        .eq('ghl_contact_id', ghlContactId)
        .maybeSingle();
      if (findError) throw new DatabaseError(`Failed to look up lead: ${findError.message}`, findError);

      if (existing) {
        const { data, error } = await supabase
          .from('leads')
          .update({ ...fields, updated_at: now })
          .eq('id', existing.id)
          .select('*')
          .single();
        if (error) throw new DatabaseError(`Failed to update lead: ${error.message}`, error);
        return data as Lead;
      }
      return this.create({ tenant_id: tenantId, ghl_contact_id: ghlContactId, status: 'New', ...fields });
    }

    const store = getStore();
    const existing = store.leads.find((l) => l.tenant_id === tenantId && l.ghl_contact_id === ghlContactId);
    if (existing) {
      Object.assign(existing, fields, { updated_at: now });
      return existing;
    }
    return this.create({ tenant_id: tenantId, ghl_contact_id: ghlContactId, status: 'New', ...fields });
  }
}

export const leadRepository = new LeadRepository();
