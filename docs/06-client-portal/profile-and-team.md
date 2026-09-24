# Phase 6: Client Portal — Profile, Business Identity & Team Management

The Profile & Business module aggregates the client's corporate legal identity, company profile, team delegation, and payment account verification.

---

## 1. Business Identity Card (Key Identifiers)

To ensure dealers and reps never have to hunt for tax filings, the page pins a high-visibility **Business Identity Card**:

| Identifier Tile | Description | Source / Status State |
| :--- | :--- | :--- |
| **EIN (Federal Tax ID)** | IRS Employer Identification Number | Populated upon EIN letter ingestion (e.g. `XX-XXXXXXX`) |
| **SSN (Encrypted Last-4)** | Owner Social Security Number | Stored encrypted; display strictly masked (`***-**-1234 • on file`) |
| **LLC Status** | State registration milestone | Formed date or live progress stage (`Filing prepared`, `Submitted`, etc.) |
| **LLC State File #** | Official Secretary of State entity number | Ingested upon state filing approval |

---

## 2. Company Details & Overview

A clean key-value grid details the operational attributes:
- **Business Name**: Legal entity and DBA trade name.
- **Owner Name**: Primary account holder name.
- **Package Tier**: Current Motionz service level.
- **Location & Address**: Physical headquarters and service radius.
- **Contact Email & Phone**: Official correspondence channels.
- **Live Website**: Verified domain URL with link button (`Visit my website →`).
- **Business Phone**: Dedicated A2P compliant calling/texting number.

---

## 3. Team Member Management

Client Owners have the authority to delegate portal access to company employees:
- **Team Roster Grid**: Displays active team members, email addresses, assigned roles (`Client Team Member`), and status (`Active` vs `Invite Pending`).
- **Invite Modal**: Client Owner inputs the employee's name and email. The system dispatches a tokenized invitation link.
- **Revocation**: Client Owner can revoke an employee's access at any time, immediately invalidating active session tokens.

---

## 4. Payment Account & KYC Status (Whop Integration)

If the payment module feature toggle is active:
- **Account State Verification**: Calls `/api/whop-connect?action=status`.
- **Status Badges**:
  - `Verified`: Ready to accept customer payments and receive merchant payouts.
  - `Action Required`: Whop hosted identity check requires specific documents (e.g. EIN letter, DBA proof). Direct button opens Whop hosted verification.
  - `Pending Review`: Identity check undergoing manual or automated underwriter review.
