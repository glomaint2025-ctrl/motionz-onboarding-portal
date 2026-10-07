import { randomUUID } from 'crypto';
import { getSupabaseServiceClient } from '../supabase-client';
import { getStore } from '../mock-db';
import { Lead } from '../schema';
import { DatabaseError } from '../../errors';
import { fetchAllRows } from '../paging';

/** Postgres error code for "duplicate key value violates unique constraint". */
const UNIQUE_VIOLATION = '23505';

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

/**
 * The grouped counts come from database functions added by migration 20261008000001. Until that
 * migration has run the functions do not exist: the repository then reads the rows itself, and
 * asks again for the functions after a while (this remembers a missing function, never data).
 */
const RPC_RETRY_MS = 10 * 60 * 1000;
const rpcMissingSince = new Map<string, number>();

function isMissingFunction(error: any): boolean {
  const message = String(error?.message || '').toLowerCase();
  return error?.code === 'PGRST202' || error?.code === '42883' || message.includes('could not find the function') || message.includes('schema cache');
}

/** Calls a database function; null when it is not installed (or failed), so the caller falls back. */
async function callOptionalRpc<T>(supabase: any, name: string, args?: Record<string, unknown>): Promise<T[] | null> {
  const missingAt = rpcMissingSince.get(name);
  if (missingAt && Date.now() - missingAt < RPC_RETRY_MS) return null;
  try {
    const { data, error } = await (args ? supabase.rpc(name, args) : supabase.rpc(name));
    if (error) {
      if (isMissingFunction(error)) rpcMissingSince.set(name, Date.now());
      else console.error(`[leads] ${name} failed, reading the rows instead: ${error.message}`);
      return null;
    }
    rpcMissingSince.delete(name);
    return (data || []) as T[];
  } catch (err: any) {
    console.error(`[leads] ${name} failed, reading the rows instead: ${err?.message}`);
    return null;
  }
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

  /** One lead of this client, or null (also when the id belongs to another client). */
  async findById(tenantId: string, id: string): Promise<Lead | null> {
    const supabase = getSupabaseServiceClient();
    if (supabase) {
      // Anything that is not a UUID cannot be a lead id; asking the database would be an error.
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return null;
      const { data, error } = await supabase.from('leads').select('*').eq('tenant_id', tenantId).eq('id', id).maybeSingle();
      if (error) throw new DatabaseError(`Failed to fetch lead: ${error.message}`, error);
      return (data as Lead) || null;
    }
    return getStore().leads.find((l) => l.tenant_id === tenantId && l.id === id) || null;
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
    const grouped = supabase
      ? await callOptionalRpc<{ stage: string | null; lead_count: number | string }>(supabase, 'lead_stage_counts', { p_tenant_id: tenantId })
      : null;
    if (grouped) {
      // One grouped query in the database.
      for (const row of grouped) {
        const stage = row.stage || 'New';
        counts.set(stage, (counts.get(stage) || 0) + Number(row.lead_count || 0));
      }
    } else if (supabase) {
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

  /**
   * When each client's newest lead arrived (client id → created_at), for every client that has
   * leads, in one grouped query. Null when the database function is not installed yet: the caller
   * then asks client by client.
   */
  async lastLeadAtByTenant(): Promise<Map<string, string> | null> {
    const latest = new Map<string, string>();
    const supabase = getSupabaseServiceClient();
    if (supabase) {
      const name = 'tenant_last_lead_at';
      const missingAt = rpcMissingSince.get(name);
      if (missingAt && Date.now() - missingAt < RPC_RETRY_MS) return null;
      try {
        // Read page by page like any other long list: one answer holds at most 1,000 clients.
        const rows = await fetchAllRows<{ tenant_id: string; last_lead_at: string }>(
          (from, to) => supabase.rpc(name, {}, { count: 'exact' }).order('tenant_id', { ascending: true }).range(from, to),
          (error) => {
            throw error;
          }
        );
        rpcMissingSince.delete(name);
        for (const row of rows) if (row.tenant_id && row.last_lead_at) latest.set(row.tenant_id, row.last_lead_at);
        return latest;
      } catch (error: any) {
        if (isMissingFunction(error)) rpcMissingSince.set(name, Date.now());
        else console.error(`[leads] ${name} failed, asking client by client instead: ${error?.message}`);
        return null;
      }
    }

    for (const lead of getStore().leads) {
      if (!lead.created_at) continue;
      const current = latest.get(lead.tenant_id);
      if (!current || new Date(lead.created_at).getTime() > new Date(current).getTime()) latest.set(lead.tenant_id, lead.created_at);
    }
    return latest;
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
   * so repeated webhooks never duplicate a lead. Works with or without the unique index on
   * (tenant_id, ghl_contact_id); only the index makes it safe against two events arriving together.
   */
  async upsertByGhlContactId(
    tenantId: string,
    ghlContactId: string,
    fields: Partial<Omit<Lead, 'id' | 'tenant_id' | 'ghl_contact_id' | 'created_at' | 'updated_at'>>
  ): Promise<Lead> {
    const now = new Date().toISOString();
    const supabase = getSupabaseServiceClient();
    if (supabase) {
      // Never assumes a single row: duplicates made before the unique index existed would make
      // `.maybeSingle()` fail on every later event. The most recently updated row is the one kept current.
      const findId = async (): Promise<string | null> => {
        const { data, error } = await supabase
          .from('leads')
          .select('id')
          .eq('tenant_id', tenantId)
          .eq('ghl_contact_id', ghlContactId)
          .order('updated_at', { ascending: false })
          .order('id', { ascending: true })
          .limit(1);
        if (error) throw new DatabaseError(`Failed to look up lead: ${error.message}`, error);
        return data?.[0]?.id ?? null;
      };
      const updateById = async (id: string): Promise<Lead> => {
        const { data, error } = await supabase
          .from('leads')
          .update({ ...fields, updated_at: now })
          .eq('id', id)
          .select('*')
          .single();
        if (error) throw new DatabaseError(`Failed to update lead: ${error.message}`, error);
        return data as Lead;
      };

      const existingId = await findId();
      if (existingId) return updateById(existingId);

      const { data, error } = await supabase
        .from('leads')
        .insert({
          tenant_id: tenantId,
          ghl_contact_id: ghlContactId,
          status: 'New',
          ...fields,
          id: randomUUID(),
          created_at: now,
          updated_at: now,
        })
        .select('*')
        .single();
      if (!error) return data as Lead;

      // With the unique index (migration 20261007000003), two events arriving together cannot both
      // insert: the loser gets a unique violation and updates the winner's row instead.
      if ((error as any).code === UNIQUE_VIOLATION) {
        const winnerId = await findId();
        if (winnerId) return updateById(winnerId);
      }
      throw new DatabaseError(`Failed to create lead: ${error.message}`, error);
    }

    const store = getStore();
    const existing = store.leads.find((l) => l.tenant_id === tenantId && l.ghl_contact_id === ghlContactId);
    if (existing) {
      Object.assign(existing, fields, { updated_at: now });
      return existing;
    }
    return this.create({ tenant_id: tenantId, ghl_contact_id: ghlContactId, status: 'New', ...fields });
  }

  /**
   * Removes a client's lead by its GoHighLevel contact id (every row, should old duplicates exist).
   * Returns what was removed; an empty list when the portal never had that lead.
   * Lead requests that point at it keep their own copy of the name and phone number: the database
   * clears their lead_id (lead_requests.lead_id is ON DELETE SET NULL).
   */
  async deleteByGhlContactId(tenantId: string, ghlContactId: string): Promise<Lead[]> {
    const supabase = getSupabaseServiceClient();
    if (supabase) {
      const { data, error } = await supabase
        .from('leads')
        .delete()
        .eq('tenant_id', tenantId)
        .eq('ghl_contact_id', ghlContactId)
        .select('*');
      if (error) throw new DatabaseError(`Failed to remove lead: ${error.message}`, error);
      return (data || []) as Lead[];
    }

    const store = getStore();
    const removed = store.leads.filter((l) => l.tenant_id === tenantId && l.ghl_contact_id === ghlContactId);
    if (removed.length === 0) return [];
    const ids = new Set(removed.map((l) => l.id));
    for (let i = store.leads.length - 1; i >= 0; i--) if (ids.has(store.leads[i].id)) store.leads.splice(i, 1);
    // What the database does through ON DELETE SET NULL.
    if (Array.isArray(store.leadRequests)) {
      for (const r of store.leadRequests) if (r.lead_id && ids.has(r.lead_id)) r.lead_id = null;
    }
    return removed;
  }
}

export const leadRepository = new LeadRepository();
