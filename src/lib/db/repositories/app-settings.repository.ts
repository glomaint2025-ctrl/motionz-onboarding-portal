import { getSupabaseServiceClient } from '../supabase-client';
import { getStore } from '../mock-db';
import { DatabaseError } from '../../errors';
import { PORTAL_LINKS } from '../../portal-links';

// ───────────────────────── csm_calendars (CSM booking calendars) ─────────────────────────
// Self-contained block: stored under the `csm_calendars` key through the generic get/set below.

/** GoHighLevel booking calendar per CSM, with a default for everyone else. */
export interface CsmCalendarSettings {
  default_calendar_id: string;
  /** CSM user id → that CSM's GHL booking calendar id. */
  by_user: Record<string, string>;
}

export const CSM_CALENDARS_KEY = 'csm_calendars';
/** The id in a GHL booking link: …/widget/booking/<id>. */
export const GHL_CALENDAR_ID_PATTERN = /^[A-Za-z0-9_-]{10,40}$/;

const CSM_CALENDAR_DEFAULTS: CsmCalendarSettings = {
  default_calendar_id: PORTAL_LINKS.csmBookingCalendarId,
  by_user: {},
};

/** Reads the calendar settings, dropping anything that is not a well-formed calendar id. */
export async function getCsmCalendarSettings(): Promise<CsmCalendarSettings> {
  const raw = (await (appSettingsRepository as any).get(CSM_CALENDARS_KEY)) as Partial<CsmCalendarSettings>;
  const byUser: Record<string, string> = {};
  for (const [userId, calendarId] of Object.entries(raw?.by_user || {})) {
    if (typeof calendarId === 'string' && GHL_CALENDAR_ID_PATTERN.test(calendarId)) byUser[userId] = calendarId;
  }
  const defaultId = raw?.default_calendar_id;
  return {
    default_calendar_id:
      typeof defaultId === 'string' && GHL_CALENDAR_ID_PATTERN.test(defaultId)
        ? defaultId
        : CSM_CALENDAR_DEFAULTS.default_calendar_id,
    by_user: byUser,
  };
}

export async function setCsmCalendarSettings(value: CsmCalendarSettings, updatedBy: string): Promise<void> {
  await (appSettingsRepository as any).set(CSM_CALENDARS_KEY, value, updatedBy);
}

/**
 * The booking calendar a client should see: their CSM's own calendar, else the default.
 * Never throws: if settings cannot be read the built-in default keeps the booking page working.
 */
export async function resolveBookingCalendarId(csmUserId?: string | null): Promise<string> {
  try {
    const settings = await getCsmCalendarSettings();
    return (csmUserId && settings.by_user[csmUserId]) || settings.default_calendar_id;
  } catch (err: any) {
    console.error(`[csm-calendars] Could not read calendar settings, using the built-in default: ${err?.message}`);
    return CSM_CALENDAR_DEFAULTS.default_calendar_id;
  }
}
// ───────────────────────── end csm_calendars ─────────────────────────

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
