# Phase 14: Handover

## Overview
Produce comprehensive operational guides and developer documentation covering portal administration, CSM day-to-day operations, client onboarding, integration setup, troubleshooting, and system maintenance.

## Tasks

### TASK-1401: Admin Operational Guide
- Objective: Document complete Motionz Admin workflows including client provisioning, CSM assignment, template duplication, feature toggle governance, audit log inspection, and security alert management.
- Dependencies: Phase 04, Phase 10
- Files/modules affected: `docs/12-handover/admin-guide.md`
- UI requirements: None
- Content/data requirements: Text descriptions of admin screens and actions
- Backend requirements: None
- Validation requirements: Step-by-step walkthroughs verified against real admin flows
- Security requirements: Emphasize privileged access safeguards and 2FA requirements
- Performance considerations: None
- Tests: Review by technical leads
- Acceptance criteria: Admin guide covers client lifecycle from creation to archive, feature toggling, and user management
- Status: DONE
- Evidence/result: Authored `docs/12-handover/admin-guide.md` detailing `@motionz.ai` domain restriction, 72-hour magic-link access, client provisioning wizard, template step cloning, per-client feature switches, script template editor, and security audit log explorer (`SEC-001` through `SEC-004`).

### TASK-1402: CSM Operational Guide
- Objective: Document CSM daily workflows including client setup tracking, updating setup statuses, editing explanatory step content, updating links, and supporting client questions.
- Dependencies: Phase 05, Phase 07
- Files/modules affected: `docs/12-handover/csm-guide.md`
- UI requirements: None
- Content/data requirements: Text descriptions of CSM workspace screens and actions
- Backend requirements: None
- Validation requirements: Verified against CSM permissions boundaries
- Security requirements: Document restricted boundaries (CSM cannot toggle global features or delete portals)
- Performance considerations: None
- Tests: Review by operations leads
- Acceptance criteria: CSM guide provides step-by-step instructions for editing cards, updating progress, and managing client setup
- Status: DONE
- Evidence/result: Authored `docs/12-handover/csm-guide.md` detailing the CSM dashboard, portfolio management, step-by-step guidance on the 5 confirmed setup milestones (Google Sheet, GHL/A2P, Facebook, Domain/Email/Website, Phone/A2P), "Right Now" conversational guidance editing, and role-based capability boundaries.

### TASK-1403: Client Portal Guide
- Objective: Document the end-client experience covering magic link access, profile setup, completing onboarding forms, tracking leads, viewing signed contracts, accessing tools, and booking calls.
- Dependencies: Phase 06, Phase 07
- Files/modules affected: `docs/12-handover/client-guide.md`
- UI requirements: None
- Content/data requirements: Text descriptions of client screens and navigation
- Backend requirements: None
- Validation requirements: Clear non-technical language tailored to client companies (e.g. ABC Roofing)
- Security requirements: Explain magic link security and session timeout behavior
- Performance considerations: None
- Tests: User testing review
- Acceptance criteria: Client guide covers all standard portal modules and mobile navigation
- Status: DONE
- Evidence/result: Authored `docs/12-handover/client-guide.md` covering passwordless magic-link login, mobile and desktop responsive views, overview progress metrics, 5 onboarding setup cards, leads and pipeline tracking, campaign performance metrics, video script generation, roof measurement tool, signed contracts vault, orders tracker, and CSM strategy session booking.

### TASK-1404: Developer and Integration Setup Guide
- Objective: Document architecture, local development setup, environment variables, Supabase migrations, third-party API adapter configuration (GHL, Google Sheets, Roof measurement adapter), and troubleshooting procedures.
- Dependencies: All Phases
- Files/modules affected: `docs/12-handover/developer-guide.md`, `docs/12-handover/integrations-guide.md`
- UI requirements: None
- Content/data requirements: Technical reference documentation
- Backend requirements: None
- Validation requirements: Reproducible clean clone to local development running instructions
- Security requirements: Secret management best practices documented
- Performance considerations: None
- Tests: Clean checkout test following developer guide
- Acceptance criteria: Developer guide allows a new engineer to spin up the repository, configure mock/live integrations, and execute tests
- Status: DONE
- Evidence/result: Authored `docs/12-handover/developer-guide.md` and `docs/12-handover/integrations-guide.md`, alongside root `README.md`. Provided complete quickstart setup, dual-mode database instructions (in-memory / Docker PostgreSQL / Supabase cloud), migration and rollback commands, pure text-only UI rules, adapter patterns for GHL, Google Sheets, Slack, and test suite execution commands.
