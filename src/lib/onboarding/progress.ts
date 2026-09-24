import { ClientSetupStep } from '../db/schema';

export interface SetupProgressSummary {
  totalSteps: number;
  completedSteps: number;
  inProgressSteps: number;
  notStartedSteps: number;
  percentage: number;
  currentStep: ClientSetupStep | null;
  isComplete: boolean;
}

/**
 * Calculates overall onboarding setup completion percentage and telemetry
 * based on the active client setup step records.
 */
export function calculateSetupProgress(steps: ClientSetupStep[]): SetupProgressSummary {
  if (!steps || steps.length === 0) {
    return {
      totalSteps: 0,
      completedSteps: 0,
      inProgressSteps: 0,
      notStartedSteps: 0,
      percentage: 0,
      currentStep: null,
      isComplete: false,
    };
  }

  const sortedSteps = [...steps].sort((a, b) => a.sort_order - b.sort_order);
  const totalSteps = sortedSteps.length;
  const completedSteps = sortedSteps.filter((s) => s.status === 'done').length;
  const inProgressSteps = sortedSteps.filter((s) => s.status === 'in_progress').length;
  const notStartedSteps = sortedSteps.filter((s) => s.status === 'not_started').length;

  const percentage = totalSteps > 0 ? Math.round((completedSteps / totalSteps) * 100) : 0;
  const isComplete = totalSteps > 0 && completedSteps === totalSteps;

  // The current active step is the first one not yet marked 'done', or the last step if all complete
  const currentStep = sortedSteps.find((s) => s.status !== 'done') || sortedSteps[sortedSteps.length - 1];

  return {
    totalSteps,
    completedSteps,
    inProgressSteps,
    notStartedSteps,
    percentage,
    currentStep,
    isComplete,
  };
}
