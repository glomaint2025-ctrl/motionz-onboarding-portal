import { getSupabaseServiceClient } from '../supabase-client';
import { getStore } from '../mock-db';
import { ScriptTemplate, ClientScriptPreference, VideoPreference } from '../schema';
import { DatabaseError } from '../../errors';

export class ScriptRepository {
  async listTemplates(): Promise<ScriptTemplate[]> {
    const supabase = getSupabaseServiceClient();
    if (supabase) {
      const { data, error } = await supabase
        .from('script_templates')
        .select('*')
        .order('sort_order', { ascending: true });

      if (error) throw new DatabaseError(`Failed to list script templates: ${error.message}`, error);
      return (data || []) as ScriptTemplate[];
    }

    const store = getStore();
    return store.scriptTemplates.slice().sort((a, b) => a.sort_order - b.sort_order);
  }

  async getPreference(tenantId: string): Promise<ClientScriptPreference | null> {
    const supabase = getSupabaseServiceClient();
    if (supabase) {
      const { data, error } = await supabase
        .from('client_script_preferences')
        .select('*')
        .eq('tenant_id', tenantId)
        .maybeSingle();

      if (error) throw new DatabaseError(`Failed to get script preference: ${error.message}`, error);
      return data as ClientScriptPreference | null;
    }

    const store = getStore();
    return store.clientScriptPreferences.find((p) => p.tenant_id === tenantId) || null;
  }

  async setPreference(
    tenantId: string,
    preference: VideoPreference,
    customName?: string,
    customCompany?: string
  ): Promise<ClientScriptPreference> {
    const now = new Date().toISOString();
    const id = `pref-${Date.now()}`;
    const record: ClientScriptPreference = {
      id,
      tenant_id: tenantId,
      video_preference: preference,
      custom_name: customName,
      custom_company: customCompany,
      updated_at: now,
    };

    const supabase = getSupabaseServiceClient();
    if (supabase) {
      const { data, error } = await supabase
        .from('client_script_preferences')
        .upsert(record, { onConflict: 'tenant_id' })
        .select('*')
        .single();

      if (error) throw new DatabaseError(`Failed to save script preference: ${error.message}`, error);
      return data as ClientScriptPreference;
    }

    const store = getStore();
    let existing = store.clientScriptPreferences.find((p) => p.tenant_id === tenantId);
    if (existing) {
      existing.video_preference = preference;
      if (customName !== undefined) existing.custom_name = customName;
      if (customCompany !== undefined) existing.custom_company = customCompany;
      existing.updated_at = now;
      return existing;
    }

    store.clientScriptPreferences.push(record);
    return record;
  }
}

export const scriptRepository = new ScriptRepository();
