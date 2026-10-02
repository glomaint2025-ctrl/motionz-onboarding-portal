# Phase 02: Manual UI Testing Guide

This guide provides step-by-step instructions to manually test all Phase 02 authentication, authorization, and RBAC flows directly in a real browser.

---

## 1. Test Accounts & Credentials

Password-based login is **not** used in this system. Authentication is strictly passwordless:
- **Staff** uses verified `@motionz.ai` single-step email authentication.
- **Clients & Members** use 72-hour single-use magic links.

| Role | Email | Tenant / Client | How Account is Created | Exists in Seed DB? |
| :--- | :--- | :--- | :--- | :---: |
| **Admin** | `admin@motionz.ai` | Global Staff (No tenant) | Pre-seeded in database migration `20260922000003_seed_demo_data.sql` | **YES** |
| **CSM** | `csm@motionz.ai` | Global Staff (Assigned to Demo Tenant) | Pre-seeded in database migration `20260922000003_seed_demo_data.sql` | **YES** |
| **Client A (Owner)** | `john@abcroofing.com` | `d0000000-0000-0000-0000-000000000001` (ABC Roofing / `abc-roofing`) | Pre-seeded in database migration | **YES** |
| **Client B (Owner)** | `owner@summitroofmasters.com` | Created during Admin test | Created via Admin "Add Client" flow or test script | **CREATE IN TEST** |
| **Client Member A** | `dan.member@abcroofing.com` | Bound to Client A | Created via Client A "Team" invitation flow | **CREATE IN TEST** |

---

## 2. Environment & Supabase Setup

### 2.1. Prerequisites
Ensure `.env.local` contains the verified Supabase project credentials:
```env
NEXT_PUBLIC_SUPABASE_URL=https://hagqtrhgetyrubvcskij.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SESSION_SECRET=motionz-dev-fallback-session-secret-at-least-32-chars
```

### 2.2. Start the Application
Run the local dev server in your terminal:
```bash
npm run dev
```
Open your browser to: **`http://localhost:3000`** (or the port indicated in your console output).

---

## 3. Admin Manual Test

### Goal: Verify Admin login, dashboard access, session persistence, and logout.

1. **Open Login Page**: Navigate to `http://localhost:3000/auth/login`.
2. **Select Tab**: Click on the **Motionz Staff** tab.
3. **Fill In**:
   - Email: `admin@motionz.ai`
   - Staff Role: Click the **Admin** button.
4. **Submit**: Click **Sign In as Staff**.
5. **Expected Page**: Browser automatically redirects to `http://localhost:3000/admin`.
6. **What You Should See**:
   - Motionz Admin Header with text: `Motionz Admin`
   - Platform Overview Metrics (`Total Clients`, `Active Portals`, `Setup In Progress`, `Flagged Issues`)
   - Client Roster displaying `ABC Roofing`.
7. **Test Session Persistence**: Press `F5` (or click browser reload).
   - **Expected Result**: Page reloads directly on `/admin` without prompting for login. Session remains fully active.
8. **Test Logout**: Click the **Sign Out** button in the top navigation.
   - **Expected Result**: Browser redirects to `http://localhost:3000/auth/login`.
9. **Test Protection After Logout**: Manually type `http://localhost:3000/admin` into the browser URL bar and press Enter.
   - **Expected Result**: Access is blocked; browser redirects immediately to `http://localhost:3000/auth/login?redirect=%2Fadmin&error=admin_required`.

---

## 4. CSM Manual Test

### Goal: Verify CSM login, access to assigned workspaces, and prevention of Admin-only actions.

1. **Open Login Page**: Navigate to `http://localhost:3000/auth/login`.
2. **Select Tab**: Click on the **Motionz Staff** tab.
3. **Fill In**:
   - Email: `csm@motionz.ai`
   - Staff Role: Click the **CSM** button.
4. **Submit**: Click **Sign In as Staff**.
5. **Expected Page**: Browser automatically redirects to `http://localhost:3000/csm`.
6. **What You Should See**:
   - CSM Workspace heading with assigned clients table.
   - `ABC Roofing` client listed with progress metrics.
7. **Test Admin-Only Route Denial**: In the browser URL bar, manually navigate to `http://localhost:3000/admin`.
   - **Expected Result**: Blocked! The browser redirects to `/auth/login?redirect=%2Fadmin&error=admin_required` or blocks access. CSM cannot enter `/admin`.
8. **Test Admin-Only API Denial**: In browser developer tools console (F12), run:
   ```javascript
   fetch('/api/admin/clients', { method: 'GET' }).then(r => console.log(r.status));
   ```
   - **Expected Result**: Prints `403` (Forbidden). CSM cannot call Admin APIs.
9. **Logout**: Click **Sign Out**. Access to `/csm` is immediately revoked.

---

## 5. Client Manual Test (Magic Link Invitation)

### Goal: Verify Client organization creation, magic link issuance, and portal onboarding.

