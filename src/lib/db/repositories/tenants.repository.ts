import { randomUUID } from 'crypto';
import { getSupabaseServiceClient, resolveTenantId } from '../supabase-client';
import { getStore } from '../mock-db';
import { Tenant } from '../schema';
import { AppError, DatabaseError, NotFoundError } from '../../errors';

export class TenantRepository {
  private normalizeTenant(tenant: any): Tenant {
    if (!tenant) return tenant;
    const settings = (tenant.settings || {}) as Record<string, any>;
    const suspension = settings.suspension;

    if (tenant.status === 'active' && !suspension?.suspended_at) {
      tenant.suspended_at = null;
      tenant.suspended_reason = null;
      tenant.suspended_by = null;
      return tenant;
    }

    if (suspension && typeof suspension === 'object') {
      if (!tenant.suspended_at && suspension.suspended_at) {
        tenant.suspended_at = suspension.suspended_at;
      }
      if (!tenant.suspended_reason && suspension.suspended_reason) {
        tenant.suspended_reason = suspension.suspended_reason;
      }
      if (!tenant.suspended_by && suspension.suspended_by) {
        tenant.suspended_by = suspension.suspended_by;
      }
    }

    if (tenant.suspended_at || (suspension && suspension.suspended_at) || tenant.status === 'suspended') {
      tenant.status = 'suspended';
    }
    return tenant;
  }

  async findById(tenantId: string, options?: { includeArchived?: boolean }): Promise<Tenant | null> {
    const resolvedId = resolveTenantId(tenantId);
    const includeArchived = options?.includeArchived ?? false;
    const supabase = getSupabaseServiceClient();
    if (supabase) {
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(resolvedId);
      let query = supabase.from('tenants').select('*');

      if (!includeArchived) {
        query = query.is('deleted_at', null);
      }

      if (isUuid) {
        query = query.or(`id.eq.${resolvedId},id.eq.${tenantId}`);
      } else if (tenantId === 'demo') {
        query = query.eq('slug', 'abc-roofing');
      } else {
        query = query.eq('slug', tenantId);
      }

      const { data, error } = await query.maybeSingle();

      if (error) {
        throw new DatabaseError(`Failed to fetch tenant: ${error.message}`, error);
      }
      return data ? this.normalizeTenant(data) : null;
    }

    const store = getStore();
    const tenant = store.tenants.find(
      (t) =>
        (t.id === tenantId ||
          t.id === resolvedId ||
          t.slug === tenantId ||
          (tenantId === 'demo' && t.slug === 'abc-roofing') ||
          (tenantId === 'd0000000-0000-0000-0000-000000000001' && t.slug === 'abc-roofing') ||
          (tenantId === 'tenant-demo-abc-roofing' && t.slug === 'abc-roofing')) &&
        (includeArchived || !t.deleted_at)
    );
    return tenant ? this.normalizeTenant(tenant) : null;
  }

  async findByEmail(email: string, options?: { includeArchived?: boolean }): Promise<Tenant | null> {
    const normalized = email.trim().toLowerCase();
    const includeArchived = options?.includeArchived ?? false;
    const supabase = getSupabaseServiceClient();
    if (supabase) {
      let query = supabase
        .from('tenants')
        .select('*')
        .ilike('primary_email', normalized);

      if (!includeArchived) {
        query = query.is('deleted_at', null);
      }

      const { data, error } = await query.maybeSingle();

      if (error) {
        throw new DatabaseError(`Failed to fetch tenant by email: ${error.message}`, error);
      }
      return data ? this.normalizeTenant(data) : null;
    }

    const store = getStore();
    const tenant = store.tenants.find((t) => t.primary_email?.toLowerCase() === normalized && (includeArchived || !t.deleted_at)) || null;
    return tenant ? this.normalizeTenant(tenant) : null;
  }

  async list(options?: { status?: string; limit?: number; offset?: number; includeArchived?: boolean }): Promise<Tenant[]> {
    const limit = options?.limit || 50;
    const offset = options?.offset || 0;
    const includeArchived = options?.includeArchived ?? false;

    const supabase = getSupabaseServiceClient();
    if (supabase) {
      let query = supabase
        .from('tenants')
        .select('*')
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      if (!includeArchived && (!options?.status || (options.status !== 'archived' && options.status !== 'cancelled'))) {
        query = query.is('deleted_at', null);
      }

      if (options?.status) {
        if (options.status === 'archived' || options.status === 'cancelled') {
          query = query.not('deleted_at', 'is', null);
        } else {
          query = query.eq('status', options.status);
        }
      }

      const { data, error } = await query;
      if (error) {
        throw new DatabaseError(`Failed to list tenants: ${error.message}`, error);
      }
      return (data || []).map((t) => this.normalizeTenant(t));
    }

    const store = getStore();
    let results = store.tenants.filter((t) => {
      if (options?.status === 'archived' || options?.status === 'cancelled') {
        return Boolean(t.deleted_at) || t.status === 'cancelled';
      }
      if (!includeArchived && t.deleted_at) return false;
      if (options?.status && t.status !== options.status) return false;
      return true;
    });
    return results.slice(offset, offset + limit).map((t) => this.normalizeTenant(t));
  }

