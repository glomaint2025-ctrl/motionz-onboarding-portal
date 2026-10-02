# Phase 02: Centralized Capability Engine & Permissions

This document defines the capability dictionary, programmatic guards, and role-to-capability mappings implemented in `src/lib/auth/permissions.ts`.

---

## 1. Capability Token Dictionary

```typescript
export type Capability =
  // Platform & Administration
  | 'platform:analytics'
  | 'platform:integrations'
  | 'platform:audit_logs'
  | 'platform:manage_staff'
  
  // Portal Lifecycle
  | 'portal:create'
  | 'portal:delete'
  | 'portal:feature_toggle'
  | 'portal:assign_csm'
  
  // Onboarding Roadmap
  | 'onboarding:edit_content'
  | 'onboarding:update_status'
  | 'onboarding:view_guidance'
  | 'onboarding:submit_form'
  
  // Client Features & Tools
  | 'client:view_contract'
  | 'client:view_leads'
  | 'client:use_tools'
  | 'client:use_roof_measurement'
  | 'client:video_preference'
  | 'client:view_scripts'
  | 'client:book_call'
  
  // Team & Organization
  | 'team:invite'
  | 'team:remove'
  | 'profile:update';
```

---

## 2. Capability Mapping Matrix

| Capability | Admin | CSM | Client | Client Member | Description |
| :--- | :---: | :---: | :---: | :---: | :--- |
| `platform:analytics` | ✅ | ❌ | ❌ | ❌ | Cross-client executive statistics |
| `platform:integrations` | ✅ | ❌ | ❌ | ❌ | GHL / Google Sheets API configuration |
| `platform:audit_logs` | ✅ | ❌ | ❌ | ❌ | Immutable system security log review |
| `platform:manage_staff` | ✅ | ❌ | ❌ | ❌ | Staff user management |
| `portal:create` | ✅ | ❌ | ❌ | ❌ | Client portal provisioning |
| `portal:delete` | ✅ | ❌ | ❌ | ❌ | Client portal soft-delete / archiving |
| `portal:feature_toggle` | ✅ | ❌ | ❌ | ❌ | Client module enable/disable overrides |
| `portal:assign_csm` | ✅ | ❌ | ❌ | ❌ | Link CSM to client organization |
| `onboarding:edit_content` | ✅ | ✅ | ❌ | ❌ | Update onboarding instructions & copy |
| `onboarding:update_status` | ✅ | ✅ | ❌ | ❌ | Override setup step status |
| `onboarding:view_guidance` | ✅ | ✅ | ✅ | ✅ | View roadmap cards & guidance |
| `onboarding:submit_form` | ✅ | ✅ | ✅ | ✅ | Submit onboarding forms |
| `client:view_contract` | ✅ | ✅ | ✅ | ❌ | Inspect executed agreements & LLC filings |
| `client:view_leads` | ✅ | ✅ | ✅ | ✅ | View GHL live leads & appointments |
| `client:use_tools` | ✅ | ✅ | ✅ | ✅ | Access operational tool suite |
| `client:use_roof_measurement` | ✅ | ✅ | ✅ | ✅ | Satellite roof measurement tool |
| `client:video_preference` | ✅ | ✅ | ✅ | ❌ | AI avatar vs self-filmed video selection |
| `client:view_scripts` | ✅ | ✅ | ✅ | ✅ | Generated video scripts |
| `client:book_call` | ✅ | ✅ | ✅ | ✅ | Strategic onboarding call booking |
| `team:invite` | ✅ | ❌ | ✅ | ❌ | Invite organization team members |
| `team:remove` | ✅ | ❌ | ✅ | ❌ | Remove team members |
| `profile:update` | ✅ | ✅ | ✅ | ❌ | Update primary company profile & contacts |

---

## 3. Programmatic Authorization Helpers

```typescript
// Capability inspection
export const hasPermission = (role: UserRole, capability: Capability): boolean;

// Throws Error if capability is missing
export const assertPermission = (role: UserRole, capability: Capability): void;

// Asserts tenant quarantine boundary (allows staff, isolates clients & members)
export const assertTenantAccess = (
  user: { role: UserRole; tenantId?: string },
  targetTenantId: string
): void;
```

---

## 4. Decision Log

| Decision Item | Status | Summary |
| :--- | :---: | :--- |
| Centralized Permissions Map | **CONFIRMED** | No scattered ad-hoc role comparisons across UI components. |
| Admin-Only Capabilities | **CONFIRMED** | `portal:delete`, `portal:feature_toggle`, `platform:analytics` strictly admin. |
| Client Member Quarantine | **CONFIRMED** | No team invitations, no profile changes, no contract access. |
| Tenant Access Assertion | **CONFIRMED** | Evaluated with normalized UUID resolution (`resolveTenantId`). |
