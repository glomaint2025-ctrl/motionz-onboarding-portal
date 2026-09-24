# Phase 0: Open Questions and Architecture Decisions

This document tracks unresolved requirements, architectural trade-offs, and confirmed decisions.

## 1. Resolved Decisions from Master Baseline

### DECISION-01: User Access Domain Restriction and Client Portal Access
- Resolution: Internal Motionz staff (Admin and CSM) are restricted to verified @motionz.ai accounts. External clients and client members authenticate using their company or personal email via secure, expiring single-use magic links.
- Status: RESOLVED

### DECISION-02: Permanent URL Access Keys
- Resolution: Permanent access keys (?id=...&k=...) are strictly prohibited. Client invitations use single-use, time-expiring (e.g. 72 hours), revocable magic link tokens that establish an authenticated session cookie upon activation.
- Status: RESOLVED

### DECISION-03: Scope of Artificial Intelligence
- Resolution: Conversational AI assistants, Voice AI, homeowner roleplay call simulations, Sales Coach, generative video creation, and dynamic AI script generation are strictly OUT OF SCOPE. Video scripts use template variable replacement ({{client_name}}, {{company_name}}), and the "AI Video" option is a client production workflow preference only.
- Status: RESOLVED

### DECISION-04: Onboarding Workflow
- Resolution: Onboarding is not an administrative document verification/rejection approval pipeline. It consists of five confirmed setup steps where the client provides information via the embedded GoHighLevel form and Motionz/CSM performs the setup work and updates step statuses (Not Started, In Progress, Done).
- Status: RESOLVED

## 2. Active Open Decisions

### OQ-01: Google Sheets 1 vs Sheet 2 Business Semantics
- Context: Two Google Sheets links are supplied in project materials, but their specific data schemas and business purposes are not explicitly defined.
- Resolution Strategy: Implement configurable spreadsheet ID, sheet/tab name, and column mapping per client tenant in the Admin workspace. Client portal displays data mapped for their tenant.
- Status: OPEN QUESTION (Handled via configurable adapter)

### OQ-02: Upstream Roof Measurement Provider
- Context: Roof measurement provider is not confirmed (Roofr, Google Solar, Esri, or others).
- Resolution Strategy: Build a provider-independent adapter interface. Include address lookup UI, map canvas, pitch selector, and calculation engine. If no API credentials are configured, display a clear setup-required or demo state.
- Status: OPEN QUESTION (Handled via provider abstraction)

### OQ-03: Payment and Membership Provider
- Context: Whop was referenced in legacy materials but is not a confirmed requirement.
- Resolution Strategy: Do not make Whop a required dependency. Maintain an extensible payment interface, keep the payment module behind an admin feature toggle, and keep it inactive until confirmed.
- Status: OPEN QUESTION (Handled via feature toggle)

### OQ-04: Client Portal Domain Mapping
- Context: Organization portals may live on path routes (/portal/[clientId]) or vanity subdomains.
- Resolution Strategy: Default to path routes (/portal/[clientId]) with tenant scoping validated server-side. Custom domain mapping supported as a future extension.
- Status: OPEN QUESTION (Path routing default implemented)
