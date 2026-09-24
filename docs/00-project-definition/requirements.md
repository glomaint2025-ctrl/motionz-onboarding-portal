# Phase 0: System Requirements Specification

This document defines the functional and non-functional requirements for the Motionz Onboarding Portal. Every requirement is explicitly categorized as CONFIRMED, PROPOSED, ASSUMPTION, OPEN QUESTION, or OUT OF SCOPE.

## 1. Functional Requirements (FR)

### 1.1. Multi-Tenant Organization and Master Template Engine
- FR-101 [CONFIRMED]: The system must maintain a canonical Master Portal Template defining default onboarding setup steps, instructional copy, links, and feature flag settings.
- FR-102 [CONFIRMED]: Admins must be able to duplicate the Master Portal Template to create new, isolated client portal instances.
- FR-103 [CONFIRMED]: Each client portal must support independent overrides of company name, contact info, onboarding steps, step statuses, external links, and feature availability.
- FR-104 [PROPOSED]: The template engine should support version tracking and allow Admins to selectively push non-conflicting template updates to existing client portals without overwriting client operational data.

### 1.2. User Management and Access Control
- FR-201 [CONFIRMED]: Support four distinct system roles: Admin, CSM, Client (Account Owner), and Client Member.
- FR-202 [CONFIRMED]: Admins must possess full platform access, including client company creation, portal duplication/deletion, CSM assignment, template authoring, feature toggles, and audit log inspection.
- FR-203 [CONFIRMED]: CSMs must be able to edit onboarding content, update step statuses, and guide assigned clients, but cannot delete portals or modify admin-only settings or feature toggles.
- FR-204 [CONFIRMED]: Clients and Client Members must strictly be quarantined to their own organizational portal data with zero access to peer tenant information.
- FR-205 [CONFIRMED]: Internal Motionz staff (Admin/CSM) access must be restricted to @motionz.ai email accounts. External clients and client members authenticate via verified business or personal emails.
- FR-206 [CONFIRMED]: Client invitation and onboarding authentication must use expiring, single-use, revocable magic links establishing secure authenticated sessions. Permanent access keys in URLs (?id=...&k=...) are strictly prohibited.
- FR-207 [CONFIRMED]: Client owners must be able to invite and manage team members within their own organization.

### 1.3. Onboarding and Setup Roadmap
- FR-301 [CONFIRMED]: The onboarding/setup module must present the five confirmed setup steps:
  1. Google Sheet
  2. GoHighLevel / A2P Verified
  3. Facebook
  4. Domain, email & website
  5. Phone system & A2P texting
- FR-302 [CONFIRMED]: Each setup step card must contain:
  - Step Name
  - Owner (WE HANDLE vs YOUR ACTION)
  - Status (Not Started, In Progress, Done)
  - What it is
  - Right now
  - Unlocks
- FR-303 [CONFIRMED]: Admins and CSMs must have full permission to modify step titles, instructional descriptions, unlock text, and override status values.
- FR-304 [CONFIRMED]: Setup progress percentage must be mathematically derived from the configured setup items and their current statuses.
- FR-305 [CONFIRMED]: Embed the confirmed GoHighLevel Onboarding Form (`https://api.leadconnectorhq.com/widget/form/wyM27h1ZCiwGoyXE03oC?notrack=true`) directly within the portal.
- FR-306 [CONFIRMED]: Quick access links must be provided for Communication Access / Slack, Onboarding Forms, Skool Community, and A2P Verification Forms.
- FR-307 [OUT OF SCOPE]: Document upload and manual admin approval/rejection verification workflows are out of scope for initial delivery.
- FR-308 [OUT OF SCOPE]: Inventing unconfirmed custom onboarding form fields is strictly prohibited. Additional client information must be collected via the confirmed embedded GHL form or configurable fields.

