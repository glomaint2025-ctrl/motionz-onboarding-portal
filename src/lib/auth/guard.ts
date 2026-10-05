import { NextRequest, NextResponse } from 'next/server';
import { verifySession, SessionPayload, SESSION_COOKIE_NAME } from './session';
import { UserRole } from '../db/schema';
import { Capability, hasPermission, assertTenantAccess } from './permissions';
import { securityEventRepository, auditLogRepository, userRepository, tenantRepository, csmAssignmentRepository } from '../db/repositories';
import { AppError } from '../errors';
import { PERSONAL_ACCESS_OFF_MESSAGE } from './edge-session';

/**
 * Anonymous access to the demo sandbox is a local-development convenience only:
 * never in production, and never for writes.
 */
export function isPublicDemoRead(method?: string): boolean {
  return process.env.NODE_ENV !== 'production' && (method === 'GET' || method === 'HEAD');
}

/**
 * CSMs may only work on clients assigned to them. Admins (the CSM manager role) see everything.
 */
export async function assertCsmAssigned(session: SessionPayload | null, tenantId: string): Promise<void> {
  if (!session || session.role !== 'csm') return;
  const assignment = await csmAssignmentRepository.findByTenant(tenantId);
  if (!assignment || assignment.csm_user_id !== session.userId) {
    throw new AppError('Forbidden: this client is not assigned to you.', 403, 'CSM_NOT_ASSIGNED');
  }
}

/**
 * Tenant ids visible to a staff member: null means unrestricted (admin).
 */
export async function getVisibleTenantIds(session: SessionPayload): Promise<Set<string> | null> {
  if (session.role !== 'csm') return null;
  const assignments = await csmAssignmentRepository.listByCsm(session.userId);
  return new Set(assignments.map((a) => a.tenant_id));
}

export interface GuardOptions {
  roles?: UserRole[];
  capability?: Capability;
  targetTenantId?: string;
  allowDemoPreview?: boolean;
}

/**
 * Checks if a user or their tenant has been suspended/banned.
 * Throws AppError(403, 'ACCOUNT_SUSPENDED') if suspended.
 */
export async function assertActiveAccount(session: SessionPayload): Promise<void> {
  // Staff are exempt from tenant-level bans, but a disabled staff account is blocked.
  if (session.role === 'admin' || session.role === 'csm') {
    const staffUser = await userRepository.findById(session.userId);
    if (staffUser?.status === 'suspended') {
      throw new AppError('Your staff access has been disabled.', 403, 'ACCOUNT_SUSPENDED');
    }
    return;
  }

  // 1. Check user-level suspension
  const user = await userRepository.findById(session.userId);
  if (user && user.status === 'suspended') {
    throw new AppError(
      PERSONAL_ACCESS_OFF_MESSAGE,
      403,
      'ACCOUNT_SUSPENDED'
    );
  }

  // 2. Check tenant-level suspension (cascades to all members)
  if (session.tenantId) {
    const tenant = await tenantRepository.findById(session.tenantId);
    if (tenant && tenant.status === 'suspended') {
      const reason = tenant.suspended_reason || 'Organization portal has been disabled by an administrator.';
      throw new AppError(
        `Your organization portal has been suspended: ${reason}`,
        403,
        'TENANT_SUSPENDED'
      );
    }
  }
}

/**
 * Extracts and cryptographically verifies the session from an incoming HTTP request.
 */
export function getSessionFromRequest(request: Request | NextRequest): SessionPayload | null {
  let cookieHeader: string | null = null;

  if ('cookies' in request && typeof (request as any).cookies?.get === 'function') {
    const cookie = (request as NextRequest).cookies.get(SESSION_COOKIE_NAME);
    if (cookie?.value) {
      return verifySession(cookie.value);
    }
  }

  cookieHeader = request.headers.get('cookie');
  if (!cookieHeader) return null;

  const cookies = cookieHeader.split(';').map((c) => c.trim());
  const sessionCookie = cookies.find((c) => c.startsWith(`${SESSION_COOKIE_NAME}=`));
  if (!sessionCookie) return null;

  const token = sessionCookie.split('=')[1];
  return verifySession(token);
}

/**
 * Enforces server-side authentication, role-based capability, tenant membership,
 * and account active/suspension checks.
 * Throws AppError(401) if unauthenticated, or AppError(403) if unauthorized or suspended.
 */
