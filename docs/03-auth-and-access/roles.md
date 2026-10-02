# Phase 02: System Roles & Operational Boundaries

This document defines the four core platform roles, their operational boundaries, and account provisioning workflows.

---

## 1. Confirmed Roles & Operational Boundaries

### 1.1. `admin` (Motionz Platform Administrator)
- **Classification**: Internal Motionz Staff.
- **Email Mandate**: Strictly verified `@motionz.ai` domain.
- **Scope**: Unrestricted global multi-tenant access.
- **Key Responsibilities**:
  - Provision, duplicate, update, and delete client portals.
  - Create and modify Master Portal Templates.
  - Manage internal staff accounts (Admins and CSMs).
  - Enable or disable feature modules globally or per tenant.
  - Inspect global cross-client analytics, churn metrics, and revenue figures.
  - Inspect immutable security and audit logs.
  - Supervise external integrations (GoHighLevel, Google Sheets, Slack).
- **Enforcement**: Routes under `/admin/*` and `/api/admin/*` require `session.role === 'admin'`.

### 1.2. `csm` (Customer Success Manager)
- **Classification**: Internal Motionz Staff.
- **Email Mandate**: Strictly verified `@motionz.ai` domain.
- **Scope**: Assigned client portal tenants (`csm_assignments`).
- **Key Responsibilities**:
  - Guide assigned clients through the onboarding journey.
  - Edit onboarding step descriptions, status overrides, and client-facing guidance.
  - Review submitted onboarding forms, website change requests, and quiz submissions.
  - Facilitate strategic onboarding calls.
- **Strict Restrictions**:
  - Cannot delete or archive client portals (`portal:delete` denied).
  - Cannot alter feature flag definitions (`portal:feature_toggle` denied).
  - Cannot view platform-wide analytics or administrative logs.
- **Enforcement**: Routes under `/csm/*` and `/api/csm/*` require `session.role in ('csm', 'admin')`.

### 1.3. `client` (Client Organization Owner / Primary Admin)
- **Classification**: External Organization User.
- **Email Mandate**: Any verified business or personal domain (`@abcroofing.com`, `@gmail.com`).
- **Scope**: Strictly quarantined to their own organizational portal (`tenant_id`).
- **Key Responsibilities**:
  - Complete onboarding milestones and required forms.
  - Review signed dealer contracts and LLC official filings.
  - Monitor live GoHighLevel leads, appointments, and pipeline revenue.
  - Communicate with leads using the in-portal SMS conversation composer.
  - Utilize operational utilities: Roof Measurement, Brand Kit, Marketing Assets, AI Assistant, and Call Practice.
  - Select video production preferences (AI avatar vs self-filmed) and review scripts.
  - Invite and manage team members within their own organization.
- **Strict Restrictions**: Zero visibility into peer client tenants or administrative functions (`/admin`, `/csm`).

### 1.4. `client_member` (Client Team Member)
- **Classification**: External Organization User.
- **Email Mandate**: Any verified business or personal domain.
- **Scope**: Strictly quarantined to their employer's organizational portal (`tenant_id`).
- **Invitation Mandate**: Invited with **ONLY Email and Phone Number**. No extra required fields.
- **Key Responsibilities**:
  - View operational tracking sheets, lead activity, and training lessons.
  - Access permitted operational tools (Roof Measure, Call Practice).
  - Review scripts and book onboarding calls.
- **Strict Restrictions**:
  - Cannot invite or remove fellow team members (`team:invite`, `team:remove` denied).
  - Cannot modify primary company profile, address, or phone (`profile:update` denied).
  - Cannot alter video preferences (`client:video_preference` denied).
  - Cannot access `/admin`, `/csm`, or peer client portals.

---

## 2. Decision Log

| Decision Item | Status | Summary |
| :--- | :---: | :--- |
| Role Model (4 Roles) | **CONFIRMED** | `admin`, `csm`, `client`, `client_member`. |
| Staff Domain Isolation | **CONFIRMED** | `@motionz.ai` enforced on server; external domains rejected. |
| Role Self-Elevation Defense | **CONFIRMED** | Role derived strictly from server-side database user record. |
| Client Member Invite Schema | **CONFIRMED** | Strictly email + phone number. |
| Cross-Tenant Defense | **CONFIRMED** | Server guards and database RLS prevent horizontal escalation. |