### 1.4. Operational Modules and Utilities
- FR-401 [CONFIRMED]: Signed Contract - Private viewer and downloader for executed client agreements via server-side GoHighLevel integration. No public contract URLs.
- FR-402 [CONFIRMED]: Leads and Appointments - Synchronization with GoHighLevel displaying lead counts, statuses, appointments, and results with basic filtering and search.
- FR-403 [CONFIRMED]: Tracking Sheets - Server-side integration displaying campaign tracking data from Google Sheets with configurable per-client spreadsheet and sheet mapping.
- FR-404 [CONFIRMED]: Roof Measurement - Address/property input interface with map canvas, slope/pitch adjustment, surface area calculation, and material estimation built on a provider-independent adapter architecture.
- FR-405 [OPEN QUESTION]: Roof measurement upstream provider is unconfirmed. Do not hardcode Esri, Roofr, or Google Solar as mandatory production dependencies.
- FR-406 [CONFIRMED]: Video Scripts - Template-based script engine providing 3 base scripts replacing {{client_name}} and {{company_name}}. Allows client to select workflow preference between "AI Video" and "Self-Filmed Video". Admin/CSM can edit base script templates.
- FR-407 [OUT OF SCOPE]: Conversational AI Assistant, LLM tool execution, voice AI, realtime homeowner call simulation, and Sales Coach are strictly out of scope.
- FR-408 [OUT OF SCOPE]: AI-generated video rendering and AI-generated dynamic script generation are out of scope.
- FR-409 [CONFIRMED]: Orders and Shipping - Physical product order and shipment status tracker (Ordered, Packaged, Shipped, Delivered, Issue flag) with carrier tracking links using an adapter-based model.
- FR-410 [CONFIRMED]: Book a Call - Direct responsive embed of confirmed GoHighLevel calendar booking widget (`https://api.leadconnectorhq.com/widget/booking/SRn2ONyB295xnnPR5JwR`).
- FR-411 [CONFIRMED]: Tools and Resources - Configurable resource directory featuring confirmed links to Slack, Skool, Onboarding Form, A2P Form, and Booking.

### 1.5. Administrative Dashboard and Analytics
- FR-501 [CONFIRMED]: Dashboard must display:
  - Clients not connected to GoHighLevel
  - Clients still needing GoHighLevel connection
  - Client churn rate (when valid data source exists, otherwise display not connected)
  - Website review submissions
  - Average revenue per client (when valid data source exists, otherwise display not connected)
  - Onboarding and setup progress across clients
  - Clients stuck at a setup step
  - Total, Active, and Cancelled client counts
  - Login activity and security alerts
- FR-502 [CONFIRMED]: If a business metric lacks a reliable live data source, display "Not connected" or "Data unavailable". Fabricating metrics is prohibited.

## 2. Non-Functional Requirements (NFR)

### 2.1. Security and Data Protection
- NFR-101 [CONFIRMED]: Multi-Tenant Isolation - Enforced at the PostgreSQL database layer via Row-Level Security (RLS) policies and verified by automated penetration tests.
- NFR-102 [CONFIRMED]: URL Access Key Prohibition - Permanent secret tokens in URLs are prohibited. All operations require authenticated sessions with expiring, single-use magic links for invitations.
- NFR-103 [CONFIRMED]: Search Engine Exclusion - Enforce `X-Robots-Tag: noindex, nofollow` headers and strict `robots.txt` blocking crawlers across all portal routes.
- NFR-104 [CONFIRMED]: Audit Logging - Immutable logging of authentication attempts, role modifications, portal deletions, invitations, and sensitive data access.
- NFR-105 [CONFIRMED]: UI Elements - All buttons, headers, and navigation items must use pure text without emojis or icons.

### 2.2. User Experience, Responsiveness, and PWA
- NFR-201 [CONFIRMED]: Mobile-First Layout - Fully responsive interface across mobile, tablet, and desktop with slide-out navigation drawer on mobile and persistent sidebar on desktop.
- NFR-202 [CONFIRMED]: PWA Readiness - Web app manifest, service worker shell caching, standalone display mode, and mobile metadata.
- NFR-203 [CONFIRMED]: Design System - Dark theme aesthetic (#0B1015 background, #34A5CB cyan accents, #141E26 panels) with text-only buttons and titles.

### 2.3. Performance and Reliability
- NFR-301 [PROPOSED]: Fast initial load with core bundle under 150KB gzip and lazy loading of heavy embeds (booking iframes, roof map canvas).
- NFR-302 [CONFIRMED]: Graceful Degradation - External integration failures must display informative empty, error, or not-connected states without crashing the client portal.
