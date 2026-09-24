import { randomUUID } from 'crypto';
import { getSupabaseServiceClient } from '../supabase-client';
import { getStore } from '../mock-db';
import { RoofMeasurement } from '../schema';
import { DatabaseError } from '../../errors';

export class RoofMeasurementRepository {
  async listByTenant(tenantId: string, limit = 20): Promise<RoofMeasurement[]> {
    const supabase = getSupabaseServiceClient();
    if (supabase) {
      const { data, error } = await supabase
        .from('roof_measurements')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) throw new DatabaseError(`Failed to fetch roof measurements: ${error.message}`, error);
      return (data || []) as RoofMeasurement[];
    }

    const store = getStore();
    return store.roofMeasurements.filter((r) => r.tenant_id === tenantId).slice(0, limit);
  }

  async create(record: Omit<RoofMeasurement, 'id' | 'created_at'> & { id?: string }): Promise<RoofMeasurement> {
    const now = new Date().toISOString();
    const id = record.id || randomUUID();
    const newRecord: RoofMeasurement = {
      ...record,
      id,
      created_at: now,
    };

    const supabase = getSupabaseServiceClient();
    if (supabase) {
      const { data, error } = await supabase
        .from('roof_measurements')
        .insert(newRecord)
        .select('*')
        .single();

      if (error) throw new DatabaseError(`Failed to save roof measurement: ${error.message}`, error);
      return data as RoofMeasurement;
    }

    const store = getStore();
    store.roofMeasurements.unshift(newRecord);
    return newRecord;
  }
}

export const roofMeasurementRepository = new RoofMeasurementRepository();