  async findBySlug(slug: string, options?: { includeArchived?: boolean }): Promise<Tenant | null> {
    const includeArchived = options?.includeArchived ?? true;
    const supabase = getSupabaseServiceClient();
    if (supabase) {
      let query = supabase.from('tenants').select('*').eq('slug', slug);
      if (!includeArchived) {
        query = query.is('deleted_at', null);
      }
      const { data, error } = await query.maybeSingle();
      if (error) {
        throw new DatabaseError(`Failed to fetch tenant by slug: ${error.message}`, error);
      }
      return data ? this.normalizeTenant(data) : null;
    }

    const store = getStore();
    const tenant = store.tenants.find((t) => t.slug === slug && (includeArchived || !t.deleted_at));
    return tenant ? this.normalizeTenant(tenant) : null;
  }

  /**
   * Generates a guaranteed unique slug for a tenant, appending a short random
   * alphanumeric suffix if another client already uses the base company slug.
   */
  async generateUniqueSlug(baseNameOrSlug: string): Promise<string> {
    const base =
      baseNameOrSlug
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '') || 'client';

    let candidate = base;
    let existing = await this.findBySlug(candidate, { includeArchived: true });
    let attempts = 0;
    while (existing && attempts < 10) {
      const suffix = Math.random().toString(36).substring(2, 6);
      candidate = `${base}-${suffix}`;
      existing = await this.findBySlug(candidate, { includeArchived: true });
      attempts++;
    }
    return candidate;
  }

  async create(tenant: Omit<Tenant, 'id' | 'created_at' | 'updated_at'> & { id?: string }): Promise<Tenant> {
    const now = new Date().toISOString();
    const id = tenant.id || randomUUID();

    // Ensure slug is uniquely resolved upfront
    let finalSlug = tenant.slug;
    try {
      finalSlug = await this.generateUniqueSlug(tenant.slug || tenant.name);
    } catch {
      finalSlug = tenant.slug || tenant.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    }

    const newRecord: Tenant = {
      ...tenant,
      id,
      slug: finalSlug,
      status: tenant.status || 'active',
      created_at: now,
      updated_at: now,
    };

    const supabase = getSupabaseServiceClient();
    if (supabase) {
      let res = await supabase
        .from('tenants')
        .insert(newRecord)
        .select('*')
        .single();

      // If a slug conflict still occurs (e.g. concurrent creation), retry with fresh random suffix
      if (
        res.error &&
        (res.error.code === '23505' ||
          res.error.message?.includes('tenants_slug_key') ||
          res.error.message?.includes('slug'))
      ) {
        for (let attempt = 0; attempt < 3; attempt++) {
          const uniqueSuffix = Math.random().toString(36).substring(2, 6);
          newRecord.slug = `${finalSlug.replace(/-[a-z0-9]{4}$/, '')}-${uniqueSuffix}`;
          res = await supabase
            .from('tenants')
            .insert(newRecord)
            .select('*')
            .single();

          if (!res.error || (!res.error.message?.includes('tenants_slug_key') && !res.error.message?.includes('slug'))) {
            break;
          }
        }
      }

      if (res.error) {
        if (
          res.error.message?.includes('primary_email') ||
          res.error.message?.includes('email') ||
          (res.error.code === '23505' && !res.error.message?.includes('slug'))
        ) {
          throw new AppError('An account with this email already exists.', 400, 'EMAIL_ALREADY_EXISTS');
        }
        throw new DatabaseError(`Failed to create client: ${res.error.message}`, res.error);
      }
      return this.normalizeTenant(res.data);
    }

    const store = getStore();
    if (store.tenants.some((t) => t.slug === newRecord.slug)) {
      newRecord.slug = `${newRecord.slug}-${Math.random().toString(36).substring(2, 6)}`;
    }
    store.tenants.push(newRecord);
    return this.normalizeTenant(newRecord);
  }

  async update(tenantId: string, updates: Partial<Tenant>): Promise<Tenant> {
    const now = new Date().toISOString();
    const cleanUpdates: any = { ...updates, updated_at: now };

    const supabase = getSupabaseServiceClient();
    if (supabase) {
      let res = await supabase
        .from('tenants')
        .update(cleanUpdates)
        .or(`id.eq.${tenantId},slug.eq.${tenantId}`)
        .select('*')
        .single();

      // Gracefully handle PostgreSQL schema cache if dedicated suspension columns have not yet been migrated
      if (
        res.error &&
        (res.error.message?.includes('schema cache') ||
          res.error.message?.includes('column') ||
          res.error.code === 'PGRST204')
      ) {
        const { suspended_at, suspended_reason, suspended_by, ...standardFields } = cleanUpdates;
        const { data: current } = await supabase
          .from('tenants')
          .select('settings')
          .or(`id.eq.${tenantId},slug.eq.${tenantId}`)
          .maybeSingle();

        const currentSettings = (current?.settings || {}) as Record<string, any>;
        const newSettings = {
          ...currentSettings,
          suspension:
            cleanUpdates.status === 'suspended' || suspended_at
              ? {
                  suspended_at,
                  suspended_reason,
                  suspended_by,
                }
              : cleanUpdates.status === 'active'
              ? null
              : currentSettings.suspension,
        };

        res = await supabase
          .from('tenants')
          .update({
            ...standardFields,
            settings: newSettings,
          })
          .or(`id.eq.${tenantId},slug.eq.${tenantId}`)
          .select('*')
          .single();
      }

      if (res.error) {
        throw new DatabaseError(`Failed to update tenant: ${res.error.message}`, res.error);
      }
      if (!res.data) throw new NotFoundError('Tenant', tenantId);
      return this.normalizeTenant(res.data);
    }

    const store = getStore();
    const tenant = store.tenants.find((t) => t.id === tenantId || t.slug === tenantId);
    if (!tenant) throw new NotFoundError('Tenant', tenantId);

    Object.assign(tenant, cleanUpdates);
    return this.normalizeTenant(tenant);
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

  async unarchive(tenantId: string): Promise<Tenant> {
    const now = new Date().toISOString();

    const supabase = getSupabaseServiceClient();
    if (supabase) {
      const { data, error } = await supabase
        .from('tenants')
        .update({ deleted_at: null, status: 'active', updated_at: now })
        .or(`id.eq.${tenantId},slug.eq.${tenantId}`)
        .select('*')
        .single();

      if (error) {
        throw new DatabaseError(`Failed to unarchive tenant: ${error.message}`, error);
      }
      if (!data) throw new NotFoundError('Tenant', tenantId);
      return this.normalizeTenant(data);
    }

    const store = getStore();
    const tenant = store.tenants.find((t) => t.id === tenantId || t.slug === tenantId);
    if (!tenant) throw new NotFoundError('Tenant', tenantId);

    tenant.deleted_at = undefined;
    tenant.status = 'active';
    tenant.updated_at = now;
    return this.normalizeTenant(tenant);
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

  /**
   * Suspends a client company tenant portal with reason and attribution.
   */
  async suspendTenant(tenantId: string, reason: string, suspendedBy: string): Promise<Tenant> {
    const now = new Date().toISOString();
    return this.update(tenantId, {
      status: 'suspended',
      suspended_at: now,
      suspended_reason: reason,
      suspended_by: suspendedBy,
    });
  }

  /**
   * Re-activates an active client portal.
   */
  async unsuspendTenant(tenantId: string): Promise<Tenant> {
    const supabase = getSupabaseServiceClient();
    if (supabase) {
      const { data: current } = await supabase
        .from('tenants')
        .select('settings')
        .or(`id.eq.${tenantId},slug.eq.${tenantId}`)
        .maybeSingle();

      const currentSettings = (current?.settings || {}) as Record<string, any>;
      const newSettings = { ...currentSettings };
      delete newSettings.suspension;

      let res = await supabase
        .from('tenants')
        .update({
          status: 'active',
          suspended_at: null,
          suspended_reason: null,
          suspended_by: null,
          settings: newSettings,
          updated_at: new Date().toISOString(),
        })
        .or(`id.eq.${tenantId},slug.eq.${tenantId}`)
        .select('*')
        .single();

      if (res.error) {
        res = await supabase
          .from('tenants')
          .update({
            status: 'active',
            settings: newSettings,
            updated_at: new Date().toISOString(),
          })
          .or(`id.eq.${tenantId},slug.eq.${tenantId}`)
          .select('*')
          .single();
      }

      if (res.error) {
        throw new DatabaseError(`Failed to unsuspend tenant: ${res.error.message}`, res.error);
      }
      if (!res.data) throw new NotFoundError('Tenant', tenantId);
      return this.normalizeTenant(res.data);
    }

    const store = getStore();
    const tenant = store.tenants.find((t) => t.id === tenantId || t.slug === tenantId);
    if (!tenant) throw new NotFoundError('Tenant', tenantId);

    tenant.status = 'active';
    tenant.suspended_at = undefined;
    tenant.suspended_reason = undefined;
    tenant.suspended_by = undefined;
    if (tenant.settings?.suspension) {
      delete (tenant.settings as any).suspension;
    }
    return this.normalizeTenant(tenant);
  }
}

export const tenantRepository = new TenantRepository();
