/**
 * Checks what a lead form sends against its definition. The form page runs this before sending and
 * the API runs it again on what arrives, so both always agree.
 */
import { validatePhone } from '../validation';
import {
  APPOINTMENT_OUTCOMES,
  CONTACT_ATTEMPTS_MIN,
  DAYS_MAX,
  LEAD_NAME_MAX,
  LONG_TEXT_MAX,
  REPLACEMENT_REASONS,
  UNRESPONSIVE_FROM_DAY,
  UNRESPONSIVE_TOO_EARLY,
  WHAT_HAPPENED_MIN,
  type LeadRequestInput,
  type LeadRequestType,
  type ReplacementDetails,
  type UnresponsiveDetails,
} from './definition';

export interface LeadRequestValidation {
  leadName: string;
  leadPhone: string;
  /** Set when every answer is fine. */
  details?: ReplacementDetails | UnresponsiveDetails;
  /** One message per field (leadName, leadPhone, reason, appointment, whatHappened, daysSinceSent, contactAttempts). */
  errors: Record<string, string>;
  /** True when an unresponsive lead was submitted before day 4. */
  tooEarly: boolean;
}

const text = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');

function longText(value: unknown, min: number, tooShort: string): { value: string; error?: string } {
  const clean = text(value);
  if (!clean) return { value: clean, error: 'Please answer this question.' };
  if (clean.length < min) return { value: clean, error: tooShort };
  if (clean.length > LONG_TEXT_MAX) {
    return { value: clean, error: `Please keep this to ${LONG_TEXT_MAX.toLocaleString('en-US')} characters or fewer.` };
  }
  return { value: clean };
}

/** A whole number from a number or from text like "5"; anything else (4.5, "four", "", -1) is null. */
function wholeNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isInteger(value) && value >= 0 ? value : null;
  const clean = text(value);
  return /^\d{1,4}$/.test(clean) ? parseInt(clean, 10) : null;
}

export function validateLeadRequest(type: LeadRequestType, input: LeadRequestInput): LeadRequestValidation {
  const errors: Record<string, string> = {};

  const leadName = text(input.leadName);
  if (!leadName) errors.leadName = "Enter the lead's name.";
  else if (leadName.length > LEAD_NAME_MAX) errors.leadName = 'That name is too long.';

  let leadPhone = text(input.leadPhone);
  try {
    leadPhone = validatePhone(input.leadPhone, { required: true }) as string;
  } catch (e: any) {
    errors.leadPhone = leadPhone ? e.message : "Enter the lead's phone number.";
  }

  if (type === 'replacement') {
    const reason = REPLACEMENT_REASONS.find((r) => r.key === input.reason);
    if (!reason) errors.reason = 'Choose a reason.';
    const appointment = APPOINTMENT_OUTCOMES.find((a) => a.key === input.appointment);
    if (!appointment) errors.appointment = 'Choose an answer.';
    const whatHappened = longText(
      input.whatHappened,
      WHAT_HAPPENED_MIN,
      `Please give more detail (at least ${WHAT_HAPPENED_MIN} characters). Say exactly what happened.`
    );
    if (whatHappened.error) errors.whatHappened = whatHappened.error;

    if (Object.keys(errors).length > 0 || !reason || !appointment) return { leadName, leadPhone, errors, tooEarly: false };
    return {
      leadName,
      leadPhone,
      errors,
      tooEarly: false,
      details: {
        reason: reason.key,
        reason_label: reason.label,
        appointment: appointment.key,
        appointment_label: appointment.label,
        what_happened: whatHappened.value,
      },
    };
  }

  const days = wholeNumber(input.daysSinceSent);
  let tooEarly = false;
  if (days === null || days > DAYS_MAX) {
    errors.daysSinceSent = `Enter a whole number of days, from 0 to ${DAYS_MAX}.`;
  } else if (days < UNRESPONSIVE_FROM_DAY) {
    errors.daysSinceSent = UNRESPONSIVE_TOO_EARLY;
    tooEarly = true;
  }
  const attempts = longText(
    input.contactAttempts,
    CONTACT_ATTEMPTS_MIN,
    `Please give more detail (at least ${CONTACT_ATTEMPTS_MIN} characters).`
  );
  if (attempts.error) errors.contactAttempts = attempts.error;

  if (Object.keys(errors).length > 0 || days === null) return { leadName, leadPhone, errors, tooEarly };
  return { leadName, leadPhone, errors, tooEarly: false, details: { days_since_sent: days, contact_attempts: attempts.value } };
}

/** The first message, in form order, for a single-line error. */
export function firstLeadRequestError(errors: Record<string, string>): string {
  for (const key of ['leadId', 'leadName', 'leadPhone', 'reason', 'appointment', 'daysSinceSent', 'whatHappened', 'contactAttempts']) {
    if (errors[key]) return errors[key];
  }
  return Object.values(errors).find(Boolean) || '';
}
