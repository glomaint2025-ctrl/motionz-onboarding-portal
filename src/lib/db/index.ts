import {
  Tenant,
  User,
  ClientSetupStep,
  Contract,
  Order,
  Lead,
  Appointment,
  FeatureToggle,
  IntegrationConfig,
  UserInvitation,
  ScriptTemplate,
  ClientScriptPreference,
  SelectedScripts,
  AuditLog,
  SecurityEvent,
} from './schema';

import {
  tenantRepository,
  userRepository,
  invitationRepository,
  csmAssignmentRepository,
  portalTemplateRepository,
  clientSetupStepRepository,
  featureToggleRepository,
  leadRepository,
  appointmentRepository,
  contractRepository,
  orderRepository,
  scriptRepository,
  roofMeasurementRepository,
  auditLogRepository,
  securityEventRepository,
  integrationConfigRepository,
} from './repositories';

import { tenantService } from '../services/tenant.service';

export * from './schema';
export * from './repositories';
export * from '../services';
export * from '../errors';
export * from '../validation';
export { getStore, resetStore } from './mock-db';
export { DEMO_TENANT_UUID, LEGACY_DEMO_TENANT_UUID, resolveTenantId } from './supabase-client';
import { LEGACY_DEMO_TENANT_UUID } from './supabase-client';

/**
 * Tenant Repository Delegations
 */
export const getTenantById = async (tenantId: string): Promise<Tenant | null> => {
  return tenantRepository.findById(tenantId);
};

const CANONICAL_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The client's real id for an id, slug or demo alias. A plain UUID already is the real id, so it
 * needs no database lookup: callers that have loaded the client pass its id and pay nothing here.
 */
const resolveId = async (tenantId: string): Promise<string> => {
  if (CANONICAL_ID.test(tenantId) && tenantId !== LEGACY_DEMO_TENANT_UUID) return tenantId;
  const tenant = await getTenantById(tenantId);
  return tenant ? tenant.id : tenantId;
};

export const listTenants = async (): Promise<Tenant[]> => {
  return tenantRepository.list();
};

export const createTenant = async (data: {
  name: string;
  slug: string;
  primary_email: string;
  primary_contact_name?: string;
  phone?: string;
  template_id?: string;
  csm_user_id?: string;
}): Promise<Tenant> => {
  const result = await tenantService.provisionClient(data);
  return result.tenant;
};

export const updateTenantProfile = async (
  tenantId: string,
  updates: Partial<Pick<Tenant, 'name' | 'phone' | 'primary_contact_name' | 'primary_email'>>
): Promise<Tenant | null> => {
  const tenant = await getTenantById(tenantId);
  if (!tenant) return null;
  return tenantRepository.update(tenant.id, updates);
};

/**
 * Onboarding / Setup Steps Repository Delegations
 */
export const getClientSetupSteps = async (tenantId: string): Promise<ClientSetupStep[]> => {
  const resolvedId = await resolveId(tenantId);
  return clientSetupStepRepository.listByTenant(resolvedId);
};

export const updateClientSetupStep = async (
  tenantId: string,
  stepKey: string,
  updates: Partial<Pick<ClientSetupStep, 'status' | 'name' | 'what_it_is' | 'right_now' | 'we_need_from_you' | 'unlocks'>>
): Promise<ClientSetupStep | null> => {
  const resolvedId = await resolveId(tenantId);
  return clientSetupStepRepository.updateStep(resolvedId, stepKey, updates);
};

/**
 * Leads & Appointments Delegations
 */
export const getLeads = async (tenantId: string): Promise<Lead[]> => {
  const resolvedId = await resolveId(tenantId);
  return leadRepository.listByTenant(resolvedId);
};

export const getAppointments = async (tenantId: string): Promise<Appointment[]> => {
  const resolvedId = await resolveId(tenantId);
  return appointmentRepository.listByTenant(resolvedId);
};

/**
 * Contracts & Orders Delegations
 */
