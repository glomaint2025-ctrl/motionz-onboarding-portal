# Phase 2: Entity Relationships & Cardinality

This document defines the relational integrity, foreign key cascading rules, and relational constraints between system entities.

---

## 1. Cardinality & Relationship Matrix

```mermaid
classDiagram
    direction TB

    class portal_templates {
        UUID id PK
        VARCHAR title
        VARCHAR slug UK
    }

    class template_steps {
        UUID id PK
        UUID template_id FK
        VARCHAR step_key
        INTEGER sort_order
    }

    class tenants {
        UUID id PK
        UUID template_id FK
        VARCHAR name
        VARCHAR slug UK
    }

    class users {
        UUID id PK
        UUID tenant_id FK
        VARCHAR email UK
        user_role role
    }

    class csm_assignments {
        UUID id PK
        UUID csm_user_id FK
        UUID tenant_id FK
    }

    class onboarding_steps {
        UUID id PK
        UUID tenant_id FK
        UUID template_step_id FK
        VARCHAR step_key
        step_status status
    }

    class contracts {
        UUID id PK
        UUID tenant_id FK
        VARCHAR title
        TEXT storage_path
    }

    class orders {
        UUID id PK
        UUID tenant_id FK
        VARCHAR label
        order_stage stage
    }

    class website_requests {
        UUID id PK
        UUID tenant_id FK
        UUID submitted_by FK
        TEXT description
    }

    class audit_logs {
        UUID id PK
        UUID tenant_id FK
        UUID actor_user_id FK
        VARCHAR action_event
    }

    portal_templates "1" --> "0..*" template_steps : contains
    portal_templates "1" --> "0..*" tenants : clones_into
    template_steps "1" --> "0..*" onboarding_steps : instantiates
    tenants "1" --> "0..*" onboarding_steps : owns
    tenants "1" --> "0..*" users : employs
    tenants "1" --> "0..*" csm_assignments : assigned_to
    users "1" --> "0..*" csm_assignments : manages
    tenants "1" --> "0..*" contracts : stores
    tenants "1" --> "0..*" orders : tracks
    tenants "1" --> "0..*" website_requests : submits
    tenants "1" --> "0..*" audit_logs : logs
```

---

## 2. Foreign Key & Deletion Cascade Policies

| Parent Table | Child Table | Foreign Key Column | Cascade Policy | Architectural Justification |
| :--- | :--- | :--- | :--- | :--- |
| `portal_templates` | `template_steps` | `template_id` | `ON DELETE CASCADE` | Deleting a template removes its baseline steps. |
| `portal_templates` | `tenants` | `template_id` | `ON DELETE SET NULL` | Deleting a template does not delete active client portals; portals retain their cloned data. |
| `tenants` | `onboarding_steps`| `tenant_id` | `ON DELETE CASCADE` | Permanently deleting a tenant purges its specific onboarding milestones. |
| `tenants` | `users` | `tenant_id` | `ON DELETE CASCADE` | Deleting a client tenant removes associated client-tier logins. |
| `tenants` | `csm_assignments` | `tenant_id` | `ON DELETE CASCADE` | Removing a tenant dissolves active CSM assignments. |
| `tenants` | `contracts` | `tenant_id` | `ON DELETE CASCADE` | Deleting a tenant purges document metadata (storage objects cleaned via lifecycle hooks). |
| `tenants` | `orders` | `tenant_id` | `ON DELETE CASCADE` | Deleting a tenant cleanses shipping records. |
| `tenants` | `website_requests`| `tenant_id` | `ON DELETE CASCADE` | Deleting a tenant cleanses support tickets. |
| `users` | `audit_logs` | `actor_user_id` | `ON DELETE SET NULL` | Audit logs are immutable; deleting a user preserves historical audit records with user ID set to null. |
