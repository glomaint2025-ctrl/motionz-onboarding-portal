import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import {
  verifyEdgeSession,
  SESSION_COOKIE_NAME,
  resolveTenantId,
  checkEdgeTenantSuspension,
  checkEdgeUserSuspension,
  PORTAL_ARCHIVED_MESSAGE,
} from '@/lib/auth/edge-session';

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Decorate responses with strict enterprise security and anti-crawler headers
  const secureResponse = (res: NextResponse) => {
    res.headers.set('X-Robots-Tag', 'noindex, nofollow, noarchive');
    res.headers.set('X-Content-Type-Options', 'nosniff');
    res.headers.set('X-Frame-Options', 'SAMEORIGIN');
    res.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.headers.set(
      'Permissions-Policy',
      'camera=(), microphone=(), geolocation=(), payment=()'
    );
    return res;
  };

  // Allow public assets, static files, auth endpoints, and health check
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/icons') ||
    pathname === '/manifest.webmanifest' ||
    pathname === '/robots.txt' ||
    pathname === '/api/health' ||
    pathname.startsWith('/auth') ||
    pathname.startsWith('/api/auth') ||
    pathname.startsWith('/api/webhooks')
  ) {
    return secureResponse(NextResponse.next());
  }

  // Parse and cryptographically verify session cookie
  const sessionCookie = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const session = sessionCookie ? await verifyEdgeSession(sessionCookie) : null;

  // 0. Smart Root Route (/) Dynamic Redirection:
  // If not authenticated -> redirect to Client Login (/auth/login).
  // If authenticated -> redirect to the role-specific dashboard.
  if (pathname === '/') {
    if (!session) {
      const loginUrl = new URL('/auth/login', request.url);
      return secureResponse(NextResponse.redirect(loginUrl));
    }
    if (session.role === 'admin') {
      return secureResponse(NextResponse.redirect(new URL('/admin', request.url)));
    }
    if (session.role === 'csm') {
      return secureResponse(NextResponse.redirect(new URL('/csm/clients', request.url)));
    }
    if (session.role === 'client' || session.role === 'client_member') {
      const targetTenant = session.tenantId ? resolveTenantId(session.tenantId) : 'demo';
      const [tenantStatus, userStatus] = await Promise.all([
        checkEdgeTenantSuspension(targetTenant),
        checkEdgeUserSuspension(session.userId),
      ]);
      if (tenantStatus.suspended || userStatus.suspended) {
        const reason =
          tenantStatus.reason ||
          userStatus.reason ||
          'Client account disabled by Motionz administrator.';
        const suspendedUrl = new URL('/auth/suspended', request.url);
        suspendedUrl.searchParams.set('reason', reason);
        suspendedUrl.searchParams.set(
          'type',
          tenantStatus.reason === PORTAL_ARCHIVED_MESSAGE ? 'archived' : tenantStatus.suspended ? 'tenant' : 'account'
        );
        const res = NextResponse.redirect(suspendedUrl);
        res.cookies.set(SESSION_COOKIE_NAME, '', { path: '/', maxAge: 0 });
        return secureResponse(res);
      }
      const targetPortal = `/portal/${targetTenant}`;
      return secureResponse(NextResponse.redirect(new URL(targetPortal, request.url)));
    }
    return secureResponse(NextResponse.redirect(new URL('/auth/login', request.url)));
  }

  // 1. Protect Admin API routes (/api/admin/*)
  if (pathname.startsWith('/api/admin')) {
    if (!session) {
      return secureResponse(
        NextResponse.json({ error: 'Authentication required.' }, { status: 401 })
      );
    }
    if (session.role !== 'admin') {
      return secureResponse(
        NextResponse.json({ error: 'Forbidden: CSM Manager access required.' }, { status: 403 })
      );
    }
  }

  // 2. Protect CSM API routes (/api/csm/*)
  if (pathname.startsWith('/api/csm')) {
    if (!session) {
      return secureResponse(
        NextResponse.json({ error: 'Authentication required.' }, { status: 401 })
      );
    }
    if (session.role !== 'csm' && session.role !== 'admin') {
      return secureResponse(
        NextResponse.json({ error: 'Forbidden: Internal staff credentials required.' }, { status: 403 })
      );
    }
  }

  // 2b. "My profile" API (/api/account/*): any signed-in person, acting on themselves only.
  // The routes re-check the session and refuse suspended accounts.
  if (pathname.startsWith('/api/account') && !session) {
    return secureResponse(
      NextResponse.json({ error: 'Authentication required.' }, { status: 401 })
    );
  }

  // 3. Protect Portal API routes (/api/portal/*)
  if (pathname.startsWith('/api/portal/')) {
    const parts = pathname.split('/');
    const requestedTenantId = parts[3];

    // Anonymous demo sandbox access: read-only and never in production
    const publicDemoRead =
      requestedTenantId === 'demo' &&
      process.env.NODE_ENV !== 'production' &&
      (request.method === 'GET' || request.method === 'HEAD');
    if (!publicDemoRead) {
      if (!session) {
        return secureResponse(
          NextResponse.json({ error: 'Authentication required.' }, { status: 401 })
        );
      }

      // Enforce tenant boundary for client and client_member roles
      if (session.role === 'client' || session.role === 'client_member') {
        const userTenant = resolveTenantId(session.tenantId || '');
        const targetTenant = resolveTenantId(requestedTenantId);
        if (userTenant && targetTenant && userTenant !== targetTenant) {
          return secureResponse(
            NextResponse.json({ error: 'Forbidden: Cross-tenant access denied.' }, { status: 403 })
          );
        }

        // Active suspension enforcement (Edge-level API block)
        const [tenantStatus, userStatus] = await Promise.all([
          checkEdgeTenantSuspension(targetTenant || userTenant),
          checkEdgeUserSuspension(session.userId),
        ]);

        if (tenantStatus.suspended || userStatus.suspended) {
          const reason =
            tenantStatus.reason ||
            userStatus.reason ||
            'Client account disabled by Motionz administrator.';
          const res = NextResponse.json(
            {
              error: reason,
              code: tenantStatus.suspended ? 'TENANT_SUSPENDED' : 'ACCOUNT_SUSPENDED',
              suspended: true,
              reason,
            },
            { status: 403 }
          );
          res.cookies.set(SESSION_COOKIE_NAME, '', { path: '/', maxAge: 0 });
          return secureResponse(res);
        }
      }
    }
  }

  // 4. Protect Admin UI routes (/admin/*)
  if (pathname.startsWith('/admin')) {
    // A signed-in CSM goes back to their own area instead of the sign-in page.
    if (session && session.role === 'csm') {
      return secureResponse(NextResponse.redirect(new URL('/csm/clients', request.url)));
    }
    if (!session || session.role !== 'admin') {
      const loginUrl = new URL('/auth/login', request.url);
      loginUrl.searchParams.set('redirect', pathname);
      return secureResponse(NextResponse.redirect(loginUrl));
    }
  }

  // 5. Protect CSM UI routes (/csm/*)
  if (pathname.startsWith('/csm')) {
    if (!session || (session.role !== 'csm' && session.role !== 'admin')) {
      const loginUrl = new URL('/auth/login', request.url);
      loginUrl.searchParams.set('redirect', pathname);
      return secureResponse(NextResponse.redirect(loginUrl));
    }
  }

  // 6. Protect Client Portal UI routes (/portal/*)
  if (pathname.startsWith('/portal/')) {
    const parts = pathname.split('/');
    const requestedTenantId = parts[2];

    // Canonical redirect for the legacy demo alias
    if (requestedTenantId === 'tenant-demo-abc-roofing') {
      const canonicalTenantId = resolveTenantId(requestedTenantId);
      const canonicalPath = pathname.replace(requestedTenantId, canonicalTenantId);
      return secureResponse(NextResponse.redirect(new URL(canonicalPath, request.url)));
    }

    // Allow unauthenticated preview of the demo portal outside production only
    if (requestedTenantId === 'demo' && !session && process.env.NODE_ENV !== 'production') {
      return secureResponse(NextResponse.next());
    }

    if (!session) {
      const loginUrl = new URL('/auth/login', request.url);
      loginUrl.searchParams.set('redirect', pathname);
      return secureResponse(NextResponse.redirect(loginUrl));
    }

    // If client user, strictly prevent horizontal privilege escalation to other tenants & enforce suspension
    if (session.role === 'client' || session.role === 'client_member') {
      const userTenant = resolveTenantId(session.tenantId || '');
      const targetTenant = resolveTenantId(requestedTenantId);
      if (userTenant && targetTenant && userTenant !== targetTenant) {
        const redirectUrl = new URL(`/portal/${userTenant}`, request.url);
        return secureResponse(NextResponse.redirect(redirectUrl));
      }

      // Active suspension enforcement (Immediate Edge Redirection)
      const [tenantStatus, userStatus] = await Promise.all([
        checkEdgeTenantSuspension(targetTenant || userTenant),
        checkEdgeUserSuspension(session.userId),
      ]);

      if (tenantStatus.suspended || userStatus.suspended) {
        const reason =
          tenantStatus.reason ||
          userStatus.reason ||
          'Client account disabled by Motionz administrator.';
        const suspendedUrl = new URL('/auth/suspended', request.url);
        suspendedUrl.searchParams.set('reason', reason);
        suspendedUrl.searchParams.set(
          'type',
          tenantStatus.reason === PORTAL_ARCHIVED_MESSAGE ? 'archived' : tenantStatus.suspended ? 'tenant' : 'account'
        );
        const res = NextResponse.redirect(suspendedUrl);
        res.cookies.set(SESSION_COOKIE_NAME, '', { path: '/', maxAge: 0 });
        return secureResponse(res);
      }
    }
  }

  return secureResponse(NextResponse.next());
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
