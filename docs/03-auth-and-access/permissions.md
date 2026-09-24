# Phase 3: Permissions & Capability Engine

This document defines the capability token dictionary, programmatic permission guards, and the mapping of roles to permissions.

---

## 1. Capability Permission Token Dictionary

```typescript
export type PermissionToken =
  // Platform & Multi-Tenant Administration
  | 'platform:view_analytics'
  | 'platform:manage_integrations'
  | 'platform:view_audit_logs'
  | 'platform:manage_staff'
  
  // Portal & Template Operations
  | 'template:create'
  | 'template:edit'
  | 'portal:provision'
  | 'portal:duplicate'
  | 'portal:delete'
  | 'portal:toggle_features'
  | 'portal:assign_csm'
  | 'portal:impersonate'
  
  // Onboarding Management
  | 'onboarding:edit_step_content'
  | 'onboarding:override_status'
  | 'onboarding:submit_forms'
  
  // Client Features & Tools
  | 'contracts:view'
  | 'contracts:download'
  | 'contracts:upload'
  | 'leads:view'
  | 'leads:send_sms'
  | 'tools:roof_measure'
  | 'tools:brand_studio'
  | 'tools:sales_coach'
  | 'tools:call_practice'
  | 'ai:crm_execute'
  | 'video:select_preference'
  | 'video:manage_scripts'
  
  // Organization Administration
  | 'team:invite'
  | 'team:remove'
  | 'profile:update_company';
```

---

## 2. Role-to-Permission Mapping Matrix

| Permission Token | Admin | CSM | Client | Client Member |
| :--- | :---: | :---: | :---: | :---: |
| `platform:view_analytics` | ✅ | ❌ | ❌ | ❌ |
| `platform:manage_integrations` | ✅ | ❌ | ❌ | ❌ |
| `platform:view_audit_logs` | ✅ | ❌ | ❌ | ❌ |
| `platform:manage_staff` | ✅ | ❌ | ❌ | ❌ |
| `template:create` / `template:edit` | ✅ | ❌ | ❌ | ❌ |
| `portal:provision` / `portal:duplicate`| ✅ | ✅ | ❌ | ❌ |
| `portal:delete` | ✅ | ❌ | ❌ | ❌ |
| `portal:toggle_features` | ✅ | ❌ | ❌ | ❌ |
| `portal:assign_csm` | ✅ | ✅ | ❌ | ❌ |
| `portal:impersonate` | ✅ | ✅ | ❌ | ❌ |
| `onboarding:edit_step_content` | ✅ | ✅ | ❌ | ❌ |
| `onboarding:override_status` | ✅ | ✅ | ❌ | ❌ |
| `onboarding:submit_forms` | ✅ | ✅ | ✅ | ✅ |
| `contracts:view` / `contracts:download`| ✅ | ✅ | ✅ | ⚠️ (Optional toggle) |
| `contracts:upload` | ✅ | ✅ | ❌ | ❌ |
| `leads:view` | ✅ | ✅ | ✅ | ✅ |
| `leads:send_sms` | ✅ | ✅ | ✅ | ✅ |
| `tools:roof_measure` | ✅ | ✅ | ✅ | ✅ |
| `tools:brand_studio` | ✅ | ✅ | ✅ | ✅ |
| `tools:sales_coach` | ✅ | ✅ | ✅ | ✅ |
| `tools:call_practice` | ✅ | ✅ | ✅ | ✅ |
| `ai:crm_execute` | ✅ | ✅ | ✅ | ❌ |
| `video:select_preference` | ✅ | ✅ | ✅ | ❌ |
| `video:manage_scripts` | ✅ | ✅ | ✅ | ✅ |
| `team:invite` / `team:remove` | ✅ | ✅ | ✅ | ❌ |
| `profile:update_company` | ✅ | ✅ | ✅ | ❌ |

---

## 3. Programmatic Permission Helper

```typescript
export function hasPermission(role: UserRole, permission: PermissionToken): boolean {
  const rolePermissions = ROLE_PERMISSIONS_MAP[role];
  return rolePermissions ? rolePermissions.includes(permission) : false;
}

export function assertPermission(role: UserRole, permission: PermissionToken): void {
  if (!hasPermission(role, permission)) {
    throw new AuthorizationError(`Forbidden: Role '${role}' lacks capability '${permission}'`);
  }
}
```
