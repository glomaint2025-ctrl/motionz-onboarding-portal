import {
  tenantRepository,
  portalTemplateRepository,
  clientSetupStepRepository,
  featureToggleRepository,
  csmAssignmentRepository,
  auditLogRepository,
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

    // 1. Resolve master template and default steps
    const { template, steps } = await portalTemplateRepository.getDefaultTemplate();
    const templateId = params.template_id || template.id;

    // 2. Create the core tenant record
    const tenant = await tenantRepository.create({
      name: validated.name,
      slug: validated.slug,
      primary_email: validated.primary_email,
      primary_contact_name: params.primary_contact_name?.trim() || validated.name,
      phone: validated.phone,
      template_id: templateId,
      status: 'active',
    });

    try {
      // 3. Clone template steps into concrete tenant setup steps
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

      // 4. Initialize feature toggles (merging default template features with overrides)
      const mergedFeatures = {
        ...(template.default_features || {}),
        ...(params.feature_overrides || {}),
      };
      await featureToggleRepository.initializeDefaults(tenant.id, mergedFeatures);

      // 5. Assign CSM if specified
      if (params.csm_user_id) {
        await csmAssignmentRepository.assign(params.csm_user_id, tenant.id);
      }

      // 6. Record audit log
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

      throw new AppError(
        `Failed to provision client portal: ${err.message}. Changes were rolled back.`,
        500,
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
