# Phase 0: Project Assumptions

This document articulates the baseline assumptions underpinning the technical design and delivery of the Motionz Onboarding Portal. Every assumption is explicitly labeled.

## 1. Technical and Infrastructure Assumptions

1. ASM-TECH-01 [ASSUMPTION] - Full-Stack Monolithic Architecture:
   - Next.js (App Router with TypeScript) deployed to Vercel serves as the unified fullstack application encompassing frontend rendering and backend API/Server Actions.
2. ASM-TECH-02 [ASSUMPTION] - Managed PostgreSQL Database:
   - Supabase provides managed PostgreSQL with Row-Level Security (RLS) for tenant isolation, foreign keys, and indexes.
3. ASM-TECH-03 [ASSUMPTION] - Browser Support:
   - Modern browser support is assumed (Chrome, Safari, Edge, Firefox, iOS Safari 15+, Android Chrome).
4. ASM-TECH-04 [ASSUMPTION] - Serverless Execution Limits:
   - API endpoints running on Vercel Serverless Functions have standard timeout limits (10 to 60 seconds). Bulk data synchronization is handled with pagination and caching.

## 2. Operational and Business Assumptions

1. ASM-OPS-01 [ASSUMPTION] - Client Lifecycle and Tenancy Volume:
   - The platform is sized to accommodate hundreds of active client portals, with each portal containing 1 to 10 team members.
2. ASM-OPS-02 [ASSUMPTION] - Admin and CSM Assignment:
   - Every client portal can be assigned to a designated internal CSM, with oversight retained by Admins.
3. ASM-OPS-03 [ASSUMPTION] - Onboarding Progression:
   - The client completes onboarding information primarily through the embedded GoHighLevel form. CSM and Admin perform setup actions and update setup step statuses accordingly.

## 3. Integration and Third-Party Assumptions

1. ASM-INT-01 [ASSUMPTION] - GoHighLevel Sub-Account per Client:
   - Each client organization in the portal maps to a GoHighLevel Location ID or sub-account credentials stored securely on the server.
2. ASM-INT-02 [ASSUMPTION] - Google Sheets Integration:
   - Client tracking sheets are read server-side via Google Service Account credentials with read-only scopes. Spreadsheets and tab names are configured per client.
3. ASM-INT-03 [ASSUMPTION] - Roof Measurement Provider Abstraction:
   - Upstream roof data/imagery provider is unconfirmed. The system uses a provider-independent adapter architecture. If credentials are not configured, an informative setup-required or demo state is rendered.
4. ASM-INT-04 [ASSUMPTION] - Out of Scope AI Features:
   - Conversational AI Assistant, Voice AI, homeowner roleplay, AI video rendering, and AI script generation are out of scope. Video scripts use safe template variable replacement ({{client_name}}, {{company_name}}).
