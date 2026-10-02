import { getSupabaseServiceClient } from '../supabase-client';
import { getStore } from '../mock-db';
import { IntegrationConfig } from '../schema';
import { DatabaseError } from '../../errors';

export class IntegrationConfigRepository {
  async listByTenant(tenantId: string): Promise<IntegrationConfig[]> {
    const supabase = getSupabaseServiceClient();
    if (supabase) {
      const { data, error } = await supabase
        .from('integration_configs')
        .select('*')
        .eq('tenant_id', tenantId);

      if (error) throw new DatabaseError(`Failed to fetch integration configs: ${error.message}`, error);
      return (data || []) as IntegrationConfig[];
    }

    const store = getStore();
    return store.integrationConfigs.filter((ic) => ic.tenant_id === tenantId);
  }

  async save(
    tenantId: string,
    integrationType: 'ghl' | 'google_sheets' | 'roof_provider',
    configData: Record<string, any>,
    isActive = true
  ): Promise<IntegrationConfig> {
    const now = new Date().toISOString();
    const id = `int-${tenantId}-${integrationType}`;
    const record: IntegrationConfig = {
      id,
      tenant_id: tenantId,
      integration_type: integrationType,
      config_data: configData,
      is_active: isActive,
      updated_at: now,
    };

    const supabase = getSupabaseServiceClient();
    if (supabase) {
      // Let Postgres generate the UUID; the (tenant_id, integration_type) pair is the real key.
      const { id: _localId, ...row } = record;
      const { data, error } = await supabase
        .from('integration_configs')
        .upsert(row, { onConflict: 'tenant_id,integration_type' })
        .select('*')
        .single();

      if (error) throw new DatabaseError(`Failed to save integration config: ${error.message}`, error);
      return data as IntegrationConfig;
    }

    const store = getStore();
    const existing = store.integrationConfigs.find(
      (ic) => ic.tenant_id === tenantId && ic.integration_type === integrationType
    );
    if (existing) {
      existing.config_data = configData;
      existing.is_active = isActive;
      existing.updated_at = now;
      return existing;
    }

    store.integrationConfigs.push(record);
    return record;
  }
}

export const integrationConfigRepository = new IntegrationConfigRepository();
