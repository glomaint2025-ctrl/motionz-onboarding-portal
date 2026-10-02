/**
 * Client portal modules that can be enabled per tenant and restricted per member.
 */
export const PORTAL_MODULES = [
  { key: 'onboarding', label: 'Setup Progress', description: 'View and track onboarding setup steps' },
  { key: 'leads', label: 'Leads & Pipeline', description: 'Access incoming leads and appointment pipeline' },
  { key: 'tracking', label: 'Campaign Tracking', description: 'Monitor live campaign performance metrics' },
  { key: 'contracts', label: 'Signed Contract', description: 'View client agreements and signed scopes' },
  { key: 'orders', label: 'Orders & Shipping', description: 'Track physical hardware and order delivery status' },
  { key: 'tools', label: 'Tools & Resources', description: 'Access external partner tools and operational links' },
  { key: 'roof_measurement', label: 'Roof Measurement', description: 'Estimate square footage, area, and pitch calculators' },
  { key: 'video_scripts', label: 'Video Scripts', description: 'Browse and personalize production video scripts' },
  { key: 'book_call', label: 'Book CSM Call', description: 'Schedule strategy calls with Motionz account managers' },
  { key: 'team', label: 'Team Members', description: 'Manage staff accounts and invitations' },
];