1. **Login as Admin**: Sign in at `/auth/login` using `admin@motionz.ai`.
2. **Navigate to Clients**: Go to `/admin`.
3. **Add New Client**: Click **Add Client** (or create via Admin client creation wizard).
   - Name: `Pinnacle Roofing`
   - Primary Email: `david@pinnacleroofing.com`
   - Primary Contact: `David Pinnacle`
   - Phone: `(555) 777-9999`
4. **Retrieve Magic Link**:
   - The UI/API returns the single-use magic link: `http://localhost:3000/auth/verify?token=[TOKEN]`
   - *(Alternative fast test)*: On `/auth/login`, click the **Client Magic Link** tab, enter `john@abcroofing.com`, and click **Send Magic Link**. In development, the green card shows: `Demo Direct Access: Activate Magic Link Session`. Click the link.
5. **Open Invitation Link**: Click or paste the `/auth/verify?token=...` link into your browser.
6. **Expected Page**:
   - Browser displays "Validating your secure single-use access link...".
   - Shows "Session Established", then redirects to `http://localhost:3000/portal/abc-roofing` (or `http://localhost:3000/portal/[tenantId]`).
7. **What You Should See**:
   - Private client portal for ABC Roofing.
   - Onboarding Roadmap (5 Setup Steps).
   - Leads, Appointments, Contracts, Team, and Profile sections.
8. **Test Refresh**: Reload the page (`F5`). Portal stays open without re-authentication.
9. **Test Admin Denial**: In URL bar, try navigating to `http://localhost:3000/admin`.
   - **Expected Result**: Blocked! Redirected away from `/admin`. Client cannot view staff admin area.

---

## 6. Client Member Manual Test (Email + Phone Only)

### Goal: Verify team member invitation requires ONLY email and phone, enforces client_member role, and restricts privileges.

1. **Login as Client A**: Access `http://localhost:3000/portal/abc-roofing` using Client A's session.
2. **Open Team Section**: Click on the **Team** tab in the client portal navigation.
3. **Click Invite Team Member**:
   - **Notice**: Only two fields are displayed and required:
     - `Email Address`
     - `Phone Number`
   - *(Full Name has been removed per client requirements).*
4. **Fill In**:
   - Email: `dan.member@abcroofing.com`
   - Phone: `+1 (555) 444-1234`
5. **Submit**: Click **Send Invitation**.
6. **Retrieve Member Magic Link**:
   - A single-use link is generated: `http://localhost:3000/auth/verify?token=[MEMBER_TOKEN]`.
7. **Accept as Member**: In an Incognito window (or after logging out), open the member invitation link.
   - **Expected Result**: Token verified, browser redirects to `http://localhost:3000/portal/abc-roofing`.
8. **Verify Member Boundaries**:
   - Member can view leads, appointments, and operational tools (Roof Measurement).
   - Member **CANNOT** invite team members (the Invite button is hidden or fails with 403).
   - Member **CANNOT** modify company profile (Save button is disabled or fails with 403).
   - Member **CANNOT** access `/admin` or `/csm` (strictly redirected to login).

---

## 7. Wrong-Tenant Test (Horizontal Escalation Defense)

### Goal: Verify that a client belonging to Tenant A cannot access Tenant B's portal or data.

1. **Setup**:
   - Tenant A: `abc-roofing` (or ID `d0000000-0000-0000-0000-000000000001`)
   - Tenant B: Any other tenant ID (e.g. `summit-roof-masters` or `00000000-0000-0000-0000-000000000002`).
2. **Action 1 (URL Tampering)**:
   - Log in as Client A (`john@abcroofing.com`).
   - In browser URL bar, manually change URL from `/portal/abc-roofing` to:
     `http://localhost:3000/portal/summit-roof-masters`
   - **Expected Result**: Edge middleware catches the tenant mismatch and automatically redirects you back to your own portal (`/portal/abc-roofing`). You cannot view Tenant B's portal.
3. **Action 2 (API Tampering)**:
   - Open browser developer tools console (`F12` → `Console`).
   - Run:
     ```javascript
     fetch('/api/portal/summit-roof-masters/leads').then(r => r.json()).then(console.log);
     ```
   - **Expected Result**: Prints `{ error: "Forbidden: Unauthorized cross-tenant access attempt" }` (HTTP 403).
   - **Zero cross-tenant data is leaked**.

---

## 8. Invitation Security Tests

### Test 8.1: Valid Invitation
- **Action**: Create an invitation and open the magic link within 72 hours.
- **Expected Result**: Token is verified, session is established, and user enters portal.

### Test 8.2: Reused Token (Single-Use Enforcement)
- **Action**: Take the same magic link token you just used in Test 8.1 and paste it into the browser URL again.
- **Expected Result**: Page displays `Invalid or Expired Link`: `"This invitation has already been used. Please request a new link."` Access is denied.

