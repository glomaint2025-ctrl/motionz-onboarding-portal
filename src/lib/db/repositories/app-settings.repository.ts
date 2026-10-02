import { getSupabaseServiceClient } from '../supabase-client';
import { getStore } from '../mock-db';
import { DatabaseError } from '../../errors';

/** Known platform settings and their defaults. */
export interface NotificationSettings {
  /** Who is emailed when a client submits the onboarding form (e.g. the media buyer). */
  onboarding_form_recipients: string[];
  /** Also email the CSM assigned to that client. */
  notify_assigned_csm: boolean;
}

const DEFAULTS: { notifications: NotificationSettings } = {
  notifications: { onboarding_form_recipients: [], notify_assigned_csm: true },
};

type SettingKey = keyof typeof DEFAULTS;

export class AppSettingsRepository {
  async get<K extends SettingKey>(key: K): Promise<(typeof DEFAULTS)[K]> {
    const supabase = getSupabaseServiceClient();
    let value: Record<string, any> | undefined;

    if (supabase) {
      const { data, error } = await supabase.from('app_settings').select('value').eq('key', key).maybeSingle();
      if (error) throw new DatabaseError(`Failed to read setting ${key}: ${error.message}`, error);
      value = data?.value;
    } else {
      value = getStore().appSettings.find((s) => s.key === key)?.value;
    }

    return { ...DEFAULTS[key], ...(value || {}) } as (typeof DEFAULTS)[K];
  }

  async set<K extends SettingKey>(key: K, value: (typeof DEFAULTS)[K], updatedBy: string): Promise<void> {
    const row = { key, value, updated_at: new Date().toISOString(), updated_by: updatedBy };
    const supabase = getSupabaseServiceClient();
    if (supabase) {
      const { error } = await supabase.from('app_settings').upsert(row, { onConflict: 'key' });
      if (error) throw new DatabaseError(`Failed to save setting ${key}: ${error.message}`, error);
      return;
    }

    const store = getStore();
    const existing = store.appSettings.find((s) => s.key === key);
    if (existing) Object.assign(existing, row);
    else store.appSettings.push(row);
  }
}

export const appSettingsRepository = new AppSettingsRepository();
