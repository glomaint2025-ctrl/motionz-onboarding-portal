import { UserRole } from '../db/schema';

export type Capability =
  | 'platform:analytics'
  | 'platform:integrations'
  | 'platform:audit_logs'
  | 'platform:manage_staff'
  | 'portal:create'
  | 'portal:delete'
  | 'portal:feature_toggle'
  | 'portal:assign_csm'
  | 'onboarding:edit_content'
  | 'onboarding:update_status'
  | 'onboarding:view_guidance'
  | 'onboarding:submit_form'
  | 'client:view_contract'
  | 'client:view_leads'
  | 'client:use_tools'
  | 'client:use_roof_measurement'
  | 'client:video_preference'
  | 'client:view_scripts'
  | 'client:book_call'
  | 'team:invite'
  | 'team:remove'
  | 'profile:update';

const ROLE_PERMISSIONS: Record<UserRole, Capability[]> = {
  admin: [
    'platform:analytics',
    'platform:integrations',
    'platform:audit_logs',
    'platform:manage_staff',
    'portal:create',
    'portal:delete',
    'portal:feature_toggle',
    'portal:assign_csm',
    'onboarding:edit_content',
    'onboarding:update_status',
    'onboarding:view_guidance',
    'onboarding:submit_form',
    'client:view_contract',
    'client:view_leads',
    'client:use_tools',
    'client:use_roof_measurement',
    'client:video_preference',
    'client:view_scripts',
    'client:book_call',
    'team:invite',
    'team:remove',
    'profile:update',
  ],
  csm: [
    'onboarding:edit_content',
    'onboarding:update_status',
    'onboarding:view_guidance',
    'onboarding:submit_form',
    'client:view_contract',
    'client:view_leads',
    'client:use_tools',
    'client:use_roof_measurement',
    'client:video_preference',
    'client:view_scripts',
    'client:book_call',
    'team:invite',
    'team:remove',
    'profile:update',
  ],
  client: [
    'onboarding:view_guidance',
    'onboarding:submit_form',
    'client:view_contract',
    'client:view_leads',
    'client:use_tools',
    'client:use_roof_measurement',
    'client:video_preference',
    'client:view_scripts',
    'client:book_call',
    'team:invite',
    'team:remove',
    'profile:update',
  ],
  client_member: [
    'onboarding:view_guidance',
    'onboarding:submit_form',
    'client:view_leads',
    'client:use_tools',
    'client:use_roof_measurement',
    'client:view_scripts',
    'client:book_call',
  ],
};

/**
 * Checks if a given role possesses a specific capability.
 */
export const hasPermission = (role: UserRole, capability: Capability): boolean => {
  const permissions = ROLE_PERMISSIONS[role] || [];
  return permissions.includes(capability);
};

/**
 * Asserts that a role possesses a capability, throwing an Error if denied.
 */
export const assertPermission = (role: UserRole, capability: Capability): void => {
  if (!hasPermission(role, capability)) {
    throw new Error(`Unauthorized: Role '${role}' lacks capability '${capability}'`);
  }
};

import { resolveTenantId } from '../db/supabase-client';

/**
 * Asserts that a user has access to a target tenant ID.
 * Admins and CSMs have access to all client tenants.
 * Clients and Client Members are strictly quarantined to their own tenant_id.
 */
export const assertTenantAccess = (
  user: { role: UserRole; tenantId?: string },
  targetTenantId: string
): void => {
  if (user.role === 'admin' || user.role === 'csm') {
    return; // Internal staff authorized
  }

  const normalizedUserTenant = resolveTenantId(user.tenantId || '');
  const normalizedTargetTenant = resolveTenantId(targetTenantId || '');

  if (!normalizedUserTenant || normalizedUserTenant !== normalizedTargetTenant) {
    throw new Error('Forbidden: Unauthorized cross-tenant access attempt');
  }
};

