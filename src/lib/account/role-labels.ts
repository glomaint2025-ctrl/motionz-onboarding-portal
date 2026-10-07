/**
 * What people read for the "admin" role. Only the name changed: the role key in the database,
 * in sessions, in URLs (/admin/...) and in the API is still `admin`.
 */
export const ADMIN_ROLE_LABEL = 'CSM Manager';
export const ADMIN_ROLE_LABEL_PLURAL = 'CSM Managers';

/**
 * "Tech" is a title, not a role: a Tech person has the role `admin` and exactly the same
 * permissions as a CSM Manager. Only the name people read differs.
 */
export type StaffTitle = 'tech';
export const TECH_ROLE_LABEL = 'Tech';

/** "tech" when the value is a known title, otherwise null (no title = CSM Manager). */
export function parseStaffTitle(value: unknown): StaffTitle | null {
  return value === 'tech' ? 'tech' : null;
}

/** The one place that names a person's role: admin + title "tech" reads "Tech", admin alone "CSM Manager". */
export function staffRoleLabel(role: string | null | undefined, title?: string | null): string {
  if (role === 'admin' && title === 'tech') return TECH_ROLE_LABEL;
  return (role && VIEWER_ROLE_LABELS[role]) || '';
}

/** How each role is named to the person themselves (header, My profile). */
export const VIEWER_ROLE_LABELS: Record<string, string> = {
  admin: ADMIN_ROLE_LABEL,
  csm: 'CSM',
  client: 'Account owner',
  client_member: 'Team member',
};

/** Where a person's own "My profile" page lives. Staff always use their staff area, even while viewing a client. */
export function myProfileHref(role: string | null | undefined, clientId?: string): string | null {
  if (role === 'admin') return '/admin/profile';
  if (role === 'csm') return '/csm/profile';
  if ((role === 'client' || role === 'client_member') && clientId) return `/portal/${clientId}/my-profile`;
  return null;
}
