/**
 * Plain-English labels for security events and audit-log actions.
 * Shared by the admin log pages (display) and /api/admin/logs (searching by label).
 */

export const SECURITY_EVENT_LABELS: Record<string, string> = {
  auth_logout: 'Signed out',
  staff_login_success: 'Staff signed in',
  staff_invalid_credentials: 'Wrong password (staff)',
  staff_unregistered_email_attempt: 'Staff sign-in with an unknown email',
  staff_privilege_escalation_attempt: 'Blocked: admin access requested without approval',
  unauthorized_staff_domain_access: 'Blocked: staff sign-in from a non-Motionz email',
  client_invalid_credentials: 'Wrong password (client)',
  invitation_created: 'Invitation sent',
  invitation_accepted: 'Invitation accepted',
  invitation_revoked: 'Invitation cancelled',
  magic_link_verification_failed: 'Invite link did not work',
  password_reset_requested: 'Password reset requested',
  password_reset_completed: 'Password reset completed',
  rate_limit_exceeded: 'Too many attempts (temporarily blocked)',
  role_privilege_escalation_attempt: 'Blocked: area not allowed for this role',
  unauthorized_capability_attempt: 'Blocked: action not allowed for this role',
  cross_tenant_access_attempt: "Blocked: tried to open another client's portal",
};

export const AUDIT_ACTION_LABELS: Record<string, string> = {
  'auth.logout': 'Signed out',
  'auth.password_reset_requested': 'Password reset requested',
  'auth.password_reset_completed': 'Password reset completed',
  'staff.authenticated': 'Staff signed in',
  'staff.dev_authenticated': 'Staff signed in (development)',
  'staff.created': 'Staff member added',
  'staff.updated': 'Staff member edited',
  'staff.disabled': 'Staff member disabled',
  'staff.enabled': 'Staff member enabled',
  'client.authenticated': 'Client signed in',
  'client.updated': 'Client details updated',
  'client.deleted': 'Client archived',
  'client.unarchived': 'Client restored',
  'client.video_preference_updated': 'Video preference updated',
  'client.website_change_requested': 'Website change requested',
  'integration.sheet_created': 'Tracking sheet created',
  'invitation.created': 'Invitation sent',
  'invitation.resent': 'Invitation re-sent',
  'invitation.accepted': 'Invitation accepted',
  'invitation.revoked': 'Invitation cancelled',
  'onboarding.step_updated': 'Onboarding step updated',
  'step.updated': 'Setup step updated',
  'settings.notifications_updated': 'Notification settings updated',
  'team.invite_sent': 'Team member invited',
  'team.invite_revoked': 'Team invite cancelled',
  'team.member_suspended': 'Team member disabled',
  'team.member_unsuspended': 'Team member enabled',
  'team.permissions_updated': 'Team member permissions updated',
  'template.step_updated': 'Master template step edited',
  'template.script_updated': 'Master script edited',
  'tenant.provision': 'Client portal created',
  'tenant.provisioned': 'Client portal created',
  'tenant.archived': 'Client archived',
  'tenant.suspended': 'Client suspended',
  'tenant.unsuspended': 'Client unsuspended',
  'tenant.features_updated': 'Portal modules updated',
  'tenant.profile_updated': 'Client profile updated',
  'user.permissions_updated_by_admin': 'User permissions updated',
  'user.suspended_by_admin': 'User disabled',
  'user.unsuspended_by_admin': 'User enabled',
  'security.staff_login_domain_rejected': 'Blocked: staff sign-in from a non-Motionz email',
};

/** "client_invalid_credentials" / "tenant.features_updated" -> "Client invalid credentials". */
export function titleCaseKey(key: string): string {
  const words = String(key || '')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[._-]+/g, ' ')
    .trim()
    .toLowerCase();
  if (!words) return 'Unknown';
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export function securityEventLabel(eventType: string): string {
  return SECURITY_EVENT_LABELS[eventType] || titleCaseKey(eventType);
}

export function auditActionLabel(action: string): string {
  if (AUDIT_ACTION_LABELS[action]) return AUDIT_ACTION_LABELS[action];
  if (action.startsWith('security.')) return securityEventLabel(action.slice('security.'.length));
  if (action.startsWith('ghl.webhook.')) return `GoHighLevel webhook: ${titleCaseKey(action.slice('ghl.webhook.'.length))}`;
  return titleCaseKey(action);
}

/** Keys whose friendly label contains the search text, so "wrong password" finds *_invalid_credentials. */
export function keysMatchingLabel(labels: Record<string, string>, search: string): string[] {
  const needle = search.trim().toLowerCase();
  if (!needle) return [];
  return Object.keys(labels).filter((key) => labels[key].toLowerCase().includes(needle));
}

const DETAIL_LABELS: Record<string, string> = {
  email: 'Email',
  attemptedEmail: 'Email',
  userEmail: 'Email',
  role: 'Role',
  userRole: 'Role',
  resolvedRole: 'Role',
  currentRole: 'Current role',
  requestedRole: 'Requested role',
  attemptedRole: 'Requested role',
  requiredRoles: 'Allowed roles',
  reason: 'Reason',
  ip: 'IP',
  ipAddress: 'IP',
  ip_address: 'IP',
  emailDelivered: 'Email delivered',
  missingCapability: 'Missing permission',
  changed: 'Changed',
};

/** Shown first, in this order, when present. */
const KEY_FIELDS = ['email', 'attemptedEmail', 'userEmail', 'role', 'userRole', 'resolvedRole', 'requestedRole', 'reason', 'ip', 'ipAddress', 'ip_address'];
/** Already shown elsewhere on the row. */
const HIDDEN_FIELDS = new Set(['timestamp']);

export interface DetailChip {
  label: string;
  value: string;
}

function formatDetailValue(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  if (Array.isArray(value)) {
    const simple = value.filter((v) => typeof v === 'string' || typeof v === 'number');
    return simple.length === value.length && simple.length > 0 ? simple.join(', ') : null;
  }
  return null;
}

/**
 * Turns a details object into "Label: value" chips. Key fields (email, role, reason, IP) come first;
 * nested objects are left to the raw view.
 */
export function detailChips(details: Record<string, unknown> | null | undefined, extra?: { ip?: string | null }, max = 6): DetailChip[] {
  const chips: DetailChip[] = [];
  const seen = new Set<string>();
  const push = (key: string, value: unknown) => {
    const text = formatDetailValue(value);
    if (text === null) return;
    const label = DETAIL_LABELS[key] || titleCaseKey(key);
    const signature = `${label}:${text}`;
    if (seen.has(signature)) return;
    seen.add(signature);
    chips.push({ label, value: text.length > 120 ? `${text.slice(0, 117)}...` : text });
  };

  const source = details && typeof details === 'object' ? details : {};
  for (const key of KEY_FIELDS) if (key in source) push(key, source[key]);
  if (extra?.ip) push('ip', extra.ip);
  for (const key of Object.keys(source)) {
    if (KEY_FIELDS.includes(key) || HIDDEN_FIELDS.has(key)) continue;
    if (key === 'changed' && Array.isArray(source[key])) {
      push(key, (source[key] as unknown[]).map((v) => titleCaseKey(String(v)).toLowerCase()));
      continue;
    }
    push(key, source[key]);
  }
  return chips.slice(0, max);
}
