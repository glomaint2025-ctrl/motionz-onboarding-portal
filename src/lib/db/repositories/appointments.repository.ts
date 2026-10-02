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
   */
  async upsertByGhlAppointmentId(
    tenantId: string,
    ghlAppointmentId: string,
    fields: Omit<Appointment, 'id' | 'tenant_id' | 'ghl_appointment_id' | 'created_at'>
  ): Promise<Appointment> {
    const supabase = getSupabaseServiceClient();
    if (supabase) {
      const { data: existing, error: findError } = await supabase
        .from('appointments')
        .select('id')
        .eq('tenant_id', tenantId)
        .eq('ghl_appointment_id', ghlAppointmentId)
        .maybeSingle();
      if (findError) throw new DatabaseError(`Failed to look up appointment: ${findError.message}`, findError);

      if (existing) {
        const { data, error } = await supabase
          .from('appointments')
          .update(fields)
          .eq('id', existing.id)
          .select('*')
          .single();
        if (error) throw new DatabaseError(`Failed to update appointment: ${error.message}`, error);
        return data as Appointment;
      }
      return this.create({ tenant_id: tenantId, ghl_appointment_id: ghlAppointmentId, ...fields });
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
