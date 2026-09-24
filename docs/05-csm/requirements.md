# Phase 5: CSM Workspace Requirements & Boundaries

The Customer Success Manager (CSM) Workspace provides day-to-day operational tooling for Motionz account managers to guide clients through onboarding, manage milestone statuses, and deliver support.

---

## 1. Functional Requirements for the CSM Tier

- **CSM-REQ-01 [CONFIRMED REQUIREMENT] - Assigned Client Roster**: A filterable workspace displaying all client portals assigned to the logged-in CSM, highlighting onboarding phase, velocity, and current blockers.
- **CSM-REQ-02 [CONFIRMED REQUIREMENT] - Onboarding Step Editing**: Full capability to update step descriptions, custom guidance notes, and required client action text for any assigned client portal.
- **CSM-REQ-03 [CONFIRMED REQUIREMENT] - Milestone Status Overrides**: Ability to mark any onboarding step as `Not Started`, `In Progress`, `Blocked`, `Done`, or `Not Needed`.
- **CSM-REQ-04 [CONFIRMED REQUIREMENT] - Client Support & Content Customization**: Ability to review client-submitted website change requests, upload executed contracts, and configure client business details.
- **CSM-REQ-05 [CONFIRMED REQUIREMENT] - Strategic Review Facilitation**: Direct integration with calendar booking widgets and live onboarding notes.

---

## 2. Hard Boundaries & Restrictions

To safeguard platform stability, CSM accounts are restricted from the following administrative functions:

| Restricted Action | Reason for Restriction | Handled By |
| :--- | :--- | :--- |
| **Permanent Portal Deletion** | Prevents accidental data loss and client disruption | Platform Admin only |
| **Master Template Authoring** | Preserves core blueprint integrity across all portals | Platform Admin only |
| **Global Feature Flag Modification** | Prevents unauthorized package tier changes | Platform Admin only |
| **Viewing Cross-Tenant Financials** | Protects sensitive executive platform figures | Platform Admin only |
| **Modifying Database Security / RLS** | Core infrastructure protection | Lead Engineer / Admin |
