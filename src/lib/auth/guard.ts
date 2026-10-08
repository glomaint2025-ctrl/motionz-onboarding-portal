import { NextRequest, NextResponse } from 'next/server';
import { verifySession, SessionPayload, SESSION_COOKIE_NAME } from './session';
import { UserRole } from '../db/schema';
import { Capability, hasPermission, assertTenantAccess } from './permissions';
import { securityEventRepository, auditLogRepository, userRepository, tenantRepository, csmAssignmentRepository } from '../db/repositories';
import { AppError } from '../errors';
import { PERSONAL_ACCESS_OFF_MESSAGE, PORTAL_ARCHIVED_MESSAGE, isTenantArchived } from './edge-session';
import type { User, Tenant, CsmAssignment } from '../db/schema';
import { isCsmTrainingBlocked, TRAINING_REQUIRED_MESSAGE } from '../training';

/**
 * Per-request memo. One HTTP request runs several checks in a row (requireAuth, assertPortalAccess,
 * assertModuleEnabled, then the route itself) and each used to read the same user, client and CSM
 * assignment again. Within one request they are now read once.
 *
 * It is keyed on the Request object (through the session parsed from it), so it lives exactly as
 * long as that request: nothing is shared between requests, and a suspension or permission change
 * is seen by the very next request. A session object that did not come from a request is never memoised.
 */
interface RequestLookups {
  user?: Promise<User | null>;
  userById?: Promise<User | null>;
  tenant?: Promise<Tenant | null>;
  assignments: Map<string, Promise<CsmAssignment | null>>;
  trainingBlocked?: Promise<boolean>;
}
const sessionByRequest = new WeakMap<object, { session: SessionPayload | null }>();
const lookupsBySession = new WeakMap<SessionPayload, RequestLookups>();

function memoFor(session: SessionPayload): RequestLookups | null {
  return lookupsBySession.get(session) || null;
}

/** The signed-in person's own user row by id, read once per request. */
export function getSessionUserById(session: SessionPayload): Promise<User | null> {
  const memo = memoFor(session);
  if (!memo) return userRepository.findById(session.userId);
  if (!memo.userById) memo.userById = userRepository.findById(session.userId);
  return memo.userById;
}

/** The signed-in person's user row (by id, else by the session's email), read once per request. */
export function getSessionUser(session: SessionPayload): Promise<User | null> {
  const load = async () => (await getSessionUserById(session)) || (await userRepository.findByEmail(session.email));
  const memo = memoFor(session);
  if (!memo) return load();
  if (!memo.user) memo.user = load();
  return memo.user;
}

/** The session's own client (archived ones included), read once per request. */
function getSessionTenant(session: SessionPayload): Promise<Tenant | null> {
  const load = () => tenantRepository.findById(session.tenantId!, { includeArchived: true });
  const memo = memoFor(session);
  if (!memo) return load();
  if (!memo.tenant) memo.tenant = load();
  return memo.tenant;
}

/** Shown to someone whose client was deleted permanently while they were still signed in. */
export const PORTAL_DELETED_MESSAGE = 'This portal no longer exists. Contact your Motionz contact if you think this is a mistake.';

/**
 * Anonymous access to the demo sandbox is a local-development convenience only:
 * never in production, and never for writes.
 */
export function isPublicDemoRead(method?: string): boolean {
  return process.env.NODE_ENV !== 'production' && (method === 'GET' || method === 'HEAD');
}

/**
 * When "CSMs must finish training" is on, a CSM with unfinished lessons cannot use client pages.
 * Called from the two places a CSM reaches clients (one client: assertCsmAssigned; the list:
 * getVisibleTenantIds), so every CSM client route and the staff view of a portal are covered.
 * Read once per request. CSM Managers and Tech (role admin) are never stopped.
 */
export async function assertCsmTrainingDone(session: SessionPayload | null): Promise<void> {
  if (!session || session.role !== 'csm') return;
  const memo = memoFor(session);
  let lookup = memo?.trainingBlocked;
  if (!lookup) {
    lookup = isCsmTrainingBlocked(session.userId);
    if (memo) memo.trainingBlocked = lookup;
  }
  if (await lookup) {
    throw new AppError(TRAINING_REQUIRED_MESSAGE, 403, 'TRAINING_REQUIRED');
  }
}

/**
 * CSMs may only work on clients assigned to them. Admins (the CSM manager role) see everything.
 */
export async function assertCsmAssigned(session: SessionPayload | null, tenantId: string): Promise<void> {
  if (!session || session.role !== 'csm') return;
  await assertCsmTrainingDone(session);
  const memo = memoFor(session);
  let lookup = memo?.assignments.get(tenantId);
  if (!lookup) {
    lookup = csmAssignmentRepository.findByTenant(tenantId);
    memo?.assignments.set(tenantId, lookup);
  }
  const assignment = await lookup;
  if (!assignment || assignment.csm_user_id !== session.userId) {
    throw new AppError('This client is not assigned to you.', 403, 'CSM_NOT_ASSIGNED');
  }
}

/**
 * Tenant ids visible to a staff member: null means unrestricted (admin).
 */
export async function getVisibleTenantIds(session: SessionPayload): Promise<Set<string> | null> {
  if (session.role !== 'csm') return null;
  await assertCsmTrainingDone(session);
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
    const staffUser = await getSessionUser(session);
    if (staffUser?.status === 'suspended') {
      throw new AppError('Your staff access has been disabled.', 403, 'ACCOUNT_SUSPENDED');
    }
    // A deleted staff member (Admin > Staff > Delete) is signed out on their next request.
    if (!staffUser) {
      throw new AppError('Your staff account no longer exists.', 403, 'ACCOUNT_SUSPENDED');
    }
    return;
  }

  // The client and the person are read together; the client is still judged first.
  const tenantLookup = session.tenantId ? getSessionTenant(session) : null;
  const userLookup = getSessionUserById(session);
  // A failed user read must not surface before (or instead of) the client's verdict.
  userLookup.catch(() => undefined);

  // 1. Client-level suspension first: it also suspends every person, and its reason is meant for them.
  if (tenantLookup) {
    const tenant = await tenantLookup;
    // A client that was deleted for good (Clients > Delete permanently): a session opened before
    // that stops working on the next request.
    if (!tenant) {
      throw new AppError(PORTAL_DELETED_MESSAGE, 403, 'ACCOUNT_SUSPENDED');
    }
    if (isTenantArchived(tenant)) {
      throw new AppError(PORTAL_ARCHIVED_MESSAGE, 403, 'TENANT_ARCHIVED');
    }
    if (tenant && tenant.status === 'suspended') {
      const reason = tenant.suspended_reason || 'Organization portal has been disabled by an administrator.';
      throw new AppError(
        `Your company's portal has been suspended: ${reason}`,
        403,
        'TENANT_SUSPENDED'
      );
    }
  }

  // 2. This person's own access turned off (the reason stays private)
  const user = await userLookup;
  if (user && user.status === 'suspended') {
    throw new AppError(
      PERSONAL_ACCESS_OFF_MESSAGE,
      403,
      'ACCOUNT_SUSPENDED'
    );
  }
}

/**
 * Extracts and cryptographically verifies the session from an incoming HTTP request.
 */
export function getSessionFromRequest(request: Request | NextRequest): SessionPayload | null {
  const known = sessionByRequest.get(request);
  if (known) return known.session;
  const session = readSessionFromRequest(request);
  sessionByRequest.set(request, { session });
  if (session) lookupsBySession.set(session, { assignments: new Map() });
  return session;
}

function readSessionFromRequest(request: Request | NextRequest): SessionPayload | null {
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


