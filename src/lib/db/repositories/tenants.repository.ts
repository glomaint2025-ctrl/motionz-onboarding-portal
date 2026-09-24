import { randomUUID } from 'crypto';
import { getSupabaseServiceClient } from '../supabase-client';
import { getStore } from '../mock-db';
import { Tenant } from '../schema';
import { DatabaseError, NotFoundError } from '../../errors';

export class TenantRepository {
  async findById(tenantId: string): Promise<Tenant | null> {
    const supabase = getSupabaseServiceClient();
    if (supabase) {
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(tenantId);
      let query = supabase.from('tenants').select('*').is('deleted_at', null);

      if (isUuid) {
        query = query.eq('id', tenantId);
      } else if (tenantId === 'demo') {
        query = query.eq('slug', 'abc-roofing');
      } else {
        query = query.eq('slug', tenantId);
      }

      const { data, error } = await query.maybeSingle();

      if (error) {
        throw new DatabaseError(`Failed to fetch tenant: ${error.message}`, error);
      }
      return data as Tenant | null;
    }

    const store = getStore();
    const tenant = store.tenants.find(
      (t) => (t.id === tenantId || t.slug === tenantId || (tenantId === 'demo' && t.slug === 'abc-roofing')) && !t.deleted_at
    );
    return tenant || null;
  }

  async list(options?: { status?: string; limit?: number; offset?: number }): Promise<Tenant[]> {
    const limit = options?.limit || 50;
    const offset = options?.offset || 0;

    const supabase = getSupabaseServiceClient();
    if (supabase) {
      let query = supabase
        .from('tenants')
        .select('*')
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      if (options?.status) {
        query = query.eq('status', options.status);
      }

      const { data, error } = await query;
      if (error) {
        throw new DatabaseError(`Failed to list tenants: ${error.message}`, error);
      }
      return (data || []) as Tenant[];
    }

    const store = getStore();
    let results = store.tenants.filter((t) => !t.deleted_at);
    if (options?.status) {
      results = results.filter((t) => t.status === options.status);
    }
    return results.slice(offset, offset + limit);
  }

  async create(tenant: Omit<Tenant, 'id' | 'created_at' | 'updated_at'> & { id?: string }): Promise<Tenant> {
    const now = new Date().toISOString();
    const id = tenant.id || randomUUID();

    const newRecord: Tenant = {
      ...tenant,
      id,
      status: tenant.status || 'active',
      created_at: now,
      updated_at: now,
    };

    const supabase = getSupabaseServiceClient();
    if (supabase) {
      const { data, error } = await supabase
        .from('tenants')
        .insert(newRecord)
        .select('*')
        .single();

      if (error) {
        throw new DatabaseError(`Failed to create tenant: ${error.message}`, error);
      }
      return data as Tenant;
    }

    const store = getStore();
    store.tenants.push(newRecord);
    return newRecord;
  }

  async update(tenantId: string, updates: Partial<Tenant>): Promise<Tenant> {
    const now = new Date().toISOString();
    const cleanUpdates = { ...updates, updated_at: now };

    const supabase = getSupabaseServiceClient();
    if (supabase) {
      const { data, error } = await supabase
        .from('tenants')
        .update(cleanUpdates)
        .or(`id.eq.${tenantId},slug.eq.${tenantId}`)
        .select('*')
        .single();

      if (error) {
        throw new DatabaseError(`Failed to update tenant: ${error.message}`, error);
      }
      if (!data) throw new NotFoundError('Tenant', tenantId);
      return data as Tenant;
    }

    const store = getStore();
    const tenant = store.tenants.find((t) => t.id === tenantId || t.slug === tenantId);
    if (!tenant) throw new NotFoundError('Tenant', tenantId);

    Object.assign(tenant, cleanUpdates);
    return tenant;
  }

  async softDelete(tenantId: string): Promise<void> {
    const now = new Date().toISOString();

    const supabase = getSupabaseServiceClient();
    if (supabase) {
      const { error } = await supabase
        .from('tenants')
        .update({ deleted_at: now, status: 'cancelled' })
        .or(`id.eq.${tenantId},slug.eq.${tenantId}`);

      if (error) {
        throw new DatabaseError(`Failed to archive tenant: ${error.message}`, error);
      }
      return;
    }

    const store = getStore();
    const tenant = store.tenants.find((t) => t.id === tenantId || t.slug === tenantId);
    if (tenant) {
      tenant.deleted_at = now;
      tenant.status = 'cancelled';
    }
  }

  async hardDelete(tenantId: string): Promise<void> {
    const supabase = getSupabaseServiceClient();
    if (supabase) {
      const { error } = await supabase
        .from('tenants')
        .delete()
        .eq('id', tenantId);

      if (error) {
        throw new DatabaseError(`Failed to delete tenant: ${error.message}`, error);
      }
      return;
    }

    const store = getStore();
    const idx = store.tenants.findIndex((t) => t.id === tenantId);
    if (idx !== -1) {
      store.tenants.splice(idx, 1);
    }
  }
}

export const tenantRepository = new TenantRepository();
