import { getSupabaseServiceClient } from '../supabase-client';
import { getStore } from '../mock-db';
import { DatabaseError } from '../../errors';
import { PORTAL_LINKS } from '../../portal-links';
import { FORM_SETTING_DEFAULTS, sanitizeFormSettings, type FormSettings } from '../../ghl-forms';

export { parseGhlFormId, FORM_SETTING_DEFAULTS, FORM_SETTING_FIELDS, GHL_FORM_ID_PATTERN } from '../../ghl-forms';
export type { FormSettings, FormSettingKey } from '../../ghl-forms';

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

// ───────────────────────── staff_titles (CSM Manager or Tech) ─────────────────────────
// Self-contained block: stored under the `staff_titles` key through the generic get/set below.
// A title only changes the name people read. A Tech person has the role `admin`.

export const STAFF_TITLES_KEY = 'staff_titles';
/** Staff user id → title. No entry = no title (an admin reads as "CSM Manager"). */
export type StaffTitles = Record<string, 'tech'>;

/** Reads the titles, dropping anything that is not a known title. */
export async function getStaffTitles(): Promise<StaffTitles> {
  const raw = (await (appSettingsRepository as any).get(STAFF_TITLES_KEY)) as unknown;
  const titles: StaffTitles = {};
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    for (const [userId, title] of Object.entries(raw as Record<string, unknown>)) {
      if (title === 'tech') titles[userId] = 'tech';
    }
  }
  return titles;
}

/** Sets or (with null) removes one person's title. Returns whether anything changed. */
export async function setStaffTitle(userId: string, title: 'tech' | null, updatedBy: string): Promise<boolean> {
  const titles = await getStaffTitles();
  if ((titles[userId] || null) === title) return false;
  if (title) titles[userId] = title;
  else delete titles[userId];
  await (appSettingsRepository as any).set(STAFF_TITLES_KEY, titles, updatedBy);
  return true;
}

/**
 * One person's title, for showing their role name. Never throws: if the setting cannot be read
 * the person simply reads as "CSM Manager"; their access does not depend on it.
 */
export async function resolveStaffTitle(userId?: string | null): Promise<'tech' | null> {
  if (!userId) return null;
  try {
    return (await getStaffTitles())[userId] || null;
  } catch (err: any) {
    console.error(`[staff-titles] Could not read staff titles: ${err?.message}`);
    return null;
  }
}
// ───────────────────────── end staff_titles ─────────────────────────

/** Known platform settings and their defaults. */
export interface NotificationSettings {
  /** Who is emailed when a client submits the onboarding form (e.g. the media buyer). */
  onboarding_form_recipients: string[];
  /** Also email the CSM assigned to that client. */
  notify_assigned_csm: boolean;
  /** The website review team: emailed every Website Change Request, as well as the usual staff. */
  website_request_recipients: string[];
  /** The lead review team: emailed every Lead Replacement and Unresponsive Lead form. */
  lead_form_recipients: string[];
}

/** The three recipient lists an admin edits on Settings & Integrations. */
export const NOTIFICATION_LIST_KEYS = ['onboarding_form_recipients', 'website_request_recipients', 'lead_form_recipients'] as const;
export type NotificationListKey = (typeof NOTIFICATION_LIST_KEYS)[number];

/** What may be saved: the two newer lists can be left out and then read back as empty. */
export type NotificationSettingsInput = Pick<NotificationSettings, 'onboarding_form_recipients' | 'notify_assigned_csm'> &
  Partial<NotificationSettings>;

/** Who must enter an emailed one-time code after their password when signing in. */
export type StaffLoginCodeMode = 'off' | 'csm' | 'all_staff';
export const STAFF_LOGIN_CODE_MODES: StaffLoginCodeMode[] = ['off', 'csm', 'all_staff'];

export interface SecuritySettings {
  staff_login_code: StaffLoginCodeMode;
}

/** Optional links the portal posts events to, so the team can build their own automations. */
export interface AutomationSettings {
  /** A GoHighLevel Inbound Webhook link that receives every lead form submission. Empty = off. */
  lead_request_webhook_url: string;
}

