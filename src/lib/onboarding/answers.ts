/**
 * Onboarding form answers: one place decides which fields of a GoHighLevel form payload are the
 * client's answers and which describe the webhook itself (secret, contact record, workflow...).
 * Used when a submission is stored (webhook) and again when it is shown to the client.
 */

// Fields that describe the webhook itself rather than the client's answers.
const META_KEYS = new Set([
  'customData', 'secret', 'location', 'workflow', 'triggerData', 'contact', 'attributionSource',
  'lastAttributionSource', 'contact_id', 'contact_type', 'date_created', 'tags', 'type', 'locationId',
  'user', 'company', 'id', 'calendar', 'opportunity', 'contact_source', 'timezone',
]);

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
