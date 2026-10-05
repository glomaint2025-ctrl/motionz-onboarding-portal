/**
 * Confirmed Motionz resources (docs/07-integrations/{slack,skool,forms}.md).
 * Keep every client-facing external link here so they are changed in one place.
 */
export const PORTAL_LINKS = {
  slackInvite: 'https://join.slack.com/t/motionzai/shared_invite/zt-43dl2h1x0-FWRlbT9S7lcXENJhcO4XrQ',
  skoolCommunity: 'https://www.skool.com/motionz-your-clinic-1141/about',
  onboardingFormId: 'wyM27h1ZCiwGoyXE03oC',
  a2pFormId: 'SH2jCt6DkV69gF6YHPni',
  csmBookingCalendarId: 'SRn2ONyB295xnnPR5JwR',
  /** "Rejuvenation Money Leak Calculator": one view-only sheet shared with every client (client answer, 5 Oct 2026). */
  moneyLeakCalculatorSheet: 'https://docs.google.com/spreadsheets/d/1pDXSCpnGIJXLnXheL-yQofUWvZ8mSDk-YM6nLl_pZrw/edit#gid=2143281968',
} as const;

/** GHL form URL, optionally pre-filling the email so the submission can be matched to the client. */
export function ghlFormUrl(formId: string, prefillEmail?: string): string {
  const url = new URL(`https://api.leadconnectorhq.com/widget/form/${formId}`);
  url.searchParams.set('notrack', 'true');
  if (prefillEmail) url.searchParams.set('email', prefillEmail);
  return url.toString();
}
