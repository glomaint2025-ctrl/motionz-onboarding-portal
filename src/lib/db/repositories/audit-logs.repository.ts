import { randomUUID } from 'crypto';
import { getSupabaseServiceClient } from '../supabase-client';
import { getStore } from '../mock-db';
import { AuditLog } from '../schema';
import { DatabaseError } from '../../errors';

export class AuditLogRepository {
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
