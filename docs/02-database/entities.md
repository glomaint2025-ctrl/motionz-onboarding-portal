# Phase 2: Entity Dictionary & Table Specifications

This document specifies the PostgreSQL tables, attributes, and constraints for the **Motionz Onboarding Portal**.

---

## 1. Core Tenant & User Entities

### 1.1. `tenants` (Client Organizations & Portals)
Represents a distinct client organization / dealer portal.
| Column | Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `id` | UUID | PRIMARY KEY, DEFAULT gen_random_uuid() | Unique tenant identifier |
| `name` | VARCHAR(255) | NOT NULL | Client company / legal business name |
| `slug` | VARCHAR(100) | UNIQUE, NOT NULL | URL-friendly identifier (e.g. `stephen-cuccia`) |
| `template_id` | UUID | REFERENCES portal_templates(id) | Source Master Portal Template used to provision |
| `package_name` | VARCHAR(100) | NULLABLE | Client service tier (e.g. `Enterprise Growth`) |
| `status` | VARCHAR(50) | DEFAULT 'active' | Tenant status (`active`, `onboarding`, `cancelled`) |
| `launch_ready` | BOOLEAN | DEFAULT FALSE | Flag indicating all onboarding phases are complete |
| `website_url` | VARCHAR(500) | NULLABLE | Client dealer website URL |
| `business_phone` | VARCHAR(50) | NULLABLE | Provisioned A2P business phone number |
| `state_code` | VARCHAR(10) | NULLABLE | State of business formation (e.g. `OH`, `TX`) |
| `city` | VARCHAR(100) | NULLABLE | City of operation |
| `street_address` | TEXT | NULLABLE | Physical business address |
| `ghl_location_id` | VARCHAR(100) | NULLABLE | GoHighLevel sub-account location identifier |
| `ghl_api_key_enc` | TEXT | NULLABLE | AES-256-GCM encrypted GHL Location API key |
| `feature_flags` | JSONB | DEFAULT '{}'::JSONB | Feature toggle matrix for this tenant |
| `brand_kit` | JSONB | DEFAULT '{}'::JSONB | Accent colors, logo URLs, business typography |
| `created_at` | TIMESTAMPTZ | DEFAULT NOW() | Record creation timestamp |
| `updated_at` | TIMESTAMPTZ | DEFAULT NOW() | Last record update timestamp |
| `deleted_at` | TIMESTAMPTZ | NULLABLE | Soft-deletion timestamp |

### 1.2. `users` (System Actors)
Represents authenticated individuals across all four roles.
| Column | Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `id` | UUID | PRIMARY KEY, DEFAULT gen_random_uuid() | Unique user identifier |
| `email` | VARCHAR(255) | UNIQUE, NOT NULL | User email address |
| `full_name` | VARCHAR(255) | NOT NULL | Display name |
| `role` | user_role | NOT NULL | System role (`admin`, `csm`, `client`, `client_member`) |
| `tenant_id` | UUID | NULLABLE, REFERENCES tenants(id) | Organization tenant ID (NULL for Admin / CSM) |
| `phone` | VARCHAR(50) | NULLABLE | Contact telephone |
| `avatar_url` | TEXT | NULLABLE | Profile photo URL |
| `two_factor_enabled` | BOOLEAN | DEFAULT FALSE | 2FA / MFA status |
| `created_at` | TIMESTAMPTZ | DEFAULT NOW() | Timestamp |
| `updated_at` | TIMESTAMPTZ | DEFAULT NOW() | Timestamp |

### 1.3. `csm_assignments`
Maps CSM staff members to assigned client tenants.
| Column | Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `id` | UUID | PRIMARY KEY, DEFAULT gen_random_uuid() | Unique ID |
| `csm_user_id` | UUID | NOT NULL, REFERENCES users(id) | CSM user ID |
| `tenant_id` | UUID | NOT NULL, REFERENCES tenants(id) | Assigned client tenant |
| `assigned_at` | TIMESTAMPTZ | DEFAULT NOW() | Assignment date |

