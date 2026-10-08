/**
 * Plain-English labels for security events and audit-log actions.
 * Shared by the admin log pages (display) and /api/admin/logs (searching by label).
 */
import { formatDateTime } from './format';
import { ADMIN_ROLE_LABEL } from '../account/role-labels';

export const SECURITY_EVENT_LABELS: Record<string, string> = {
  auth_logout: 'Signed out',
  staff_login_success: 'Staff signed in',
  staff_invalid_credentials: 'Wrong password (staff)',
  staff_unregistered_email_attempt: 'Staff sign-in with an unknown email',
  staff_privilege_escalation_attempt: 'Blocked: CSM Manager access requested without approval',
  unauthorized_staff_domain_access: 'Blocked: staff sign-in from a non-Motionz email',
  staff_login_code_sent: 'Sign-in code emailed (staff)',
  staff_login_code_verified: 'Sign-in code accepted (staff)',
  staff_login_code_failed: 'Wrong or expired sign-in code (staff)',
  staff_login_code_delivery_failed: 'Sign-in code email could not be sent (staff)',
  failed_login: 'Sign-in failed',
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
  client_delete_incomplete: 'Client delete did not finish (needs attention)',
  ghl_webhook_invalid_secret: 'Blocked: GoHighLevel message with a wrong or missing secret',
};

