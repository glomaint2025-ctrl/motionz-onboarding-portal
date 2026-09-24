# Phase 3: System Roles & Operational Boundaries

This document defines the four core platform roles, their operational boundaries, and account provisioning workflows.

---

## 1. Role Specifications

### 1.1. `admin` (Motionz Platform Administrator)
- **Scope**: Unrestricted global multi-tenant access.
- **Key Responsibilities**:
  - Provision, duplicate, update, and delete client portals.
  - Create and modify Master Portal Templates.
  - Manage internal staff accounts (Admins and CSMs).
  - Enable or disable feature modules globally or per tenant.
  - Inspect global cross-client analytics, churn metrics, and revenue figures.
  - Inspect immutable security and audit logs.
  - Supervise external integrations (GoHighLevel, Google Sheets, Slack).
- **Security Mandates**: Verified `@motionz.ai` domain; mandatory 2FA.

### 1.2. `csm` (Customer Success Manager)
- **Scope**: Assigned client portal tenants.
- **Key Responsibilities**:
  - Guide assigned clients through the onboarding journey.
  - Edit onboarding step descriptions, status overrides, and client-facing guidance.
  - Review submitted onboarding forms, website change requests, and quiz submissions.
  - Facilitate strategic onboarding calls.
- **Restrictions**:
  - Cannot delete or archive client portals.
  - Cannot alter global Master Portal Templates or feature flag definitions.
  - Cannot view platform-wide financial figures or unassigned client records.
- **Security Mandates**: Verified `@motionz.ai` domain; mandatory 2FA.

### 1.3. `client` (Client Organization Owner / Primary Admin)
- **Scope**: Strictly quarantined to their own organizational portal (`tenant_id`).
- **Key Responsibilities**:
  - Complete onboarding milestones and required forms.
  - Review signed dealer contracts and LLC official filings.
  - Monitor live GoHighLevel leads, appointments, and pipeline revenue.
  - Communicate with leads using the in-portal SMS conversation composer.
  - Utilize operational utilities: Roof Measurement, Brand Kit, Marketing Assets, AI Assistant, and Call Practice.
  - Select video production preferences (AI avatar vs self-filmed) and review scripts.
  - Invite and manage team members within their own organization.
- **Restrictions**: Zero visibility into peer client tenants or administrative functions.

### 1.4. `client_member` (Client Team Member)
- **Scope**: Strictly quarantined to their employer's organizational portal.
- **Key Responsibilities**:
  - View operational tracking sheets, lead activity, and training lessons.
  - Submit delegated forms and complete individual certification quizzes.
  - Access permitted operational tools (Roof Measure, Call Practice).
- **Restrictions**:
  - Cannot invite or remove fellow team members.
  - Cannot modify primary company profile, address, or banking/payment details.
  - Cannot trigger administrative billing or delete company assets.

---

## 2. Administrative Impersonation ("View As Client")

To assist clients with technical troubleshooting, Admins and CSMs may use the **View-As Mode**:
- **Audit Requirement**: Initiating View-As requires logging an explicit audit entry: `impersonation.started` with `actor_id` and `target_tenant_id`.
- **Visual Indicator**: The UI displays a persistent top banner: `"⚠️ Viewing as Apex Roofing (Stephen Cuccia). Read-Only Mode Active."`
- **Write Prevention**: In View-As mode, destructive actions (e.g. signing a contract, deleting team members) are disabled.