---

## 2. Template & Onboarding Entities

### 2.1. `portal_templates` (Master Portal Templates)
Defines baseline portal configuration and blueprints.
| Column | Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `id` | UUID | PRIMARY KEY, DEFAULT gen_random_uuid() | Unique template ID |
| `title` | VARCHAR(255) | NOT NULL | Template name (e.g. `Master Roofing Template`) |
| `slug` | VARCHAR(100) | UNIQUE, NOT NULL | Template code (e.g. `master-roofing-v1`) |
| `description` | TEXT | NULLABLE | Summary of template purpose |
| `version` | VARCHAR(50) | DEFAULT '1.0.0' | Semantic template version |
| `default_feature_flags` | JSONB | DEFAULT '{}'::JSONB | Baseline feature flag configurations |
| `created_at` | TIMESTAMPTZ | DEFAULT NOW() | Timestamp |
| `updated_at` | TIMESTAMPTZ | DEFAULT NOW() | Timestamp |

### 2.2. `template_steps` (Master Template Steps)
Baseline steps cloned when provisioning a new client portal.
| Column | Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `id` | UUID | PRIMARY KEY, DEFAULT gen_random_uuid() | Unique step ID |
| `template_id` | UUID | NOT NULL, REFERENCES portal_templates(id) | Master template reference |
| `step_key` | VARCHAR(100) | NOT NULL | Semantic identifier (e.g. `llc`, `crm`, `phone`) |
| `phase_number` | INTEGER | NOT NULL | Onboarding phase (1, 2, 3, etc.) |
| `phase_title` | VARCHAR(100) | NOT NULL | Phase label (e.g. `Get Legal`) |
| `label` | VARCHAR(255) | NOT NULL | Display name of the step |
| `owner` | step_owner | NOT NULL | `we_handle` or `client_action` |
| `what_it_is` | TEXT | NOT NULL | Explanatory description |
| `doing_descriptions` | JSONB | NOT NULL | Explanations per status (`pending`, `active`, etc.) |
| `client_need` | TEXT | NULLABLE | What is required from the client |
| `unlocks` | TEXT | NOT NULL | Capability unlocked upon completion |
| `sort_order` | INTEGER | NOT NULL | Sequence ordering |

### 2.3. `onboarding_steps` (Client-Specific Onboarding Milestones)
Instantiated per tenant; customizable by Admin and CSM.
| Column | Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `id` | UUID | PRIMARY KEY, DEFAULT gen_random_uuid() | Unique step ID |
| `tenant_id` | UUID | NOT NULL, REFERENCES tenants(id) | Owning client tenant |
| `template_step_id` | UUID | NULLABLE, REFERENCES template_steps(id) | Upstream template step reference |
| `step_key` | VARCHAR(100) | NOT NULL | Step key (`llc`, `bank`, `crm`, `phone`, etc.) |
| `phase_number` | INTEGER | NOT NULL | Phase number |
| `phase_title` | VARCHAR(100) | NOT NULL | Phase title |
| `label` | VARCHAR(255) | NOT NULL | Step display title |
| `owner` | step_owner | NOT NULL | Ownership tag |
| `status` | step_status | DEFAULT 'not_started' | Current status |
| `what_it_is` | TEXT | NOT NULL | Explanation |
| `doing_text` | TEXT | NULLABLE | Real-time progress update for client |
| `client_need` | TEXT | NULLABLE | Action required from client |
| `unlocks` | TEXT | NOT NULL | Unlock description |
| `sort_order` | INTEGER | NOT NULL | Sequence |
| `completed_at` | TIMESTAMPTZ | NULLABLE | Timestamp when marked `done` |
| `updated_at` | TIMESTAMPTZ | DEFAULT NOW() | Timestamp |

---

## 3. Operational & Client Asset Entities

