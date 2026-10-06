import { randomUUID } from 'crypto';
import { getSupabaseServiceClient } from '../supabase-client';
import { getStore } from '../mock-db';
import { LeadRequest } from '../schema';
import { AppError, DatabaseError } from '../../errors';

/**
 * The `lead_requests` table has not been created yet (migration 20261007000004 not run).
 * Callers turn this into a friendly "not available yet" message or an empty list, never a 500.
 */
export class LeadRequestsUnavailableError extends AppError {
  constructor() {
    super('The lead_requests table does not exist yet.', 503, 'LEAD_REQUESTS_UNAVAILABLE');
  }
}

export function isLeadRequestsUnavailable(error: unknown): error is LeadRequestsUnavailableError {
  return error instanceof LeadRequestsUnavailableError;
}

/** Postgres "undefined table" (42P01) or PostgREST "table not in the schema cache" (PGRST205). */
function isMissingTable(error: any): boolean {
  const message = String(error?.message || '').toLowerCase();
  return (
    error?.code === '42P01' ||
    error?.code === 'PGRST205' ||
    (message.includes('lead_requests') && (message.includes('schema cache') || message.includes('does not exist')))
  );
}

function fail(action: string, error: any): never {
  if (isMissingTable(error)) throw new LeadRequestsUnavailableError();
  throw new DatabaseError(`Failed to ${action}: ${error.message}`, error);
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const uuidOrNull = (value: string | null | undefined): string | null => (value && UUID.test(value) ? value : null);

/** The in-memory list. A store without one stands for "the table has not been created yet". */
function mockRows(): LeadRequest[] {
  const rows = getStore().leadRequests;
  if (!Array.isArray(rows)) throw new LeadRequestsUnavailableError();
  return rows;
}

const newestFirst = (a: LeadRequest, b: LeadRequest) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime();

export type NewLeadRequest = Omit<LeadRequest, 'id' | 'created_at' | 'status' | 'resolved_at' | 'resolved_by'>;

export class LeadRequestRepository {
  async create(request: NewLeadRequest): Promise<LeadRequest> {
    const record: LeadRequest = {
      ...request,
      id: randomUUID(),
      status: 'open',
      created_at: new Date().toISOString(),
      resolved_at: null,
      resolved_by: null,
    };

    const supabase = getSupabaseServiceClient();
    if (supabase) {
      // The user columns are foreign keys: an id that is not a real user id is stored as "unknown".
      const row = { ...record, submitted_by: uuidOrNull(record.submitted_by), lead_id: uuidOrNull(record.lead_id) };
      const { data, error } = await supabase.from('lead_requests').insert(row).select('*').single();
      if (error) fail('save the lead request', error);
      return data as LeadRequest;
    }

    mockRows().unshift(record);
    return record;
  }

  async findById(id: string): Promise<LeadRequest | null> {
    const supabase = getSupabaseServiceClient();
    if (supabase) {
      if (!UUID.test(id)) return null;
      const { data, error } = await supabase.from('lead_requests').select('*').eq('id', id).maybeSingle();
      if (error) fail('fetch the lead request', error);
      return (data as LeadRequest) || null;
    }
    return mockRows().find((r) => r.id === id) || null;
  }

  /** One client's requests, newest first, with the total number they have. */
  async listByTenant(tenantId: string, options: { limit?: number; offset?: number } = {}): Promise<{ rows: LeadRequest[]; total: number }> {
    const limit = Math.max(1, options.limit || 20);
    const offset = Math.max(0, options.offset || 0);

    const supabase = getSupabaseServiceClient();
    if (supabase) {
      const { data, error, count } = await supabase
        .from('lead_requests')
        .select('*', { count: 'exact' })
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);
      if (error) {
        // A page past the end is an empty page, not a failure.
        if ((error as any).code === 'PGRST103') return { rows: [], total: 0 };
        fail('list lead requests', error);
      }
      return { rows: (data || []) as LeadRequest[], total: count ?? (data || []).length };
    }

    const rows = mockRows().filter((r) => r.tenant_id === tenantId).sort(newestFirst);
    return { rows: rows.slice(offset, offset + limit), total: rows.length };
  }

  /** Requests nobody has marked done yet, across every client, newest first. */
  async listOpen(limit = 200): Promise<LeadRequest[]> {
    const supabase = getSupabaseServiceClient();
    if (supabase) {
      const { data, error } = await supabase
        .from('lead_requests')
        .select('*')
        .eq('status', 'open')
        .order('created_at', { ascending: false })
        .limit(limit);
      if (error) fail('list open lead requests', error);
      return (data || []) as LeadRequest[];
    }
    return mockRows().filter((r) => r.status === 'open').sort(newestFirst).slice(0, limit);
  }

  /** Marks a request done (recording who and when) or reopens it. Returns null when it does not exist. */
  async setStatus(id: string, status: LeadRequest['status'], resolvedBy: string | null): Promise<LeadRequest | null> {
    const change =
      status === 'done'
        ? { status, resolved_at: new Date().toISOString(), resolved_by: resolvedBy }
        : { status, resolved_at: null, resolved_by: null };

    const supabase = getSupabaseServiceClient();
    if (supabase) {
      if (!UUID.test(id)) return null;
      const { data, error } = await supabase
        .from('lead_requests')
        .update({ ...change, resolved_by: uuidOrNull(change.resolved_by) })
        .eq('id', id)
        .select('*')
        .maybeSingle();
      if (error) fail('update the lead request', error);
      return (data as LeadRequest) || null;
    }

    const row = mockRows().find((r) => r.id === id);
    if (!row) return null;
    Object.assign(row, change);
    return row;
  }
}

export const leadRequestRepository = new LeadRequestRepository();
