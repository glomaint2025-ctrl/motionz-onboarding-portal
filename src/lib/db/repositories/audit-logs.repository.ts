import { randomUUID } from 'crypto';
import { getSupabaseServiceClient } from '../supabase-client';
import { getStore } from '../mock-db';
import { AuditLog } from '../schema';
import { DatabaseError } from '../../errors';

export interface AuditLogQuery {
  /** Inclusive ISO timestamps on created_at. */
  from?: string;
  to?: string;
  /** Free text: matched against actor email, action and resource type. */
  q?: string;
  /** Extra action keys to match (e.g. resolved from friendly labels). */
  actions?: string[];
  limit?: number;
  offset?: number;
}

/** Strips characters that have a meaning in a PostgREST filter expression. */
export function sanitizeFilterTerm(term: string): string {
  return term.replace(/[,()%*\\"'`:]/g, ' ').replace(/\s+/g, ' ').trim();
}

export class AuditLogRepository {
  /** Date-range / search query, newest first, with the total match count for pagination. */
  async query(options: AuditLogQuery = {}): Promise<{ rows: AuditLog[]; total: number }> {
    const limit = options.limit ?? 50;
    const offset = options.offset ?? 0;
    const term = options.q ? sanitizeFilterTerm(options.q) : '';
    const actions = (options.actions || []).filter((a) => /^[\w.]+$/.test(a));

    const supabase = getSupabaseServiceClient();
    if (supabase) {
      let query = supabase
        .from('audit_logs')
        .select('*', { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);
      if (options.from) query = query.gte('created_at', options.from);
      if (options.to) query = query.lte('created_at', options.to);
      if (term) {
        const like = `%${term}%`;
        const parts = [`actor_email.ilike.${like}`, `action.ilike.${like}`, `resource_type.ilike.${like}`];
        if (actions.length) parts.push(`action.in.(${actions.join(',')})`);
        query = query.or(parts.join(','));
      }
      const { data, error, count } = await query;
      if (error) throw new DatabaseError(`Failed to fetch audit logs: ${error.message}`, error);
      return { rows: (data || []) as AuditLog[], total: count ?? (data || []).length };
    }

    const fromMs = options.from ? new Date(options.from).getTime() : -Infinity;
    const toMs = options.to ? new Date(options.to).getTime() : Infinity;
    const needle = term.toLowerCase();
    const matches = getStore()
      .auditLogs.filter((l) => {
        const at = new Date(l.created_at).getTime();
        if (at < fromMs || at > toMs) return false;
        if (!needle) return true;
        return (
          l.actor_email.toLowerCase().includes(needle) ||
          l.action.toLowerCase().includes(needle) ||
          (l.resource_type || '').toLowerCase().includes(needle) ||
          actions.includes(l.action)
        );
      })
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    return { rows: matches.slice(offset, offset + limit), total: matches.length };
  }

  /** The newest entries whose action starts with `prefix` (e.g. "ghl.webhook"), optionally since a time. */
  async listByActionPrefix(prefix: string, options: { from?: string; limit?: number } = {}): Promise<AuditLog[]> {
    const limit = options.limit ?? 50;
    const safePrefix = prefix.replace(/[^\w.]/g, '');
    if (!safePrefix) return [];

    const supabase = getSupabaseServiceClient();
    if (supabase) {
      let query = supabase
        .from('audit_logs')
        .select('*')
        // "_" is a wildcard in LIKE; action names use it as a plain character.
        .like('action', `${safePrefix.replace(/_/g, '\\_')}%`)
        .order('created_at', { ascending: false })
        .limit(limit);
      if (options.from) query = query.gte('created_at', options.from);
      const { data, error } = await query;
      if (error) throw new DatabaseError(`Failed to fetch audit logs: ${error.message}`, error);
      return (data || []) as AuditLog[];
    }

    const fromMs = options.from ? new Date(options.from).getTime() : -Infinity;
    return getStore()
      .auditLogs.map((log, index) => ({ log, index }))
      .filter(({ log }) => log.action.startsWith(safePrefix) && new Date(log.created_at).getTime() >= fromMs)
      // Newest first; entries written in the same millisecond keep the store's newest-first order.
      .sort((a, b) => new Date(b.log.created_at).getTime() - new Date(a.log.created_at).getTime() || a.index - b.index)
      .slice(0, limit)
      .map(({ log }) => log);
  }

  async list(tenantId?: string, limit = 100, offset = 0): Promise<AuditLog[]> {
    const supabase = getSupabaseServiceClient();
    if (supabase) {
      let query = supabase
        .from('audit_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      if (tenantId) {
        query = query.eq('tenant_id', tenantId);
      }

      const { data, error } = await query;
      if (error) throw new DatabaseError(`Failed to fetch audit logs: ${error.message}`, error);
      return (data || []) as AuditLog[];
    }

    const store = getStore();
    let logs = store.auditLogs;
    if (tenantId) {
      logs = logs.filter((l) => l.tenant_id === tenantId);
    }
    return logs.slice(offset, offset + limit);
  }

  async create(entry: Omit<AuditLog, 'id' | 'created_at'> & { id?: string }): Promise<AuditLog> {
    const now = new Date().toISOString();
    const id = entry.id || randomUUID();
    const newRecord: AuditLog = {
      ...entry,
      id,
      created_at: now,
    };

    const supabase = getSupabaseServiceClient();
    if (supabase) {
      const { data, error } = await supabase
        .from('audit_logs')
        .insert(newRecord)
        .select('*')
        .single();

      if (error) throw new DatabaseError(`Failed to record audit log: ${error.message}`, error);
      return data as AuditLog;
    }

    const store = getStore();
    store.auditLogs.unshift(newRecord);
    return newRecord;
  }
}

export const auditLogRepository = new AuditLogRepository();
