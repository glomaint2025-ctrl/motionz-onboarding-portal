/**
 * Checks the answers of the onboarding form against its definition. The form page runs this before
 * sending, and the API runs it again on what arrives, so both always agree.
 */
import { validateEmail, validatePhone } from '../validation';
import {
  ONBOARDING_FORM_FIELDS,
  TEXT_MAX_LENGTH,
  TEXTAREA_MAX_LENGTH,
  type OnboardingFormValues,
} from './form-definition';

export interface OnboardingValidationResult {
  /** Cleaned answers keyed by question LABEL; unanswered questions are left out. */
  answers: Record<string, string>;
  /** One message per question key that needs fixing. */
  errors: Record<string, string>;
}

const asList = (value: string | string[] | undefined): string[] =>
  (Array.isArray(value) ? value : value === undefined ? [] : [value])
    .filter((v): v is string => typeof v === 'string')
    .map((v) => v.trim())
    .filter(Boolean);

export function validateOnboardingValues(values: OnboardingFormValues): OnboardingValidationResult {
  const answers: Record<string, string> = {};
  const errors: Record<string, string> = {};

  for (const field of ONBOARDING_FORM_FIELDS) {
    if (field.type === 'file') continue; // Files are checked where they are read.
    const picked = asList(values[field.key]);

    if (picked.length === 0) {
      if (field.required) errors[field.key] = 'Please answer this question.';
      continue;
    }

    if (field.type === 'checkbox') {
      const unique = Array.from(new Set(picked));
      if (unique.some((option) => !field.options!.includes(option))) {
        errors[field.key] = 'Choose from the options shown.';
        continue;
      }
      // Kept in the order the form lists them.
      answers[field.label] = field.options!.filter((option) => unique.includes(option)).join(', ');
      continue;
    }

    if (picked.length > 1) {
      errors[field.key] = 'Give one answer only.';
      continue;
    }
    const value = picked[0];

    if (field.type === 'select' || field.type === 'radio') {
      if (!field.options!.includes(value)) {
        errors[field.key] = 'Choose one of the options shown.';
        continue;
      }
      answers[field.label] = value;
      continue;
    }

    const max = field.maxLength ?? (field.type === 'textarea' ? TEXTAREA_MAX_LENGTH : TEXT_MAX_LENGTH);
    if (value.length > max) {
      errors[field.key] = `This answer is too long. Keep it under ${max.toLocaleString('en-US')} characters.`;
      continue;
    }
    if (field.format === 'email') {
      try {
        answers[field.label] = validateEmail(value);
      } catch {
        errors[field.key] = 'Enter a valid email address, for example joe@yourcompany.com.';
      }
      continue;
    }
    if (field.format === 'phone') {
      try {
        answers[field.label] = validatePhone(value) as string;
      } catch {
        errors[field.key] = 'Enter a valid phone number, for example +1 555 234 5678.';
      }
      continue;
    }
    answers[field.label] = value;
  }

  return { answers, errors };
}

/** The first problem (in form order) as one sentence that names the question, for the API's `error` text. */
export function firstErrorMessage(errors: Record<string, string>): string | null {
  const field = ONBOARDING_FORM_FIELDS.find((f) => errors[f.key]);
  return field ? `"${field.label}": ${errors[field.key]}` : null;
}
