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
}

export const appointmentRepository = new AppointmentRepository();
