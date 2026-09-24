import { randomUUID } from 'crypto';
import { getSupabaseServiceClient } from '../supabase-client';
import { getStore } from '../mock-db';
import { FeatureToggle } from '../schema';
import { DatabaseError } from '../../errors';

export class FeatureToggleRepository {
  async getTogglesForTenant(tenantId: string): Promise<Record<string, boolean>> {
    const supabase = getSupabaseServiceClient();
    if (supabase) {
      const { data, error } = await supabase
        .from('feature_toggles')
        .select('feature_key, is_enabled')
        .eq('tenant_id', tenantId);

      if (error) throw new DatabaseError(`Failed to fetch feature toggles: ${error.message}`, error);
      return (data || []).reduce<Record<string, boolean>>((acc, curr) => {
        acc[curr.feature_key] = curr.is_enabled;
        return acc;
      }, {});
    }

    const store = getStore();
    return store.featureToggles
      .filter((ft) => ft.tenant_id === tenantId)
      .reduce<Record<string, boolean>>((acc, curr) => {
        acc[curr.feature_key] = curr.is_enabled;
        return acc;
      }, {});
  }

  async setToggle(
    tenantId: string,
    featureKey: string,
    isEnabled: boolean,
    updatedBy?: string
  ): Promise<void> {
    const now = new Date().toISOString();
    const id = randomUUID();
    const record: FeatureToggle = {
      id,
      tenant_id: tenantId,
      feature_key: featureKey,
      is_enabled: isEnabled,
      updated_by: updatedBy,
      updated_at: now,
    };

    const supabase = getSupabaseServiceClient();
    if (supabase) {
      const { error } = await supabase
        .from('feature_toggles')
        .upsert(record, { onConflict: 'tenant_id,feature_key' });

      if (error) throw new DatabaseError(`Failed to set feature toggle: ${error.message}`, error);
      return;
    }

    const store = getStore();
    const existing = store.featureToggles.find(
      (ft) => ft.tenant_id === tenantId && ft.feature_key === featureKey
    );
    if (existing) {
      existing.is_enabled = isEnabled;
      existing.updated_at = now;
      existing.updated_by = updatedBy;
    } else {
      store.featureToggles.push(record);
    }
  }

  async initializeDefaults(tenantId: string, defaults: Record<string, boolean>): Promise<void> {
    const now = new Date().toISOString();
    const records: FeatureToggle[] = Object.entries(defaults).map(([feature_key, is_enabled]) => ({
      id: randomUUID(),
      tenant_id: tenantId,
      feature_key,
      is_enabled,
      updated_at: now,
    }));

    const supabase = getSupabaseServiceClient();
    if (supabase) {
      const { error } = await supabase
        .from('feature_toggles')
        .upsert(records, { onConflict: 'tenant_id,feature_key' });

      if (error) throw new DatabaseError(`Failed to initialize feature toggles: ${error.message}`, error);
      return;
    }

    const store = getStore();
    records.forEach((rec) => {
      const existing = store.featureToggles.find(
        (ft) => ft.tenant_id === tenantId && ft.feature_key === rec.feature_key
      );
      if (existing) {
        existing.is_enabled = rec.is_enabled;
        existing.updated_at = now;
      } else {
        store.featureToggles.push(rec);
      }
    });
  }
}

export const featureToggleRepository = new FeatureToggleRepository();
