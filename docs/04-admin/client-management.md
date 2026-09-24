# Phase 4: Client Management & Provisioning Workflows

This document specifies the operational workflows for creating, customizing, managing, and archiving client portals.

---

## 1. Client Provisioning Sequence (From Master Template)

The creation of a new client portal is automated via the **Template Cloner**:

```mermaid
sequenceDiagram
    autonumber
    actor Admin as Admin / CSM
    participant UI as Admin Portal UI
    participant Backend as Next.js Server Action
    participant DB as PostgreSQL Database
    participant Storage as Supabase Storage

    Admin->>UI: Clicks "+ New Client Portal"
    Admin->>UI: Selects Master Template, inputs Company Name, Owner Email, State, Package
    UI->>Backend: Submit provisioning payload
    
    Backend->>DB: Start Transaction
    Backend->>DB: 1. Insert new tenant record (tenants)
    Backend->>DB: 2. Query baseline steps from template_steps
    Backend->>DB: 3. Bulk insert into onboarding_steps (scoped to new tenant_id)
    Backend->>DB: 4. Insert client owner record into users (with invitation token)
    Backend->>DB: 5. Assign designated CSM (csm_assignments)
    Backend->>DB: 6. Record audit log (action: 'portal.provision')
    Backend->>DB: Commit Transaction
    
    Backend->>Storage: Create private tenant bucket folder: /tenants/[tenantId]/
    Backend-->>UI: Return new portal slug (/portal/apex-roofing) & Invitation Link
    UI-->>Admin: Display success modal with one-click copy invitation link
```

---

## 2. Client Profile & Configuration Overrides

Admins can customize any provisioned portal via the **Client Settings Panel**:
- **Business Identity**: Company legal name, DBA, address, city, state, postal code.
- **Assigned CSM**: Change or reassign primary CSM.
- **GoHighLevel Integration**: Configure Sub-Account Location ID and API Key.
- **Custom Links**: Set custom website URL, booking calendar URL, and tracking sheet URL.
- **LLC & Tax Data**: View state filing status, EIN, and state file number.
- **Package Tier**: Select package name and set lead quota limits.

---

## 3. Portal Lifecycle States

```mermaid
stateDiagram-v2
    [*] --> Onboarding: Provisioned from Template
    Onboarding --> Active: Launch Ready (All Steps Done)
    Active --> Paused: Temporary Inactivity / Payment Hold
    Paused --> Active: Resumed
    Active --> Cancelled: Client Churn
    Cancelled --> SoftDeleted: Admin Soft-Delete (Archive)
    SoftDeleted --> Active: Admin Restore
    SoftDeleted --> [*]: Hard Purge (Permanent Database Delete)
```

- **Soft-Delete Safeguard**: Deleting a portal flags `deleted_at = NOW()`. The portal immediately becomes inaccessible to clients and CSMs, but records are retained for **30 days** before permanent purge.
