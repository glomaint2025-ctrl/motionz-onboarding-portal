import { randomUUID } from 'crypto';
import { getSupabaseServiceClient } from '../supabase-client';
import { getStore } from '../mock-db';
import { Appointment } from '../schema';
import { DatabaseError } from '../../errors';

export class AppointmentRepository {
  async listByTenant(tenantId: string, limit = 50): Promise<Appointment[]> {
    const supabase = getSupabaseServiceClient();
    if (supabase) {
      const { data, error } = await supabase
        .from('appointments')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('appointment_time', { ascending: false })
        .limit(limit);

      if (error) throw new DatabaseError(`Failed to fetch appointments: ${error.message}`, error);
      return (data || []) as Appointment[];
    }

    const store = getStore();
    return store.appointments.filter((a) => a.tenant_id === tenantId).slice(0, limit);
  }

  async create(appointment: Omit<Appointment, 'id' | 'created_at'> & { id?: string }): Promise<Appointment> {
    const now = new Date().toISOString();
    const id = appointment.id || randomUUID();
    const newRecord: Appointment = {
      ...appointment,
      id,
      created_at: now,
    };

    const supabase = getSupabaseServiceClient();
    if (supabase) {
      const { data, error } = await supabase
        .from('appointments')
        .insert(newRecord)
        .select('*')
        .single();

      if (error) throw new DatabaseError(`Failed to create appointment: ${error.message}`, error);
      return data as Appointment;
    }

    const store = getStore();
    store.appointments.unshift(newRecord);
    return newRecord;
  }

  /**
   * Inserts or updates an appointment keyed by its GoHighLevel appointment id within a tenant.
   * Works with or without the unique index on (tenant_id, ghl_appointment_id); only the index
   * makes it safe against two events arriving together.
   */
  async upsertByGhlAppointmentId(
    tenantId: string,
    ghlAppointmentId: string,
    fields: Omit<Appointment, 'id' | 'tenant_id' | 'ghl_appointment_id' | 'created_at'>
  ): Promise<Appointment> {
    const supabase = getSupabaseServiceClient();
    if (supabase) {
      // Never assumes a single row (see leads.repository.ts): the newest row is the one kept current.
      const findId = async (): Promise<string | null> => {
        const { data, error } = await supabase
          .from('appointments')
          .select('id')
          .eq('tenant_id', tenantId)
          .eq('ghl_appointment_id', ghlAppointmentId)
          .order('created_at', { ascending: false })
          .order('id', { ascending: true })
          .limit(1);
        if (error) throw new DatabaseError(`Failed to look up appointment: ${error.message}`, error);
        return data?.[0]?.id ?? null;
      };
      const updateById = async (id: string): Promise<Appointment> => {
        const { data, error } = await supabase
          .from('appointments')
          .update(fields)
          .eq('id', id)
          .select('*')
          .single();
        if (error) throw new DatabaseError(`Failed to update appointment: ${error.message}`, error);
        return data as Appointment;
      };

      const existingId = await findId();
      if (existingId) return updateById(existingId);

      const { data, error } = await supabase
        .from('appointments')
        .insert({
          tenant_id: tenantId,
          ghl_appointment_id: ghlAppointmentId,
          ...fields,
          id: randomUUID(),
          created_at: new Date().toISOString(),
        })
        .select('*')
        .single();
      if (!error) return data as Appointment;

      // With the unique index (migration 20261007000003), the request that loses a race gets a
      // unique violation (23505) and updates the winner's row instead of failing.
      if ((error as any).code === '23505') {
        const winnerId = await findId();
        if (winnerId) return updateById(winnerId);
      }
      throw new DatabaseError(`Failed to create appointment: ${error.message}`, error);
    }

    const store = getStore();
    const existing = store.appointments.find(
      (a) => a.tenant_id === tenantId && a.ghl_appointment_id === ghlAppointmentId
    );
    if (existing) {
      Object.assign(existing, fields);
      return existing;
    }
    return this.create({ tenant_id: tenantId, ghl_appointment_id: ghlAppointmentId, ...fields });
  }
}

export const appointmentRepository = new AppointmentRepository();
