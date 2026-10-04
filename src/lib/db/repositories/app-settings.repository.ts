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

/** Who must enter an emailed one-time code after their password when signing in. */
export type StaffLoginCodeMode = 'off' | 'csm' | 'all_staff';
export const STAFF_LOGIN_CODE_MODES: StaffLoginCodeMode[] = ['off', 'csm', 'all_staff'];

export interface SecuritySettings {
  staff_login_code: StaffLoginCodeMode;
}

const DEFAULTS: { notifications: NotificationSettings; security: SecuritySettings } = {
  notifications: { onboarding_form_recipients: [], notify_assigned_csm: true },
  // Off by default so staff whose @motionz.ai mailbox cannot receive email are not locked out.
  security: { staff_login_code: 'off' },
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