### 3.1. `contracts` (Signed Agreements & LLC Legal Records)
Stores metadata for executed client contracts and official filing certificates.
| Column | Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `id` | UUID | PRIMARY KEY, DEFAULT gen_random_uuid() | Unique record ID |
| `tenant_id` | UUID | NOT NULL, REFERENCES tenants(id) | Owning client tenant |
| `title` | VARCHAR(255) | NOT NULL | Document title (e.g. `Signed Dealer Agreement`) |
| `document_category` | VARCHAR(50) | NOT NULL | `agreement`, `llc_cert`, `ein_letter`, `insurance` |
| `storage_path` | TEXT | NOT NULL | Private Supabase Storage object key |
| `mime_type` | VARCHAR(100) | DEFAULT 'application/pdf' | File MIME type |
| `file_size_bytes` | BIGINT | NOT NULL | File size |
| `uploaded_by` | UUID | NULLABLE, REFERENCES users(id) | Admin/CSM user who uploaded |
| `created_at` | TIMESTAMPTZ | DEFAULT NOW() | Upload timestamp |

### 3.2. `orders` (Product Orders & Shipping Pipeline)
Tracks physical product fulfillment and carrier tracking.
| Column | Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `id` | UUID | PRIMARY KEY, DEFAULT gen_random_uuid() | Unique order ID |
| `tenant_id` | UUID | NOT NULL, REFERENCES tenants(id) | Owning client tenant |
| `label` | VARCHAR(255) | NOT NULL | Order label (e.g. `Initial Chemical Package`) |
| `stage` | order_stage | DEFAULT 'ordered' | `ordered`, `packaged`, `shipped`, `delivered`, `issue` |
| `carrier_name` | VARCHAR(100) | NULLABLE | Freight carrier (e.g. `FedEx Freight`, `R+L`) |
| `tracking_number` | VARCHAR(255) | NULLABLE | Public tracking identifier |
| `tracking_url` | TEXT | NULLABLE | Direct carrier tracking URL |
| `issue_notes` | TEXT | NULLABLE | Internal notes if status is `issue` |
| `created_at` | TIMESTAMPTZ | DEFAULT NOW() | Timestamp |
| `updated_at` | TIMESTAMPTZ | DEFAULT NOW() | Timestamp |

### 3.3. `website_requests` (Website Modification Tickets)
Client-submitted change requests for their dealer website.
| Column | Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `id` | UUID | PRIMARY KEY, DEFAULT gen_random_uuid() | Unique ticket ID |
| `tenant_id` | UUID | NOT NULL, REFERENCES tenants(id) | Owning client tenant |
| `submitted_by` | UUID | NOT NULL, REFERENCES users(id) | Submitting client user |
| `description` | TEXT | NOT NULL | Detailed change request instructions |
| `attachment_urls` | JSONB | DEFAULT '[]'::JSONB | Array of uploaded image/PDF asset URLs |
| `status` | VARCHAR(50) | DEFAULT 'pending' | `pending`, `in_progress`, `completed`, `declined` |
| `completed_at` | TIMESTAMPTZ | NULLABLE | Timestamp completed |
| `created_at` | TIMESTAMPTZ | DEFAULT NOW() | Timestamp |

### 3.4. `audit_logs` (Security & Activity Audit Trail)
Immutable security and administrative event ledger.
| Column | Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `id` | UUID | PRIMARY KEY, DEFAULT gen_random_uuid() | Unique log ID |
| `tenant_id` | UUID | NULLABLE | Scoped tenant ID (if applicable) |
| `actor_user_id` | UUID | NULLABLE, REFERENCES users(id) | User initiating action |
| `actor_email` | VARCHAR(255) | NOT NULL | Recorded email at execution time |
| `actor_role` | VARCHAR(50) | NOT NULL | Role at execution time |
| `action_event` | VARCHAR(100) | NOT NULL | Event name (e.g. `portal.clone`, `step.status_update`) |
| `resource_id` | VARCHAR(100) | NULLABLE | Affected entity ID |
| `metadata` | JSONB | DEFAULT '{}'::JSONB | Request IP, user agent, state diff |
| `created_at` | TIMESTAMPTZ | DEFAULT NOW() | Event timestamp |
