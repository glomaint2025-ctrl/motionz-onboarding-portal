# Phase 07: Onboarding and Setup System

## Phase Objective
Implement the Onboarding / Setup roadmap module, rendering the five confirmed setup cards, dynamic progress percentage, top quick links (Slack, Skool, Forms), embedded GoHighLevel Onboarding Form, and A2P form.

## Dependencies
Phase 06 client portal shell.

## Phase Acceptance Criteria
1. Onboarding roadmap renders the five confirmed setup cards:
   - Google Sheet
   - GoHighLevel / A2P Verified
   - Facebook
   - Domain, email & website
   - Phone system & A2P texting
2. Each setup card displays Name, Owner, Status, What it is, Right now, Unlocks.
3. Confirmed GoHighLevel Onboarding Form embedded directly without inventing unconfirmed custom fields.
4. Confirmed A2P Verification Form embedded directly.
5. Quick links connect to the exact provided Slack and Skool resources.
6. Setup progress percentage accurately reflects the status of active setup items.

---

## Detailed Task Breakdown

### TASK-07-01: Build Setup Roadmap Layout and Quick Links Bar
- Status: DONE
- Objective: Render onboarding page with header, setup progress bar, filter toggles, and top quick links bar (Slack, Skool, Forms).
- Implementation: `src/app/portal/[clientId]/onboarding/page.tsx`, `src/components/onboarding/QuickLinksBar.tsx`.
- Evidence: Renders progress bar, quick resource links, step filter tabs (All, Action Required, Completed), and contextual modal dialogs.

### TASK-07-02: Build Setup Card Component
- Status: DONE
- Objective: Modular card component rendering step name, owner tag (We Handle vs Client Action), status badge, "What it is", "Right now", and "Unlocks".
- Implementation: `src/components/onboarding/SetupCard.tsx`.
- Evidence: Displays all 6 required attributes, owner styling badge, and contextual navigation actions for each milestone.

### TASK-07-03: Embed Confirmed GoHighLevel Onboarding Form
- Status: DONE
- Objective: Embed the provided GHL onboarding form widget (`wyM27h1ZCiwGoyXE03oC`) within the onboarding flow.
- Implementation: `src/components/onboarding/GHLOnboardingFormEmbed.tsx`.
- Evidence: Embeds confirmed form ID `wyM27h1ZCiwGoyXE03oC` with loading skeleton and fullscreen tab trigger.

### TASK-07-04: Embed Confirmed A2P Verification Form
- Status: DONE
- Objective: Embed the provided A2P verification form widget (`SH2jCt6DkV69gF6YHPni`) for carrier compliance.
- Implementation: `src/components/onboarding/A2PFormEmbed.tsx`.
- Evidence: Embeds confirmed form ID `SH2jCt6DkV69gF6YHPni` with CTIA carrier compliance guidance and loading state.

### TASK-07-05: Implement Setup Progress Calculation Engine
- Status: DONE
- Objective: Calculate overall completion percentage from active tenant onboarding step records.
- Implementation: `src/lib/onboarding/progress.ts`.
- Evidence: `calculateSetupProgress` calculates exact completion percentages (60% baseline, 80% on step advance, 100% on completion), safe empty array handling, and active step identification.

---

## Verification Evidence
1. `tests/onboarding/onboarding.test.ts` executes 6 test assertions:
   - 5 confirmed setup cards verified with complete required attributes.
   - Baseline progress calculation verified (60%, active: `ghl_a2p`).
   - Empty setup steps handled safely.
   - Dynamic progress recalculation upon milestone completion verified (80%).
   - Full onboarding completion verified (100%, `isComplete = true`).
   - Confirmed GoHighLevel Form IDs verified (`wyM27h1ZCiwGoyXE03oC` & `SH2jCt6DkV69gF6YHPni`).
2. `npm test` runs 6 test suites (32 assertions) with 100% pass rate.
3. `npx tsc --noEmit` exits with code 0 (zero TypeScript errors).
