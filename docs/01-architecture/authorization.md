# Phase 02: Production Authorization & RBAC Architecture

This document defines the authorization model, role-based access control (RBAC), and multi-tenant isolation mechanisms implemented in the Motionz Onboarding Portal.

---

## 1. Confirmed Role Model & Scope

The platform defines exactly four verified user roles:

| Role | Classification | Tenant Scope | Route Access | Responsibilities |
| :--- | :--- | :--- | :--- | :--- |
| **`admin`** | Internal Motionz Staff | Global Multi-Tenant | `/admin/*`, `/csm/*`, `/portal/*` | Platform supervision, template management, portal creation/deletion, staff provisioning, feature flag management. |
| **`csm`** | Internal Motionz Staff | Assigned Tenants | `/csm/*`, `/portal/*` | Onboarding guidance, milestone status override, conversational copy updates, client review. |
| **`client`** | External Organization Owner | Single Tenant (`tenant_id`) | `/portal/[clientId]/*` | Onboarding completion, team invitations, contract review, GHL lead inspection, company profile management. |
| **`client_member`** | External Organization Member | Single Tenant (`tenant_id`) | `/portal/[clientId]/*` (Restricted) | Operational tool usage (roof measurement), lead view, assigned quiz completion. Strictly prohibited from inviting members or editing company profile. |

- **[CONFIRMED]** External users cannot become `admin` or `csm`.
- **[CONFIRMED]** Clients and client members cannot access `/admin` or `/csm` or peer client portals.
- **[CONFIRMED]** CSMs cannot execute Admin-only capabilities (e.g. portal deletion, feature flag toggles).

---

## 2. Multi-Layer Guard Enforcement Pipeline

Authorization is enforced at three synchronized architectural layers:

```
Incoming Request
      ↓
[Layer 1: Next.js Edge Middleware]
  • Route prefix checks: `/admin/*`, `/csm/*`, `/portal/*`
  • API route prefix checks: `/api/admin/*`, `/api/csm/*`, `/api/portal/*`
  • Fast HMAC session signature validation
  • 401 Unauthenticated / 403 Forbidden / Redirect to Login
      ↓
[Layer 2: Server-Side API & Action Guard (`requireAuth`)]
  • Independent server-side cryptographic session verification
  • Typed capability guard (`hasPermission(role, capability)`)
  • Tenant boundary assertion (`assertTenantAccess(session, targetTenantId)`)
  • Security event emission on unauthorized access probes
      ↓
[Layer 3: PostgreSQL Database Row-Level Security (RLS)]
  • Enforced at the database engine via authenticated user JWT (`auth.uid()`)
  • Subquery filters against `public.users.tenant_id` and `public.users.role`
  • Zero cross-tenant data leakage even under raw queries
```

---

## 3. Centralized Capability Matrix

Implemented in `src/lib/auth/permissions.ts`:

| Capability | Admin | CSM | Client | Client Member | Description |
| :--- | :---: | :---: | :---: | :---: | :--- |
| `platform:analytics` | ✅ | ❌ | ❌ | ❌ | Inspect platform cross-client metrics |
| `platform:integrations` | ✅ | ❌ | ❌ | ❌ | Manage global GHL/Sheets credentials |
| `platform:manage_staff` | ✅ | ❌ | ❌ | ❌ | Provision and manage staff users |
| `portal:create` | ✅ | ❌ | ❌ | ❌ | Provision new client portals |
| `portal:delete` | ✅ | ❌ | ❌ | ❌ | Permanently delete/archive client portals |
| `portal:feature_toggle` | ✅ | ❌ | ❌ | ❌ | Modify per-tenant feature modules |
| `portal:assign_csm` | ✅ | ❌ | ❌ | ❌ | Assign CSMs to client portals |
| `onboarding:edit_content` | ✅ | ✅ | ❌ | ❌ | Edit onboarding copy and guidance |
| `onboarding:update_status` | ✅ | ✅ | ❌ | ❌ | Override setup step status (`done`, `in_progress`) |
| `onboarding:view_guidance` | ✅ | ✅ | ✅ | ✅ | View onboarding roadmap and guidance |
| `onboarding:submit_form` | ✅ | ✅ | ✅ | ✅ | Submit onboarding forms |
| `client:view_contract` | ✅ | ✅ | ✅ | ❌ | View executed contracts |
| `client:view_leads` | ✅ | ✅ | ✅ | ✅ | View GHL leads and appointments |
| `client:use_tools` | ✅ | ✅ | ✅ | ✅ | Access roof measurement and operational tools |
| `client:use_roof_measurement` | ✅ | ✅ | ✅ | ✅ | Perform satellite roof measurements |
| `client:video_preference` | ✅ | ✅ | ✅ | ❌ | Select AI avatar vs self-filmed video |
| `client:view_scripts` | ✅ | ✅ | ✅ | ✅ | Review generated video scripts |
| `client:book_call` | ✅ | ✅ | ✅ | ✅ | Schedule strategic onboarding calls |
| `team:invite` | ✅ | ❌ | ✅ | ❌ | Invite organizational team members |
| `team:remove` | ✅ | ❌ | ✅ | ❌ | Remove team members |
| `profile:update` | ✅ | ✅ | ✅ | ❌ | Update primary company profile |

---

## 4. Decision Log

| Decision Item | Status | Summary |
| :--- | :---: | :--- |
| 4-Role Hierarchy | **CONFIRMED** | `admin`, `csm`, `client`, `client_member` strictly defined. |
| Server-Side Route Guarding | **CONFIRMED** | Both middleware and route handler `requireAuth` enforce checks. |
| Tenant Resolution | **CONFIRMED** | Always resolved from verified session; never from URL or body parameters. |
| Client Member Owner-Only Limits | **CONFIRMED** | Team invites and company profile updates blocked for client members. |
| CSM Destructive Action Limits | **CONFIRMED** | Portal deletion and feature toggle manipulation blocked for CSMs. |
