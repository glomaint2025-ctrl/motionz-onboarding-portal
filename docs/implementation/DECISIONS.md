# Architecture and Product Decision Records (ADR)

This document records the foundational product and technical decisions established for the Motionz Client Portal implementation.

## Decision Index

| ID | Title | Status | Date |
| :--- | :--- | :--- | :--- |
| ADR-001 | Scope Exclusion of AI Assistant and Realtime Voice AI | ACCEPTED | 2026-09-22 |
| ADR-002 | Template-Based Video Scripts and Workflow-Only Video Preference | ACCEPTED | 2026-09-22 |
| ADR-003 | Hybrid Authentication and Rejection of Permanent URL Keys | ACCEPTED | 2026-09-22 |
| ADR-004 | Confirmed Onboarding Structure and Embedded GHL Form Strategy | ACCEPTED | 2026-09-22 |
| ADR-005 | Provider-Independent Adapter Architecture for Roof Measurement | ACCEPTED | 2026-09-22 |
| ADR-006 | Payment Module Inactive Behind Feature Toggle | ACCEPTED | 2026-09-22 |
| ADR-007 | Configurable Google Sheets Mapping Architecture | ACCEPTED | 2026-09-22 |
| ADR-008 | Master Portal Template and Tenant Duplication System | ACCEPTED | 2026-09-22 |
| ADR-009 | Minimalist Text-Only UI Direction Without Emojis or Icons | ACCEPTED | 2026-09-22 |
| ADR-010 | Fullstack Next.js Monolith with Supabase PostgreSQL and RLS | ACCEPTED | 2026-09-22 |

---

## ADR-001: Scope Exclusion of AI Assistant and Realtime Voice AI

### Context
Previous generated documentation incorporated an interactive AI chatbot assistant, an AI photo studio with inpainting, a sales coach roleplay engine, and a realtime voice telephone call simulator with AI homeowners.

### Decision
AI assistant, LLM knowledge base RAG, realtime voice streaming, voice simulation, and sales coach are strictly OUT OF SCOPE for this implementation phase. The system will not include AI chatbots or audio calling simulation. Documented extension points may be retained for future phases, but no AI dependencies will be introduced.

### Rationale
Prevents scope inflation, maintains focus on production stability, and aligns with the authoritative client brief.

---

## ADR-002: Template-Based Video Scripts and Workflow-Only Video Preference

### Context
The previous documentation assumed automated AI script generation and AI avatar video synthesis.

### Decision
1. Video scripts will be generated via deterministic template variable interpolation using client variables such as {{client_name}} and {{company_name}}.
2. The selection between "AI Video" and "Self-Filmed Video" will be recorded as a client workflow preference only.
3. Automated AI video rendering is out of scope.

### Rationale
Guarantees reliable script generation without reliance on external LLM availability or hallucination risks.

---

## ADR-003: Hybrid Authentication and Rejection of Permanent URL Keys

### Context
Legacy mockups utilized permanent URL query keys (?id=...&k=...). A requirement conflict also existed between internal staff access and external client onboarding.

### Decision
1. Internal Motionz Staff (Admin and CSM) authenticate strictly via verified @motionz.ai accounts with optional 2FA.
2. External Clients and Client Team Members authenticate via secure, single-use, time-expiring magic links sent by email or SMS upon invitation.
3. Permanent URL access keys are strictly prohibited in production. Sessions are maintained via secure, HttpOnly, SameSite cookies.
4. Magic links expire within a short window (e.g. 15 minutes for login, 72 hours for invitations) and are revoked upon single use.

### Rationale
Eliminates URL token leaks in browser history and server logs while satisfying security requirements.

---

## ADR-004: Confirmed Onboarding Structure and Embedded GHL Form Strategy

### Context
Previous documentation invented custom multi-step document upload, verification, and approval workflows.

### Decision
1. Onboarding follows the five confirmed setup cards:
   - Google Sheet
   - GoHighLevel / A2P Verified
   - Facebook
   - Domain, email & website
   - Phone system & A2P texting
2. Status values are strictly: Not Started, In Progress, Done.
3. Card schema: Name, Owner (We Handle vs Client Action), Status, What it is, Right now, Unlocks.
4. Client information is collected via the confirmed embedded GoHighLevel onboarding form. Form questions are not invented or hard-coded into native database columns.

### Rationale
Faithfully reflects the real operational workflow where Motionz executes the setup work and clients provide required information via the established GHL form.

---

## ADR-005: Provider-Independent Adapter Architecture for Roof Measurement

### Context
Previous documents assumed Esri World Imagery was the confirmed satellite provider and Roofr was the auto-detect engine.

### Decision
The roof measurement feature will use a provider-independent adapter interface. The UI will support property address input, loading states, result visualization, and manual polygon vertex tracing. If no provider credentials exist, the interface displays an explicit setup-required or demo state without claiming live third-party connectivity.

### Rationale
The upstream roof measurement provider is currently undecided. Building an adapter prevents vendor lock-in and allows plugging in the chosen provider later.

---

## ADR-006: Payment Module Inactive Behind Feature Toggle

### Context
Whop was referenced in prototype mockups but is not confirmed as the production payment gateway.

### Decision
Whop or any payment gateway will not be a required system dependency. The payment module will be governed by an Admin feature toggle and remain inactive by default until Motionz confirms the payment provider.

### Rationale
Prevents premature integration with an unconfirmed payment vendor.

---

## ADR-007: Configurable Google Sheets Mapping Architecture

### Context
Two Google Sheets links were supplied in the brief without confirmed semantic column mappings.

### Decision
Build a configurable per-client Google Sheets integration service. The system will store spreadsheet ID and tab mappings per tenant, access sheets via server-side Google Service Account credentials with read-only scopes, and cache responses. Column semantics will not be hardcoded.

### Rationale
Provides flexibility as client tracking spreadsheets evolve while keeping Google Cloud credentials secure.

---

## ADR-008: Master Portal Template and Tenant Duplication System

### Context
Motionz needs to rapidly spin up branded portals for new clients without custom code.

### Decision
A canonical Master Portal Template defines baseline setup steps, instructional copy, default feature flags, and standard links. When an Admin adds a new client, the engine duplicates the template into isolated tenant rows in PostgreSQL, assigns a CSM, and sends an invitation.

### Rationale
Enables horizontal scaling across hundreds of clients with centralized template maintenance.

---

## ADR-009: Minimalist Text-Only UI Direction Without Emojis or Icons

### Context
User requested a clean, modern, minimalist interface fitting desktop and mobile, with text-only buttons and titles, and no emojis, fancy icons, or decorative dashed headers.

### Decision
1. All button labels, navigation titles, card headers, and status badges will use clear, concise typography without emojis or icon glyphs.
2. Standard clean markdown headers will be used without decorative dashes.
3. A mobile-first design system with dark theme palette will provide visual hierarchy through typography, contrast, borders, and structured spacing.

### Rationale
Adheres strictly to the user aesthetic rule and delivers a sleek, distraction-free enterprise portal.

---

## ADR-010: Fullstack Next.js Monolith with Supabase PostgreSQL and RLS

### Context
Architecture selection between microservices vs monolithic fullstack framework.

### Decision
Next.js (App Router with TypeScript) deployed to Vercel with a managed Supabase PostgreSQL database. Multi-tenant data isolation is enforced at the database level via Row Level Security (RLS) policies and verified at the Next.js middleware and server action layers.

### Rationale
Eliminates unnecessary microservice complexity, maximizes development velocity, and provides rock-solid security boundaries.
