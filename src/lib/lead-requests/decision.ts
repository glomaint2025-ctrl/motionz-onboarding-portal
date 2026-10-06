/**
 * The instant decision on a Lead Replacement request. One pure function, used by the API when a
 * request is saved; the text it returns is what the client reads on the result screen.
 *
 * Rules, in order:
 *  1. "I inspected the roof and they didn't buy"                            → Not replaceable
 *  2. "Something else"                                                      → Needs review
 *  3. The roof was inspected, and the reason is not "Roof doesn't qualify"  → Not replaceable
 *  4. Any of the six replaceable reasons                                    → Approved
 */
import type { AppointmentOutcome, LeadRequestDecision, ReplacementReason } from './definition';

export interface ReplacementDecision {
  decision: Exclude<LeadRequestDecision, 'sent'>;
  reason: string;
}

export const NOT_REPLACEABLE_TEXT =
  "You inspected a qualified roof and the homeowner didn't buy. That counts as a qualified appointment.";
export const NEEDS_REVIEW_TEXT = 'Our team will look at this one and get back to you.';
export const APPROVED_TEXT = 'This matches the replacement rules. It has been sent to our marketing team.';
export const UNRESPONSIVE_SENT_TEXT =
  'Our marketing team will run their own follow-ups with this lead. If they cannot reach them either, the lead is escalated for replacement.';

export function decideReplacement(reason: ReplacementReason, appointment: AppointmentOutcome): ReplacementDecision {
  if (reason === 'inspected_no_sale') return { decision: 'not_replaceable', reason: NOT_REPLACEABLE_TEXT };
  if (reason === 'other') return { decision: 'needs_review', reason: NEEDS_REVIEW_TEXT };
  // An inspected roof is a qualified appointment, unless the inspection is what showed the roof does not qualify.
  if (appointment === 'inspected' && reason !== 'roof_not_qualified') {
    return { decision: 'not_replaceable', reason: NOT_REPLACEABLE_TEXT };
  }
  return { decision: 'approved', reason: APPROVED_TEXT };
}
