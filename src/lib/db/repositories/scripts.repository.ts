import { randomUUID } from 'crypto';
import { getSupabaseServiceClient } from '../supabase-client';
import { getStore } from '../mock-db';
import { ScriptTemplate, ClientScriptPreference, VideoPreference, ScriptCategory, SelectedScripts } from '../schema';
import { normalizeScriptCategory } from '../../scripts/ad-script-library';
import { DatabaseError } from '../../errors';

/** Editable fields of a master script template. */
export interface ScriptTemplateUpdate {
  title?: string;
  script_content?: string;
  category?: ScriptCategory;
}

/** Fields required to add a script to the library. */
export interface ScriptTemplateCreate {
  title: string;
  script_content: string;
  category: ScriptCategory;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Rows read before the category column exists (or with an unknown value) fall back to Bonus. */
function withCategory(row: ScriptTemplate): ScriptTemplate {
  return { ...row, category: normalizeScriptCategory(row.category) };
}

export class ScriptRepository {
  async listTemplates(): Promise<ScriptTemplate[]> {
    const supabase = getSupabaseServiceClient();
    if (supabase) {
      const { data, error } = await supabase
        .from('script_templates')
        .select('*')
        .order('sort_order', { ascending: true });

      if (error) throw new DatabaseError(`Failed to list script templates: ${error.message}`, error);
      return ((data || []) as ScriptTemplate[]).map(withCategory);
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
      return data ? withCategory(data as ScriptTemplate) : null;
    }

    const store = getStore();
    return store.scriptTemplates.find((t) => t.id === id) || null;
  }

  /**
   * Adds a script to the library, placed after the last script of its category.
   */
  async createTemplate(input: ScriptTemplateCreate): Promise<ScriptTemplate> {
    const existing = await this.listTemplates();
    const highest = existing.reduce((max, t) => Math.max(max, t.sort_order), 0);
    const inCategory = existing.filter((t) => t.category === input.category);
    // Next to its category when there is a free slot, otherwise at the very end.
    const afterCategory = inCategory.length > 0 ? Math.max(...inCategory.map((t) => t.sort_order)) + 1 : highest + 1;
    const sortOrder = existing.some((t) => t.sort_order === afterCategory) ? highest + 1 : afterCategory;

    const now = new Date().toISOString();
    const record: ScriptTemplate = {
      id: randomUUID(),
      title: input.title,
      script_content: input.script_content,
      category: input.category,
      sort_order: sortOrder,
      created_at: now,
      updated_at: now,
    };

    const supabase = getSupabaseServiceClient();
    if (supabase) {
      const { data, error } = await supabase.from('script_templates').insert(record).select('*').single();
      if (error) throw new DatabaseError(`Failed to create script template: ${error.message}`, error);
      return withCategory(data as ScriptTemplate);
    }

    getStore().scriptTemplates.push(record);
    return record;
  }

  /**
   * Updates a master script template's title, content and/or category. Returns null when it does not exist.
   */
  async updateTemplate(id: string, updates: ScriptTemplateUpdate): Promise<ScriptTemplate | null> {
    const patch: ScriptTemplateUpdate & { updated_at: string } = { updated_at: new Date().toISOString() };
    if (updates.title !== undefined) patch.title = updates.title;
    if (updates.script_content !== undefined) patch.script_content = updates.script_content;
    if (updates.category !== undefined) patch.category = updates.category;

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
      return data ? withCategory(data as ScriptTemplate) : null;
    }

    const store = getStore();
    const existing = store.scriptTemplates.find((t) => t.id === id);
    if (!existing) return null;
    Object.assign(existing, patch);
    return existing;
  }

  /**
   * Removes a script from the library. Returns the removed row, or null when it does not exist.
   * Client picks that point at it are ignored on read (see sanitizeSelectedScripts).
   */
  async deleteTemplate(id: string): Promise<ScriptTemplate | null> {
    const supabase = getSupabaseServiceClient();
    if (supabase) {
      if (!UUID_PATTERN.test(id)) return null;
      const { data, error } = await supabase
        .from('script_templates')
        .delete()
        .eq('id', id)
        .select('*')
        .maybeSingle();

      if (error) throw new DatabaseError(`Failed to delete script template: ${error.message}`, error);
      return data ? withCategory(data as ScriptTemplate) : null;
    }

    const store = getStore();
    const index = store.scriptTemplates.findIndex((t) => t.id === id);
    if (index === -1) return null;
    const [removed] = store.scriptTemplates.splice(index, 1);
    return removed;
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

  /**
   * Creates or updates the tenant's single preference row. Only the fields present in `changes`
   * are written, so saving the production choice never wipes the script picks (and vice versa).
   */
  private async upsertPreference(
    tenantId: string,
    changes: Partial<Pick<ClientScriptPreference, 'video_preference' | 'custom_name' | 'custom_company' | 'selected_scripts'>>
  ): Promise<ClientScriptPreference> {
    const now = new Date().toISOString();
    const defined = Object.fromEntries(Object.entries(changes).filter(([, v]) => v !== undefined));

    const supabase = getSupabaseServiceClient();
    if (supabase) {
      // No id is sent: the database generates the UUID on insert and keeps it on update.
      const { data, error } = await supabase
        .from('client_script_preferences')
        .upsert({ tenant_id: tenantId, ...defined, updated_at: now }, { onConflict: 'tenant_id' })
        .select('*')
        .single();

      if (error) throw new DatabaseError(`Failed to save script preference: ${error.message}`, error);
      return data as ClientScriptPreference;
    }

    const store = getStore();
    const existing = store.clientScriptPreferences.find((p) => p.tenant_id === tenantId);
    if (existing) {
      Object.assign(existing, defined, { updated_at: now });
      return existing;
    }

    const record: ClientScriptPreference = {
      id: `pref-${randomUUID()}`,
      tenant_id: tenantId,
      video_preference: 'undecided',
      selected_scripts: {},
      ...defined,
      updated_at: now,
    };
    store.clientScriptPreferences.push(record);
    return record;
  }

  async setPreference(
    tenantId: string,
    preference: VideoPreference,
    customName?: string,
    customCompany?: string
  ): Promise<ClientScriptPreference> {
    return this.upsertPreference(tenantId, {
      video_preference: preference,
      custom_name: customName,
      custom_company: customCompany,
    });
  }

  /** Replaces the tenant's self-filmed script picks (one script id per category). */
  async setSelectedScripts(tenantId: string, selected: SelectedScripts): Promise<ClientScriptPreference> {
    return this.upsertPreference(tenantId, { selected_scripts: selected });
  }
}

export const scriptRepository = new ScriptRepository();
