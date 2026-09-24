# Motionz Platform Administrator Operations Manual

This guide provides end-to-end operational instructions for Motionz Platform Administrators to operate, monitor, manage clients, configure integrations, and secure the portal platform.

---

## 1. Authentication & Security Access

1. Log in at `https://portal.motionz.ai/admin` or `/auth/login`.
2. **Access Policy**: Only authorized email addresses ending in `@motionz.ai` are permitted access to the administrative shell.
3. System uses 72-hour single-use magic links with SHA-256 token hashing and HMAC-signed session cookies.
4. Any non-staff attempt to authenticate to `/admin` triggers an immediate `SEC-001` intrusion security alert.

---

## 2. Provisioning a New Client Portal

1. In the navigation, click **Clients** (`/admin/clients`).
2. Click the text button **Add Client**.
3. In the creation wizard:
   - **Company Legal Name**: Legal entity (e.g. `ABC Roofing LLC`).
   - **URL Slug**: Unique identifier (e.g. `abc-roofing`).
   - **Owner Full Name & Email**: Primary client contact details.
   - **Phone**: Contact phone number.
   - **Master Template**: Select blueprint (e.g. `Master Roofing Onboarding Template`).
   - **Assigned CSM**: Dedicated customer success manager (e.g. `csm@motionz.ai`).
4. Click **Create Client Portal**.
5. The system automatically:
   - Generates a globally unique tenant record.
   - Clones the 5 confirmed onboarding steps independently into the tenant's database record.
   - Clones default feature toggles.
   - Assigns the specified CSM.
   - Records an administrative audit trail entry.
6. Copy the private portal URL (`/portal/[clientId]`) or generate a magic-link invitation for the client owner.

---

## 3. Managing Feature Toggles per Client

1. Navigate to `/admin/clients` and select the target client.
2. Under the **Feature Modules** panel, toggle desired modules on or off:
   - `Roof Measurement Tool`: Interactive roof square & pitch calculator.
   - `Video Scripts`: Template-based variable interpolation generator.
   - `Lead Pipeline`: CRM synchronized lead & appointment tracking.
   - `Orders Tracker`: Supply and equipment shipment tracking.
   - `Signed Contracts Vault`: Repository of signed agreements.
3. Click **Save Changes**. Feature switches take effect instantly for the client's session without application restarts.

---

## 4. Master Script Template Management

1. Navigate to `/admin/templates/scripts` (`/admin/templates/scripts`).
2. Manage baseline script templates available across all client portals:
   - **Roof Restoration Pitch**: Residential and commercial restoration scripts with `{client_name}`, `{company_name}`, `{phone}`, `{state}`, and `{custom_hook}` variables.
   - **Customer Testimonial Request**: Follow-up satisfaction scripts.
   - **Company Introduction Video**: Standard video scripts for dealer branding.
3. Edit title, description, category, and template body text with interpolation tags.
4. Click **Save Template**.

---

## 5. Security Audit Log & Event Explorer

1. Navigate to `/admin/security` (`/admin/security`).
2. Filter logs by severity (`Critical`, `High`, `Medium`, `Info`), event code, or tenant ID.
3. Inspect security events:
   - `SEC-001`: Unauthorized staff domain login attempt.
   - `SEC-002`: Cross-tenant IDOR access attempt blocked.
   - `SEC-003`: Excessive request rate throttling triggered.
   - `SEC-004`: Suspicious input payload detected and neutralized.
4. View actor email, IP address, user agent, and timestamp.
