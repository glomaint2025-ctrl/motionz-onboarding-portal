# Phase 0: Scope and System Boundaries

## 1. Project Mission and Objective

Motionz Onboarding Portal is a secure, multi-tenant web application engineered for Motionz.ai to automate, standardize, and support client onboarding and post-launch operations.

The system serves two distinct operational groups:
1. Internal Motionz Operations (Admins and CSMs): A command center to provision new client environments from a Master Portal Template, monitor client onboarding velocity, edit step instructions, configure feature flags, and oversee campaign performance.
2. External Clients and Client Team Members: A dedicated, branded, mobile-first private portal providing visibility into onboarding setup progress, GoHighLevel campaign performance, leads, appointments, tracking data, signed contracts, orders, roof measurement tooling, marketing video script templates, tools and resources, and CSM scheduling.

Important System Clarification:
The portal is a private system between Motionz and the Motionz Client Company (for example, ABC Roofing). The client company's own end customers are not users of this system.

## 2. In-Scope Functional Boundaries

### 2.1. Template and Tenant Provisioning Engine
- Centralized Master Portal Template defining baseline onboarding setup steps, instructional copy, links, and feature flag configurations.
- Admin duplication of the Master Portal Template into distinct, isolated client portal instances.
- Independent customizability of client portal instances without breaking upstream template structure.
- Optional administrative propagation of template updates down to existing client portals without overwriting client-specific operational data.

### 2.2. Multi-Tiered User Roles and Identity
- Admin: Global platform ownership, client company creation, portal duplication and deletion, CSM assignment, template authoring, feature flag controls, security audit logs, platform metrics.
- CSM (Customer Success Manager): Assigned client portal management, setup step status updates, instructional copy editing, client guidance, strategy call scheduling. Cannot delete portals or change admin-only settings.
- Client (Account Owner): Strictly isolated to their own organization portal. Completes onboarding form, views setup progress, views leads and appointments, accesses live tracking, views signed contract, accesses tools, submits video preference and accesses scripts, uses roof measurement tool, manages profile, invites client team members.
- Client Team Member: Scoped access to their organization portal to view operational data and tools as delegated by the primary client owner. Cannot manage platform settings or delete portals.

### 2.3. Confirmed Client Portal Functional Modules
1. Overview: Client company name, setup progress percentage, key setup steps, current and next step, connected metrics summary (leads, appointments), and quick action buttons. If an integration is disconnected, displays clear unavailable status.
2. Onboarding / Setup: Five confirmed setup steps (Google Sheet; GoHighLevel / A2P Verified; Facebook; Domain, email & website; Phone system & A2P texting) with statuses (`Not Started`, `In Progress`, `Done`), ownership, instructional copy ("What it is", "Right now", "Unlocks"), quick resource links (Slack, Skool, Onboarding Form, A2P Form), and embedded GHL Onboarding Form.
3. Leads and CRM Performance: Synchronization with GoHighLevel sub-account displaying lead counts, statuses, appointments, results, basic filtering and search.
4. Tracking Sheets: Configurable integration with Google Sheets campaign tracking data via server-side API.
5. Signed Contract: Private signed contract viewer and downloader connected to GoHighLevel signed document storage with secure tenant-scoped authorization.
6. Orders and Shipping: Physical product order and shipment status tracker (stages: Ordered, Packaged, Shipped, Delivered, Issue flag) with carrier tracking links. Adapter-based architecture.
7. Tools and Resources: Resource directory with confirmed links to Slack, Skool, Onboarding Form, A2P Form, and CSM Booking.
8. Roof Measurement Tool: Address/property input interface, provider-independent adapter architecture, measurement canvas, slope/pitch adjustment, surface area calculation, and material estimation.
9. Video Scripts: Template-based script engine replacing client name and company name into 3 base scripts (`{{client_name}}`, `{{company_name}}`). Workflow preference recording for "AI Video" vs "Self-Filmed Video". Base scripts editable by Admin/CSM.
10. Book a Call: Direct responsive embed of confirmed GoHighLevel CSM booking widget.
11. Profile: Management of client name, company name, logo, and permitted company details. Email is treated as primary identity credential.
12. Team Members: Client team invitation workflow with single-use expiring invitation tokens and tenant-scoped membership.

## 3. Explicit Out-of-Scope Items

The following features are strictly out of scope for this implementation:
1. AI Assistant: No conversational LLM chatbot, natural language CRM command execution, or AI agent functionality.
2. Voice AI and Call Practice: No WebRTC realtime audio, voice simulation, homeowner roleplay, or voice coaching.
3. Sales Coach: No automated sales call grading or multi-mode deal breakdown tools.
4. AI Script Generation and AI Video Generation: Video scripts are template-based only with variable substitution. No generative AI scripts or generative video rendering.
5. Unconfirmed Custom Onboarding Document Verification Workflow: No invented document approval/rejection state machine.
6. Permanent URL Access Keys: Legacy URL tokens (`?id=...&k=...`) are prohibited.
7. Client End-Customer Access: End customers of client businesses do not access this portal.
8. Whop Hardcoded Dependency: Payment/membership modules remain behind feature toggles and are not required dependencies.

## 4. Phase Delivery Summary

- Phase 00: Project Audit and Documentation Reconciliation (Current)
- Phase 01: Foundation and Modern Minimalist Design System
- Phase 02: Relational Database Schema and Multi-Tenant RLS Policies
- Phase 03: Authentication, RBAC, and Security Auditing
- Phase 04: Admin Dashboard, Client Provisioning, and Feature Toggles
- Phase 05: CSM Workspace, Setup Management, and Content Editor
- Phase 06: Client Portal Core Frontend Modules and Mobile Layouts
- Phase 07: Onboarding and Setup Roadmap
- Phase 08: External Integrations (GHL, Google Sheets, Booking, Slack, Skool)
- Phase 09: Content and Tools (Video Scripts, Resource Directory)
- Phase 10: Security Hardening, Tenant Leak Testing, and Headers
- Phase 11: Automated Testing (Unit, Integration, Playwright E2E)
- Phase 12: Performance Optimization and Bundle Splitting
- Phase 13: Production Deployment on Vercel and Supabase
- Phase 14: Handover Guides and Operational Manuals
