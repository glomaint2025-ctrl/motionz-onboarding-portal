# Phase 4: Admin Portal Requirements & Specifications

The Admin Portal is the master operations center for Motionz executives and platform engineers. It provides end-to-end management of client portals, templates, integrations, analytics, and security.

---

## 1. Functional Requirements for the Admin Tier

- **ADM-REQ-01 [CONFIRMED REQUIREMENT] - Global Executive Dashboard**: Real-time cross-client operational metrics, onboarding velocity, churn, and pipeline health.
- **ADM-REQ-02 [CONFIRMED REQUIREMENT] - Template Authoring & Management**: Full CRUD operations on Master Portal Templates, including step hierarchies, default copy, unlock criteria, and feature flag baselines.
- **ADM-REQ-03 [CONFIRMED REQUIREMENT] - Instant Portal Provisioning & Duplication**: Rapid generation of new client portals by cloning a selected Master Portal Template with automated default steps and brand stubs.
- **ADM-REQ-04 [CONFIRMED REQUIREMENT] - Client Lifecycle Administration**: Create, edit, pause, archive, and permanently delete client portals.
- **ADM-REQ-05 [CONFIRMED REQUIREMENT] - Feature Flag Control**: Toggle modules (Roof Measure, Inbox, Whop Payments, Sales Coach, Call Practice) globally or per tenant.
- **ADM-REQ-06 [CONFIRMED REQUIREMENT] - Staff & CSM Assignment**: Provision internal Admin and CSM user accounts; assign CSMs to specific client portals.
- **ADM-REQ-07 [CONFIRMED REQUIREMENT] - Security & Audit Log Explorer**: Searchable, filterable ledger of all platform security and administrative actions.
- **ADM-REQ-08 [CONFIRMED REQUIREMENT] - Integration Credential Management**: Encrypted storage and status verification for platform-wide API keys (GoHighLevel, OpenAI, Google Cloud, Slack, Ayrshare).

---

## 2. User Experience & Responsive Layout

The Admin Portal utilizes a clean, data-dense desktop-optimized layout with full responsive collapse for mobile tablets and smartphones:
- **Left Navigation Rail**: Collapsible sidebar with quick links to `Dashboard`, `Clients`, `Templates`, `Staff`, `Integrations`, and `Audit Logs`.
- **Global Header**: Tenant search bar (`⌘K` command palette), active environment indicator (`Production` vs `Staging`), and profile/logout menu.
- **Data Tables**: Paginated, sortable, filterable grids with CSV export and batch action capabilities.
