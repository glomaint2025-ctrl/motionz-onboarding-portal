import { randomUUID } from 'crypto';
import { getSupabaseServiceClient } from '../supabase-client';
import { getStore } from '../mock-db';
import { SecurityEvent, SecuritySeverity } from '../schema';
import { DatabaseError } from '../../errors';
import { sanitizeFilterTerm } from './audit-logs.repository';

export interface SecurityEventQuery {
  /** Inclusive ISO timestamps on created_at. */
  from?: string;
  to?: string;
  severities?: SecuritySeverity[];
  /** Free text: matched against the event type and the email fields in details. */
  q?: string;
  /** Extra event types to match (e.g. resolved from friendly labels). */
  eventTypes?: string[];
  limit?: number;
  offset?: number;
}

/** Keys inside details that hold an email address, across the events the app records. */
const DETAIL_EMAIL_KEYS = ['email', 'attemptedEmail', 'userEmail'];

export class SecurityEventRepository {
  /** Date-range / severity / search query, newest first, with the total match count for pagination. */
  async query(options: SecurityEventQuery = {}): Promise<{ rows: SecurityEvent[]; total: number }> {
    const limit = options.limit ?? 50;
    const offset = options.offset ?? 0;
    const term = options.q ? sanitizeFilterTerm(options.q) : '';
    const eventTypes = (options.eventTypes || []).filter((t) => /^[\w.]+$/.test(t));

    const supabase = getSupabaseServiceClient();
    if (supabase) {
      let query = supabase
        .from('security_events')
        .select('*', { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);
      if (options.from) query = query.gte('created_at', options.from);
      if (options.to) query = query.lte('created_at', options.to);
      if (options.severities?.length) query = query.in('severity', options.severities);
      if (term) {
        const like = `%${term}%`;
        const parts = [`event_type.ilike.${like}`, ...DETAIL_EMAIL_KEYS.map((k) => `details->>${k}.ilike.${like}`)];
        if (eventTypes.length) parts.push(`event_type.in.(${eventTypes.join(',')})`);
        query = query.or(parts.join(','));
      }
      const { data, error, count } = await query;
      if (error) throw new DatabaseError(`Failed to fetch security events: ${error.message}`, error);
      return { rows: (data || []) as SecurityEvent[], total: count ?? (data || []).length };
    }

    const fromMs = options.from ? new Date(options.from).getTime() : -Infinity;
    const toMs = options.to ? new Date(options.to).getTime() : Infinity;
    const needle = term.toLowerCase();
    const matches = getStore()
      .securityEvents.filter((e) => {
        const at = new Date(e.created_at).getTime();
        if (at < fromMs || at > toMs) return false;
        if (options.severities?.length && !options.severities.includes(e.severity)) return false;
        if (!needle) return true;
        return (
          e.event_type.toLowerCase().includes(needle) ||
          eventTypes.includes(e.event_type) ||
          DETAIL_EMAIL_KEYS.some((k) => String(e.details?.[k] ?? '').toLowerCase().includes(needle))
        );
      })
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    return { rows: matches.slice(offset, offset + limit), total: matches.length };
  }

  /** How many events were recorded after a moment (optionally only some severities), without fetching them. */
  async countSince(sinceIso: string, severities?: SecuritySeverity[]): Promise<number> {
    const supabase = getSupabaseServiceClient();
    if (supabase) {
      let query = supabase.from('security_events').select('id', { count: 'exact', head: true }).gt('created_at', sinceIso);
      if (severities?.length) query = query.in('severity', severities);
      const { count, error } = await query;
      if (error) throw new DatabaseError(`Failed to count security events: ${error.message}`, error);
      return count || 0;
    }

    const sinceMs = new Date(sinceIso).getTime();
    return getStore().securityEvents.filter(
      (e) => new Date(e.created_at).getTime() > sinceMs && (!severities?.length || severities.includes(e.severity))
    ).length;
  }

  async list(options?: { tenantId?: string; severity?: SecuritySeverity; isResolved?: boolean; limit?: number }): Promise<SecurityEvent[]> {
    const limit = options?.limit || 100;
    const supabase = getSupabaseServiceClient();
    if (supabase) {
      let query = supabase
        .from('security_events')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit);

      if (options?.tenantId) {
        query = query.eq('tenant_id', options.tenantId);
      }
      if (options?.severity) {
        query = query.eq('severity', options.severity);
      }
      if (options?.isResolved !== undefined) {
        query = query.eq('is_resolved', options.isResolved);
      }

      const { data, error } = await query;
      if (error) throw new DatabaseError(`Failed to fetch security events: ${error.message}`, error);
      return (data || []) as SecurityEvent[];
    }

    const store = getStore();
    let events = store.securityEvents;
    if (options?.tenantId) {
      events = events.filter((e) => e.tenant_id === options.tenantId);
    }
    if (options?.severity) {
      events = events.filter((e) => e.severity === options.severity);
    }
    if (options?.isResolved !== undefined) {
      events = events.filter((e) => e.is_resolved === options.isResolved);
    }
    return events.slice(0, limit);
  }

  async record(event: Omit<SecurityEvent, 'id' | 'created_at' | 'is_resolved'> & { id?: string; is_resolved?: boolean }): Promise<SecurityEvent> {
    const now = new Date().toISOString();
    const id = event.id || randomUUID();
    const newRecord: SecurityEvent = {
      is_resolved: false,
      ...event,
      id,
      created_at: now,
    };

    const supabase = getSupabaseServiceClient();
    if (supabase) {
      const { data, error } = await supabase
        .from('security_events')
        .insert(newRecord)
        .select('*')
        .single();

      if (error) throw new DatabaseError(`Failed to record security event: ${error.message}`, error);
      return data as SecurityEvent;
    }

    const store = getStore();
    store.securityEvents.unshift(newRecord);
    return newRecord;
  }

  async create(event: Omit<SecurityEvent, 'id' | 'created_at' | 'is_resolved'> & { id?: string; is_resolved?: boolean }): Promise<SecurityEvent> {
    return this.record(event);
  }
}

export const securityEventRepository = new SecurityEventRepository();