export const AUDIT_ACTION_LABELS: Record<string, string> = {
  'auth.logout': 'Signed out',
  'auth.password_reset_requested': 'Password reset requested',
  'auth.password_reset_completed': 'Password reset completed',
  'account.profile_updated': 'Own name or phone updated (My profile)',
  'account.avatar_updated': 'Profile picture updated',
  'account.avatar_removed': 'Profile picture removed',
  'staff.authenticated': 'Staff signed in',
  'staff.dev_authenticated': 'Staff signed in (development)',
  'staff.login_code_verified': 'Staff signed in with an emailed code',
  'staff.default_calendar_changed': 'Default booking calendar changed',
  'staff.created': 'Staff member added',
  'staff.updated': 'Staff member edited',
  'staff.disabled': 'Staff member disabled',
  'staff.enabled': 'Staff member enabled',
  'staff.deleted': 'Staff member deleted',
  'client.authenticated': 'Client signed in',
  'client.updated': 'Client details updated',
  'client.deleted': 'Client archived',
  'client.unarchived': 'Client restored',
  'client.script_picks_updated': 'Video script choices updated',
  'client.video_preference_updated': 'Video preference updated',
  'client.website_change_requested': 'Website change requested',
  'contract.added': 'Contract attached',
  'contract.removed': 'Contract removed',
  'integration.sheet_created': 'Tracking sheet created',
  'drive.access_synced': 'Google Drive access updated',
  'ghl.webhook.lead': 'New lead received from GoHighLevel',
  'ghl.webhook.lead_removed': 'Lead removed (marked lost in GoHighLevel)',
  'ghl.webhook.csm_call': 'Call booking received from GoHighLevel',
  'ghl.webhook.onboarding_form': 'Onboarding form received from GoHighLevel',
  'ghl.webhook.unknown': 'Unrecognised message from GoHighLevel',
  'ghl.webhook.ignored': 'GoHighLevel event ignored',
  'ghl.webhook.rejected': 'GoHighLevel event rejected',
  'invitation.created': 'Invitation sent',
  'invitation.resent': 'Invitation re-sent',
  'invitation.accepted': 'Invitation accepted',
  'invitation.revoked': 'Invitation cancelled',
  'onboarding.step_updated': 'Onboarding step updated',
  'onboarding.form_submitted': 'Onboarding form sent from the portal',
  'lead_request.submitted': 'Lead form sent from the portal',
  'lead_request.status_changed': 'Lead request marked done or reopened',
  'lead_request.outcome_changed': 'Lead request outcome changed by staff',
  'lead_request.webhook_failed': 'Lead form could not be sent to the automation link',
  'lead_request.slack_failed': 'Lead form could not be posted to Slack',
  'step.updated': 'Setup step updated',
  'settings.notifications_updated': 'Notification settings updated',
  'settings.forms_updated': 'GoHighLevel form links updated',
  'settings.security_updated': 'Staff sign-in security updated',
  'settings.automation_updated': 'Automation link updated',
  'settings.slack_updated': 'Slack webhook link updated',
  'settings.leads_updated': 'Lead rule updated (when a contact counts as a lead)',
  'team.invite_sent': 'Team member invited',
  'team.invite_revoked': 'Team invite cancelled',
  'team.member_suspended': 'Team member disabled',
  'team.member_unsuspended': 'Team member enabled',
  'team.permissions_updated': 'Team member permissions updated',
  'template.step_updated': 'Standard setup step edited',
  'template.script_updated': 'Video script edited',
  'template.script_created': 'Video script added',
  'template.script_deleted': 'Video script deleted',
  'training.lesson_finished': 'Training lesson finished',
  'training.lesson_created': 'Training lesson added',
  'training.lesson_updated': 'Training lesson edited',
  'training.lesson_deleted': 'Training lesson deleted',
  'training.lesson_reordered': 'Training lessons reordered',
  'training.settings_updated': 'Training requirement for CSMs changed',
  'training.progress_reset': "CSM's training progress reset",
  'training.exemption_changed': 'CSM training exemption changed',
  'tenant.provision': 'Client portal created',
  'tenant.provisioned': 'Client portal created',
  'tenant.archived': 'Client archived',
  'tenant.deleted_permanently': 'Client deleted permanently',
  'tenant.suspended': 'Client suspended',
  'tenant.unsuspended': 'Client reactivated',
  'tenant.features_updated': 'Portal modules updated',
  'tenant.profile_updated': 'Client profile updated',
  'user.permissions_updated_by_admin': 'Team member permissions updated by Motionz',
  'user.suspended_by_admin': 'Team member disabled by Motionz',
  'user.unsuspended_by_admin': 'Team member enabled by Motionz',
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

/** Short words that stay as written inside a Title Case label. */
const UPPERCASE_WORDS: Record<string, string> = { id: 'ID', url: 'URL', dba: 'DBA', ein: 'EIN', csm: 'CSM', ghl: 'GHL', sms: 'SMS' };

/**
 * A friendly label for a form field name: "email" -> "Email", "full_name" -> "Full Name",
 * "businessPhone" -> "Business Phone". Names that already read as a label
 * ("DBA Business Name", "What is your website?") are returned unchanged.
 */
export function fieldLabel(key: string): string {
  const raw = String(key ?? '').trim();
  if (!raw) return 'Unknown';
  const looksLikeKey = /^[a-z0-9]+([_.-][a-z0-9]+)*$/.test(raw) || /^[a-z][a-z0-9]*([A-Z][a-z0-9]*)+$/.test(raw);
  if (!looksLikeKey) return raw;
  return raw
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .split(/[\s._-]+/)
    .filter(Boolean)
    .map((word) => UPPERCASE_WORDS[word.toLowerCase()] || word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

export function securityEventLabel(eventType: string): string {
  return SECURITY_EVENT_LABELS[eventType] || titleCaseKey(eventType);
}

/** Pass the entry's details so an ignored or rejected GoHighLevel event shows why it was not stored. */
export function auditActionLabel(action: string, details?: Record<string, unknown> | null): string {
  if (action === 'ghl.webhook.ignored' || action === 'ghl.webhook.rejected') {
    const reason = typeof details?.reason === 'string' ? details.reason.trim() : '';
    return reason ? `${AUDIT_ACTION_LABELS[action]}: ${reason}` : AUDIT_ACTION_LABELS[action];
  }
  if (action === 'ghl.webhook.lead_removed' && details?.reason === 'tag removed') return 'Lead removed (tag taken off in GoHighLevel)';
  if (AUDIT_ACTION_LABELS[action]) return AUDIT_ACTION_LABELS[action];
  if (action.startsWith('security.')) return securityEventLabel(action.slice('security.'.length));
  if (action.startsWith('ghl.webhook.')) return `Message from GoHighLevel: ${titleCaseKey(action.slice('ghl.webhook.'.length)).toLowerCase()}`;
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
  eventType: 'Event',
  location: 'Location ID',
  required_tag: 'Lead tag',
  previous_tag: 'Lead tag before',
  start_time: 'Booked for',
  emailDelivered: 'Email delivered',
  missingCapability: 'Missing permission',
  changed: 'Changed',
  title: 'Title',
  allowed_modules: 'Allowed sections',
  client: 'Client',
  clientEmail: 'Client email',
  statusBefore: 'Status before',
  people: 'People removed',
  leads: 'Leads removed',
  leadRequests: 'Lead requests removed',
  cascadedMembersDisabled: 'Team members locked out',
  unlockedMembersCount: 'Team members unlocked',
  revokedBy: 'Cancelled by',
  createdBy: 'Sent by',
  stepKey: 'Step',
  step_key: 'Step',
  status: 'Status',
  ok: 'Worked',
  error: 'Problem',
  expiresAt: 'Expires',
  expires_at: 'Expires',
};

/** Plain names for the roles stored in the database. */
const ROLE_LABELS: Record<string, string> = {
  admin: ADMIN_ROLE_LABEL,
  csm: 'CSM',
  client: 'Account owner',
  client_member: 'Team member',
  system: 'System',
};

/** "client_member" -> "Team member". Unknown values become readable words, never raw keys. */
export function roleLabel(role: string | null | undefined): string {
  if (!role) return 'Unknown';
  return ROLE_LABELS[role] || titleCaseKey(role);
}

const ROLE_FIELDS = new Set(['role', 'userRole', 'resolvedRole', 'currentRole', 'requestedRole', 'attemptedRole', 'requiredRoles']);
/** Fields whose values are internal keys ("pain_point", "google_sheet"): shown as words ("Pain point"). */
/** The setup steps, by the names clients see. */
const STEP_NAMES: Record<string, string> = {
  google_sheet: 'Google Sheet',
  ghl_a2p: 'GoHighLevel / A2P Verified',
  domain_web: 'Domain, email & website',
  phone_system: 'Phone system & A2P texting',
};

const WORD_VALUE_FIELDS = new Set(['category', 'step_key', 'stepKey', 'allowed_modules', 'video_preference', 'staff_login_code']);

/** Shown first, in this order, when present. */
const KEY_FIELDS = ['email', 'attemptedEmail', 'userEmail', 'role', 'userRole', 'resolvedRole', 'requestedRole', 'reason', 'ip', 'ipAddress', 'ip_address'];
/** Already shown elsewhere on the row, or internal-only (still available under "Show raw"). */
const HIDDEN_FIELDS = new Set(['timestamp', 'mode', 'event', 'authMode']);

/** Database ids mean nothing to a reader: "invitationId", "invitation_id", "resourceId", "id". */
const ID_KEY = /(^id$|[a-z]Ids?$|_ids?$)/;
const UUID_VALUE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** "2026-10-07T11:05:03.921Z" and friends. */
const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?$/;

function isInternalDetail(key: string, value: unknown): boolean {
  if (HIDDEN_FIELDS.has(key) || ID_KEY.test(key)) return true;
  return typeof value === 'string' && UUID_VALUE.test(value.trim());
}

export interface DetailChip {
  label: string;
  value: string;
}

function formatDetailValue(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  // Timestamps are shown the same way as every other date in the portal.
  if (typeof value === 'string' && ISO_TIMESTAMP.test(value.trim())) return formatDateTime(value.trim()) || value;
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  if (Array.isArray(value)) {
    const simple = value.filter((v) => typeof v === 'string' || typeof v === 'number');
    return simple.length === value.length && simple.length > 0 ? simple.join(', ') : null;
  }
  return null;
}

/**
 * Turns a details object into "Label: value" chips. Key fields (email, role, reason, IP) come first;
 * nested objects, internal values (mode) and raw ids are left to the raw view.
 */
export function detailChips(details: Record<string, unknown> | null | undefined, extra?: { ip?: string | null }, max = 6): DetailChip[] {
  const chips: DetailChip[] = [];
  const seen = new Set<string>();
  const push = (key: string, rawValue: unknown) => {
    if (isInternalDetail(key, rawValue)) return;
    const value = ROLE_FIELDS.has(key)
      ? Array.isArray(rawValue)
        ? rawValue.map((v) => roleLabel(String(v)))
        : typeof rawValue === 'string'
          ? roleLabel(rawValue)
          : rawValue
      : WORD_VALUE_FIELDS.has(key)
        ? Array.isArray(rawValue)
          ? rawValue.map((v) => titleCaseKey(String(v)))
          : typeof rawValue === 'string'
            ? ((key === 'step_key' || key === 'stepKey') && STEP_NAMES[rawValue]) || titleCaseKey(rawValue)
            : rawValue
        : rawValue;
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
