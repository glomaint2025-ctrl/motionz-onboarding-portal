import {
  clientSetupStepRepository,
  auditLogRepository,
} from '../db/repositories';
import { ClientSetupStep, SetupStatus } from '../db/schema';
import { validateSetupStatus } from '../validation';
import { calculateSetupProgress } from '../onboarding/progress';

export interface UpdateStepGuidanceParams {
  tenantId: string;
  stepKey: string;
  status?: SetupStatus;
  right_now?: string;
  we_need_from_you?: string;
  what_it_is?: string;
  unlocks?: string;
  actorEmail?: string;
  actorRole?: string;
}

export class OnboardingService {
  async getTenantSteps(tenantId: string): Promise<{
    steps: ClientSetupStep[];
    progressPercent: number;
    activeStep: ClientSetupStep | null;
    isComplete: boolean;
  }> {
    const steps = await clientSetupStepRepository.listByTenant(tenantId);
    const progress = calculateSetupProgress(steps);

    return {
      steps,
      progressPercent: progress.percentage,
      activeStep: progress.currentStep,
      isComplete: progress.isComplete,
    };
  }

  async updateStepGuidance(params: UpdateStepGuidanceParams): Promise<{
    updatedStep: ClientSetupStep;
    progressPercent: number;
  }> {
    const updates: any = {};
    if (params.status) {
      updates.status = validateSetupStatus(params.status);
    }
    if (params.right_now !== undefined) updates.right_now = params.right_now;
    if (params.we_need_from_you !== undefined) updates.we_need_from_you = params.we_need_from_you;
    if (params.what_it_is !== undefined) updates.what_it_is = params.what_it_is;
    if (params.unlocks !== undefined) updates.unlocks = params.unlocks;

    const updatedStep = await clientSetupStepRepository.updateStep(
      params.tenantId,
      params.stepKey,
      updates
    );

    const allSteps = await clientSetupStepRepository.listByTenant(params.tenantId);
    const progress = calculateSetupProgress(allSteps);

    await auditLogRepository.create({
      tenant_id: params.tenantId,
      actor_email: params.actorEmail || 'csm@motionz.ai',
      actor_role: params.actorRole || 'csm',
      action: 'onboarding.step_updated',
      resource_type: 'client_setup_step',
      resource_id: updatedStep.id,
      details: {
        stepKey: params.stepKey,
        newStatus: updatedStep.status,
        newProgress: progress.percentage,
      },
    });

    return {
      updatedStep,
      progressPercent: progress.percentage,
    };
  }
}

export const onboardingService = new OnboardingService();