/** Where the portal posts a Slack message when a client sends a lead form. */
export interface SlackSettings {
  /** A Slack Incoming Webhook link (https://hooks.slack.com/services/...). Empty = off. Never sent to the browser. */
  lead_request_slack_webhook_url: string;
}

const DEFAULTS: {
  notifications: NotificationSettings;
  security: SecuritySettings;
  forms: FormSettings;
  automation: AutomationSettings;
  slack: SlackSettings;
} = {
  notifications: {
    onboarding_form_recipients: [],
    notify_assigned_csm: true,
    website_request_recipients: [],
    lead_form_recipients: [],
  },
  // Off by default so staff whose @motionz.ai mailbox cannot receive email are not locked out.
  security: { staff_login_code: 'off' },
  // GoHighLevel form ids shown in the client portal. Admins change them on Settings & Integrations.
  forms: FORM_SETTING_DEFAULTS,
  automation: { lead_request_webhook_url: '' },
  slack: { lead_request_slack_webhook_url: '' },
};

type SettingKey = keyof typeof DEFAULTS;
type SettingInput<K extends SettingKey> = K extends 'notifications' ? NotificationSettingsInput : (typeof DEFAULTS)[K];

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

    const merged: Record<string, any> = { ...DEFAULTS[key], ...(value || {}) };
    if (key === 'notifications') {
      // Values saved before the website and lead lists existed lack those keys; anything that is not a list reads as empty.
      for (const listKey of NOTIFICATION_LIST_KEYS) {
        merged[listKey] = Array.isArray(merged[listKey]) ? merged[listKey].filter((e: unknown) => typeof e === 'string') : [];
      }
    }
    if (key === 'automation' && typeof merged.lead_request_webhook_url !== 'string') merged.lead_request_webhook_url = '';
    if (key === 'slack' && typeof merged.lead_request_slack_webhook_url !== 'string') merged.lead_request_slack_webhook_url = '';
    return merged as (typeof DEFAULTS)[K];
  }

  async set<K extends SettingKey>(key: K, value: SettingInput<K>, updatedBy: string): Promise<void> {
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

/** The portal's GoHighLevel form ids, with anything malformed replaced by the built-in default. */
export async function getFormSettings(): Promise<FormSettings> {
  return sanitizeFormSettings(await appSettingsRepository.get('forms'));
}

/**
 * Form ids for the client portal. Never throws: if the setting cannot be read, the built-in
 * texting form keeps Setup Progress working.
 */
export async function resolveFormSettings(): Promise<FormSettings> {
  try {
    return await getFormSettings();
  } catch (err: any) {
    console.error(`[forms] Could not read the form settings, using the built-in defaults: ${err?.message}`);
    return { ...FORM_SETTING_DEFAULTS };
  }
}

// ───────────────────────── leads (when a GoHighLevel contact counts as a lead) ─────────────────────────
// Self-contained block: stored under the `leads` key through the generic get/set above.

/** The rule the GoHighLevel webhook applies before it creates a lead. */
export interface LeadSettings {
  /**
   * Empty (the default): every opportunity GoHighLevel sends becomes a lead.
   * Set: a contact becomes a lead only once it carries this tag in GoHighLevel.
   */
  required_tag: string;
}

export const LEADS_KEY = 'leads';
export const LEAD_TAG_MAX_LENGTH = 60;

/** A tag name as it is stored: trimmed, inner spaces collapsed, at most 60 characters. */
export function cleanLeadTag(value: unknown): string {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ').slice(0, LEAD_TAG_MAX_LENGTH).trim() : '';
}

/** Reads the lead rule. Anything that is not a usable tag name reads as "no tag needed". */
export async function getLeadSettings(): Promise<LeadSettings> {
  const raw = (await (appSettingsRepository as any).get(LEADS_KEY)) as Partial<LeadSettings>;
  return { required_tag: cleanLeadTag(raw?.required_tag) };
}

export async function setLeadSettings(value: LeadSettings, updatedBy: string): Promise<void> {
  await (appSettingsRepository as any).set(LEADS_KEY, { required_tag: cleanLeadTag(value.required_tag) }, updatedBy);
}
// ───────────────────────── end leads ─────────────────────────
