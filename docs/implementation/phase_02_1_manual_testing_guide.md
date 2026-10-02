# Phase 02.1 Manual UI Testing Guide

This guide provides exact, step-by-step browser testing instructions for the production authentication experience.

The application base URL is configured dynamically via the environment variable:
- **`NEXTAUTH_URL`** (in `.env.local` or hosting provider environment, e.g. `${NEXTAUTH_URL}`)

All test steps below use standard clean routes (e.g. `/`, `/admin`, `/csm`, `/auth/login`, `/api/auth/login`), resolving directly against your configured `${NEXTAUTH_URL}`.

Connected database: Live Supabase Cloud (`hagqtrhgetyrubvcskij.supabase.co`).

---

## 1. Test Accounts & Supabase Auth Credentials

| User Type | Email | Password | Role | Tenant ID / Company | Creation Method | Database Status |
| :--- | :--- | :--- | :---: | :--- | :--- | :--- |
| **Admin** | `admin@motionz.ai` | `password` | `admin` | None (Platform-wide) | Supabase Auth + `public.users` | Ready in live database |
| **CSM** | `csm@motionz.ai` | `password` | `csm` | None (Internal staff) | Supabase Auth + `public.users` | Ready in live database |
| **Client A (Owner)** | `john@abcroofing.com` | `password` | `client` | `4f3c7e8a-92b1-4d3a-8f5c-1a2b3c4d5e6f` (ABC Roofing) | Seeded | Ready in live database |
| **Client Member A** | `sarah@abcroofing.com` | `password` | `client_member` | `4f3c7e8a-92b1-4d3a-8f5c-1a2b3c4d5e6f` (ABC Roofing) | Seeded | Ready in live database |
| **Client B (Target)** | `mike@summitpro.com` | `password` | `client` | `08197e5a-351d-4b5b-a73e-4b471ca198cf` (Summit Pro) | Seeded | Ready in live database |

---

## 2. Production UI Architecture Overview

1. **Smart Root Route Redirection (`/`)**:
   - If **unauthenticated**: Automatically navigates to the unified **Sign In** (`/auth/login`).
   - If **authenticated**: Validates the session cookie and dynamically redirects to the role's dashboard:
     - `admin` &rarr; `/admin`
     - `csm` &rarr; `/csm`
     - `client` / `client_member` &rarr; `/portal/[tenantId]`
2. **Unified Email + Password Sign In (`/auth/login`)**:
   - All users (clients and staff) sign in via the same clean form: **Email** and **Password**.
   - No public "Send Magic Link" button.
   - The server verifies credentials and authoritatively determines the role and destination:
     - Staff (`admin`) &rarr; `/admin`
     - Staff (`csm`) &rarr; `/csm`
     - Client / Member &rarr; `/portal/[tenantId]`
   - Full browser password manager support (`name="username"`, `name="password"`, `navigator.credentials.store()`).
3. **Invitation & Password Setup Flow (`/auth/verify?token=...`)**:
   - Clients are invited strictly by Admin or CSM staff (or team members invited by the client owner).
   - The invitation link directs the user to `/auth/verify?token=[TOKEN]` where they set their password to complete registration.
   - Once set, the account is activated and they log in via `/auth/login` using their Email & Password.

---

## 3. Step-by-Step Manual Test Journeys

### Test 1: Smart Root Route (`/`) Redirection

- **Route to Enter**: `/`
- **Steps**:
  1. Open an incognito browser window (unauthenticated).
  2. Enter `/`.
  3. Notice: The browser immediately redirects to `/auth/login` (Sign In).
  4. Log in as Admin (`admin@motionz.ai` / `password`).
  5. Enter `/` again in the address bar.
  6. Notice: The browser validates your session and automatically redirects directly to `/admin`!
  7. Log out, then log in as CSM (`csm@motionz.ai` / `password`).
  8. Enter `/` again.
  9. Notice: The browser validates your session and automatically redirects directly to `/csm`!

---

### Test 2: Unified Staff Sign In (`/admin` and `/csm`)

- **Route to Enter**: `/admin` OR `/csm`
- **Steps**:
  1. Open an unauthenticated browser window.
  2. Enter either `/admin` or `/csm`.
  3. Notice: Redirects to the unified **Sign In** page.
  4. Test Admin auto-redirection:
     - Email: `admin@motionz.ai`
     - Password: `password`
     - Click **Sign In**.
     - Notice browser prompt asking to save credentials.
     - **Expected**: Authenticates and auto-redirects directly to `/admin`.
  5. Test CSM auto-redirection:
     - Log out, then sign in with:
       - Email: `csm@motionz.ai`
       - Password: `password`
     - Click **Sign In**.
     - **Expected**: Authenticates and auto-redirects directly to `/csm`.

---

### Test 3: Client Organization Sign In (`/auth/login`)

- **Route to Enter**: `/auth/login`
- **Steps**:
  1. Open `/auth/login`.
  2. Enter Client Owner credentials:
     - Email: `john@abcroofing.com`
     - Password: `password`
  3. Click **Sign In**.
