# Phase 05: Customer Success Manager (CSM) Workspace

## Phase Objective
Build the operational workspace for CSMs to manage assigned client portals, edit onboarding step guidance, update step statuses, review client submissions, and support client launches without access to Admin-only settings.

## Dependencies
Phase 04 client provisioning and template engine.

## Phase Acceptance Criteria
1. CSM workspace lists all assigned client portals with clear velocity indicators: DONE
2. CSM can edit onboarding step titles, "What it is", "Right now", "Unlocks", and "We need from you": DONE
3. CSM can override step statuses (Not Started, In Progress, Done): DONE
4. CSM cannot delete portals, modify Admin-only feature toggles, or alter platform-wide templates: DONE
5. Client setup queue allows reviewing client submissions and advancing launch velocity: DONE
6. Automated integration tests verify step status updates, dynamic progress recalculation, and capability guards: DONE (5/5 test cases passed)
7. Zero TypeScript errors across CSM modules (`npx tsc --noEmit` exits with 0): DONE

---

## Detailed Task Breakdown

### TASK-05-01: Build CSM Assigned Client List
- Status: DONE
- Objective: View assigned client roster categorized by active onboarding, progress percent, and setup status.
- Files: `src/app/csm/clients/page.tsx`, `src/app/csm/page.tsx`.
- Evidence: Roster displays assigned clients, completed steps ratio, progress bar, and direct links to manage setup.

### TASK-05-02: Build Client Setup Detail View
- Status: DONE
- Objective: Dedicated view for a selected client showing the 5 confirmed setup steps and progress percent.
- Files: `src/app/csm/clients/[id]/setup/page.tsx`, `src/app/api/csm/clients/[id]/setup/route.ts`.
- Evidence: Displays all 5 confirmed setup steps with real-time progress bar.

### TASK-05-03: Implement Onboarding Step Content Editor
- Status: DONE
- Objective: Editable interface for updating step guidance text ("What it is", "Right now", "Unlocks", "We need from you").
- Files: `src/app/csm/clients/[id]/setup/page.tsx`, `src/app/api/csm/clients/[id]/setup/route.ts`.
- Evidence: Inline textarea editor allows updating guidance text; changes persist immediately to database.

### TASK-05-04: Implement Status Override Controls
- Status: DONE
- Objective: Controls allowing CSM to transition steps between Not Started, In Progress, and Done.
- Files: `src/app/csm/clients/[id]/setup/page.tsx`, `src/lib/db/index.ts`.
- Evidence: Status selector updates step and recalculates overall progress percentage dynamically.

### TASK-05-05: Implement Client Setup Review Queue
- Status: DONE
- Objective: Operational focus queue showing clients with setup steps currently in progress.
- Files: `src/app/csm/setup-queue/page.tsx`.
- Evidence: Setup queue table displays clients with active milestones requiring CSM attention.
