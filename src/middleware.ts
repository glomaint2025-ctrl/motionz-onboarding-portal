import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { verifyEdgeSession, SESSION_COOKIE_NAME } from '@/lib/auth/edge-session';

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Function to decorate responses with strict security and anti-crawler headers
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

  // Allow public assets, auth endpoints, and health endpoints
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/icons') ||
    pathname === '/manifest.webmanifest' ||
    pathname === '/robots.txt' ||
    pathname === '/api/health' ||
    pathname === '/' ||
    pathname.startsWith('/auth') ||
    pathname.startsWith('/api/auth')
  ) {
    return secureResponse(NextResponse.next());
  }

  // Check session cookie
  const sessionCookie = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const session = sessionCookie ? await verifyEdgeSession(sessionCookie) : null;

  // Protect Admin routes
  if (pathname.startsWith('/admin')) {
    if (!session || session.role !== 'admin') {
      const loginUrl = new URL('/auth/login', request.url);
      loginUrl.searchParams.set('redirect', pathname);
      loginUrl.searchParams.set('error', 'admin_required');
      return secureResponse(NextResponse.redirect(loginUrl));
    }
  }

  // Protect CSM routes
  if (pathname.startsWith('/csm')) {
    if (!session || (session.role !== 'csm' && session.role !== 'admin')) {
      const loginUrl = new URL('/auth/login', request.url);
      loginUrl.searchParams.set('redirect', pathname);
      loginUrl.searchParams.set('error', 'csm_required');
      return secureResponse(NextResponse.redirect(loginUrl));
    }
  }

  // Protect Client Portal routes
  if (pathname.startsWith('/portal/')) {
    const parts = pathname.split('/');
    const requestedTenantId = parts[2];

    // In demo mode without active session, allow previewing demo portal
    if (requestedTenantId === 'demo' && !session) {
      return secureResponse(NextResponse.next());
    }

    if (!session) {
      const loginUrl = new URL('/auth/login', request.url);
      loginUrl.searchParams.set('redirect', pathname);
      return secureResponse(NextResponse.redirect(loginUrl));
    }

    // If client user, strictly prevent horizontal privilege escalation to other tenants
    if (session.role === 'client' || session.role === 'client_member') {
      if (session.tenantId && session.tenantId !== requestedTenantId && requestedTenantId !== 'demo') {
        const redirectUrl = new URL(`/portal/${session.tenantId}`, request.url);
        return secureResponse(NextResponse.redirect(redirectUrl));
      }
    }
  }

  return secureResponse(NextResponse.next());
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