export const getContracts = async (tenantId: string): Promise<Contract[]> => {
  const resolvedId = await resolveId(tenantId);
  return contractRepository.listByTenant(resolvedId);
};

export const getOrders = async (tenantId: string): Promise<Order[]> => {
  const resolvedId = await resolveId(tenantId);
  return orderRepository.listByTenant(resolvedId);
};

/**
 * Feature Toggles Delegations
 */
export const getFeatureToggles = async (tenantId: string): Promise<Record<string, boolean>> => {
  const resolvedId = await resolveId(tenantId);
  return featureToggleRepository.getTogglesForTenant(resolvedId);
};

export const setFeatureToggle = async (
  tenantId: string,
  featureKey: string,
  isEnabled: boolean,
  updatedBy?: string
): Promise<void> => {
  const resolvedId = await resolveId(tenantId);
  return featureToggleRepository.setToggle(resolvedId, featureKey, isEnabled, updatedBy);
};

/**
 * Video Scripts Delegations
 */
export const getScriptTemplates = async (): Promise<ScriptTemplate[]> => {
  return scriptRepository.listTemplates();
};

export const getClientScriptPreference = async (tenantId: string): Promise<ClientScriptPreference | null> => {
  const resolvedId = await resolveId(tenantId);
  return scriptRepository.getPreference(resolvedId);
};

export const setClientScriptPreference = async (
  tenantId: string,
  preference: 'ai_video' | 'self_filmed',
  customName?: string,
  customCompany?: string
): Promise<ClientScriptPreference> => {
  const resolvedId = await resolveId(tenantId);
  return scriptRepository.setPreference(resolvedId, preference, customName, customCompany);
};

export const setClientSelectedScripts = async (
  tenantId: string,
  selected: SelectedScripts
): Promise<ClientScriptPreference> => {
  const resolvedId = await resolveId(tenantId);
  return scriptRepository.setSelectedScripts(resolvedId, selected);
};

/**
 * Audit Logging Delegations
 */
export const logAuditEvent = async (event: {
  tenantId?: string;
  actorEmail: string;
  actorRole: string;
  actorUserId?: string;
  action: string;
  resourceType?: string;
  resourceId?: string;
  details?: Record<string, any>;
  ipAddress?: string;
}): Promise<AuditLog> => {
  return auditLogRepository.create({
    tenant_id: event.tenantId,
    actor_user_id: event.actorUserId,
    actor_email: event.actorEmail,
    actor_role: event.actorRole,
    action: event.action,
    resource_type: event.resourceType,
    resource_id: event.resourceId,
    details: event.details,
    ip_address: event.ipAddress,
  });
};

export const listAuditLogs = async (tenantId?: string): Promise<AuditLog[]> => {
  if (tenantId) {
    const resolvedId = await resolveId(tenantId);
    return auditLogRepository.list(resolvedId);
  }
  return auditLogRepository.list();
};

/**
 * Tenant Team & Integrations Delegations
 */
export const getTeamMembers = async (tenantId: string): Promise<User[]> => {
  const resolvedId = await resolveId(tenantId);
  return userRepository.listByTenant(resolvedId);
};

export const listTeamMemberInvitations = async (tenantId: string): Promise<UserInvitation[]> => {
  const resolvedId = await resolveId(tenantId);
  const [members, invitations] = await Promise.all([
    userRepository.listByTenant(resolvedId),
    invitationRepository.listByTenant(resolvedId, { pendingOnly: true }),
  ]);
  const activeEmails = new Set(members.map((m) => m.email.toLowerCase()));
  const now = new Date();
  return invitations.filter((inv) => {
    if (inv.accepted_at) return false;
    if (inv.revoked_at) return false;
    if (new Date(inv.expires_at) <= now) return false;
    if (activeEmails.has(inv.email.toLowerCase())) return false;
    return true;
  });
};

export const getTenantIntegrations = async (tenantId: string): Promise<IntegrationConfig[]> => {
  const resolvedId = await resolveId(tenantId);
  return integrationConfigRepository.listByTenant(resolvedId);
};
