import { getSupabaseServiceClient } from '../supabase-client';
import { getStore } from '../mock-db';
import { ScriptTemplate, ClientScriptPreference, VideoPreference } from '../schema';
import { DatabaseError } from '../../errors';

/** Editable fields of a master script template. */
export interface ScriptTemplateUpdate {
  title?: string;
  script_content?: string;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

  async findTemplateById(id: string): Promise<ScriptTemplate | null> {
    const supabase = getSupabaseServiceClient();
    if (supabase) {
      if (!UUID_PATTERN.test(id)) return null;
      const { data, error } = await supabase
        .from('script_templates')
        .select('*')
        .eq('id', id)
        .maybeSingle();

      if (error) throw new DatabaseError(`Failed to fetch script template: ${error.message}`, error);
      return (data as ScriptTemplate) || null;
    }

    const store = getStore();
    return store.scriptTemplates.find((t) => t.id === id) || null;
  }

  /**
   * Updates a master script template's title and/or content. Returns null when it does not exist.
   */
  async updateTemplate(id: string, updates: ScriptTemplateUpdate): Promise<ScriptTemplate | null> {
    const patch: ScriptTemplateUpdate & { updated_at: string } = { updated_at: new Date().toISOString() };
    if (updates.title !== undefined) patch.title = updates.title;
    if (updates.script_content !== undefined) patch.script_content = updates.script_content;

    const supabase = getSupabaseServiceClient();
    if (supabase) {
      if (!UUID_PATTERN.test(id)) return null;
      const { data, error } = await supabase
        .from('script_templates')
        .update(patch)
        .eq('id', id)
        .select('*')
        .maybeSingle();

      if (error) throw new DatabaseError(`Failed to update script template: ${error.message}`, error);
      return (data as ScriptTemplate) || null;
    }

    const store = getStore();
    const existing = store.scriptTemplates.find((t) => t.id === id);
    if (!existing) return null;
    Object.assign(existing, patch);
    return existing;
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
