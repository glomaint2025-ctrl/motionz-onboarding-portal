# Phase 2: Entity Relationship Diagram (ERD)

This document visually models the relational schema for the **Motionz Onboarding Portal** using Mermaid ER syntax.

---

## 1. Complete Relational ERD

```mermaid
erDiagram
    portal_templates ||--o{ template_steps : "defines"
    portal_templates ||--o{ tenants : "templates"
    template_steps ||--o{ onboarding_steps : "instantiates"
    
    tenants ||--o{ users : "employs"
    tenants ||--o{ csm_assignments : "assigned_to"
    users ||--o{ csm_assignments : "manages"
    
    tenants ||--o{ onboarding_steps : "tracks"
    tenants ||--o{ contracts : "stores"
    tenants ||--o{ orders : "orders"
    tenants ||--o{ website_requests : "submits"
    tenants ||--o{ audit_logs : "records"
    users ||--o{ audit_logs : "triggers"

    portal_templates {
        UUID id PK
        VARCHAR title
        VARCHAR slug UK
        TEXT description
        VARCHAR version
        JSONB default_feature_flags
        TIMESTAMPTZ created_at
        TIMESTAMPTZ updated_at
    }

    template_steps {
        UUID id PK
        UUID template_id FK
        VARCHAR step_key
        INTEGER phase_number
        VARCHAR phase_title
        VARCHAR label
        step_owner owner
        TEXT what_it_is
        JSONB doing_descriptions
        TEXT client_need
        TEXT unlocks
        INTEGER sort_order
    }

    tenants {
        UUID id PK
        VARCHAR name
        VARCHAR slug UK
        UUID template_id FK
        VARCHAR package_name
        VARCHAR status
        BOOLEAN launch_ready
        VARCHAR website_url
        VARCHAR business_phone
        VARCHAR state_code
        VARCHAR city
        TEXT street_address
        VARCHAR ghl_location_id
        TEXT ghl_api_key_enc
        JSONB feature_flags
        JSONB brand_kit
        TIMESTAMPTZ created_at
        TIMESTAMPTZ updated_at
        TIMESTAMPTZ deleted_at
    }

    users {
        UUID id PK
        VARCHAR email UK
        VARCHAR full_name
        user_role role
        UUID tenant_id FK
        VARCHAR phone
        TEXT avatar_url
        BOOLEAN two_factor_enabled
        TIMESTAMPTZ created_at
        TIMESTAMPTZ updated_at
    }

    csm_assignments {
        UUID id PK
        UUID csm_user_id FK
        UUID tenant_id FK
        TIMESTAMPTZ assigned_at
    }

    onboarding_steps {
        UUID id PK
        UUID tenant_id FK
        UUID template_step_id FK
        VARCHAR step_key
        INTEGER phase_number
        VARCHAR phase_title
        VARCHAR label
        step_owner owner
        step_status status
        TEXT what_it_is
        TEXT doing_text
        TEXT client_need
        TEXT unlocks
        INTEGER sort_order
        TIMESTAMPTZ completed_at
        TIMESTAMPTZ updated_at
    }

    contracts {
        UUID id PK
        UUID tenant_id FK
        VARCHAR title
        VARCHAR document_category
        TEXT storage_path
        VARCHAR mime_type
        BIGINT file_size_bytes
        UUID uploaded_by FK
        TIMESTAMPTZ created_at
    }

    orders {
        UUID id PK
        UUID tenant_id FK
        VARCHAR label
        order_stage stage
        VARCHAR carrier_name
        VARCHAR tracking_number
        TEXT tracking_url
        TEXT issue_notes
        TIMESTAMPTZ created_at
        TIMESTAMPTZ updated_at
    }

    website_requests {
        UUID id PK
        UUID tenant_id FK
        UUID submitted_by FK
        TEXT description
        JSONB attachment_urls
        VARCHAR status
        TIMESTAMPTZ completed_at
        TIMESTAMPTZ created_at
    }

    audit_logs {
        UUID id PK
        UUID tenant_id FK
        UUID actor_user_id FK
        VARCHAR actor_email
        VARCHAR actor_role
        VARCHAR action_event
        VARCHAR resource_id
        JSONB metadata
        TIMESTAMPTZ created_at
    }
```
