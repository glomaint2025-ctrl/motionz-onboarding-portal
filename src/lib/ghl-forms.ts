import { PORTAL_LINKS } from './portal-links';

/**
 * The GoHighLevel forms shown inside the client portal. Admins paste each form's link on
 * Admin → Settings & Integrations; only the form id is stored (app setting `forms`).
 * This file has no server-only imports, so pages and API routes can both use it.
 */
export interface FormSettings {
  onboarding_form_id: string;
  a2p_form_id: string;
  lead_replacement_form_id: string;
  unresponsive_lead_form_id: string;
}

export type FormSettingKey = keyof FormSettings;

/** Built-in ids. The two Leads forms stay empty (hidden from clients) until an admin adds a link. */
export const FORM_SETTING_DEFAULTS: FormSettings = {
  onboarding_form_id: PORTAL_LINKS.onboardingFormId,
  a2p_form_id: PORTAL_LINKS.a2pFormId,
  lead_replacement_form_id: '',
  unresponsive_lead_form_id: '',
};

export interface FormSettingField {
  key: FormSettingKey;
  /** Name shown to admins. */
  label: string;
  /** Portal page the form appears on. */
  shownOn: 'Setup Progress' | 'Leads';
  /** Required forms can be changed but never emptied. */
  required: boolean;
}

export const FORM_SETTING_FIELDS: FormSettingField[] = [
  { key: 'onboarding_form_id', label: 'Onboarding form', shownOn: 'Setup Progress', required: true },
  { key: 'a2p_form_id', label: 'Texting registration form', shownOn: 'Setup Progress', required: true },
  { key: 'lead_replacement_form_id', label: 'Lead replacement form', shownOn: 'Leads', required: false },
  { key: 'unresponsive_lead_form_id', label: 'Unresponsive lead form', shownOn: 'Leads', required: false },
];

/** A GHL form id: letters, digits, "-" and "_", 10 to 40 characters. */
export const GHL_FORM_ID_PATTERN = /^[A-Za-z0-9_-]{10,40}$/;

/** Longest text we look at; a real link or embed snippet is far shorter. */
const MAX_FORM_INPUT_LENGTH = 4000;

/**
 * Returns the form id from whatever an admin pastes: the bare id, a form link
 * (https://api.leadconnectorhq.com/widget/form/<id>, https://link.<domain>/widget/form/<id>,
 * with or without a query string) or the whole <iframe ...> embed snippet.
 * Returns null when no plausible form id is found.
 */
export function parseGhlFormId(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  const text = input.trim();
  if (!text || text.length > MAX_FORM_INPUT_LENGTH) return null;

  if (GHL_FORM_ID_PATTERN.test(text)) return text;

  // A link or an embed snippet: the id is the path part right after /widget/form/.
  const fromLink = text.match(/\/widget\/form\/([^/?#"'\s<>&\\]+)/i);
  if (fromLink) return GHL_FORM_ID_PATTERN.test(fromLink[1]) ? fromLink[1] : null;

  // Embed snippets also carry the id as data-form-id="<id>".
  const fromAttribute = text.match(/data-form-id\s*=\s*["']?([^"'\s<>]+)/i);
  if (fromAttribute && GHL_FORM_ID_PATTERN.test(fromAttribute[1])) return fromAttribute[1];

  return null;
}

/** Keeps well-formed ids only; anything else falls back to the built-in default for that form. */
export function sanitizeFormSettings(raw: unknown): FormSettings {
  const source = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const result = { ...FORM_SETTING_DEFAULTS };
  for (const { key, required } of FORM_SETTING_FIELDS) {
    const value = source[key];
    if (typeof value === 'string' && GHL_FORM_ID_PATTERN.test(value)) result[key] = value;
    else if (value === '' && !required) result[key] = '';
  }
  return result;
}