export async function requireAuth(
  request: Request | NextRequest,
  options: GuardOptions = {}
): Promise<{ session: SessionPayload }> {
  const session = getSessionFromRequest(request);

  if (!session) {
    throw new AppError('Authentication required to access this resource.', 401, 'UNAUTHENTICATED');
  }

  // Active status check: immediate expulsion on next request if banned/disabled
  await assertActiveAccount(session);

  // Role validation
  if (options.roles && options.roles.length > 0) {
    if (!options.roles.includes(session.role)) {
      await securityEventRepository.create({
        event_type: 'role_privilege_escalation_attempt',
        severity: 'high',
        tenant_id: session.tenantId,
        details: {
          userEmail: session.email,
          userRole: session.role,
          requiredRoles: options.roles,
          timestamp: new Date().toISOString(),
        },
      });

      throw new AppError('Forbidden: Insufficient role permissions.', 403, 'FORBIDDEN');
    }
  }

  // Capability validation
  if (options.capability) {
    if (!hasPermission(session.role, options.capability)) {
      await securityEventRepository.create({
        event_type: 'unauthorized_capability_attempt',
        severity: 'high',
        tenant_id: session.tenantId,
        details: {
          userEmail: session.email,
          userRole: session.role,
          missingCapability: options.capability,
          timestamp: new Date().toISOString(),
        },
      });

      throw new AppError(
        `Forbidden: Role '${session.role}' lacks capability '${options.capability}'.`,
        403,
        'FORBIDDEN'
      );
    }
  }

  // Tenant boundary validation
  if (options.targetTenantId) {
    try {
      assertTenantAccess(
        { role: session.role, tenantId: session.tenantId },
        options.targetTenantId
      );
    } catch (err: any) {
      await securityEventRepository.create({
        event_type: 'cross_tenant_access_attempt',
        severity: 'critical',
        tenant_id: session.tenantId,
        details: {
          userEmail: session.email,
          userRole: session.role,
          userTenantId: session.tenantId,
          targetTenantId: options.targetTenantId,
          timestamp: new Date().toISOString(),
        },
      });

      throw new AppError('Forbidden: Unauthorized cross-tenant access attempt.', 403, 'CROSS_TENANT_FORBIDDEN');
    }
  }

  return { session };
}

const CLIENT_ERROR_STATUSES = new Set([400, 404, 409, 410, 422, 429]);

/**
 * Formats errors thrown in API routes into consistent, safe JSON responses:
 * 401/403 as auth errors, coded client errors with their own message, everything else a generic 500.
 */
export function handleAuthError(err: any): NextResponse {
  err = err ?? {};
  const isSuspended = err.code === 'ACCOUNT_SUSPENDED' || err.code === 'TENANT_SUSPENDED';

  const statusCode =
    err.statusCode ||
    (isSuspended ? 403 :
     err.message?.includes('Forbidden') || err.message?.includes('cross-tenant') ? 403 :
     err.message?.includes('Authentication') || err.message?.includes('Unauthorized') ? 401 : 500);

  // Client-correctable errors (validation, not found, conflict, gone, rate limit): the message
  // was written for the user, so pass it through with its status.
  const isCodedError = err instanceof AppError || (typeof err?.statusCode === 'number' && typeof err?.code === 'string');
  if (!isSuspended && isCodedError && CLIENT_ERROR_STATUSES.has(statusCode)) {
    return NextResponse.json(
      { error: err.message || 'This request could not be completed.', code: err.code || 'BAD_REQUEST', suspended: false },
      { status: statusCode }
    );
  }

  // Anything that is not an auth problem is a server fault: log it, never leak internals.
  if (!isSuspended && statusCode !== 401 && statusCode !== 403) {
    console.error('[API] Unhandled error:', err);
    return NextResponse.json(
      { error: 'Something went wrong. Please try again.', code: 'INTERNAL_ERROR', suspended: false },
      { status: 500 }
    );
  }

  const safeMessage =
    isSuspended
      ? err.message
      : statusCode === 401
      ? 'Authentication required. Please sign in.'
      : err.message || 'You do not have permission to perform this action.';

  const response = NextResponse.json(
    {
      error: safeMessage,
      code: err.code || (statusCode === 401 ? 'UNAUTHENTICATED' : 'FORBIDDEN'),
      suspended: isSuspended,
      reason: isSuspended ? err.message : undefined,
    },
    { status: statusCode }
  );

  // If the account was suspended, expire their session cookie immediately
  if (isSuspended) {
    response.cookies.set(SESSION_COOKIE_NAME, '', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 0,
    });
  }

  return response;
}

/**
 * Verifies portal access for API routes, enforcing authentication, tenant isolation,
 * and active account/tenant status. Throws AppError on failure.
 */
export async function assertPortalAccess(
  request: Request | NextRequest,
  targetTenant: any | null,
  rawClientId: string
): Promise<SessionPayload | null> {
  const session = getSessionFromRequest(request);
  const isStaff = session?.role === 'admin' || session?.role === 'csm';

  // Demo tenant: staff always; anonymous read-only preview outside production
  if (rawClientId === 'demo' && (session?.role === 'admin' || (!session && isPublicDemoRead(request.method)))) {
    return session;
  }

  if (!session) {
    throw new AppError('Authentication required to access client portal.', 401, 'UNAUTHENTICATED');
  }

  // Cross tenant check
  const tenantId = targetTenant ? targetTenant.id : 'demo';
  assertTenantAccess({ role: session.role, tenantId: session.tenantId }, tenantId);

  // Staff oversight: admins see every portal, CSMs only their assigned clients
  if (isStaff) {
    await assertCsmAssigned(session, tenantId);
    return session;
  }

  // User-level active check
  await assertActiveAccount(session);

  // Tenant-level active check
  if (targetTenant && (targetTenant.status === 'suspended' || targetTenant.suspended_at)) {
    const reason = targetTenant.suspended_reason || 'Client account disabled by Motionz administrator.';
    throw new AppError(reason, 403, 'TENANT_SUSPENDED');
  }

  return session;
}


