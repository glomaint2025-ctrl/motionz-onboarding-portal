/**
 * Onboarding form answers: one place decides which fields of a stored submission are the client's
 * answers and which describe the delivery itself (webhook secret, contact record, source marker...).
 * Used when a GoHighLevel submission is stored (webhook) and whenever a submission is shown.
 *
 * No server-only imports: the answers viewer (browser) uses this file too.
 */
import { ONBOARDING_FORM_FIELDS, SOURCE_KEY, type OnboardingFileRef } from './form-definition';

// Fields that describe the webhook itself rather than the client's answers.
const META_KEYS = new Set([
  'customData', 'secret', 'location', 'workflow', 'triggerData', 'contact', 'attributionSource',
  'lastAttributionSource', 'contact_id', 'contact_type', 'date_created', 'tags', 'type', 'locationId',
  'user', 'company', 'id', 'calendar', 'opportunity', 'contact_source', 'timezone',
  // Marks a submission sent from the portal's own form. Kept in the row, never displayed.
  SOURCE_KEY,
]);

/** A displayed answer: text, or the files uploaded for an upload question. */
export type AnswerValue = string | OnboardingFileRef[];

/** Keeps only the plain answers (text, numbers, yes/no, lists of text) as strings. */
export function extractAnswers(source: Record<string, unknown> | null | undefined): Record<string, string> {
  const answers: Record<string, string> = {};
  for (const [key, value] of Object.entries(source || {})) {
    if (META_KEYS.has(key) || value === null || value === undefined || value === '') continue;
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      answers[key] = String(value);
    } else if (Array.isArray(value) && value.every((v) => typeof v === 'string')) {
      answers[key] = value.join(', ');
    }
  }
  return answers;
}

/** Storage paths are `<tenantId>/<folder>/<file name>`, made of safe characters only. */
export const ONBOARDING_FILE_PATH_PATTERN = /^[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+\/[A-Za-z0-9._-]+$/;

export function isOnboardingFilePath(path: unknown): path is string {
  return typeof path === 'string' && path.length <= 400 && ONBOARDING_FILE_PATH_PATTERN.test(path) && !path.includes('..');
}

/** A list of files uploaded through the portal form (never anything else, e.g. an old GoHighLevel file value). */
export function isFileList(value: unknown): value is OnboardingFileRef[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every((v) => v && typeof v === 'object' && typeof (v as any).name === 'string' && isOnboardingFilePath((v as any).path))
  );
}

// Position of each question on the form, by its label and by the names older submissions used.
const QUESTION_ORDER = new Map<string, number>();
ONBOARDING_FORM_FIELDS.forEach((field, index) => {
  for (const name of [field.label, ...(field.aliases || [])]) {
    if (!QUESTION_ORDER.has(name)) QUESTION_ORDER.set(name, index);
  }
});

/**
 * The answers to show for a stored submission: text answers plus uploaded files, in the order of
 * the form (the database does not keep the order they were sent in). Questions the form does not
 * know come after the known ones. Anything internal or oddly shaped is left out.
 */
export function displayAnswers(source: Record<string, unknown> | null | undefined): Record<string, AnswerValue> {
  const entries: [string, AnswerValue][] = Object.entries(extractAnswers(source));
  for (const [key, value] of Object.entries(source || {})) {
    if (!META_KEYS.has(key) && isFileList(value)) {
      entries.push([key, value.map(({ name, path, size }) => ({ name, path, size: Number(size) || 0 }))]);
    }
  }
  const rank = (key: string) => QUESTION_ORDER.get(key) ?? Number.MAX_SAFE_INTEGER;
  return Object.fromEntries(
    entries
      .map((entry, index) => ({ entry, index }))
      .sort((a, b) => rank(a.entry[0]) - rank(b.entry[0]) || a.index - b.index)
      .map((item) => item.entry)
  );
}

/** Answers as plain text (for the notification email): files become their names. */
export function answersAsText(source: Record<string, unknown> | null | undefined): Record<string, string> {
  return Object.fromEntries(
    Object.entries(displayAnswers(source)).map(([key, value]) => [
      key,
      typeof value === 'string' ? value : value.map((f) => f.name).join(', '),
    ])
  );
}
