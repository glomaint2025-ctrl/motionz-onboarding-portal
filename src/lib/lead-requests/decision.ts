/**
 * The instant decision on a Lead Replacement request. One pure function, used by the API when a
 * request is saved; the text it returns is what the client reads on the result screen.
 *
 * Rules, in order:
 *  1. "Other"                                                              → Needs review
 *  2. "Yes, I was at the appointment" with "Wrong contact information"     → Needs review
 *     (the two answers do not fit together)
 *  3. Everything else                                                      → Approved
 *
 * "Not replaceable" is never worked out automatically: none of the reasons on the form means
 * "inspected and didn't buy". Staff can still set it by hand on the client's Lead requests card.
 */
import type { AppointmentOutcome, LeadRequestDecision, ReplacementReason } from './definition';

export type ReplacementOutcome = Exclude<LeadRequestDecision, 'sent'>;

export interface ReplacementDecision {
  decision: ReplacementOutcome;
  reason: string;
}

export const NEEDS_REVIEW_TEXT = 'Our team will look at this one and get back to you.';
export const APPROVED_TEXT = 'This matches the replacement rules. It has been sent to our marketing team.';
/** Shown when staff set "Not replaceable" without writing a note of their own. */
export const NOT_REPLACEABLE_TEXT = 'Our team looked at this request. It does not match the replacement rules.';
export const UNRESPONSIVE_SENT_TEXT =
  'Our marketing team will run their own follow-ups with this lead. If they cannot reach them either, the lead is escalated for replacement.';

/** The reason shown to the client for each outcome when nobody wrote one. */
export const DEFAULT_OUTCOME_TEXT: Record<ReplacementOutcome, string> = {
  approved: APPROVED_TEXT,
  not_replaceable: NOT_REPLACEABLE_TEXT,
  needs_review: NEEDS_REVIEW_TEXT,
};

export function decideReplacement(reason: ReplacementReason, appointment: AppointmentOutcome): ReplacementDecision {
  if (reason === 'other') return { decision: 'needs_review', reason: NEEDS_REVIEW_TEXT };
  // Someone who met the homeowner did reach them, so "wrong contact information" needs a person to look.
  if (appointment === 'attended' && reason === 'wrong_contact_info') {
    return { decision: 'needs_review', reason: NEEDS_REVIEW_TEXT };
  }
  return { decision: 'approved', reason: APPROVED_TEXT };
}
