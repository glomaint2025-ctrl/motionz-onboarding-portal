/** How each role is named to the person themselves (header, My profile). */
export const VIEWER_ROLE_LABELS: Record<string, string> = {
  admin: 'Admin',
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