- **Expected Result**:
  - Authenticates and auto-redirects directly to ABC Roofing portal: `/portal/4f3c7e8a-92b1-4d3a-8f5c-1a2b3c4d5e6f`.
  - Onboarding setup steps and progress are visible.

---

### Test 4: Client Member Sign In (`/auth/login`)

- **Route to Enter**: `/auth/login`
- **Steps**:
  1. Open `/auth/login`.
  2. Enter Client Member credentials:
     - Email: `sarah@abcroofing.com`
     - Password: `password`
  3. Click **Sign In**.
- **Expected Result**:
  - Authenticates and auto-redirects directly to ABC Roofing portal: `/portal/4f3c7e8a-92b1-4d3a-8f5c-1a2b3c4d5e6f`.
  - Role is strictly `client_member` (cannot access `/admin` or `/csm`).

---

### Test 5: Credential Error Validation (Email Priority, Then Password)

#### 5A. Unregistered Email Test (Email Error Priority)
- **Route**: `/auth/login`
- **Steps**:
  1. Enter an unregistered email: `unknown@motionz.ai` or `unknown@company.com`.
  2. Enter any password.
  3. Click **Sign In**.
- **Expected Result**:
  - Request is rejected with HTTP 403.
  - Red banner displays: `"This email is not registered as a Motionz staff account."` (for `@motionz.ai`) or `"This email is not registered as a client account."`.

#### 5B. Registered Email with Wrong Password Test
- **Route**: `/auth/login`
- **Steps**:
  1. Enter: `admin@motionz.ai` or `john@abcroofing.com`.
  2. Password: `WrongPassword123!`.
  3. Click **Sign In**.
- **Expected Result**:
  - Request is rejected with HTTP 403.
  - Red banner displays: `"Incorrect password. Please try again."`
  - No session cookie is created.

---

### Test 6: Invitation & Password Setup Flow

- **Route**: `/portal/d0000000-0000-0000-0000-000000000001/team`
- **Steps**:
  1. Log in as Client Owner (`john@abcroofing.com`).
  2. In Team Members, click **Invite Team Member**.
  3. Enter email `new.estimator@abcroofing.com` and phone `(555) 345-6789`.
  4. Click **Generate Invitation**.
  5. Open the invitation link in an incognito window: `/auth/verify?token=[TOKEN]`.
  6. Notice the **Complete Account Setup** page:
     - Enter new password: `NewPassword2026!`
     - Confirm password: `NewPassword2026!`
     - Click **Save Password & Enter Portal**.
- **Expected Result**:
  - Account setup completes, session is established, and user enters the portal.
  - User can now log out and log in directly at `/auth/login` using `new.estimator@abcroofing.com` and `NewPassword2026!`.

#### 6B. Old / Already Used Invitation Link Test (Pre-validation before Password Form)
- **Route**: `/auth/verify?token=[ALREADY_USED_TOKEN]`
- **Steps**:
  1. Copy the exact invitation link that was just used in Test 6.
  2. Open a new incognito window and navigate to `/auth/verify?token=[ALREADY_USED_TOKEN]`.
- **Expected Result**:
  - The page immediately validates the token on load before displaying any password inputs.
  - The password fields are **NEVER shown**.
  - A clean "Invalid or Expired Link" card is displayed:
    - Message: `"This invitation has already been used. Please sign in with your email and password."`
    - Action button: **Go to Sign In** directing the user directly to `/auth/login`.

#### 6C. Revoke Invitation & Confirmation Modal Test
- **Route**: `/portal/d0000000-0000-0000-0000-000000000001/team`
- **Steps**:
  1. Log in as Client Owner (`john@abcroofing.com`).
  2. Notice that **Active Team Members** (such as John Smith, Sarah Connor, etc.) are strictly excluded from **Pending Invitations**.
  3. Invite a test member (e.g. `temp.member@abcroofing.com`).
  4. In the **Pending Invitations** card, copy the generated invitation link, then find the card showing `temp.member@abcroofing.com` with the **Revoke** button.
  5. Click **Revoke**.
  6. Notice the confirmation dialog appears:
     - Title: **Revoke Invitation**
     - Message: *"Are you sure you want to revoke and delete the pending invitation for temp.member@abcroofing.com?"*
     - Warning: *"⚠️ Once revoked, the invitation link will immediately become invalid. The recipient will not be able to complete account setup or set a password with it."*
  7. Click **Yes, Revoke Invitation**.
- **Expected Result**:
  - The invitation is revoked and immediately removed from the **Pending Invitations** list.
  - Open the copied invitation link in an incognito window: `/auth/verify?token=[REVOKED_TOKEN]`.
  - The pre-validation immediately shows **Invalid or Expired Link** with the message `"This invitation has been revoked."`
  - No password fields or account setup forms are rendered.

---

### Test 7: Logout & Session Invalidation

- **Route**: Any active portal page
- **Steps**:
  1. Click **Sign Out**.
  2. Notice redirect back to `/auth/login`.
  3. Press browser **Back** button.
- **Expected Result**:
  - Session cookie is cleared.
  - Edge middleware redirects back to `/auth/login`.
