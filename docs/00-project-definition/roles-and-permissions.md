# Roles, Actors and Permission Matrix

## 1. System Actors

### 1.1. Role Definitions

#### 1. Admin (Internal Motionz Staff)
- Access Domain: Restricted to verified @motionz.ai accounts.
- Scope: Full platform-wide access across all tenants, users, and system infrastructure.
- Responsibilities: Creates client companies, creates/duplicates/deletes client portals, assigns CSMs, manages users, configures client portal features, enables/disables features for individual clients, manages master portal template, reviews login/security activity, configures integrations, manages platform-wide settings.

#### 2. CSM (Customer Success Manager - Internal Motionz Staff)
- Access Domain: Restricted to verified @motionz.ai accounts.
- Scope: Assigned or permitted client portals.
- Responsibilities: Views client portals, edits client portal content, edits onboarding/setup step content, updates setup statuses, updates explanatory text, updates links, guides clients through setup, reviews client-provided information, supports clients.
- Restrictions: Cannot delete portals, cannot change admin-only settings, cannot change admin-only feature toggles.

#### 3. Client (Motionz Client Company Owner)
- Access Domain: External company or personal business email via verified single-use expiring magic link.
- Scope: Strictly isolated to their own organizational portal (e.g. ABC Roofing).
- Responsibilities: Completes embedded onboarding form, views setup progress, views leads and appointments, views live tracking sheets, views signed contract, accesses tools, accesses Slack and Skool, books CSM calls, uses roof measurement tool, views video scripts, selects AI video vs self-filmed preference, edits permitted profile information, invites and manages client team members.
- Restrictions: Cannot view any other client portal, cannot change admin feature toggles, cannot delete portal, cannot change admin settings, cannot manage the platform.

#### 4. Client Member (Invited Client Team Member)
- Access Domain: External email invited by the client company owner.
- Scope: Strictly isolated to their employer's portal.
- Responsibilities: Accesses permitted client-visible modules (setup progress, leads, tracking, tools, booking).
- Restrictions: Cannot access another tenant, cannot access Motionz Admin or CSM workspace, cannot delete the portal, cannot change global or tenant settings, cannot manage team members unless delegated.

## 2. Granular Permission Matrix

| Capability / Action | Admin | CSM | Client Owner | Client Member |
| :--- | :---: | :---: | :---: | :---: |
| Platform Analytics and System Health | YES | NO | NO | NO |
| Manage System Integrations and Keys | YES | NO | NO | NO |
| Inspect Security and Audit Logs | YES | NO | NO | NO |
| Manage Internal Staff Roles | YES | NO | NO | NO |
| Create and Edit Master Portal Templates | YES | NO | NO | NO |
| Create Client Company and Portal | YES | NO | NO | NO |
| Delete Client Portal | YES | NO | NO | NO |
| Toggle Feature Modules per Client | YES | NO | NO | NO |
| Assign CSM to Client Portal | YES | NO | NO | NO |
| Edit Step Content, Titles and Unlock Text | YES | YES | NO | NO |
| Update Step Status (Done, In Progress, Not Started) | YES | YES | NO | NO |
| View Setup Guidance and Checklists | YES | YES | YES | YES |
| Submit Onboarding Form | YES | YES | YES | YES |
| View Signed Contract | YES | YES | YES | OPTIONAL |
| View Performance Leads and Tracking Sheet | YES | YES | YES | YES |
| Use Roof Measurement Tool | YES | YES | YES | YES |
| Select Video Production Preference | YES | YES | YES | NO |
| View and Access Video Scripts | YES | YES | YES | YES |
| Book CSM Strategy Call | YES | YES | YES | YES |
| Invite Client Team Members | YES | YES | YES | NO |
| Remove Client Team Members | YES | YES | YES | NO |
| Update Permitted Company Profile | YES | YES | YES | NO |
