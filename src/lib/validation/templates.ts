import { StepOwner } from '../db/schema';
import type { TemplateStepUpdate } from '../db/repositories/portal-templates.repository';
import type { ScriptTemplateUpdate, ScriptTemplateCreate } from '../db/repositories/scripts.repository';
import { SCRIPT_CATEGORIES, isScriptCategory } from '../scripts/ad-script-library';

const CATEGORY_ERROR = `Category must be one of: ${SCRIPT_CATEGORIES.join(', ')}.`;

export const TEMPLATE_LIMITS = {
  stepName: 255,
  stepCopy: 2000,
  scriptTitle: 255,
  scriptContent: 5000,
} as const;

const STEP_OWNERS: StepOwner[] = ['we_handle', 'client_action'];
const STEP_KEY_PATTERN = /^[a-z0-9_]{1,100}$/;
const TEMPLATE_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

export type ValidationResult<T> = { ok: true; value: T } | { ok: false; error: string };

export function isValidStepKey(stepKey: unknown): stepKey is string {
  return typeof stepKey === 'string' && STEP_KEY_PATTERN.test(stepKey);
}

export function isValidScriptTemplateId(id: unknown): id is string {
  return typeof id === 'string' && TEMPLATE_ID_PATTERN.test(id);
}

/**
 * Optional field: absent/undefined is skipped; present must be a non-empty string within maxLength.
 */
function readText(
  body: Record<string, unknown>,
  key: string,
  label: string,
  maxLength: number
): { ok: true; value?: string } | { ok: false; error: string } {
  const raw = body[key];
  if (raw === undefined) return { ok: true };
  if (typeof raw !== 'string') return { ok: false, error: `${label} must be text.` };
  const value = raw.trim();
  if (!value) return { ok: false, error: `${label} cannot be empty.` };
  if (value.length > maxLength) {
    return { ok: false, error: `${label} must be ${maxLength} characters or fewer.` };
  }
  return { ok: true, value };
}

export function validateTemplateStepUpdate(body: unknown): ValidationResult<TemplateStepUpdate> {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { ok: false, error: 'Request body must be a JSON object.' };
  }
  const input = body as Record<string, unknown>;
  const update: TemplateStepUpdate = {};

  const fields: [Exclude<keyof TemplateStepUpdate, 'owner'>, string, number][] = [
    ['name', 'Step name', TEMPLATE_LIMITS.stepName],
    ['what_it_is', 'What it is', TEMPLATE_LIMITS.stepCopy],
    ['right_now', 'Right now', TEMPLATE_LIMITS.stepCopy],
    ['unlocks', 'Unlocks', TEMPLATE_LIMITS.stepCopy],
  ];
  for (const [key, label, max] of fields) {
    const result = readText(input, key, label, max);
    if (!result.ok) return result;
    if (result.value !== undefined) update[key] = result.value;
  }

  if (input.owner !== undefined) {
    if (typeof input.owner !== 'string' || !STEP_OWNERS.includes(input.owner as StepOwner)) {
      return { ok: false, error: 'Owner must be either "we_handle" or "client_action".' };
    }
    update.owner = input.owner as StepOwner;
  }

  if (Object.keys(update).length === 0) {
    return { ok: false, error: 'Provide at least one field to update.' };
  }
  return { ok: true, value: update };
}

export function validateScriptTemplateUpdate(body: unknown): ValidationResult<ScriptTemplateUpdate> {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { ok: false, error: 'Request body must be a JSON object.' };
  }
  const input = { ...(body as Record<string, unknown>) };
  // Accept `content` as an alias for the column name `script_content`.
  if (input.script_content === undefined && input.content !== undefined) {
    input.script_content = input.content;
  }

  const update: ScriptTemplateUpdate = {};
  const title = readText(input, 'title', 'Title', TEMPLATE_LIMITS.scriptTitle);
  if (!title.ok) return title;
  if (title.value !== undefined) update.title = title.value;

  const content = readText(input, 'script_content', 'Script content', TEMPLATE_LIMITS.scriptContent);
  if (!content.ok) return content;
  if (content.value !== undefined) update.script_content = content.value;

  if (input.category !== undefined) {
    if (!isScriptCategory(input.category)) return { ok: false, error: CATEGORY_ERROR };
    update.category = input.category;
  }

  if (Object.keys(update).length === 0) {
    return { ok: false, error: 'Provide a title, script content or category to update.' };
  }
  return { ok: true, value: update };
}

/** New script: title, content and category are all required. */
export function validateScriptTemplateCreate(body: unknown): ValidationResult<ScriptTemplateCreate> {
  const result = validateScriptTemplateUpdate(body);
  if (!result.ok) return result;
  const { title, script_content, category } = result.value;
  if (!title) return { ok: false, error: 'Title is required.' };
  if (!script_content) return { ok: false, error: 'Script content is required.' };
  if (!category) return { ok: false, error: CATEGORY_ERROR };
  return { ok: true, value: { title, script_content, category } };
}
