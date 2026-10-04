/**
 * Client portal modules that can be enabled per client and restricted per team member.
 * One name per concept: these labels match the portal navigation and page titles.
 */
export interface PortalModule {
  key: string;
  label: string;
  description: string;
  /**
   * False for sections a team member can never use (only the account owner sees the
   * contract and manages the team), so they are not offered when choosing a member's access.
   */
  memberSelectable: boolean;
}

export const PORTAL_MODULES: PortalModule[] = [
  { key: 'onboarding', label: 'Setup Progress', description: 'See the setup steps and what is needed next', memberSelectable: true },
  { key: 'leads', label: 'Leads', description: 'See the leads coming in from GoHighLevel', memberSelectable: true },
  { key: 'tracking', label: 'Results Tracking', description: 'Open the Google Sheet used to log calls and track results', memberSelectable: true },
  { key: 'contracts', label: 'Contract', description: 'View the agreement with Motionz (account owner only)', memberSelectable: false },
  { key: 'tools', label: 'Tools & Resources', description: 'Slack, Skool and the everyday tools in one place', memberSelectable: true },
  { key: 'roof_measurement', label: 'Roof Measurement', description: "Measure a roof's area, squares and pitch from an address", memberSelectable: true },
  { key: 'video_scripts', label: 'Video Scripts', description: 'Read and personalize the ad scripts to film', memberSelectable: true },
  { key: 'book_call', label: 'Book a Call', description: 'Book a call with the Motionz CSM', memberSelectable: true },
  { key: 'team', label: 'Team', description: 'Invite people and manage their access (account owner only)', memberSelectable: false },
];

/** Modules that can be granted to a team member. */
export const MEMBER_SELECTABLE_MODULES: PortalModule[] = PORTAL_MODULES.filter((m) => m.memberSelectable);

export const isMemberSelectableModule = (key: string): boolean =>
  MEMBER_SELECTABLE_MODULES.some((m) => m.key === key);
