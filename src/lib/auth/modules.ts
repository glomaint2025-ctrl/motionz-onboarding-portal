import { featureToggleRepository, userRepository } from '../db/repositories';
import { AppError } from '../errors';
import type { SessionPayload } from './session';

/**
 * Server-side module gate: a portal module must be enabled for the client (admin feature
 * toggles) and, for team members, included in their allowed modules. Staff are never blocked.
 */
export async function assertModuleEnabled(
  session: SessionPayload | null,
  tenantId: string,
  moduleKey: string
): Promise<void> {
  if (session?.role === 'admin' || session?.role === 'csm') return;

  const toggles = await featureToggleRepository.getTogglesForTenant(tenantId);
  if (toggles[moduleKey] === false) {
    throw new AppError('This section is not enabled for your portal.', 403, 'MODULE_DISABLED');
  }

  if (session?.role === 'client_member') {
    const user = await userRepository.findById(session.userId);
    if (user && Array.isArray(user.allowed_modules) && !user.allowed_modules.includes(moduleKey)) {
      throw new AppError('You do not have access to this section.', 403, 'MODULE_NOT_ALLOWED');
    }
  }
}
