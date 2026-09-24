import { userRepository, securityEventRepository } from '../db/repositories';
import { User, UserRole } from '../db/schema';
import { logAuditEvent } from '../db';

export const STAFF_EMAIL_DOMAIN = '@motionz.ai';

export const isStaffEmail = (email: string): boolean => {
  if (!email || typeof email !== 'string') return false;
  return email.trim().toLowerCase().endsWith(STAFF_EMAIL_DOMAIN);
};

export interface StaffAuthResult {
  success: boolean;
  user?: User;
  error?: string;
}

/**
 * Authenticates internal Motionz staff members.
 * Strictly enforces that internal staff emails belong to @motionz.ai.
 * Rejects non-staff domains and logs a security event on violations.
 */
export const authenticateStaff = async (
  email: string,
  requestedRole: 'admin' | 'csm'
): Promise<StaffAuthResult> => {
  const normalizedEmail = email.trim().toLowerCase();

  if (!isStaffEmail(normalizedEmail)) {
    await securityEventRepository.create({
      event_type: 'unauthorized_staff_domain_access',
      severity: 'high',
      details: {
        attemptedEmail: normalizedEmail,
        requestedRole,
        timestamp: new Date().toISOString(),
      },
    });

    await logAuditEvent({
      actorEmail: normalizedEmail,
      actorRole: 'unknown',
      action: 'security.staff_login_domain_rejected',
      details: { attemptedRole: requestedRole, reason: 'Non-motionz.ai domain' },
    });

    return {
      success: false,
      error: 'Access denied. Internal staff access is restricted to verified @motionz.ai accounts.',
    };
  }

  let user = await userRepository.findByEmail(normalizedEmail);

  if (!user) {
    // If first-time verified @motionz.ai staff, provision user
    user = await userRepository.create({
      email: normalizedEmail,
      full_name: normalizedEmail.split('@')[0].replace('.', ' '),
      role: requestedRole,
    });
  } else if (user.role !== requestedRole && user.role !== 'admin') {
    // Prevent privilege escalation if a non-admin attempts admin access
    return {
      success: false,
      error: `Access denied. User does not possess the ${requestedRole} role.`,
    };
  }

  await logAuditEvent({
    actorEmail: user.email,
    actorRole: user.role,
    action: 'staff.authenticated',
    resourceType: 'user',
    resourceId: user.id,
  });

  return {
    success: true,
    user,
  };
};
