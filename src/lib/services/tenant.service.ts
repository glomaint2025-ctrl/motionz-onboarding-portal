import {
  tenantRepository,
  portalTemplateRepository,
  clientSetupStepRepository,
  featureToggleRepository,
  csmAssignmentRepository,
  auditLogRepository,
  userRepository,
} from '../db/repositories';
import { validateTenantPayload } from '../validation';
import { Tenant, UserRole } from '../db/schema';
import { AppError } from '../errors';

export interface ProvisionClientParams {
  name: string;
  primary_email: string;
  slug?: string;
  primary_contact_name?: string;
  phone?: string;
  csm_user_id?: string;
  template_id?: string;
  feature_overrides?: Record<string, boolean>;
  actorEmail?: string;
  actorRole?: string;
}

export interface ProvisionClientResult {
  tenant: Tenant;
  setupStepsCount: number;
  featuresCount: number;
}

export class TenantService {
  /**
   * Atomically provisions a new client portal instance.
   * If any step fails during provisioning, a compensating rollback is executed
   * to delete the tenant and cascade-clean all associated setup steps,
   * feature toggles, and assignments.
   */
  async provisionClient(params: ProvisionClientParams): Promise<ProvisionClientResult> {
    const validated = validateTenantPayload({
      name: params.name,
      slug: params.slug,
      primary_email: params.primary_email,
      phone: params.phone,
    });

    const normalizedEmail = validated.primary_email.trim().toLowerCase();
    const existingUser = await userRepository.findByEmail(normalizedEmail);
    if (existingUser) {
      throw new AppError('An account with this email already exists.', 400, 'EMAIL_ALREADY_EXISTS');
    }

    const existingTenant = await tenantRepository.findByEmail(normalizedEmail);
    if (existingTenant) {
      throw new AppError('An account with this email already exists.', 400, 'EMAIL_ALREADY_EXISTS');
    }

    // 1. Resolve master template and default steps
    const { template, steps } = await portalTemplateRepository.getDefaultTemplate();
    const templateId = params.template_id || template.id;

    // 2. Ensure guaranteed unique slug so multiple clients can share the same business name
    const uniqueSlug = await tenantRepository.generateUniqueSlug(validated.slug || validated.name);

    // 3. Create the core tenant record
    const tenant = await tenantRepository.create({
      name: validated.name,
      slug: uniqueSlug,
      primary_email: validated.primary_email,
      primary_contact_name: params.primary_contact_name?.trim() || validated.name,
      phone: validated.phone,
      template_id: templateId,
      status: 'onboarding',
    });

    try {
      // 4. Clone template steps into concrete tenant setup steps
      const clonedSteps = await clientSetupStepRepository.cloneStepsForTenant(
        tenant.id,
        steps.map((ts) => ({
          tenant_id: tenant.id,
          template_step_id: ts.id,
          step_key: ts.step_key,
          name: ts.name,
          owner: ts.owner,
          status: 'not_started' as const,
          what_it_is: ts.what_it_is,
          right_now: ts.right_now,
          unlocks: ts.unlocks,
          sort_order: ts.sort_order,
          updated_at: new Date().toISOString(),
        }))
      );

      // 5. Initialize feature toggles (merging default template features with overrides)
      const mergedFeatures = {
        ...(template.default_features || {}),
        ...(params.feature_overrides || {}),
      };
      await featureToggleRepository.initializeDefaults(tenant.id, mergedFeatures);

      // 6. Assign CSM if specified
      if (params.csm_user_id) {
        await csmAssignmentRepository.assign(params.csm_user_id, tenant.id);
      }

      // 7. Record audit log
      await auditLogRepository.create({
        tenant_id: tenant.id,
        actor_email: params.actorEmail || 'system',
        actor_role: params.actorRole || 'admin',
        action: 'tenant.provisioned',
        resource_type: 'tenant',
        resource_id: tenant.id,
        details: {
          slug: tenant.slug,
          csmUserId: params.csm_user_id,
          stepsCount: clonedSteps.length,
        },
      });

      return {
        tenant,
        setupStepsCount: clonedSteps.length,
        featuresCount: Object.keys(mergedFeatures).length,
      };
    } catch (err: any) {
      // ATOMIC TRANSACTION ROLLBACK: Clean up tenant and cascade on failure
      try {
        await tenantRepository.hardDelete(tenant.id);
      } catch (rollbackErr) {
        console.error(`Rollback failed for tenant ${tenant.id}:`, rollbackErr);
      }

      if (err instanceof AppError && err.statusCode === 400) {
        throw err;
      }
      if (err.message?.includes('23505') || err.message?.toLowerCase().includes('email')) {
        throw new AppError('An account with this email already exists.', 400, 'EMAIL_ALREADY_EXISTS');
      }

      throw new AppError(
        err.message || 'Failed to provision client portal.',
        err.statusCode || 500,
        'PROVISIONING_FAILED',
        { original: String(err) }
      );
    }
  }

  async archiveClient(tenantId: string, actorEmail = 'admin@motionz.ai'): Promise<void> {
    await tenantRepository.softDelete(tenantId);
    await auditLogRepository.create({
      tenant_id: tenantId,
      actor_email: actorEmail,
      actor_role: 'admin',
      action: 'tenant.archived',
      resource_type: 'tenant',
      resource_id: tenantId,
    });
  }

  async updateFeatures(
    tenantId: string,
    features: Record<string, boolean>,
    actorEmail = 'admin@motionz.ai'
  ): Promise<void> {
    const promises = Object.entries(features).map(([key, val]) =>
      featureToggleRepository.setToggle(tenantId, key, val, actorEmail)
    );
    await Promise.all(promises);

    await auditLogRepository.create({
      tenant_id: tenantId,
      actor_email: actorEmail,
      actor_role: 'admin',
      action: 'tenant.features_updated',
      resource_type: 'feature_toggles',
      resource_id: tenantId,
      details: features,
    });
  }
}

export const tenantService = new TenantService();
