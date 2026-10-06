/**
 * The two lead forms built into the portal: Lead Replacement and Unresponsive Lead.
 * Everything a form shows and everything the API accepts comes from this folder, so the two always
 * agree. This file has no server-only imports: pages and API routes can both use it.
 *
 * The dropdown options are a first proposal and may change once the client confirms them. Each
 * option has a short key (stored) and a label (shown); change a label freely, but keep the keys.
 */

export type LeadRequestType = 'replacement' | 'unresponsive';
export const LEAD_REQUEST_TYPES: LeadRequestType[] = ['replacement', 'unresponsive'];

export type LeadRequestDecision = 'approved' | 'not_replaceable' | 'needs_review' | 'sent';
export type LeadRequestStatus = 'open' | 'done';

export interface LeadRequestOption<K extends string = string> {
  key: K;
  label: string;
}

export type ReplacementReason =
  | 'cancelled_before_inspection'
  | 'wrong_contact_info'
  | 'not_homeowner'
  | 'outside_service_area'
  | 'roof_not_qualified'
  | 'refused_inspection'
  | 'inspected_no_sale'
  | 'other';

export const REPLACEMENT_REASONS: LeadRequestOption<ReplacementReason>[] = [
  { key: 'cancelled_before_inspection', label: "Cancelled before the inspection and can't be rebooked" },
  { key: 'wrong_contact_info', label: 'Wrong contact info' },
  { key: 'not_homeowner', label: 'Not the homeowner' },
  { key: 'outside_service_area', label: 'Outside my service area' },
  { key: 'roof_not_qualified', label: "Roof doesn't qualify (not asphalt shingle, or under 4 years old)" },
  { key: 'refused_inspection', label: 'Homeowner refused the inspection when I arrived' },
  { key: 'inspected_no_sale', label: "I inspected the roof and they didn't buy" },
  { key: 'other', label: 'Something else' },
];

export type AppointmentOutcome = 'none' | 'not_inspected' | 'inspected';

export const APPOINTMENT_OUTCOMES: LeadRequestOption<AppointmentOutcome>[] = [
  { key: 'none', label: 'No, there was no appointment' },
  { key: 'not_inspected', label: 'Yes, but I could not inspect the roof' },
  { key: 'inspected', label: 'Yes, and I inspected the roof' },
];

export const LEAD_NAME_MAX = 120;
export const WHAT_HAPPENED_MIN = 30;
export const CONTACT_ATTEMPTS_MIN = 20;
export const LONG_TEXT_MAX = 2000;
export const DAYS_MAX = 365;
/** An unresponsive lead can be submitted from this day (not earlier). */
export const UNRESPONSIVE_FROM_DAY = 4;

export const UNRESPONSIVE_TOO_EARLY = 'Submit this lead from day 4. Keep calling twice a day until then.';
export const FORM_UNAVAILABLE = 'This form is not available yet. Please tell your CSM.';

/** What a form sends to the API. */
export interface LeadRequestInput {
  type?: unknown;
  /** The lead picked from the client's own leads, if any. */
  leadId?: unknown;
  leadName?: unknown;
  leadPhone?: unknown;
  // Lead Replacement
  reason?: unknown;
  appointment?: unknown;
  whatHappened?: unknown;
  // Unresponsive Lead
  daysSinceSent?: unknown;
  contactAttempts?: unknown;
}

/** What is stored in `details` for a Lead Replacement request. */
export interface ReplacementDetails {
  reason: ReplacementReason;
  reason_label: string;
  appointment: AppointmentOutcome;
  appointment_label: string;
  what_happened: string;
}

/** What is stored in `details` for an Unresponsive Lead request. */
export interface UnresponsiveDetails {
  days_since_sent: number;
  contact_attempts: string;
}

export const LEAD_REQUEST_TYPE_LABELS: Record<LeadRequestType, string> = {
  replacement: 'Lead replacement',
  unresponsive: 'Unresponsive lead',
};

export const DECISION_LABELS: Record<LeadRequestDecision, string> = {
  approved: 'Approved',
  not_replaceable: 'Not replaceable',
  needs_review: 'Needs review',
  sent: 'Sent to the marketing team',
};

/** Badge colour for each outcome (the StatusBadge variants of the UI kit). */
export const DECISION_BADGE: Record<LeadRequestDecision, 'done' | 'danger' | 'warning' | 'progress'> = {
  approved: 'done',
  not_replaceable: 'danger',
  needs_review: 'warning',
  sent: 'progress',
};

export const typeLabel = (type: string): string => LEAD_REQUEST_TYPE_LABELS[type as LeadRequestType] || type;
export const decisionLabel = (decision: string): string => DECISION_LABELS[decision as LeadRequestDecision] || decision;
export const decisionBadge = (decision: string) => DECISION_BADGE[decision as LeadRequestDecision] || 'pending';
export const reasonLabel = (key: string): string => REPLACEMENT_REASONS.find((r) => r.key === key)?.label || key;
export const appointmentLabel = (key: string): string => APPOINTMENT_OUTCOMES.find((a) => a.key === key)?.label || key;

/** The answers of a request as label → text, in form order (used by the email and the staff list). */
export function detailLines(type: string, details: Record<string, any> | null | undefined): [string, string][] {
  const d = details || {};
  if (type === 'unresponsive') {
    return [
      ['Days since lead was sent', d.days_since_sent === undefined || d.days_since_sent === null ? '' : String(d.days_since_sent)],
      ['How they tried to reach them', typeof d.contact_attempts === 'string' ? d.contact_attempts : ''],
    ];
  }
  return [
    ['Reason for replacement', d.reason_label || reasonLabel(d.reason || '')],
    ['Got to an appointment?', d.appointment_label || appointmentLabel(d.appointment || '')],
    ['What happened', typeof d.what_happened === 'string' ? d.what_happened : ''],
  ];
}

/** Whole days since a lead arrived (0 on the day it arrived), capped to what the form accepts. */
export function daysSince(createdAt: string | null | undefined, now: number = Date.now()): number | null {
  const at = createdAt ? new Date(createdAt).getTime() : NaN;
  if (!Number.isFinite(at)) return null;
  return Math.min(DAYS_MAX, Math.max(0, Math.floor((now - at) / (24 * 60 * 60 * 1000))));
}
