import { randomUUID } from 'crypto';
import { getSupabaseServiceClient } from '../supabase-client';
import { getStore } from '../mock-db';
import { SecurityEvent, SecuritySeverity } from '../schema';
import { DatabaseError } from '../../errors';

export class SecurityEventRepository {
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
