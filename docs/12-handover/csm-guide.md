# Customer Success Manager (CSM) Playbook

This handbook guides Customer Success Managers (CSMs) through daily client onboarding management, milestone progression, and customer guidance.

---

## 1. Daily Workspace Review

1. Log into `https://portal.motionz.ai/csm` using your `@motionz.ai` credentials.
2. The **CSM Dashboard** displays clients assigned to your portfolio:
   - **Active Onboarding Queue**: Clients currently completing their setup cards.
   - **Needs Review**: Steps submitted by clients requiring CSM sign-off.
   - **Launch Ready**: Clients at 100% completion across all 5 milestones.

---

## 2. Managing the 5 Confirmed Setup Milestones

Each client portal contains 5 confirmed onboarding steps. CSMs track, guide, and update step statuses:

1. **Step 1: Google Sheet**
   - **Owner**: Client & CSM
   - **What it is**: Initial onboarding intake sheet gathering client business details, target territory, and existing accounts.
   - **CSM Action**: Verify data rows are complete and synced.

2. **Step 2: GoHighLevel / A2P Verified**
   - **Owner**: Motionz Technical Operations
   - **What it is**: GoHighLevel sub-account provisioning, sub-account linking, and business registration for A2P 10DLC compliance.
   - **CSM Action**: Assist client in filling out the GHL Onboarding Form (`wyM27h1ZCiwGoyXE03oC`) and A2P Form (`SH2jCt6DkV69gF6YHPni`).

3. **Step 3: Facebook**
   - **Owner**: Client & CSM
   - **What it is**: Facebook Business Manager asset delegation, ad account access, and pixel setup.
   - **CSM Action**: Check partner access permissions granted to Motionz Business Manager.

4. **Step 4: Domain, Email & Website**
   - **Owner**: Motionz Technical Operations
   - **What it is**: Custom domain DNS setup, Google Workspace professional email, and dealer landing page deployment.
   - **CSM Action**: Verify DNS propagation and SSL certificate issuance.

5. **Step 5: Phone System & A2P Texting**
   - **Owner**: Motionz Technical Operations
   - **What it is**: Twilio/GHL phone number acquisition, call routing to client cell, and outbound SMS carrier approval.
   - **CSM Action**: Run test inbound call and outbound text message before marking complete.

---

## 3. Updating Step Status & Explanatory Guidance

1. Open a client setup view (e.g. `/csm/clients/[clientId]/setup`).
2. Click **Edit Step** on any card.
3. Update the **Status**:
   - `Not Started`: Milestone pending earlier prerequisite.
   - `In Progress`: Active work underway.
   - `Waiting on Client`: Blocked pending client form submission or verification code.
   - `Under Review`: Client completed action; CSM verifying.
   - `Complete`: Verified and completed.
4. Update **Right Now Guidance**:
   - Provide clear, reassuring, conversational status updates (e.g., `"A2P brand registration submitted to campaign registry. Review typically takes 3 to 5 business days."`).
5. Click **Save Step**. The client's onboarding progress bar and status card recalculate and update immediately.

---

## 4. Role Boundaries & Governance

- **Permitted for CSM**: Updating step statuses, editing explanatory guidance text, viewing leads, uploading contracts, inspecting tracking.
- **Restricted for CSM**: CSMs cannot toggle global platform features or permanently delete client accounts (these actions are strictly enforced as Admin-only via capability guards).
