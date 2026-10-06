import { userRepository, securityEventRepository } from '../db/repositories';
import { User, UserRole } from '../db/schema';
import { logAuditEvent } from '../db';
import { getSupabaseServiceClient, getSupabaseBrowserClient } from '../db/supabase-client';

export const STAFF_EMAIL_DOMAIN = '@motionz.ai';

// Bootstrap admin; further admins come from ADMIN_EMAILS or are created in Admin > Staff.
const DEFAULT_ADMIN_EMAILS = ['admin@motionz.ai'];

/**
 * Exact addresses allowed as staff besides @motionz.ai, from STAFF_EXTRA_EMAILS (comma-separated).
 * For staging only, so test staff mail reaches the developer's inbox. Leave unset in production.
 */
const extraStaffEmails = (): string[] =>
  (process.env.STAFF_EXTRA_EMAILS || '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter((e) => e.includes('@'));

export const isStaffEmail = (email: string): boolean => {
  if (!email || typeof email !== 'string') return false;
  const normalized = email.trim().toLowerCase();
  return normalized.endsWith(STAFF_EMAIL_DOMAIN) || extraStaffEmails().includes(normalized);
};

export const isDesignatedAdminEmail = (email: string): boolean => {
  const normalized = email.trim().toLowerCase();
  const envAdmins = process.env.ADMIN_EMAILS
    ? process.env.ADMIN_EMAILS.split(',').map((e) => e.trim().toLowerCase())
    : [];
  return DEFAULT_ADMIN_EMAILS.includes(normalized) || envAdmins.includes(normalized);
};

export interface StaffAuthResult {
  success: boolean;
  user?: User;
  error?: string;
}

export interface StaffAuthOptions {
  isDevBypass?: boolean;
}

/**
 * Authenticates internal Motionz staff members.
 * Strictly enforces that internal staff emails belong to @motionz.ai.
 * Resolves role entirely server-side from trusted database state and server-controlled designations,
 * preventing browser-supplied role escalation.
 */
export const authenticateStaff = async (
  email: string,
  passwordOrRole?: string,
  untrustedRoleAttempt?: string,
  options?: StaffAuthOptions
): Promise<StaffAuthResult> => {
  const normalizedEmail = email.trim().toLowerCase();
  const isProduction = process.env.NODE_ENV === 'production';

  let password = passwordOrRole;
  let roleAttempt = untrustedRoleAttempt;

  // Backward-compatibility: if second argument is a role name from older tests
  if (passwordOrRole === 'admin' || passwordOrRole === 'csm') {
    roleAttempt = passwordOrRole;
    password = undefined;
  }

  // 1. Enforce @motionz.ai domain policy
  if (!isStaffEmail(normalizedEmail)) {
    await securityEventRepository.create({
      event_type: 'unauthorized_staff_domain_access',
      severity: 'high',
      details: {
        attemptedEmail: normalizedEmail,
        requestedRole: roleAttempt || 'unknown',
        timestamp: new Date().toISOString(),
      },
    });

    await logAuditEvent({
      actorEmail: normalizedEmail,
      actorRole: 'unknown',
      action: 'security.staff_login_domain_rejected',
      details: { attemptedRole: roleAttempt, reason: 'Non-motionz.ai domain' },
    });

    return {
      success: false,
      error: 'Access denied. Internal staff access is restricted to verified @motionz.ai accounts.',
    };
  }

  // Production isolation: reject passwordless staff attempts immediately
  if (!password && isProduction && !options?.isDevBypass) {
    return {
      success: false,
      error: 'Production staff authentication requires Google Workspace Single Sign-On (@motionz.ai) or verified staff credentials.',
    };
  }

  // 2. Priority 1 (Email): Verify staff account registration and role authorization
  let user = await userRepository.findByEmail(normalizedEmail);
  const isApprovedAdmin = isDesignatedAdminEmail(normalizedEmail);

  // If untrusted caller attempts to claim admin role when not designated, reject privilege escalation
  if (roleAttempt === 'admin' && !isApprovedAdmin && (!user || user.role !== 'admin')) {
    await securityEventRepository.create({
      event_type: 'staff_privilege_escalation_attempt',
      severity: 'high',
      details: {
        attemptedEmail: normalizedEmail,
        currentRole: user?.role || 'unassigned',
        requestedRole: 'admin',
        reason: 'Non-designated admin requested administrative role',
        timestamp: new Date().toISOString(),
      },
    });

    return {
      success: false,
      error: 'Access denied. Administrator privileges require designated staff approval.',
    };
  }

  // Check if account is not registered as Motionz staff
  if (!user && !isApprovedAdmin) {
    await securityEventRepository.create({
      event_type: 'staff_unregistered_email_attempt',
      severity: 'low',
      details: {
        attemptedEmail: normalizedEmail,
        timestamp: new Date().toISOString(),
      },
    });

    return {
      success: false,
      error: 'This email is not registered as a Motionz staff account.',
    };
  }

  if (user && user.status === 'suspended') {
    return {
      success: false,
      error: 'Your staff access has been disabled. Contact a Motionz administrator.',
    };
  }

  // If user exists in database but role is not staff (e.g. client or client_member)
  if (user && user.role !== 'admin' && user.role !== 'csm') {
    return {
      success: false,
      error: 'This email is registered as a client account. Please sign in using the Client Portal tab.',
    };
  }

  // 3. Priority 2 (Password): Verify staff password credentials via Supabase Auth
  const supabaseAnon = getSupabaseBrowserClient();
  if (supabaseAnon && password) {
    const { data: authData, error: authError } = await supabaseAnon.auth.signInWithPassword({
      email: normalizedEmail,
      password,
    });

    if (authError || !authData.user) {
      await securityEventRepository.create({
        event_type: 'staff_invalid_credentials',
        severity: 'medium',
        details: {
          email: normalizedEmail,
          reason: authError?.message || 'Invalid password',
          timestamp: new Date().toISOString(),
        },
      });

      return {
        success: false,
        error: 'Incorrect password. Please try again.',
      };
    }
  }

  // Provision user record for designated admin if not yet present in repository
  if (!user) {
    const assignedRole: UserRole = isApprovedAdmin ? 'admin' : 'csm';
    let authUserId: string | undefined;
    const supabase = getSupabaseServiceClient();
    if (supabase) {
      try {
        const { data: createdAuth } = await supabase.auth.admin.createUser({
          email: normalizedEmail,
          email_confirm: true,
        });
        if (createdAuth?.user?.id) {
          authUserId = createdAuth.user.id;
        }
      } catch {
        // User may already exist in auth.users
      }
    }

    user = await userRepository.create({
      id: authUserId,
      email: normalizedEmail,
      full_name: normalizedEmail.split('@')[0].replace(/[._]/g, ' '),
      role: assignedRole,
    });

    // A staff member created by their first sign-in: an admin gets the parent Drive folder.
    // Loaded here (not at the top) because the access module itself uses this file.
    if (assignedRole === 'admin') {
      const { syncAdminDriveAccess } = await import('../integrations/sheets/access');
      await syncAdminDriveAccess({ actorEmail: normalizedEmail, actorRole: 'admin', budgetMs: 10_000 });
    }
  }

  await logAuditEvent({
    actorEmail: user.email,
    actorRole: user.role,
    action: isProduction ? 'staff.authenticated' : 'staff.dev_authenticated',
    resourceType: 'user',
    resourceId: user.id,
    details: {
      authMode: isProduction ? 'sso_google' : 'server_resolved_development',
      resolvedRole: user.role,
    },
  });

  await securityEventRepository.create({
    event_type: 'staff_login_success',
    severity: 'low',
    details: {
      email: user.email,
      role: user.role,
      mode: isProduction ? 'production_sso' : 'development_server_resolved',
      timestamp: new Date().toISOString(),
    },
  });

  return {
    success: true,
    user,
  };
};
