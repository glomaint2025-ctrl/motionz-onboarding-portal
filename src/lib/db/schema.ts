import type { ScriptCategory, SelectedScripts } from '../scripts/ad-script-library';

export type { ScriptCategory, SelectedScripts };
export type UserRole ='admin' | 'csm' | 'client' | 'client_member';
export type SetupStatus = 'not_started' | 'in_progress' | 'done';
export type StepOwner = 'we_handle' | 'client_action';
export type OrderStage = 'ordered' | 'packaged' | 'shipped' | 'delivered' | 'issue';
export type VideoPreference = 'undecided' | 'ai_video' | 'self_filmed';
export type SecuritySeverity = 'info' | 'low' | 'medium' | 'high' | 'critical';

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  primary_email: string;
  primary_contact_name?: string;
  phone?: string;
  logo_url?: string;
  status: 'active' | 'onboarding' | 'cancelled' | 'suspended';
  template_id?: string;
  ghl_location_id?: string;
  settings?: Record<string, any>;
  suspended_at?: string;
  suspended_reason?: string;
  suspended_by?: string;
  created_at: string;
  updated_at: string;
  deleted_at?: string;
}

export interface User {
  id: string;
  email: string;
  full_name: string;
  role: UserRole;
  tenant_id?: string;
  phone?: string;
  avatar_url?: string;
  /** Object path of the profile picture in the private "avatars" bucket. Absent on databases without the column. */
  avatar_path?: string | null;
  two_factor_enabled?: boolean;
  status?: 'active' | 'suspended';
  suspended_at?: string;
  suspended_reason?: string;
  suspended_by?: string;
  suspended_by_role?: 'admin' | 'csm' | 'client';
  cascade_suspended?: boolean; // True when disabled automatically due to main client suspension
  allowed_modules?: string[]; // Specific portal module keys permitted for this user
  password_hash?: string;
  created_at: string;
  updated_at: string;
}

export interface PasswordResetToken {
  id: string;
  email: string;
  token_hash: string;
  expires_at: string;
  used_at?: string;
  created_at: string;
}

export interface OnboardingSubmission {
  id: string;
  tenant_id: string | null;
  submitter_email?: string;
  ghl_contact_id?: string;
  answers: Record<string, unknown>;
  submitted_at: string;
}

export interface AppSetting {
  key: string;
  value: Record<string, any>;
  updated_at: string;
  updated_by?: string;
}

export interface CsmAssignment {
  id: string;
  csm_user_id: string;
  tenant_id: string;
  assigned_at: string;
}

export interface UserInvitation {
  id: string;
  email: string;
  role: UserRole;
  tenant_id: string;
  token_hash: string;
  expires_at: string;
  phone?: string;
  full_name?: string;
  allowed_modules?: string[]; // Module keys granted to the invitee upon acceptance
  accepted_at?: string;
  revoked_at?: string;
  created_by?: string;
  created_at: string;
}

export interface PortalTemplate {
  id: string;
  title: string;
  slug: string;
  description?: string;
  is_default: boolean;
  default_features: Record<string, boolean>;
  created_at: string;
  updated_at: string;
}

export interface TemplateStep {
  id: string;
  template_id: string;
  step_key: string;
  name: string;
  owner: StepOwner;
  what_it_is: string;
  right_now: string;
  unlocks: string;
  sort_order: number;
  created_at: string;
}

export interface ClientSetupStep {
  id: string;
  tenant_id: string;
  template_step_id?: string;
  step_key: string;
  name: string;
  owner: StepOwner;
  status: SetupStatus;
  what_it_is: string;
  right_now: string;
  we_need_from_you?: string;
  unlocks: string;
  sort_order: number;
  completed_at?: string;
  updated_at: string;
}

export interface FeatureToggle {
  id: string;
  tenant_id: string;
  feature_key: string;
  is_enabled: boolean;
  updated_by?: string;
  updated_at: string;
}

export interface IntegrationConfig {
  id: string;
  tenant_id: string;
  integration_type: 'ghl' | 'google_sheets' | 'roof_provider';
  config_data: Record<string, any>;
  is_active: boolean;
  updated_at: string;
}

export interface Contract {
  id: string;
  tenant_id: string;
  title: string;
  document_url?: string;
  storage_path?: string;
  signed_at?: string;
  ghl_document_id?: string;
  created_at: string;
}

export interface Order {
  id: string;
  tenant_id: string;
  order_number: string;
  label: string;
  stage: OrderStage;
  carrier?: string;
  tracking_number?: string;
  tracking_url?: string;
  batch_info?: string;
  issue_notes?: string;
  created_at: string;
  updated_at: string;
}

export interface ScriptTemplate {
  id: string;
  title: string;
  script_content: string;
  /** ai_video = educational scripts Motionz produces; the rest are self-filmed ad scripts. */
  category: ScriptCategory;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface ClientScriptPreference {
  id: string;
  tenant_id: string;
  video_preference: VideoPreference;
  custom_name?: string;
  custom_company?: string;
  /** Self-filmed picks: one script id per category (JSONB). */
  selected_scripts?: SelectedScripts;
  updated_at: string;
}

export interface RoofMeasurement {
  id: string;
  tenant_id: string;
  address: string;
  planar_area_sqft?: number;
  pitch?: string;
  surface_area_sqft?: number;
  squares?: number;
  result_data?: Record<string, any>;
  created_by?: string;
  created_at: string;
}

export interface Lead {
  id: string;
  tenant_id: string;
  ghl_contact_id?: string;
  first_name?: string;
  last_name?: string;
  email?: string;
  phone?: string;
  status: string;
  source?: string;
  created_at: string;
  updated_at: string;
}

export interface Appointment {
  id: string;
  tenant_id: string;
  ghl_appointment_id?: string;
  contact_name: string;
  appointment_time: string;
  status: string;
  notes?: string;
  created_at: string;
}

export interface AuditLog {
  id: string;
  tenant_id?: string;
  actor_user_id?: string;
  actor_email: string;
  actor_role: string;
  action: string;
  resource_type?: string;
  resource_id?: string;
  details?: Record<string, any>;
  ip_address?: string;
  created_at: string;
}

export interface SecurityEvent {
  id: string;
  tenant_id?: string;
  event_type: string;
  severity: SecuritySeverity;
  details?: Record<string, any>;
  is_resolved: boolean;
  resolved_by?: string;
  created_at: string;
}