### Test 8.3: Modified / Tampered Token
- **Action**: Open `http://localhost:3000/auth/verify?token=fake_random_tampered_token_12345`.
- **Expected Result**: Verification fails immediately with: `"This invitation is invalid or has expired."` Access is denied.

### Test 8.4: Expired Invitation
- **Action**: Attempt to verify an invitation created with `expiresInHours: -1`.
- **Expected Result**: Fails with `"This invitation link has expired (72-hour window exceeded)."` Access is denied.

### Test 8.5: Revoked Invitation
- **Action**: Admin revokes an invitation in the dashboard, then client clicks the link.
- **Expected Result**: Fails with `"This invitation has been revoked."` Access is denied.

### Test 8.6: Safe Resend Invalidation
- **Action**: Request a magic link twice for the same email address.
- **Expected Result**: The newest magic link works; the older magic link becomes invalid/revoked.

---

## 9. Session Security Test

1. **HttpOnly Cookie Verification**:
   - Log in as Admin.
   - Open DevTools (`F12`) → `Application` tab → `Cookies` → `http://localhost:3000`.
   - Inspect `motionz_session`:
     - `HttpOnly`: Checked (Cannot be read by `document.cookie` in console).
     - `SameSite`: `Lax`.
     - `Path`: `/`.
2. **Session Persistence**:
   - Close the browser tab. Open a new tab and navigate to `http://localhost:3000/admin`.
   - **Expected Result**: You are immediately recognized without being forced to log in again.
3. **Session Invalidation on Logout**:
   - Click **Sign Out**.
   - Inspect Cookies in DevTools: `motionz_session` has been removed.
   - Back button test: Click browser Back button. Page content either redirects to `/auth/login` or reloads as unauthenticated.

---

## 10. Staff Domain Policy Test

1. **Navigate to**: `http://localhost:3000/auth/login`.
2. **Select**: Motionz Staff tab.
3. **Enter External Email**: `intruder@gmail.com` or `hacker@externalfirm.com`.
4. **Click**: Sign In as Staff.
5. **Expected Result**:
   - Red error banner appears: `"Access denied. Internal staff access is restricted to verified @motionz.ai accounts."`
   - No session cookie is issued.
   - An intrusion alert is logged to `security_events` table in the database.

---

## 11. Open Redirect Defense Test

1. **Test Malicious Login Redirect**:
   - In browser URL bar, navigate to:
     `http://localhost:3000/auth/login?redirect=https://evil-phishing-site.example.com`
   - Sign in with `admin@motionz.ai`.
   - **Expected Result**: You are redirected to `/admin`. You are **never** redirected to `evil-phishing-site.example.com`.
2. **Test Protocol-Relative Redirect**:
   - Navigate to:
     `http://localhost:3000/auth/login?redirect=//evil-phishing-site.example.com`
   - Sign in with `admin@motionz.ai`.
   - **Expected Result**: Sanitized to `/admin`.
3. **Test Javascript Scheme Redirect**:
   - Navigate to:
     `http://localhost:3000/auth/login?redirect=javascript:alert(1)`
   - Sign in with `admin@motionz.ai`.
   - **Expected Result**: Sanitized to safe internal path `/admin`.

---

## 12. Final Manual Testing Checklist

Run through this final checklist in your browser:

- [ ] **Admin Login**: Sign in as `admin@motionz.ai` → lands on `/admin`.
- [ ] **Admin Persistence**: Refresh `/admin` → session persists.
- [ ] **Admin Logout**: Click Sign Out → redirected to `/auth/login`, access removed.
- [ ] **CSM Login**: Sign in as `csm@motionz.ai` → lands on `/csm`.
- [ ] **CSM Boundaries**: CSM attempting `/admin` is blocked.
- [ ] **External Staff Domain Blocked**: Entering non-`@motionz.ai` email displays clear error banner.
- [ ] **Client Magic Link**: Magic link generated and verified → lands on `/portal/[clientId]`.
- [ ] **Client Member Invitation**: Team invite requires ONLY email and phone.
- [ ] **Client Member Login**: Accepts invite → enters portal with `client_member` role.
- [ ] **Client Member Boundaries**: Member cannot invite others or modify profile.
- [ ] **Wrong Tenant Blocked (URL)**: Client A navigating to Client B's URL is redirected back to own portal.
- [ ] **Wrong Tenant Blocked (API)**: Client A fetching Client B API returns 403 Forbidden.
- [ ] **Client Blocked from Admin**: Client navigating to `/admin` is denied.
- [ ] **Reused Invitation Blocked**: Second click on used magic link shows "already used" error.
- [ ] **Tampered Token Blocked**: Malformed token link fails verification.
- [ ] **Resend Policy**: New invitation supersedes previous pending link.
- [ ] **Open Redirect Blocked**: Malicious `redirect` parameter stripped to safe fallback.
- [ ] **HttpOnly Cookie**: `motionz_session` has `HttpOnly`, `SameSite=Lax`, and `Secure` attributes.
