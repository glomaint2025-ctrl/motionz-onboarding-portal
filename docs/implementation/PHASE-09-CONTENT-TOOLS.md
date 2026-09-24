# Phase 09: Content and Tools Management

## Phase Objective
Build the Tools & Resources page, Template-Based Video Scripts generator (with client name and company variable replacement), Video Preference workflow tracker (AI Video vs Self-Filmed Video), and the provider-independent Roof Measurement page.

## Dependencies
Phase 08 integration framework and Phase 06 client views.

## Phase Acceptance Criteria
1. Tools and Resources page renders confirmed resource links (Slack, Skool, Onboarding Forms, A2P, Booking).
2. Video Scripts generator provides 3 template-based scripts using client name and company name interpolation.
3. No AI generation dependencies used for video scripts.
4. Video Preference records client choice ("AI Video" vs "Self-Filmed Video") as a workflow state.
5. Roof Measurement page provides property input UI, loading/result states, and manual polygon tracing with provider-independent adapter.
6. Admin and CSM can edit base video script templates.

---

## Detailed Task Breakdown

### TASK-09-01: Build Tools and Resources Directory Page
- Status: DONE
- Objective: Clean, card-based directory linking to Slack, Skool, Forms, Booking, and support channels.
- Implementation: `src/app/portal/[clientId]/tools/page.tsx`.
- Evidence: Card-based directory linking to Slack, Skool, Onboarding Form, A2P Form, Roof Measurement, and Booking.

### TASK-09-02: Implement Template-Based Video Scripts Generator
- Status: DONE
- Objective: Generate 3 high-converting scripts interpolating {{client_name}} and {{company_name}}.
- Implementation: `src/lib/scripts/template-engine.ts`, `src/app/portal/[clientId]/video-scripts/page.tsx`, `src/app/portal/[clientId]/scripts/page.tsx`.
- Evidence: Interpolates variables into 3 baseline scripts strictly without AI generation dependencies, with one-click copy actions.

### TASK-09-03: Implement Video Preference Selection Workflow
- Status: DONE
- Objective: Interface allowing client to toggle and save preference between AI Video and Self-Filmed Video.
- Implementation: `src/app/portal/[clientId]/video-scripts/page.tsx`, `src/app/api/portal/[clientId]/video-preference/route.ts`.
- Evidence: Records client choice as workflow state (`ai_video` vs `self_filmed`) with audit logging.

### TASK-09-04: Build Provider-Independent Roof Measurement Page
- Status: DONE
- Objective: Address search input, provider loading/error states, polygon vertex tracing, pitch selection, and calculations.
- Implementation: `src/app/portal/[clientId]/roof-measurement/page.tsx`, `src/app/portal/[clientId]/measure/page.tsx`.
- Evidence: Pitch multiplier calculations (`3/12` through `12/12`), squares determination, aerial SVG polygon tracing, and PDF export action.

### TASK-09-05: Implement Admin/CSM Script Template Management
- Status: DONE
- Objective: Administrative interface for updating base video script template text.
- Implementation: `src/app/admin/templates/scripts/page.tsx`.
- Evidence: Admin editor for master script templates with live variable interpolation preview.

---

## Verification Evidence
1. `tests/content/content.test.ts` executes 5 test assertions:
   - Video script variable interpolation (`{{client_name}}`, `{{company_name}}`).
   - Fallback defaults for missing variables.
   - 3 baseline video scripts generated without external AI dependencies.
   - Video preference workflow state persisted and reloaded.
   - Roof measurement pitch multiplier and squares calculation.
2. `npm test` runs 8 test suites (44 assertions) with 100% pass rate.
3. `npx tsc --noEmit` exits with code 0 (zero TypeScript errors).
