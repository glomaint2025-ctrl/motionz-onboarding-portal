# Phase 10: Pre-Deployment QA Release Checklist

This release checklist must be fully verified and signed off before deploying any build to staging or production.

---

## 1. Quality Assurance Verification Gates

### 1.1. Security & Multi-Tenant Quarantine
- [ ] **Cross-Tenant Barrier**: Client A cannot access Client B's leads, agreements, or forms via direct URL or API tampering.
- [ ] **URL Key Excision**: No secret access keys appear in browser address bars or referral headers.
- [ ] **Search Engine Disallow**: `curl -I https://portal.motionz.ai` confirms `X-Robots-Tag: noindex, nofollow`.
- [ ] **SSN & PII Masking**: Social Security Numbers only display masked last-4 digits (`***-**-1234`).
- [ ] **Audit Trail**: Administrative mutations generate records in `audit_logs`.

### 1.2. Onboarding & Milestone Progression
- [ ] **Template Cloning**: Duplicating a Master Portal Template creates an operational portal in < 30 seconds.
- [ ] **Step Status Toggles**: Admin and CSM status overrides update the client UI in real time.
- [ ] **LLC Filing Flow**: `"Start my LLC filing"` triggers Slack alert and reveals state fee checkout.
- [ ] **Quiz Grading**: Certification quiz enforces 20/20 pass score and logs passing records.

### 1.3. Integrations & Live Communications
- [ ] **GoHighLevel CRM**: Leads and pipeline stage counts match the upstream GHL sub-account.
- [ ] **In-Portal SMS**: Outbound SMS sends successfully and appears in the contact's GHL conversation.
- [ ] **Google Sheets Sync**: Tracking sheets refresh without hitting Google Cloud API rate limits.
- [ ] **Website Change Tickets**: Submitting a change request with an image attachment delivers a Slack alert.

### 1.4. Operational Tools & AI
- [ ] **Roof Measurement Canvas**: Satellite tiles load cleanly without CORS errors; calculation accurately outputs area, pitch, and chemical gallons.
- [ ] **AI Assistant Safeguard**: Natural language invoicing prompts an interactive confirmation card before execution.
- [ ] **Brand Studio**: Canvas templates export high-res PNG and JPEG files with client business name and phone.

### 1.5. Mobile Layout & PWA Readiness
- [ ] **Viewport Responsiveness**: Tested and functional on 375px (iPhone SE), 390px (iPhone 14/15), and 768px (iPad).
- [ ] **Bottom Navigation**: Mobile bottom bar remains fixed and respects safe-area insets.
- [ ] **PWA Shell**: `manifest.webmanifest` loads valid icons; Add to Home Screen operates cleanly on iOS and Android.
